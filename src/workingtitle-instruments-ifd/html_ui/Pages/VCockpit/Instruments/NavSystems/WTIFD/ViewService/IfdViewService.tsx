import { EventBus, Facility, FSComponent, MappedSubject, NodeReference, RenderPosition, Subject, Subscribable, Subscription, VNode, Wait } from '@microsoft/msfs-sdk';

import { AlertBox } from '../Components/AlertBox/AlertBox';
import { ConfirmPopup, ConfirmTextColor } from '../Components/ConfirmPopup/ConfirmPopup';
import { DirectToController } from '../Components/DirectTo/DirectToController';
import { DirectToDialog } from '../Components/DirectTo/DirectToDialog';
import { TabRegistration } from '../Components/Tabs/TabContentContainer';
import { TouchTabInfo } from '../Components/Tabs/TouchTabGroup';
import { IfdInteractionEvent, IfdInteractions } from '../Events/IfdInteractionEvent';
import { IfdOptions } from '../IfdOptions';
import { LineSelectKeyButtons } from '../LineSelectKeyButtons';
import { FmsPage } from '../Pages/FmsPage/FmsPage';
import { FreqPage } from '../Pages/FreqPage/FreqPage';
import { IfdPage, IfdPageName } from '../Pages/IfdPage';
import { IfdPageRegistration, IfdPageRenderFunction } from '../Pages/IfdPageRegistration';
import { PageContainer } from '../Pages/PageContainer';
import { PageTabs } from '../Pages/PageTabs';
import { PageWrapper } from '../Pages/PageWrapper';
import { SvsFullscreenContainer } from '../Pages/SvsPage/SvsFullscreenContainer';
import { FullPageSidebarMode } from '../Sidebar';
import { IfdDialog } from './IfdDialog';
import { IfdView } from './IfdView';

/**
 * Contract for views (e.g. {@link FplTab}) that can respond to the
 * PROC bezel shortcut.
 */
export interface ProcShortcutHandler {
  /**
   * Handles a PROC press.
   * The view should cycle focus/selection through procedure fields
   * (Approach → Arrival) across destination airfields.
   */
  handleProcBtn(): void;
}

/**
 * Controls which IFD page is active.
 */
export class IfdViewService {
  private readonly _activePage = Subject.create<IfdPageRegistration | undefined>(undefined);
  public readonly activePage = this._activePage as Subscribable<IfdPageRegistration | undefined>;

  private readonly pages = new Map<IfdPageName, IfdPageRegistration>();

  private readonly _activePageTab = Subject.create<TabRegistration | undefined>(undefined);
  public readonly activePageTab = this._activePageTab as Subscribable<TabRegistration | undefined>;

  private activePageTabPipe?: Subscription;

  private readonly _activeView = MappedSubject.create(([activePage, activePageTab]): IfdView | undefined => {
    return activePageTab?.tabRef.instance || activePage?.pageRef.instance;
  }, this.activePage, this.activePageTab);
  public readonly activeView = this._activeView as Subscribable<IfdView | undefined>;

  private readonly _activeLskProvider = Subject.create<IfdView | IfdDialog | undefined>(undefined);
  public readonly activeLskProvider: Subscribable<IfdView | IfdDialog | undefined> = this._activeLskProvider;

  private readonly _isSvsFullscreen = Subject.create(this.ifdOptions.svsFullScreen);
  public readonly isSvsFullscreen = this._isSvsFullscreen as Subscribable<boolean>;

  private readonly _isSvsFullscreenAndActive = MappedSubject.create(([isFullscreen, activePage]): boolean => {
    return isFullscreen && activePage?.name === IfdPageName.SVS;
  }, this.isSvsFullscreen, this.activePage);
  public readonly isSvsFullscreenAndActive = this._isSvsFullscreenAndActive as Subscribable<boolean>;

  private readonly _comPresetBoxInhibited = Subject.create(false);
  public readonly comPresetBoxInhibited = this._comPresetBoxInhibited as Subscribable<boolean>;

  private pageContainer = FSComponent.createRef<PageContainer>();
  private svsFullscreenContainer = FSComponent.createRef<SvsFullscreenContainer>();
  private lskButtonsRef = FSComponent.createRef<LineSelectKeyButtons>();
  public readonly alertBoxRef = FSComponent.createRef<AlertBox>();
  public readonly directToDialog = FSComponent.createRef<DirectToDialog>();
  public readonly confirmPopupRef = FSComponent.createRef<ConfirmPopup>();

  /** The stack of dialogs currently open, with the most recently opened last. */
  private readonly dialogStack: IfdDialog[] = [];

  /**
   * Creates an instance of the IfdViewService.
   * @param bus The event bus.
   * @param ifdOptions The IFD options.
   */
  public constructor(public readonly bus: EventBus, public readonly ifdOptions: IfdOptions) {
    this.subscribeToBezelPageButtonEvents();

    if (this.ifdOptions.svsFullScreen) {
      this.isSvsFullscreen.sub(this.onSvsFullscreenChanged.bind(this));
    }

    this._activeView.sub(() => {
      // Close all the open dialogs when the view changes.
      for (let i = this.dialogStack.length - 1; i >= 0; i--) {
        this.dialogStack[i].close();
      }
      this.dialogStack.length = 0;

      this.updateLskProvider();
    }, true);
  }

  /**
   * Registers a page with the service.
   * @param name The page name.
   * @param tabs The tabs to show for this page.
   * @param render The function that creates the page.
   */
  public registerPage(name: IfdPageName, tabs: readonly TouchTabInfo[] | undefined, render: IfdPageRenderFunction): void {
    this.pages.set(name, {
      name,
      render,
      pageRef: FSComponent.createRef(),
      wrapperRef: FSComponent.createRef(),
      tabs,
      activeTab: Subject.create(tabs?.find(tab => tab.isDefault) ?? tabs?.[0]),
    });
  }

  /**
   * Called when the SVS fullscreen state changes.
   * @param isFullscreen The new fullscreen state.
   */
  private onSvsFullscreenChanged(isFullscreen: boolean): void {
    if (!this.ifdOptions.svsFullScreen) {
      return;
    }

    const svsPage = this.pages.get(IfdPageName.SVS);

    if (svsPage) {
      if (isFullscreen) {
        this.svsFullscreenContainer.instance.rootRef.instance.appendChild(svsPage.wrapperRef.instance.rootRef.instance);
      } else {
        this.pageContainer.instance.rootRef.instance.appendChild(svsPage.wrapperRef.instance.rootRef.instance);
      }
    }
  }

  /**
   * Sets the reference to the page container div element that will be where
   * the service will render pages.
   * @param ref The reference to the div element.
   */
  public setPageContainer(ref: NodeReference<PageContainer>): void {
    this.pageContainer = ref;
  }

  /**
   * Sets the reference to the SVS fullscreen container div element that will be where
   * the SVS page will be moved when in fullscreen mode.
   * @param ref The reference to the div element.
   */
  public setSvsFullscreenContainer(ref: NodeReference<SvsFullscreenContainer>): void {
    if (!this.ifdOptions.svsFullScreen) {
      return;
    }

    this.svsFullscreenContainer = ref;
  }

  /**
   * Sets the reference to the SVS fullscreen container div element that will be where
   * the SVS page will be moved when in fullscreen mode.
   * @param ref The reference to the div element.
   */
  public setLskButtonsRef(ref: NodeReference<LineSelectKeyButtons>): void {
    this.lskButtonsRef = ref;
  }

  /** Subscribes to bezel events. */
  private subscribeToBezelPageButtonEvents(): void {
    this.bus.getSubscriber<IfdInteractions>().on('ifd_interaction_event').handle(event => {
      switch (event) {
        case IfdInteractionEvent.SVSLeft: return this.handlePageButtonPress(IfdPageName.SVS, 'left');
        case IfdInteractionEvent.SVSRight: return this.handlePageButtonPress(IfdPageName.SVS, 'right');
        case IfdInteractionEvent.FMSLeft: return this.handlePageButtonPress(IfdPageName.FMS, 'left');
        case IfdInteractionEvent.FMSRight: return this.handlePageButtonPress(IfdPageName.FMS, 'right');
        case IfdInteractionEvent.MAPLeft: return this.handlePageButtonPress(IfdPageName.MAP, 'left');
        case IfdInteractionEvent.MAPRight: return this.handlePageButtonPress(IfdPageName.MAP, 'right');
        case IfdInteractionEvent.AUXLeft: return this.handlePageButtonPress(IfdPageName.AUX, 'left');
        case IfdInteractionEvent.AUXRight: return this.handlePageButtonPress(IfdPageName.AUX, 'right');
        case IfdInteractionEvent.FREQ: return this.handleFreqPageButtonPress();
        case IfdInteractionEvent.DirectTo: return this.openDirectToDialog();
        case IfdInteractionEvent.PROC: return this.onProcButton();
        case IfdInteractionEvent.NRST: return this.handleNrstPageButtonPress();

        case IfdInteractionEvent.CLR:
        case IfdInteractionEvent.ENTR:
        case IfdInteractionEvent.RightKnobPush:
        case IfdInteractionEvent.RightKnobInnerDec:
        case IfdInteractionEvent.RightKnobInnerInc:
        case IfdInteractionEvent.RightKnobOuterDec:
        case IfdInteractionEvent.RightKnobOuterInc:
        case IfdInteractionEvent.SVSHeldLeft:
        case IfdInteractionEvent.SVSHeldRight:
        case IfdInteractionEvent.FMSHeldLeft:
        case IfdInteractionEvent.FMSHeldRight:
        case IfdInteractionEvent.MAPHeldLeft:
        case IfdInteractionEvent.MAPHeldRight:
        case IfdInteractionEvent.AUXHeldLeft:
        case IfdInteractionEvent.AUXHeldRight:
          return this.handleContextSensitiveInteractionEvent(event);
      }
    });
  }

  /**
   * Handles the PROC bezel key.
   * Opens FMS→FPL if needed, then forwards to the tab's handler
   * which cycles Approach/Arrival fields across destinations.
   */
  private onProcButton(): void {
    const isFms = this._activePage.get()?.name === IfdPageName.FMS;
    const activeTab = this._activePageTab.get();

    // If we’re not already on FMS→FPL, switch there first.
    if (!isFms || activeTab?.tabInfo.title !== 'FPL') {
      this.openPage(IfdPageName.FMS);
      const fms = this.pages.get(IfdPageName.FMS);
      if (fms?.tabs) {
        const fplTabInfo = fms.tabs.find(t => t.title === 'FPL') ?? fms.tabs[0];
        fms.activeTab.set(fplTabInfo);
      }
    }

    // After we are on FPL, forward the press to the active view (FplTab).
    const view = this._activeView.get();
    const maybeHandler = view as unknown as ProcShortcutHandler | undefined;

    if (maybeHandler && typeof maybeHandler.handleProcBtn === 'function') {
      maybeHandler.handleProcBtn();
    }
  }

  /**
   * Sends context sensitive events to the active page.
   * @param event The interaction event.
   */
  private handleContextSensitiveInteractionEvent(event: IfdInteractionEvent): void {
    // This seems to always be top prio, even if keyboard or other dialogs are open
    if (event === IfdInteractionEvent.CLR) {
      // Try the CAS alert box
      if (this.alertBoxRef.getOrDefault()?.onInteractionEvent(event)) {
        return;
      }
    }

    // Try the current dialog if there is one
    if (this.dialogStack[this.dialogStack.length - 1]?.onInteractionEvent(event)) {
      return;
    }

    // Send to LskButtons
    if (this.lskButtonsRef.getOrDefault()?.onInteractionEvent(event)) {
      return;
    }

    // Let the active page try handle it. If it has priority for it's active tab it can handle that.
    if (this.activePage.get()?.pageRef.getOrDefault()?.onInteractionEvent(event)) {
      return;
    }

    // Finally try to send the event to the active tab.
    if (this.activePage.get()?.pageRef.getOrDefault()?.tabContentContainerRef?.getOrDefault()?.activeTab.get()?.tabRef.getOrDefault()?.onInteractionEvent(event)) {
      return;
    }
  }

  /**
   * Handles a page button press event.
   * @param pageButtonName The name of the page button that was pressed.
   * @param side The side of the page button press (left or right).
   */
  private handlePageButtonPress(pageButtonName: IfdPageName, side: 'left' | 'right'): void {
    const currentPage = this._activePage.get();

    if (currentPage?.name === pageButtonName) {
      this.navigateLeftRight(side);
      return;
    } else {
      this.openPage(pageButtonName);
    }
  }

  /** Handles a FREQ page button press event. */
  private handleFreqPageButtonPress(): void {
    const currentPage = this._activePage.get();

    if (currentPage?.name !== IfdPageName.FREQ) {
      const oldPage = this._activePage.get();
      const oldTab = this._activePageTab.get()?.tabInfo;
      this.openPage(IfdPageName.FREQ);

      // Need to wait for the page ref to actually exist
      Wait.awaitCondition(() => (this.pages.get(IfdPageName.FREQ)?.pageRef as NodeReference<FreqPage>).getOrDefault() !== undefined)
        .then(() => {
          const freqPageRef = (this.pages.get(IfdPageName.FREQ)?.pageRef as NodeReference<FreqPage>).getOrDefault();
          if (freqPageRef) {
            freqPageRef.lastPage = oldPage;
            freqPageRef.lastTab = oldTab;
          }
        });
    } else {
      const freqPageRef = (this.pages.get(IfdPageName.FREQ)?.pageRef as NodeReference<FreqPage>).getOrDefault();

      freqPageRef?.onPageButtonPress();
    }
  }

  /**
   * Handles a NRST page button press event.
   */
  private handleNrstPageButtonPress(): void {
    const currentPage = this._activePage.get();

    if (currentPage?.name !== IfdPageName.FMS || (currentPage?.name === IfdPageName.FMS && this.activePageTab.get()?.tabInfo.title !== 'NRST')) {
      this.openTabOnPage(IfdPageName.FMS, 'NRST');
    } else {
      const fmsPageRef = (this.pages.get(IfdPageName.FMS)?.pageRef as NodeReference<FmsPage>).getOrDefault();

      fmsPageRef?.nrstTabRef.getOrDefault()?.onNrstButtonPress();
    }
  }

  /**
   * Opens the provided tab and provided tab name
   * @param pageName The page to open
   * @param tabName The tab to open
   */
  public openTabOnPage(pageName: IfdPageName, tabName: string): void {
    this.openPage(pageName);

    const page = this.pages.get(pageName);

    Wait.awaitCondition(() => page!.isRendered === true)
      .then(() => {
        const tab = page!.tabs!.find(tabToSearch => tabToSearch.title === tabName);

        if (!tab) {
          throw `[IfdViewService] Failed to open tab ${tabName} on page ${page}`;
        } else {
          page!.activeTab.set(tab);
        }
      });
  }

  /**
   * Handles a page button press event.
   * @param side The side of the page button press (left or right).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private navigateLeftRight(side: 'left' | 'right'): void {
    // TODO
    const currentPage = this._activePage.get();

    // If the current page is not SVS, we can navigate left/right through tabs
    const currentTab = currentPage?.activeTab.get();

    if (currentTab && currentPage?.tabs) {
      const currentTabIndex = currentPage.tabs.indexOf(currentTab);
      let nextTabIndex: number | undefined;

      if (side === 'left' && currentTabIndex > 0) {
        nextTabIndex = currentTabIndex - 1;
      } else if (side === 'right' && currentTabIndex < currentPage.tabs.length - 1) {
        nextTabIndex = currentTabIndex + 1;
      }

      if (nextTabIndex !== undefined) {
        const nextTab = currentPage.tabs[nextTabIndex];
        if (nextTab) {
          currentPage.activeTab.set(nextTab);
        }
      }
    }
  }

  /**
   * Called when the active page changes.
   * @param newPageName The new active page.
   */
  public openPage(newPageName: IfdPageName): void {
    // Close current page
    const currentPage = this._activePage.get();

    if (currentPage?.name === newPageName) {
      return;
    }

    currentPage?.wrapperRef.getOrDefault()?.pause();

    this.activePageTabPipe?.destroy();
    this.activePageTabPipe = undefined;

    // Open new page
    const newPage = this.pages.get(newPageName);

    if (!newPage) {
      console.error(`Page '${newPageName}' not registered.`);
      return;
    }

    if (!newPage.isRendered) {
      this.renderPage(newPage);
    }

    newPage.wrapperRef.getOrDefault()?.resume();

    this._activePage.set(newPage);

    if (newPage?.tabs?.length && newPage.tabs.length > 0) {
      this.activePageTabPipe = newPage.pageRef.instance.tabContentContainerRef?.instance.activeTab.pipe(this._activePageTab);
    } else {
      this._activePageTab.set(undefined);
    }
  }

  /**
   * Opens the facility information page and sets the facility for display.
   * @param facility The facility to display information for.
   */
  public openFacilityInfo(facility: Facility): void {
    this.openTabOnPage(IfdPageName.FMS, 'INFO');

    const fmsPage = this.activePage.get()?.pageRef.getOrDefault() as (FmsPage | undefined);
    fmsPage?.setInfoFacility && fmsPage.setInfoFacility(facility);
  }

  /**
   * Renders the page to the container.
   * @param pageRef The reference to the view to render.
   * @throws If the render function did not create a valid IfdPage.
   */
  private renderPage(pageRef: IfdPageRegistration): void {
    const node = pageRef.render(pageRef);
    pageRef.pageRef = FSComponent.createRef<IfdPage>();

    if (node === undefined || !(node.instance instanceof IfdPage)) {
      throw new Error(`Render function for view ${pageRef.name} did not successfully create a valid IfdPage.`);
    }

    const wrappedPage: VNode = (
      <PageWrapper
        bus={this.bus}
        viewService={this}
        isVisible={this.activePage.map(v => v === pageRef)}
        pageRef={pageRef}
      >
        {node}
        {pageRef.tabs && (
          <PageTabs
            viewService={this}
            pageRef={pageRef}
          />
        )}
      </PageWrapper>
    );

    const parentContainer = this.ifdOptions.svsFullScreen && pageRef.name === IfdPageName.SVS && this._isSvsFullscreen.get()
      ? this.svsFullscreenContainer.instance.rootRef.instance
      : this.pageContainer.instance.rootRef.instance;

    FSComponent.render(wrappedPage, parentContainer, RenderPosition.In);

    pageRef.pageRef.instance = node.instance as IfdPage;
    pageRef.wrapperRef.instance = wrappedPage.instance as PageWrapper;
    pageRef.isRendered = true;
  }

  /**
   * Request a direct to, triggering the green popup overlay for the user to create a direct to.
   */
  public async openDirectToDialog(): Promise<void> {
    // Need to get this before we change tabs..
    const pageFacility = this._activePage.get()?.pageRef.getOrDefault()?.getPageFacility?.();

    // The IFD always changes to FMS/FPL when DIR TO is called up.
    const fromFmsPage = this.activePage.get()?.name === IfdPageName.FMS;
    if (!fromFmsPage) {
      this.openPage(IfdPageName.FMS);
    }

    const fmsPage = this.pages.get(IfdPageName.FMS);
    const fplTab = fmsPage?.tabs?.[0];
    if (fplTab) {
      fmsPage.activeTab.set(fplTab);
    }

    // When not coming from the FMS page, the map mode is opened and the plan is in sidebar mode.
    if (!fromFmsPage) {
      (fmsPage?.pageRef.getOrDefault() as FmsPage | null)?.setFplSideBarMode(FullPageSidebarMode.Sidebar);
    }

    const dialog = this.directToDialog.getOrDefault();

    dialog?.open(pageFacility && DirectToController.isDirectToFacilityType(pageFacility) ? pageFacility : undefined);
  }

  /**
   * Pops up the confirmation popup asking for user confirmation of something.
   * @param message The message to ask the user.
   * @param textColor The text colour to show. Defaults to white.
   * @param minHeight The minimum height in pixels for the box. Defaults to unset (computed based on content).
   * @param minWidth The minimum width in pixels for the box. Defaults to unset (computed based on content).
   * @param noWrap Whether to disable word wrapping. Defaults to false.
   * @returns A promise that either resolves when the user confirms the action, or rejects if they cancel or another request is sent.
   */
  public requestConfirmation(message: string, textColor?: ConfirmTextColor, minHeight?: number, minWidth?: number, noWrap?: boolean): Promise<void> {
    return this.confirmPopupRef.getOrDefault()?.askConfirmation(message, textColor, minHeight, minWidth, noWrap) ?? Promise.reject();
  }

  /** Updates the view/dialog that controls the LSKs. */
  private updateLskProvider(): void {
    if (this.dialogStack.length) {
      this._activeLskProvider.set(this.dialogStack[this.dialogStack.length - 1]);
    } else {
      this._activeLskProvider.set(this._activeView.get());
    }
  }

  /**
   * Sets a dialog as active, so it can control LSKs.
   * @param dialog The dialog that has opened.
   */
  private onDialogOpen(dialog: IfdDialog): void {
    // Make sure it's only in the stack once!
    for (let i = this.dialogStack.length - 1; i >= 0; i--) {
      if (this.dialogStack[i] === dialog) {
        this.dialogStack.splice(i, 1);
      }
    }

    this.dialogStack.push(dialog);

    this.updateLskProvider();
  }

  /**
   * Sets a dialog as inactive, so LSK control can return to the applicable view item.
   * @param dialog The dialog that has closed.
   */
  private onDialogClose(dialog: IfdDialog): void {
    for (let i = this.dialogStack.length - 1; i >= 0; i--) {
      if (this.dialogStack[i] === dialog) {
        this.dialogStack.splice(i, 1);
        break;
      }
    }

    this.updateLskProvider();
  }

  /**
   * Registers a dialog with the view service to give it access to the LSKs,
   * and interaction events.
   * Dialogs will be automatically closed when the view changes.
   * @param dialog The dialog to register.
   */
  public registerDialog(dialog: IfdDialog): void {
    dialog.isVisible.sub((visible) => {
      if (visible) {
        this.onDialogOpen(dialog);
      } else {
        this.onDialogClose(dialog);
      }
    }, true);
  }

  /**
   * Inhibits the COM Preset Info Box from opening
   */
  public inhibitComPresetBox(): void {
    if (!this._comPresetBoxInhibited.get()) {
      this._comPresetBoxInhibited.set(true);
    }
  }

  /**
   * Enables the COM Preset Info Box to open when a new COM preset is selected
   */
  public enableComPresetBox(): void {
    if (this._comPresetBoxInhibited.get()) {
      this._comPresetBoxInhibited.set(false);
    }
  }
}

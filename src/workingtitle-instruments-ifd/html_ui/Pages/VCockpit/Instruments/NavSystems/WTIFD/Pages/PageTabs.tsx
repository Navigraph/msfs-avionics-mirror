import { ComponentProps, DebounceTimer, FSComponent, LifecycleComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { TouchTabGroup } from '../Components/Tabs/TouchTabGroup';
import { DisplayUserSettings, HidePageTabsTime } from '../Settings/DisplayUserSettings';
import { IfdViewService } from '../ViewService/IfdViewService';
import { IfdPageRegistration } from './IfdPageRegistration';

import './PageTabs.css';

/** The properties for the {@link PageTabs} component. */
export interface PageTabsProps extends ComponentProps {
  /** The IFD view service. */
  readonly viewService: IfdViewService;
  /** The page registration. */
  readonly pageRef: IfdPageRegistration;
}

/** The PageTabs component displayed at the bottom of each page. */
export class PageTabs extends LifecycleComponent<PageTabsProps> {
  // Should always start visible, ergardless of the auto-hide setting. This matches the real behavior where
  // when you turn the autohide on, and you switch to another page,
  // the tabs will still be visible, because it's your first time visiting the page
  // since you enabled auto hide.
  private readonly isHidden = Subject.create(false);
  private readonly pageHideTimer = new DebounceTimer();
  private readonly pageRevealDelay = new DebounceTimer();

  private readonly displaySettings = DisplayUserSettings.getManager(this.props.viewService.bus);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.props.viewService.activePage.sub(this.handleActivePageChanged.bind(this), true);
    this.props.pageRef.activeTab.sub(this.handleActiveTabChanged.bind(this), true);

    this.displaySettings.getSetting('hidePageTabs').sub((autoHideSetting) => {
      this.clearTimers();
      if (autoHideSetting === HidePageTabsTime.Never) {
        this.isHidden.set(false);
      } else if (this.props.viewService.activePage.get() === this.props.pageRef) {
        this.startHideTimer();
      }
    });
  }

  /**
   * Handles when the active page changes.
   * @param newPage The new active page, or undefined to hide the tabs.
   */
  private handleActivePageChanged(newPage: IfdPageRegistration | undefined): void {
    // Unhide tabs if our page was opened
    if (newPage === this.props.pageRef) {
      this.revealAndResetPageHideTimerDelayed();
    }
  }

  /** Handles when the active tab changes. */
  private handleActiveTabChanged(): void {
    // Unhide tabs if active tab changes
    this.revealAndResetPageHideTimerDelayed();
  }

  /** Reveals the page tabs and resets the page hide timer after a short delay. */
  private revealAndResetPageHideTimerDelayed(): void {
    if (this.displaySettings.getSetting('hidePageTabs').get() === HidePageTabsTime.Never) {
      // Don't delay if auto hide is disabled
      this.revealAndResetPageHideTimer();
    } else {
      // Delay to next frame in case the tabs need to start hidden.
      // This is needed because the component is hidden with css when the page isn't active,
      // which would skip the unhide animation.
      this.pageRevealDelay.schedule(this.revealAndResetPageHideTimer.bind(this), 0);
    }
  }

  /** Reveals the page tabs and resets the page hide timer. */
  private revealAndResetPageHideTimer(): void {
    this.isHidden.set(false);
    this.startHideTimer();
  }

  /** Starts the timer to hide the page tabs after a certain time. */
  private startHideTimer(): void {
    const waitSeconds = DisplayUserSettings.convertHidePageTabsTime(this.displaySettings.getSetting('hidePageTabs').get());

    if (waitSeconds === 'never') { return; }

    this.pageHideTimer.schedule(() => {
      this.isHidden.set(true);
    }, waitSeconds * 1000);
  }

  /** @inheritdoc */
  public override pause(): void {
    super.pause();

    // Cancel timers, because the tabs shouldn't hide while the page is paused
    this.clearTimers();
  }

  /** Clears the timers used for hiding and revealing the page tabs. */
  private clearTimers(): void {
    this.pageHideTimer.clear();
    this.pageRevealDelay.clear();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'page-tabs': true,
          'page-tabs-hidden': this.isHidden,
          'page-tabs-always-visible': this.displaySettings.getSetting('hidePageTabs').map(v => v === HidePageTabsTime.Never),
        }}
      >
        <TouchTabGroup
          tabs={this.props.pageRef.tabs!}
          activeTab={this.props.pageRef.activeTab}
          onTabClicked={this.revealAndResetPageHideTimer.bind(this)}
        />
      </div>
    );
  }
}

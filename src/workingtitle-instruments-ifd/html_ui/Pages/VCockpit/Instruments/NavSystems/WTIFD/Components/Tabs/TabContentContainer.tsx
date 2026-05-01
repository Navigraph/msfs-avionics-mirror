import { ComponentProps, EventBus, FSComponent, LifecycleComponent, NodeReference, RenderPosition, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdViewService } from '../../ViewService/IfdViewService';
import { TabContent, TabContentProps } from './TabContent';
import { TabWrapper } from './TabWrapper';
import { TouchTabInfo } from './TouchTabGroup';

import './TabContentContainer.css';

/** The properties for the {@link TabContentContainer} component. */
interface TabContentContainerProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The active tab. */
  readonly activeTab: Subscribable<TouchTabInfo | undefined>;
  /** The IFD view service. */
  readonly viewService: IfdViewService;
}

/** Info and state for a registered tab. */
export interface TabRegistration {
  /** The tab info object. */
  tabInfo: TouchTabInfo;
  /** Renders the tab. */
  vnode: VNode;
  /** A Ref to to the rendered tab. */
  tabRef: NodeReference<TabContent>;
  /** A Ref to the rendered tab wrapper. */
  wrapperRef: NodeReference<TabWrapper>;
  /** Whether the tab has been rendered yet. */
  isRendered?: boolean;
}

/** The TabContentContainer component. Controls which TabContent is visible. */
export class TabContentContainer extends LifecycleComponent<TabContentContainerProps> {
  private readonly _activeTab = Subject.create<TabRegistration | undefined>(undefined);
  public readonly activeTab = this._activeTab as Subscribable<TabRegistration | undefined>;

  private readonly tabs = new Map<TouchTabInfo, TabRegistration>();

  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.props.activeTab.sub(this.handleActiveTabChanged.bind(this));

    this.registerTabsFromChildren();

    this.openTab(this.props.activeTab.get());
  }

  /** Pauses subscriptions managed by the component lifecycle and the first `LifecycleComponent` of each child component branch. */
  public override pause(): void {
    super.pause();
    // We have to do this ourselves because the tabs are added at runtime, so they are not children of the VNode tree
    this.activeTab.get()?.tabRef.getOrDefault()?.pause();
  }

  /** Resumes subscriptions managed by the component lifecycle and the first {@link LifecycleComponent} of each child component branch. */
  public override resume(): void {
    super.resume();
    // We have to do this ourselves because the tabs are added at runtime, so they are not children of the VNode tree
    this.activeTab.get()?.tabRef.getOrDefault()?.resume();
  }

  /**
   * Handles when the active tab changes.
   * @param newTab The new active tab, or undefined to close the active tab.
   */
  private handleActiveTabChanged(newTab: TouchTabInfo | undefined): void {
    this.openTab(newTab);
  }

  /**
   * Changes what the active tab is.
   * @param newTabInfo The new active tab, or undefined to close the active tab.
   */
  public openTab(newTabInfo: TouchTabInfo | undefined): void {
    // Close current tab
    const currentTab = this._activeTab.get();

    if (currentTab?.tabInfo === newTabInfo) {
      return;
    }

    currentTab?.tabRef.getOrDefault()?.pause();

    if (newTabInfo === undefined) {
      this._activeTab.set(undefined);
      return;
    }

    // Open new tab
    const newTab = this.tabs.get(newTabInfo);

    if (!newTab) {
      console.error(`Tab '${newTabInfo.title}' not registered.`);
      return;
    }

    if (!newTab.isRendered) {
      this.renderPage(newTab);
    }

    newTab.tabRef.getOrDefault()?.resume();

    this._activeTab.set(newTab);
  }

  /**
   * Renders the page to the container.
   * @param tabRef The reference to the view to render.
   * @throws If the render function did not create a valid TabContent.
   */
  private renderPage(tabRef: TabRegistration): void {
    const node = tabRef.vnode;
    tabRef.tabRef = FSComponent.createRef<TabContent>();

    if (node === undefined || !(node.instance instanceof TabContent)) {
      throw new Error(`Render function for view ${tabRef.tabInfo.title} did not successfully create a valid TabContent.`);
    }

    const wrappedPage: VNode = (
      <TabWrapper
        bus={this.props.bus}
        viewService={this.props.viewService}
        isVisible={this.activeTab.map(v => v === tabRef)}
        tabInfo={tabRef.tabInfo}
      >
        {node}
      </TabWrapper>
    );

    const tabContainerDiv = this.rootRef.instance;

    FSComponent.render(wrappedPage, tabContainerDiv, RenderPosition.In);

    tabRef.tabRef.instance = node.instance as TabContent;
    tabRef.wrapperRef.instance = wrappedPage.instance as TabWrapper;
    tabRef.isRendered = true;
  }

  /**
   * Registers a tab with the service.
   * @param tabInfo The tab info object containing the label and other properties.
   * @param vnode The function that creates the tab content.
   */
  public registerTab(tabInfo: TouchTabInfo, vnode: VNode): void {
    this.tabs.set(tabInfo, {
      tabInfo,
      vnode,
      tabRef: FSComponent.createRef(),
      wrapperRef: FSComponent.createRef(),
    });
  }

  /**
   * Registers tab contents from the children.
   */
  private registerTabsFromChildren(): void {
    const children = this.props.children as (VNode | null | undefined)[];
    children.forEach((child) => {
      if (!child) {
        return;
      }
      if (!(child.instance instanceof TabContent)) {
        console.error(`Child of TabContentContainer '${child.props.tabName}' is not a TabContent instance.`);
        return;
      }
      const tabContent = child.instance as TabContent;
      this.registerTab(tabContent.props.tabInfo, child);
    });
  }

  /**
   * Gets the root content component of the currently active tab.
   * @returns The tab content, or undefined if there is no such tab/content.
   */
  public getActiveTabContent(): TabContent<TabContentProps> | undefined {
    return this.activeTab.get()?.tabRef?.getOrDefault() ?? undefined;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div ref={this.rootRef} class="tab-content-container" />
    );
  }
}

import { ComponentProps, FSComponent, LifecycleComponent, MutableSubscribable, Subject, VNode } from '@microsoft/msfs-sdk';

import './Sidebar.css';

/** The properties for the {@link FullPageSidebar} component. */
interface FullPageSidebarProps extends ComponentProps {
  /**
   * The label for the sidebar tab.
   */
  readonly sidebarTabLabel: string;
  /**
   * The label for the full state tab.
   */
  readonly fullStateTabLabel: string;

  /** A mutable subscribable that will be set with the sidebar state. */
  readonly isInSidebarMode?: MutableSubscribable<boolean>;
}

export enum FullPageSidebarMode {
  Sidebar = 'sidebar',
  Full = 'full',
}

/** The FullPageSidebar component. */
export class FullPageSidebar extends LifecycleComponent<FullPageSidebarProps> {
  public readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  private readonly leftTabRef = FSComponent.createRef<HTMLDivElement>();
  private readonly rightTabRef = FSComponent.createRef<HTMLDivElement>();
  public readonly state = Subject.create<FullPageSidebarMode>(FullPageSidebarMode.Full);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.leftTabRef.instance.addEventListener('click', this.handleLeftTabClick);
    this.rightTabRef.instance.addEventListener('click', this.handleRightTabClick);

    const isInSidebarMode = this.props.isInSidebarMode;
    if (isInSidebarMode !== undefined) {
      this.state.sub((v) => isInSidebarMode.set(v === 'sidebar'), true).withLifecycle(this.defaultLifecycle);
    }
  }

  private handleLeftTabClick = (): void => {
    this.state.set(FullPageSidebarMode.Full);
  };

  private handleRightTabClick = (): void => {
    this.state.set(FullPageSidebarMode.Sidebar);
  };

  /**
   * Sets the current sidebar mode.
   * @param mode The mode to set.
   */
  public setSideBarMode(mode: FullPageSidebarMode): void {
    this.state.set(mode);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'ifd-sidebar': true,
          'ifd-full-page-sidebar': true,
          'ifd-sidebar-sidebar': this.state.map(state => state === FullPageSidebarMode.Sidebar).withLifecycle(this.defaultLifecycle),
          'ifd-sidebar-full': this.state.map(state => state === FullPageSidebarMode.Full).withLifecycle(this.defaultLifecycle),
        }}
      >
        <div ref={this.leftTabRef} class="sidebar-tab-left">{this.props.sidebarTabLabel}</div>
        <div class="sidebar-background" />
        <div ref={this.rootRef} class="sidebar-view-container">
          {this.props.children}
        </div>
        <div ref={this.rightTabRef} class="sidebar-tab-right">{this.props.fullStateTabLabel}</div>
      </div>
    );
  }
}

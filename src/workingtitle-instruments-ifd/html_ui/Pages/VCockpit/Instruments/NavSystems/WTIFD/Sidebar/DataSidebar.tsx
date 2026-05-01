import { ComponentProps, DebounceTimer, EventBus, FSComponent, LifecycleComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { DatablockService } from '../Datablocks/DatablocksService';
import { RightSidebarDatablocksContainer } from '../Datablocks/RightSideDatablocksContainer';
import { IfdViewService } from '../ViewService/IfdViewService';

import './Sidebar.css';

/** The properties for the {@link DataSidebar} component. */
interface DataSidebarProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The datablock service instance */
  readonly datablockService: DatablockService;
  /** The IFD view service. */
  readonly viewService: IfdViewService;
  /** Whether the sidebar is visible. Allows overriding internal state. */
  readonly isSidebarVisible?: Subject<boolean>;
  /** Whether to disable animations for the sidebar. Defaults to false. */
  readonly disableAnimation?: boolean;
}

/** The DataSidebar component. */
export class DataSidebar extends LifecycleComponent<DataSidebarProps> {
  private static renderedDatablocksRef = FSComponent.createRef<RightSidebarDatablocksContainer>();

  public readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  private readonly leftTabRef = FSComponent.createRef<HTMLDivElement>();

  public readonly isSidebarVisible = this.props.isSidebarVisible ?? Subject.create(false);
  public readonly isSidebarVisibleDelayed = Subject.create(false);

  private readonly sidebarDebounce = new DebounceTimer();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.leftTabRef.instance.addEventListener('click', this.handleLeftTabClick);

    this.isSidebarVisible.sub((isVisible) => {
      if (!this.props.disableAnimation && isVisible) {
        this.sidebarDebounce.schedule(() => {
          this.isSidebarVisibleDelayed.set(isVisible);
        }, 500);
      } else {
        this.isSidebarVisibleDelayed.set(isVisible);
      }
    });
  }

  /** @inheritdoc */
  public override resume(): void {
    super.resume();
    this.grabDatablocks();
  }

  private handleLeftTabClick = (): void => {
    this.isSidebarVisible.set(!this.isSidebarVisible.get());
  };

  /**
   * Moves the existing datablocks to this sidebar, or creates and renders them if they do not yet exist.
   */
  private grabDatablocks(): void {
    const existingDatablocks = DataSidebar.renderedDatablocksRef.getOrDefault();

    if (!existingDatablocks) {
      const newDatablocks = this.renderDatablocks();
      FSComponent.render(newDatablocks, this.rootRef.instance);
      DataSidebar.renderedDatablocksRef.instance = newDatablocks.instance as RightSidebarDatablocksContainer;
    } else {
      this.rootRef.instance.appendChild(existingDatablocks.containerRef.instance);
    }
  }

  /**
   * Renders the datablocks container.
   * @returns The datablocks container VNode.
   */
  private renderDatablocks(): VNode {
    return (
      <RightSidebarDatablocksContainer
        bus={this.props.bus}
        viewService={this.props.viewService}
        datablockService={this.props.datablockService}
      // viewRegistration={viewRegistration}
      />
    );
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'ifd-sidebar': true,
          'data-sidebar': true,
          'ifd-sidebar-collapsed': this.isSidebarVisible.map(state => !state),
          'ifd-sidebar-sidebar': this.isSidebarVisible,
          'ifd-sidebar-no-animation': this.props.disableAnimation === true,
        }}
      >
        <div ref={this.leftTabRef} class="sidebar-tab-left">DATA</div>
        <div class="sidebar-background" />
        <div ref={this.rootRef} class="sidebar-view-container" />
      </div>
    );
  }
}

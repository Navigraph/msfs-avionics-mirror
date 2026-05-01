import { FSComponent, LifecycleComponent, VNode } from '@microsoft/msfs-sdk';

import { DatablockSlot } from './Components/DatablockSlot';
import { DatablockService } from './DatablocksService';
import { DatablocksContainerProps } from './DatablockTypes';

import './Datablocks.css';

/**
 * Left sidebar datablocks container
 */
export class LeftSidebarDatablocksContainer extends LifecycleComponent<DatablocksContainerProps> {
  private leftSidebarSlots = this.props.datablockService.leftDatablocks;

  private readonly containerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly slotsContainerRef = FSComponent.createRef<HTMLDivElement>();
  private slotsNode: VNode | null = null;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.initializeContent();
  }

  /**
   * Initializes the component content.
   */
  private initializeContent(): void {
    this.leftSidebarSlots.sub((index, event, item, array) => {
      if (this.slotsNode) {
        FSComponent.shallowDestroy(this.slotsNode);
        this.slotsNode = null;
        this.slotsContainerRef.instance.innerHTML = '';
      }

      const slots: VNode[] = [];
      let renderedSlots = 0;
      for (let i = 0; i < array.length; i++) {
        const datablock = array[i];
        if (datablock) {
          const size = datablock.getInfo().size ?? 0;
          renderedSlots += size;
          if (renderedSlots > DatablockService.LEFT_SIDEBAR_SLOTS) {
            // Only render the slots that fit in the sidebar's limits
            break;
          }
          slots.push(
            <DatablockSlot
              bus={this.props.bus}
              datablock={datablock}
              focus={() => { }}
              data={datablock}
            />
          );
        }
      }
      this.slotsNode = (
        <>
          {...slots}
        </>
      );

      FSComponent.render(this.slotsNode!, this.slotsContainerRef.instance);

    }, true).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        ref={this.containerRef}
        class={{
          'datablocks-container': true,
          'datablocks-container-left-sidebar': true,
        }}
      >
        <div ref={this.slotsContainerRef} class="slots-container" />
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    if (this.slotsNode) {
      FSComponent.shallowDestroy(this.slotsNode);
      this.slotsNode = null;
    }

    super.destroy();
  }
}

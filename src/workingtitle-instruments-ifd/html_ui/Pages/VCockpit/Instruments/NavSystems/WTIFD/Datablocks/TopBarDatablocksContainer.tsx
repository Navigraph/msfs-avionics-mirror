import { FSComponent, LifecycleComponent, VNode } from '@microsoft/msfs-sdk';

import { DatablockSlot } from './Components/DatablockSlot';
import { DatablocksContainerProps } from './DatablockTypes';

import './Datablocks.css';

/**
 * Top bar datablocks container
 */
export class TopBarDatablocksContainer extends LifecycleComponent<DatablocksContainerProps> {
  private readonly topBarSlots = this.props.datablockService.topDatablocks;

  private readonly containerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly slotsContainerRef = FSComponent.createRef<HTMLDivElement>();
  private slotsNode: VNode | null = null;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.initializeContent();
  }

  /**
   * Initializes the container content
   */
  private initializeContent(): void {
    this.topBarSlots.sub((index, event, item, array) => {
      if (this.slotsNode) {
        FSComponent.shallowDestroy(this.slotsNode);
        this.slotsNode = null;
        this.slotsContainerRef.instance.innerHTML = '';
      }

      const slots: VNode[] = [];
      for (let i = 0; i < array.length; i++) {
        const datablock = array[i];
        if (datablock) {
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
          'datablocks-container-top-bar': true,
        }}
      >
        <div ref={this.slotsContainerRef} class="slots-container" />
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    // Clean up slot components before destroying the container
    if (this.slotsNode) {
      FSComponent.shallowDestroy(this.slotsNode);
      this.slotsNode = null;
    }

    super.destroy();
  }
}

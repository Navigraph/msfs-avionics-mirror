import { EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdListItemComponent, IfdListItemComponentProps } from '../../Components/List/IfdListItemComponent';
import { DataBlockId } from '../DatablockTypes';
import { Datablock } from './Datablock';

/**
 * Props for the DatablockSlot component
 */
export interface DatablockSlotProps extends IfdListItemComponentProps<Datablock> {
  /** The event bus instance */
  readonly bus: EventBus;
  /** The datablock currently assigned to this slot, if any */
  readonly datablock?: Datablock | null;
}

/**
 * A simple datablock slot that displays a datablock component
 */
export class DatablockSlot extends IfdListItemComponent<DatablockSlotProps> {

  /**
   * Renders the current datablock if one exists
   * @returns The datablock VNode if present, otherwise null.
   */
  private renderDatablock(): VNode | null {
    if (!this.props.datablock) {
      return null;
    }

    const DatablockComponent = this.props.datablock.constructor;
    const datablockInfo = this.props.datablock.getInfo();

    return (
      <DatablockComponent
        {...this.props.datablock.props}
        bus={this.props.bus}
        slotId={datablockInfo.id}
      />
    );
  }

  /** @inheritdoc */
  public render(): VNode {
    const datablockInfo = this.props.datablock?.getInfo() || null;

    return !datablockInfo ? <></> : (
      <div
        class={{
          'datablock-slot': true,
          'datablock-slot-occupied': !!(datablockInfo?.id && datablockInfo.id !== DataBlockId.Blank),
          'datablock-slot-empty': !datablockInfo?.id || datablockInfo.id === DataBlockId.Blank,
        }}
        style={{ height: this.props.data?.heightPx ? this.props.data.heightPx + 'px' : 'auto' }}
        id={datablockInfo?.id || DataBlockId.Blank}
      >
        <div class="datablock-slot-content">
          {this.renderDatablock()}
        </div>
      </div>
    );
  }
}

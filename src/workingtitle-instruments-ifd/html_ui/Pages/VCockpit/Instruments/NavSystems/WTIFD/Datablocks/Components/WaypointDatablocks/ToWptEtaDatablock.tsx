import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { Datablock } from '../Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';

/** Datablock for displaying the To Waypoint ETA */
export class ToWptEtaDatablock extends Datablock {
  /**
   * Gets the datablock info for this ToWptEtaDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'To Waypoint ETA',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /* TODO: Implement actual data */
  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-to-wpt-eta" ref={this.datablockRef}>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">ETA at To WPT</div>
        </div>
        <div>
          <div class="datablock-indent datablock-font-large datablock-text-mint">--:--</div>
          <div class="datablock-font-small datablock-text-mint">AM LCL</div>
        </div>
      </div>
    );
  }
}

import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { Datablock } from '../Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';

/** Datablock for displaying the To Waypoint Direct Information */
export class ToWptDirectInfoDatablock extends Datablock {
  /**
   * Gets the datablock info for this ToWptDirectInfoDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'To Waypoint Direct Information',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /* TODO: Implement actual data */
  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-to-wpt-dct-info" ref={this.datablockRef}>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">To</div>
        </div>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Brg</div>
        </div>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dist</div>
        </div>
      </div>
    );
  }
}

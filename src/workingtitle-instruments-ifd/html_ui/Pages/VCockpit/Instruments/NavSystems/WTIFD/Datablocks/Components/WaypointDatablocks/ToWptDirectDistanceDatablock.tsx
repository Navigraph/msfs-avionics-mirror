import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { Datablock } from '../Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';

/** Datablock for displaying the To Waypoint Direct Distance */
export class ToWptDirectDistanceDatablock extends Datablock {
  /**
   * Gets the datablock info for this ToWptDirectDistanceDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'To Waypoint Direct Distance',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /* TODO: Implement actual data */
  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-to-wpt-dct-dist" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-magenta">MILTT</div>
        <div>
          <div class="datablock-indent datablock-font-large datablock-text-cyan">---</div>
          <div class="datablock-font-small datablock-text-mint">NM</div>
        </div>
      </div>
    );
  }
}

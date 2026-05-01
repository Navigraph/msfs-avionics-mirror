import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';

/** Datablock for displaying the User Profile */
export class UserProfileDatablock extends Datablock {
  /**
   * Gets the datablock info for UserProfileDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'User Profile',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-user-profile" ref={this.datablockRef}>
        <div style="width: 100%; display: flex; justify-content: between; align-items: flex-end;">
          <div class="datablock-indent datablock-font-small datablock-text-mint">User:</div>
          <div class="datablock-indent datablock-font-large datablock-text-cyan">Default</div>
        </div>
      </div>
    );
  }
}

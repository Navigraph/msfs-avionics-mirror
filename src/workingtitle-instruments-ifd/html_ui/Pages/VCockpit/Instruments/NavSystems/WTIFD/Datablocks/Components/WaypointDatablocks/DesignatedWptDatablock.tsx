import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { WptDatablock } from './WptDatablock';

/** Datablock for displaying the Designated Waypoint */
export class DesignatedWptDatablock extends WptDatablock {
  /**
   * Gets the datablock info for this ToWptInformationDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Designated Waypoint',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** Update predictions after updating flight plan predictor. */
  protected updatePrediction(): void {
    // TODO implement this method to update ETE
    // noop
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-designated-wpt" ref={this.datablockRef}>
        <div class="datablock-text-cyan">
          <span class="datablock-font-large datablock-space-after">ACH</span>
          <span class="datablock-font-small">VHF</span>
        </div>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Brg</div>
        </div>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Rad</div>
        </div>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dist</div>
        </div>
        <div>
          {/*TODO add ETE*/}
          <div class="datablock-indent datablock-font-small datablock-text-mint">ETE</div>
        </div>
      </div>
    );
  }
}

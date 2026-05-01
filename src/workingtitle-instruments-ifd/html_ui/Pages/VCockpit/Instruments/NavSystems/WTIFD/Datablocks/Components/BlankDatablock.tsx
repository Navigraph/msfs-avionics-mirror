import { FSComponent, VNode } from '@microsoft/msfs-sdk';
import { Datablock } from '../Components/Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';

/**
 * Blank datablock - acts as placeholder for empty slots
 */
export class BlankDatablock extends Datablock {
  /** @inheritdoc */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Blank',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Empty slot placeholder'
    };
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-blank" ref={this.datablockRef}>
        <div style="height: 20px;" />
      </div>
    );
  }
}

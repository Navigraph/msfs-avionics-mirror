import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TransponderDataBlock } from '../../Components/TransponderDataBlock/TransponderDataBlock';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

/** Props for {@link TransponderThumbnail} */
interface TransponderThumbnailProps extends BaseDatablockProps {
  /** The IfdTuningControlManager instance */
  readonly ifdTuningControlManager: IfdTuningControlsManager;
  /** The IfdInstrumentIndex */
  readonly ifdInstrumentIndex: number;
}

/** Datablock for displaying the Transponder Thumbnail */
export class TransponderThumbnail extends Datablock<TransponderThumbnailProps> {
  /**
   * Gets the datablock info for this TransponderThumbnail instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Transponder Thumbnail',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-transponder" ref={this.datablockRef}>
        <TransponderDataBlock
          bus={this.props.bus}
          ifdInstrumentIndex={this.props.ifdInstrumentIndex}
          xpdrManager={this.props.ifdTuningControlManager.xpdrManager}
        />
      </div>
    );
  }
}

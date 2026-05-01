import { FSComponent, NavRadioIndex, Subject, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { IfdOptions } from '../../IfdOptions';
import { NavRadioBlock } from '../../Components/CommNavBlock/NavRadioBlock';

/** Props for {@link VlocRadioDatablock} */
interface VlocRadioDatablockProps extends BaseDatablockProps {
  /** The IfdTuningControlManager instance */
  readonly ifdTuningControlManager: IfdTuningControlsManager;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
}

/** Datablock for displaying the primary COM/VLOC tuning */
export class VlocRadioDatablock extends Datablock<VlocRadioDatablockProps> {
  /**
   * Gets the datablock info for this PrimaryComVlocDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'VLOC Radio',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'VLOC radio tuning'
    };
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-vloc-radio" ref={this.datablockRef}>
        {this.props.ifdOptions.navIndex !== undefined && (
          <NavRadioBlock
            bus={this.props.bus}
            isHidden={Subject.create(false)}
            isFocused={this.props.ifdTuningControlManager.isNavSelected}
            isRecentlySwapped={this.props.ifdTuningControlManager.isNavRecentlySwapped}
            index={this.props.ifdOptions.navIndex as NavRadioIndex}
            displayIndex={1}
            ifdTuningControlManager={this.props.ifdTuningControlManager}
            ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
          />
        )}
      </div>
    );
  }
}

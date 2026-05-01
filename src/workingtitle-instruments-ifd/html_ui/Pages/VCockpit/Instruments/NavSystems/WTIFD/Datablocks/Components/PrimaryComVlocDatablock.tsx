import { FSComponent, MappedSubject, NavRadioIndex, RadioType, Subject, VNode } from '@microsoft/msfs-sdk';

import { ComRadioBlock } from '../../Components/CommNavBlock/ComRadioBlock';
import { NavRadioBlock } from '../../Components/CommNavBlock/NavRadioBlock';
import { TransponderDisplay } from '../../Components/TransponderDisplay/TransponderDisplay';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { IfdOptions } from '../../IfdOptions';
import { DatablockCompatibility, DatablockCompatibilityMap, DataBlockId, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

/** Props for {@link PrimaryComVlocDatablock} */
interface PrimaryComVlocDatablockProps extends BaseDatablockProps {
  /** The IfdTuningControlManager instance */
  readonly ifdTuningControlManager: IfdTuningControlsManager;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
}

/** Datablock for displaying the primary COM/VLOC tuning */
export class PrimaryComVlocDatablock extends Datablock<PrimaryComVlocDatablockProps> {
  private readonly hasNavRadio = this.props.ifdOptions.navIndex !== undefined;

  private readonly navDatablockInUse = Subject.create(false);
  private readonly xpdrDatablockInUse = Subject.create(false);

  private readonly comBlockHidden = MappedSubject.create(
    ([comSelected, navSelected, xpdrSelected, navInUse, xpdrInUse]) => {
      return !comSelected && ((navSelected && this.hasNavRadio && !navInUse) || (xpdrSelected && !!this.props.ifdOptions.enableTransponder && !xpdrInUse));
    },
    this.props.ifdTuningControlManager.isComSelected,
    this.props.ifdTuningControlManager.isNavSelected,
    this.props.ifdTuningControlManager.isXpdrSelected,
    this.navDatablockInUse,
    this.xpdrDatablockInUse,
  ).withLifecycle(this.defaultLifecycle);

  private readonly navBlockHidden = MappedSubject.create(
    ([navSelected, navInUse]) => {
      return !this.hasNavRadio || navInUse || !navSelected;
    },
    this.props.ifdTuningControlManager.isNavSelected,
    this.navDatablockInUse,
  ).withLifecycle(this.defaultLifecycle);

  private readonly xpdrBlockHidden = MappedSubject.create(
    ([xpdrSelected, xpdrInUse]) => {
      return !this.props.ifdOptions.enableTransponder || xpdrInUse || !xpdrSelected;
    },
    this.props.ifdTuningControlManager.isXpdrSelected,
    this.xpdrDatablockInUse,
  ).withLifecycle(this.defaultLifecycle);

  // This block always has the first com and nav standby frequency
  private readonly comStandbyFocused = MappedSubject.create(
    ([comSelected, comStandbyIndex]) => {
      return comSelected && comStandbyIndex === 1;
    },
    this.props.ifdTuningControlManager.isComSelected,
    this.props.ifdTuningControlManager.selectedComStandbyIndex,
  ).withLifecycle(this.defaultLifecycle);
  private readonly navStandbyFocused = MappedSubject.create(
    ([navSelected, navStandbyIndex]) => {
      return navSelected && navStandbyIndex === 1;
    },
    this.props.ifdTuningControlManager.isNavSelected,
    this.props.ifdTuningControlManager.selectedNavStandbyIndex,
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.datablockService.datablocksInUse.sub(datablocksInUse => {
      this.navDatablockInUse.set(datablocksInUse.has(DataBlockId.VlocRadio));
      this.xpdrDatablockInUse.set(datablocksInUse.has(DataBlockId.TransponderThumbnail));
    }, true).withLifecycle(this.defaultLifecycle);

    this.datablockRef.getOrDefault()?.addEventListener('click', this.handleBlockClick.bind(this));
  }

  /**
   * Gets the datablock info for this PrimaryComVlocDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Primary COM/VLOC',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Primary COM/VLOC radio tuning'
    };
  }

  /** Handles when the block is clicked. */
  private handleBlockClick(): void {
    // Select the Com standby frequency 1 if the com view is active
    if (!this.comBlockHidden.get() && this.props.ifdTuningControlManager.selectedComStandbyIndex.get() !== 1) {
      this.props.ifdTuningControlManager.selectStandbyIndex(1, RadioType.Com);
    // Select the Nav standby frequency 1 if the nav view is active
    } else if (!this.navBlockHidden.get() && this.props.ifdTuningControlManager.selectedNavStandbyIndex.get() !== 1) {
      this.props.ifdTuningControlManager.selectStandbyIndex(1, RadioType.Nav);
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-primary-com-vloc" ref={this.datablockRef}>
        <ComRadioBlock
          bus={this.props.bus}
          isHidden={this.comBlockHidden}
          isFocused={this.comStandbyFocused}
          isRecentlySwapped={this.props.ifdTuningControlManager.isComRecentlySwapped}
          index={this.props.ifdOptions.comIndex}
          ifdOptions={this.props.ifdOptions}
          displayIndex={1}
          ifdTuningControlManager={this.props.ifdTuningControlManager}
        />
        {this.hasNavRadio && (
          <NavRadioBlock
            bus={this.props.bus}
            isHidden={this.navBlockHidden}
            isFocused={this.navStandbyFocused}
            isRecentlySwapped={this.props.ifdTuningControlManager.isNavRecentlySwapped}
            index={this.props.ifdOptions.navIndex as NavRadioIndex}
            ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
            displayIndex={1}
            ifdTuningControlManager={this.props.ifdTuningControlManager}
          />
        )}
        {this.props.ifdOptions.enableTransponder && (
          <TransponderDisplay
            bus={this.props.bus}
            ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
            xpdrManager={this.props.ifdTuningControlManager.xpdrManager}
            isHidden={this.xpdrBlockHidden}
          />
        )}
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.datablockRef.getOrDefault()?.removeEventListener('click', this.handleBlockClick.bind(this));

    super.destroy();
  }
}

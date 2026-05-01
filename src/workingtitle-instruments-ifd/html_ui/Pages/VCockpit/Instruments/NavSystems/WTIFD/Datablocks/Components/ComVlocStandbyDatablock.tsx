import { FSComponent, MappedSubject, NavRadioIndex, RadioType, Subject, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { IfdOptions } from '../../IfdOptions';
import { ComFrequency } from '../../Components/CommNavBlock/ComFrequency';
import { SingleFrequencyBlock } from '../../Components/CommNavBlock/SingleFrequencyBlock';
import { NavFrequency } from '../../Components/CommNavBlock/NavFrequency';

import './ComVlocStandbyDatablock.css';

/** Props for {@link PrimaryComVlocDatablock} */
interface ComVlocStandbyDatablockProps extends BaseDatablockProps {
  /** The IfdTuningControlManager instance */
  readonly ifdTuningControlManager: IfdTuningControlsManager;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
  /** The standby frequency index */
  readonly standbyIndex: 2 | 3 | 4;
}

/** Datablock for displaying the second standby COM/VLOC frequency */
export class ComVlocStandbyDatablock extends Datablock<ComVlocStandbyDatablockProps> {
  private readonly isStandbySelected = MappedSubject.create(
    ([comSelected, navSelected, comIndex, navIndex]) => {
      if (comSelected) {
        return this.props.standbyIndex === comIndex;
      }
      if (navSelected) {
        return this.props.standbyIndex === navIndex;
      }
      return false;
    },
    this.props.ifdTuningControlManager.isComSelected,
    this.props.ifdTuningControlManager.isNavSelected,
    this.props.ifdTuningControlManager.selectedComStandbyIndex,
    this.props.ifdTuningControlManager.selectedNavStandbyIndex,
  ).withLifecycle(this.defaultLifecycle);

  private readonly comStandbyRef = FSComponent.createRef<HTMLDivElement>();
  private readonly navStandbyRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.comStandbyRef.getOrDefault()?.addEventListener('click', this.selectComStandbyIndex.bind(this));
    this.navStandbyRef.getOrDefault()?.addEventListener('click', this.selectNavStandbyIndex.bind(this));

  }

  /**
   * Gets the datablock info for this PrimaryComVlocDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'COM/VLOC Standby #2',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'COM/VLOC Standby #2'
    };
  }

  /** Selects the Com standby frequency */
  private selectComStandbyIndex(): void {
    if (!this.isStandbySelected.get()) {
      this.props.ifdTuningControlManager.selectStandbyIndex(this.props.standbyIndex, RadioType.Com);
    }
  }

  /** Selects the Nav standby frequency */
  private selectNavStandbyIndex(): void {
    if (!this.isStandbySelected.get()) {
      this.props.ifdTuningControlManager.selectStandbyIndex(this.props.standbyIndex, RadioType.Nav);
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-single-standby" ref={this.datablockRef}>
        <SingleFrequencyBlock>
          <div ref={this.comStandbyRef} class={{
            'datablock-single-standby-freq': true,
            hidden: this.props.ifdTuningControlManager.isNavSelected
          }}>
            <ComFrequency
              bus={this.props.bus}
              index={this.props.ifdOptions.comIndex}
              displayIndex={1}
              isActiveFreq={false}
              standbyIndex={this.props.standbyIndex}
              isFocused={this.isStandbySelected}
              isRecentlySwapped={Subject.create(false)}
              ifdTuningControlManager={this.props.ifdTuningControlManager}
              ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
            />
          </div>
          <div ref={this.navStandbyRef} class={{
            'datablock-single-standby-freq': true,
            hidden: this.props.ifdTuningControlManager.isNavSelected.map(v => !v).withLifecycle(this.defaultLifecycle)
          }}>
            {this.props.ifdOptions.navIndex !== undefined && (
              <NavFrequency
                bus={this.props.bus}
                index={this.props.ifdOptions.navIndex as NavRadioIndex}
                displayIndex={1}
                isActiveFreq={false}
                standbyIndex={this.props.standbyIndex}
                isFocused={this.isStandbySelected}
                isRecentlySwapped={Subject.create(false)}
                ifdTuningControlManager={this.props.ifdTuningControlManager}
                ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
              />
            )}
          </div>
        </SingleFrequencyBlock>
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    if (this.props.ifdTuningControlManager.selectedComStandbyIndex.get() === this.props.standbyIndex) {
      this.props.ifdTuningControlManager.selectStandbyIndex(1, RadioType.Com);
    }
    if (this.props.ifdTuningControlManager.selectedNavStandbyIndex.get() === this.props.standbyIndex) {
      this.props.ifdTuningControlManager.selectStandbyIndex(1, RadioType.Nav);
    }

    this.comStandbyRef.getOrDefault()?.removeEventListener('click', this.selectComStandbyIndex.bind(this));
    this.navStandbyRef.getOrDefault()?.removeEventListener('click', this.selectNavStandbyIndex.bind(this));

    super.destroy();
  }
}

import { ConsumerSubject, FSComponent, LNavEvents, LNavUtils, MappedSubject, NumberFormatter, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';
import { UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { UnitFormatter } from '../../Components/NumberDisplays';

/** Props for the xtk data block. */
export interface CrossTrackDistanceDatablockProps extends BaseDatablockProps {
  /** the LNAV index to use. */
  lnavIndex: number;
}

/** Datablock for displaying the Cross Track Distance */
export class CrossTrackDistanceDatablock extends Datablock<CrossTrackDistanceDatablockProps> {
  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.bus);

  private readonly xtrkDistanceFormatter = NumberFormatter.create({
    precision: 0.1,
    nanString: '-.-',
    hideSign: true,
  });

  private readonly xtrkDistance =
    ConsumerSubject.create(this.props.bus.getSubscriber<LNavEvents>().on(`lnav_xtk${LNavUtils.getEventBusTopicSuffix(this.props.lnavIndex)}`).withPrecision(0.1), NaN)
      .withLifecycle(this.defaultLifecycle);

  private readonly xtrkDisplay = MappedSubject.create(
    ([dist, unit]) => this.xtrkDistanceFormatter(UnitType.NMILE.convertTo(dist, unit)),
    this.xtrkDistance,
    this.unitsSettingManager.distanceUnitsLarge
  ).withLifecycle(this.defaultLifecycle);

  private readonly xtrkDistanceUnits = this.unitsSettingManager.distanceUnitsLarge
    .map(UnitFormatter.unitLabel<UnitFamily.Distance>)
    .withLifecycle(this.defaultLifecycle);

  private readonly xtrkDirection = this.xtrkDistance.map(xtrkDistance =>
    xtrkDistance < 0 ? 'Left' : 'Right').withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this CrossTrackDistanceDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Cross Track Distance',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-cross-track-dist" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-mint">Cross Track</div>
        <div class="datablock-content-row space-below">
          <div class="datablock-indent datablock-font-large datablock-text-cyan">{this.xtrkDisplay}</div>
          <div class="datablock-font-small datablock-text-mint">
            {this.xtrkDistanceUnits}
            &nbsp;
            {this.xtrkDirection}
          </div>
        </div>
      </div>
    );
  }
}

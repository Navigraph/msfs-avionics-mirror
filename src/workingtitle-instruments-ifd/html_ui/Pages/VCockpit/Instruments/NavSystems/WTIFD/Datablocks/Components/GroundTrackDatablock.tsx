import { ConsumerSubject, FSComponent, GNSSEvents, MagVar, MappedSubject, VNode } from '@microsoft/msfs-sdk';

import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';
import { BearingFormatter } from '../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { Datablock } from './Datablock';

import './GroundTrackDatablock.css';

/** Datablock for displaying the ground track */
export class GroundTrackDatablock extends Datablock {
  private readonly magvar =
    ConsumerSubject.create(this.props.bus.getSubscriber<GNSSEvents>().on('magvar').atFrequency(0.1, true), NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly trackTrue =
    ConsumerSubject.create(this.props.bus.getSubscriber<GnssReceiverEvents>().on('gnss_track_true_deg').withPrecision(0.1), NaN)
      .withLifecycle(this.defaultLifecycle);

  private readonly groundTrackDisplay = MappedSubject.create(
    ([trueTrack, magvar, navAngle]) => BearingFormatter.format(
      navAngle === UnitsNavAngleSettingMode.True || trueTrack === null
        ? trueTrack
        : MagVar.trueToMagnetic(trueTrack, magvar),
      navAngle,
    ),
    this.trackTrue,
    this.magvar,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this GroundTrackDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Ground Track',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Current ground track'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-ground-track" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-mint">Track</div>
        <div class="datablock-ground-track-value datablock-font-large datablock-text-cyan">{this.groundTrackDisplay}</div>
      </div>
    );
  }
}

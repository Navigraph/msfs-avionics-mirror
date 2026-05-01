import { ConsumerSubject, FSComponent, GNSSEvents, MappedSubject, NumberFormatter, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap, DatablockSlotLocation } from '../DatablockTypes';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';

import './GpsAglAltDatablock.css';

/** Props for {@link GpsAglAltDatablock} */
interface GpsAglAltDatablockProps extends BaseDatablockProps {
  /** The selected display unit for altitudes */
  altitudeUnit: Subscribable<Unit<UnitFamily.Distance>>;
}

/** GPS AGL Altitude Datablock */
export class GpsAglAltDatablock extends Datablock<GpsAglAltDatablockProps> {
  private readonly altitudeFormatter = NumberFormatter.create({
    precision: 10,
    nanString: '---',
  });

  private readonly gnssSub = this.props.bus.getSubscriber<GNSSEvents & GnssReceiverEvents>();
  private readonly gnssAltitudeFeet =
    ConsumerSubject.create(this.gnssSub.on('gnss_altitude_ft'), null)
      .withLifecycle(this.defaultLifecycle);
  private readonly groundAltitudeFeet = ConsumerSubject.create(this.gnssSub.on('ground_altitude'), 0).withLifecycle(this.defaultLifecycle);

  private readonly planeAltAglFeet = MappedSubject.create(
    ([gnssFeet, groundFeet]) => gnssFeet === null ? null : Math.round(gnssFeet - groundFeet),
    this.gnssAltitudeFeet,
    this.groundAltitudeFeet,
  ).withLifecycle(this.defaultLifecycle);

  private readonly planeAltAglDisplay = MappedSubject.create(([altFeet, altUnit]) => {
    if (altFeet === null) {
      return this.altitudeFormatter(NaN);
    }
    return this.altitudeFormatter(UnitType.FOOT.convertTo(altFeet, altUnit));
  }, this.planeAltAglFeet, this.props.altitudeUnit).withLifecycle(this.defaultLifecycle);

  private readonly isTopBar = this.props.location === DatablockSlotLocation.TopBar;

  /**
   * Gets the datablock info for this GpsAglAltDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'GPS AGL Alt',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Current altitude above ground level using GPS'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div ref={this.datablockRef} class={{
        'datablock': true,
        'datablock-agl-alt': true,
        'datablock-agl-alt-topbar': this.isTopBar,
      }}>
        <div class="datablock-gps-alt-display">
          <div class="datablock-font-small datablock-text-mint datablock-space-after">
            {this.isTopBar ? 'GPS AGL' : 'GPS AGL Alt'}
          </div>
          <div class="agl-alt-value-container">
            <div class="datablock-font-large datablock-text-cyan">{this.planeAltAglDisplay}</div>
            <div class="datablock-font-small datablock-text-mint">
              {this.props.altitudeUnit.map(unit => unit.equals(UnitType.FOOT) ? 'Ft' : 'M').withLifecycle(this.defaultLifecycle)}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

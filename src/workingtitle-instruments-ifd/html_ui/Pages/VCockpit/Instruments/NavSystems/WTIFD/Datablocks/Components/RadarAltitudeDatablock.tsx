import { AdcEvents, ConsumerSubject, FSComponent, MappedSubject, MathUtils, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap, DatablockSlotLocation } from '../DatablockTypes';

/** Props for {@link RadarAltitudeDatablock} */
interface RadarAltitudeDatablockProps extends BaseDatablockProps {
  /** The selected display unit for altitudes */
  altitudeUnit: Subscribable<Unit<UnitFamily.Distance>>;
}

/** Datablock for displaying the radar altitude */
export class RadarAltitudeDatablock extends Datablock<RadarAltitudeDatablockProps> {
  private readonly adcSub = this.props.bus.getSubscriber<AdcEvents>();
  private readonly radioAltFeet = ConsumerSubject.create(this.adcSub.on('radio_alt').withPrecision(1), NaN)
    .withLifecycle(this.defaultLifecycle);

  private readonly radioAltDisplay = MappedSubject.create(([altFeet, altUnit]) => {
    return MathUtils.round(UnitType.FOOT.convertTo(altFeet, altUnit), 10);
  }, this.radioAltFeet, this.props.altitudeUnit).withLifecycle(this.defaultLifecycle);

  private readonly isTopBar = this.props.location === DatablockSlotLocation.TopBar;

  /**
   * Gets the datablock info for this TotalAirTemp instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Radar Altitude',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'AGL altitude from a radar altimeter'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={{ 'datablock': true, 'datablock-agl-alt': true, 'datablock-agl-alt-topbar': this.isTopBar, }} ref={this.datablockRef}>
        <div class="datablock-gps-alt-display">
          <div class="datablock-font-small datablock-text-mint datablock-space-after">Radar alt</div>
          <div class="agl-alt-value-container">
            <div class="datablock-font-large datablock-text-cyan">{this.radioAltDisplay}</div>
            <div class="datablock-font-small datablock-text-mint">
              {this.props.altitudeUnit.map(unit => unit.equals(UnitType.FOOT) ? 'Ft' : 'M').withLifecycle(this.defaultLifecycle)}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

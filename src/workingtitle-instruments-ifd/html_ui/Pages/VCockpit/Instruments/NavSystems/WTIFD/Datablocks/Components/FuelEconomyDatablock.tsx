import { ConsumerSubject, FSComponent, MappedSubject, NumberFormatter, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdFuelComputerEvents } from '../../Systems/FuelComputer/IfdFuelComputerEvents';

/** Props for {@link FuelEconomyDatablock} */
interface FuelEconomyDatablockProps extends BaseDatablockProps {
  /** The selected display unit for distance */
  distanceUnits: Subscribable<Unit<UnitFamily.Distance>>;
  /** The selected display unit for fuel flow */
  fuelFlowUnits: Subscribable<Unit<UnitFamily.WeightFlux>>;
}

/** Datablock for displaying the fuel economy */
export class FuelEconomyDatablock extends Datablock<FuelEconomyDatablockProps> {
  private readonly fuelEconFormatter = NumberFormatter.create({
    precision: 1,
    nanString: '-.-',
  });

  private readonly fuelSub = this.props.bus.getSubscriber<IfdFuelComputerEvents>();

  private readonly fuelEconNmPerGal = ConsumerSubject.create(this.fuelSub.on('ifd_fuel_economy_nmpg').withPrecision(0.01), NaN)
    .withLifecycle(this.defaultLifecycle);

  private readonly fuelEconDisplay = MappedSubject.create(([fuelEconNmPerGal, distanceUnits, ffUnits]) => {
    if (isNaN(fuelEconNmPerGal)) {
      return this.fuelEconFormatter(NaN);
    }
    const numeratorConversionRate = UnitType.NMILE.convertTo(1, distanceUnits);
    const denominatorConversionRate = UnitType.GPH_FUEL.convertTo(1, ffUnits);
    return this.fuelEconFormatter(fuelEconNmPerGal * numeratorConversionRate / denominatorConversionRate);
  }, this.fuelEconNmPerGal, this.props.distanceUnits, this.props.fuelFlowUnits).withLifecycle(this.defaultLifecycle);

  private readonly distanceUnitDisplay = this.props.distanceUnits.map(unit => {
    if (UnitType.NMILE.equals(unit)) {
      return 'NM';
    }
    if (UnitType.KILOMETER.equals(unit)) {
      return 'KM';
    }
    return 'mi';
  }).withLifecycle(this.defaultLifecycle);

  private readonly fuelUnitDisplay = this.props.fuelFlowUnits.map(unit => {
    if (UnitType.GPH_FUEL.equals(unit)) {
      return 'Gal';
    }
    if (UnitType.PPH.equals(unit)) {
      return 'Lbs';
    }
    if (UnitType.KGH.equals(unit)) {
      return 'Kg';
    }
    if (UnitType.LPH_FUEL.equals(unit)) {
      return 'L';
    }
    return 'Gal';
  });

  /**
   * Gets the datablock info for this FuelEconomyDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Fuel economy',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Estimated fuel economy (e.g. NM/Gal)'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-fuel" ref={this.datablockRef}>
        <div class="datablock-fuel-display">
          <div class="datablock-font-small datablock-text-mint datablock-space-after">Fuel Economy</div>
          <div class="fuel-value-container">
            <div class="datablock-font-large datablock-text-cyan">{this.fuelEconDisplay}</div>
            <div class="datablock-font-small datablock-text-mint">
              {this.distanceUnitDisplay}/{this.fuelUnitDisplay}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

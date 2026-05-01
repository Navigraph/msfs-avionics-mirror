import { ConsumerSubject, FSComponent, MappedSubject, NumberFormatter, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdFuelComputerEvents } from '../../Systems/FuelComputer/IfdFuelComputerEvents';

/** Props for {@link FuelUsedDatablock} */
interface FuelUsedDatablockProps extends BaseDatablockProps {
  /** The selected display unit for fuel weight */
  fuelUnits: Subscribable<Unit<UnitFamily.Weight>>;
}

/** Datablock for displaying the fuel used */
export class FuelUsedDatablock extends Datablock<FuelUsedDatablockProps> {
  private readonly fuelFormatter = NumberFormatter.create({
    precision: 0.1,
    nanString: '---'
  });

  private readonly fuelSub = this.props.bus.getSubscriber<IfdFuelComputerEvents>();
  private readonly totalFuelUsedGallons = ConsumerSubject.create(this.fuelSub.on('ifd_fuel_burned_total_gal'), NaN)
    .withLifecycle(this.defaultLifecycle);

  private readonly totalFuelUsedDisplay = MappedSubject.create(([totalFuelUsedGallons, fuelUnits]) => {
    if (isNaN(totalFuelUsedGallons)) {
      return '---';
    }
    return this.fuelFormatter(UnitType.GALLON_FUEL.convertTo(totalFuelUsedGallons, fuelUnits));
  }, this.totalFuelUsedGallons, this.props.fuelUnits).withLifecycle(this.defaultLifecycle);

  private readonly fuelUsedUnitDisplay = this.props.fuelUnits.map(unit => {
    if (UnitType.IMP_GALLON_FUEL.equals(unit)) {
      return 'Gal';
    }
    if (UnitType.LITER_FUEL.equals(unit)) {
      return 'L';
    }
    if (UnitType.KILOGRAM.equals(unit)) {
      return 'Kg';
    }
    if (UnitType.POUND.equals(unit)) {
      return 'Lbs';
    }
    return 'Gal';
  }).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this FuelUsedDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Fuel used',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Total fuel used as sent by the aircraft fuel flow system'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-fuel" ref={this.datablockRef}>
        <div class="datablock-fuel-display">
          <div class="datablock-font-small datablock-text-mint datablock-space-after">Fuel Used</div>
          <div class="fuel-value-container">
            <div class="datablock-font-large datablock-text-cyan">{this.totalFuelUsedDisplay}</div>
            <div class="datablock-font-small datablock-text-mint">{this.fuelUsedUnitDisplay}</div>
          </div>
        </div>
      </div>
    );
  }
}

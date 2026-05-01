import { ConsumerSubject, FSComponent, MappedSubject, NumberFormatter, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdFuelComputerEvents } from '../../Systems/FuelComputer/IfdFuelComputerEvents';

import './FuelRemainingDatablock.css';

/** Props for {@link FuelRemainingDatablock} */
interface FuelRemainingDatablockProps extends BaseDatablockProps {
  /** The selected display unit for fuel weight */
  fuelUnits: Subscribable<Unit<UnitFamily.Weight>>;
}

/** Datablock for displaying the fuel remaining */
export class FuelRemainingDatablock extends Datablock<FuelRemainingDatablockProps> {
  private readonly fuelFormatter = NumberFormatter.create({
    precision: 0.1,
    nanString: '---'
  });

  private readonly fuelSub = this.props.bus.getSubscriber<IfdFuelComputerEvents>();
  private readonly totalFuelGallons = ConsumerSubject.create(this.fuelSub.on('ifd_fuel_remaining_gal'), NaN)
    .withLifecycle(this.defaultLifecycle);

  private readonly totalFuelDisplay = MappedSubject.create(([totalFuelGallons, fuelUnits]) => {
    if (isNaN(totalFuelGallons)) {
      return '---';
    }
    return this.fuelFormatter(UnitType.GALLON_FUEL.convertTo(totalFuelGallons, fuelUnits));
  }, this.totalFuelGallons, this.props.fuelUnits).withLifecycle(this.defaultLifecycle);

  private readonly fuelUnitDisplay = this.props.fuelUnits.map(unit => {
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
   * Gets the datablock info for this FuelRemainingDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Fuel remaining',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Total fuel as sent by the aircraft fuel system'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-fuel" ref={this.datablockRef}>
        <div class="datablock-fuel-display">
          <div class="datablock-font-small datablock-text-mint datablock-space-after">Fuel Rmng</div>
          <div class="fuel-value-container">
            <div class="datablock-font-large datablock-text-cyan">{this.totalFuelDisplay}</div>
            <div class="datablock-font-small datablock-text-mint">{this.fuelUnitDisplay}</div>
          </div>
        </div>
      </div>
    );
  }
}

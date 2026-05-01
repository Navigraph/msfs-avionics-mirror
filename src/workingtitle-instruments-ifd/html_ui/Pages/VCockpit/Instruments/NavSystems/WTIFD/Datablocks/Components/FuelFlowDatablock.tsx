import { ConsumerSubject, FSComponent, MappedSubject, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdFuelComputerEvents } from '../../Systems/FuelComputer/IfdFuelComputerEvents';

/** Props for {@link FuelFlowDatablock} */
interface FuelFlowDatablockProps extends BaseDatablockProps {
  /** The selected display unit for fuel weight */
  fuelFlowUnits: Subscribable<Unit<UnitFamily.WeightFlux>>;
}

/** Datablock for displaying the fuel flow */
export class FuelFlowDatablock extends Datablock<FuelFlowDatablockProps> {
  private readonly fuelSub = this.props.bus.getSubscriber<IfdFuelComputerEvents>();
  private readonly fuelFlow = ConsumerSubject.create(this.fuelSub.on('ifd_fuel_flow_total_gph').withPrecision(0.01), NaN)
    .withLifecycle(this.defaultLifecycle);

  private readonly fuelFlowDisplay = MappedSubject.create(([fuelFlow, fuelUnits]) => {
    if (isNaN(fuelFlow)) {
      return '---';
    }
    return UnitType.GPH_FUEL.convertTo(fuelFlow, fuelUnits).toFixed(fuelFlow >= 100 ? 0 : 1);
  }, this.fuelFlow, this.props.fuelFlowUnits).withLifecycle(this.defaultLifecycle);

  private readonly fuelFlowUnitDisplay = this.props.fuelFlowUnits.map(unit => {
    if (UnitType.GPH_FUEL.equals(unit)) {
      return 'Gal/Hr';
    }
    if (UnitType.LITER_FUEL.equals(unit)) {
      return 'L/h';
    }
    if (UnitType.KILOGRAM.equals(unit)) {
      return 'Kg/h';
    }
    if (UnitType.POUND.equals(unit)) {
      return 'Lbs/h';
    }
    return 'Gal/Hr';
  }).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this FuelFlowDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Fuel flow',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Fuel consumed by the aircraft per hour'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-fuel" ref={this.datablockRef}>
        <div class="datablock-fuel-display">
          <div class="datablock-font-small datablock-text-mint datablock-space-after">Fuel Flow</div>
          <div class="fuel-value-container">
            <div class="datablock-font-large datablock-text-cyan">{this.fuelFlowDisplay}</div>
            <div class="datablock-font-small datablock-text-mint">{this.fuelFlowUnitDisplay}</div>
          </div>
        </div>
      </div>
    );
  }
}

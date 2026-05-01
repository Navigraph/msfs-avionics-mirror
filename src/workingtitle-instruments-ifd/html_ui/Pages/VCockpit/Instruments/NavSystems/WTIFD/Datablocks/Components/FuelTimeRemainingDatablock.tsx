import { ConsumerSubject, DurationFormatter, FSComponent, UnitType, VNode } from '@microsoft/msfs-sdk';

import { Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { IfdFuelComputerEvents } from '../../Systems/FuelComputer/IfdFuelComputerEvents';

/** Datablock for displaying the fuel time remaining */
export class FuelTimeRemainingDatablock extends Datablock {
  private readonly timeFormatter = DurationFormatter.create('h:mm', UnitType.HOUR, 60, '--:--');

  private readonly fuelSub = this.props.bus.getSubscriber<IfdFuelComputerEvents>();
  private readonly fuelEnduranceHours = ConsumerSubject.create(this.fuelSub.on('ifd_fuel_endurance_hr'), NaN).withLifecycle(this.defaultLifecycle);

  private readonly fuelTimeRemainingDisplay = this.fuelEnduranceHours.map(fuelEnduranceHours => {
    return this.timeFormatter(fuelEnduranceHours);
  }).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this FuelTimeRemainingDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Fuel time remaining',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Total time remaining based on remaining fuel and current fuel flow'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-fuel" ref={this.datablockRef}>
        <div class="datablock-fuel-display">
          <div class="datablock-font-small datablock-text-mint datablock-space-after">Fuel Time Rmng</div>
          <div class="fuel-value-container">
            <div class="datablock-font-large datablock-text-cyan">{this.fuelTimeRemainingDisplay}</div>
            <div class="datablock-font-small datablock-text-mint">H:M</div>
          </div>
        </div>
      </div>
    );
  }
}

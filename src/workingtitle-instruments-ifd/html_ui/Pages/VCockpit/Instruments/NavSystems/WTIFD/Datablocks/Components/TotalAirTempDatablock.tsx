import { AdcEvents, ConsumerSubject, FSComponent, MappedSubject, NumberFormatter, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';

import './TotalAirTempDatablock.css';

/** Props for {@link TotalAirTempDatablock} */
interface TotalAirTempDatablockProps extends BaseDatablockProps {
  /** The selected display unit for temperature */
  temperatureUnits: Subscribable<Unit<UnitFamily.Temperature>>;
}

/** Datablock for displaying the total air temperature */
export class TotalAirTempDatablock extends Datablock<TotalAirTempDatablockProps> {
  private readonly tempFormatter = NumberFormatter.create({
    precision: 1,
    nanString: '--',
  });

  private readonly adcSub = this.props.bus.getSubscriber<AdcEvents>();
  private readonly tatC = ConsumerSubject.create(this.adcSub.on('ram_air_temp_c').withPrecision(0.1), NaN);

  private readonly tatDisplay = MappedSubject.create(([tatC, tempUnit]) => {
    return this.tempFormatter(isNaN(tatC) ? NaN : UnitType.CELSIUS.convertTo(tatC, tempUnit));
  }, this.tatC, this.props.temperatureUnits).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this TotalAirTemp instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Total Air Temperature',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Total Air Temperature'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-tat" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-mint">TAT</div>
        <div class="datablock-tat-value datablock-font-large datablock-text-cyan">{this.tatDisplay}°</div>
        <div class="datablock-tat-unit datablock-font-small datablock-text-mint">
          {this.props.temperatureUnits.map(u => UnitType.CELSIUS.equals(u) ? 'C' : 'F').withLifecycle(this.defaultLifecycle)}
        </div>
      </div>
    );
  }
}

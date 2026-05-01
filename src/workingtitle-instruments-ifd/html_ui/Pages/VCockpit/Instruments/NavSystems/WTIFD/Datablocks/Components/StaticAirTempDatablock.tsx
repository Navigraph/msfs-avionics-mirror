import { AdcEvents, ConsumerSubject, FSComponent, MappedSubject, NumberFormatter, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';

import './StaticAirTempDatablock.css';

/** Props for {@link StaticAirTempDatablock} */
interface StaticAirTempDatablockProps extends BaseDatablockProps {
  /** The selected display unit for temperature */
  temperatureUnits: Subscribable<Unit<UnitFamily.Temperature>>;
}

/** Datablock for displaying the static air temperature */
export class StaticAirTempDatablock extends Datablock<StaticAirTempDatablockProps> {
  private readonly tempFormatter = NumberFormatter.create({
    precision: 1,
    nanString: '--',
  });

  private readonly adcSub = this.props.bus.getSubscriber<AdcEvents>();
  private readonly satC = ConsumerSubject.create(this.adcSub.on('ambient_temp_c').withPrecision(0.1), NaN);

  private readonly satDisplay = MappedSubject.create(([satC, tempUnit]) => {
    return this.tempFormatter(isNaN(satC) ? NaN : UnitType.CELSIUS.convertTo(satC, tempUnit));
  }, this.satC, this.props.temperatureUnits).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this StaticAirTemp instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Static Air Temperature',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Static Air Temperature'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-sat" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-mint">SAT</div>
        <div class="datablock-sat-value datablock-font-large datablock-text-cyan">{this.satDisplay}°</div>
        <div class="datablock-sat-unit datablock-font-small datablock-text-mint">
          {this.props.temperatureUnits.map(u => UnitType.CELSIUS.equals(u) ? 'C' : 'F').withLifecycle(this.defaultLifecycle)}
        </div>
      </div>
    );
  }
}

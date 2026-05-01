import { ConsumerSubject, FSComponent, MappedSubject, NumberFormatter, Subscribable, Unit, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';

import './GroundSpeedDatablock.css';

/** Props for {@link GroundSpeedDatablock} */
interface GroundSpeedDatablockProps extends BaseDatablockProps {
  /** The selected display unit for speed */
  speedUnit: Subscribable<Unit<UnitFamily.Speed>>;
}

/** Datablock for displaying the ground speed */
export class GroundSpeedDatablock extends Datablock<GroundSpeedDatablockProps> {
  private readonly speedFormatter = NumberFormatter.create({
    precision: 1,
    nanString: '---',
  });

  private readonly gnssSub = this.props.bus.getSubscriber<GnssReceiverEvents>();
  private readonly groundSpeedKts =
    ConsumerSubject.create(this.gnssSub.on('gnss_ground_speed_kts').withPrecision(0.1), NaN)
      .withLifecycle(this.defaultLifecycle);

  private readonly groundSpeedDisplay = MappedSubject.create(([spdKts, spdUnit]) => {
    if (spdKts === null) {
      return this.speedFormatter(NaN);
    }
    return this.speedFormatter(UnitType.KNOT.convertTo(spdKts, spdUnit));
  }, this.groundSpeedKts, this.props.speedUnit).withLifecycle(this.defaultLifecycle);
  private readonly speedUnitDisplay = this.props.speedUnit.map(unit => {
    if (UnitType.KNOT.equals(unit)) {
      return 'Kts';
    }
    if (UnitType.KPH.equals(unit)) {
      return 'Kph';
    }
    return 'Mph';
  }).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this GroundSpeedDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Ground Speed',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Current ground speed'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-ground-speed" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-mint">GS</div>
        <div class="datablock-ground-speed-value datablock-font-large datablock-text-cyan">{this.groundSpeedDisplay}</div>
        <div class="datablock-ground-speed-unit datablock-font-small datablock-text-mint">{this.speedUnitDisplay}</div>
      </div>
    );
  }
}

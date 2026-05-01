import { FSComponent, VNode, ClockEvents, ConsumerSubject, DateTimeFormatter } from '@microsoft/msfs-sdk';
import { Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';

import './UtcTimeDatablock.css';

/**
 * UTC Time datablock - shows current UTC time (alternative implementation)
 */
export class UtcTimeDatablock extends Datablock {
  private readonly sub = this.props.bus.getSubscriber<ClockEvents>();
  private readonly simTime = ConsumerSubject.create(this.sub.on('simTime').withPrecision(-3), 0).withLifecycle(this.defaultLifecycle);
  private readonly timeDisplay = this.simTime.map(DateTimeFormatter.create('{HH}:{mm}:{ss}'));

  /** @inheritdoc */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'UTC Time',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Current Coordinated Universal Time'
    };
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-utc-time" ref={this.datablockRef}>
        <div class="datablock-time-display">
          <span class="datablock-time-value datablock-font-large datablock-text-cyan datablock-space-after">
            {this.timeDisplay}
          </span>
          <span class="datablock-font-small datablock-text-mint">Z</span>
        </div>
      </div>
    );
  }
}

import { DurationFormatter, FSComponent, UnitType, VNode } from '@microsoft/msfs-sdk';

import { TimerManager } from '../../Systems/Timer/TimerManager';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap, DatablockSlotLocation } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

import './FlightTimerDatablock.css';

/** Props for {@link FlightTimerDatablock} */
interface FlightTimerDatablockProps extends BaseDatablockProps {
  /** The flight timer manager. */
  readonly timerManager: TimerManager;
}

/** Datablock for displaying the Flight Timer */
export class FlightTimerDatablock extends Datablock<FlightTimerDatablockProps> {
  private readonly flightTimeFormatter = DurationFormatter.create('{h}:{mm}', UnitType.MILLISECOND, 1000, '-:--');

  private readonly flightTimerValueMs = this.props.timerManager.tripTimer.takeoffValue.map((v) => v ? v : NaN).withLifecycle(this.defaultLifecycle);

  private readonly isTopBar = this.props.location === DatablockSlotLocation.TopBar;

  /**
   * Gets the datablock info for FlightTimerDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Flight Timer',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div ref={this.datablockRef} class={{
        'datablock': true,
        'datablock-flight-timer': true,
        'datablock-flight-timer-topbar': this.isTopBar,
      }}>
        <div class={{
          'datablock-indent': true,
          'datablock-font-small': true,
          'datablock-text-mint': true,
          'title-padding': !this.isTopBar,
        }}>
          {this.isTopBar ? 'Flight' : 'Flight Timer'}
        </div>
        <div class="datablock-value-row">
          <div class="datablock-indent datablock-font-large datablock-text-cyan">
            {this.flightTimerValueMs.map(this.flightTimeFormatter).withLifecycle(this.defaultLifecycle)}
          </div>
          <div class="datablock-font-small datablock-text-mint">H:M</div>
        </div>
      </div>
    );
  }
}

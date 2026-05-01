import { ClockEvents, ConsumerSubject, DateTimeFormatter, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { Datablock } from '../Components/Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap, DatablockSlotLocation } from '../DatablockTypes';
import { TimeFormat, TimeUserSettings } from '../../Settings/TimeUserSettings';

import './LocalTimeDatablock.css';

/**
 * Local Time datablock - shows current local time with AM/PM
 */
export class LocalTimeDatablock extends Datablock {
  private readonly sub = this.props.bus.getSubscriber<ClockEvents>();
  private readonly simTime = ConsumerSubject.create(this.sub.on('simTime').withPrecision(-3), 0);
  private readonly timeFormat = TimeUserSettings.getManager(this.props.bus).getSetting('timeFormat');
  private readonly timeOffsetMinutes = TimeUserSettings.getManager(this.props.bus).getSetting('localTimeOffset');

  // Formatters for different time formats
  private readonly formatter12Hr = DateTimeFormatter.create('{h}:{mm}:{ss}');
  private readonly formatterAmPm = DateTimeFormatter.create('{am}');
  private readonly formatter24Hr = DateTimeFormatter.create('{HH}:{mm}:{ss}');

  private readonly timeDisplay = Subject.create('12:00:00');
  private readonly amPmDisplay = Subject.create('am');

  private readonly isTopBar = this.props.location === DatablockSlotLocation.TopBar;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.register(this.simTime);

    this.register(this.simTime.sub(time => {
      if (time === 0) {
        this.timeDisplay.set('12:00:00 am');
        this.amPmDisplay.set('am');
        return;
      }

      // Update display when time, format, or offset changes
      this.register(this.simTime.sub(() => this.updateTimeDisplay(), true));
      this.register(this.timeFormat.sub(() => this.updateTimeDisplay()));
      this.register(this.timeOffsetMinutes.sub(() => this.updateTimeDisplay()));
    }, true));
  }

  /**
   * Updates the time display based on current time, format, and offset
   */
  private updateTimeDisplay(): void {
    const utcTime = this.simTime.get();
    if (utcTime === 0) {
      this.timeDisplay.set('12:00:00 am');
      this.amPmDisplay.set('am');
      return;
    }

    const format = this.timeFormat.get();
    const offsetMs = this.timeOffsetMinutes.get() * 60_000; // minutes to milliseconds
    const localTime = utcTime + offsetMs;

    let formatted: string;
    switch (format) {
      case TimeFormat.UTC:
      case TimeFormat.H24:
        formatted = this.formatter24Hr(localTime);
        this.amPmDisplay.set('');
        break;
      case TimeFormat.H12:
      default:
        formatted = this.formatter12Hr(localTime);
        this.amPmDisplay.set(this.formatterAmPm(localTime));
        break;
    }

    this.timeDisplay.set(formatted);
  }

  /**
   * Gets the datablock info for this LocalTimeDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Local Time',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Current Local Time'
    };
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div ref={this.datablockRef} class={{
        'datablock': true,
        'datablock-local-time': true,
        'datablock-topbar': this.isTopBar,
      }}>
        <div class="datablock-time-display">
          <div class="datablock-time-zone datablock-font-small datablock-text-mint datablock-time-title">{this.isTopBar ? 'lcl' : 'Local'}</div>
          <div class="datablock-time-value datablock-font-large datablock-text-cyan">
            {this.timeDisplay}
            <span class={{
              hidden: this.timeFormat.map(v => v !== TimeFormat.H12),
              'datablock-font-small': true,
              'datablock-text-mint': true,
              'datablock-time-ampm': true
            }}>
              {this.amPmDisplay}
            </span>
          </div>
        </div>
      </div>
    );
  }
}

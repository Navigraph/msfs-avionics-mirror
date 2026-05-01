import { ClockEvents, ConsumerSubject, DateTimeFormatter, DurationFormatter, EventBus, MappedSubject, UnitType, UserSettingManager } from '@microsoft/msfs-sdk';

import { KeyboardInputType, VirtualKeyboardType } from '../../../../../Keyboard/KeyboardTypes';
import { TimeFormat, TimeUserSettingTypes } from '../../../../../Settings/TimeUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The time settings of the setup page */
export class TimeRow {
  private static DURATION_FORMATTER = DurationFormatter.create('{hh}:{mm}', UnitType.MINUTE, 1, '--:--');
  private static TIME_OFFSET_FORMATTER = (v: number): string => `${v < 0 ? '-' : '+'} ${TimeRow.DURATION_FORMATTER(v)}`;
  private static UTC_FORMATTER = DateTimeFormatter.create('{HH}:{mm}:{ss}z');
  private static LCL_FORMATTER_24 = DateTimeFormatter.create('{HH}:{mm}:{ss}');
  private static LCL_FORMATTER_12 = DateTimeFormatter.create('{h}:{mm}:{ss} {am}');

  /**
   * Gets the rows to display for this section
   * @param bus The event bus to use to subscribe to time updates
   * @param timeSettings The time settings manager to use to get the local time offset setting
   * @returns The row section
   */
  public static getRows(bus: EventBus, timeSettings: UserSettingManager<TimeUserSettingTypes>): SetupMenuRowListItems[] {
    const simTime = ConsumerSubject.create(bus.getSubscriber<ClockEvents>().on('simTime').withPrecision(-3), 0);

    return [
      {
        type: 'title',
        label: 'Time',
        items: [
          {
            type: 'value',
            label: 'UTC',
            value: simTime.map(TimeRow.UTC_FORMATTER),
          },
          {
            type: 'textEdit',
            label: 'Local Time Offset',
            keyboardType: VirtualKeyboardType.Symbol,
            keyboardInputType: KeyboardInputType.LocalTimeOffset,
            keyboardDisableModeSwitch: true,
            value: timeSettings.getSetting('localTimeOffset'),
            format: (v) => TimeRow.TIME_OFFSET_FORMATTER(v),
            parse: (v) => {
              const sign = v[0] === '-' ? -1 : 1;
              const timeStr = v.substring(2);
              const [hours, minutes] = timeStr.split(':').map(s => parseInt(s) || 0);
              return sign * (hours * 60 + minutes);
            },
          },
          {
            type: 'state',
            label: 'Time Format',
            states: ['UTC', '12 Hr', '24 Hr'],
            currentStateIndex: timeSettings.getSetting('timeFormat'),
          },
          {
            type: 'value',
            label: 'Local Time',
            value: MappedSubject.create(
              ([utcTime, ltOffset, format]) => {
                const lcl = (isNaN(utcTime) || isNaN(ltOffset)) ? NaN : utcTime + ltOffset * 60_000;
                return format === TimeFormat.H12 ? TimeRow.LCL_FORMATTER_12(lcl) : TimeRow.LCL_FORMATTER_24(lcl);
              },
              simTime,
              timeSettings.getSetting('localTimeOffset'),
              timeSettings.getSetting('timeFormat'),
            ),
          },
        ]
      }
    ];
  }
}

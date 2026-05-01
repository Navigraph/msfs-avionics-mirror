import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * The time format.
 */
export enum TimeFormat {
  /** UTC time format. */
  UTC,
  /** 12 hour format. */
  H12,
  /** 24 hour format. */
  H24,
}

/**
 * Time user settings.
 */
export type TimeUserSettingTypes = {
  /** The selected time format. */
  timeFormat: TimeFormat
  /** The local time offset in minutes from UTC. */
  localTimeOffset: number
}

/**
 * Utility class for retrieving time user setting managers.
 */
export class TimeUserSettings {
  private static INSTANCE: UserSettingManager<TimeUserSettingTypes> | undefined;

  public static UNSAVED_SETTINGS: (keyof TimeUserSettingTypes)[] = [
    'localTimeOffset',
  ];

  /**
   * Gets an instance of the time user settings manager.
   * @param bus The event bus.
   * @returns An instance of the time user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<TimeUserSettingTypes> {
    return TimeUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'timeFormat',
        defaultValue: TimeFormat.H12,
      },
      {
        name: 'localTimeOffset',
        // The time zone offset in the sim is based on the local time,
        // i.e. where the zulu time is compared to local time, so we need to invert it
        defaultValue: SimVar.GetSimVarValue('E:TIME ZONE OFFSET', 'seconds') / 60 * -1,
      }
    ], true);
  }
}

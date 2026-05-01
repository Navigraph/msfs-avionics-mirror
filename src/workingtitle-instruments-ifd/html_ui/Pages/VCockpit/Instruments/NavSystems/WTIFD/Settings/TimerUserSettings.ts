import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * Timer user settings.
 */
export type TimerUserSettingTypes = {
  /** Custom timer 1 state. */
  customTimer1: string;
  /** Custom timer 2 state. */
  customTimer2: string;
  /** Custom timer 3 state. */
  customTimer3: string;
  /** Custom timer 4 state. */
  customTimer4: string;
  /** Custom timer 5 state. */
  customTimer5: string;
  /** Custom timer 6 state. */
  customTimer6: string;
  /** Custom timer 7 state. */
  customTimer7: string;
  /** Custom timer 8 state. */
  customTimer8: string;
  /** Custom timer 9 state. */
  customTimer9: string;
  /** Custom timer 10 state. */
  customTimer10: string;
}

/**
 * Utility class for retrieving timer user setting managers.
 */
export class TimerUserSettings {
  private static INSTANCE: UserSettingManager<TimerUserSettingTypes> | undefined;

  /**
   * Gets an instance of the timer user settings manager.
   * @param bus The event bus.
   * @returns An instance of the timer user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<TimerUserSettingTypes> {
    return TimerUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'customTimer1',
        defaultValue: '',
      },
      {
        name: 'customTimer2',
        defaultValue: '',
      },
      {
        name: 'customTimer3',
        defaultValue: '',
      },
      {
        name: 'customTimer4',
        defaultValue: '',
      },
      {
        name: 'customTimer5',
        defaultValue: '',
      },
      {
        name: 'customTimer6',
        defaultValue: '',
      },
      {
        name: 'customTimer7',
        defaultValue: '',
      },
      {
        name: 'customTimer8',
        defaultValue: '',
      },
      {
        name: 'customTimer9',
        defaultValue: '',
      },
      {
        name: 'customTimer10',
        defaultValue: '',
      },
    ], true);
  }
}

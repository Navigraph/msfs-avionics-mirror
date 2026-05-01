import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * Navigation user settings.
 */
export type NavigationUserSettingTypes = {
  /** Whether automatic GPS -> VLOC capture is enabled. Default true. */
  autoVLocCapture: boolean;
  /** Whether automatic VLOC tuning is enabled. Default true. */
  autoVLocTuning: boolean,
}

/**
 * Utility class for retrieving navigation user setting managers.
 */
export class NavigationUserSettings {
  private static INSTANCE: UserSettingManager<NavigationUserSettingTypes> | undefined;

  /**
   * Gets an instance of the traffic user settings manager.
   * @param bus The event bus.
   * @returns An instance of the traffic user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<NavigationUserSettingTypes> {
    return NavigationUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'autoVLocCapture',
        defaultValue: true,
      },
      {
        name: 'autoVLocTuning',
        defaultValue: true,
      },
    ], true);
  }
}

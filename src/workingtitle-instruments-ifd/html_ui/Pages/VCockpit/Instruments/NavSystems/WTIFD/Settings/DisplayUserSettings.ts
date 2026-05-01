import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

export enum OnOff {
  Off,
  On,
}

export enum HidePageTabsTime {
  Never,
  After2s,
  After5s,
  After10s,
  After15s,
}

/**
 * Display user settings.
 */
export type DisplayUserSettingTypes = {
  /** Whether the touch screen is enabled. */
  touchScreen: OnOff,
  /** Whether zoom mode is enabled. */
  zoomMode: OnOff,
  /** The timeout for hiding page tabs. */
  hidePageTabs: HidePageTabsTime,
}

/**
 * Utility class for retrieving display user setting managers.
 */
export class DisplayUserSettings {
  private static INSTANCE: UserSettingManager<DisplayUserSettingTypes> | undefined;

  /**
   * Converts the hide page tabs time to seconds, or 'never' if the setting is set to never.
   * @param setting The hide page tabs setting. If not provided, defaults to the current setting value.
   * @returns The hide page tabs time in seconds, or 'never'.
   */
  public static convertHidePageTabsTime(setting: HidePageTabsTime): number | 'never' {
    switch (setting) {
      case HidePageTabsTime.Never:
        return 'never';
      case HidePageTabsTime.After2s:
        return 2;
      case HidePageTabsTime.After5s:
        return 5;
      case HidePageTabsTime.After10s:
        return 10;
      case HidePageTabsTime.After15s:
        return 15;
    }
  }

  /**
   * Gets an instance of the display user settings manager.
   * @param bus The event bus.
   * @returns An instance of the display user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<DisplayUserSettingTypes> {
    return DisplayUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'touchScreen',
        defaultValue: OnOff.On,
      },
      {
        name: 'zoomMode',
        defaultValue: OnOff.Off,
      },
      {
        name: 'hidePageTabs',
        defaultValue: HidePageTabsTime.Never
      },
    ], true);
  }
}

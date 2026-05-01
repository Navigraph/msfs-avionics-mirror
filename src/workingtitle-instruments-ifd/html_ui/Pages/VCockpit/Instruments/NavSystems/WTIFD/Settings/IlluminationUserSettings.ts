import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * The possible dimming sources for each illumination type.
 * Caution: this enum must match the options in SetupMenu StateRow for "Bezel Brightness".
 */
export enum IlluminationDimmingSource {
  Photocell,
  DimmingBus,
  Manual,
}

/**
 * Illumination user settings.
 */
export type IlluminationUserSettingTypes = {
  /** The dimming source for the bezel lights, default photocell. */
  bezelDimmingSource: IlluminationDimmingSource,

  /** The manual brightness setting for the bezel lights, used when the dimming source is manual, in the range 0-100, default 80. */
  bezelManualBrightness: number,

  /** The dimming source for the display backlight, default photocell. */
  displayDimmingSource: IlluminationDimmingSource,

  /** The manual brightness setting for the display backlight, used when the dimming source is manual, in the range 0-100, default 80. */
  displayManualBrightness: number,
}

/**
 * Utility class for retrieving illumination user setting managers.
 */
export class IlluminationUserSettings {
  private static INSTANCE: UserSettingManager<IlluminationUserSettingTypes> | undefined;

  /**
   * Gets an instance of the traffic user settings manager.
   * @param bus The event bus.
   * @returns An instance of the traffic user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<IlluminationUserSettingTypes> {
    return IlluminationUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'bezelDimmingSource',
        defaultValue: IlluminationDimmingSource.Photocell
      },
      {
        name: 'bezelManualBrightness',
        defaultValue: 80
      },
      {
        name: 'displayDimmingSource',
        defaultValue: IlluminationDimmingSource.Photocell
      },
      {
        name: 'displayManualBrightness',
        defaultValue: 80
      },
    ], true);
  }
}

import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

export enum AdiHdiSettings {
  Auto = 'Auto',
  AlwaysOn = 'Always On',
}

/**
 * SVS user settings.
 */
export type SvsUserSettingTypes = {
  /** SVS field of view in degrees. Default 45. */
  svsFieldOfView: number;
  /** Whether to display horizon heading labels */
  showHorizonHeadingLabels: boolean;
  /** Whether to always display the HDI or only during approaches.  */
  showAdiHdi: AdiHdiSettings;
}

/**
 * Utility class for retrieving SVS user setting managers.
 */
export class SvsUserSettings {
  private static INSTANCE: UserSettingManager<SvsUserSettingTypes> | undefined;

  public static readonly UNSAVED_SETTINGS: (keyof SvsUserSettingTypes)[] = [
    'svsFieldOfView',
  ];

  /**
   * Gets an instance of the SVS user settings manager.
   * @param bus The event bus.
   * @returns An instance of the SVS user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<SvsUserSettingTypes> {
    return SvsUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'svsFieldOfView',
        defaultValue: 45,
      },
      {
        name: 'showHorizonHeadingLabels',
        defaultValue: true,
      },
      {
        name: 'showAdiHdi',
        defaultValue: AdiHdiSettings.Auto,
      }
    ], true);
  }
}

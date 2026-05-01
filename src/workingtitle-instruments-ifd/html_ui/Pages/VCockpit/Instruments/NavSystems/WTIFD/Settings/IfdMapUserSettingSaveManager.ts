import { EventBus, UserSettingManager, UserSettingSaveManager } from '@microsoft/msfs-sdk';
import { MapUserSettings, MapUserSettingTypes } from './MapUserSettings';

/**
 * A manager for saving IFD map user settings for the custom preset
 */
export class IfdMapUserSettingSaveManager extends UserSettingSaveManager {
  public readonly KEY: string;

  /**
   * Creates an instance of IfdUserSettingSaveManager.
   * Separate from the main save manager because this one should not use autosave - loading a preset should not
   * overwrite the custom settings.
   * After a preset is loaded, however, another manual change in the settings will trigger a save.
   * @param bus The event bus.
   * @param key The key for the map user settings.
   * @param mapSettingManager A manager for map user settings.
   */
  public constructor(
    bus: EventBus,
    key: string,
    mapSettingManager: UserSettingManager<MapUserSettingTypes>,
  ) {
    super([...mapSettingManager.getAllSettings().filter((s) => !MapUserSettings.UNSAVED_SETTINGS.some((unsaved) => s.definition.name.startsWith(unsaved)))], bus);

    this.KEY = key;
  }
}

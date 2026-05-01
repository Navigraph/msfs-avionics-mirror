import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';
import { DatablockPresetType, DefaultDatablockPresets } from '../Datablocks/DatablockPresets';
import { IfdOptions } from '../IfdOptions';

/**
 * Datablock user settings.
 */
export type DatablockUserSettingTypes = {
  /** The selected datablock preset. */
  selectedPreset: DatablockPresetType;

  /** The latest Custom Settings preset. */
  latestCustomSettings: string;
}

/**
 * Utility class for retrieving datablock user setting managers.
 */
export class DatablockUserSettings {
  private static INSTANCE: UserSettingManager<DatablockUserSettingTypes> | undefined;

  /**
   * Gets an instance of the datablock user settings manager.
   * @param bus The event bus.
   * @param options The IFD options.
   * @returns An instance of the datablock user settings manager.
   */
  public static getManager(bus: EventBus, options: IfdOptions): UserSettingManager<DatablockUserSettingTypes> {
    return DatablockUserSettings.INSTANCE ?? new DefaultUserSettingManager(bus, [
      {
        name: 'latestCustomSettings',
        defaultValue: JSON.stringify(DefaultDatablockPresets[DatablockPresetType.CustomSettings]),
      },
      {
        name: 'selectedPreset',
        defaultValue: options.defaultDatablockPreset,
      },
    ], true);
  }
}

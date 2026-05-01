import { EventBus, PropertyTypeOf, ToNonNullable, UserSettingDefinition } from '@microsoft/msfs-sdk';

import { IfdMapUserSettingSaveManager } from '../../Settings/IfdMapUserSettingSaveManager';
import {
  MapOrientationSettingMode, MapPresetType, MapUserSettings, MapUserSettingTypes,
} from '../../Settings/MapUserSettings';

/**
 * The available map presets
 */
const MapPresets: Record<MapPresetType, UserSettingDefinition<MapUserSettingTypes[keyof MapUserSettingTypes]>[]> = {
  [MapPresetType.FactorySettings]: [
    {
      name: 'mapOrientation',
      defaultValue: MapOrientationSettingMode.HeadingUp,
    },
    {
      name: 'mapCompassRose',
      defaultValue: true,
    },
    {
      name: 'mapHeadingBox',
      defaultValue: true,
    },
  ],
  [MapPresetType.IfrSettings]: [
    {
      name: 'mapOrientation',
      defaultValue: MapOrientationSettingMode.HeadingUp,
    },
    {
      name: 'mapCompassRose',
      defaultValue: true,
    },
    {
      name: 'mapHeadingBox',
      defaultValue: true,
    },
  ],
  [MapPresetType.VfrSettings]: [
    {
      name: 'mapOrientation',
      defaultValue: MapOrientationSettingMode.HeadingUp,
    },
    {
      name: 'mapCompassRose',
      defaultValue: true,
    },
    {
      name: 'mapHeadingBox',
      defaultValue: true,
    },
  ],
  [MapPresetType.CustomSettings]: [],
};

/**
 * A service for managing map preset settings.
 */
export class IfdMapPresetService {
  private readonly mapSettings = MapUserSettings.getManager(this.bus);

  /**
   * Constructor.
   * @param bus The event bus.
   * @param mapSaveManager The map save manager.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly mapSaveManager: IfdMapUserSettingSaveManager,
  ) {
    const lastPreset = this.mapSettings.getSetting('lastPresetUsed').get();
    if (lastPreset !== MapPresetType.CustomSettings) {
      this.loadPreset(lastPreset);
    }
  }

  /**
   * Load a preset into the map settings.
   * @param preset The preset to load.
   */
  public loadPreset(preset: MapPresetType): void {
    if (preset === MapPresetType.CustomSettings) {
      this.loadCustomSettings();
    } else {
      this.mapSettings.getSetting('lastPresetUsed').set(preset);
      this.mapSaveManager.save(this.mapSaveManager.KEY);
      MapPresets[preset].forEach(setting => {
        this.mapSettings.getSetting(setting.name as keyof MapUserSettingTypes).set(setting.defaultValue);
      });
    }
  }

  /**
   * Load the custom settings from the save file.
   */
  public loadCustomSettings(): void {
    this.mapSaveManager.load(this.mapSaveManager.KEY);
    this.mapSettings.getSetting('lastPresetUsed').set(MapPresetType.CustomSettings);
    this.mapSaveManager.save(this.mapSaveManager.KEY);
  }

  /**
   * Save a custom setting to the map settings.
   * @param key The key of the setting to save.
   * @param value The value of the setting to save.
   */
  public saveCustomSetting<K extends keyof MapUserSettingTypes>(
    key: K,
    value: ToNonNullable<PropertyTypeOf<MapUserSettingTypes, K>>
  ): void {
    this.mapSettings.getSetting(key).set(value);
    this.mapSettings.getSetting('lastPresetUsed').set(MapPresetType.CustomSettings);
    this.mapSaveManager.save(this.mapSaveManager.KEY);
  }
}

import { ComSpacing, DefaultUserSettingManager, EventBus, UserSettingDefinition, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * COM radio user settings.
 */
export type ComRadioAliasedUserSettingTypes = {
  /** The COM radio spacing (25 or 8.33 kHz) */
  comSpacing: ComSpacing;
  /** The preset frequency setting. */
  presetFrequency: number;
  /** The last selected COM preset frequency. */
  lastSelectedPresetIndex: number;
}

/** Non-indexed COM radio user settings. */
export type ComRadioNonIndexedUserSettingTypes = Pick<ComRadioAliasedUserSettingTypes, 'comSpacing' | 'lastSelectedPresetIndex'>;

/** Aliased indexed COM radio user settings. */
export type ComRadioAliasedIndexedUserSettingTypes = Pick<ComRadioAliasedUserSettingTypes, 'presetFrequency'>;

/** True indexed COM radio user setting for an index setting. */
export type ComRadioIndexedUserSettingTypes<Index extends number> = {
  [Name in keyof ComRadioAliasedIndexedUserSettingTypes as `${Name}_${Index}`]: ComRadioAliasedIndexedUserSettingTypes[Name];
}

/** All COM radio user settings. */
export type ComRadioUserSettingTypes = ComRadioNonIndexedUserSettingTypes &  ComRadioIndexedUserSettingTypes<number>;

/**
 * Utility class for retrieving COM radio user setting managers.
 */
export class ComRadioUserSettings {
  private static INSTANCE: UserSettingManager<ComRadioUserSettingTypes> | undefined;

  public static UNSAVED_SETTINGS: (keyof ComRadioUserSettingTypes)[] = [
    'lastSelectedPresetIndex'
  ];

  /**
   * Gets an instance of the COM radio user settings manager.
   * @param bus The event bus.
   * @returns An instance of the COM radio user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<ComRadioUserSettingTypes> {
    if (ComRadioUserSettings.INSTANCE) {
      return ComRadioUserSettings.INSTANCE;
    }

    const settingDefs: UserSettingDefinition<any>[] = [];
    settingDefs.push(...ComRadioUserSettings.getNonIndexedSettingDefs());
    for (let i = 1; i <= 16; i++) {
      settingDefs.push(...ComRadioUserSettings.getIndexedSettingDefs(i));
    }

    ComRadioUserSettings.INSTANCE = new DefaultUserSettingManager(bus, settingDefs, true);

    return ComRadioUserSettings.INSTANCE;
  }

  /**
   * Gets an array of definitions for true COM radio settings for a single GDU.
   * @param index The index of the PFD.
   * @returns An array of definitions for true COM radio settings for the specified GDU.
   */
  private static getIndexedSettingDefs(
    index: number
  ): readonly UserSettingDefinition<ComRadioIndexedUserSettingTypes<number>[keyof ComRadioIndexedUserSettingTypes<number>]>[] {
    const values = ComRadioUserSettings.getIndexedDefaultValues();
    return Object.keys(values).map(name => {
      return {
        name: `${name}_${index}`,
        defaultValue: values[name as keyof typeof values]
      };
    });
  }

  /**
   * Gets an array of definitions for non-indexed COM radio settings.
   * @returns An array of definitions for non-indexed COM radio settings.
   */
  private static getNonIndexedSettingDefs(
  ): readonly UserSettingDefinition<ComRadioNonIndexedUserSettingTypes[keyof ComRadioNonIndexedUserSettingTypes]>[] {
    const values = ComRadioUserSettings.getNonIndexedDefaultValues();
    return Object.keys(values).map(name => {
      return {
        name,
        defaultValue: values[name as keyof typeof values]
      };
    });
  }

  /**
   * Gets the non-indexed default values for all non-indexed COM radio settings.
   * @returns The non-indexed default values for all non-indexed COM radio settings.
   */
  private static getNonIndexedDefaultValues(): ComRadioNonIndexedUserSettingTypes {
    return {
      comSpacing: ComSpacing.Spacing25Khz, // Factory default
      lastSelectedPresetIndex: 0,
    };
  }

  /**
   * Gets the indexed default values for all indexed COM radio settings.
   * @returns The indexed default values for all indexed COM radio settings.
   */
  private static getIndexedDefaultValues(): ComRadioAliasedIndexedUserSettingTypes {
    return {
      presetFrequency: 0,
    };
  }
}

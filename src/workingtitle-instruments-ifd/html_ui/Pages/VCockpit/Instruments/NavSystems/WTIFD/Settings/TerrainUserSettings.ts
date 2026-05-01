import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * Terrain user settings.
 */
export type TerrainUserSettingTypes = {
  /** Whether the forward-looking terrain awareness function is enabled. */
  fltaEnabled: boolean;
  /** Whether the terrain awareness function is enabled are enabled. */
  terrainAwarenessEnabled: boolean;
  /** Whether to use "Terrain Ahead" rather than the standard "Caution Terrain". */
  terrainCautionAlternateAural: boolean;
  /** Whether to use "Terrain Terrain Pull Up Pull Up" rather than the standard "Terrain Pull Up Terrain Pull Up". */
  terrainWarningAlternateAural: boolean;
  /** Whether FLTA exclusion areas around airports are enabled. */
  fltaExclusionAreas: boolean;
}

/**
 * Utility class for retrieving terrain user setting managers.
 */
export class TerrainUserSettings {
  private static INSTANCE: UserSettingManager<TerrainUserSettingTypes> | undefined;

  /**
   * Gets an instance of the terrain user settings manager.
   * @param bus The event bus.
   * @returns An instance of the terrain user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<TerrainUserSettingTypes> {
    return TerrainUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'fltaEnabled',
        defaultValue: true,
      },
      {
        name: 'terrainAwarenessEnabled',
        defaultValue: true,
      },
      {
        name: 'terrainCautionAlternateAural',
        defaultValue: false,
      },
      {
        name: 'terrainWarningAlternateAural',
        defaultValue: false,
      },
      {
        name: 'fltaExclusionAreas',
        defaultValue: true,
      }
    ], true);
  }
}

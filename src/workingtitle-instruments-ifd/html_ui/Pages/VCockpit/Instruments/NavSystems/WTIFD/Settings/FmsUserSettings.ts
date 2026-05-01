import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * Fms user settings.
 */
export type FmsUserSettingTypes = {
  /**
   * The transition altitude in feet.
   * This is automatically set based on manualTransitionAltitude, destination airport, or default 18000.
   */
  transitionAltitude: number;
  /** The manually set transition altitude in feet. Default -1 (unset). */
  manualTransitionAltitude: number;
  /** The visual display format of the FPL blocks */
  miniFlightPlanFormat: boolean;
  /** The transition level in feet. This is automatically set based on manualTransitionLevel, destination airport, or default 18000. */
  transitionLevel: number;
  /** The transition level in feet. Default -1 (unset). */
  manualTransitionLevel: number;
  /** Whether visual approaches are enabled. Default true. */
  visualApproaches: boolean;
  /** The final leg length for visual approaches. Default 1.0 NM. */
  visualApproachFinalLength: number,
  /** The pattern width for visual approaches. Default 1.0 NM. */
  visualApproachPatternWidth: number,
  /** The glide path angle for visual approaches. Default 4.0°. */
  visualGlideslope: number,
}

/**
 * Utility class for retrieving Fms user setting managers.
 */
export class FmsUserSettings {
  private static INSTANCE: UserSettingManager<FmsUserSettingTypes> | undefined;

  public static readonly UNSAVED_SETTINGS: (keyof FmsUserSettingTypes)[] = [
    'transitionAltitude',
    'transitionLevel',
  ];

  /**
   * Gets an instance of the FMS user settings manager.
   * @param bus The event bus.
   * @returns An instance of the traffic user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<FmsUserSettingTypes> {
    return FmsUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'transitionAltitude',
        defaultValue: 18000,
      },
      {
        name: 'manualTransitionAltitude',
        defaultValue: -1,
      },
      {
        name: 'transitionLevel',
        defaultValue: 18000,
      },
      {
        name: 'manualTransitionLevel',
        defaultValue: -1,
      },
      {
        name: 'miniFlightPlanFormat',
        defaultValue: false,
      },
      {
        name: 'visualApproaches',
        defaultValue: true,
      },
      {
        name: 'visualApproachFinalLength',
        defaultValue: 1,
      },
      {
        name: 'visualApproachPatternWidth',
        defaultValue: 1,
      },
      {
        name: 'visualGlideslope',
        defaultValue: 4,
      }
    ], true);
  }
}

import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

/**
 * Alert user settings.
 */
export type AlertUserSettingTypes = {
  /** Whether the airspace ahead aural is enabled. */
  airspaceAural: boolean;
  /** Whether altitude callouts are enabled. */
  altitudeCallouts: boolean;
  /** Whether controlled airspace alerts are enabled. */
  controlledAirspaceAlerts: boolean;
  /** The time in minutes between switch tanks alerts, or 0 for none. */
  switchTanksAlert: 0 | 15 | 30 | 45 | 60;
  /** Whether the top of descent chime is enabled. */
  topOfDescentChime: boolean;
  /** Whether transition altitude/level alerts are enabled. */
  transitionAltitudeLevelAlerts: boolean;
  /** Whether the waypoint aural alerts are enabled. */
  waypointAurals: boolean;
}

/**
 * Utility class for retrieving Alert user setting managers.
 */
export class AlertUserSettings {
  private static INSTANCE: UserSettingManager<AlertUserSettingTypes> | undefined;

  /**
   * Gets an instance of the alert user settings manager.
   * @param bus The event bus.
   * @returns An instance of the traffic user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<AlertUserSettingTypes> {
    return AlertUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'airspaceAural',
        defaultValue: false,
      },
      {
        name: 'altitudeCallouts',
        defaultValue: false,
      },
      {
        name: 'controlledAirspaceAlerts',
        defaultValue: true,
      },
      {
        name: 'switchTanksAlert',
        defaultValue: 0,
      },
      {
        name: 'topOfDescentChime',
        defaultValue: false,
      },
      {
        name: 'transitionAltitudeLevelAlerts',
        defaultValue: false,
      },
      {
        name: 'waypointAurals',
        defaultValue: false,
      }
    ], true);
  }
}

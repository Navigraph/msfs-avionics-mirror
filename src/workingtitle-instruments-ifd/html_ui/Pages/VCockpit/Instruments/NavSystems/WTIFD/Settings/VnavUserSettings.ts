import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

export enum VnavPathBasis {
  DescentAngle,
  DescentRate,
}

/**
 * Vnav user settings.
 */
export type VnavUserSettingTypes = {
  /** The type of target used to calculate VNAV descents, default DescentAngle. */
  vnavPathBasis: VnavPathBasis;
  /** The descent angle to use in degrees (positive = descent) when the path basis is angle. */
  vnavDescentAngle: number,
  /** The descent rate to use in FPM (positive = descent) when the path basis is rate. */
  vnavDescentRate: number,
}

/**
 * Utility class for retrieving Vnav user setting managers.
 */
export class VnavUserSettings {
  private static INSTANCE: UserSettingManager<VnavUserSettingTypes> | undefined;

  /**
   * Gets an instance of the traffic user settings manager.
   * @param bus The event bus.
   * @returns An instance of the traffic user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<VnavUserSettingTypes> {
    return VnavUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'vnavPathBasis',
        defaultValue: VnavPathBasis.DescentAngle,
      },
      {
        name: 'vnavDescentAngle',
        defaultValue: 4,
      },
      {
        name: 'vnavDescentRate',
        defaultValue: 750,
      },
    ], true);
  }
}

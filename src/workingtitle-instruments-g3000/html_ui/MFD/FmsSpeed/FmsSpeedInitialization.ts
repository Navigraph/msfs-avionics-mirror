import { FmsSpeedClimbSchedule, FmsSpeedCruiseSchedule, FmsSpeedDescentSchedule, FmsSpeedUserSettingManager } from '@microsoft/msfs-wtg3000-common';

/**
 * A class that performs initialization tasks related to FMS speeds.
 * @internal
 */
export class FmsSpeedInitialization {
  /**
   * Initializes FMS speed schedule user settings, ensuring that valid speed schedules are selected and that the
   * selected FMS speeds are consistent with the selected schedules.
   * @param fmsSpeedsSettingManager A manager for FMS speed user settings containing the settings to initialize.
   */
  public static init(fmsSpeedsSettingManager: FmsSpeedUserSettingManager): void {
    FmsSpeedInitialization.initClimbSchedule(fmsSpeedsSettingManager);
    FmsSpeedInitialization.initCruiseSchedule(fmsSpeedsSettingManager);
    FmsSpeedInitialization.initDescentSchedule(fmsSpeedsSettingManager);
  }

  /**
   * Initializes climb speed schedule user settings, ensuring that a valid climb schedule is selected and the
   * `fmsSpeedClimbIas` and `fmsSpeedClimbMach` user settings are consistent with the selected schedule.
   * @param fmsSpeedsSettingManager A manager for FMS speed user settings containing the settings to initialize.
   */
  private static initClimbSchedule(fmsSpeedsSettingManager: FmsSpeedUserSettingManager): void {
    const climbScheduleIndex = fmsSpeedsSettingManager.getSetting('fmsSpeedClimbScheduleIndex').get();

    // Index 0 is the fallback schedule that is used when no default schedule exists and the user has not selected a
    // schedule yet. In this case, the climb speeds are already set to their fallback values and don't need to be
    // initialized from a schedule.
    if (climbScheduleIndex <= 0) {
      return;
    }

    // The last climb schedule is the pilot-defined schedule. In this case we will set the climb speeds to the
    // pilot-defined values.
    if (climbScheduleIndex === fmsSpeedsSettingManager.climbSchedules.length - 1) {
      fmsSpeedsSettingManager.getSetting('fmsSpeedClimbIas').set(fmsSpeedsSettingManager.getSetting('fmsSpeedPilotClimbIas').get());
      fmsSpeedsSettingManager.getSetting('fmsSpeedClimbMach').set(fmsSpeedsSettingManager.getSetting('fmsSpeedPilotClimbMach').get());
      return;
    }

    let climbSchedule = fmsSpeedsSettingManager.climbSchedules[climbScheduleIndex] as Readonly<FmsSpeedClimbSchedule> | undefined;

    if (!climbSchedule) {
      // We could not find the selected climb schedule. Either the climb schedule index user setting was incorrectly
      // set or the climb schedule configuration changed since the last time the index was set. In this case we will
      // attempt to set the selected climb schedule back to the default, if one exists. If a default schedule does
      // not exist, then we will set the selected schedule to the fallback one.

      const defaultClimbScheduleIndex = fmsSpeedsSettingManager.climbSchedules.findIndex(schedule => schedule.isDefault);
      if (defaultClimbScheduleIndex >= 0) {
        climbSchedule = fmsSpeedsSettingManager.climbSchedules[defaultClimbScheduleIndex];
        fmsSpeedsSettingManager.getSetting('fmsSpeedClimbScheduleIndex').set(defaultClimbScheduleIndex);
      } else {
        climbSchedule = fmsSpeedsSettingManager.climbSchedules[0];
        fmsSpeedsSettingManager.getSetting('fmsSpeedClimbScheduleIndex').set(0);
      }
    }

    fmsSpeedsSettingManager.getSetting('fmsSpeedClimbIas').set(climbSchedule.ias);
    fmsSpeedsSettingManager.getSetting('fmsSpeedClimbMach').set(climbSchedule.mach);
  }

  /**
   * Initializes cruise speed schedule user settings, ensuring that a valid cruise schedule is selected and the
   * `fmsSpeedCruiseIas` and `fmsSpeedCruiseMach` user settings are consistent with the selected schedule.
   * @param fmsSpeedsSettingManager A manager for FMS speed user settings containing the settings to initialize.
   */
  private static initCruiseSchedule(fmsSpeedsSettingManager: FmsSpeedUserSettingManager): void {
    const cruiseScheduleIndex = fmsSpeedsSettingManager.getSetting('fmsSpeedCruiseScheduleIndex').get();

    // Index 0 is the fallback schedule that is used when no default schedule exists and the user has not selected a
    // schedule yet. In this case, the cruise speeds are already set to their fallback values and don't need to be
    // initialized from a schedule.
    if (cruiseScheduleIndex <= 0) {
      return;
    }

    // The last cruise schedule is the pilot-defined schedule. In this case we will set the cruise speeds to the
    // pilot-defined values.
    if (cruiseScheduleIndex === fmsSpeedsSettingManager.cruiseSchedules.length - 1) {
      fmsSpeedsSettingManager.getSetting('fmsSpeedCruiseIas').set(fmsSpeedsSettingManager.getSetting('fmsSpeedPilotCruiseIas').get());
      fmsSpeedsSettingManager.getSetting('fmsSpeedCruiseMach').set(fmsSpeedsSettingManager.getSetting('fmsSpeedPilotCruiseMach').get());
      return;
    }

    let cruiseSchedule = fmsSpeedsSettingManager.cruiseSchedules[cruiseScheduleIndex] as Readonly<FmsSpeedCruiseSchedule> | undefined;

    if (!cruiseSchedule) {
      // We could not find the selected cruise schedule. Either the cruise schedule index user setting was incorrectly
      // set or the cruise schedule configuration changed since the last time the index was set. In this case we will
      // attempt to set the selected cruise schedule back to the default, if one exists. If a default schedule does
      // not exist, then we will set the selected schedule to the fallback one.

      const defaultCruiseScheduleIndex = fmsSpeedsSettingManager.cruiseSchedules.findIndex(schedule => schedule.isDefault);
      if (defaultCruiseScheduleIndex >= 0) {
        cruiseSchedule = fmsSpeedsSettingManager.cruiseSchedules[defaultCruiseScheduleIndex];
        fmsSpeedsSettingManager.getSetting('fmsSpeedCruiseScheduleIndex').set(defaultCruiseScheduleIndex);
      } else {
        cruiseSchedule = fmsSpeedsSettingManager.cruiseSchedules[0];
        fmsSpeedsSettingManager.getSetting('fmsSpeedCruiseScheduleIndex').set(0);
      }
    }

    fmsSpeedsSettingManager.getSetting('fmsSpeedCruiseIas').set(cruiseSchedule.ias);
    fmsSpeedsSettingManager.getSetting('fmsSpeedCruiseMach').set(cruiseSchedule.mach);
  }

  /**
   * Initializes descent speed schedule user settings, ensuring that a valid descent schedule is selected and the
   * `fmsSpeedDescentIas`, `fmsSpeedDescentMach`, and `fmsSpeedDescentFpa` user settings are consistent with the
   * selected schedule.
   * @param fmsSpeedsSettingManager A manager for FMS speed user settings containing the settings to initialize.
   */
  private static initDescentSchedule(fmsSpeedsSettingManager: FmsSpeedUserSettingManager): void {
    const descentScheduleIndex = fmsSpeedsSettingManager.getSetting('fmsSpeedDescentScheduleIndex').get();

    // Index 0 is the fallback schedule that is used when no default schedule exists and the user has not selected a
    // schedule yet. In this case, the climb speeds are already set to their fallback values and don't need to be
    // initialized from a schedule.
    if (descentScheduleIndex <= 0) {
      return;
    }

    // The last descent schedule is the pilot-defined schedule. In this case we will set the descent speeds to the
    // pilot-defined values.
    if (descentScheduleIndex === fmsSpeedsSettingManager.descentSchedules.length - 1) {
      fmsSpeedsSettingManager.getSetting('fmsSpeedDescentIas').set(fmsSpeedsSettingManager.getSetting('fmsSpeedPilotDescentIas').get());
      fmsSpeedsSettingManager.getSetting('fmsSpeedDescentMach').set(fmsSpeedsSettingManager.getSetting('fmsSpeedPilotDescentMach').get());
      fmsSpeedsSettingManager.getSetting('fmsSpeedDescentFpa').set(fmsSpeedsSettingManager.getSetting('fmsSpeedPilotDescentFpa').get());
      return;
    }

    let descentSchedule = fmsSpeedsSettingManager.descentSchedules[descentScheduleIndex] as Readonly<FmsSpeedDescentSchedule> | undefined;

    if (!descentSchedule) {
      // We could not find the selected descent schedule. Either the descent schedule index user setting was
      // incorrectly set or the descent schedule configuration changed since the last time the index was set. In this
      // case we will attempt to set the selected descent schedule back to the default, if one exists. If a default
      // schedule does not exist, then we will set the selected schedule to the fallback one.

      const defaultDescentScheduleIndex = fmsSpeedsSettingManager.descentSchedules.findIndex(schedule => schedule.isDefault);
      if (defaultDescentScheduleIndex >= 0) {
        descentSchedule = fmsSpeedsSettingManager.descentSchedules[defaultDescentScheduleIndex];
        fmsSpeedsSettingManager.getSetting('fmsSpeedDescentScheduleIndex').set(defaultDescentScheduleIndex);
      } else {
        descentSchedule = fmsSpeedsSettingManager.descentSchedules[0];
        fmsSpeedsSettingManager.getSetting('fmsSpeedDescentScheduleIndex').set(0);
      }
    }

    fmsSpeedsSettingManager.getSetting('fmsSpeedDescentIas').set(descentSchedule.ias);
    fmsSpeedsSettingManager.getSetting('fmsSpeedDescentMach').set(descentSchedule.mach);
    fmsSpeedsSettingManager.getSetting('fmsSpeedDescentFpa').set(descentSchedule.fpa);
  }
}

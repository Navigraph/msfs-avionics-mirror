import { APGpsSteerDirectorState, APLateralModes, APValues, NavSourceType } from '@microsoft/msfs-sdk';

/** Utilities used by the IFD autopilot. */
export class IfdAPUtils {
  /**
   * Checks whether a GPSS director can be activated from an armed state.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @param state State provided by the director for use in determing whether the director can be activated.
   * @returns Whether the director can be activated from an armed state.
   */
  public static gpssCanActivate(apValues: APValues, state: Readonly<APGpsSteerDirectorState>): boolean {
    return state.rollSteerCommand !== null
      && state.rollSteerCommand.isValid
      && Math.abs(state.rollSteerCommand.tae) < 110
      && (state.rollSteerCommand.isHeading || Math.abs(state.rollSteerCommand.xtk) < 0.6);
  }

  /**
   * Checks whether a glidepath director can be armed.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @returns Whether the director can be armed.
   */
  public static glidepathCanArm(apValues: APValues): boolean {
    return apValues.cdiSource.get().type === NavSourceType.Gps
      && (
        apValues.lateralActive.get() === APLateralModes.GPSS
        || apValues.lateralArmed.get() === APLateralModes.GPSS
      );
  }
}

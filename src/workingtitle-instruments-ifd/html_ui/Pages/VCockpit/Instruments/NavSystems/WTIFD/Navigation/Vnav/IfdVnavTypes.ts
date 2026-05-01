/** VDI full-scale value in feet. */
export const IfdVerticalDeviationScale = 200;

/**
 * Glidepath service levels.
 */
export enum GlidepathServiceLevel {
  /** No glidepath. */
  None,

  /** Visual. */
  Visual,

  /** Visual with baro-VNAV. */
  VisualBaro,

  /** LNAV+V. */
  LNavPlusV,

  /** LNAV+V with baro-VNAV. */
  LNavPlusVBaro,

  /** LNAV/VNAV. */
  LNavVNav,

  /** LNAV/VNAV with baro-VNAV. */
  LNavVNavBaro,

  /** LP+V. */
  LpPlusV,

  /** LPV. */
  Lpv,

  /** RNP. */
  Rnp,

  /** RNP with baro-VNAV. */
  RnpBaro,
}

/**
 * Glidepath guidance issued by VNAV.
 */
export type IFdVNavGlidepathGuidance = {
  /** Whether the currently loaded approach has glidepath guidance. */
  approachHasGlidepath: boolean;

  /** Whether this guidance is valid. */
  isValid: boolean;

  /** Whether the glidepath can be captured from an armed state. */
  canCapture: boolean;

  /** The flight path angle of the glidepath, in degrees. Positive angles indicate a downward-sloping path. */
  fpa: number;

  /**
   * The deviation of the glidepath from the airplane, in feet. Positive values indicate the path lies above the
   * airplane.
   */
  deviation: number;
};

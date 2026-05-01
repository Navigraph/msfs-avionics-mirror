import { ReadonlyFloat64Array, Vec2Math } from '@microsoft/msfs-sdk';

import { GnssNavigationMode } from './GnssTypes';
import { PositionMath, UncertaintyEllipse } from './PositionMath';
import { RandomUtils } from './RandomUtils';

/**
 * A model for computing GNSS position and altitude uncertainty estimates (HFOM/VFOM, HUL/VUL and HPL/VPL) and error. The uncertainties
 * are computed based on the (unscaled) covariance matrix of a GNSS solution, normally returned from a `GPSSatComputer`.
 *
 * **Position uncertainty** is modelled as a bivariate (2D) Gaussian distribution whose covariance matrix is the top-left 2x2 submatrix of
 * the unscaled covariance matrix scaled by the pseudorange error, which is assumed to be independent and identically-distributed
 * (i.i.d.) Gaussian noise for all satellites. This model is valid when ordinary least squares (OLS) is used for position estimation.
 *
 * **Velocity uncertainty** is modelled as a bivariate (2D) Gaussian distribution whose covariance matrix is the top-left 2x2 submatrix of
 * the unscaled covariance matrix scaled by the pseudorange rate of change error, which is assumed to be independent and
 * identically-distributed (i.i.d.) Gaussian noise for all satellites. This model assumes that Doppler shift measurements are used for
 * estimating velocity.
 *
 * **Altitude uncertainity** is modelled as a univariate Gaussian distribution whose variance is the value in the 3rd row and 3rd column of
 * the covariance matrix (VDOP) scaled by the pseudorange error, which is assumed to be independent and identically-distributed (i.i.d.)
 * Gaussian noise for all satellites.
 *
 * Position, velocity and altitude error are determined by sampling from these distributions, assuming a 0 mean.
 */
export class GnssErrorModel {
  /**
   * The User Equivalent Range Error (UERE) for GNSS without SBAS corrections, in meters (68% or 1σ value).
   *
   * Computed from the URE (User Range Error) and UEE (User Equipment Error) values: UERE = √(URE² + UEE²)
   *
   * Source: GPS SPS Performance Standard, 5th ed., appendix B.2.3.2 (https://www.gps.gov/sites/default/files/2025-07/2020-SPS-performance-standard.pdf).
   */
  private static readonly UERE_GNSS = Math.hypot(9.7, 4.5) / 1.96;

  /**
   * The User Equivalent Range Error (UERE) for GNSS with SBAS corrections, in meters (68% or 1σ value).
   *
   * Source: The value was guesstimated from EGNOS performance maps (https://egnos.gsc-europa.eu/services/safety-of-life-service/historical-performance/protection-level),
   * as this is a massive simplification of how the real system works.
   */
  private static readonly UERE_SBAS = 1.5;

  /**
   * The User Equivalent Range Rate Error (UERRE) for GNSS, in meters per second (68% or 1σ value). This value represents the expected
   * error (to be scaled by DOP) of the error in the measured rate of change of satellite pseudoranges. When using Doppler-based velocity
   * estimation, velocity estimation error is linked to this value.
   *
   * Source: The value was guesstimated based on various sources, including a URRE accuracy standard of 0.006 m/s from the GPS SPS
   * Performance Standard, 5th ed., section 3.4.2 (https://www.gps.gov/sites/default/files/2025-07/2020-SPS-performance-standard.pdf). The
   * URRE value neglects atmospheric and receiver errors, so a margin was added on top of it to account for those.
   */
  private static readonly UERRE = 0.1;

  /**
   * The enroute HPL protection factor from ICAO Annex 10 Vol. I, 7th edition, 3.5.5.6.1 (labelled K_{H,NPA} in the Annex).
   */
  private static readonly HPL_PROTECTION_FACTOR_ENROUTE = 6.18;

  /**
   * The approach HPL protection factor from ICAO Annex 10 Vol. I, 7th edition, 3.5.5.6.1 (labelled K_{H,PA} in the Annex).
   */
  private static readonly HPL_PROTECTION_FACTOR_APPROACH = 6;

  /**
   * The enroute VPL protection factor from ICAO Annex 10 Vol. I, 7th edition, 3.5.5.6.1 (labelled K_V in the Annex).
   */
  private static readonly VPL_PROTECTION_FACTOR = 5.33;

  private uncertainties: GnssUncertainties = {
    vdop: NaN,
    hfom: NaN,
    vfom: NaN,
    hul: NaN,
    vul: NaN,
    hpl: NaN,
    vpl: NaN,
    uncertaintyEllipse: { majorAxis: Vec2Math.create(NaN, NaN), minorAxis: Vec2Math.create(NaN, NaN) },
    rangeError: NaN,
    rangeRateError: NaN,
  };

  /**
   * Generates a position error sample (x, y), in meters. The x-axis of the error sample points towards true north, and the y-axis points
   * towards the east.
   *
   * NOTE: `GnssErrorModel::update` must be called before calling this method.
   * @param out The array to write the position error sample into. The length of the array must be at least 2.
   * @returns A 2-element vector representing the position error, in meters.
   */
  public samplePositionError(out: Float64Array): Float64Array {
    // NOTE: Scaling the uncertainty ellipse by range error is equivalent to scaling the unscaled covariance matrix (obtained from
    //       GPSComputer) by range error squared before computing the ellipse.
    out = RandomUtils.sampleUncertaintyEllipse(this.uncertainties.uncertaintyEllipse, out, this.uncertainties.rangeError);
    return out;
  }

  /**
   * Generates a velocity error sample (x, y, z), in meters, under the assumption that Doppler shift was used for velocity estimation. The
   * x-axis of the error sample points towards true north, the y-axis points towards the east, and the z-axis points upwards.
   *
   * NOTE: `GnssErrorModel::update` must be called before calling this method.
   * @param out The array to write the velocity error sample into. The length of the array must be at least 3.
   * @returns A 3-element vector representing the velocity error, in meters per second.
   */
  public sampleVelocityError(out: Float64Array): Float64Array {
    // NOTE: Scaling the uncertainty ellipse by range rate error is equivalent to scaling the unscaled covariance matrix (obtained from
    //       GPSComputer) by range rate error squared before computing the ellipse.
    out = RandomUtils.sampleUncertaintyEllipse(this.uncertainties.uncertaintyEllipse, out, this.uncertainties.rangeRateError);
    out[2] = RandomUtils.sampleNormal(0, this.uncertainties.rangeRateError * this.uncertainties.vdop)[0];
    return out;
  }

  /**
   * Generates an altitude error sample based on the current vertical uncertainty and range error. `GnssErrorModel::update` must be called
   * before calling this method.
   * @returns The altitude error, in meters.
   */
  public sampleAltitudeError(): number {
    const [error] = RandomUtils.sampleNormal(0, 0.5 * this.uncertainties.rangeError * this.uncertainties.vdop);
    return error;
  }

  /**
   * Computes the uncertainties of a GNSS solution (HFOM/VFOM, HUL/VUL and HPL/VPL) based on its covariance matrix, range error and SBAS
   * navigation specification and updates this error model with the computed values. This does _not_ take into account real-world
   * limitations, such as HPL/VPL only being available when SBAS or FDE/RAIM are available and in use.
   * @param covarMatrix The 4x4 covariance matrix of the GNSS solution, respresented as a 16-element vector in row-major order.
   * @param sbasNavSpec The SBAS navigation specification in use, or undefined if SBAS is not in use.
   * @returns The computed uncertainties.
   */
  public update(covarMatrix: ReadonlyFloat64Array, sbasNavSpec: GnssNavigationMode | undefined): Readonly<GnssUncertainties> {
    this.uncertainties = GnssErrorModel.computeUncertainties(covarMatrix, sbasNavSpec, this.uncertainties);

    return this.uncertainties;
  }

  /**
   * Computes the uncertainties of a GNSS solution (HFOM/VFOM, HUL/VUL and HPL/VPL) based on its covariance matrix, range error and SBAS
   * navigation specification. This does _not_ take into account real-world limitations, such as HPL/VPL only being available when SBAS or
   * FDE/RAIM are available and in use.
   * @param covarMatrix The 4x4 covariance matrix of the GNSS solution, respresented as a 16-element vector in row-major order.
   * @param sbasNavSpec The SBAS navigation specification, or undefined if SBAS is not in use. Used to determine the protection factor
   * for HPL computation.
   * @param out The object to write the computed uncertainties into.
   * @returns The computed uncertainties.
   */
  public static computeUncertainties(covarMatrix: ReadonlyFloat64Array, sbasNavSpec: GnssNavigationMode | undefined, out: GnssUncertainties): GnssUncertainties {
    out.uncertaintyEllipse = PositionMath.computeUncertaintyEllipse(covarMatrix, out.uncertaintyEllipse);

    const semiMajorAxisLength = Vec2Math.abs(out.uncertaintyEllipse.majorAxis);
    const vdop = Math.sqrt(covarMatrix[2 * 4 + 2]);
    const rangeError = sbasNavSpec === undefined ? GnssErrorModel.UERE_GNSS : GnssErrorModel.UERE_SBAS;

    // Compute the HFOM and VFOM (95%).
    // The constant comes from Q(0.95) ~= 2.448, where Q is the quantile function of the Rayleigh distribution.
    const hfom = rangeError * 2.448 * semiMajorAxisLength;
    const vfom = rangeError * 2 * vdop; // 2-sigma

    // Compute the HUL and VUL (99.9%).
    // The constant comes from Q(0.999) ~= 3.717, where Q is the quantile function of the Rayleigh distribution.
    const hul = rangeError * 3.717 * semiMajorAxisLength;
    const vul = rangeError * 4 * vdop; // 4-sigma

    // Compute the HPL based on the formulas from ICAO Annex 10 Vol. I, 7th edition, 3.5.5.6.
    // NOTE: In real life systems, the HPL is computed differently when SBAS is not in use (using RAIM/FDE), but for simplicity we
    //       will use the same method in both cases.
    // NOTE: In the Annex, the protection factor is labelled K_H and the semi-major axis length is labelled d_major.
    const protectionFactor =
      (sbasNavSpec === undefined || sbasNavSpec === GnssNavigationMode.Enroute)
        ? GnssErrorModel.HPL_PROTECTION_FACTOR_ENROUTE
        : GnssErrorModel.HPL_PROTECTION_FACTOR_APPROACH;
    const hpl = protectionFactor * rangeError * semiMajorAxisLength;

    // Compute the VPL based on the formula from ICAO Annex 10 Vol. I, 7th edition, 3.5.5.6.
    // NOTE: In real life systems, the VPL is computed differently when SBAS is not in use (using RAIM/FDE), but for simplicity we
    //       will use the same method in both cases.
    // NOTE: In the Annex, the protection factor is labelled K_{V,PA} and the standard deviation is labelled d_V.
    const vpl = GnssErrorModel.VPL_PROTECTION_FACTOR * rangeError * vdop;

    out.vdop = vdop;
    out.hfom = hfom;
    out.vfom = vfom;
    out.hul = hul;
    out.vul = vul;
    out.hpl = hpl;
    out.vpl = vpl;
    out.rangeError = rangeError;
    out.rangeRateError = GnssErrorModel.UERRE;
    return out;
  }

  /**
   * Resets the error model to its initial state.
   */
  public reset(): void {
    this.uncertainties = {
      vdop: NaN,
      hfom: NaN,
      vfom: NaN,
      hul: NaN,
      vul: NaN,
      hpl: NaN,
      vpl: NaN,
      uncertaintyEllipse: { majorAxis: Vec2Math.create(NaN, NaN), minorAxis: Vec2Math.create(NaN, NaN) },
      rangeError: NaN,
      rangeRateError: NaN,
    };
  }
}

/**
 * The uncertainties of a GNSS solution, including HFOM/VFOM, HUL/VUL and HPL/VPL, as well as the raw uncertainty ellipse.
 */
export interface GnssUncertainties {
  /** The Vertical Dilution of Precision (VDOP), dimensionless. */
  vdop: number;

  /**
   * The Horizontal Figure of Merit (HFOM), which is the radius of a circle which contains the true position with
   * at least 95% certainty, in meters.
   */
  hfom: number;

  /**
   * The Vertical Figure of Merit (VFOM), which is the length of a line segment which contains the true altitude with
   * at least 95% certainty, in meters.
   */
  vfom: number;

  /**
   * The Horizontal Uncertainty Level (HUL), which is the radius of a circle which contains the true position with
   * at least 99.9% certainty, in meters.
   */
  hul: number;

  /**
   * The Vertical Uncertainty Level (VUL), which is the length of a line segment which contains the true altitude with
   * at least 99.9% certainty, in meters.
   */
  vul: number;

  /**
   * The Horizontal Protection Level (HPL), which is the radius of a circle which is assured to contain the true position with
   * a very high degree of certainty, in meters.
   */
  hpl: number;

  /**
   * The Vertical Protection Level (VPL), which is the length of a line segment which is assured to contain the true altitude with
   * a very high degree of certainty, in meters.
   */
  vpl: number;

  /**
   * The 1σ uncertainty ellipse derived from the satellite geometry (DOP), dimensionless. Needs to be scaled by the range or range rate
   * error in order to get the actual position or velocity uncertainty.
   */
  uncertaintyEllipse: UncertaintyEllipse;

  /** The pseudorange error, in meters, expressed as the User Effective Range Error (UERE). This is the 1σ (68%) value. */
  rangeError: number;

  /**
   * The pseudorange rate of change error, in meters per second, expressed as the User Effective Range Rate Error (UERRE). This is the 1σ
   * (68%) value.
   */
  rangeRateError: number;
}

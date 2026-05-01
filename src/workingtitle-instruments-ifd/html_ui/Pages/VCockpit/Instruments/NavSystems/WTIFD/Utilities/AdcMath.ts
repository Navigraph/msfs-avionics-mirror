import { UnitType } from '@microsoft/msfs-sdk';

/**
 * Air Data Computer Math Utility Class.
 */
export class AdcMath {
  /** ISA temperature at sea level (Kelvin). */
  private static readonly slIsaTemp = 288.15;

  /** ISA pressure at sea level (Pascals). */
  private static readonly slIsaPres = 101_325;

  /** Atmospheric lapse rate in the troposphere (Kelvin per foot). */
  private static readonly lapseFt = 0.0019812;

  /** Top of the troposphere altitude (feet). */
  private static readonly topTroposphereFt = 36_089;

  /** Tropopause reference altitude used in this model (feet). */
  private static readonly tropopauseFt = 65_616;

  /** Pressure at base of the tropopause (Pascals). */
  private static readonly tropopauseBasePressurePa = 22_632.06;

  /** Temperature at (and through) the tropopause layer (Kelvin). */
  private static readonly tropopauseTempK = 216.65;

  /**
   * Exponent used in tropospheric pressure equation:
   * pressure = P0 * (T0 / T)^k, with k = 0.034163203 / -0.0065 (unitless).
   */
  private static readonly troposphereExponent = 0.034163203 / -0.0065;

  /**
   * Coefficient used in the tropopause (isothermal) pressure equation:
   * pressure = P_tropo * exp( (k / T) * (h_tropo - h) ), with k = 0.010412944.
   */
  private static readonly tropopauseExpCoeff = 0.010412944;

  /** Standard altimeter setting (inHg). */
  private static readonly isaAltimeterInHg = 29.92;

  /** Pressure altitude scaling (feet per inHg). */
  private static readonly feetPerInHg = 1_000;

  /** Kelvin offset from Celsius. */
  private static readonly kelvinOffset = 273.15;

  /** Fahrenheit→Celsius scale factor (5/9). */
  private static readonly fToCScale = 5 / 9;

  /** Celsius→Fahrenheit scale factor (9/5). */
  private static readonly cToFScale = 9 / 5;

  /** Smallest allowed station pressure (hPa) for clamping to avoid divisions by zero. */
  private static readonly minPressureHpa = 1e-3;

  /** Water vapor/air gas constant ratio ε (unitless). */
  private static readonly epsilon = 0.622;

  /** Magnus formula constant A (hPa). */
  private static readonly magnusA = 6.112;

  /** Magnus formula constant B (unitless). */
  private static readonly magnusB = 17.67;

  /** Magnus formula constant C (°C). */
  private static readonly magnusC = 243.5;

  /** NWS density altitude coefficient (feet). */
  private static readonly nwsDaCoeff = 145_422.16;

  /**
   * NWS pressure/temperature scaling factor inside the DA equation (unitless).
   * DA = C * (1 - (K * P / T)^n), where K ≈ 17.326, n ≈ 0.235.
   */
  private static readonly nwsPressureTempRatio = 17.326;

  /** NWS exponent in density altitude equation (unitless). */
  private static readonly nwsDaExponent = 0.235;

  /**
   * Gets the ISA Standard temperature and pressure for a given geometric altitude.
   *
   * Troposphere (lapse rate) up to 36,089 ft; isothermal tropopause up to 65,616 ft.
   *
   * @param altitude - Altitude in feet.
   * @returns A tuple `[temperatureK, pressurePa]`.
   */
  public static calcIsaFromAltitude(altitude: number): number[] {
    let tempK = 0.0;
    let pressurePa = 0.0;

    if (altitude <= AdcMath.topTroposphereFt) {
      // Troposphere: linear lapse rate
      tempK = AdcMath.slIsaTemp + (-AdcMath.lapseFt * altitude);
      pressurePa = AdcMath.slIsaPres * Math.pow(
        (AdcMath.slIsaTemp / tempK),
        AdcMath.troposphereExponent
      );
    } else if (altitude <= AdcMath.tropopauseFt) {
      // Isothermal tropopause
      tempK = AdcMath.tropopauseTempK;
      pressurePa = AdcMath.tropopauseBasePressurePa * Math.exp(
        (AdcMath.tropopauseExpCoeff / AdcMath.tropopauseTempK) * (AdcMath.tropopauseFt - altitude)
      );
    } else {
      tempK = NaN;
      pressurePa = NaN;
    }

    return [tempK, pressurePa];
  }

  /**
   * Calculate the pressure altitude from indicated altitude and sea level pressure.
   *
   * @param indicatedAltitude - Indicated altitude (feet).
   * @param baroSettingInHg - Altimeter setting (inHg).
   * @returns Pressure altitude (feet).
   */
  public static calcPressureAltitude(indicatedAltitude: number, baroSettingInHg: number): number {
    return indicatedAltitude + (AdcMath.feetPerInHg * (AdcMath.isaAltimeterInHg - baroSettingInHg));
  }

  /**
   * Calculate the static pressure (station pressure) at the aircraft, derived from
   * pressure altitude assuming ISA profile.
   *
   * @param indicatedAltitude - Indicated altitude (feet).
   * @param baroSettingInHg - Altimeter setting (inHg).
   * @returns Static pressure (Pascals).
   */
  public static calcStaticPressure(indicatedAltitude: number, baroSettingInHg: number): number {
    return AdcMath.calcIsaFromAltitude(
      AdcMath.calcPressureAltitude(indicatedAltitude, baroSettingInHg)
    )[1];
  }

  /**
   * Calculates density altitude from indicated altitude, barometer setting, and
   * static air temperature (°F) including humidity correction via dew point (°F).
   * Virtual temperature (from dew point) is used in place of actual temperature inside the NWS DA formula.
   * @param indicatedAltitude - Indicated altitude (feet).
   * @param baroSettingInHg - Barometer setting (inHg).
   * @param satF - Static air temperature (°F).
   * @param dewPointF - Dew point temperature (°F).
   * @returns Density altitude (feet).
   */
  public static calcDensityAltitude(
    indicatedAltitude: number,
    baroSettingInHg: number,
    satF: number,
    dewPointF: number
  ): number {
    // Station pressure from indicated altitude and altimeter
    const stationPressurePa = AdcMath.calcStaticPressure(indicatedAltitude, baroSettingInHg);
    const stationPressureHpa = stationPressurePa / 100; // Pa → hPa
    const stationPressureInHg = UnitType.HPA.convertTo(stationPressureHpa, UnitType.IN_HG);

    // Convert temps F → C
    const satC = (satF - 32) * AdcMath.fToCScale;
    const dewPointC = (dewPointF - 32) * AdcMath.fToCScale;

    // Clamp dew point (dew point cannot exceed air temperature)
    const tdC = Math.min(dewPointC, satC);

    // Air temperature in Kelvin
    const tK = satC + AdcMath.kelvinOffset;

    // Vapor pressure from dew point (Magnus formula, over water), result in hPa
    const eHpa = AdcMath.magnusA * Math.exp(
      (AdcMath.magnusB * tdC) / (tdC + AdcMath.magnusC)
    );

    // Clamp vapor pressure to physical limits
    const pHpa = Math.max(stationPressureHpa, AdcMath.minPressureHpa);
    const eClampedHpa = Math.min(eHpa, pHpa - AdcMath.minPressureHpa);

    // Mixing ratio (mass of water vapor / mass of dry air), unitless
    const r = AdcMath.epsilon * eClampedHpa / (pHpa - eClampedHpa);

    // Virtual temperature (K), accounting for humidity
    const tVirtK = tK * (1 + r / AdcMath.epsilon) / (1 + r);

    // Convert virtual temperature to Rankine for NWS formula
    const tVirtR = tVirtK * AdcMath.cToFScale;

    // Density Altitude (NWS equation)
    const daFt = AdcMath.nwsDaCoeff * (
      1 - Math.pow(
        (AdcMath.nwsPressureTempRatio * stationPressureInHg) / tVirtR,
        AdcMath.nwsDaExponent
      )
    );

    return daFt;
  }
}

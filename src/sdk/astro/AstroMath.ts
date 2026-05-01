import { GeoCircle } from '../geo/GeoCircle';
import { LatLonInterface } from '../geo/GeoInterfaces';
import { GeoMath } from '../geo/GeoMath';
import { GeoPoint } from '../geo/GeoPoint';
import { MathUtils } from '../math/MathUtils';
import { Vec3Math } from '../math/VecMath';
import { ArrayUtils } from '../utils/datastructures/ArrayUtils';

/**
 * Types of horizons for calculating sunrise and sunset.
 */
export enum SunriseSunsetHorizon {
  /**
   * The horizon used to demarcate the boundary between daytime and nighttime. The sun crosses this horizon during the
   * events colloquially known as "sunrise" and "sunset". By convention, the sun crosses this horizon when the top of
   * the _apparent_ solar disk crosses above or beneath the horizontal plane. Average values of 16 arcminutes and 34
   * arcminutes are taken for the sun's apparent angular radius and the atmospheric refraction at the horizontal plane,
   * respectively. Therefore, the sun is considered to cross this horizon when its _true_ (geometric) center is 50
   * arcminutes below the horizontal plane.
   */
  Daylight,

  /**
   * The horizon used to demarcate the boundary for the start and end of civil twilight. By convention, the sun crosses
   * this horizon when its true (geometric) center is 6 degrees below the horizontal plane.
   */
  CivilTwilight,

  /**
   * The horizon used to demarcate the boundary for the start and end of nautical twilight. By convention, the sun
   * crosses this horizon when its true (geometric) center is 12 degrees below the horizontal plane.
   */
  NauticalTwilight,

  /**
   * The horizon used to demarcate the boundary for the start and end of astronomical twilight. By convention, the sun
   * crosses this horizon when its true (geometric) center is 18 degrees below the horizontal plane.
   */
  AstronomicalTwilight,
}

/**
 * A utility class for working with astronomical calculations.
 */
export class AstroMath {
  /** The J2000.0 epoch, as a Javascript timestamp. */
  private static readonly J2000_EPOCH = 946727935813;

  /** The number of milliseconds in one UTC (universal coordinated time) or TT (terrestrial time) day. */
  private static readonly DAY_MILLISECONDS = 86400000;

  /** `1 / (2 * Math.PI)` */
  private static readonly INV_TWO_PI = 0.1591549430918953;

  /**
   * The solar zenith angle thresholds, in radians, to use when considering different sunrise/sunset horizons.
   */
  private static readonly SOLAR_ZENITH_ANGLE_THRESHOLDS: Record<SunriseSunsetHorizon, number> = {
    // This is equal to 90 deg + 50 arcmin. The 50 arcmin adjustment comes from the fact that (normal) sunrise and
    // sunset are defined as when the top of the _apparent_ solar disk rises above and sinks beneath the horizon,
    // respectively. The average apparent angular radius of the solar disk is 16 arcmin and the average atmospheric
    // refraction at the horizon is 34 arcmin. Therefore the apparent solar disk is still visible while the true
    // (geometric) position of the sun's center is up to 50 arcmin below the horizon.
    [SunriseSunsetHorizon.Daylight]: MathUtils.HALF_PI + 0.01454441043328608,
    [SunriseSunsetHorizon.CivilTwilight]: MathUtils.HALF_PI + 6 * Avionics.Utils.DEG2RAD,
    [SunriseSunsetHorizon.NauticalTwilight]: MathUtils.HALF_PI + 12 * Avionics.Utils.DEG2RAD,
    [SunriseSunsetHorizon.AstronomicalTwilight]: MathUtils.HALF_PI + 18 * Avionics.Utils.DEG2RAD,
  };
  /** The cosines of the solar zenith angle thresholds to use when considering different sunrise/sunset horizons. */
  private static readonly COS_SOLAR_ZENITH_ANGLE_THRESHOLDS: Record<SunriseSunsetHorizon, number> = {
    [SunriseSunsetHorizon.Daylight]: Math.cos(AstroMath.SOLAR_ZENITH_ANGLE_THRESHOLDS[SunriseSunsetHorizon.Daylight]),
    [SunriseSunsetHorizon.CivilTwilight]: Math.cos(AstroMath.SOLAR_ZENITH_ANGLE_THRESHOLDS[SunriseSunsetHorizon.CivilTwilight]),
    [SunriseSunsetHorizon.NauticalTwilight]: Math.cos(AstroMath.SOLAR_ZENITH_ANGLE_THRESHOLDS[SunriseSunsetHorizon.NauticalTwilight]),
    [SunriseSunsetHorizon.AstronomicalTwilight]: Math.cos(AstroMath.SOLAR_ZENITH_ANGLE_THRESHOLDS[SunriseSunsetHorizon.AstronomicalTwilight]),
  };

  private static readonly vec3Cache = ArrayUtils.create(2, () => Vec3Math.create());
  private static readonly geoPointCache = ArrayUtils.create(1, () => new GeoPoint(0, 0));
  private static readonly geoCircleCache = ArrayUtils.create(2, () => new GeoCircle());
  private static readonly intersectionCache = [Vec3Math.create(), Vec3Math.create()];

  /**
   * Gets the sun's right ascension and declination, and the equation of time, for a specific time.
   * @param time The time for which to get the solar position, as a Javascript timestamp.
   * @param out The array to which to write the result.
   * @returns The sun's right ascension and declination, and the equation of time, for the specified time, as
   * `[right ascension (radians), declination (radians), equation of time (days)]`.
   */
  private static getSolarPositionValues(time: number, out: Float64Array): Float64Array {
    // Source: https://aa.usno.navy.mil/faq/sun_approx

    const daysSinceJ2000 = (time - AstroMath.J2000_EPOCH) / AstroMath.DAY_MILLISECONDS;
    /** Mean longitude. */
    const L = 4.894932966850777 + 0.01720279169558986 * daysSinceJ2000;
    /** Mean anomaly. */
    const g = 6.240058221362807 + 0.01720196999457802 * daysSinceJ2000;
    /** Geocentric apparent ecliptic longitude.  */
    const lambda = L + 0.03342305517569141 * Math.sin(g) + 0.0003490658503988659 * Math.sin(2 * g);
    /** Mean obliquity of the ecliptic. */
    const epsilon = 0.4090877233749509 - 6.283185307179586e-9 * daysSinceJ2000;
    const rAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
    const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));

    /** Equation of time, in days. */
    const E = MathUtils.normalizeAngle(L - rAscension, -Math.PI) * AstroMath.INV_TWO_PI;

    return Vec3Math.set(rAscension, declination, E, out);
  }

  /**
   * Gets the subsolar point (the point on Earth's surface directly below the Sun) given a specific time.
   *
   * For times between the years 1800 and 2200, the value returned by this method is accurate to within one arcminute
   * for each of latitude and longitude (giving a total angular error less than 85 arcseconds). The error's upper bound
   * gradually increases as the time moves farther away from the 1800-2200 range.
   * @param time The time for which to get the subsolar point, as a Javascript timestamp.
   * @param out The `LatLonInterface` to which to write the result.
   * @returns The subsolar point at the specified time, as _geocentric_ latitude and longitude coordinates.
   */
  public static getSubSolarPoint(time: number, out: LatLonInterface): LatLonInterface;
  /**
   * Gets the subsolar point (the point on Earth's surface directly below the Sun) given a specific time.
   *
   * For times between the years 1800 and 2200, the value returned by this method is accurate to within 85 arcseconds
   * of total angular error. The error's upper bound gradually increases as the time moves farther away from the
   * 1800-2200 range.
   * @param time The time for which to get the subsolar point, as a Javascript timestamp.
   * @param out The `Float64Array` to which to write the result.
   * @returns The subsolar point at the specified time, as its cartesian representation assuming a spherical model of
   * the earth, in units of great-arc radians. By convention, the origin is at the center of the Earth, the positive x
   * axis passes through 0 degrees N, 0 degrees E, and the positive z axis passes through the north pole.
   */
  public static getSubSolarPoint(time: number, out: Float64Array): Float64Array;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public static getSubSolarPoint(time: number, out: LatLonInterface | Float64Array): LatLonInterface | Float64Array {
    const [, declination, E] = AstroMath.getSolarPositionValues(time, AstroMath.vec3Cache[0]);
    const utcDayFrac = (time % AstroMath.DAY_MILLISECONDS) / AstroMath.DAY_MILLISECONDS;

    const lat = declination * Avionics.Utils.RAD2DEG;
    const lon = -360 * (utcDayFrac - 0.5 + E);

    if (out instanceof Float64Array) {
      return GeoPoint.sphericalToCartesian(lat, lon, out);
    } else {
      out.lat = lat;
      out.lon = MathUtils.normalizeAngleDeg(lon, -180);
      return out;
    }
  }

  /**
   * Gets the solar zenith angle, in radians, at a particular location on the surface of the earth and time. The zenith
   * angle is defined as the angle between the center of the solar disk and the vertical axis. The calculated angle is
   * the _true_ (geometric) zenith angle and does not include effects of atmospheric refraction.
   *
   * For times between the years 1800 and 2200, the value returned by this method is accurate to within 85 arcseconds
   * (~4.12e-4 radians).
   * @param location The location at which to get the solar zenith angle, in either _geocentric_ latitude/longitude
   * coordinates or cartesian coordinates. Cartesian coordinates should be expressed in units of great-arc radians,
   * with the origin at the center of the Earth, the positive x axis passing through 0 degrees N, 0 degrees E, and the
   * positive z axis passing through the north pole.
   * @param time The time at which to get the solar zenith angle, as a Javascript timestamp.
   * @returns The solar zenith angle, in radians, at the specified location and time.
   */
  public static getSolarZenithAngle(location: LatLonInterface | Float64Array, time: number): number {
    const subSolarPoint = AstroMath.getSubSolarPoint(time, AstroMath.vec3Cache[0]);

    const locationVec = location instanceof Float64Array
      ? location
      : GeoPoint.sphericalToCartesian(location, AstroMath.vec3Cache[1]);

    // The sun is far enough from the earth (~1.5e11 meters) compared to one earth radius (~6.4e6 meters) that for the
    // purposes of the following calculations we can treat the earth as a single point. Therefore, the subsolar point
    // vector becomes the unit position vector from any point on earth to the sun.
    return Math.acos(MathUtils.clamp(Vec3Math.dot(locationVec, subSolarPoint), -1, 1));
  }

  /**
   * Checks whether the sun is above a certain horizon at a particular location on the surface of the earth and time.
   * @param location The location to check, in either _geocentric_ latitude/longitude coordinates or cartesian
   * coordinates. Cartesian coordinates should be expressed in units of great-arc radians, with the origin at the
   * center of the Earth, the positive x axis passing through 0 degrees N, 0 degrees E, and the positive z axis passing
   * through the north pole.
   * @param time The time to check, as a Javascript timestamp.
   * @param horizon The horizon to use. Defaults to {@link SunriseSunsetHorizon.Daylight}.
   * @returns Whether the sun is above the specified horizon at the specified location and time.
   * @see {@link getSolarZenithAngle | getSolarZenithAngle()}
   * @see {@link getSunriseAndSunsetTimes | getSunriseAndSunsetTimes()}
   */
  public static isSunAboveHorizon(location: LatLonInterface | Float64Array, time: number, horizon = SunriseSunsetHorizon.Daylight): boolean {
    const subSolarPoint = AstroMath.getSubSolarPoint(time, AstroMath.vec3Cache[0]);

    const locationVec = location instanceof Float64Array
      ? location
      : GeoPoint.sphericalToCartesian(location, AstroMath.vec3Cache[1]);

    return Vec3Math.dot(locationVec, subSolarPoint) > AstroMath.COS_SOLAR_ZENITH_ANGLE_THRESHOLDS[horizon];
  }

  /**
   * Gets the times of sunrise and sunset across a certain horizon for a particular location on the surface of the
   * earth. The sunrise and sunset times are chosen to be the pair associated with the solar transit (also known as
   * local solar noon) closest to a specified time.
   * 
   * The sunrise and sunset times calculated by this method are accurate to within one minute. The transit time is
   * accurate to within a few seconds.
   * @param location The location for which to get sunrise and sunset times, in either _geocentric_ latitude/longitude
   * coordinates or cartesian coordinates. Cartesian coordinates should be expressed in units of great-arc radians,
   * with the origin at the center of the Earth, the positive x axis passing through 0 degrees N, 0 degrees E, and the
   * positive z axis passing through the north pole.
   * @param time A time used to specify which pair of sunrise/sunset times to calculate, as a Javascript timestamp. The
   * calculated sunrise and sunset times will be the ones immediately before and after, respectively, the time of solar
   * transit (also known as local solar noon) closest to the specified time.
   * @param out The array to which to write the results.
   * @param horizon The horizon to use. Defaults to {@link SunriseSunsetHorizon.Daylight}.
   * @returns The times of sunrise and sunset across the specified horizon associated with the solar transit closest to
   * the specified time for the specified location, as a 3-tuple of Javascript timestamps `[transit, sunrise, sunset]`
   * that are rounded to the nearest second. If the specified location is invalid, then `[NaN, NaN, NaN]` is returned.
   * If the sun does not cross the horizon in the 24-hour period centered around the transit time, then the transit
   * time is still returned, but `NaN` is returned for sunrise and sunset.
   * @see {@link isSunAboveHorizon | isSunAboveHorizon()}
   */
  public static getSunriseAndSunsetTimes(
    location: LatLonInterface | Float64Array,
    time: number,
    out: Float64Array,
    horizon = SunriseSunsetHorizon.Daylight
  ): Float64Array {
    const locationPoint = location instanceof Float64Array
      ? AstroMath.geoPointCache[0].setFromCartesian(location)
      : AstroMath.geoPointCache[0].set(location);

    if (!isFinite(time) || !locationPoint.isValid()) {
      return Vec3Math.set(NaN, NaN, NaN, out);
    }

    const locationVec = location instanceof Float64Array
      ? location
      : GeoPoint.sphericalToCartesian(location, AstroMath.vec3Cache[0]);

    // Get the time of local mean solar noon (as measured at the query location) that is closest to the specified time.
    const localTimeOffset = -locationPoint.lon * 240000;
    const localMeanSolarNoonTime = (Math.round((time - localTimeOffset) / AstroMath.DAY_MILLISECONDS - 0.5) + 0.5) * AstroMath.DAY_MILLISECONDS + localTimeOffset;

    const E_meanSolarNoon = AstroMath.getSolarPositionValues(localMeanSolarNoonTime, AstroMath.vec3Cache[1])[2];

    // NOTE: this is only an estimate of the true solar noon time. Because the equation of time is not constant with
    // respect to time, subtracting the EoT (measured at mean solar noon) from mean solar noon does not exactly give
    // the true solar noon time, since the EoT value is only valid for the exact time of mean solar noon. However, the
    // EoT does not vary appreciably on the relevant timescales, so this estimate is still good enough to be accurate
    // to within one second.
    const localTrueSolarNoonTime = localMeanSolarNoonTime - E_meanSolarNoon * AstroMath.DAY_MILLISECONDS;

    const [, declinationTrueSolarNoon, E_trueSolarNoon] = AstroMath.getSolarPositionValues(localTrueSolarNoonTime, AstroMath.vec3Cache[1]);

    // The horizon that the subsolar point must cross during sunrise/sunset at the query location.
    const daytimeHorizon = AstroMath.geoCircleCache[0].set(locationVec, AstroMath.SOLAR_ZENITH_ANGLE_THRESHOLDS[horizon]);
    // The approximate track of the subsolar point around the time of true solar noon (ignores changes in solar
    // declination over time).
    const subSolarPointTrack = AstroMath.geoCircleCache[1].set(
      Vec3Math.set(0, 0, -1, AstroMath.vec3Cache[1]),
      MathUtils.HALF_PI + declinationTrueSolarNoon
    );

    const intersections = AstroMath.intersectionCache;
    const intersectionCount = subSolarPointTrack.intersection(daytimeHorizon, intersections);

    let angularDayLength = 0;

    if (intersectionCount === 2) {
      angularDayLength = subSolarPointTrack.angleAlong(intersections[1], intersections[0], Math.PI, GeoMath.ANGULAR_TOLERANCE);
    }

    if (angularDayLength === 0) {
      // The sun never crosses the horizon.
      return Vec3Math.set(localTrueSolarNoonTime, NaN, NaN, out);
    }

    const geometricHalfDayLength = 0.5 * angularDayLength * AstroMath.INV_TWO_PI * AstroMath.DAY_MILLISECONDS;
    const geometricSunriseTime = localTrueSolarNoonTime - geometricHalfDayLength;
    const geometricSunsetTime = localTrueSolarNoonTime + geometricHalfDayLength;

    // The calculated geometric sunrise/sunset times above ignore effects from changes in the equation of time over
    // time. In other words, they assume that the sun moves across the sky at a constant rate of 360 degrees per clock
    // day (or, put another way, they assume one solar day = one clock day). In reality, the length of a solar day
    // varies according to the equation of time and can be up to 30 seconds longer or shorter than one clock day (24
    // hours). We will partially correct for this discrepancy by calculating a first-order approximation of the
    // deviation of the length of the solar day relative to one clock day. This approximation should reduce the error
    // to less than one second.

    const E_sunrise = AstroMath.getSolarPositionValues(geometricSunriseTime, AstroMath.vec3Cache[1])[2];
    const E_sunset = AstroMath.getSolarPositionValues(geometricSunsetTime, AstroMath.vec3Cache[1])[2];

    const deltaSolarTimeSunrise = E_sunrise - E_trueSolarNoon;
    const deltaSolarTimeSunset = E_trueSolarNoon - E_sunset;

    const sunriseTime = geometricSunriseTime + deltaSolarTimeSunrise * AstroMath.DAY_MILLISECONDS;
    const sunsetTime = geometricSunsetTime + deltaSolarTimeSunset * AstroMath.DAY_MILLISECONDS;

    if (sunsetTime - sunriseTime <= 0) {
      // The sun never crosses the horizon.
      return Vec3Math.set(localTrueSolarNoonTime, NaN, NaN, out);
    }

    // Round the times to the nearest second. In reality the error will be larger due to contributions primarily from
    // the following:
    // - Error in the equation of time calculation. The calculation uses an approximation that has an error of up to
    //   several seconds.
    // - Error in the solar declination calculation (does not apply to transit time). The declination value can have an
    //   error of up to 30 arcseconds, which carries forward to errors in the sunrise/sunset times on the order of ~1-2
    //   seconds.
    // - Error due to the assumption of constant solar declination around the time of solar noon (does not apply to
    //   transit time). This can lead to an error in the sunrise/sunset times of up to 30 seconds.
    return Vec3Math.set(
      MathUtils.round(localTrueSolarNoonTime, 1000),
      MathUtils.round(sunriseTime, 1000),
      MathUtils.round(sunsetTime, 1000),
      out
    );
  }
}

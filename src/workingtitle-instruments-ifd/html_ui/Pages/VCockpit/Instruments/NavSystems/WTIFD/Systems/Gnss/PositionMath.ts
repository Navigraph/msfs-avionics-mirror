import { GeoPoint, ReadonlyFloat64Array, UnitType, Vec2Math, Vec3Math } from '@microsoft/msfs-sdk';

/**
 * Functions for doing position-related computations.
 */
export class PositionMath {
  private static readonly WGS84_SEMI_MAJOR_AXIS = 6378137; // in meters
  private static readonly WGS84_SEMI_MINOR_AXIS = 6356752.314245; // in meters
  private static readonly WGS84_ECCENTRICITY_SQ = 1 - (PositionMath.WGS84_SEMI_MINOR_AXIS ** 2) / (PositionMath.WGS84_SEMI_MAJOR_AXIS ** 2);

  private static readonly vec3Cache: Float64Array[] = [Vec3Math.create(), Vec3Math.create()];

  /**
   * Computes the ground path between two GeoPoints and the time it took to travel between them. The ground path consists of the speed,
   * velocity vector components and track angle. The Earth's curvature is not taken into account, meaning that this will only be accurate
   * for small distances (order of kilometers).
   * @param lastPos The last position.
   * @param currentPos The current position.
   * @param dt The time it took to travel between the last and current position, in seconds.
   * @param out The object to write the ground path into.
   * @returns The ground path.
   */
  public static computeGroundPath(lastPos: GeoPoint, currentPos: GeoPoint, dt: number, out: GroundPath): GroundPath {
    const distance = UnitType.GA_RADIAN.convertTo(lastPos.distance(currentPos), UnitType.METER);

    if (distance == 0) {
      out.velocityNS = 0;
      out.velocityEW = 0;
      out.speed = 0;
      out.track = 0;
      return out;
    }

    const track = lastPos.bearingTo(currentPos);
    const trackRad = track * Avionics.Utils.DEG2RAD;
    const speedKts = UnitType.MPS.convertTo(distance / dt, UnitType.KNOT);

    const velocityNS = speedKts * Math.cos(trackRad);
    const velocityEW = speedKts * Math.sin(trackRad);

    out.velocityNS = velocityNS;
    out.velocityEW = velocityEW;
    out.speed = speedKts;
    out.track = track;
    return out;
  }

  /**
   * Calculates the parameters of the 1σ uncertainty ellipse given by the specified covariance matrix, assuming a bivariate normal
   * distribution. The ellipse contains 39.4% of random samples drawn from a distribution with the specified covariance matrix.
   * @param covarMatrix The covariance matrix. The matrix must be n by n (square) and represented as an n²-element vector in
   * row-major order. The minimum size of the matrix is 2x2. Only the (co)variances from the upper-left 2x2 submatrix are used.
   * @param out The object to write the computed uncertainty ellipse into.
   * @returns The parameters of the uncertainty ellipse.
   */
  public static computeUncertaintyEllipse(covarMatrix: ReadonlyFloat64Array, out: UncertaintyEllipse): UncertaintyEllipse {
    const n = Math.floor(Math.sqrt(covarMatrix.length));

    const a = covarMatrix[0 * n + 0];
    const b = covarMatrix[0 * n + 1];
    const c = covarMatrix[1 * n + 0];
    const d = covarMatrix[1 * n + 1];

    // For more information consult https://en.wikipedia.org/wiki/Multivariate_normal_distribution#Geometric_interpretation.

    if (b == 0 && c == 0) {
      // The covariance matrix is symmetric, so this is the only special case we need to handle.
      Vec2Math.set(Math.sqrt(a), 0, out.majorAxis);
      Vec2Math.set(0, Math.sqrt(d), out.minorAxis);
      return out;
    }

    // Compute the eigenvalues by solving the characteristic polynomial.
    const eigenValueLeft = (a + d) / 2;
    const eigenValueRight = Math.sqrt(((a - d) / 2) ** 2 + b * c);

    const eigenValue1 = eigenValueLeft + eigenValueRight;
    const eigenValue2 = eigenValueLeft - eigenValueRight;

    // Source: https://people.math.harvard.edu/%7Eknill/teaching/math21b2004/exhibits/2dmatrices/index.html (b != 0, c != 0)
    const eigenVector1 = Vec2Math.set(eigenValue1 - d, c, out.majorAxis);
    const eigenVector2 = Vec2Math.set(eigenValue2 - d, c, out.minorAxis);

    // Set the length of both eigenvectors to sqrt(corresponding eigenvalue).
    out.majorAxis = Vec2Math.multScalar(eigenVector1, Math.sqrt(eigenValue1) / Vec2Math.abs(eigenVector1), out.majorAxis);
    out.minorAxis = Vec2Math.multScalar(eigenVector2, Math.sqrt(eigenValue2) / Vec2Math.abs(eigenVector2), out.minorAxis);
    return out;
  }

  /**
   * Converts WGS84 geodetic coordinates (latitude, longitude, altitude) to Cartesian ECEF coordinates (x, y, z).
   * @param latitude The latitude, in degrees.
   * @param longitude The longitude, in degrees.
   * @param altitude The altitude, in meters.
   * @param out The output vector to which to write the Cartesian ECEF coordinates (x, y, z), in meters.
   * @returns The output vector containing the Cartesian ECEF coordinates, in meters.
   */
  public static convertGeodeticToCartesian(latitude: number, longitude: number, altitude: number, out: Float64Array): Float64Array {
    // Algorithm from https://en.wikipedia.org/wiki/Geographic_coordinate_conversion#From_geodetic_to_ECEF_coordinates.
    const latRad = latitude * Avionics.Utils.DEG2RAD;
    const lonRad = longitude * Avionics.Utils.DEG2RAD;

    const primeCurvatureRadius = PositionMath.WGS84_SEMI_MAJOR_AXIS / Math.sqrt(1 - PositionMath.WGS84_ECCENTRICITY_SQ * Math.sin(latRad) ** 2);
    const cosLat = Math.cos(latRad);

    out[0] = (primeCurvatureRadius + altitude) * cosLat * Math.cos(lonRad);
    out[1] = (primeCurvatureRadius + altitude) * cosLat * Math.sin(lonRad);
    out[2] = ((1 - PositionMath.WGS84_ECCENTRICITY_SQ) * primeCurvatureRadius + altitude) * Math.sin(latRad);

    return out;
  }

  /**
   * Computes the line of sight distance between two positions.
   * @param lat1 The latitude of the position, in degrees.
   * @param lon1 The longitude of the position, in degrees.
   * @param alt1 The altitude of the position, in meters.
   * @param lat2 The latitude of the DME facility, in degrees.
   * @param lon2 The longitude of the DME facility, in degrees.
   * @param alt2  The altitude of the DME facility, in meters.
   * @returns The line of sight distance, in meters.
   */
  public static computeLoSDistance(lat1: number, lon1: number, alt1: number, lat2: number, lon2: number, alt2: number): number {
    // CACHE USE:
    // vec3: indexes 0, 1

    const posEcef = PositionMath.convertGeodeticToCartesian(lat1, lon1, alt1, PositionMath.vec3Cache[0]);
    const dmePosEcef = PositionMath.convertGeodeticToCartesian(lat2, lon2, alt2, PositionMath.vec3Cache[1]);
    const distanceMeters = Vec3Math.distance(posEcef, dmePosEcef);

    return distanceMeters;
  }

  /**
   * Adds a Cartesian (x, y) offset to a {@link GeoPoint}. The offset is applied along a great circle path, in the direction of the offset
   * vector. The x-axis of the offset points towards true north, and the y-axis points towards the east.
   * @param point The point to which to apply the offset.
   * @param offset The Cartesian offset to apply, as a 2-element vector containing the x and y components of the offset, in meters.
   * @param out The point to which to write the result of the offset operation.
   * @returns The point containing the result of the offset operation.
   */
  public static offsetCartesian(point: GeoPoint, offset: Float64Array, out: GeoPoint): GeoPoint {
    const bearing = UnitType.RADIAN.convertTo(Math.atan2(offset[1], offset[0]), UnitType.DEGREE);

    out.set(point);
    out.offset(bearing, UnitType.METER.convertTo(Math.hypot(offset[0], offset[1]), UnitType.GA_RADIAN));

    return out;
  }
}

/**
 * A ground path which consists of the velocity vector components and track angle.
 */
export interface GroundPath {
  /**
   * The north-south velocity component, in knots.
   */
  velocityNS: number;
  /**
   * The east-west velocity component, in knots.
   */
  velocityEW: number;
  /**
   * The ground speed, in knots.
   */
  speed: number;
  /**
   * The track angle, in degrees relative to true north.
   */
  track: number;
}


/**
 * The parameters describing an 1σ uncertainty ellipse derived from a bivariate normal distribution. The ellipse contains the true position
 * with 39.4% certainty.
 */
export interface UncertaintyEllipse {
  /**
   * The vector representing the major axis of the uncertainty ellipse. Its length is the length of the semi-major axis of the 1σ
   * uncertainty ellipse.
   */
  majorAxis: Float64Array;
  /**
   * The vector representing the minor axis of the uncertainty ellipse. Its length is the length of the semi-minor axis of the 1σ
   * uncertainty ellipse.
   */
  minorAxis: Float64Array;
}

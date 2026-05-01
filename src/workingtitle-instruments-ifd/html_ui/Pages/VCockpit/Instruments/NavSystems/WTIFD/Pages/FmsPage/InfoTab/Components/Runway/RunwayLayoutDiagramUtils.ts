import { AirportFacility, GeoPoint, SvgPathStream, UnitType } from '@microsoft/msfs-sdk';

/**
 * Options for generating an airport runway diagram SVG path.
 */
export type IfdAirportRunwayLayoutDiagramOptions = {
  /** Width of the SVG viewBox in pixels. Defaults to 200. */
  svgWidth?: number;

  /** Height of the SVG viewBox in pixels. Defaults to 200. */
  svgHeight?: number;

  /**
   * Margin, in pixels, to keep between the outermost runway endpoints and the edges of the SVG viewBox.
   * Defaults to 10.
   */
  margin?: number;

  /**
   * Precision for the {@link SvgPathStream} coordinates. A value of `0` indicates infinite precision.
   * Defaults to 0.01.
   */
  precision?: number;
};

/**
 * The result of generating an airport runway diagram SVG path.
 */
export type IfdAirportRunwayLayoutDiagram = {
  /** Combined SVG path for all runways at the airport. */
  path: string;

  /** The SVG viewBox string (e.g. `"0 0 200 200"`). */
  viewBox: string;

  /** The width of the viewBox, in pixels. */
  width: number;

  /** The height of the viewBox, in pixels. */
  height: number;

  /** Whether the airport has at least one runway and a non-empty path was generated. */
  hasRunways: boolean;

  /**
   * Individual SVG paths for each runway, in the same order as `airport.runways`.
   * Each path contains a single moveTo/lineTo segment representing that runway.
   */
  runwayPaths: readonly string[];
};

/**
 * A pair of Cartesian endpoints for a runway segment in the local east/north coordinate system.
 *
 * The coordinates are expressed in meters, with:
 * - `x` increasing toward east, and
 * - `y` increasing toward north.
 */
type Endpoints = {
  /** The X coordinate, in meters, of the first endpoint (east). */
  x1: number;

  /** The Y coordinate, in meters, of the first endpoint (north). */
  y1: number;

  /** The X coordinate, in meters, of the second endpoint (east). */
  x2: number;

  /** The Y coordinate, in meters, of the second endpoint (north). */
  y2: number;
};

/** Utility methods for generating the diagram of runways at an airport, in SVG path format. */
export class RunwayLayoutDiagramUtils {
  /**
   * Builds an SVG path representing all runways at an airport and additional separate paths for each runway.
   *
   * @param airport The airport facility for which to generate the runway diagram.
   * @param options Options controlling the size and precision of the generated SVG geometry.
   * @returns The generated runway diagram geometry and viewBox information.
   */
  public static buildAirportRunwayLayoutDiagram(
    airport: AirportFacility,
    options?: IfdAirportRunwayLayoutDiagramOptions
  ): IfdAirportRunwayLayoutDiagram {
    const svgWidth = options?.svgWidth ?? 200;
    const svgHeight = options?.svgHeight ?? 200;
    const margin = options?.margin ?? 10;
    const precision = options?.precision ?? 0.01;

    const runways = airport.runways;
    if (!runways || runways.length === 0) {
      return {
        path: '',
        viewBox: `0 0 ${svgWidth} ${svgHeight}`,
        width: svgWidth,
        height: svgHeight,
        hasRunways: false,
        runwayPaths: [],
      };
    }

    const airportPoint = new GeoPoint(airport.lat, airport.lon);

    const endpoints: Endpoints[] = [];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    // compute runway endpoints in a local east/north frame (meters) and track bounding box.
    for (const runway of runways) {
      const midPoint = new GeoPoint(runway.latitude, runway.longitude);

      // Offset half the runway length in each direction along the true heading.
      const halfLengthRad = UnitType.METER.convertTo(runway.length / 2, UnitType.GA_RADIAN);
      const headingTrue = runway.direction ?? 0;

      const end1 = midPoint.offset(headingTrue + 180, halfLengthRad, new GeoPoint(0, 0));
      const end2 = midPoint.offset(headingTrue, halfLengthRad, new GeoPoint(0, 0));

      const end1Local = RunwayLayoutDiagramUtils.projectToLocalMeters(airportPoint, end1);
      const end2Local = RunwayLayoutDiagramUtils.projectToLocalMeters(airportPoint, end2);

      const x1 = end1Local[0];
      const y1 = end1Local[1];
      const x2 = end2Local[0];
      const y2 = end2Local[1];

      endpoints.push({ x1, y1, x2, y2 });

      minX = Math.min(minX, x1, x2);
      maxX = Math.max(maxX, x1, x2);
      minY = Math.min(minY, y1, y2);
      maxY = Math.max(maxY, y1, y2);
    }

    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY) || minX === maxX || minY === maxY) {
      return {
        path: '',
        viewBox: `0 0 ${svgWidth} ${svgHeight}`,
        width: svgWidth,
        height: svgHeight,
        hasRunways: false,
        runwayPaths: [],
      };
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;

    const effectiveWidth = Math.max(svgWidth - 2 * margin, 1);
    const effectiveHeight = Math.max(svgHeight - 2 * margin, 1);

    const scaleX = effectiveWidth / spanX;
    const scaleY = effectiveHeight / spanY;
    const scale = Math.min(scaleX, scaleY);

    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;

    const svgCenterX = svgWidth * 0.5;
    const svgCenterY = svgHeight * 0.5;

    const pathStream = new SvgPathStream(precision);
    pathStream.beginPath();

    // One path stream per runway so we can highlight by index.
    const perRunwayStreams = runways.map(() => {
      const s = new SvgPathStream(precision);
      s.beginPath();
      return s;
    });

    // scale and center into the SVG coordinate system.
    for (let i = 0; i < endpoints.length; i++) {
      const ep = endpoints[i];

      const x1Svg = (ep.x1 - centerX) * scale + svgCenterX;
      const y1Svg = -(ep.y1 - centerY) * scale + svgCenterY;
      const x2Svg = (ep.x2 - centerX) * scale + svgCenterX;
      const y2Svg = -(ep.y2 - centerY) * scale + svgCenterY;

      pathStream.moveTo(x1Svg, y1Svg);
      pathStream.lineTo(x2Svg, y2Svg);

      const runwayStream = perRunwayStreams[i];
      runwayStream.moveTo(x1Svg, y1Svg);
      runwayStream.lineTo(x2Svg, y2Svg);
    }

    const path = pathStream.getSvgPath();
    const viewBox = `0 0 ${svgWidth} ${svgHeight}`;
    const runwayPaths = perRunwayStreams.map(s => s.getSvgPath());

    return {
      path,
      viewBox,
      width: svgWidth,
      height: svgHeight,
      hasRunways: true,
      runwayPaths,
    };
  }

  /**
   * Projects a geographic point into a local east/north Cartesian coordinate system, in meters.
   *
   * @param origin The origin of the local coordinate system.
   * @param point The geographic point to project.
   * @param out An optional vector to which to write the result. If not provided, a new vector will be created.
   * @returns The projected point, as `[east, north]`, in meters.
   */
  private static projectToLocalMeters(origin: GeoPoint, point: GeoPoint, out = new Float64Array(2)): Float64Array {
    const distanceRad = origin.distance(point);
    const bearingDeg = origin.bearingTo(point);
    const distanceMeters = UnitType.GA_RADIAN.convertTo(distanceRad, UnitType.METER);

    const bearingRad = bearingDeg * Math.PI / 180;

    out[0] = distanceMeters * Math.sin(bearingRad); // east
    out[1] = distanceMeters * Math.cos(bearingRad); // north

    return out;
  }
}

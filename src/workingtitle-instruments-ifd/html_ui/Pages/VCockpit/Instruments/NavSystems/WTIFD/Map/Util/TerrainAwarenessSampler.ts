import { GeoPoint, GeoPointInterface, UnitType } from '@microsoft/msfs-sdk';

/**
 * Enumeration of terrain proximity colors for classification.
 */
export enum TerrainColor {
  /** No terrain hazard. */
  None = 0,
  /** Terrain within caution threshold; caution. */
  Yellow = 1,
  /** Terrain within danger threshold; danger. */
  Red = 2,
}

/**
 * A single sampled terrain cell with its canvas position and classification.
 */
export interface TerrainCell {
  /** Canvas X coordinate */
  x: number;
  /** Canvas Y coordinate */
  y: number;
  /** Classification color indicating terrain proximity. */
  color: TerrainColor;
}

/**
 * Grid offset entry used in TerrainAwarenessSampler.
 */
export type OffsetEntry = {
  /** Compass bearing in degrees */
  bearingDeg: number;
  /** Distance for great-circle offset, in radians */
  distRad: number;
  /** Distance in nautical miles */
  distNm: number;
};

/**
 * A utility for building and classifying terrain sampling points around the aircraft.
 */
export class TerrainAwarenessSampler {
  /** Number of samples along each grid axis (odd so there is a center point). */
  private static readonly SAMPLE_SIZE = 41;
  /** Spacing between samples, in nautical miles. */
  public static readonly SAMPLE_SPACING_NM = 0.5;
  /** Scratch GeoPoint to avoid allocations. */
  private static readonly scratch = new GeoPoint(0, 0);
  /** Buffer for sampling results, reused to avoid array allocations. */
  private readonly sampleBuffer: LatLong[] = [];
  /** Precomputed offset template (bearing, radial distance) for grid. */
  private static readonly OFFSETS_TEMPLATE = TerrainAwarenessSampler.generateOffsetsTemplate();

  /**
   * Builds a circular grid of lat/long points around the aircraft position.
   * @param center The aircraft position (lat/lon).
   * @param batchSize The number of points to put in each batch.
   * @param out The array to write batches of points to be sampled. It will be resized as needed.
   * @param filter filter A predicate to filter out sample points that don't fit a critera. All points will be included if undefined.
   * @returns The bataches of sample points (out array).
   */
  public buildSampleGrid(
    center: Readonly<GeoPointInterface>,
    batchSize: number,
    out: LatLong[][],
    filter?: (point: GeoPointInterface, centrePoint: GeoPointInterface) => boolean,
  ): LatLong[][] {
    let batchIndex = 0;
    let sampleIndex = 0;

    const scratch = TerrainAwarenessSampler.scratch;

    for (const offset of TerrainAwarenessSampler.OFFSETS_TEMPLATE) {
      scratch.set(center.lat, center.lon);
      scratch.offset(offset.bearingDeg, offset.distRad);

      if (filter !== undefined && !filter(scratch, center)) {
        continue;
      }

      if (sampleIndex >= batchSize) {
        batchIndex++;
        sampleIndex = 0;
      }

      if (!out[batchIndex]) {
        out[batchIndex] = [];
      }

      if (sampleIndex >= out[batchIndex].length) {
        out[batchIndex].push(new LatLong(scratch.lat, scratch.lon));
      } else {
        out[batchIndex][sampleIndex].set(scratch.lat, scratch.lon);
      }

      sampleIndex++;
    }

    out[batchIndex].length = sampleIndex;
    out.length = batchIndex + 1;

    return out;
  }

  /**
   * Generates the full grid of offset entries once, to avoid per-frame math.
   * @returns An array of objects containing bearingDeg, distRad, and distNm for each sample
   */
  private static generateOffsetsTemplate(): OffsetEntry[] {
    const tmp: OffsetEntry[] = [];
    const half = (TerrainAwarenessSampler.SAMPLE_SIZE - 1) / 2;
    for (let y = -half; y <= half; y++) {
      for (let x = -half; x <= half; x++) {
        const dxNm = x * TerrainAwarenessSampler.SAMPLE_SPACING_NM;
        const dyNm = y * TerrainAwarenessSampler.SAMPLE_SPACING_NM;
        const distNm = Math.hypot(dxNm, dyNm);
        // Note: swap dx/dy in atan2 so we get a bearing from north (0° = north, CW positive)
        const bearingDeg = Math.atan2(dxNm, dyNm) * (180 / Math.PI);
        const distRad = UnitType.NMILE.convertTo(distNm, UnitType.GA_RADIAN);
        tmp.push({ bearingDeg, distRad, distNm });
      }
    }
    return tmp;
  }

}

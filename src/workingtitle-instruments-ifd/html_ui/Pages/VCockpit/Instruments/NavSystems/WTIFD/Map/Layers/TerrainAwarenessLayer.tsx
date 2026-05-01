import {
  Accessible, FacilityLoader, GeoPoint, GeoPointInterface, LatLonInterface, MapCanvasLayerProps, MapOwnAirplanePropsModule, MapSyncedCanvasLayer,
  NearestAirportSubscription, Subscribable, TerrainProfileLoader, UnitType
} from '@microsoft/msfs-sdk';

import { TerrainAwarenessSampler, TerrainCell, TerrainColor } from '../Util/TerrainAwarenessSampler';

/** Props for {@link TerrainAwarenessLayer}. */
export interface TerrainAwarenessLayerProps
  extends MapCanvasLayerProps<{
    /** Module providing own airplane properties like position and altitude. */
    ownAirplaneProps: MapOwnAirplanePropsModule
  }> {
  /** Whether the airport exclusion radius is enabled. */
  airportExclusionEnabled: Accessible<boolean>;
  /** Whether terrain awareness overlay is enabled. */
  terrainAwarenessEnabled: Subscribable<boolean>;
  /** An instance of Facility Loader */
  facLoader: FacilityLoader;
}

/** The current step in the terrain sampling and drawing process. */
enum SampleStep {
  Idle,
  BuildingGrid,
  SamplingTerrain,
  Drawing,
}

/** A map layer that displays terrain awareness using colored rectangles based on proximity to terrain. */
export class TerrainAwarenessLayer extends MapSyncedCanvasLayer<TerrainAwarenessLayerProps> {
  /** The maximum number of terrain points that will be sampled in a single update/frame. */
  private static readonly ELEVATION_BATCH_SIZE = 128;
  /** The period to resample the terrain in ms. */
  private static readonly ELEVATION_SAMPLE_PERIOD = 1133;

  private static readonly MAX_SAMPLE_DISTANCE_FROM_CENTER = UnitType.GA_RADIAN.convertFrom(10, UnitType.NMILE);
  private static readonly MIN_SAMPLE_DISTANCE_FROM_AIRPORT = UnitType.GA_RADIAN.convertFrom(1, UnitType.NMILE);

  private static readonly latLonCache: LatLonInterface = { lat: NaN, lon: NaN };

  private readonly ownAirplaneProps = this.props.model.getModule('ownAirplaneProps');
  private readonly terrainLoader = new TerrainProfileLoader();
  private readonly sampler = new TerrainAwarenessSampler();
  private readonly airportSub: NearestAirportSubscription;

  // Cached objects to avoid per-frame allocations
  private readonly scratchCanvas = new Float64Array(2);

  /** The terrain cell drawing data. */
  private readonly terrainCells: TerrainCell[] = [];
  private lastSampleTime = 0;
  private lastSamplePosition = new GeoPoint(NaN, NaN);

  private sampleStep = SampleStep.Idle;

  /** The batches of lat/lon points we need to sample. One batch will be sampled per update to spread the work across multiple frames. */
  private readonly samplePointBatches: LatLong[][] = [];
  /** The batch that is currently being sampled, or samplePointBatches.length when all batches are done. */
  private sampleBatchIndex = 0;

  // Classification thresholds in meters
  private static readonly DANGER_M = UnitType.FOOT.convertTo(100, UnitType.METER);
  private static readonly CAUTION_M = UnitType.FOOT.convertTo(1000, UnitType.METER);

  /**
   * Creates an instance of TerrainAwarenessLayer.
   * @param props TerrainAwarenessLayerProps
   */
  public constructor(props: TerrainAwarenessLayerProps) {
    super(props);
    this.airportSub = new NearestAirportSubscription(this.props.facLoader);
  }


  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();
    this.airportSub.start();

    this.props.terrainAwarenessEnabled.sub((v) => {
      if (!v) {
        this.sampleStep = SampleStep.Idle;
        this.samplePointBatches.length = 0;
        this.sampleBatchIndex = 0;
        this.terrainCells.length = 0;
        this.clearCells();
      }
    });
  }

  /**
   * Called each frame; samples terrain about once per second and redraws overlay.
   * @param time Current update timestamp in milliseconds.
   */
  public onUpdated(time: number): void {
    if (this.props.terrainAwarenessEnabled.get() && this.sampleStep === SampleStep.Idle && time - this.lastSampleTime >= TerrainAwarenessLayer.ELEVATION_SAMPLE_PERIOD) {
      this.startSample();
      this.lastSampleTime = time;
    }
  }

  /** Starts a sampling run. */
  private startSample(): void {
    this.sampleStep = SampleStep.BuildingGrid;
    this.runSamplingStep();
  }

  /**
   * Checks whether the current sampling state is valid.
   * @returns Whether the current sampling state is valid.
   */
  private isSamplingStateValid(): boolean {
    if (!this.props.terrainAwarenessEnabled.get()) {
      return false;
    }

    if (this.samplePointBatches.length === 0) {
      return false;
    }

    if (this.sampleBatchIndex < 0 || this.sampleBatchIndex >= this.samplePointBatches.length) {
      return false;
    }

    return true;
  }

  /** Performs a batch of work for the current sampling step schdules the next if there are more remaining. */
  private runSamplingStep = async (): Promise<void> => {
    if (!this.props.terrainAwarenessEnabled.get()) {
      this.sampleStep = SampleStep.Idle;
      this.clearCells();
      return;
    }

    // We try to do only smaller chunks of work each frame, to spread the load over multiple frames.
    switch (this.sampleStep) {
      case SampleStep.BuildingGrid:
        await this.updateGrid();

        if (this.samplePointBatches.length > 0) {
          // setup to start sampling the terrain, starting with the next update/frame
          this.sampleBatchIndex = 0;
          this.sampleStep = SampleStep.SamplingTerrain;
        } else {
          this.clearCells();
          this.sampleStep = SampleStep.Idle;
        }
        break;

      case SampleStep.SamplingTerrain:
        if (!this.isSamplingStateValid()) {
          this.clearCells();
          this.sampleStep = SampleStep.Idle;
          break;
        }

        try {
          const batch = this.samplePointBatches[this.sampleBatchIndex];
          await this.sampleTerrainBatch(
            batch,
            this.sampleBatchIndex * TerrainAwarenessLayer.ELEVATION_BATCH_SIZE,
          );

          // The overlay can be disabled while awaiting terrain samples. Bail out immediately.
          if (!this.props.terrainAwarenessEnabled.get()) {
            this.clearCells();
            this.sampleStep = SampleStep.Idle;
            break;
          }

          this.sampleBatchIndex++;

          // We have finished sampling terrain, do move onto drawing next frame.
          if (this.sampleBatchIndex >= this.samplePointBatches.length) {
            // resize the array in case it was too big from last time.

            const lastBatch = this.samplePointBatches[this.samplePointBatches.length - 1];

            this.terrainCells.length =
              TerrainAwarenessLayer.ELEVATION_BATCH_SIZE * (this.samplePointBatches.length - 1) +
              lastBatch.length;

            this.sampleStep = SampleStep.Drawing;
          }

          // else the next batch will be sampled in the following frame
        } catch (e) {
          console.error('Terrain profile load failed', e);
          this.clearCells();
          this.sampleStep = SampleStep.Idle;
        }
        break;
      case SampleStep.Drawing:
        this.draw();
        this.sampleStep = SampleStep.Idle;
        break;
    }

    if (this.sampleStep !== SampleStep.Idle) {
      requestAnimationFrame(this.runSamplingStep);
    }
  };

  /**
   * Updates the sampling grid.
   */
  private async updateGrid(): Promise<void> {
    const ppos = this.ownAirplaneProps.position.get();
    if (ppos.isValid()) {
      this.lastSamplePosition.set(ppos);

      await this.updateAirportMasks(this.lastSamplePosition);
    }

    this.sampler.buildSampleGrid(
      this.lastSamplePosition,
      TerrainAwarenessLayer.ELEVATION_BATCH_SIZE,
      this.samplePointBatches,
      this.props.airportExclusionEnabled.get() ? this.filterSampleForAirportDist : undefined,
    );
  }

  /** Clears current terrain cells and redraws empty overlay. */
  private clearCells(): void {
    this.terrainCells.length = 0;
    this.draw();
  }

  private readonly filterSampleForAirportDist = (sample: GeoPointInterface, centre: GeoPointInterface): boolean => {
    if (centre.distance(sample) > TerrainAwarenessLayer.MAX_SAMPLE_DISTANCE_FROM_CENTER) {
      return false;
    }

    for (const fac of this.airportSub.getArray()) {
      if (GeoPoint.distance(sample.lat, sample.lon, fac.lat, fac.lon) <= TerrainAwarenessLayer.MIN_SAMPLE_DISTANCE_FROM_AIRPORT) {
        return false;
      }
    }

    return true;
  };

  /**
   * Samples terrain around own‑ship, but excludes any points within airport masks.
   * @param batch The batch of points to sample.
   * @param cellStartIndex The index in the terrainCells array that this batch starts at.
   */
  private async sampleTerrainBatch(batch: LatLong[], cellStartIndex: number): Promise<void> {
    const altitudeM = this.ownAirplaneProps.altitude.get().asUnit(UnitType.METER);

    const elevs: number[] = await this.terrainLoader.getTerrainProfileAtPoints(batch);

    for (let i = 0; i < elevs.length; i++) {
      const delta = altitudeM - elevs[i];
      let color = TerrainColor.None;
      if (delta < TerrainAwarenessLayer.DANGER_M) {
        color = TerrainColor.Red;
      } else if (delta < TerrainAwarenessLayer.CAUTION_M) {
        color = TerrainColor.Yellow;
      }

      TerrainAwarenessLayer.latLonCache.lat = batch[i].lat;
      TerrainAwarenessLayer.latLonCache.lon = batch[i].long;
      this.props.mapProjection.project(TerrainAwarenessLayer.latLonCache, this.scratchCanvas);

      const cellIndex = cellStartIndex + i;
      if (cellIndex >= this.terrainCells.length) {
        this.terrainCells.push({ x: this.scratchCanvas[0], y: this.scratchCanvas[1], color });
      } else {
        this.terrainCells[cellIndex].x = this.scratchCanvas[0];
        this.terrainCells[cellIndex].y = this.scratchCanvas[1];
        this.terrainCells[cellIndex].color = color;
      }
    }
  }

  /**
   * Updates the airport masks based on the current own‑ship position and radius.
   * @param center The center of the search area.
   */
  private async updateAirportMasks(center: GeoPointInterface): Promise<void> {
    if (!this.props.airportExclusionEnabled.get() || !center.isValid()) {
      return;
    }

    const radiusMeters = UnitType.NMILE.convertTo(12, UnitType.METER);
    const maxAirports = 15;

    await this.airportSub.update(
      center.lat,
      center.lon,
      radiusMeters,
      maxAirports
    );
  }

  /** Draws the current terrain overlay using fixed-size rectangles. */
  private draw(): void {
    const ctx = this.display.context;
    const [w, h] = this.props.mapProjection.getProjectedSize();
    ctx.clearRect(0, 0, w, h);

    const ownCenter = this.ownAirplaneProps.position.get();
    const nominalScale = this.props.mapProjection.getScaleFactor();
    const latRad = ownCenter.lat * (Math.PI / 180);
    const trueScale = nominalScale / Math.cos(latRad);

    const spacingRad = UnitType.NMILE.convertTo(TerrainAwarenessSampler.SAMPLE_SPACING_NM, UnitType.GA_RADIAN);
    const cellSize = spacingRad * trueScale * 1.4; // increase by 1.4 to create a hatched effect
    const half = cellSize / 2;

    for (const cell of this.terrainCells) {
      const { x, y, color } = cell;
      // Check if cell is within the visible area and has a color
      if (color === TerrainColor.None || x < -half || x > w + half || y < -half || y > h + half) {
        continue;
      }

      switch (color) {
        case TerrainColor.Yellow:
          ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
          break;
        case TerrainColor.Red:
          ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
          break;
        default:
          continue;
      }
      ctx.fillRect(x - half, y - half, cellSize, cellSize);
    }
  }
}

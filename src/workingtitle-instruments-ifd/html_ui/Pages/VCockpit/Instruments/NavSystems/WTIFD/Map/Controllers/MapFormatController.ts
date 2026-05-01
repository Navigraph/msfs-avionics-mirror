/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BingComponent, BitFlags, DebounceTimer, MapBingLayer, MapLayer, MappedSubject, MapProjection, MapProjectionChangeType, MapRotationModule, MapSystemContext,
  MapSystemController, MapSystemKeys, MapWxrModule, NavEvents, Subscribable, Vec2Math, VecNMath
} from '@microsoft/msfs-sdk';

import { MapFormatConfig, MapFormatFeatures, TerrWxState } from '../MapCommon';
import { MapKeys } from '../MapKeys';
import { MapTerrainWeatherStateModule } from '../Modules/MapTerrainWeatherStateModule';

/** Modules required by MapFormatController. */
export interface MapFormatControllerModules {

  /** Rotation module. */
  [MapSystemKeys.Rotation]: MapRotationModule;

  /** Weather module. */
  [MapSystemKeys.Weather]: MapWxrModule;

  /** Terrain/weather state module. */
  [MapKeys.TerrainWeatherState]: MapTerrainWeatherStateModule;
}

/** Enforces that the layers be MapLayers. */
interface GenericMapFormatControllerLayers {
  [key: string]: MapLayer
}

/** Layers required by MapFormatController. */
export interface MapFormatControllerLayers extends GenericMapFormatControllerLayers {
  /** Bing Map layer. */
  [MapSystemKeys.Bing]: MapBingLayer;

  // TODO
  // /** Triangle ownship layer */
  //[MapKeys.OwnShipTriLayer]: MapOwnAirplaneLayer;

  // /** Airplane outline ownship layer */
  // [MapKeys.OwnShipOutlineLayer]: MapOwnAirplaneLayer;

  // /** Triangle ownship cross track error layer */
  // [MapKeys.OwnShipXtkErrorLayer]: MapCrossTrackErrorLayer;
}

/**
 * A map system controller that controls the display settings of the various format
 * and terrain/wxr combinations.
 */
export abstract class MapFormatController<L extends MapFormatControllerLayers = MapFormatControllerLayers>
  extends MapSystemController<MapFormatControllerModules, L> {

  protected readonly terrainWeatherStateModule = this.context.model.getModule(MapKeys.TerrainWeatherState);
  protected readonly weatherModule = this.context.model.getModule(MapSystemKeys.Weather);
  private readonly rotationModule = this.context.model.getModule(MapSystemKeys.Rotation);
  private readonly bingMapDebounceTimer = new DebounceTimer();

  protected readonly bingLayer? = this.context.getLayer(MapSystemKeys.Bing);

  private currentFormatLayerKeys: readonly string[] = [];

  public static readonly WX_NEXRAD_COLORS: readonly (readonly [number, number])[] = [
    [BingComponent.hexaToRGBAColor('#00000000'), 0.03],
    [BingComponent.hexaToRGBAColor('#04d404ff'), 0.25],
    [BingComponent.hexaToRGBAColor('#04ab04ff'), 2.5],
    [BingComponent.hexaToRGBAColor('#ffff00ff'), 11.5],
    [BingComponent.hexaToRGBAColor('#fbe304ff'), 15.4],
    [BingComponent.hexaToRGBAColor('#fbab04ff'), 22.5],
    [BingComponent.hexaToRGBAColor('#fb6b04ff'), 26],
    [BingComponent.hexaToRGBAColor('#fb0404ff'), 28],
    [BingComponent.hexaToRGBAColor('#ff00ffff'), 50],
  ];

  /**
   * Creates an instance of the MapFormatController.
   * @param context The map system context to use with this controller.
   * @param currentMapFormatConfig A subscribable for the current map format config.
   * @param terrWxState A subscribable for the current terr wx state.
   * @param tfcEnabled A subscribable for whether tfc is enabled.
   */
  constructor(
    context: MapSystemContext<MapFormatControllerModules>,
    protected readonly currentMapFormatConfig: Subscribable<MapFormatConfig>,
    protected readonly terrWxState: Subscribable<TerrWxState>,
    protected readonly tfcEnabled: Subscribable<boolean>
  ) {
    super(context);

    this.weatherModule.weatherRadarArc.set(100);
    this.weatherModule.weatherRadarMode.set(EWeatherRadar.TOPVIEW);
  }

  /** @inheritdoc */
  public override onWake(): void {
    // To prevent artifacts when switching eicas or changing map size
    this.tempHideBingMap();
  }

  /** @inheritdoc */
  public override onMapProjectionChanged(_mapProjection: MapProjection, changeFlags: number): void {
    if (BitFlags.isAny(changeFlags, MapProjectionChangeType.ProjectedSize | MapProjectionChangeType.RangeEndpoints)) {
      // To prevent artifacts when switching eicas or changing map size
      // this.tempHideBingMap();
    }
  }

  /** @inheritdoc */
  public override onAfterMapRender(): void {
    // Bing layer should always be visible so that you can use the airport map
    this.bingLayer?.setVisible(true);

    this.currentMapFormatConfig.sub(this.handleFormatConfigChanged.bind(this), true);

    MappedSubject.create(
      ([desiredState, config, wxRadarMode]) => {
        switch (desiredState) {
          case 'TERR':
            if (BitFlags.isAll(config.features, MapFormatFeatures.Terrain)) {
              return 'TERR';
            }
            break;
          case 'WX': {
            if (BitFlags.isAll(config.features, MapFormatFeatures.NexradWeather)) {
              return 'WX';
            }
            break;
          }
        }
        return 'OFF';
      },
      this.terrWxState,
      this.currentMapFormatConfig,
      this.weatherModule.weatherRadarMode,
    ).pipe(this.terrainWeatherStateModule.state);

    this.terrainWeatherStateModule.state.pipe(this.weatherModule.isEnabled, state => state === 'WX');

    this.weatherModule.weatherRadarColors.set(MapFormatController.WX_NEXRAD_COLORS);

    // MappedSubject.create(
    //   ([tfcEnabled, config]) => tfcEnabled && this.checkFeatureAvailability(MapFormatFeatures.Traffic, config),
    //   this.tfcEnabled,
    //   this.currentMapFormatConfig
    // ).pipe(this.trafficModule.show);

    // This hides any artifacting that occurs when wxr is toggled and imulate wxr/terr loading
    // this.terrainWeatherStateModule.state.sub(this.tempHideBingMap.bind(this));

    this.context.bus.getSubscriber<NavEvents>().on('gps_obs_active').whenChanged().handle(this.onObsActiveChanged.bind(this));
  }

  /**
   * Check if the current map format supports this feature.
   * @param feature The MapFormatFeature that needs checking.
   * @param config the map format config to check. Defaults to current config.
   * @returns A boolean.
   */
  private checkFeatureAvailability(feature: MapFormatFeatures, config = this.currentMapFormatConfig.get()): boolean {
    return BitFlags.isAll(config.features, feature);
  }

  /** Temporarily hides the bing map. */
  private tempHideBingMap(): void {
    this.bingLayer?.setVisible(false);
    this.bingMapDebounceTimer.schedule(() => {
      this.bingLayer?.setVisible(true);
    }, 500);
  }

  /** Handles the map format config changing. */
  private handleFormatConfigChanged(): void {
    const mapFormatConfig = this.currentMapFormatConfig.get();

    this.updateOwnAirplaneIconOrientation(mapFormatConfig);
    this.updateMapProjection(mapFormatConfig);
    this.updateMapRotation(mapFormatConfig);
    this.updateOtherMapFeatures();
    this.updateLayerVisibility();
  }

  /**
   * Update own air plane icon's orientation when map config changes.
   * @param mapFormatConfig The current map format config.
   */
  private updateOwnAirplaneIconOrientation(mapFormatConfig: MapFormatConfig): void {
    // TODO
    //this.ownAirplaneIconModule.orientation.set(mapFormatConfig.ownAirplaneIconRotationType);
  }

  /**
   * Update map projection when map config changes.
   * @param mapFormatConfig The current map format config.
   */
  private updateMapProjection(mapFormatConfig: MapFormatConfig): void {
    this.context.projection.setQueued({ targetProjectedOffset: this.getOffset(mapFormatConfig) });
    this.context.projection.setQueued({ rangeEndpoints: this.getRangeEndpoints(mapFormatConfig) });
  }

  /**
   * Update the map rotation setting and rotation module when map config changes.
   * @param mapFormatConfig The current map format config.
   */
  private updateMapRotation(mapFormatConfig: MapFormatConfig): void {
    this.rotationModule.rotationType.set(mapFormatConfig.rotationType);
  }

  /** Update map's:
   * - Flight plan
   * - Altitude arc
   * - Trend vector, and
   * - Traffic's
   * availability and visibility when map config changes.
   * Terrain / weather are handled separatedly in `onAfterRender()` method.
   */
  private updateOtherMapFeatures(): void {
    // TODO
    // this.altitudeArcModule.show.set(this.checkFeatureAvailability(MapFormatFeatures.AltitudeArc));
    // this.positionTrendVectorModule.show.set(this.checkFeatureAvailability(MapFormatFeatures.PositionTrendVector));

    const isFlightPlanSupported = this.checkFeatureAvailability(MapFormatFeatures.FlightPlan);
    // All layers that are related to flight plan layer.
    // TODO
    // this.todLayer.setVisible(isFlightPlanSupported);
    // this.textLayer.setVisible(isFlightPlanSupported);
    // this.waypointLayer.setVisible(isFlightPlanSupported);
  }

  /**
   * Sets the map target offset for the specified format.
   * @param formatConfig The format config to use.
   * @returns The target projected offset.
   */
  protected getOffset(formatConfig: MapFormatConfig): Float64Array {
    return Vec2Math.create(0, formatConfig.targetProjectedOffsetY);
  }

  /**
   * Calculates the range endpoints for a given format config.
   * @param formatConfig The format config to use.
   * @returns The calculated range endpoints.
   */
  protected getRangeEndpoints(formatConfig: MapFormatConfig): Float64Array {
    const formatCenterY = (formatConfig.mapHeight / 2) + formatConfig.targetProjectedOffsetY;

    // With arc style formats, the lower endpoint is just the center
    const lowerEndpoint = formatConfig.compassType === 'arc'
      ? formatCenterY
      : formatCenterY + formatConfig.compassRadius;

    // Upper endpoint is same for both compass types
    const upperEndpoint = formatCenterY - (formatConfig.compassType === 'arc' ? formatConfig.compassRadius * 2 : formatConfig.compassRadius);

    // Divide by map height to make it a ratio
    // We put 0.5 for the x value because all the formats are centered horizontally
    const rangeEndpoints = VecNMath.create(4,
      0.5, lowerEndpoint / formatConfig.mapHeight,
      0.5, upperEndpoint / formatConfig.mapHeight);

    return rangeEndpoints;
  }

  /** Hides the layers for the previous format, and enbales the ones for the new format. */
  private updateLayerVisibility(): void {
    const mapFormatConfig = this.currentMapFormatConfig.get();

    this.currentFormatLayerKeys.forEach(layerKey => {
      // FYI Make sure all layers extend MapLayer
      (this.context.getLayer(layerKey))?.setVisible(false);
    });

    this.currentFormatLayerKeys = mapFormatConfig.layerKeys;

    this.currentFormatLayerKeys.forEach(layerKey => {
      // FYI Make sure all layers extend MapLayer
      (this.context.getLayer(layerKey))?.setVisible(true);
    });
  }

  /**
   * Handles when OBS becomes active or inactive.
   * @param isActive Whether or not OBS is active.
   */
  private onObsActiveChanged(isActive: boolean): void {
    this.context.getLayer(MapSystemKeys.FlightPlan)?.setVisible(!isActive);
    this.context.getLayer(MapKeys.Obs)?.setVisible(isActive);
  }
}

import { MappedSubject, MapRotation, MapSystemContext } from '@microsoft/msfs-sdk';

import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { MapOrientationSettingMode } from '../../Settings/MapUserSettings';
import { TerrainUserSettings } from '../../Settings/TerrainUserSettings';
import { MapCommon, MapFormatConfig } from '../MapCommon';
import { MapKeys } from '../MapKeys';
import { MapSizes } from '../MapSizes';
import { MapSystemCommon } from '../MapSystemCommon';
import { TERRAIN_MODE } from '../Modules/MapTerrainWeatherStateModule';
import { MapFormatController, MapFormatControllerModules } from './MapFormatController';

const HDG_TRK_UP_LAYER_KEYS = [
  MapKeys.HeadingUpOverlay,
  ...MapCommon.HDG_TRK_UP_FORMAT_COMMON_LAYER_KEYS,
] as readonly string[];

const NORTH_UP_LAYER_KEYS = [
  MapKeys.NorthUpOverlay,
  ...MapCommon.NORTH_UP_FORMAT_COMMON_LAYER_KEYS,
] as readonly string[];

/**
 * A map system controller that controls the display settings of the various format
 * and terrain/wxr combinations.
 */
export class FormatController extends MapFormatController {
  private static readonly MAP_FORMAT_CONFIGS = {
    [MapOrientationSettingMode.NorthUp]: {
      rotationType: MapRotation.NorthUp,
      compassType: 'center',
      targetProjectedOffsetY: 0,
      compassRadius: MapSystemCommon.northUpCompassRadius,
      mapHeight: MapSizes.full.height,
      layerKeys: NORTH_UP_LAYER_KEYS,
      ...MapCommon.NORTH_UP_DEFAULT_CONFIG,
    },
    [MapOrientationSettingMode.HeadingUp]: {
      rotationType: MapRotation.HeadingUp,
      compassType: 'center',
      targetProjectedOffsetY: 0,
      compassRadius: MapSystemCommon.hdgTrkUpCompassRadius,
      mapHeight: MapSizes.full.height,
      layerKeys: HDG_TRK_UP_LAYER_KEYS,
      ...MapCommon.HDG_TRK_UP_DEFAULT_CONFIG,
    },
    [MapOrientationSettingMode.TrackUp]: {
      rotationType: MapRotation.TrackUp,
      compassType: 'arc',
      targetProjectedOffsetY: MapSystemCommon.hdgTrkUpOffsetY,
      compassRadius: MapSystemCommon.hdgTrkUpCompassRadius,
      mapHeight: MapSizes.full.height,
      layerKeys: HDG_TRK_UP_LAYER_KEYS,
      ...MapCommon.HDG_TRK_UP_DEFAULT_CONFIG,
    },
  } as const;

  /**
   * Gets a record of map format configs corresponding to a display mode
   * @returns A record of map format configs corresponding
   */
  private static getMapFormatConfigs(): Readonly<Record<MapOrientationSettingMode, MapFormatConfig>> {
    return FormatController.MAP_FORMAT_CONFIGS;
  }

  /**
   * Creates an instance of the MapFormatController.
   * @param context The map system context to use with this controller.
   * @param mapDataProvider The map data provider to use.
   */
  constructor(
    context: MapSystemContext<MapFormatControllerModules>,
    private readonly mapDataProvider: MapDataProvider
  ) {
    const currentMapFormatConfig = mapDataProvider.mapOrientation.map((mapFormat) => FormatController.getMapFormatConfigs()[mapFormat]);

    super(
      context,
      currentMapFormatConfig,
      mapDataProvider.settings.getSetting('terrWxState'),
      mapDataProvider.settings.getSetting('tfcEnabled'),
    );

    // Start with all map format layers hidden.
    this.hideAllMapFormatLayers();
  }

  /** @inheritdoc */
  public override onAfterMapRender(): void {
    super.onAfterMapRender();
    const terrWxModule = this.context.model.getModule(MapKeys.TerrainWeatherState);

    const terrainMode = MappedSubject.create(([isGeoTerrainEnabled, isSATerrainEnabled]) => {
      return isSATerrainEnabled ? TERRAIN_MODE.SA : isGeoTerrainEnabled ? TERRAIN_MODE.GEO : TERRAIN_MODE.OFF;
    },
      TerrainUserSettings.getManager(this.context.bus).getSetting('terrainAwarenessEnabled'),
      this.mapDataProvider.settings.getSetting('saTerrainEnabled') // FIXME seems to be unused?
    );
    terrainMode.pipe(terrWxModule.terrainMode);
  }

  /** Hide all layers associated with map formats. */
  private hideAllMapFormatLayers(): void {
    for (const formatConfig of Object.values(FormatController.getMapFormatConfigs())) {
      formatConfig.layerKeys.forEach((x) => this.context.getLayer(x)?.setVisible(false));
    }
  }
}

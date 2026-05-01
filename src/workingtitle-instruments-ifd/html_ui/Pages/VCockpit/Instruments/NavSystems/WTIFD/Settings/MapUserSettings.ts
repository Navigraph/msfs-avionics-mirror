import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

import { TerrWxState } from '../Map/MapCommon';
import { MapDeclutterMode } from '../Map/Modules/MapDeclutterModule';

export enum TrafficAltitudeMode {
  Normal = 'Normal',
  Above = 'Above',
  Unlimited = 'Unlimited',
  Below = 'Below',
  Ground = 'Ground'
}
/**
 * Setting modes for map orientation.
 */
export enum MapOrientationSettingMode {
  HeadingUp = 'Heading Up',
  TrackUp = 'Track Up',
  NorthUp = 'North Up',
}

/**
 * Setting modes for map airport filter
 */
export enum MapAirportFilterMode {
  Towered = 'Towered',
  NonTowered = 'NonTowered',
  All = 'All'
}

/**
 * Setting modes for map airport fuel filter
 */
export enum MapAirportFuelMode {
  All = 'All',
  JetA = 'JetA',
  OneHundredLL = '100LL',
}

/**
 * Setting modes for map airport runway surface.
 */
export enum MapAirportRunwaySurfaceMode {
  All = 'All',
  Soft = 'Soft',
  Hard = 'Hard',
  Water = 'Water'
}

/**
 * Setting modes for map declutter.
 */
export enum MapDetailLevelMode {
  Level1 = MapDeclutterMode.Level1,
  Level2 = MapDeclutterMode.Level2,
  Level3 = MapDeclutterMode.Level3
}

/**
 * The available map presets.
 */
export enum MapPresetType {
  FactorySettings = 'map-factory-settings',
  IfrSettings = 'map-ifr-settings',
  VfrSettings = 'map-vfr-settings',
  CustomSettings = 'map-custom-settings'
}

/**
 * Type descriptions for map user settings.
 */
export type MapUserSettingTypes = {
  /** The orientation setting. */
  mapOrientation: MapOrientationSettingMode;

  /** The map airport filter setting. */
  mapAirportFilter: MapAirportFilterMode;

  /** The map airport fuel filter setting. */
  mapAirportFuel: MapAirportFuelMode;

  /** The map airport runway surface filter setting. */
  mapAirportRunwaySurface: MapAirportRunwaySurfaceMode;

  /** The map airport runway length filter setting in FT. */
  mapAirportRunwayLength: number;

  /** The map altitude filter setting. */
  mapAltitudeFilter: boolean;

  /** The map compass rose display setting. */
  mapCompassRose: boolean;

  /** The map heading box display setting. */
  mapHeadingBox: boolean;

  /** The map special use airspace display setting. */
  mapSpecialUseAirspace: boolean;

  /** The map special use airspace range setting in NM. */
  mapSpecialUseAirspaceRange: number;

  /** The map special use airspace detail level setting. */
  mapSpecialUseAirspaceDetailLevel: MapDetailLevelMode;

  /** The map VORs display setting. */
  mapVors: boolean;

  /** The map VORs labels display setting. */
  mapVorsLabels: boolean;

  /** The map VORs range setting in NM. */
  mapVorsRange: number;

  /** The map VORs detail level setting. */
  mapVorsDetailLevel: MapDetailLevelMode;

  /** The map towered airports display setting. */
  mapAirportsTowered: boolean;

  /** The map towered airports labels display setting. */
  mapAirportsToweredLabels: boolean;

  /** The map towered airports range setting in NM */
  mapAirportsToweredRange: number;

  /** The map towered airports detail level setting. */
  mapAirportsToweredDetailLevel: MapDetailLevelMode;

  /** The map non-towered airports display setting. */
  mapAirportsNonTowered: boolean;

  /** The map non-towered airports labels display setting. */
  mapAirportsNonToweredLabels: boolean;

  /** The map non-towered airports range setting in NM. */
  mapAirportsNonToweredRange: number;

  /** The map non-towered airports detail level setting. */
  mapAirportsNonToweredDetailLevel: MapDetailLevelMode;

  /** The map Class A/B/C airspace display setting. */
  mapClassABCAirspace: boolean;

  /** The map Class A/B/C airspace range setting in NM. */
  mapClassABCAirspaceRange: number;

  /** The map Class A/B/C airspace detail level setting. */
  mapClassABCAirspaceDetailLevel: MapDetailLevelMode;

  /** The map Class A/B/C airspace altitude setting in FT. */
  mapClassABCAirspaceAltitude: number;

  /** The map Class D airspace display setting. */
  mapClassDAirspace: boolean;

  /** The map Class D airspace range setting in NM. */
  mapClassDAirspaceRange: number;

  /** The map Class D airspace detail level setting. */
  mapClassDAirspaceDetailLevel: MapDetailLevelMode;

  /** The map Class D airspace altitude setting in FT. */
  mapClassDAirspaceAltitude: number;

  /** The map Comm airspace display setting. */
  mapCommAirspace: boolean;

  /** The map Comm airspace range setting in NM. */
  mapCommAirspaceRange: number;

  /** The map Comm airspace detail level setting. */
  mapCommAirspaceDetailLevel: MapDetailLevelMode;

  /** The map Comm airspace altitude setting in FT. */
  mapCommAirspaceAltitude: number;

  /** The map high obstacles display setting. */
  mapHighObstacles: boolean;

  /** The map high obstacles labels display setting. */
  mapHighObstaclesLabels: boolean;

  /** The map high obstacles range setting in NM. */
  mapHighObstaclesRange: number;

  /** The map high obstacles detail level setting. */
  mapHighObstaclesDetailLevel: MapDetailLevelMode;

  /** The map high obstacles altitude setting in FT. */
  mapHighObstaclesAltitude: number;

  /** The map low obstacles display setting. */
  mapLowObstacles: boolean;

  /** The map low obstacles labels display setting. */
  mapLowObstaclesLabels: boolean;

  /** The map low obstacles range setting in NM. */
  mapLowObstaclesRange: number;

  /** The map low obstacles detail level setting. */
  mapLowObstaclesDetailLevel: MapDetailLevelMode;

  /** The map low obstacles altitude setting in FT. */
  mapLowObstaclesAltitude: number;

  /** The map intersections display setting. */
  mapIntersections: boolean;

  /** The map Victor airways display setting. */
  mapVictorAirways: boolean;

  /** The map Victor airways labels display setting. */
  mapVictorAirwaysLabels: boolean;

  /** The map Victor airways range setting in NM. */
  mapVictorAirwaysRange: number;

  /** The map Victor airways detail level setting. */
  mapVictorAirwaysDetailLevel: MapDetailLevelMode;

  /** The map Victor airways altitude setting in FT. */
  mapVictorAirwaysAltitude: number;

  /** The map Jet airways display setting. */
  mapJetAirways: boolean;

  /** The map VFR airways display setting. */
  mapVfrAirways: boolean;

  /** The map user waypoints display setting. */
  mapUserWaypoints: boolean;

  /** The map NDBs display setting. */
  mapNdbs: boolean;

  /** The map non-TA traffic display setting. */
  mapNonTaTraffic: boolean;

  /** The map power lines display setting. */
  mapPowerLines: boolean;

  /** The map interstate highways display setting. */
  mapInterStates: boolean;

  /** The map flight plan labels display setting. */
  mapFlightPlanLabels: boolean;

  /** Map range in NM. */
  mapRange: number;

  /** Datablock Map range in NM. */
  datablockMapRange: number;

  /** Show VSD **/
  vsdEnabled: boolean;

  /** terrWxState **/
  terrWxState: TerrWxState;

  /** Traffic enabled **/
  tfcEnabled: boolean;

  /** SA Terrain enabled **/
  saTerrainEnabled: boolean;

  /** Land Declutter setting. */
  landDeclutter: MapDeclutterMode;

  /** Navigation Declutter setting. */
  navDeclutter: MapDeclutterMode;

  /** Whether to show Non-TA traffic. */
  mapTrafficShow: boolean;

  /** Non-TA Traffic Range Index NM */
  mapTrafficRangeIndex: number;

  /** Whether to show NEXRAD weather or not. */
  mapNexradShow: boolean;

  /** NEXRAD maximum range setting. */
  mapNexradRangeIndex: number;

  /** Traffic altitude mode for the datablock **/
  trafficAltitudeMode: TrafficAltitudeMode;

  /** The last map preset used */
  lastPresetUsed: MapPresetType;
}


/**
 * A utility class for working with map user settings.
 */
export class MapUserSettings {
  private static INSTANCE: UserSettingManager<MapUserSettingTypes> | undefined;

  public static readonly UNSAVED_SETTINGS: (keyof MapUserSettingTypes)[] = [
    'mapNexradRangeIndex',
    'mapNexradShow',
  ];

  /**
   * Gets an instance of the map user settings manager.
   * @param bus The event bus.
   * @returns An instance of the map user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<MapUserSettingTypes> {
    return MapUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'mapOrientation',
        defaultValue: MapOrientationSettingMode.HeadingUp,
      },
      {
        name: 'mapAirportFilter',
        defaultValue: MapAirportFilterMode.All,
      },
      {
        name: 'mapAirportFuel',
        defaultValue: MapAirportFuelMode.All,
      },
      {
        name: 'mapAirportRunwaySurface',
        defaultValue: MapAirportRunwaySurfaceMode.All,
      },
      {
        name: 'mapAirportRunwayLength',
        defaultValue: 0,
      },
      {
        name: 'mapAltitudeFilter',
        defaultValue: true,
      },
      {
        name: 'mapCompassRose',
        defaultValue: true,
      },
      {
        name: 'mapHeadingBox',
        defaultValue: true,
      },
      {
        name: 'mapSpecialUseAirspace',
        defaultValue: true,
      },
      {
        name: 'mapSpecialUseAirspaceRange',
        defaultValue: 160,
      },
      {
        name: 'mapSpecialUseAirspaceDetailLevel',
        defaultValue: MapDetailLevelMode.Level1,
      },
      {
        name: 'mapVors',
        defaultValue: true,
      },
      {
        name: 'mapVorsLabels',
        defaultValue: true,
      },
      {
        name: 'mapVorsRange',
        defaultValue: 160,
      },
      {
        name: 'mapVorsDetailLevel',
        defaultValue: MapDetailLevelMode.Level1,
      },
      {
        name: 'mapAirportsTowered',
        defaultValue: true,
      },
      {
        name: 'mapAirportsToweredLabels',
        defaultValue: true,
      },
      {
        name: 'mapAirportsToweredRange',
        defaultValue: 100,
      },
      {
        name: 'mapAirportsToweredDetailLevel',
        defaultValue: MapDetailLevelMode.Level1,
      },
      {
        name: 'mapAirportsNonTowered',
        defaultValue: true,
      },
      {
        name: 'mapAirportsNonToweredLabels',
        defaultValue: true,
      },
      {
        name: 'mapAirportsNonToweredRange',
        defaultValue: 80,
      },
      {
        name: 'mapAirportsNonToweredDetailLevel',
        defaultValue: MapDetailLevelMode.Level1,
      },
      {
        name: 'mapClassABCAirspace',
        defaultValue: true,
      },
      {
        name: 'mapClassABCAirspaceRange',
        defaultValue: 30,
      },
      {
        name: 'mapClassABCAirspaceDetailLevel',
        defaultValue: MapDetailLevelMode.Level1,
      },
      {
        name: 'mapClassABCAirspaceAltitude',
        defaultValue: 2000,
      },
      {
        name: 'mapClassDAirspace',
        defaultValue: true,
      },
      {
        name: 'mapClassDAirspaceRange',
        defaultValue: 30,
      },
      {
        name: 'mapClassDAirspaceDetailLevel',
        defaultValue: MapDetailLevelMode.Level1,
      },
      {
        name: 'mapClassDAirspaceAltitude',
        defaultValue: 2000,
      },
      {
        name: 'mapCommAirspace',
        defaultValue: true,
      },
      {
        name: 'mapCommAirspaceRange',
        defaultValue: 30,
      },
      {
        name: 'mapCommAirspaceDetailLevel',
        defaultValue: MapDetailLevelMode.Level1,
      },
      {
        name: 'mapCommAirspaceAltitude',
        defaultValue: 2000,
      },
      {
        name: 'mapHighObstacles',
        defaultValue: true,
      },
      {
        name: 'mapHighObstaclesLabels',
        defaultValue: true,
      },
      {
        name: 'mapHighObstaclesRange',
        defaultValue: 50,
      },
      {
        name: 'mapHighObstaclesDetailLevel',
        defaultValue: MapDetailLevelMode.Level2,
      },
      {
        name: 'mapHighObstaclesAltitude',
        defaultValue: 1500,
      },
      {
        name: 'mapLowObstacles',
        defaultValue: true,
      },
      {
        name: 'mapLowObstaclesLabels',
        defaultValue: true,
      },
      {
        name: 'mapLowObstaclesRange',
        defaultValue: 40,
      },
      {
        name: 'mapLowObstaclesDetailLevel',
        defaultValue: MapDetailLevelMode.Level2,
      },
      {
        name: 'mapLowObstaclesAltitude',
        defaultValue: 1500,
      },
      {
        name: 'mapIntersections',
        defaultValue: false,
      },
      {
        name: 'mapVictorAirways',
        defaultValue: true,
      },
      {
        name: 'mapVictorAirwaysLabels',
        defaultValue: true,
      },
      {
        name: 'mapVictorAirwaysRange',
        defaultValue: 50,
      },
      {
        name: 'mapVictorAirwaysDetailLevel',
        defaultValue: MapDetailLevelMode.Level2,
      },
      {
        name: 'mapVictorAirwaysAltitude',
        defaultValue: 12000,
      },
      {
        name: 'mapJetAirways',
        defaultValue: false,
      },
      {
        name: 'mapVfrAirways',
        defaultValue: false,
      },
      {
        name: 'mapUserWaypoints',
        defaultValue: false,
      },
      {
        name: 'mapNexradShow',
        defaultValue: true
      },
      {
        name: 'mapNexradRangeIndex',
        defaultValue: 0
      },
      {
        name: 'mapNdbs',
        defaultValue: false,
      },
      {
        name: 'mapNonTaTraffic',
        defaultValue: true,
      },
      {
        name: 'mapPowerLines',
        defaultValue: true,
      },
      {
        name: 'mapInterStates',
        defaultValue: true,
      },
      {
        name: 'mapFlightPlanLabels',
        defaultValue: true,
      },
      {
        name: 'mapRange',
        defaultValue: 20
      },
      {
        name: 'vsdEnabled',
        defaultValue: false
      },
      {
        name: 'tfcEnabled',
        defaultValue: false
      },
      {
        name: 'terrWxState',
        defaultValue: 'TERR'
      },
      {
        name: 'saTerrainEnabled',
        defaultValue: true
      },
      {
        name: 'landDeclutter',
        defaultValue: MapDeclutterMode.Level3
      },
      {
        name: 'navDeclutter',
        defaultValue: MapDeclutterMode.Level2
      },
      {
        name: 'mapTrafficShow',
        defaultValue: true
      },
      {
        name: 'mapTrafficRangeIndex',
        defaultValue: 40
      },
      {
        name: 'trafficAltitudeMode',
        defaultValue: TrafficAltitudeMode.Normal
      },
      {
        name: 'datablockMapRange',
        defaultValue: 6
      },
      {
        name: 'lastPresetUsed',
        defaultValue: MapPresetType.FactorySettings,
      }
    ], true);
  }
}

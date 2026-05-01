/* eslint-disable max-len */
import {
  DefaultLodBoundaryCache, EventBus, FacilityLoader, FlightPlanner, FSComponent, ImageCache, MapFollowAirplaneModule, MapOwnAirplaneIconModule,
  MapOwnAirplaneIconOrientation, MapOwnAirplaneLayer, MapOwnAirplaneLayerModules, MapOwnAirplanePropsModule, MappedSubject, MapSystemBuilder,
  MapSystemBuilderTrafficOffScaleOobOptions, MapSystemContext, MapSystemKeys, MapTerrainColorsModule, MapTrafficIntruderIconFactory, MapTrafficModule,
  MutableSubscribable, ResourceModerator, SetSubject, Subject, SubscribableSetEventType, Subscription, TcasAlertLevel, TcasIntruder, UserSettingFromManager,
  UserSettingManager, VNode
} from '@microsoft/msfs-sdk';

import { FlightPlanIndex } from '../Fms';
import { IfdIcons } from '../IfdIcons';
import { MapDataProvider } from '../Providers/Map/MapDataProvider';
import { MapUserSettingTypes } from '../Settings/MapUserSettings';
import { TerrainUserSettings } from '../Settings/TerrainUserSettings';
import { TrafficUserSettings } from '../Settings/TrafficUserSettings';
import { TrafficSystem } from '../Systems/Traffic/TrafficSystem';
import { MapTrafficIntruderIcon } from './Components/MapTrafficIntruderIcon';
import { MapTrafficOffScaleStatus } from './Components/MapTrafficOffScaleStatus';
import { MapAirspaceVisController } from './Controllers/MapAirspaceVisController';
import { MapDragPanController, MapDragPanControllerModules } from './Controllers/MapDragPanController';
import { MapDragPanRTRController, MapDragPanRTRControllerModules } from './Controllers/MapDragPanRTRController';
import { MapIfdTrafficController, MapIfdTrafficControllerModules } from './Controllers/MapIfdTrafficController';
import { MapNexradController, MapNexradControllerModules, MapNexradUserSettings } from './Controllers/MapNexradController';
import { MapPanningRTRController, MapPanningRTRControllerContext, MapPanningRTRControllerModules } from './Controllers/MapPanningRTRController';
import { MapTerrainColorsController } from './Controllers/MapTerrainColorsController';
import { MapTrafficController, MapTrafficControllerModules } from './Controllers/MapTrafficController';
import { MapWaypointDisplayController, WaypointDisplayControllerContext, WaypointDisplayControllerModules } from './Controllers/MapWaypointDisplayController';
import { MapWxrController, MapWxrControllerModules } from './Controllers/MapWxrController';
import { IfdMapSystemPlanRenderer } from './IfdMapSystemPlanRenderer';
import { MapTodLayer } from './Layers/MapTodLayer';
import { TerrainAwarenessLayer } from './Layers/TerrainAwarenessLayer';
import { MapAirspaceRendering } from './MapAirspaceRendering';
import { MapKeys } from './MapKeys';
import { MapSystemCommon } from './MapSystemCommon';
import { MapSystemConfig } from './MapSystemConfig';
import { IfdMapIndexedRangeModule } from './Modules/IfdMapIndexedRangeModule';
import { AirspaceShowTypeMap } from './Modules/MapAirspaceShowTypes';
import { MapDeclutterMode } from './Modules/MapDeclutterModule';
import { MapDragPanModule } from './Modules/MapDragPanModule';
import { MapFlightPlanFocusModule } from './Modules/MapFlightPlanFocusModule';
import { MapIfdTrafficModule, TrafficIconOptions } from './Modules/MapIfdTrafficModule';
import { MapNexradModule } from './Modules/MapNexradModule';
import { MapOrientationModule } from './Modules/MapOrientationModule';
import { MapPanningModule } from './Modules/MapPanningModule';
import { MapStylesModule } from './Modules/MapStylesModule';
import { MapTerrainWeatherStateModule } from './Modules/MapTerrainWeatherStateModule';

import './Map.css';

ImageCache.addToCache('AIRPORT_TOWERED', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/airport_b.png');
ImageCache.addToCache('AIRPORT', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/airport_m.png');
ImageCache.addToCache('INTERSECTION', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/intersection.png');
ImageCache.addToCache('NDB', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/ndb.png');
ImageCache.addToCache('VOR', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/vor.png');
ImageCache.addToCache('FLIGHTPLAN', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/flightplan.png');
ImageCache.addToCache('FLIGHTPLAN_M', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/flightplan_m.png');
ImageCache.addToCache('FLIGHTPLAN_C', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/flightplan_c.png');
ImageCache.addToCache('TOD', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/tod.png');

ImageCache.addToCache(IfdIcons.FlightPlanWaypointWhite, '/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/fpln_w.png');
ImageCache.addToCache(IfdIcons.FlightPlanWaypointWhiteFlyover, '/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/fpln_flyover_w.png');
ImageCache.addToCache(IfdIcons.FlightPlanWaypointMagenta, '/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/fpln_m.png');
ImageCache.addToCache(IfdIcons.FlightPlanWaypointMagentaFlyover, '/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/fpln_flyover_m.png');
ImageCache.addToCache(IfdIcons.FlightPlanWaypointCyan, '/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/fpln_c.png');
ImageCache.addToCache(IfdIcons.FlightPlanWaypointCyanFlyover, '/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/fpln_flyover_c.png');

/** Collection of function to help build IFD map systems. */
export class MapBuilder {
  private readonly mapSystemConfig = new MapSystemConfig(
    MapSystemCommon.mapStyles,
    this.flightPlanner,
    this.bus,
  );

  /**
   * Creates a new MapBuilder.
   * @param bus the event bus.
   * @param mapDataProvider The map data provider.
   * @param facLoader The facility loader.
   * @param flightPlanner the flight planner.
   */
  public constructor(
    private readonly bus: EventBus,
    private readonly mapDataProvider: MapDataProvider,
    private readonly facLoader: FacilityLoader,
    private readonly flightPlanner: FlightPlanner,
  ) {
  }

  /**
   * Add the altitude arc.
   * @param builder The map system builder.
   * @returns The map system builder, after it has been configured.
   */
  public readonly withMapStyles = (builder: MapSystemBuilder): MapSystemBuilder => {
    return builder
      .withModule(MapKeys.MapStyles, () => new MapStylesModule(MapSystemCommon.mapStyles));
  };

  /**
   * The map builder for the airplane icon.
   * @param builder The map system builder.
   * @param iconSizePx The airplane icon size
   * @returns The map system builder, after it has been configured.
   */
  public readonly withAirplaneIcon = (
    builder: MapSystemBuilder,
    iconSizePx: number,
    // ownshipTriPath: string,
  ): MapSystemBuilder => {
    builder = builder
      .withOwnAirplanePropBindings([
        'position',
        { key: 'hdgTrue', topic: 'actual_hdg_deg_true' },
        'trackTrue',
        'altitude',
        'verticalSpeed',
        'groundSpeed',
        { key: 'isOnGround', topic: 'air_ground_on_ground' },
        'turnRate',
      ], 30)
      .withOwnAirplaneIconOrientation(MapOwnAirplaneIconOrientation.HeadingUp)
      .withContext(MapKeys.DesiredOrientationControl, () => new ResourceModerator(undefined))
      .withModule(MapSystemKeys.OwnAirplaneProps, () => new MapOwnAirplanePropsModule())
      .withModule(MapKeys.Range, () => new IfdMapIndexedRangeModule())
      .withModule(MapSystemKeys.OwnAirplaneIcon, () => new MapOwnAirplaneIconModule())
      .withModule(MapKeys.FlightPlanFocusModule, () => new MapFlightPlanFocusModule())
      .withModule(MapKeys.Orientation, () => new MapOrientationModule())
      .withLayer<MapOwnAirplaneLayer, MapOwnAirplaneLayerModules>(MapKeys.OwnShipTriLayer, (context): VNode => {
        const imageFilePath = Subject.create<string>('');
        const iconSize = Subject.create<number>(iconSizePx);
        const iconAnchor = Subject.create(new Float64Array([0, 0]));

        imageFilePath.set('coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/ifd-airplane-map.png');
        iconAnchor.set(new Float64Array([0.5, 0.5]));

        return (
          <MapOwnAirplaneLayer
            model={context.model}
            mapProjection={context.projection}
            imageFilePath={imageFilePath}
            iconSize={iconSize}
            iconAnchor={iconAnchor}
            class={'airplane-symbol-tri'}
          />
        );
      });

    return builder;
  };

  /**
   * Add the nearest waypoints layer.
   * @param builder The map system builder.
   * @param bus The event bus.
   * @param mapDataProvider The map data provider.
   * @returns The map system builder, after it has been configured.
   */
  public readonly withNearestWaypoints = (builder: MapSystemBuilder, bus: EventBus, mapDataProvider: MapDataProvider): MapSystemBuilder => {
    return builder.withNearestWaypoints(this.mapSystemConfig.configureMapWaypoints(bus, mapDataProvider), false, undefined, 'nearest-waypoints');
  };

  /**
   * Adds the terrain colors module.
   * @param builder The map system builder.
   * @returns The map system builder, after it has been configured.
   */
  public readonly withTerrainColors = (
    builder: MapSystemBuilder,
  ): MapSystemBuilder => {
    return builder
      .withModule(MapSystemKeys.TerrainColors, () => new MapTerrainColorsModule())
      .withModule(MapKeys.TerrainWeatherState, () => new MapTerrainWeatherStateModule())
      .withController(MapSystemKeys.TerrainColors, context => new MapTerrainColorsController(context, this.mapDataProvider));
  };

  /**
   * Add the flight plan layer.
   * @param builder The map system builder.
   * @param flightPlanner the flight planner.
  //  * @param perfPlanRepository The perfPlanRepository.
   * @param mapDataProvider The map data provider.
   * @returns The map system builder, after it has been configured.
   */
  public readonly withFlightPlans = (
    builder: MapSystemBuilder,
    flightPlanner: FlightPlanner,
    mapDataProvider: MapDataProvider,
  ): MapSystemBuilder => {

    return builder
      .withInit('init-flight-plans', (context) => {
        // Init the flight plans in case they already exist
        if (flightPlanner.hasFlightPlan(FlightPlanIndex.Active)) {
          context.model
            .getModule(MapSystemKeys.FlightPlan)
            .getPlanSubjects(FlightPlanIndex.Active)
            .flightPlan.set(
              flightPlanner.getFlightPlan(FlightPlanIndex.Active)
            );
        }
        if (flightPlanner.hasFlightPlan(FlightPlanIndex.ProcedurePreview)) {
          context.model.getModule(MapSystemKeys.FlightPlan)
            .getPlanSubjects(FlightPlanIndex.ProcedurePreview)
            .flightPlan.set(flightPlanner.getFlightPlan(FlightPlanIndex.ProcedurePreview));
        }
      })
      .withFlightPlan(this.mapSystemConfig.configureModFlightPlan(mapDataProvider),
        flightPlanner, FlightPlanIndex.ProcedurePreview, false, undefined, 'flight-plan-layer mod-flight-plan-map-layer')
      .withFlightPlan(
        this.mapSystemConfig.configureFlightPlan(mapDataProvider),
        flightPlanner,
        FlightPlanIndex.Active,
        false,
        undefined,
        'flight-plan-layer active-flight-plan-map-layer'
      )
      .withContext(MapSystemKeys.FlightPathRenderer, () => new IfdMapSystemPlanRenderer(1));

  };

  /**
   * Configures a map builder to generate a map which displays airspaces, and optionally binds the visibility of
   * airspaces to user settings.
   *
   * Adds the following...
   *
   * Context properties:
   * * `[MapSystemKeys.AirspaceManager]: GenericAirspaceRenderManager`
   *
   * Modules:
   * * `[MapSystemKeys.Airspace]: MapAirspaceModule`
   *
   * Layers:
   * * `[MapSystemKeys.Airspace]: MapAirspaceLayer`
   *
   * Controllers:
   * * `[MapKeys.AirspaceVisibility]: MapAirspaceVisController` (only with user settings support)
   * @param builder The map builder to configure.
   * @param settingManager A setting manager containing the user settings controlling airspace visibility. If not
   * defined, airspace visibility will not be controlled by user settings.
   * @param order The order to assign to the airspace layer. Layers with lower assigned order will be attached to the
   * map before and appear below layers with greater assigned order values. Defaults to the number of layers already
   * added to the map builder.
   * @returns The map builder, after it has been configured.
   */
  public readonly withAirspaces = (
    builder: MapSystemBuilder,
    settingManager?: UserSettingManager<MapUserSettingTypes>,
    order?: number
  ): MapSystemBuilder => {
    builder
      .withAirspaces(
        DefaultLodBoundaryCache.getCache(),
        AirspaceShowTypeMap.MAP,
        MapAirspaceRendering.selectRenderer,
        MapAirspaceRendering.renderOrder,
        undefined,
        order);

    if (settingManager) {
      builder.withController(MapKeys.AirspaceVisibility, context => new MapAirspaceVisController(context, settingManager));
    }

    return builder;
  };

  /**
   * Add the waypoint display controller.
   * @param builder The map system builder.
   * @param mfdSettings The mfd settings.
   * @param mapDataProvider The map data provider.
   * @returns The map system builder, after it has been configured.
   */
  public readonly withWaypointDisplayController = (builder: MapSystemBuilder, mfdSettings: UserSettingFromManager<MapUserSettingTypes, 'mapRange'>, mapDataProvider: MapDataProvider): MapSystemBuilder => {
    return builder
      .withController<MapWaypointDisplayController, WaypointDisplayControllerModules, any, any, WaypointDisplayControllerContext>(
        MapSystemKeys.WaypointDisplayController, context => new MapWaypointDisplayController(context, mapDataProvider, mfdSettings));
  };


  /**
   * Configures a map builder to generate a map which displays TCAS intruders.
   * @param mapBuilder The map builder to configure.
   * @param trafficSystem The traffic system from which to derive intruder data.
   * @param mapSettingManager A setting manager containing user settings controlling the display of traffic on maps. If
   * @param iconOptions Configuration options for intruder icons.
   * @param useOuterRangeAsOffScale Whether to use the outer traffic range defined in {@link MapTrafficModule} as
   * the off-scale traffic range.
   * @param offScaleStatus A mutable subscribable to update with the layer's off-scale traffic status.
   * @param iconFactory A function which creates intruder icons for the traffic display. If not defined, a default icon
   * of type {@link MapTrafficIntruderIcon} is created for each intruder.
   * @param initCanvasStyles A function which initializes global canvas styles for the traffic display.
   * system. If not defined, the display of map traffic will not be controlled by those settings.
   * not defined, the display of map traffic will not be controlled by those settings.
   * @param order The order to assign to the traffic layer. Layers with lower assigned order will be attached to the
   * map before and appear below layers with greater assigned order values. Defaults to the number of layers already
   * added to the map builder.
   * @returns The map builder, after it has been configured.
   */
  public readonly withTraffic = (
    mapBuilder: MapSystemBuilder,
    trafficSystem: TrafficSystem,
    mapSettingManager: UserSettingManager<MapUserSettingTypes>,
    iconOptions: TrafficIconOptions,
    useOuterRangeAsOffScale: boolean,
    offScaleStatus?: MutableSubscribable<MapTrafficOffScaleStatus>,
    iconFactory?: MapTrafficIntruderIconFactory,
    initCanvasStyles?: (context: CanvasRenderingContext2D) => void,
    order?: number
  ): MapSystemBuilder => {
    const canvasFont = `${iconOptions.fontSize}px ${iconOptions.font}`;

    const trafficSettingManager = TrafficUserSettings.getManager(this.bus);

    let offScaleOobOptions: ((context: MapSystemContext<any, any, any, any>) => MapSystemBuilderTrafficOffScaleOobOptions) | undefined;

    if (offScaleStatus !== undefined) {
      offScaleOobOptions = (context: MapSystemContext<any, any, any, any>): MapSystemBuilderTrafficOffScaleOobOptions => {
        const offScaleIntruders = SetSubject.create<TcasIntruder>();
        const oobIntruders = SetSubject.create<TcasIntruder>();

        const alertLevelSubs = new Map<TcasIntruder, Subscription>();

        const offScaleTAs = SetSubject.create();
        const offScaleRAs = SetSubject.create();

        const handler = (set: ReadonlySet<TcasIntruder>, type: SubscribableSetEventType, intruder: TcasIntruder): void => {
          if (type === SubscribableSetEventType.Added) {
            alertLevelSubs.set(
              intruder,
              intruder.alertLevel.sub(alertLevel => {
                if (alertLevel === TcasAlertLevel.ResolutionAdvisory) {
                  offScaleRAs.add(intruder);
                  offScaleTAs.delete(intruder);
                } else if (alertLevel === TcasAlertLevel.TrafficAdvisory) {
                  offScaleTAs.add(intruder);
                  offScaleRAs.delete(intruder);
                } else {
                  offScaleTAs.delete(intruder);
                  offScaleRAs.delete(intruder);
                }
              }, true)
            );
          } else {
            alertLevelSubs.get(intruder)?.destroy();
            alertLevelSubs.delete(intruder);
            offScaleTAs.delete(intruder);
            offScaleRAs.delete(intruder);
          }
        };

        offScaleIntruders.sub(handler);
        oobIntruders.sub(handler);

        const raTAHandler = (): void => {
          if (offScaleRAs.get().size > 0) {
            offScaleStatus.set(MapTrafficOffScaleStatus.RA);
          } else if (offScaleTAs.get().size > 0) {
            offScaleStatus.set(MapTrafficOffScaleStatus.TA);
          } else {
            offScaleStatus.set(MapTrafficOffScaleStatus.None);
          }
        };

        offScaleTAs.sub(raTAHandler);
        offScaleRAs.sub(raTAHandler);

        raTAHandler();

        return {
          offScaleIntruders,
          oobIntruders,
          oobOffset: context.deadZone
        };
      };
    }

    iconFactory ??= (
      intruder,
      context: MapSystemContext<{
        /**
         * MapOwnAirplanePropsModule
         */
        [MapSystemKeys.OwnAirplaneProps]: MapOwnAirplanePropsModule,
        /**
         * MapFollowAirplaneModule
         */
        [MapSystemKeys.FollowAirplane]: MapFollowAirplaneModule
        /**
         * MapTrafficModule
         */
        [MapSystemKeys.Traffic]: MapTrafficModule
        /**
         * MapIfdTrafficModule
         */
        [MapKeys.Traffic]: MapIfdTrafficModule
      }>
    ): MapTrafficIntruderIcon => new MapTrafficIntruderIcon(
      intruder,
      context.model.getModule(MapSystemKeys.Traffic),
      context.model.getModule(MapSystemKeys.OwnAirplaneProps),
      context.model.getModule(MapKeys.Traffic),
      context.model.getModule(MapSystemKeys.FollowAirplane),
      iconOptions
    );

    initCanvasStyles ??= (canvasContext): void => {
      canvasContext.textAlign = 'center';
      canvasContext.font = canvasFont;
    };

    mapBuilder
      .withModule(MapKeys.Traffic, () => new MapIfdTrafficModule(trafficSystem))
      .withTraffic(trafficSystem, iconFactory, initCanvasStyles, offScaleOobOptions, order, 'traffic')
      .withController<MapTrafficController, MapTrafficControllerModules>(MapSystemKeys.Traffic, context => {
        return new MapTrafficController(context, useOuterRangeAsOffScale);
      });

    if (trafficSettingManager !== undefined) {
      mapBuilder.withController<MapIfdTrafficController, MapIfdTrafficControllerModules>(
        MapKeys.Traffic,
        context => new MapIfdTrafficController(context, trafficSettingManager, mapSettingManager)
      );
    }

    return mapBuilder;
  };

  /**
   * Add the TOD to the map.
   * @param builder The map system builder.
   * @returns The map system builder, after it has been configured.
   */
  public readonly withTopOfDescent = (builder: MapSystemBuilder): MapSystemBuilder => builder
    .withLayer('tod', context => <MapTodLayer
      bus={context.bus}
      model={context.model}
      mapProjection={context.projection}
      waypointRenderer={context[MapSystemKeys.WaypointRenderer]}
      planner={this.flightPlanner}
    />
    );

  /**
   * Adds the terrain awareness layer to the provided map system builder.
   *
   * @param builder - The map system builder to which the terrain awareness layer should be added.
   * @param mapDataProvider - The map data provider.
   * @returns The updated map system builder with the terrain awareness layer included.
   */
  public readonly withTerrainAwareness = (builder: MapSystemBuilder, mapDataProvider: MapDataProvider): MapSystemBuilder => {
    return builder.withLayer(MapKeys.TerrainAwareness, context => {
      return (
        <TerrainAwarenessLayer
          model={context.model}
          mapProjection={context.projection}
          airportExclusionEnabled={TerrainUserSettings.getManager(context.bus).getSetting('fltaExclusionAreas')}
          terrainAwarenessEnabled={MappedSubject.create(([terrainAwarenessEnabled, previewMode]) => terrainAwarenessEnabled && !previewMode, TerrainUserSettings.getManager(context.bus).getSetting('terrainAwarenessEnabled'), mapDataProvider.previewMode)}
          facLoader={this.facLoader}
          class='terrain-awareness-layer'
        />
      );
    });
  };

  /**
   * Adds the panning to the provided map system builder.
   *
   * @param builder - The map system builder to which the terrain awareness layer should be added.
   * @returns The updated map system builder with the terrain awareness layer included.
   */
  public readonly withPanning = (builder: MapSystemBuilder): MapSystemBuilder => {
    return builder
      .withModule(MapKeys.Panning, () => new MapPanningModule())
      .withModule(MapKeys.DragPan, () => new MapDragPanModule())
      .withController<MapPanningRTRController, MapPanningRTRControllerModules, any, any, MapPanningRTRControllerContext>(
        MapKeys.PanningRTR,
        context => new MapPanningRTRController(context)
      )
      .withController<MapDragPanController, MapDragPanControllerModules, MapOwnAirplaneLayerModules>(MapKeys.DragPan, context => new MapDragPanController(context))
      .withController<MapDragPanRTRController, MapDragPanRTRControllerModules>(MapKeys.DragPanRTR, context => new MapDragPanRTRController(context));
  };

  /**
   * Adds the nextrad wx weather layer
   *
   * @param builder The map builder to configure.
   * @param minRangeIndex The minimum range index, inclusive, at which NEXRAD is visible. Defaults to `0`.
   * @param settingManager A user setting manager containing settings which control NEXRAD. If not defined, NEXRAD will
   * not be controlled by user settings.
   * @param maxDeclutterMode The highest global declutter mode, inclusive, at which NEXRAD is visible. Defaults
   * to `MapDeclutterMode.Level2`. Ignored if NEXRAD user settings are not supported.
   * @param colors The color array for the NEXRAD overlay. If not defined, default colors will be applied.
   * @returns The updated map system builder with the terrain awareness layer included.
   */
  public readonly withNextRad = (builder: MapSystemBuilder, minRangeIndex = 0,
    settingManager?: UserSettingManager<Partial<MapNexradUserSettings>>,
    maxDeclutterMode?: MapDeclutterMode,
    colors?: readonly (readonly [number, number])[]): MapSystemBuilder => {
    return builder
      .withModule(MapKeys.Nexrad, () => new MapNexradModule())
      .withController<MapWxrController, MapWxrControllerModules>(MapSystemKeys.Weather, context => new MapWxrController(context))
      .withController<MapNexradController, MapNexradControllerModules>(MapKeys.Nexrad, context => {
        return new MapNexradController(context, minRangeIndex, settingManager, maxDeclutterMode);
      })
      .withInit<{
        /** Range module. */
        [MapKeys.Nexrad]: MapNexradModule
      }>(MapKeys.Nexrad, context => {
        if (colors !== undefined) {
          context.model.getModule(MapKeys.Nexrad).colors.set(colors);
        }
      });
  };
}

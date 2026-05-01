/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  CompiledMapSystem, ComponentProps, DisplayComponent, EventBus, Facility, FacilityLoader, FlightPlanner, FSComponent, GeoPoint, LatLonInterface, MappedSubject,
  MapSystemBuilder, ReadonlyFloat64Array, Subject, Vec2Math, VNode
} from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';
import { IfdOptions } from '../IfdOptions';
import { MapDataProvider } from '../Providers/Map/MapDataProvider';
import { TrafficSystem } from '../Systems/Traffic/TrafficSystem';
import { IfdViewService } from '../ViewService';
import { TouchPad } from './Components/TouchPad';
import { FormatController } from './Controllers/FormatController';
import { MapDragPanController } from './Controllers/MapDragPanController';
import { MapFlightPlanFocusController } from './Controllers/MapFlightPlanFocusController';
import { MapFlightPlanFocusRTRController } from './Controllers/MapFlightPlanFocusRTRController';
import { MapRangeController } from './Controllers/MapRangeController';
import { HeadingUpModeMapLayer } from './Layers/HeadingUpModeMapLayer';
import { NorthUpModeMapLayer } from './Layers/NorthUpModeMapLayer';
import { ObsLayer } from './Layers/ObsLayer';
import { TrackUpModeMapLayer } from './Layers/TrackUpModeMapLayer';
import { VlocRadialLayer } from './Layers/VlocLayer';
import { MapBuilder } from './MapBuilder';
import { MapKeys } from './MapKeys';
import { MapModules } from './MapModules';
import { MapSizes } from './MapSizes';
import { MapSystemCommon } from './MapSystemCommon';

/** The properties for the {@link MainMap} component. */
interface MapProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** An instance of the view service. */
  readonly viewService: IfdViewService;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** An instance of the Traffic System. */
  readonly trafficSystem?: TrafficSystem;
  /** The instrument configuration. */
  readonly ifdOptions: IfdOptions;
  /** The FMS to use. */
  readonly fms: Fms;
}

/** The MfdMap component. */
export class MainMap extends DisplayComponent<MapProps> {
  private readonly navMapContainerRef = FSComponent.createRef<HTMLDivElement>();

  private readonly terrWxContrast = Subject.create(1);
  private readonly procedureFlightPlanFocusMargins = Subject.create(new Float64Array([40, 80, 40, 80]));

  private mapSystem: CompiledMapSystem<MapModules, any, any, any>;

  private readonly defaultProjectedSize = this.props.mapDataProvider.isSidebarVisible.map((isVisible) => {
    const size = isVisible ? MapSizes.withSidebar : MapSizes.full;
    return new Float64Array([size.width, size.height]);
  });

  private readonly projectedSize = MappedSubject.create(
    ([override, fallback]) => {
      if (override !== null) {
        return override;
      }

      return fallback;
    },
    this.props.mapDataProvider.projectedSizeOverride,
    this.defaultProjectedSize,
  );

  private dragPanPrimed = false;
  private readonly dragPanThreshold = 10;
  private readonly dragStartPos = Vec2Math.create();

  private readonly mapDragPanModule;
  private readonly mapDragPanController: MapDragPanController;

  private readonly centerGeoPointCache = new GeoPoint(0, 0);
  private externalCenterActive = false;


  /** @inheritdoc */
  constructor(props: MapProps) {
    super(props);
    this.mapSystem = this.buildMapSystem().build('map-system');
    this.props.mapDataProvider.initMapProjection(this.mapSystem.context.projection);
    this.mapDragPanModule = this.mapSystem.context.model.getModule(MapKeys.DragPan);
    this.mapDragPanController = this.mapSystem.context.getController(MapKeys.DragPan);
    this.props.mapDataProvider.previewMode.sub((enabled) => {
      if (enabled) {
        this.dragPanPrimed = false;
        this.mapDragPanController.setDragPanActive(false);
      }
    }, true);
  }

  /**
   * @inheritDoc
   */
  public reCenter(): void {
    if (this.props.mapDataProvider.previewMode.get()) {
      return;
    }
    this.mapDragPanController.recenterOnOwnship();
  }

  /**
   * Indicates whether drag-pan mode is currently active.
   * @returns Whether drag-pan is active.
   */
  public isDragPanActive(): boolean {
    return this.mapDragPanModule.isActive.get();
  }

  /**
   * Responds to when a drag motion starts on this page's map.
   * @param position The position of the mouse.
   */
  private onDragStarted(position: ReadonlyFloat64Array): void {
    if (this.props.mapDataProvider.previewMode.get()) {
      return;
    }
    this.dragStartPos.set(position);
    this.dragPanPrimed = true;
  }

  /**
   * Responds to when the mouse moves while dragging over this page's map.
   * @param position The new position of the mouse.
   * @param prevPosition The position of the mouse at the previous update.
   */
  private onDragMoved(position: ReadonlyFloat64Array, prevPosition: ReadonlyFloat64Array): void {
    if (this.mapDragPanModule.isActive.get()) {
      // Drag-to-pan is active. Accumulate dragging deltas so that they can be applied at the next update cycle.

      const dx = position[0] - prevPosition[0];
      const dy = position[1] - prevPosition[1];

      this.mapDragPanController.drag(dx, dy);
    } else if (this.dragPanPrimed) {
      // Drag-to-pan is not active but is primed. If the user has dragged farther than the threshold required to
      // activate drag-to-pan, then do so.

      const dx = position[0] - this.dragStartPos[0];
      const dy = position[1] - this.dragStartPos[1];

      if (Math.hypot(dx, dy) >= this.dragPanThreshold) {
        this.dragPanPrimed = false;
        this.mapDragPanController.setDragPanActive(true);
        this.mapDragPanController.drag(dx, dy);
      }
    }
  }

  /**
   * Responds to when a drag motion ends on this page's map.
   */
  private onDragEnded(): void {
    if (this.props.mapDataProvider.previewMode.get()) {
      return;
    }
    this.dragPanPrimed = false;
  }

  /**
   * Responds to when the map is double tapped
   */
  private onDoubleTapped(): void {
    if (this.props.mapDataProvider.previewMode.get()) {
      return;
    }
    this.mapDragPanController.recenterOnOwnship();
  }

  /**
   * Centers the map on a provided lat/lon by taking target control via the panning module.
   * @param target The target lat/lon.
   */
  public centerOnLatLon(target: LatLonInterface): void {
    this.externalCenterActive = true;

    // Ensure drag pan is not active.
    this.dragPanPrimed = false;
    this.mapDragPanController.setDragPanActive(false);

    // Activate panning mode to claim target control, then set target.
    this.mapDragPanModule.isActive.set(true);
    this.mapDragPanModule.target.set(this.centerGeoPointCache.set(target.lat, target.lon));
  }

  /**
   * Clears any external centering and returns control to normal behaviors (e.g. follow airplane).
   */
  public clearExternalCenter(): void {
    if (!this.externalCenterActive) {
      return;
    }

    this.externalCenterActive = false;
    this.mapDragPanModule.isActive.set(false);
  }

  /**
   * Builds the map system for the navigation map.
   * @returns The configured map system builder.
   */
  private buildMapSystem(): MapSystemBuilder<MapModules, any, any, any> {

    const mapBuilder = new MapBuilder(
      this.props.bus,
      this.props.mapDataProvider,
      this.props.facLoader,
      this.props.flightPlanner
    );

    const mapSystemBuilder = MapSystemBuilder.create(this.props.bus)

      // .withContext(MapSystemKeys.FacilityLoader, () => {
      //     return this.props.facLoader;
      // })

      .withBing(
        'map-main-bing-id-' + this.props.ifdOptions.instrumentIndex,
        { opacity: this.terrWxContrast },
        undefined,
        'bing-map',
      )
      .with(mapBuilder.withMapStyles)
      .with(mapBuilder.withTerrainColors)
      .withModule(
        MapKeys.NdDataProvider,
        () => this.props.mapDataProvider,
      )
      .with(mapBuilder.withAirspaces, this.props.mapDataProvider.settings)
      .with(mapBuilder.withTerrainAwareness, this.props.mapDataProvider)
      .with(mapBuilder.withPanning)
      .with(mapBuilder.withNearestWaypoints, this.props.bus, this.props.mapDataProvider)
      .with(mapBuilder.withFlightPlans, this.props.flightPlanner, this.props.mapDataProvider)
      .withLayer(MapKeys.Obs, (context) => <ObsLayer bus={this.props.bus} model={context.model} mapProjection={context.projection} fms={this.props.fms} />)
      .withLayer(MapKeys.VlocRadial, (context) => <VlocRadialLayer bus={this.props.bus} model={context.model} mapProjection={context.projection} vlocIndex={this.props.ifdOptions.navIndex} />)
      .withController(
        MapKeys.MapFormatController,
        (context) =>
          new FormatController(context, this.props.mapDataProvider),
      )
      .withController(
        MapKeys.RangeController,
        (context) =>
          new MapRangeController(
            context,
            this.props.mapDataProvider.settings.getSetting('mapRange'),
            this.props.mapDataProvider.previewMode,
          ),
      )
      .withController(
        MapKeys.FlightPlanFocusRTRController,
        (context) =>
          new MapFlightPlanFocusRTRController(context, this.procedureFlightPlanFocusMargins),
      )
      .withController(
        MapKeys.FlightPlanFocusController,
        (context) =>
          new MapFlightPlanFocusController(context, this.props.flightPlanner),
      )
      .with(mapBuilder.withNextRad, 0, this.props.mapDataProvider.settings)
      .with(mapBuilder.withWaypointDisplayController, this.props.mapDataProvider.settings.getSetting('mapRange'), this.props.mapDataProvider);

    if (this.props.trafficSystem) {
      mapSystemBuilder.with(mapBuilder.withTraffic, this.props.trafficSystem, this.props.mapDataProvider.settings, MapSystemCommon.TrafficIconOptions, true);
    }

    return mapSystemBuilder.with(mapBuilder.withTopOfDescent)
      .withLayer(MapKeys.HeadingUpOverlay, (context) => (
        <TrackUpModeMapLayer
          model={context.model}
          mapProjection={context.projection}
          bus={this.props.bus}
          mapDataProvider={this.props.mapDataProvider}
          headingSelectEnabled={this.props.ifdOptions.headingSelectEnabled}
        //altitudeDataProvider={this.props.altitudeDataProvider}
        //inertialDataProvider={this.props.inertialDataProvider}
        />
      ))
      .withLayer(MapKeys.TrackUpOverlay, (context) => (
        <HeadingUpModeMapLayer
          model={context.model}
          mapProjection={context.projection}
          bus={this.props.bus}
          mapDataProvider={this.props.mapDataProvider}
          headingSelectEnabled={this.props.ifdOptions.headingSelectEnabled}
        //altitudeDataProvider={this.props.altitudeDataProvider}
        //inertialDataProvider={this.props.inertialDataProvider}
        />
      ))
      .withLayer(MapKeys.NorthUpOverlay, (context) => (
        <NorthUpModeMapLayer
          model={context.model}
          mapProjection={context.projection}
          bus={this.props.bus}
          mapDataProvider={this.props.mapDataProvider}
          headingSelectEnabled={this.props.ifdOptions.headingSelectEnabled}
        />
      ))
      .withProjectedSize(this.projectedSize)
      .withClockUpdate(30)
      .with(mapBuilder.withAirplaneIcon, this.props.mapDataProvider.airplaneIconSize.get())
      .withFollowAirplane()
      .withRotation();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{ 'map-container': true }}><TouchPad bus={this.props.bus} ref={this.navMapContainerRef}
        onDoubleTapped={this.onDoubleTapped.bind(this)}
        onDragStarted={this.onDragStarted.bind(this)}
        onDragMoved={this.onDragMoved.bind(this)}
        onDragEnded={this.onDragEnded.bind(this)}>

        {this.mapSystem.map}
      </TouchPad></div>
    );
  }
}

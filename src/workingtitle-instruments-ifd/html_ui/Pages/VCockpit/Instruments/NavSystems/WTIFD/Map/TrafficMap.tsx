/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  CompiledMapSystem, ComponentProps, DisplayComponent, EventBus, FacilityLoader, FlightPlanner, FSComponent, MapSystemBuilder, Subject, VNode
} from '@microsoft/msfs-sdk';

import { IfdOptions } from '../IfdOptions';
import { MapDataProvider } from '../Providers/Map/MapDataProvider';
import { TrafficSystem } from '../Systems/Traffic/TrafficSystem';
import { MapRangeController } from './Controllers/MapRangeController';
import { DataBlockHeadingUpModeMapLayer } from './Layers/DataBlockHeadingUpModeMapLayer';
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
  /** An instance of the traffic system */
  readonly trafficSystem?: TrafficSystem
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The instrument configuration. */
  readonly ifdOptions: IfdOptions;
  /** An optional callback which is called when the map is clicked. */
  readonly onClick?: () => void;
}

/** The MfdMap component. */
export class TrafficMap extends DisplayComponent<MapProps> {
  private readonly navMapContainerRef = FSComponent.createRef<HTMLDivElement>();

  private readonly terrWxContrast = Subject.create(1);
  private readonly size = new Float64Array([
    MapSizes.dataBlock.width,
    MapSizes.dataBlock.height,
  ]);

  private mapSystem: CompiledMapSystem<MapModules, any, any, any>;

  /** @inheritdoc */
  constructor(props: MapProps) {
    super(props);
    this.mapSystem = this.buildMapSystem().build('map-system');
    this.props.mapDataProvider.initMapProjection(this.mapSystem.context.projection);
    this.handleMapClick = this.handleMapClick.bind(this);
  }

  /**
   * Handles the map click event to toggle the range
   */
  private handleMapClick(): void {
    const rangeSetting = this.props.mapDataProvider.settings.getSetting('datablockMapRange');
    const current = rangeSetting.get();
    const next = current === 2 ? 6 : 2;
    rangeSetting.set(next);
    this.props.onClick?.();
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
      .with(mapBuilder.withMapStyles)
      .withModule(
        MapKeys.NdDataProvider,
        () => this.props.mapDataProvider,
      )
      .withController(
        MapKeys.RangeController,
        (context) =>
          new MapRangeController(
            context,
            this.props.mapDataProvider.settings.getSetting('datablockMapRange'),
            this.props.mapDataProvider.previewMode,
          ),
      );

    if (this.props.trafficSystem) {
      mapSystemBuilder.with(mapBuilder.withTraffic, this.props.trafficSystem, this.props.mapDataProvider.settings, MapSystemCommon.TrafficIconOptions, true);
    }

    return (
      mapSystemBuilder.withLayer(MapKeys.DataBlockHeadingUpOverlay, (context) => (
        <DataBlockHeadingUpModeMapLayer
          model={context.model}
          mapProjection={context.projection}
          bus={this.props.bus}
          mapDataProvider={this.props.mapDataProvider}
        />
      ))
        .withProjectedSize(this.size)
        .withClockUpdate(30)
        .with(mapBuilder.withAirplaneIcon, this.props.mapDataProvider.datablockAirplaneIconSize.get())
        .withFollowAirplane()
        .withRotation()
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    this.navMapContainerRef.instance.addEventListener('click', this.handleMapClick);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div ref={this.navMapContainerRef} class={{ 'map-container': true }}>
        {this.mapSystem.map}
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.navMapContainerRef.instance.removeEventListener('click', this.handleMapClick);
  }
}

import {
  ComponentProps, EventBus, Facility, FacilityLoader, FlightPlanner, FSComponent, LifecycleComponent, NodeReference, ReadonlyFloat64Array, VNode
} from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';
import { IfdOptions } from '../IfdOptions';
import { MainMap } from '../Map/MainMap';
import { MapDataProvider } from '../Providers/Map/MapDataProvider';
import { TrafficSystem } from '../Systems/Traffic/TrafficSystem';
import { IfdViewService } from '../ViewService/IfdViewService';

/** The properties for the {@link MapContainer} component. */
export interface MapContainerProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** An instance of the Traffic System. */
  readonly trafficSystem?: TrafficSystem;
  /** The IFD view service. */
  readonly viewService: IfdViewService;
  /** The instrument configuration. */
  readonly ifdOptions: IfdOptions;
  /** Where to place the shared map subtree when this container is not hosting it. */
  readonly parkingRef?: NodeReference<HTMLDivElement>;
  /** Optional projected size override for this host container. */
  readonly projectedSize?: ReadonlyFloat64Array;
  /** Whether this host wants the map in preview mode. */
  readonly previewMode?: boolean;
  /** The FMS to use. */
  readonly fms: Fms;
  /** CSS class to append to class attribute. */
  readonly class?: string;
}

/**
 * A relocatable map host component.
 *
 * There is exactly one shared map DOM subtree for the entire instrument.
 * The first time a {@link MapContainer} is mounted, it creates and renders the map.
 * Subsequent mounts "host" the already-rendered map by moving its DOM node into
 * the container for the current page/tab, preserving state and avoiding re-init.
 */
export class MapContainer extends LifecycleComponent<MapContainerProps> {
  /**
   * A static reference to the root HTML element that contains the shared map subtree.
   * If null, the map has not been created yet; otherwise, the element can be moved.
   */
  private static readonly renderedMapRootRef = FSComponent.createRef<HTMLDivElement>();

  private static readonly mainMapRef = FSComponent.createRef<MainMap>();

  /** Local mount point that hosts or creates the shared map subtree. */
  private readonly mountRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.host();
  }

  /** @inheritdoc */
  public override resume(): void {
    super.resume();
    this.host();
  }

  /** Re-centers the map on ownship. */
  public reCenter(): void {
    MapContainer.mainMapRef.getOrDefault()?.reCenter();
  }

  /**
   * Centers the shared map on a facility (works only while this container is hosting the map).
   * @param facility Facility to center on.
   */
  public centerOnFacility(facility: Facility): void {
    const map = MapContainer.mainMapRef.getOrDefault();
    if (!map) {
      return;
    }
    map.centerOnLatLon(facility);
  }

  /** Clears any external centering request. */
  public clearExternalCenter(): void {
    const map = MapContainer.mainMapRef.getOrDefault();

    if (!map) {
      return;
    }
    map.clearExternalCenter();
  }

  /**
   * Hosts the shared map subtree inside this container.
   *
   * If the shared map has not been created yet, it will be created and rendered exactly once.
   * Otherwise, the existing shared root will be moved into this container.
   */
  public host(): void {
    const existingRoot = MapContainer.renderedMapRootRef.getOrDefault();

    if (existingRoot === null) {
      const mapVNode = this.renderMapRoot();
      FSComponent.render(mapVNode, this.mountRef.instance);
      MapContainer.renderedMapRootRef.instance = mapVNode.instance as HTMLDivElement;
    } else {
      this.mountRef.instance.appendChild(existingRoot);
    }
    const sizeOverride = this.props.projectedSize ?? null;
    this.props.mapDataProvider.setProjectedSizeOverride(sizeOverride);
    this.props.mapDataProvider.setPreviewMode(Boolean(this.props.previewMode));
  }

  /**
   * Stops hosting the shared map subtree and moves it to the parking container, if provided.
   */
  public unhost(): void {
    const existingRoot = MapContainer.renderedMapRootRef.getOrDefault();
    const parkingEl = this.props.parkingRef?.getOrDefault();

    if (existingRoot !== null && parkingEl !== null && parkingEl !== undefined) {
      parkingEl.appendChild(existingRoot);
    }
    this.props.mapDataProvider.setProjectedSizeOverride(null);
    this.props.mapDataProvider.setPreviewMode(false);
  }

  /**
   * Creates the shared map root wrapper and renders the {@link MainMap} inside it.
   * This is called exactly once during the instrument lifetime.
   *
   * @returns The VNode of the newly created shared map root.
   */
  private renderMapRoot(): VNode {
    const root = (
      <div class="ifd-map-shared-root">
        <MainMap
          ref={MapContainer.mainMapRef}
          bus={this.props.bus}
          trafficSystem={this.props.trafficSystem}
          facLoader={this.props.facLoader}
          viewService={this.props.viewService}
          flightPlanner={this.props.flightPlanner}
          mapDataProvider={this.props.mapDataProvider}
          ifdOptions={this.props.ifdOptions}
          fms={this.props.fms}
        />
      </div>
    );

    return root;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={'ifd-map-container ' + (this.props.class ?? '')} ref={this.mountRef} />
    );
  }
}

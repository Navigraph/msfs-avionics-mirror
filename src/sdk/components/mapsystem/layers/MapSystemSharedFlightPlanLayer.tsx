import { LegDefinition } from '../../../flightplan';
import { GeoPoint, GeoPointInterface } from '../../../geo/GeoPoint';
import { GeoPointSubject } from '../../../geo/GeoPointSubject';
import { GeoProjection } from '../../../geo/GeoProjection';
import { ClippedPathStream } from '../../../graphics/path/ClippedPathStream';
import { GeoCylindricalClippedPathStream } from '../../../graphics/path/GeoCylindricalClippedPathStream';
import { NullPathStream } from '../../../graphics/path/PathStream';
import { BitFlags } from '../../../math/BitFlags';
import { VecNSubject } from '../../../math/VectorSubject';
import { AirportFacilityDataFlags, Facility, LegType } from '../../../navigation/Facilities';
import { FacilityLoader } from '../../../navigation/FacilityLoader';
import { FacilityWaypointCache } from '../../../navigation/FacilityWaypointCache';
import { ICAO } from '../../../navigation/IcaoUtils';
import { FacilityWaypoint, FlightPathWaypoint, Waypoint } from '../../../navigation/Waypoint';
import { Accessible } from '../../../sub/Accessible';
import { MappedValue } from '../../../sub/MappedValue';
import { Subscribable } from '../../../sub/Subscribable';
import { Value } from '../../../sub/Value';
import { UUID } from '../../../utils/uuid/UUID';
import { FSComponent, VNode } from '../../FSComponent';
import { GeoProjectionPathStreamStack } from '../../map/GeoProjectionPathStreamStack';
import { MapCachedCanvasLayer } from '../../map/layers/MapCachedCanvasLayer';
import { MapSharedCachedCanvasLayer, MapSharedCachedCanvasSubLayer } from '../../map/layers/MapSharedCachedCanvasLayer';
import { MapLayer, MapLayerProps } from '../../map/MapLayer';
import { MapProjection, MapProjectionChangeType } from '../../map/MapProjection';
import { MapSystemKeys } from '../MapSystemKeys';
import { MapSystemPlanRenderer } from '../MapSystemPlanRenderer';
import { MapSystemWaypointRoles } from '../MapSystemWaypointRoles';
import { MapSystemWaypointsRenderer } from '../MapSystemWaypointsRenderer';
import { MapFlightPlanModule } from '../modules/MapFlightPlanModule';

/**
 * A factory that provides waypoints for flight plan legs displayed by {@link MapSystemSharedFlightPlanLayer}.
 */
export interface MapSystemSharedFlightPlanWaypointFactory {
  /**
   * Builds a waypoint for a flight plan leg that terminates at a facility fix.
   * @param leg The flight plan leg.
   * @param facility The facility at which the leg terminates.
   * @returns A waypoint for the specified flight plan leg.
   */
  buildFacilityFixWaypoint(leg: LegDefinition, facility: Facility): Waypoint;

  /**
   * Builds a waypoint for a flight plan leg that terminates at a floating fix.
   * @param leg The flight plan leg.
   * @param location The location of the floating fix.
   * @returns A waypoint for the specified flight plan leg.
   */
  buildFloatingFixWaypoint(leg: LegDefinition, location: Subscribable<GeoPointInterface>): Waypoint;
}

/**
 * A configuration describing a flight plan displayed by {@link MapSystemSharedFlightPlanLayer}.
 */
export type MapSystemSharedFlightPlanConfig = {
  /** The index of the flight plan to display. */
  planIndex: number;

  /** A factory from which to get waypoints for flight plan legs to display. */
  waypointFactory: MapSystemSharedFlightPlanWaypointFactory;
};

/**
 * Modules required by {@link MapSystemSharedFlightPlanLayer}.
 */
export interface MapSystemSharedFlightPlanLayerModules {
  /** Flight plan module. */
  [MapSystemKeys.FlightPlan]: MapFlightPlanModule;
}

/**
 * Component props for {@link MapSystemSharedFlightPlanLayer}.
 */
export interface MapSystemSharedFlightPlanLayerProps extends MapLayerProps<MapSystemSharedFlightPlanLayerModules> {
  /** Configurations describing the flight plans to display. */
  planConfigs: readonly Readonly<MapSystemSharedFlightPlanConfig>[];

  /** The facility loader to use. */
  facilityLoader: FacilityLoader;

  /** The waypoint renderer to use to render flight plan waypoints. */
  waypointRenderer: MapSystemWaypointsRenderer;

  /** The flight path renderer to use. */
  flightPathRenderer: MapSystemPlanRenderer;

  /**
   * The angular gap on each side of the anti-meridian within which rendered flight paths will be clipped. Defaults to
   * 0.1 degrees.
   */
  geoClipAntiMeridianGap?: number;

  /**
   * The absolute latitude value, in degrees, above which rendered flight paths will be clipped. Defaults to 89
   * degrees.
   */
  geoClipLatitude?: number;

  /**
   * Bitflags describing the requested data to be loaded in airport facilities retrieved by the layer. This controls
   * what data are available from the airport waypoints that the layer registers with the waypoint renderer. Defaults
   * to {@link AirportFacilityDataFlags.All}.
   */
  airportFacilityDataFlags?: number;
}

/**
 * A map layer that draws zero or more flight plans. The layer draws the flight paths of the flight plans to a shared
 * canvas. Flight plan waypoints associated with the plans are registered with a waypoint renderer. Importantly
 * however, the layer does not by itself display any rendered waypoints; the waypoint renderer must be set up to render
 * the flight plan waypoints to a separate layer.
 */
export class MapSystemSharedFlightPlanLayer extends MapLayer<MapSystemSharedFlightPlanLayerProps> {
  /** The default amount to offset the pre-projection longitude clipping boundaries from the anti-meridian, in degrees. */
  private static readonly DEFAULT_GEO_CLIP_ANTI_MERIDIAN_GAP = 0.1;
  /** The default pre-projection latitude clipping boundary, in degrees. */
  private static readonly DEFAULT_GEO_CLIP_LATITUDE = 89;

  private readonly airportFacilityDataFlags = this.props.airportFacilityDataFlags ?? AirportFacilityDataFlags.All;

  private readonly geoClipAntiMeridianGap = Math.max(this.props.geoClipAntiMeridianGap ?? MapSystemSharedFlightPlanLayer.DEFAULT_GEO_CLIP_ANTI_MERIDIAN_GAP, 1e-6);
  private readonly geoClipLatitude = Math.max(this.props.geoClipLatitude ?? MapSystemSharedFlightPlanLayer.DEFAULT_GEO_CLIP_LATITUDE, 0);

  private readonly canvasLayerRef = FSComponent.createRef<MapCachedCanvasLayer<any>>();

  private readonly subLayerVisibilities = new Map<number, Value<boolean>>(this.props.planConfigs.map(config => [config.planIndex, Value.create(true)] as const));

  /**
   * Gets whether a flight plan rendered by this layer is set to be visible. If this layer as a whole is not visible
   * (as set by {@link setVisible | setVisible()}), then none of the flight plans rendered by this layer will be
   * visible, regardless of the value returned by this method.
   * @param planIndex The index of the flight plan for which to get the visibility state.
   * @returns Whether the specified flight plan is set to be visible, or `false` if the flight plan is not rendered
   * by this layer.
   */
  public isFlightPlanVisible(planIndex: number): boolean {
    return !!this.subLayerVisibilities.get(planIndex)?.get();
  }

  /**
   * Sets the visibility of a flight plan rendered by this layer. If this layer as a whole is not visible (as set by
   * {@link setVisible | setVisible()}), then none of the flight plans rendered by this layer will be visible,
   * regardless of the individual flight plan visibilities set by this method.
   * @param planIndex The index of the flight plan for which to set visibility. Attempting to set the visibility of a
   * plan that is not rendered by this layer will have no effect.
   * @param val Whether the flight plan should be visible.
   */
  public setFlightPlanVisible(planIndex: number, val: boolean): void {
    this.subLayerVisibilities.get(planIndex)?.set(val);
  }

  /** @inheritDoc */
  public onAttached(): void {
    super.onAttached();

    this.canvasLayerRef.instance.onAttached();
  }

  /** @inheritDoc */
  public onWake(): void {
    this.canvasLayerRef.instance.onWake();
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.canvasLayerRef.instance.onSleep();
  }

  /** @inheritDoc */
  public onMapProjectionChanged(mapProjection: MapProjection, changeFlags: number): void {
    this.canvasLayerRef.instance.onMapProjectionChanged(mapProjection, changeFlags);
  }

  /** @inheritDoc */
  public onUpdated(time: number, elapsed: number): void {
    this.canvasLayerRef.instance.onUpdated(time, elapsed);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <MapSharedCachedCanvasLayer
        ref={this.canvasLayerRef}
        model={this.props.model}
        mapProjection={this.props.mapProjection}
        overdrawFactor={Math.SQRT2}
        collapseOnSleep
        class={this.props.class}
      >
        {this.props.planConfigs.map(planConfig => {
          const isVisible = MappedValue.create(
            ([isFlightPlanVisible]) => isFlightPlanVisible && this.isVisible(),
            this.subLayerVisibilities.get(planConfig.planIndex)!
          );

          return (
            <MapSystemSharedFlightPlanSubLayer
              model={this.props.model}
              mapProjection={this.props.mapProjection}
              planConfig={planConfig}
              isVisible={isVisible}
              facilityLoader={this.props.facilityLoader}
              waypointRenderer={this.props.waypointRenderer}
              flightPathRenderer={this.props.flightPathRenderer}
              geoClipAntiMeridianGap={this.geoClipAntiMeridianGap}
              geoClipLatitude={this.geoClipLatitude}
              airportFacilityDataFlags={this.airportFacilityDataFlags}
            />
          );
        })}
      </MapSharedCachedCanvasLayer>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.canvasLayerRef.getOrDefault()?.destroy();

    super.destroy();
  }
}

/**
 * A record for a waypoint for a flight plan leg that terminates at a facility fix.
 */
type LegFacilityFixWaypointRecord = {
  /** The waypoint. */
  waypoint: Waypoint;

  /** The render role under which the waypoint is registered with the waypoint renderer. */
  renderRole: number;
};

/**
 * A record for a waypoint for a flight plan leg that terminates at a floating fix.
 */
type LegFloatingWaypointRecord = {
  /** The waypoint. */
  waypoint: Waypoint;

  /** The render role under which the waypoint is registered with the waypoint renderer. */
  renderRole: number;

  /** The location of the floating fix. */
  location: GeoPointSubject;
};

/**
 * A record for a flight plan leg waypoint.
 */
type LegWaypointRecord = LegFacilityFixWaypointRecord | LegFloatingWaypointRecord;

/**
 * Component props for {@link MapSystemSharedFlightPlanSubLayer}.
 */
interface MapSystemSharedFlightPlanSubLayerProps extends MapLayerProps<MapSystemSharedFlightPlanLayerModules> {
  /** A configuration describing the flight plan to display. */
  planConfig: Readonly<MapSystemSharedFlightPlanConfig>;

  /** Whether the flight plan displayed by the sublayer is visible. */
  isVisible: Accessible<boolean>;

  /** The facility loader to use. */
  facilityLoader: FacilityLoader;

  /** The waypoint renderer to use. */
  waypointRenderer: MapSystemWaypointsRenderer;

  /** The flight path renderer to use. */
  flightPathRenderer: MapSystemPlanRenderer;

  /** The angular gap on each side of the anti-meridian within which rendered flight paths will be clipped. */
  geoClipAntiMeridianGap: number;

  /** The absolute latitude value, in degrees, above which rendered flight paths will be clipped. */
  geoClipLatitude: number;

  /**
   * Bitflags describing the requested data to be loaded in airport facilities retrieved by the layer. This controls
   * what data are available from the airport waypoints that the layer registers with the waypoint renderer.
   */
  airportFacilityDataFlags: number;
}

/**
 * A sublayer of {@link MapSystemSharedFlightPlanLayer} that draws a single flight plan.
 */
class MapSystemSharedFlightPlanSubLayer extends MapSharedCachedCanvasSubLayer<MapSystemSharedFlightPlanSubLayerProps> {
  /** The distance from each edge of the canvas to extend the post-projection clipping bounds, in pixels. */
  private static readonly CLIP_BOUNDS_BUFFER = 10;

  private readonly planModule = this.props.model.getModule(MapSystemKeys.FlightPlan);

  private readonly defaultWaypointRenderRole = this.props.waypointRenderer.getRoleFromName(MapSystemWaypointRoles.FlightPlan) ?? 0;
  private readonly legsToRenderWaypoints = new Map<LegDefinition, number>();
  private readonly legWaypointRecords = new Map<LegDefinition, LegWaypointRecord>();
  private waypointsUpdating = false;

  private readonly geoClipBounds = VecNSubject.create(new Float64Array(4));
  private readonly geoClippedPathStream = new GeoCylindricalClippedPathStream(NullPathStream.INSTANCE, this.geoClipBounds);
  private readonly clipBounds = VecNSubject.create(new Float64Array(4));
  private readonly clippedPathStream = new ClippedPathStream(NullPathStream.INSTANCE, this.clipBounds);
  private readonly pathStreamStack = new GeoProjectionPathStreamStack(NullPathStream.INSTANCE, this.props.mapProjection.getGeoProjection(), Math.PI / 12, 0.25, 8);

  private needRedrawRoute = false;
  private needUpdateWaypoints = false;

  private wasLastVisible = true;

  private isAwake = true;

  /** @inheritDoc */
  public onAttached(): void {
    this.wasLastVisible = this.props.isVisible.get();

    this.pathStreamStack.pushPreProjected(this.geoClippedPathStream);
    this.pathStreamStack.pushPostProjected(this.clippedPathStream);
    this.pathStreamStack.setConsumer(this.display.context);

    const scheduleUpdate = (): void => {
      this.needRedrawRoute = true;
      this.needUpdateWaypoints = true;
    };

    this.planModule.getPlanSubjects(this.props.planConfig.planIndex).flightPlan.sub(scheduleUpdate);
    this.planModule.getPlanSubjects(this.props.planConfig.planIndex).planCalculated.on(scheduleUpdate);
    this.planModule.getPlanSubjects(this.props.planConfig.planIndex).planChanged.on(scheduleUpdate);
    this.planModule.getPlanSubjects(this.props.planConfig.planIndex).activeLeg.sub(scheduleUpdate);

    if (this.wasLastVisible) {
      scheduleUpdate();
    }

    this.updateClipBounds();
  }

  /** @inheritDoc */
  public onWake(): void {
    this.isAwake = true;

    this.updateClipBounds();
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.isAwake = false;
  }

  /** @inheritDoc */
  public onMapProjectionChanged(mapProjection: MapProjection, changeFlags: number): void {
    if (this.isAwake && BitFlags.isAll(changeFlags, MapProjectionChangeType.ProjectedSize)) {
      this.updateClipBounds();
    }
  }

  /**
   * Updates this sublayer's post-projection clipping bounds.
   */
  private updateClipBounds(): void {
    const size = this.display.size;
    this.clipBounds.set(
      -MapSystemSharedFlightPlanSubLayer.CLIP_BOUNDS_BUFFER,
      -MapSystemSharedFlightPlanSubLayer.CLIP_BOUNDS_BUFFER,
      size + MapSystemSharedFlightPlanSubLayer.CLIP_BOUNDS_BUFFER,
      size + MapSystemSharedFlightPlanSubLayer.CLIP_BOUNDS_BUFFER
    );
  }

  /** @inheritDoc */
  public shouldInvalidateDisplay(): boolean {
    const isVisible = this.props.isVisible.get();
    return isVisible !== this.wasLastVisible || (isVisible && this.needRedrawRoute);
  }

  /** @inheritDoc */
  public onUpdated(): void {
    const isVisible = this.props.isVisible.get();

    if (this.display.isInvalidated) {
      if (isVisible) {
        this.drawRoute();
      }
      this.needRedrawRoute = false;
    }

    this.needUpdateWaypoints ||= isVisible !== this.wasLastVisible;

    if (this.needUpdateWaypoints && !this.waypointsUpdating) {
      this.updateWaypoints(isVisible);
      this.needUpdateWaypoints = false;
    }

    this.wasLastVisible = isVisible;
  }

  /**
   * Draws the flight path route.
   */
  private drawRoute(): void {
    const plan = this.planModule.getPlanSubjects(this.props.planConfig.planIndex).flightPlan.get();

    if (!plan) {
      return;
    }

    const display = this.display;
    const context = display.context;

    if (plan) {
      this.updateGeoClipBounds(display.geoProjection);
      this.pathStreamStack.setProjection(display.geoProjection);
      this.props.flightPathRenderer.render(plan, undefined, undefined, context, this.pathStreamStack);
    }
  }

  /**
   * Updates this layer's pre-projection clipping bounds.
   * @param projection The projection used to draw the flight plan.
   */
  private updateGeoClipBounds(projection: GeoProjection): void {
    const centralMeridian = -projection.getPreRotation()[0] * Avionics.Utils.RAD2DEG;
    const antiMeridian = centralMeridian + 180;

    this.geoClipBounds.set(
      antiMeridian + this.props.geoClipAntiMeridianGap,
      -this.props.geoClipLatitude,
      antiMeridian - this.props.geoClipAntiMeridianGap,
      this.props.geoClipLatitude
    );
  }

  /** @inheritDoc */
  public setVisible(val: boolean): void {
    super.setVisible(val);
  }

  /**
   * Updates waypoints for the flight plan.
   * @param isVisible Whether the flight plan is visible.
   */
  private async updateWaypoints(isVisible: boolean): Promise<void> {
    this.waypointsUpdating = true;

    try {
      const flightPlan = isVisible ? this.planModule.getPlanSubjects(this.props.planConfig.planIndex).flightPlan.get() : undefined;

      if (flightPlan === undefined) {
        for (const record of this.legWaypointRecords.values()) {
          this.props.waypointRenderer.deregister(record.waypoint, record.renderRole, MapSystemWaypointRoles.FlightPlan);
        }

        this.legWaypointRecords.clear();
        this.waypointsUpdating = false;

        return;
      }

      const activeLegIndex = this.planModule.getPlanSubjects(this.props.planConfig.planIndex).activeLeg.get();

      const activeLeg = flightPlan.tryGetLeg(activeLegIndex);
      let legIndex = 0;
      for (const leg of flightPlan.legs()) {
        let renderRole = this.defaultWaypointRenderRole;
        const handler = this.props.flightPathRenderer.legWaypointHandlers.get(this.props.planConfig.planIndex);
        if (handler !== undefined) {
          renderRole = handler(flightPlan, leg, activeLeg, legIndex, activeLegIndex);
        }

        if (renderRole !== 0) {
          this.legsToRenderWaypoints.set(leg, renderRole);
        }

        legIndex++;
      }

      // Remove records of legs that are no longer in the set of legs to display.
      for (const [leg, record] of this.legWaypointRecords) {
        if (!this.legsToRenderWaypoints.has(leg)) {
          this.props.waypointRenderer.deregister(record.waypoint, record.renderRole, MapSystemWaypointRoles.FlightPlan);
          this.legWaypointRecords.delete(leg);
        }
      }

      const waypointRefreshes: Promise<void>[] = [];

      // Create or refresh waypoints to display
      for (const [leg, renderRole] of this.legsToRenderWaypoints) {
        waypointRefreshes.push(this.updatePlanWaypoint(leg, renderRole));
      }

      this.legsToRenderWaypoints.clear();

      await Promise.all(waypointRefreshes);
    } finally {
      this.waypointsUpdating = false;
    }
  }

  /**
   * Builds or refreshes a flight plan waypoint.
   * @param leg The leg to build the waypoint for.
   * @param roleId The role ID to assign to the waypoint.
   */
  private async updatePlanWaypoint(leg: LegDefinition, roleId: number): Promise<void> {
    switch (leg.leg.type) {
      case LegType.CD:
      case LegType.VD:
      case LegType.CR:
      case LegType.VR:
      case LegType.FC:
      case LegType.FD:
      case LegType.FA:
      case LegType.CA:
      case LegType.VA:
      case LegType.FM:
      case LegType.VM:
      case LegType.CI:
      case LegType.VI:
        await this.updateFloatingFixWaypoint(leg, roleId);
        break;
      case LegType.Discontinuity:
      case LegType.ThruDiscontinuity:
        break;
      default:
        await this.updateFacilityFixWaypoint(leg, roleId);
        break;
    }
  }

  /**
   * Updates the waypoint for a flight plan leg that terminates at a floating fix.
   * @param leg The flight plan leg.
   * @param renderRole The render role to use when registering the waypoint with the waypoint renderer.
   */
  private async updateFloatingFixWaypoint(leg: LegDefinition, renderRole: number): Promise<void> {
    const record = this.legWaypointRecords.get(leg);
    const lastVector = leg.calculated?.flightPath[leg.calculated?.flightPath.length - 1];
    if (record !== undefined) {
      if (lastVector !== undefined) {
        (record as LegFloatingWaypointRecord).location.set(lastVector.endLat, lastVector.endLon);

        if (renderRole !== record.renderRole) {
          this.props.waypointRenderer.deregister(record.waypoint, record.renderRole, MapSystemWaypointRoles.FlightPlan);
          record.renderRole = renderRole;
          this.props.waypointRenderer.register(record.waypoint, record.renderRole, MapSystemWaypointRoles.FlightPlan);
        }
      } else {
        this.props.waypointRenderer.deregister(record.waypoint, record.renderRole, MapSystemWaypointRoles.FlightPlan);
        this.legWaypointRecords.delete(leg);
      }
    } else {
      if (lastVector !== undefined) {
        const location = GeoPointSubject.create(new GeoPoint(lastVector.endLat, lastVector.endLon));
        const waypoint = this.props.planConfig.waypointFactory.buildFloatingFixWaypoint(leg, location);
        this.legWaypointRecords.set(leg, { waypoint, renderRole, location });
        this.props.waypointRenderer.register(waypoint, renderRole, MapSystemWaypointRoles.FlightPlan);
      }
    }
  }

  /**
   * Updates the waypoint for a flight plan leg that terminates at a facility fix.
   * @param leg The flight plan leg.
   * @param renderRole The render role to use when registering the waypoint with the waypoint renderer.
   */
  private async updateFacilityFixWaypoint(leg: LegDefinition, renderRole: number): Promise<void> {
    const record = this.legWaypointRecords.get(leg);

    if (record === undefined) {
      const facIcao = leg.leg.fixIcaoStruct;
      try {
        const facility = await this.props.facilityLoader.tryGetFacility(ICAO.getFacilityTypeFromValue(facIcao), facIcao, this.props.airportFacilityDataFlags);
        if (facility) {
          const waypoint = this.props.planConfig.waypointFactory.buildFacilityFixWaypoint(leg, facility);
          this.legWaypointRecords.set(leg, { waypoint, renderRole });
          this.props.waypointRenderer.register(waypoint, renderRole, MapSystemWaypointRoles.FlightPlan);
        }
      } catch (err) {
        /* continue */
      }
    } else {
      if (renderRole !== record.renderRole) {
        this.props.waypointRenderer.deregister(record.waypoint, record.renderRole, MapSystemWaypointRoles.FlightPlan);
        record.renderRole = renderRole;
        this.props.waypointRenderer.register(record.waypoint, record.renderRole, MapSystemWaypointRoles.FlightPlan);
      }
    }
  }
}

/**
 * A default implementation of {@link MapSystemSharedFlightPlanWaypointFactory}. For flight plan legs that terminate at
 * a facility fix, this factory provides {@link FacilityWaypoint | FacilityWaypoints} from a cache. For flight plan
 * legs that terminate at a floating fix, this factory provides {@link FlightPathWaypoint | FlightPathWaypoints} with
 * idents equal to the legs' names.
 */
export class MapSystemDefaultSharedFlightPlanWaypointFactory implements MapSystemSharedFlightPlanWaypointFactory {
  /**
   * Creates a new instance of MapSystemDefaultSharedFlightPlanWaypointFactory.
   * @param facWaypointCache The cache from which this factory retrieves facility waypoints.
   */
  public constructor(private readonly facWaypointCache: FacilityWaypointCache) {
  }

  /** @inheritDoc */
  public buildFacilityFixWaypoint(leg: LegDefinition, facility: Facility): FacilityWaypoint {
    return this.facWaypointCache.get(facility);
  }

  /** @inheritDoc */
  public buildFloatingFixWaypoint(leg: LegDefinition, location: Subscribable<GeoPointInterface>): FlightPathWaypoint {
    return new FlightPathWaypoint(location, leg, UUID.GenerateUuid(), leg.name ?? '');
  }
}

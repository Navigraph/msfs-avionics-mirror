import { EventBus } from '../../../data';
import { LegDefinition } from '../../../flightplan';
import { GeoProjection } from '../../../geo/GeoProjection';
import { ClippedPathStream } from '../../../graphics/path/ClippedPathStream';
import { GeoCylindricalClippedPathStream } from '../../../graphics/path/GeoCylindricalClippedPathStream';
import { NullPathStream } from '../../../graphics/path/PathStream';
import { BitFlags } from '../../../math/BitFlags';
import { VecNSubject } from '../../../math/VectorSubject';
import { DefaultFacilityWaypointCache } from '../../../navigation/DefaultFacilityWaypointCache';
import { AirportFacilityDataFlags, Facility, LegType } from '../../../navigation/Facilities';
import { FacilityLoader } from '../../../navigation/FacilityLoader';
import { FacilityRepository } from '../../../navigation/FacilityRepository';
import { ICAO } from '../../../navigation/IcaoUtils';
import { FlightPathWaypoint, Waypoint } from '../../../navigation/Waypoint';
import { FSComponent, VNode } from '../../FSComponent';
import { GeoProjectionPathStreamStack } from '../../map/GeoProjectionPathStreamStack';
import { MapCachedCanvasLayer } from '../../map/layers/MapCachedCanvasLayer';
import { MapSyncedCanvasLayer } from '../../map/layers/MapSyncedCanvasLayer';
import { MapLayer, MapLayerProps } from '../../map/MapLayer';
import { MapProjection, MapProjectionChangeType } from '../../map/MapProjection';
import { MapSystemKeys } from '../MapSystemKeys';
import { MapSystemPlanRenderer } from '../MapSystemPlanRenderer';
import { MapSystemWaypointRoles } from '../MapSystemWaypointRoles';
import { MapSystemIconFactory, MapSystemLabelFactory, MapSystemWaypointsRenderer } from '../MapSystemWaypointsRenderer';
import { MapFlightPlanModule } from '../modules/MapFlightPlanModule';

/**
 * Modules required by MapSystemFlightPlanLayer.
 */
export interface MapSystemFlightPlanLayerModules {
  /** Flight plan module. */
  [MapSystemKeys.FlightPlan]: MapFlightPlanModule;
}

/** Props on the MapSystemFlightPlanLayer component. */
export interface MapSystemFlightPlanLayerProps extends MapLayerProps<MapSystemFlightPlanLayerModules> {
  /** An instance of the event bus. */
  bus: EventBus;

  /** The facility loader to use. If not defined, then a default instance will be created. */
  facilityLoader?: FacilityLoader;

  /** The waypoint renderer to use with this instance. */
  waypointRenderer: MapSystemWaypointsRenderer;

  /** The icon factory to use with this instance. */
  iconFactory: MapSystemIconFactory;

  /** The label factory to use with this instance. */
  labelFactory: MapSystemLabelFactory;

  /** The flight plan renderer to use with this instance. */
  flightPathRenderer: MapSystemPlanRenderer;

  /** The flight plan index to display. */
  planIndex: number;

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
 * A map system layer that draws the flight plan.
 */
export class MapSystemFlightPlanLayer extends MapLayer<MapSystemFlightPlanLayerProps> {
  private static readonly WAYPOINT_PREFIX = 'MapSystemFplLayer';

  /** The default amount to offset the pre-projection longitude clipping boundaries from the anti-meridian, in degrees. */
  private static readonly DEFAULT_GEO_CLIP_ANTI_MERIDIAN_GAP = 0.1;
  /** The default pre-projection latitude clipping boundary, in degrees. */
  private static readonly DEFAULT_GEO_CLIP_LATITUDE = 89;

  /** The distance from each edge of the canvas to extend the post-projection clipping bounds, in pixels. */
  private static readonly CLIP_BOUNDS_BUFFER = 10;

  private static instanceId = 0;

  protected readonly instanceId = MapSystemFlightPlanLayer.instanceId++;

  protected readonly flightPathLayerRef = FSComponent.createRef<MapCachedCanvasLayer>();
  protected readonly waypointLayerRef = FSComponent.createRef<MapSyncedCanvasLayer>();

  protected readonly defaultRoleId = this.props.waypointRenderer.getRoleFromName(MapSystemWaypointRoles.FlightPlan) ?? 0;
  protected readonly planModule = this.props.model.getModule(MapSystemKeys.FlightPlan);

  protected readonly waypointPrefix = `${MapSystemFlightPlanLayer.WAYPOINT_PREFIX}_${this.instanceId}`;
  protected readonly legWaypoints = new Map<LegDefinition, [Waypoint, number]>();
  protected waypointsUpdating = false;
  protected waypointId = 0;

  protected readonly facLoader = this.props.facilityLoader ?? new FacilityLoader(FacilityRepository.getRepository(this.props.bus));
  protected readonly facWaypointCache = DefaultFacilityWaypointCache.getCache(this.props.bus);

  protected readonly airportFacilityDataFlags = this.props.airportFacilityDataFlags ?? AirportFacilityDataFlags.All;

  protected readonly geoClipAntiMeridianBuffer = Math.max(this.props.geoClipAntiMeridianGap ?? MapSystemFlightPlanLayer.DEFAULT_GEO_CLIP_ANTI_MERIDIAN_GAP, 1e-6);
  protected readonly geoClipLatitude = Math.max(this.props.geoClipLatitude ?? MapSystemFlightPlanLayer.DEFAULT_GEO_CLIP_LATITUDE, 0);
  protected readonly geoClipBounds = VecNSubject.create(new Float64Array(4));
  protected readonly geoClippedPathStream = new GeoCylindricalClippedPathStream(NullPathStream.INSTANCE, this.geoClipBounds);
  protected readonly clipBounds = VecNSubject.create(new Float64Array(4));
  protected readonly clippedPathStream = new ClippedPathStream(NullPathStream.INSTANCE, this.clipBounds);
  protected readonly pathStreamStack = new GeoProjectionPathStreamStack(NullPathStream.INSTANCE, this.props.mapProjection.getGeoProjection(), Math.PI / 12, 0.25, 8);

  protected updateScheduled = false;

  protected isAwake = true;

  /** @inheritDoc */
  public onAttached(): void {
    this.flightPathLayerRef.instance.onAttached();
    this.waypointLayerRef.instance.onAttached();

    this.pathStreamStack.pushPreProjected(this.geoClippedPathStream);
    this.pathStreamStack.pushPostProjected(this.clippedPathStream);
    this.pathStreamStack.setConsumer(this.flightPathLayerRef.instance.display.context);

    this.initWaypointRenderer();

    this.planModule.getPlanSubjects(this.props.planIndex).flightPlan.sub(() => this.updateScheduled = true);
    this.planModule.getPlanSubjects(this.props.planIndex).planCalculated.on(() => this.updateScheduled = true);
    this.planModule.getPlanSubjects(this.props.planIndex).planChanged.on(() => this.updateScheduled = true);
    this.planModule.getPlanSubjects(this.props.planIndex).activeLeg.sub(() => this.updateScheduled = true);
    this.props.waypointRenderer.onRolesAdded.on(() => this.initWaypointRenderer());

    this.updateClipBounds();
  }

  /**
   * Initializes the waypoint renderer for this layer.
   */
  protected initWaypointRenderer(): void {
    let hasDefaultRole = false;
    const flightPlanRoles = this.props.waypointRenderer.getRoleNamesByGroup(`${MapSystemWaypointRoles.FlightPlan}_${this.props.planIndex}`);

    for (let i = 0; i < flightPlanRoles.length; i++) {
      const roleId = this.props.waypointRenderer.getRoleFromName(flightPlanRoles[i]);

      if (roleId !== undefined) {
        this.props.waypointRenderer.setCanvasContext(roleId, this.waypointLayerRef.instance.display.context);
        this.props.waypointRenderer.setIconFactory(roleId, this.props.iconFactory);
        this.props.waypointRenderer.setLabelFactory(roleId, this.props.labelFactory);

        if (!hasDefaultRole) {
          this.props.flightPathRenderer.defaultRoleId = roleId;
          hasDefaultRole = true;
        }
      }
    }
  }

  /** @inheritDoc */
  public onWake(): void {
    this.isAwake = true;

    this.flightPathLayerRef.instance.onWake();
    this.waypointLayerRef.instance.onWake();
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.isAwake = false;

    this.flightPathLayerRef.instance.onSleep();
    this.waypointLayerRef.instance.onSleep();
  }

  /** @inheritDoc */
  public onMapProjectionChanged(mapProjection: MapProjection, changeFlags: number): void {
    this.flightPathLayerRef.instance.onMapProjectionChanged(mapProjection, changeFlags);
    this.waypointLayerRef.instance.onMapProjectionChanged(mapProjection, changeFlags);

    if (this.isAwake && BitFlags.isAll(changeFlags, MapProjectionChangeType.ProjectedSize)) {
      this.updateClipBounds();
    }
  }

  /**
   * Updates this sublayer's post-projection clipping bounds.
   */
  private updateClipBounds(): void {
    const size = this.flightPathLayerRef.instance.getSize();
    this.clipBounds.set(
      -MapSystemFlightPlanLayer.CLIP_BOUNDS_BUFFER,
      -MapSystemFlightPlanLayer.CLIP_BOUNDS_BUFFER,
      size + MapSystemFlightPlanLayer.CLIP_BOUNDS_BUFFER,
      size + MapSystemFlightPlanLayer.CLIP_BOUNDS_BUFFER
    );
  }

  /** @inheritDoc */
  public onUpdated(time: number, elapsed: number): void {
    this.flightPathLayerRef.instance.onUpdated(time, elapsed);
    this.waypointLayerRef.instance.onUpdated(time, elapsed);

    if (this.isVisible()) {
      const display = this.flightPathLayerRef.instance.display;
      if (display.isInvalid) {
        display.clear();
        display.syncWithMapProjection(this.props.mapProjection);

        this.updateScheduled = true;
      }

      if (this.updateScheduled) {
        if (!this.waypointsUpdating) {
          this.updateWaypoints();
        }

        const context = display.context;
        display.clear();

        const plan = this.planModule.getPlanSubjects(this.props.planIndex).flightPlan.get();
        if (plan !== undefined) {
          this.updateGeoClipBounds(display.geoProjection);
          this.pathStreamStack.setProjection(display.geoProjection);
          this.props.flightPathRenderer.render(plan, undefined, undefined, context, this.pathStreamStack);
        }

        this.updateScheduled = false;
      }
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
      antiMeridian + this.geoClipAntiMeridianBuffer,
      -this.geoClipLatitude,
      antiMeridian - this.geoClipAntiMeridianBuffer,
      this.geoClipLatitude
    );
  }

  /** @inheritDoc */
  public setVisible(val: boolean): void {
    super.setVisible(val);
    this.waypointLayerRef.instance.setVisible(val);
    this.flightPathLayerRef.instance.setVisible(val);
  }

  /**
   * Updates waypoints for the flight plan.
   * @throws An error if the waypoints are already updating.
   */
  protected async updateWaypoints(): Promise<void> {
    if (this.waypointsUpdating) {
      throw new Error('A flight plan waypoint update is already in progress.');
    }

    this.waypointsUpdating = true;
    const flightPlan = this.planModule.getPlanSubjects(this.props.planIndex).flightPlan.get();
    const activeLegIndex = this.planModule.getPlanSubjects(this.props.planIndex).activeLeg.get();

    if (flightPlan === undefined) {
      for (const legWaypoint of this.legWaypoints.values()) {
        const [waypoint, roleId] = legWaypoint;
        this.props.waypointRenderer.deregister(waypoint, roleId, MapSystemWaypointRoles.FlightPlan);
      }

      this.legWaypoints.clear();
      this.waypointsUpdating = false;

      return;
    }

    const activeLeg = flightPlan.tryGetLeg(activeLegIndex);
    const legsToDisplay = new Map<LegDefinition, number>();

    let legIndex = 0;
    for (const leg of flightPlan.legs()) {
      let roleId = this.defaultRoleId;
      const handler = this.props.flightPathRenderer.legWaypointHandlers.get(this.props.planIndex);
      if (handler !== undefined) {
        roleId = handler(flightPlan, leg, activeLeg, legIndex, activeLegIndex);
      }

      if (roleId !== 0) {
        legsToDisplay.set(leg, roleId);
      }

      legIndex++;
    }

    // Remove records of legs that are no longer in the set of legs to display.
    for (const leg of this.legWaypoints) {
      const [legDefinition, legWaypoint] = leg;
      const [waypoint, roleId] = legWaypoint;

      if (!legsToDisplay.has(legDefinition)) {
        this.props.waypointRenderer.deregister(waypoint, roleId, MapSystemWaypointRoles.FlightPlan);
        this.legWaypoints.delete(legDefinition);
      }
    }

    const waypointRefreshes: Promise<void>[] = [];

    // Create or refresh waypoints to display
    for (const leg of legsToDisplay) {
      waypointRefreshes.push(this.buildPlanWaypoint(leg[0], leg[1]));
    }

    await Promise.all(waypointRefreshes);
    this.waypointsUpdating = false;
  }

  /**
   * Builds or refreshes a flight plan waypoint.
   * @param leg The leg to build the waypoint for.
   * @param roleId The role ID to assign to the waypoint.
   */
  protected async buildPlanWaypoint(leg: LegDefinition, roleId: number): Promise<void> {
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
        await this.buildTerminatorWaypoint(leg, roleId);
        break;
      case LegType.Discontinuity:
      case LegType.ThruDiscontinuity:
        break;
      default:
        await this.buildFixWaypoint(leg, roleId);
        break;
    }
  }

  /**
   * Builds a flight path terminator based waypoint.
   * @param leg The leg to build the waypoint for.
   * @param roleId The role ID to assign to the waypoint.
   */
  protected async buildTerminatorWaypoint(leg: LegDefinition, roleId: number): Promise<void> {
    const currentLeg = this.legWaypoints.get(leg);
    if (currentLeg !== undefined) {
      const [waypoint, currentRoleId] = currentLeg;

      const lastVector = leg.calculated?.flightPath[leg.calculated?.flightPath.length - 1];
      if (lastVector !== undefined) {
        if (!waypoint.location.get().equals(lastVector.endLat, lastVector.endLon)) {
          this.props.waypointRenderer.deregister(waypoint, currentRoleId, MapSystemWaypointRoles.FlightPlan);

          const ident = leg.name ?? '';
          const newWaypoint = new FlightPathWaypoint(lastVector.endLat, lastVector.endLon, leg, `${this.waypointPrefix}_${this.waypointId++}_${ident}`, ident);

          this.legWaypoints.set(leg, [newWaypoint, roleId]);
          this.props.waypointRenderer.register(newWaypoint, roleId, MapSystemWaypointRoles.FlightPlan);
        } else if (currentRoleId !== roleId) {
          this.props.waypointRenderer.deregister(waypoint, currentRoleId, MapSystemWaypointRoles.FlightPlan);
          this.props.waypointRenderer.register(waypoint, roleId, MapSystemWaypointRoles.FlightPlan);

          this.legWaypoints.set(leg, [waypoint, roleId]);
        }
      } else {
        this.props.waypointRenderer.deregister(waypoint, currentRoleId, MapSystemWaypointRoles.FlightPlan);
      }
    } else {
      const lastVector = leg.calculated?.flightPath[leg.calculated?.flightPath.length - 1];
      if (lastVector !== undefined) {
        const ident = leg.name ?? '';
        const newWaypoint = new FlightPathWaypoint(lastVector.endLat, lastVector.endLon, leg, `${this.waypointPrefix}_${this.waypointId++}_${ident}`, ident);

        this.legWaypoints.set(leg, [newWaypoint, roleId]);
        this.props.waypointRenderer.register(newWaypoint, roleId, MapSystemWaypointRoles.FlightPlan);
      }
    }
  }

  /**
   * Builds a standard facility fix waypoint for flight plan waypoint display.
   * @param leg The leg to build the waypoint for.
   * @param roleId The role ID to assign to the waypoint.
   */
  protected async buildFixWaypoint(leg: LegDefinition, roleId: number): Promise<void> {
    const legWaypoint = this.legWaypoints.get(leg);
    if (legWaypoint === undefined) {
      const facIcao = leg.leg.fixIcaoStruct;
      let facility: Facility | null = null;
      try {
        facility = await this.facLoader.tryGetFacility(ICAO.getFacilityTypeFromValue(facIcao), facIcao, this.airportFacilityDataFlags);
      } catch (err) {
        /* continue */
      }

      if (facility) {
        const waypoint = this.facWaypointCache.get(facility);
        const ident = leg.name ?? '';
        const newWaypoint = new FlightPathWaypoint(waypoint.location, leg, `${this.waypointPrefix}_${this.waypointId++}_${ident}`, ident);
        this.props.waypointRenderer.register(newWaypoint, roleId, MapSystemWaypointRoles.FlightPlan);
        this.legWaypoints.set(leg, [newWaypoint, roleId]);
      }
    } else {
      const [waypoint, currentRoleId] = legWaypoint;
      if (currentRoleId !== roleId) {
        this.props.waypointRenderer.deregister(waypoint, currentRoleId, MapSystemWaypointRoles.FlightPlan);
        this.props.waypointRenderer.register(waypoint, roleId, MapSystemWaypointRoles.FlightPlan);

        this.legWaypoints.set(leg, [waypoint, roleId]);
      }
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <>
        <MapCachedCanvasLayer
          ref={this.flightPathLayerRef}
          model={this.props.model}
          mapProjection={this.props.mapProjection}
          overdrawFactor={Math.SQRT2}
          collapseOnSleep
          class={this.props.class ?? ''}
        />
        <MapSyncedCanvasLayer
          ref={this.waypointLayerRef}
          model={this.props.model}
          mapProjection={this.props.mapProjection}
          collapseOnSleep
          class={this.props.class ?? ''}
        />
      </>
    );
  }
}

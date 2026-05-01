import {
  AirportClass, BitFlags, FacilityType, FacilityWaypoint, FacilityWaypointUtils, IntersectionType, MapFlightPlanModule, MappedSubject, MapSystemContext, MapSystemController,
  MapSystemKeys, MapSystemWaypointsRenderer, MapWaypointDisplayModule, NearestAirportSearchSession, NearestVorSearchSession, Subscribable, Subscription, UnitType, Waypoint,
} from '@microsoft/msfs-sdk';
import { AirportWaypoint } from '../../Navigation/AirportWaypoint';
import { FlightPlanIndex } from '../../Fms';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';

/** Modules required by WaypointDisplayController. */
export interface WaypointDisplayControllerModules {
  /** Waypoints display module. */
  [MapSystemKeys.NearestWaypoints]: MapWaypointDisplayModule;
  /** Waypoints display module. */
  [MapSystemKeys.FlightPlan]: MapFlightPlanModule;
}

/** Context required by WaypointDisplayController. */
export interface WaypointDisplayControllerContext {
  /** WaypointRenderer. */
  [MapSystemKeys.WaypointRenderer]: MapSystemWaypointsRenderer;
}

/** A map system controller that controls the display settings of the nearest waypoints. */
export class MapWaypointDisplayController extends MapSystemController<
  WaypointDisplayControllerModules, any, any, WaypointDisplayControllerContext
> {
  public static readonly CtrWaypointRole = 'CtrWptRole';

  private readonly waypointsDisplayModule: MapWaypointDisplayModule = this.context.model.getModule(MapSystemKeys.NearestWaypoints);

  private readonly flightPlanModule: MapFlightPlanModule = this.context.model.getModule(MapSystemKeys.FlightPlan);

  protected displayWaypoint: FacilityWaypoint | undefined;
  private readonly subscriptions: Subscription[] = [];

  private rangeSetting = 0;
  private isPreviewMode = false;
  private readonly facilityMaxRange = new Map<FacilityType, number>([
    [FacilityType.Airport, 150],
    [FacilityType.Intersection, 50],
    [FacilityType.VOR, 200],
    [FacilityType.NDB, 200],
  ]);

  /**
   * Creates an instance of the WaypointDisplayController.
   * @param context The map system context to use with this controller.
   * @param mapDataProvider The map data provider to use.
   * @param mapRange The map range.
   */
  constructor(
    context: MapSystemContext<WaypointDisplayControllerModules, any, any, WaypointDisplayControllerContext>,
    private readonly mapDataProvider: MapDataProvider,
    private readonly mapRange: Subscribable<number>,
  ) {
    super(context);
  }

  /** @inheritdoc */
  public onAfterMapRender(): void {
    this.wireSettings();

    this.waypointsDisplayModule.airportsRange.set(200, UnitType.NMILE);
    this.waypointsDisplayModule.intersectionsRange.set(50, UnitType.NMILE);
    this.waypointsDisplayModule.vorsRange.set(200, UnitType.NMILE);
    this.waypointsDisplayModule.ndbsRange.set(200, UnitType.NMILE);

    this.waypointsDisplayModule.intersectionsFilter.set({
      typeMask: BitFlags.union(
        BitFlags.createFlag(IntersectionType.Named),
        BitFlags.createFlag(IntersectionType.Unnamed),
        BitFlags.createFlag(IntersectionType.Offroute),
        BitFlags.createFlag(IntersectionType.IAF),
        BitFlags.createFlag(IntersectionType.FAF),
        BitFlags.createFlag(IntersectionType.RNAV),
      ),
      showTerminalWaypoints: false,
    });

    this.waypointsDisplayModule.vorsFilter.set({
      typeMask: NearestVorSearchSession.Defaults.TypeMask,
      classMask: NearestVorSearchSession.Defaults.ClassMask,
    });

    this.waypointsDisplayModule.airportsFilter.set({
      classMask: BitFlags.union(
        BitFlags.createFlag(AirportClass.HardSurface),
        BitFlags.createFlag(AirportClass.SoftSurface),
        BitFlags.createFlag(AirportClass.AllWater),
        BitFlags.createFlag(AirportClass.Private),
      ),
      showClosed: NearestAirportSearchSession.Defaults.ShowClosed,
    });

    this.waypointsDisplayModule.extendedAirportsFilter.set({
      runwaySurfaceTypeMask: NearestAirportSearchSession.Defaults.SurfaceTypeMask,
      approachTypeMask: NearestAirportSearchSession.Defaults.ApproachTypeMask,
      minimumRunwayLength: 155,
      toweredMask: NearestAirportSearchSession.Defaults.ToweredMask,
    });
  }

  /**
   * Wires the settings system to the waypoint display controller.
   */
  private wireSettings(): void {
    this.subscriptions.push(
      this.mapDataProvider.mapVorsDisplay.pipe(
        this.waypointsDisplayModule.showVors,
        (val) => () => val,
        false,
      ),
      this.mapDataProvider.mapNdbsDisplay.pipe(
        this.waypointsDisplayModule.showNdbs,
        (val) => () => val,
        false,
      ),
      this.mapDataProvider.mapIntersectionsDisplay.pipe(
        this.waypointsDisplayModule.showIntersections,
        (val) => () => val,
        false,
      ),
      MappedSubject.create(
        this.mapDataProvider.mapAirportsToweredDisplay,
        this.mapDataProvider.mapAirportsNonToweredDisplay,
      ).pipe(
        this.waypointsDisplayModule.showAirports,
        ([showTowered, showNonTowered]) => (fac) =>
          (fac.facility.get().towered && showTowered) || (!fac.facility.get().towered && showNonTowered),
        false,
      ),
    );

    this.subscriptions.push(
      MappedSubject.create(
        this.mapDataProvider.navDetailLevel,
        this.mapDataProvider.previewMode,
      ).sub(([detailLevel, isPreview]) => {
        this.isPreviewMode = isPreview;
        this.handleNavDetailChanged(detailLevel);
      }, true),
    );

    this.subscriptions.push(
      this.mapRange.sub((v) => {
        this.rangeSetting = v;
      }),
    );
  }

  /**
   * Determines if a map waypoint should be displayed because it is the selected facility.
   * @param facType The type of facility.
   * @param shouldShow The current setting value for that facility type.
   * @returns A function that is checking if the waypoint is the selected waypoint.
   */
  private shouldShowWaypoint(facType: FacilityType, shouldShow: boolean): (w: Waypoint) => boolean {
    return (w) => {
      if (FacilityWaypointUtils.isFacilityWaypoint(w) && !(w instanceof AirportWaypoint)) {
        // Don't show waypoint if it's in the active plan
        const plan = this.flightPlanModule.getPlanSubjects(FlightPlanIndex.Active).flightPlan.get();
        if (plan) {
          for (const leg of plan.legs()) {
            if (leg.leg.fixIcao === w.facility.get().icao) {
              return false;
            }
          }
        }

      }

      const maxRange = this.facilityMaxRange.get(facType) ?? 600;
      if (this.rangeSetting > maxRange) {
        return false;
      }

      return shouldShow;
    };
  }

  /**
   * Handles when the waypoint density settings has changed.
   * @param detailLevel The waypoint detail level to apply.
   */
  private handleNavDetailChanged(detailLevel: number): void {
    const detailCoefficients = 20; // @todo this value should be configurable using Map Tab settings in the future

    if (this.isPreviewMode) {
      this.waypointsDisplayModule.numAirports.set(3);
      this.waypointsDisplayModule.numIntersections.set(3);
      this.waypointsDisplayModule.numVors.set(3);
      this.waypointsDisplayModule.numNdbs.set(3);

      this.waypointsDisplayModule.refreshWaypoints.notify();
      return;
    }

    this.waypointsDisplayModule.numAirports.set(1 + detailCoefficients * detailLevel);
    this.waypointsDisplayModule.numIntersections.set(10 + detailCoefficients * detailLevel);
    this.waypointsDisplayModule.numVors.set(10 + detailCoefficients * detailLevel);
    this.waypointsDisplayModule.numNdbs.set(10 + detailCoefficients * detailLevel);
    this.waypointsDisplayModule.refreshWaypoints.notify();
  }

  /** @inheritdoc */
  public destroy(): void {
    for (const sub of this.subscriptions) {
      sub.destroy();
    }
    this.subscriptions.length = 0;
    super.destroy();
  }
}

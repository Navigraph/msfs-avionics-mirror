import {
  ActiveLegType, AirportFacility, AirportFacilityDataFlags, BitFlags, ClockEvents, ConsumerValue, ControlEvents, EventBus, FacilityLoader, FacilityType,
  FlightPathUtils, FlightPathVector, FlightPathVectorFlags, FlightPlanActiveLegEvent, FlightPlanLegEvent, FlightPlanner, FlightPlanOriginDestEvent,
  FlightPlanPredictorUtils, FlightPlanSegmentEvent, FlightPlanSegmentType, FlightPlanUtils, GeoCircle, GeoPoint, GeoPointInterface, GNSSEvents, ICAO, IcaoValue,
  LegCalculations, LegDefinition, LegDefinitionFlags, LegType, LNavControlEvents, LNavEvents, LNavObsEvents, LNavTransitionMode, LNavUtils, MagVar, NavEvents,
  OriginDestChangeType, Publisher, RunwayUtils, Subject, UnitType, Vec3Math, VorToFrom
} from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';
import { GnssReceiverEvents } from '../Systems/Gnss/GnssTypes';
import { BaseLNavDataEvents, LNavDataEvents } from './LNavDataEvents';

/**
 * A publisher of an LNAV data event bus topic.
 */
class LNavDataTopicPublisher<T extends keyof BaseLNavDataEvents> {
  /** The topic name to which this publisher publishes. */
  public topic: T | `${T}_${number}`;

  /** The value of this publisher's topic data. */
  public value: BaseLNavDataEvents[T];

  private readonly equalityFunc: (a: BaseLNavDataEvents[T], b: BaseLNavDataEvents[T]) => boolean;

  /**
   * Creates a new instance of LNavDataTopicPublisher.
   * @param publisher The publisher to use to publish this entry's topic.
   * @param topic The topic name.
   * @param initialValue The topic's initial value.
   * @param equalityFunc A function that checks whether two values are equal. If not defined, then the publisher will
   * use the strict equality operator (`===`) to determine whether two values are equal.
   */
  public constructor(
    private readonly publisher: Publisher<LNavDataEvents>, topic: T | `${T}_${number}`,
    initialValue: BaseLNavDataEvents[T],
    equalityFunc?: (a: BaseLNavDataEvents[T], b: BaseLNavDataEvents[T]) => boolean
  ) {
    this.topic = topic;
    this.value = initialValue;

    this.equalityFunc = equalityFunc ?? ((a, b) => a === b);
  }

  /**
   * Publishes a value to this publisher's topic. The value will be published if and only if it is not equal to this
   * publisher's existing value or if a republish is requested.
   * @param value The value to publish to the topic. If not defined, then the current value will be republished.
   */
  public publish(value?: BaseLNavDataEvents[T]): void {
    if (value === undefined || !this.equalityFunc(value, this.value)) {
      if (value !== undefined) {
        (this.value as BaseLNavDataEvents[T]) = value;
      }

      this.publisher.pub(this.topic, this.value as any, true, true);
    }
  }
}

/**
 * Data describing a nominal flight path-defining geo circle tracked by LNAV.
 */
type NominalPathGeoCircle = {
  /** The index of the flight path vector associated with the geo circle. */
  vectorIndex: number;

  /** The geo circle. */
  circle: GeoCircle;
};

/** LNAV data that is published elsewhere. */
type OmittedLnavDataEvents = 'lnavdata_cdi_scale' | 'lnavdata_cdi_scale_label';

/**
 * Computes LNAV-related data.
 */
export class IfdNavDataComputer {
  private static readonly MIN_ETE_PREDICTION_GS = 30;

  private readonly geoPointCache = [new GeoPoint(0, 0)];

  private readonly publisher = this.bus.getPublisher<LNavDataEvents>();

  private readonly useSimObsState = true;

  private readonly eventBusTopicPublishers: {
    [P in keyof Omit<BaseLNavDataEvents, OmittedLnavDataEvents>]: LNavDataTopicPublisher<P>;
  };

  private readonly planePos = new GeoPoint(0, 0);
  private readonly magVar: ConsumerValue<number>;
  private readonly isObsActive: ConsumerValue<boolean>;
  private readonly groundSpeedKnots = ConsumerValue.create(this.bus.getSubscriber<GnssReceiverEvents>().on('gnss_ground_speed_kts'), 0);

  private readonly obsAvailable = Subject.create<boolean>(false);

  private readonly lnavIsTracking: ConsumerValue<boolean>;
  private readonly lnavLegIndex: ConsumerValue<number>;
  private readonly lnavVectorIndex: ConsumerValue<number>;
  private readonly lnavTransitionMode: ConsumerValue<LNavTransitionMode>;
  private readonly lnavIsSuspended: ConsumerValue<boolean>;
  private readonly lnavDtk: ConsumerValue<number>;
  private readonly lnavXtk: ConsumerValue<number>;
  private readonly lnavLegDistanceRemaining: ConsumerValue<number>;

  private readonly isMaprActive: ConsumerValue<boolean>;

  private readonly nominalPathCircle: NominalPathGeoCircle = {
    vectorIndex: -1,
    circle: new GeoCircle(Vec3Math.create(), 0),
  };

  private primaryPlanOriginFacility?: AirportFacility;
  private primaryPlanDestinationFacility?: AirportFacility;

  private needUpdateDestination = true;
  private destinationPlanIndex?: number;
  private destinationIcao?: IcaoValue;
  private destinationFacility?: AirportFacility;
  private destinationLeg?: LegDefinition;

  /**
   * Creates a new instance of the IfdNavdataComputer.
   * @param bus The event bus to use with this instance.
   * @param flightPlanner The flight planner to use with this instance.
   * @param facilityLoader The facility loader to use with this instance.
   * @param lnavIndex The index of the LNAV computer from which this computer sources data.
   */
  public constructor(
    private readonly bus: EventBus,
    private readonly flightPlanner: FlightPlanner,
    private readonly facilityLoader: FacilityLoader,
    public readonly lnavIndex: number,
  ) {
    const lnavTopicSuffix = LNavUtils.getEventBusTopicSuffix(this.lnavIndex);
    this.eventBusTopicPublishers = {
      'lnavdata_dtk_true': new LNavDataTopicPublisher<'lnavdata_dtk_true'>(this.publisher, `lnavdata_dtk_true${lnavTopicSuffix}`, 0),
      'lnavdata_dtk_mag': new LNavDataTopicPublisher<'lnavdata_dtk_mag'>(this.publisher, `lnavdata_dtk_mag${lnavTopicSuffix}`, 0),
      'lnavdata_xtk': new LNavDataTopicPublisher<'lnavdata_xtk'>(this.publisher, `lnavdata_xtk${lnavTopicSuffix}`, 0),
      'lnavdata_is_steer_heading': new LNavDataTopicPublisher<'lnavdata_is_steer_heading'>(this.publisher, `lnavdata_is_steer_heading${lnavTopicSuffix}`, false),
      'lnavdata_next_dtk_true': new LNavDataTopicPublisher<'lnavdata_next_dtk_true'>(this.publisher, `lnavdata_next_dtk_true${lnavTopicSuffix}`, 0),
      'lnavdata_next_dtk_mag': new LNavDataTopicPublisher<'lnavdata_next_dtk_mag'>(this.publisher, `lnavdata_next_dtk_mag${lnavTopicSuffix}`, 0),
      'lnavdata_next_is_steer_heading': new LNavDataTopicPublisher<'lnavdata_next_is_steer_heading'>(this.publisher, `lnavdata_next_is_steer_heading${lnavTopicSuffix}`, false),
      'lnavdata_waypoint_bearing_true': new LNavDataTopicPublisher<'lnavdata_waypoint_bearing_true'>(this.publisher, `lnavdata_waypoint_bearing_true${lnavTopicSuffix}`, 0),
      'lnavdata_waypoint_bearing_mag': new LNavDataTopicPublisher<'lnavdata_waypoint_bearing_mag'>(this.publisher, `lnavdata_waypoint_bearing_mag${lnavTopicSuffix}`, 0),
      'lnavdata_waypoint_distance': new LNavDataTopicPublisher<'lnavdata_waypoint_distance'>(this.publisher, `lnavdata_waypoint_distance${lnavTopicSuffix}`, 0),
      'lnavdata_waypoint_ete': new LNavDataTopicPublisher<'lnavdata_waypoint_ete'>(this.publisher, `lnavdata_waypoint_ete${lnavTopicSuffix}`, NaN),
      'lnavdata_waypoint_ident': new LNavDataTopicPublisher<'lnavdata_waypoint_ident'>(this.publisher, `lnavdata_waypoint_ident${lnavTopicSuffix}`, ''),
      'lnavdata_destination_distance': new LNavDataTopicPublisher<'lnavdata_destination_distance'>(this.publisher, `lnavdata_destination_distance${lnavTopicSuffix}`, -1),
      'lnavdata_destination_icao': new LNavDataTopicPublisher<'lnavdata_destination_icao'>(
        this.publisher,
        `lnavdata_destination_icao${lnavTopicSuffix}`,
        ICAO.emptyValue(),
        ICAO.valueEquals
      ),
      'lnavdata_destination_ident': new LNavDataTopicPublisher<'lnavdata_destination_ident'>(this.publisher, `lnavdata_destination_ident${lnavTopicSuffix}`, ''),
      'lnavdata_destination_runway_icao': new LNavDataTopicPublisher<'lnavdata_destination_runway_icao'>(
        this.publisher,
        `lnavdata_destination_runway_icao${lnavTopicSuffix}`,
        ICAO.emptyValue(),
        ICAO.valueEquals
      ),
      'lnavdata_egress_distance': new LNavDataTopicPublisher<'lnavdata_egress_distance'>(this.publisher, `lnavdata_egress_distance${lnavTopicSuffix}`, 0),
      'lnavdata_egress_ete': new LNavDataTopicPublisher<'lnavdata_egress_ete'>(this.publisher, `lnavdata_egress_ete${lnavTopicSuffix}`, NaN),
      'lnavdata_tofrom': new LNavDataTopicPublisher<'lnavdata_tofrom'>(this.publisher, `lnavdata_tofrom${lnavTopicSuffix}`, VorToFrom.OFF),
      'lnavdata_dtk_vector': new LNavDataTopicPublisher<'lnavdata_dtk_vector'>(this.publisher, `lnavdata_dtk_vector${lnavTopicSuffix}`, { globalLegIndex: -1, vectorIndex: -1 }),
      'lnavdata_next_dtk_vector': new LNavDataTopicPublisher<'lnavdata_next_dtk_vector'>(this.publisher, `lnavdata_next_dtk_vector${lnavTopicSuffix}`, { globalLegIndex: -1, vectorIndex: -1 }),
      'obs_available': new LNavDataTopicPublisher<'obs_available'>(this.publisher, `obs_available${lnavTopicSuffix}`, false),
    };

    const sub = this.bus.getSubscriber<ClockEvents & ControlEvents & GNSSEvents & LNavEvents & LNavControlEvents & LNavObsEvents & NavEvents>();

    this.magVar = ConsumerValue.create(sub.on('magvar'), 0);
    this.isObsActive = ConsumerValue.create(sub.on(this.useSimObsState ? 'gps_obs_active' : `lnav_obs_active${lnavTopicSuffix}`), false);

    this.lnavIsTracking = ConsumerValue.create(sub.on(`lnav_is_tracking${lnavTopicSuffix}`), false);
    this.lnavLegIndex = ConsumerValue.create(sub.on(`lnav_tracked_leg_index${lnavTopicSuffix}`), 0);
    this.lnavVectorIndex = ConsumerValue.create(sub.on(`lnav_tracked_vector_index${lnavTopicSuffix}`), 0);
    this.lnavTransitionMode = ConsumerValue.create(sub.on(`lnav_transition_mode${lnavTopicSuffix}`), LNavTransitionMode.None);
    this.lnavIsSuspended = ConsumerValue.create(sub.on(`lnav_is_suspended${lnavTopicSuffix}`), false);
    this.lnavDtk = ConsumerValue.create(sub.on(`lnav_dtk${lnavTopicSuffix}`), 0);
    this.lnavXtk = ConsumerValue.create(sub.on(`lnav_xtk${lnavTopicSuffix}`), 0);
    this.lnavLegDistanceRemaining = ConsumerValue.create(sub.on(`lnav_leg_distance_remaining${lnavTopicSuffix}`), 0);
    this.isMaprActive = ConsumerValue.create(sub.on(`activate_missed_approach${lnavTopicSuffix}`), false);

    sub.on('gps-position').handle(lla => { this.planePos.set(lla.lat, lla.long); });

    this.flightPlanner.onEvent('fplOriginDestChanged').handle(this.onOriginDestChanged.bind(this));
    this.flightPlanner.onEvent('fplSegmentChange').handle(() => this.onSegmentChanged.bind(this));
    this.flightPlanner.onEvent('fplLegChange').handle(this.onLegChanged.bind(this));
    this.flightPlanner.onEvent('fplIndexChanged').handle(this.onActivePlanChanged.bind(this));
    this.flightPlanner.onEvent('fplActiveLegChange').handle(this.onActiveLegChanged.bind(this));

    sub.on('realTime').handle(() => {
      this.computeTrackingData();
    });

    this.republishEventBusTopics();

    this.obsAvailable.sub(v => {
      this.eventBusTopicPublishers['obs_available'].publish(v);
    });
  }

  /**
   * Immediately republishes all event bus topics with their current values.
   */
  private republishEventBusTopics(): void {
    for (const topic in this.eventBusTopicPublishers) {
      this.eventBusTopicPublishers[topic as keyof Omit<BaseLNavDataEvents, OmittedLnavDataEvents>].publish();
    }
  }

  /**
   * Responds to when a flight plan origin or destination changes.
   * @param event The event data describing the change.
   */
  private onOriginDestChanged(event: FlightPlanOriginDestEvent): void {
    if (event.planIndex !== Fms.PRIMARY_PLAN_INDEX) {
      return;
    }

    if (event.airport !== undefined) {
      if (event.type === OriginDestChangeType.OriginAdded) {
        this.updatePrimaryPlanOriginFacility(event.airport);
      } else {
        this.updatePrimaryPlanDestinationFacility(event.airport);
      }
    } else {
      if (event.type === OriginDestChangeType.OriginRemoved) {
        this.updatePrimaryPlanOriginFacility(undefined);
      } else {
        this.updatePrimaryPlanDestinationFacility(undefined);
      }
    }

    if (event.type === OriginDestChangeType.DestinationAdded || event.type === OriginDestChangeType.DestinationRemoved) {
      this.needUpdateDestination = true;
    }
  }

  /**
   * Responds to when a flight plan segment changes.
   * @param event The event data describing the change.
   */
  private onSegmentChanged(event: FlightPlanSegmentEvent): void {
    if (event.planIndex === Fms.PRIMARY_PLAN_INDEX) {
      this.needUpdateDestination = true;
    }
  }

  /**
   * Responds to when a flight plan leg changes.
   * @param event The event data describing the change.
   */
  private onLegChanged(event: FlightPlanLegEvent): void {
    if (event.planIndex === Fms.PRIMARY_PLAN_INDEX) {
      this.needUpdateDestination = true;
    }
  }

  /**
   * Responds to when the active flight plan changes.
   */
  private onActivePlanChanged(): void {
    this.needUpdateDestination = true;
  }

  /**
   * Responds to when a flight plan active leg changes.
   * @param event The event data describing the change.
   */
  private onActiveLegChanged(event: FlightPlanActiveLegEvent): void {
    if (event.type === ActiveLegType.Lateral) {
      if (event.planIndex === Fms.PRIMARY_PLAN_INDEX) {
        this.needUpdateDestination = true;
      }
    }
  }

  private primaryPlanOriginFacilityOpId = 0;

  /**
   * Updates the primary flight plan's origin airport facility.
   * @param icao The ICAO of the origin airport facility, or `undefined` if there is no origin airport.
   */
  private async updatePrimaryPlanOriginFacility(icao: string | undefined): Promise<void> {
    const opId = ++this.primaryPlanOriginFacilityOpId;

    if (icao === undefined) {
      this.primaryPlanOriginFacility = undefined;
      return;
    }

    const facility = await this.facilityLoader.getFacility(FacilityType.Airport, icao);

    if (opId !== this.primaryPlanOriginFacilityOpId) {
      return;
    }

    this.primaryPlanOriginFacility = facility;
  }

  private primaryPlanDestinationFacilityOpId = 0;

  /**
   * Updates the primary flight plan's destination airport facility.
   * @param icao The ICAO of the destination airport facility, or `undefined` if there is no destination airport.
   */
  private async updatePrimaryPlanDestinationFacility(icao: string | undefined): Promise<void> {
    const opId = ++this.primaryPlanDestinationFacilityOpId;

    if (icao === undefined) {
      this.primaryPlanDestinationFacility = undefined;
      return;
    }

    const facility = await this.facilityLoader.getFacility(FacilityType.Airport, icao);

    if (opId !== this.primaryPlanDestinationFacilityOpId) {
      return;
    }

    this.primaryPlanDestinationFacility = facility;
  }

  /**
   * Computes the nav tracking data, such as XTK, DTK, and distance to turn.
   */
  private computeTrackingData(): void {
    const magVar = this.magVar.get();

    let xtk = 0;
    let dtkLegIndex = -1;
    let dtkVectorIndex = -1;
    let dtkTrue = 0;
    let dtkMag = 0;
    let isSteerHeading = false;
    let nextDtkLegIndex = -1;
    let nextDtkVectorIndex = -1;
    let nextDtkTrue = 0;
    let nextDtkMag = 0;
    let nextIsSteerHeading = false;
    let distance = 0;
    let ete = NaN;
    let waypointBearingTrue = 0;
    let waypointBearingMag = 0;
    let waypointIdent = '';
    let egressDistance = 0;
    let egressEte = NaN;
    let destinationDistance = -1;
    let toFrom = VorToFrom.OFF;

    const activePlan = this.flightPlanner.hasActiveFlightPlan() ? this.flightPlanner.getActiveFlightPlan() : undefined;

    this.updateObsAvailable(activePlan ? activePlan.tryGetLeg(activePlan.activeLateralLeg) : null);

    if (this.needUpdateDestination) {
      this.updateDestination();
      this.needUpdateDestination = false;
    }

    if (this.lnavIsTracking.get()) {
      const isSuspended = this.lnavIsSuspended.get();
      const trackedLegIndex = this.lnavLegIndex.get();
      const nextLegIndex = trackedLegIndex + 1;

      const currentLeg = activePlan && trackedLegIndex >= 0 && trackedLegIndex < activePlan.length ? activePlan.getLeg(trackedLegIndex) : undefined;
      const nextLeg = activePlan && nextLegIndex >= 0 && nextLegIndex < activePlan.length ? activePlan.getLeg(nextLegIndex) : undefined;

      if (currentLeg?.calculated) {
        distance = this.getActiveDistance(currentLeg, this.planePos);
        ete = this.getEte(distance);

        destinationDistance = this.getDestinationDistance(trackedLegIndex, distance);
        waypointIdent = currentLeg.name ?? '';

        if (currentLeg.calculated.endLat !== undefined && currentLeg.calculated.endLon) {
          waypointBearingTrue = this.planePos.bearingTo(currentLeg.calculated.endLat, currentLeg.calculated.endLon);
          waypointBearingMag = MagVar.trueToMagnetic(waypointBearingTrue, magVar);
        }
      }

      // Next DTK is only valid if we are actually going to sequence into the next leg, so we have to make sure LNAV is not suspended
      // and won't go into suspend at the end of the leg.
      if (
        nextLeg !== undefined
        && nextLeg.calculated
        && nextLeg.calculated.startLat !== undefined && nextLeg.calculated.startLon !== undefined
        && !isSuspended
        && nextLeg.leg.type !== LegType.Discontinuity
        && (!BitFlags.isAny(nextLeg.flags, LegDefinitionFlags.MissedApproach) || this.isMaprActive.get())
      ) {
        const result = this.getNominalPathCircle(nextLeg, 0, LNavTransitionMode.Ingress, this.nominalPathCircle);
        if (result.vectorIndex >= 0) {
          nextDtkLegIndex = nextLegIndex;
          nextDtkVectorIndex = result.vectorIndex;

          const vector = nextLeg.calculated.flightPath[result.vectorIndex];
          if (vector.heading === null) {
            nextDtkTrue = result.circle.bearingAt(this.geoPointCache[0].set(nextLeg.calculated.startLat, nextLeg.calculated.startLon), Math.PI);
            nextDtkMag = MagVar.trueToMagnetic(nextDtkTrue, nextLeg.calculated.startLat, nextLeg.calculated.startLon);
            nextIsSteerHeading = false;
          } else {
            if (vector.isHeadingTrue) {
              nextDtkTrue = vector.heading;
              nextDtkMag = MagVar.trueToMagnetic(nextDtkTrue, nextLeg.calculated.startLat, nextLeg.calculated.startLon);
            } else {
              nextDtkMag = vector.heading;
              nextDtkTrue = MagVar.magneticToTrue(nextDtkTrue, nextLeg.calculated.startLat, nextLeg.calculated.startLon);
            }
            nextIsSteerHeading = true;
          }
        }
      }

      if (this.isObsActive.get()) {
        xtk = this.lnavXtk.get();
        dtkLegIndex = trackedLegIndex;
        dtkVectorIndex = -1;
        dtkTrue = this.lnavDtk.get();
        dtkMag = MagVar.trueToMagnetic(dtkTrue, magVar);
        egressDistance = this.lnavLegDistanceRemaining.get();
        toFrom = egressDistance < 0 ? VorToFrom.FROM : VorToFrom.TO;
      } else {
        const transitionMode = this.lnavTransitionMode.get();

        let dtkVector: FlightPathVector | undefined;
        let circle: GeoCircle | undefined;
        if (transitionMode === LNavTransitionMode.Egress && nextLeg?.calculated?.flightPath.length) {
          const result = this.getNominalPathCircle(nextLeg, 0, LNavTransitionMode.Ingress, this.nominalPathCircle);
          if (result.vectorIndex >= 0) {
            dtkLegIndex = nextLegIndex;
            dtkVectorIndex = result.vectorIndex;
            dtkVector = nextLeg.calculated.flightPath[dtkVectorIndex];
            circle = result.circle;
          }

          egressDistance = UnitType.METER.convertTo(nextLeg.calculated.distanceWithTransitions, UnitType.NMILE) - IfdNavDataComputer.getEgressDistance(nextLeg)
            + this.lnavLegDistanceRemaining.get();
        } else if (currentLeg?.calculated?.flightPath.length) {
          const vectorIndex = this.lnavVectorIndex.get() - currentLeg.calculated.ingressJoinIndex;

          const result = this.getNominalPathCircle(currentLeg, vectorIndex, transitionMode, this.nominalPathCircle);
          if (result.vectorIndex >= 0) {
            dtkLegIndex = trackedLegIndex;
            dtkVectorIndex = result.vectorIndex;
            dtkVector = currentLeg.calculated.flightPath[dtkVectorIndex];
            circle = result.circle;
          }

          if (FlightPlanUtils.isManualDiscontinuityLeg(currentLeg.leg.type)) {
            // MANSEQ legs aren't supposed to have an "end", so set egress distance to an arbitrarily large value.
            egressDistance = Number.MAX_SAFE_INTEGER;
          } else {
            egressDistance = this.lnavLegDistanceRemaining.get() - (
              // Distance remaining published by LNAV does not include egress if suspend is active
              isSuspended ? 0 : IfdNavDataComputer.getEgressDistance(currentLeg)
            );
          }
        }

        egressEte = this.getEte(egressDistance);

        if (dtkVector && circle) {
          if (dtkVector.heading === null) {
            xtk = UnitType.GA_RADIAN.convertTo(circle.distance(this.planePos), UnitType.NMILE);
            dtkTrue = circle.bearingAt(this.planePos, Math.PI);
            dtkMag = MagVar.trueToMagnetic(dtkTrue, magVar);
            isSteerHeading = false;
          } else {
            xtk = 0;
            if (dtkVector.isHeadingTrue) {
              dtkTrue = dtkVector.heading;
              dtkMag = MagVar.trueToMagnetic(nextDtkTrue, magVar);
            } else {
              dtkMag = dtkVector.heading;
              dtkTrue = MagVar.magneticToTrue(nextDtkTrue, magVar);
            }
            isSteerHeading = true;
          }

          const dtkLeg = dtkLegIndex === nextLegIndex ? nextLeg! : currentLeg!;
          switch (dtkLeg.leg.type) {
            case LegType.AF:
            case LegType.RF:
              toFrom = this.lnavLegDistanceRemaining.get() < 0 ? VorToFrom.FROM : VorToFrom.TO;
              break;
            default:
              if (circle.isGreatCircle()) {
                const angleAlong = circle.angleAlong(this.planePos, this.geoPointCache[0].set(dtkVector.endLat, dtkVector.endLon), Math.PI);
                toFrom = angleAlong > Math.PI ? VorToFrom.FROM : VorToFrom.TO;
              } else {
                toFrom = this.lnavLegDistanceRemaining.get() < 0 ? VorToFrom.FROM : VorToFrom.TO;
              }
          }
        }
      }
    }

    this.eventBusTopicPublishers['lnavdata_dtk_true'].publish(dtkTrue);
    this.eventBusTopicPublishers['lnavdata_dtk_mag'].publish(dtkMag);
    this.eventBusTopicPublishers['lnavdata_xtk'].publish(xtk);
    this.eventBusTopicPublishers['lnavdata_is_steer_heading'].publish(isSteerHeading);
    this.eventBusTopicPublishers['lnavdata_next_dtk_true'].publish(nextDtkTrue);
    this.eventBusTopicPublishers['lnavdata_next_dtk_mag'].publish(nextDtkMag);
    this.eventBusTopicPublishers['lnavdata_next_is_steer_heading'].publish(nextIsSteerHeading);
    this.eventBusTopicPublishers['lnavdata_waypoint_bearing_true'].publish(waypointBearingTrue);
    this.eventBusTopicPublishers['lnavdata_waypoint_bearing_mag'].publish(waypointBearingMag);
    this.eventBusTopicPublishers['lnavdata_waypoint_distance'].publish(distance);
    this.eventBusTopicPublishers['lnavdata_waypoint_ete'].publish(ete);
    this.eventBusTopicPublishers['lnavdata_waypoint_ident'].publish(waypointIdent);
    this.eventBusTopicPublishers['lnavdata_destination_distance'].publish(destinationDistance);

    this.updateDtkVector('lnavdata_dtk_vector', dtkLegIndex, dtkVectorIndex);
    this.updateDtkVector('lnavdata_next_dtk_vector', nextDtkLegIndex, nextDtkVectorIndex);

    this.eventBusTopicPublishers['lnavdata_tofrom'].publish(toFrom);
    this.eventBusTopicPublishers['lnavdata_egress_distance'].publish(egressDistance);
    this.eventBusTopicPublishers['lnavdata_egress_ete'].publish(egressEte);
  }

  /**
   * Updates the LNAV destination airport.
   */
  private updateDestination(): void {
    let destinationPlanIndex: number | undefined = undefined;
    let destinationIcao: IcaoValue | undefined = undefined;
    let destinationRunwayIcao: IcaoValue | undefined = undefined;
    let destinationLeg: LegDefinition | undefined = undefined;

    const primaryPlan = this.flightPlanner.hasFlightPlan(Fms.PRIMARY_PLAN_INDEX) ? this.flightPlanner.getFlightPlan(Fms.PRIMARY_PLAN_INDEX) : undefined;

    if (primaryPlan) {
      if (primaryPlan.destinationAirportIcao) {
        // If the primary flight plan has a destination airport, then it is always the LNAV destination.
        destinationPlanIndex = Fms.PRIMARY_PLAN_INDEX;
        destinationIcao = primaryPlan.destinationAirportIcao;

        destinationRunwayIcao = primaryPlan.procedureDetails.destinationRunway
          ? RunwayUtils.getRunwayFacilityIcaoValue(destinationIcao, primaryPlan.procedureDetails.destinationRunway)
          : undefined;

        for (const leg of primaryPlan.legs(true)) {
          if (!BitFlags.isAll(leg.flags, LegDefinitionFlags.MissedApproach)) {
            destinationLeg = leg;
            break;
          }
        }
      } else {
        // Find the last airport in the primary flight plan that we have not yet sequenced.
        let legIndex = primaryPlan.activeLateralLeg - 1;
        for (const leg of primaryPlan.legs(true, undefined, primaryPlan.activeLateralLeg - 1)) {
          if (BitFlags.isAll(leg.flags, LegDefinitionFlags.MissedApproach)) {
            // Skip all missed approach legs.
            continue;
          } else if (legIndex === 0 && primaryPlan.getSegmentFromLeg(leg)?.segmentType === FlightPlanSegmentType.Departure) {
            // Skip the first leg of the flight plan if it is in the departure segment. This prevents us from selecting
            // the origin airport.
            break;
          }

          if (ICAO.isValueFacility(leg.leg.fixIcaoStruct, FacilityType.Airport)) {
            destinationPlanIndex = Fms.PRIMARY_PLAN_INDEX;
            destinationIcao = leg.leg.fixIcaoStruct;
            destinationLeg = leg;
            break;
          }

          legIndex--;
        }
      }
    }

    this.destinationPlanIndex = destinationPlanIndex;
    this.destinationIcao = destinationIcao;
    this.destinationLeg = destinationLeg;

    const destinationIcaoToPublish = destinationIcao ?? ICAO.emptyValue();
    this.eventBusTopicPublishers['lnavdata_destination_icao'].publish(destinationIcaoToPublish);
    this.eventBusTopicPublishers['lnavdata_destination_ident'].publish(destinationIcaoToPublish.ident);

    this.eventBusTopicPublishers['lnavdata_destination_runway_icao'].publish(destinationRunwayIcao ?? ICAO.emptyValue());

    this.updateDestinationFacility(destinationIcao);
  }

  private destinationFacilityOpId = 0;

  /**
   * Updates the LNAV destination airport facility.
   * @param icao The ICAO of the destination airport facility, or `undefined` if there is no destination airport.
   */
  private async updateDestinationFacility(icao: IcaoValue | undefined): Promise<void> {
    const opId = ++this.destinationFacilityOpId;

    if (icao === undefined) {
      this.destinationFacility = undefined;
      return;
    }

    const facility = await this.facilityLoader.tryGetFacility(FacilityType.Airport, icao, AirportFacilityDataFlags.Minimal);

    if (opId !== this.destinationFacilityOpId) {
      return;
    }

    this.destinationFacility = facility ?? undefined;
  }

  /**
   * Updates a nominal desired track vector, and publishes the data to the event bus if necessary.
   * @param topic The event bus topic associated with the vector.
   * @param globalLegIndex The global index of the leg to which the vector belongs, or `-1` if there is no vector.
   * @param vectorIndex The index of the vector in its parent leg's `flightPath` array, or `-1` if there is no vector.
   */
  private updateDtkVector(
    topic: 'lnavdata_dtk_vector' | 'lnavdata_next_dtk_vector',
    globalLegIndex: number,
    vectorIndex: number
  ): void {
    const publisher = this.eventBusTopicPublishers[topic];
    const dtkVector = publisher.value;
    const needUpdate = dtkVector.globalLegIndex !== globalLegIndex
      || dtkVector.vectorIndex !== vectorIndex;

    if (needUpdate) {
      publisher.publish({ globalLegIndex, vectorIndex });
    }
  }

  /**
   * Gets the geo circle describing the nominal path tracked by LNAV.
   * @param leg The flight plan leg currently tracked by LNAV.
   * @param vectorIndex The index of the vector currently tracked by LNAV.
   * @param transitionMode The current LNAV transition mode.
   * @param out The object to which to write the result.
   * @returns The geo circle describing the initial path of a flight plan leg.
   */
  private getNominalPathCircle(
    leg: LegDefinition,
    vectorIndex: number,
    transitionMode: LNavTransitionMode,
    out: NominalPathGeoCircle
  ): NominalPathGeoCircle {
    out.vectorIndex = -1;

    if (!leg.calculated) {
      return out;
    }

    const legCalc = leg.calculated;

    // Fallback resolution paths are equivalent to DF legs.
    if (!legCalc.endsInFallback && BitFlags.isAll(legCalc.flightPath[0]?.flags ?? 0, FlightPathVectorFlags.Fallback | FlightPathVectorFlags.Direct)) {
      return this.getNominalPathCircleForEndCourseLeg(legCalc, out);
    }

    switch (leg.leg.type) {
      case LegType.FA:
      case LegType.CA:
      case LegType.VA:
      case LegType.FM:
      case LegType.VM:
      case LegType.DF:
      case LegType.CD:
      case LegType.VD:
      case LegType.CR:
      case LegType.VR:
      case LegType.CI:
      case LegType.VI:
        return this.getNominalPathCircleForEndCourseLeg(legCalc, out);
      case LegType.HM:
      case LegType.HF:
      case LegType.HA:
        return this.getNominalPathCircleForHoldLeg(legCalc, out);
      default: {
        let nominalVectorIndex: number;

        switch (transitionMode) {
          case LNavTransitionMode.Ingress:
            nominalVectorIndex = 0;
            break;
          case LNavTransitionMode.Egress:
            nominalVectorIndex = legCalc.flightPath.length - 1;
            break;
          default:
            nominalVectorIndex = vectorIndex;
        }

        const vector = legCalc.flightPath[nominalVectorIndex];

        if (vector !== undefined) {
          out.vectorIndex = nominalVectorIndex;
          FlightPathUtils.setGeoCircleFromVector(vector, out.circle);
        }
      }
    }

    return out;
  }

  /**
   * Gets the geo circle describing the nominal path tracked by LNAV for a flight plan leg whose nominal path is
   * defined by the course at the end of the leg.
   * @param legCalc The calculations for the flight plan leg.
   * @param out The object to which to write the result.
   * @returns The geo circle describing the initial path of a flight plan leg.
   */
  private getNominalPathCircleForEndCourseLeg(
    legCalc: LegCalculations,
    // eslint-disable-next-line jsdoc/require-jsdoc
    out: NominalPathGeoCircle
  ): NominalPathGeoCircle {
    out.vectorIndex = -1;

    const nominalVectorIndex = legCalc.flightPath.length - 1;
    const vector = legCalc.flightPath[nominalVectorIndex];

    if (!vector) {
      return out;
    }

    if (FlightPathUtils.isVectorGreatCircle(vector)) {
      out.vectorIndex = nominalVectorIndex;
      FlightPathUtils.setGeoCircleFromVector(vector, out.circle);
    } else {
      const turn = FlightPathUtils.setGeoCircleFromVector(vector, out.circle);
      const turnEnd = this.geoPointCache[0].set(vector.endLat, vector.endLon);
      const bearingAtEnd = turn.bearingAt(turnEnd, Math.PI);
      if (!isNaN(bearingAtEnd)) {
        out.vectorIndex = nominalVectorIndex;
        out.circle.setAsGreatCircle(turnEnd, bearingAtEnd);
      }
    }

    return out;
  }

  /**
   * Gets the geo circle describing the nominal path tracked by LNAV for a hold leg.
   * @param legCalc The calculations for the hold leg.
   * @param out The object to which to write the result.
   * @returns The geo circle describing the initial path of a flight plan leg.
   */
  private getNominalPathCircleForHoldLeg(
    legCalc: LegCalculations,
    out: NominalPathGeoCircle
  ): NominalPathGeoCircle {
    out.vectorIndex = -1;

    // The last base flight path vector for hold legs should always be the inbound leg
    if (legCalc.flightPath.length > 0) {
      out.vectorIndex = legCalc.flightPath.length - 1;
      FlightPathUtils.setGeoCircleFromVector(legCalc.flightPath[out.vectorIndex], out.circle);
    }

    return out;
  }

  /**
   * Gets the active distance from the plane position to the leg end.
   * @param leg The leg to get the distance for.
   * @param pos The current plane position.
   * @returns The distance, in nautical miles.
   */
  private getActiveDistance(leg: LegDefinition, pos: GeoPointInterface): number {
    const finalVector = leg.calculated?.flightPath[leg.calculated.flightPath.length - 1];
    if (finalVector !== undefined) {
      return UnitType.GA_RADIAN.convertTo(pos.distance(finalVector.endLat, finalVector.endLon), UnitType.NMILE);
    }

    return 0;
  }

  /**
   * Gets the estimated time enroute for a given distance, based on current ground speed.
   * @param distance The distance in nautical miles.
   * @returns The estimate time enroute in seconds, or NaN if not available.
   */
  private getEte(distance: number): number {
    const groundSpeedKnots = this.groundSpeedKnots.get();
    const currentGsKnots = (groundSpeedKnots === null || groundSpeedKnots < IfdNavDataComputer.MIN_ETE_PREDICTION_GS) ? NaN : groundSpeedKnots;
    return FlightPlanPredictorUtils.predictTime(currentGsKnots, distance);
  }

  /**
   * Gets the distance remaining, in nautical miles, to the LNAV destination.
   * @param activeLegIndex The global leg index of the active flight plan leg.
   * @param activeLegDistance The distance from the airplane's current position to the end of the active leg, in
   * nautical miles.
   * @returns The distance remaining, in nautical miles, to the LNAV destination, or `-1` if the distance cannot be
   * calculated.
   */
  private getDestinationDistance(activeLegIndex: number, activeLegDistance: number): number {
    if (this.destinationPlanIndex === undefined || this.destinationIcao === undefined) {
      return -1;
    }

    const destinationPlan = this.flightPlanner.hasFlightPlan(this.destinationPlanIndex) ? this.flightPlanner.getFlightPlan(this.destinationPlanIndex) : undefined;

    if (!destinationPlan) {
      return -1;
    }

    if (this.flightPlanner.activePlanIndex === this.destinationPlanIndex) {
      // The flight plan containing the destination leg is the active flight plan. In this case, the distance to
      // destination should be calculated as the along-track distance from the airplane to the destination (with one
      // exception if we have already sequenced the destination leg - see the case below).

      const activeLegCumDistance = destinationPlan.tryGetLeg(activeLegIndex)?.calculated?.cumulativeDistanceWithTransitions;
      const destinationLegCumDistance = this.destinationLeg?.calculated?.cumulativeDistanceWithTransitions;

      if (activeLegCumDistance === undefined || destinationLegCumDistance === undefined) {
        return -1;
      } else if (destinationLegCumDistance - activeLegCumDistance < 0) {
        // The destination leg cumulative distance is less than the active leg cumulative distance. This means we have
        // sequenced past the destination leg. In this case, we want to revert to a great-circle distance calculation
        // if and only if the LNAV destination is the primary flight plan's destination airport or the LNAV destination
        // is the off-route direct-to target. Therefore, if either of these conditions is met, then we will let the
        // code fall through to the default case below. If neither is met, then the chosen destination is invalid, so
        // we will return -1.
        if (
          this.destinationPlanIndex === Fms.PRIMARY_PLAN_INDEX
          && (
            !!destinationPlan.destinationAirportIcao !== !!this.destinationIcao
            || (destinationPlan.destinationAirportIcao && !ICAO.valueEquals(destinationPlan.destinationAirportIcao, this.destinationIcao))
          )
        ) {
          return -1;
        }
      } else {
        return UnitType.METER.convertTo(destinationLegCumDistance - activeLegCumDistance, UnitType.NMILE) + activeLegDistance;
      }
    }

    // If we have reached this point, then calculate the distance to destination as the great-circle distance from the
    // airplane to the destination.

    if (this.destinationLeg?.calculated && this.destinationLeg.calculated.endLat && this.destinationLeg.calculated.endLon) {
      return UnitType.GA_RADIAN.convertTo(
        this.planePos.distance(this.destinationLeg.calculated.endLat, this.destinationLeg.calculated.endLon),
        UnitType.NMILE
      );
    } else if (this.destinationFacility) {
      return UnitType.GA_RADIAN.convertTo(
        this.planePos.distance(this.destinationFacility),
        UnitType.NMILE
      );
    } else {
      return -1;
    }
  }

  /**
   * Updates whether OBS is available based on the current active flight plan leg, and sends a control event if OBS
   * availability has changed since the last update.
   * @param activeLeg The active flight plan leg, or `null` if none exists.
   */
  private updateObsAvailable(activeLeg: LegDefinition | null): void {
    let newObsAvailable = false;
    if (activeLeg) {
      switch (activeLeg.leg.type) {
        case LegType.AF:
        case LegType.CD:
        case LegType.CF:
        case LegType.CR:
        case LegType.DF:
        case LegType.IF:
        case LegType.RF:
        case LegType.TF:
          newObsAvailable = true;
          break;
      }
    }
    this.obsAvailable.set(newObsAvailable);
  }

  /**
   * Gets the total distance of the egress transition of a flight plan leg, in nautical miles.
   * @param leg The leg to get the distance for.
   * @returns The total distance distance of the egress transition of the specified flight plan leg, in nautical miles.
   */
  private static getEgressDistance(leg: LegDefinition): number {
    if (leg.calculated === undefined) {
      return 0;
    }

    let distance = 0;
    for (let i = 0; i < leg.calculated.egress.length; i++) {
      distance += leg.calculated.egress[i].distance;
    }

    return UnitType.METER.convertTo(distance, UnitType.NMILE);
  }
}

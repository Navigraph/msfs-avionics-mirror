import {
  BitFlags, ClockEvents, ConsumerSubject, ControlEvents, EventBus, FlightPathUtils, FlightPathVectorFlags, FlightPlanner, GeoCircle, GeoPoint,
  GeoPointInterface, GNSSEvents, LegDefinition, LegDefinitionFlags, LegType, LNavDataVars, LNavEvents, LNavTransitionMode, LNavUtils, MagVar, NavEvents,
  NavSourceId, NavSourceType, ObjectSubject, SimVarValueType, Subject, UnitType
} from '@microsoft/msfs-sdk';

import { UnsLNavConfig } from '../../Config/LNavConfigBuilder';
import { UnsMessageID } from '../Message/MessageDefinitions';
import { UnsFlightAreas } from '../UnsFlightAreas';
import { UnsFms } from '../UnsFms';
import { UnsFlightPlans } from '../UnsFmsTypes';
import { UnsLNavDataVars } from './UnsLNavDataEvents';

/**
 * Computes UNS-1 LNAV-related data.
 */
export class UnsNavDataComputer {
  private readonly geoPointCache = [new GeoPoint(0, 0), new GeoPoint(0, 0), new GeoPoint(0, 0)];
  private readonly geoCircleCache = [new GeoCircle(new Float64Array(3), 0)];

  private readonly isInDiscontinuity = Subject.create(false);
  private readonly is2MinutesFromDiscontinuity = Subject.create(false);

  private readonly planePos = new GeoPoint(0, 0);

  private missedApproachManuallyActivated = false;

  private readonly lnavIsTracking: ConsumerSubject<boolean>;
  private readonly lnavLegIndex: ConsumerSubject<number>;
  private readonly lnavVectorIndex: ConsumerSubject<number>;
  private readonly lnavTransitionMode: ConsumerSubject<LNavTransitionMode>;
  private readonly lnavIsSuspended: ConsumerSubject<boolean>;

  private readonly lnavData = ObjectSubject.create({
    dtkTrue: 0,
    dtkMag: 0,
    xtk: 0,
    nextDtkTrue: 0,
    nextDtkMag: 0,
    cdiScale: 2,
    waypointBearingTrue: 0,
    waypointBearingMag: 0,
    waypointDistance: 0,
    destinationDistance: 0,
    nominalLegIndex: 0,
    destinationDistanceDirect: Number.MAX_SAFE_INTEGER,
    distanceToFaf: Number.MAX_SAFE_INTEGER,
    flightArea: UnsFlightAreas.EnRoute,
  });

  private cdiSource?: NavSourceId;
  private groundSpeed = 0;
  private lnavLVarSuffix = this.lnavIndex === 0 ? '' : `:${this.lnavIndex}`;

  /**
   * Creates a new instance of the NavdataComputer.
   * @param bus The event bus to use with this instance.
   * @param flightPlanner The flight planner to use with this instance.
   * @param lnavIndex the LNAV index
   * @param fms the uns fms class
   */
  constructor(
    private readonly bus: EventBus,
    private readonly flightPlanner: FlightPlanner,
    private readonly lnavIndex: UnsLNavConfig['index'],
    private readonly fms: UnsFms
  ) {
    const sub = this.bus.getSubscriber<GNSSEvents & LNavEvents
      & ClockEvents & ControlEvents & NavEvents>();

    this.lnavIsTracking = ConsumerSubject.create(sub.on(`lnav_is_tracking${LNavUtils.getEventBusTopicSuffix(this.lnavIndex)}`), false);
    this.lnavLegIndex = ConsumerSubject.create(sub.on(`lnav_tracked_leg_index${LNavUtils.getEventBusTopicSuffix(this.lnavIndex)}`), 0);
    this.lnavVectorIndex = ConsumerSubject.create(sub.on(`lnav_tracked_vector_index${LNavUtils.getEventBusTopicSuffix(this.lnavIndex)}`), 0);
    this.lnavTransitionMode = ConsumerSubject.create(sub.on(`lnav_transition_mode${LNavUtils.getEventBusTopicSuffix(this.lnavIndex)}`), LNavTransitionMode.None);
    this.lnavIsSuspended = ConsumerSubject.create(sub.on(`lnav_is_suspended${LNavUtils.getEventBusTopicSuffix(this.lnavIndex)}`), false);

    sub.on('gps-position').handle(lla => { this.planePos.set(lla.lat, lla.long); });
    // In the WT21, the active flight plan is never modified directly
    // So instead we listen for when the mod flight plan is copied into the active flight plan
    sub.on('approach_freq_set').handle(() => {
      // Reset scaling when an approach is entered.
    });
    sub.on('ground_speed').withPrecision(0).handle(s => {
      this.groundSpeed = s;
    });

    sub.on('activate_missed_approach').handle(v => {
      this.missedApproachManuallyActivated = v;
    });

    this.lnavLegIndex.sub(trackedLegIndex => {
      if (this.missedApproachManuallyActivated) {
        this.handleActiveLegIndexChanged(trackedLegIndex);
      }
    });

    this.lnavData.sub((obj, key, value) => {
      switch (key) {
        case 'dtkTrue': SimVar.SetSimVarValue(`${LNavDataVars.DTKTrue}${this.lnavLVarSuffix}`, SimVarValueType.Degree, value); break;
        case 'dtkMag': SimVar.SetSimVarValue(`${LNavDataVars.DTKMagnetic}${this.lnavLVarSuffix}`, SimVarValueType.Degree, value); break;
        case 'xtk': SimVar.SetSimVarValue(`${LNavDataVars.XTK}${this.lnavLVarSuffix}`, SimVarValueType.NM, value); break;
        case 'cdiScale': SimVar.SetSimVarValue(`${LNavDataVars.CDIScale}${this.lnavLVarSuffix}`, SimVarValueType.NM, value); break;
        case 'waypointBearingTrue': SimVar.SetSimVarValue(`${LNavDataVars.WaypointBearingTrue}${this.lnavLVarSuffix}`, SimVarValueType.Degree, value); break;
        case 'waypointBearingMag': SimVar.SetSimVarValue(`${LNavDataVars.WaypointBearingMagnetic}${this.lnavLVarSuffix}`, SimVarValueType.Degree, value); break;
        case 'waypointDistance': SimVar.SetSimVarValue(`${LNavDataVars.WaypointDistance}${this.lnavLVarSuffix}`, SimVarValueType.NM, value); break;
        case 'destinationDistance': SimVar.SetSimVarValue(`${LNavDataVars.DestinationDistance}${this.lnavLVarSuffix}`, SimVarValueType.NM, value); break;
        case 'nominalLegIndex': SimVar.SetSimVarValue(`${UnsLNavDataVars.NominalLegIndex}${this.lnavLVarSuffix}`, SimVarValueType.Number, value); break;
        case 'destinationDistanceDirect': SimVar.SetSimVarValue(`${UnsLNavDataVars.DestinationDistanceDirect}${this.lnavLVarSuffix}`, SimVarValueType.NM, value); break;
        case 'distanceToFaf': SimVar.SetSimVarValue(`${UnsLNavDataVars.FafDistance}${this.lnavLVarSuffix}`, SimVarValueType.NM, value); break;
      }
    }, true);
  }

  /**
   * Update loop for WT21NavDataComputer
   */
  public update(): void {
    this.computeTrackingVars(MagVar.get(this.planePos));
  }

  /**
   * Computes the nav tracking data, such as XTK, DTK, and distance to turn.
   * @param magVar The computed current location magvar.
   */
  private computeTrackingVars(magVar: number): void {
    let xtk = 0;
    let dtkTrue = 0;
    let dtkMag = 0;
    let distance = 0;
    let waypointBearingTrue = 0;
    let waypointBearingMag = 0;
    let totalDistance = 0;
    let nominalLegIndex = -1;

    const plan = this.flightPlanner.hasFlightPlan(UnsFlightPlans.Active) && this.flightPlanner.getFlightPlan(UnsFlightPlans.Active);

    const trackedLegIndex = this.lnavLegIndex.get();
    const nextLegIndex = trackedLegIndex + 1;

    const currentLeg = plan && trackedLegIndex >= 0 && trackedLegIndex < plan.length
      ? plan.tryGetLeg(trackedLegIndex)
      : undefined;
    const nextLeg = plan && nextLegIndex >= 0 && nextLegIndex < plan.length
      ? plan.tryGetLeg(nextLegIndex)
      : undefined;

    if (currentLeg !== null && currentLeg !== undefined && trackedLegIndex > 0) {
      nominalLegIndex = trackedLegIndex;
    }

    const isTracking = this.lnavIsTracking.get();

    if (isTracking) {
      const transitionMode = this.lnavTransitionMode.get();

      let nominalLeg;
      let circle;
      if (transitionMode === LNavTransitionMode.Egress) {
        nominalLeg = nextLeg !== undefined && nextLeg !== null ? nextLeg : currentLeg;
        nominalLegIndex = nextLeg !== undefined && nextLeg !== null ? nextLegIndex : nominalLegIndex;
        if (nextLeg?.calculated?.flightPath.length) {
          circle = this.getNominalPathCircle(nextLeg, 0, LNavTransitionMode.Ingress, this.geoCircleCache[0]);
        }
      } else {
        nominalLeg = currentLeg;
        nominalLegIndex = trackedLegIndex;
        if (currentLeg?.calculated?.flightPath.length) {
          circle = this.getNominalPathCircle(currentLeg, this.lnavVectorIndex.get(), transitionMode, this.geoCircleCache[0]);
        }
      }

      if (nominalLeg?.calculated) {
        distance = this.getDistanceToTurn(nominalLeg, this.planePos);
        totalDistance = this.getTotalDistance(
          nominalLegIndex,
          distance + UnitType.METER.convertTo(nominalLeg.calculated.egress.reduce((cum, vector) => cum + vector.distance, 0), UnitType.NMILE)
        );

        if (nominalLeg.calculated.endLat !== undefined && nominalLeg.calculated.endLon) {
          waypointBearingTrue = this.planePos.bearingTo(nominalLeg.calculated.endLat, nominalLeg.calculated.endLon);
          waypointBearingMag = MagVar.trueToMagnetic(waypointBearingTrue, magVar);
        }
      }

      if (circle !== undefined) {
        xtk = UnitType.GA_RADIAN.convertTo(circle.distance(this.planePos), UnitType.NMILE);
        dtkTrue = circle.bearingAt(this.planePos, Math.PI);
        dtkMag = MagVar.trueToMagnetic(dtkTrue, magVar);
      }
    }

    this.updateDiscontinuityMessages(currentLeg, nextLeg, isTracking, distance);

    this.lnavData.set('nominalLegIndex', nominalLegIndex);
    this.lnavData.set('dtkTrue', dtkTrue);
    this.lnavData.set('dtkMag', dtkMag);
    this.lnavData.set('xtk', xtk);
    this.lnavData.set('waypointBearingTrue', waypointBearingTrue);
    this.lnavData.set('waypointBearingMag', waypointBearingMag);
    this.lnavData.set('waypointDistance', distance);
    this.lnavData.set('destinationDistance', totalDistance);
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  private updateDiscontinuityMessages(currentLeg: LegDefinition | undefined | null, nextLeg: LegDefinition | undefined | null, isTracking: boolean, distance: number): void {
    const isOnDiscoLeg = currentLeg?.leg.type === LegType.Discontinuity;
    const isOnVectorLeg = currentLeg?.leg.type === LegType.VM || currentLeg?.leg.type === LegType.FM;
    const isNextLegDiscoLeg = nextLeg?.leg.type === LegType.Discontinuity;
    const isOnGround = Simplane.getIsGrounded();

    let isWithin2MinutesOfDiscoLeg = false;

    if (isTracking && isNextLegDiscoLeg && !isOnVectorLeg) {
      const distanceToEndOfLeg = Math.round(distance * 1000) / 1000;
      const ttg = Math.round((distanceToEndOfLeg / this.groundSpeed) * 3600);
      const ttgToDiscoSeconds = isFinite(ttg) ? ttg : Number.MAX_SAFE_INTEGER;

      if (ttgToDiscoSeconds < 120) {
        isWithin2MinutesOfDiscoLeg = true;
      }
    }

    if (isNextLegDiscoLeg) {
      this.fms.messages.post(UnsMessageID.NEXT_LEG_UNDEFINED);
    } else {
      this.fms.messages.clear(UnsMessageID.NEXT_LEG_UNDEFINED);
    }

    this.isInDiscontinuity.set(!isOnGround && isOnDiscoLeg && this.isGpsActiveSource());
    this.is2MinutesFromDiscontinuity.set(!isOnGround && (isWithin2MinutesOfDiscoLeg || isOnDiscoLeg));
  }


  // eslint-disable-next-line jsdoc/require-jsdoc
  private isGpsActiveSource(): boolean {
    return this.cdiSource?.type === NavSourceType.Gps;
  }

  /**
   * Gets the geo circle describing the nominal path tracked by LNAV.
   * @param leg The flight plan leg currently tracked by LNAV.
   * @param vectorIndex The index of the vector currently tracked by LNAV.
   * @param transitionMode The current LNAV transition mode.
   * @param out The geo circle to which to write the result.
   * @returns The geo circle describing the initial path of a flight plan leg, or undefined if one could not be
   * determined.
   */
  private getNominalPathCircle(leg: LegDefinition, vectorIndex: number, transitionMode: LNavTransitionMode, out: GeoCircle): GeoCircle | undefined {
    if (!leg.calculated) {
      return undefined;
    }

    const legCalc = leg.calculated;

    switch (leg.leg.type) {
      case LegType.DF: {
        const vector = legCalc.flightPath[legCalc.flightPath.length - 1];

        if (!vector) {
          return undefined;
        }

        if (FlightPathUtils.isVectorGreatCircle(vector)) {
          return FlightPathUtils.setGeoCircleFromVector(vector, out);
        } else {
          const turn = FlightPathUtils.setGeoCircleFromVector(vector, out);
          const turnEnd = this.geoPointCache[0].set(vector.endLat, vector.endLon);
          const bearingAtEnd = turn.bearingAt(turnEnd);
          return isNaN(bearingAtEnd) ? undefined : out.setAsGreatCircle(turnEnd, bearingAtEnd);
        }
      }
      case LegType.HM:
      case LegType.HF:
      case LegType.HA: {
        const vectors = transitionMode === LNavTransitionMode.None
          ? LNavUtils.getVectorsForTransitionMode(legCalc, transitionMode, this.lnavIsSuspended.get())
          : legCalc.flightPath;
        const searchStartIndex = transitionMode === LNavTransitionMode.None || transitionMode === LNavTransitionMode.Unsuspend
          ? vectorIndex
          : transitionMode === LNavTransitionMode.Ingress
            ? 0
            : 3;

        let vector;
        for (let i = searchStartIndex; i < vectors.length; i++) {
          const holdVector = vectors[i];
          if (BitFlags.isAny(holdVector.flags, FlightPathVectorFlags.HoldOutboundLeg | FlightPathVectorFlags.HoldInboundLeg)) {
            vector = holdVector;
            break;
          }
        }

        return vector ? FlightPathUtils.setGeoCircleFromVector(vector, out) : undefined;
      }
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

        return vector ? FlightPathUtils.setGeoCircleFromVector(vector, out) : undefined;
      }
    }
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
   * Gets the total distance from the plane position to the destination leg.
   * @param activeLegIndex The global leg index of the active flight plan leg.
   * @param activeLegDistance The distance from the present position to the end of the active leg, in nautical miles.
   * @returns The distance, in nautical miles.
   */
  private getTotalDistance(activeLegIndex: number, activeLegDistance: number): number {
    const plan = this.flightPlanner.getActiveFlightPlan();
    const activeLegCumulativeDistance = plan.tryGetLeg(activeLegIndex)?.calculated?.cumulativeDistanceWithTransitions ?? 0;

    let lastLegIndex = plan.length - 1;
    for (const leg of plan.legs(true)) {
      if (!BitFlags.isAll(leg.flags, LegDefinitionFlags.MissedApproach)) {
        break;
      }
      lastLegIndex--;
    }

    const destinationLegCumulativeDistance = plan.tryGetLeg(lastLegIndex)?.calculated?.cumulativeDistanceWithTransitions ?? 0;

    return UnitType.METER.convertTo(destinationLegCumulativeDistance - activeLegCumulativeDistance, UnitType.NMILE) + activeLegDistance;
  }

  /**
   * Gets the active distance from the plane position to the next leg turn.
   * @param leg The leg to get the distance for.
   * @param pos The current plane position.
   * @returns The distance, in nautical miles.
   */
  private getDistanceToTurn(leg: LegDefinition, pos: GeoPointInterface): number {
    if (leg.calculated !== undefined) {
      const firstEgressVector = leg.calculated.egress[0];
      if (firstEgressVector) {
        return UnitType.GA_RADIAN.convertTo(pos.distance(firstEgressVector.startLat, firstEgressVector.startLon), UnitType.NMILE);
      } else {
        return this.getActiveDistance(leg, pos);
      }
    }

    return 0;
  }

  /**
   * Handles resetting whether the missed approach is active on a tracked leg change.
   * @param trackedLegIndex The currently tracked leg index.
   */
  private handleActiveLegIndexChanged(trackedLegIndex: number): void {
    const plan = this.flightPlanner.hasFlightPlan(UnsFlightPlans.Active) && this.flightPlanner.getFlightPlan(UnsFlightPlans.Active);

    const currentLeg = plan && trackedLegIndex >= 0 && trackedLegIndex < plan.length
      ? plan.tryGetLeg(trackedLegIndex)
      : undefined;

    if (!currentLeg || !BitFlags.isAny(currentLeg.flags, LegDefinitionFlags.MissedApproach)) {
      this.bus.getPublisher<ControlEvents>().pub('activate_missed_approach', false, true);
    }
  }
}

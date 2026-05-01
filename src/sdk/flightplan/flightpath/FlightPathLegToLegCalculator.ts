import { GeoCircle } from '../../geo/GeoCircle';
import { LatLonInterface } from '../../geo/GeoInterfaces';
import { GeoMath } from '../../geo/GeoMath';
import { GeoPoint } from '../../geo/GeoPoint';
import { BitFlags, MathUtils, ReadonlyFloat64Array, UnitType, Vec3Math } from '../../math';
import { LegType } from '../../navigation/Facilities';
import { ArrayUtils } from '../../utils/datastructures/ArrayUtils';
import { LegCalculations, LegDefinition } from '../FlightPlanning';
import { FlightPathCircleToCircleTurn } from './FlightPathCircleToCircleTurn';
import { FlightPathPlaneState } from './FlightPathState';
import { FlightPathUtils } from './FlightPathUtils';
import { FlightPathVector, FlightPathVectorFlags, VectorTurnDirection } from './FlightPathVector';
import { CircleVectorBuilder } from './vectorbuilders/CircleVectorBuilder';
import { DirectToPointVectorBuilder } from './vectorbuilders/DirectToPointVectorBuilder';
import { InterceptCircleToPointVectorBuilder } from './vectorbuilders/InterceptCircleToPointVectorBuilder';
import { ProcedureTurnVectorBuilder } from './vectorbuilders/ProcedureTurnVectorBuilder';

/**
 * A calculator of lateral flight paths for transitions between adjacent flight plan legs.
 */
export class FlightPathLegToLegCalculator {
  private static readonly ANGULAR_TOLERANCE_METERS = UnitType.GA_RADIAN.convertTo(GeoMath.ANGULAR_TOLERANCE, UnitType.METER);
  private static readonly HALF_EARTH_CIRCUMFERENCE = UnitType.GA_RADIAN.convertTo(Math.PI, UnitType.METER);

  private static readonly MIN_TURN_RADIUS = 10; // meters

  private static readonly FLYOVER_INTERCEPT_ANGLE = 45; // degrees

  private readonly circleVectorBuilder = new CircleVectorBuilder();
  private readonly procTurnVectorBuilder = new ProcedureTurnVectorBuilder();
  private readonly interceptAtPointVectorBuilder = new InterceptCircleToPointVectorBuilder();
  private readonly directToPointVectorBuilder = new DirectToPointVectorBuilder();

  private readonly circleToCircleTurn = new FlightPathCircleToCircleTurn();

  /**
   * Calculates paths for transitions between adjacent flight plan legs.
   * @param legs An array containing the legs for which to calculate transitions.
   * @param startIndex The index of the first leg for which to calculate transitions.
   * @param count The total number of legs for which to calculate transitions.
   * @param state The airplane state to use for calculations.
   */
  public calculate(
    legs: LegDefinition[],
    startIndex: number,
    count: number,
    state: FlightPathPlaneState
  ): void {
    const endIndex = startIndex + count;
    let currentIndex = startIndex;
    while (currentIndex < endIndex) {
      const fromLeg = legs[currentIndex] as LegDefinition | undefined;
      const toLeg = legs[currentIndex + 1] as LegDefinition | undefined;
      const fromLegCalc = fromLeg?.calculated;
      const toLegCalc = toLeg?.calculated;
      if (
        fromLegCalc
        && toLegCalc
        && !fromLegCalc.endsInDiscontinuity
      ) {
        const fromLegLastBaseVector = fromLegCalc.flightPath[fromLegCalc.flightPath.length - 1] as FlightPathVector | undefined;
        const toLegFirstBaseVector = toLegCalc.flightPath[0] as FlightPathVector | undefined;
        if (
          fromLegLastBaseVector && toLegFirstBaseVector
          && !BitFlags.isAny(fromLegLastBaseVector.flags, FlightPathVectorFlags.Discontinuity)
          && !BitFlags.isAny(toLegFirstBaseVector.flags, FlightPathVectorFlags.Discontinuity)
          && FlightPathLegToLegCalculator.canCalculateTransition(fromLegCalc.egressBase)
          && FlightPathLegToLegCalculator.canCalculateTransition(toLegCalc.ingressBase)
        ) {
          const fromLegUseIngress = fromLegCalc.ingressBase.length > 0 && fromLegCalc.ingressJoinIndex >= fromLegCalc.flightPath.length;

          const fromVector = fromLegUseIngress
            ? fromLegCalc.ingressBase[fromLegCalc.ingressBase.length - 1]
            : fromLegLastBaseVector;
          const toVector = toLegFirstBaseVector;

          // There are three types of leg-to-leg junctions we must handle:
          // 1) Junction between two great-circle vectors (tracks).
          // 2) Junction between a great-circle vector (track) and a small-circle vector (turn).
          // 3) Junction between two small-circle vectors (turns).

          const isFromVectorGreatCircle = FlightPathUtils.isVectorGreatCircle(fromVector);
          const isToVectorGreatCircle = FlightPathUtils.isVectorGreatCircle(toVector);

          if (isFromVectorGreatCircle && isToVectorGreatCircle) {
            currentIndex += this.calculateTrackTrackTransition(
              legs, currentIndex, currentIndex + 1, endIndex,
              state,
              fromLegUseIngress,
              fromVector, toVector,
              !fromLegUseIngress
            );
            continue;
          } else {
            currentIndex += this.calculateTurnXTransition(
              legs, currentIndex, currentIndex + 1, endIndex,
              state,
              fromLegUseIngress,
              fromVector, toVector
            );
            continue;
          }
        }
      }

      // If we've reached here, then it means that there should be no leg-to-leg transition between the FROM and TO legs.

      if (fromLegCalc && fromLegCalc.egress.length > 0 && FlightPathLegToLegCalculator.canCalculateTransition(fromLegCalc.egressBase)) {
        fromLegCalc.egressBase.length = 0;
        fromLegCalc.egressBaseJoinIndex = -1;
        fromLegCalc.egress.length = 0;
        fromLegCalc.egressJoinIndex = -1;
      }
      if (toLegCalc && toLegCalc.ingress.length > 0 && FlightPathLegToLegCalculator.canCalculateTransition(toLegCalc.ingressBase)) {
        toLegCalc.ingressBase.length = 0;
        toLegCalc.ingressBaseJoinIndex = -1;
        toLegCalc.ingress.length = 0;
        toLegCalc.ingressJoinIndex = -1;
      }

      currentIndex++;
    }
  }

  /**
   * Sets an empty transition between two adjacent flight plan legs. This will erase all egress transition vectors from
   * the FROM leg and all ingress transition vectors from the TO leg.
   * @param fromLegCalc The flight path calculations for the transition's FROM leg.
   * @param toLegCalc The flight path calculations for the transition's TO leg.
   */
  private setEmptyTransition(fromLegCalc: LegCalculations, toLegCalc: LegCalculations): void {
    fromLegCalc.egressBase.length = 0;
    fromLegCalc.egressBaseJoinIndex = -1;
    fromLegCalc.egress.length = 0;
    fromLegCalc.egressJoinIndex = -1;

    toLegCalc.ingressBase.length = 0;
    toLegCalc.ingressBaseJoinIndex = -1;
    toLegCalc.ingress.length = 0;
    toLegCalc.ingressJoinIndex = -1;
  }

  private readonly setAnticipatedTurnCache = {
    geoCircle: ArrayUtils.create(1, () => new GeoCircle(Vec3Math.create(), 0))
  };

  /**
   * Sets the transition between two adjacent flight plan legs to an anticipated turn.
   * @param fromLegCalc The flight path calculations for the transition's FROM leg.
   * @param toLegCalc The flight path calculations for the transition's TO leg.
   * @param fromLegUseIngress Whether the transition joins the FROM leg's ingress path instead of its base flight path.
   * @param turnRadius The radius of the turn, in great-arc radians.
   * @param turnDirection The direction of the turn.
   * @param turnCenter The center of the turn.
   * @param turnStart The start point of the turn.
   * @param turnMiddle The midpoint of the turn.
   * @param turnEnd The end point of the turn
   * @param setIngressEgressArrayLengths Whether to remove extra vectors from the ingress and egress vector arrays used
   * for the transition after the anticipated turn vectors have been added.
   */
  private setAnticipatedTurn(
    fromLegCalc: LegCalculations,
    toLegCalc: LegCalculations,
    fromLegUseIngress: boolean,
    turnRadius: number,
    turnDirection: VectorTurnDirection,
    turnCenter: ReadonlyFloat64Array | LatLonInterface,
    turnStart: ReadonlyFloat64Array | LatLonInterface,
    turnMiddle: ReadonlyFloat64Array | LatLonInterface,
    turnEnd: ReadonlyFloat64Array | LatLonInterface,
    setIngressEgressArrayLengths: boolean
  ): void {
    const turnCircle = FlightPathUtils.getTurnCircle(
      turnCenter,
      turnRadius, turnDirection,
      this.setAnticipatedTurnCache.geoCircle[0]
    );
    const flags = FlightPathVectorFlags.LegToLegTurn | FlightPathVectorFlags.AnticipatedTurn;

    this.setEgressVector(fromLegCalc, fromLegUseIngress, turnCircle, turnStart, turnMiddle, flags, setIngressEgressArrayLengths);
    this.setIngressVector(toLegCalc, turnCircle, turnMiddle, turnEnd, flags, setIngressEgressArrayLengths);
  }

  /**
   * Sets the egress transition of a flight plan leg to a single vector.
   * @param legCalc The flight path calculations for the transition's leg.
   * @param joinIngress Whether the egress transition joins the leg's ingress transition rather than the leg's base
   * flight path.
   * @param path A GeoCircle that defines the path of the vector.
   * @param start The start point of the vector.
   * @param end The end point of the vector.
   * @param flags The flags to set on the vector.
   * @param setEgressArrayLength Whether to remove extra vectors from the egress vector array after the vector has been
   * added.
   */
  private setEgressVector(
    legCalc: LegCalculations,
    joinIngress: boolean,
    path: GeoCircle,
    start: ReadonlyFloat64Array | LatLonInterface,
    end: ReadonlyFloat64Array | LatLonInterface,
    flags: number,
    setEgressArrayLength: boolean
  ): void {
    const vector = legCalc.egress[0] ??= FlightPathUtils.createEmptyVector();

    if (setEgressArrayLength) {
      legCalc.egress.length = 1;
    }
    legCalc.egressJoinIndex = joinIngress ? -1 : legCalc.flightPath.length - 1;

    const joinedVector = joinIngress ? legCalc.ingressBase[legCalc.ingress.length - 1] : legCalc.flightPath[legCalc.egressJoinIndex];

    flags |= joinedVector.flags & FlightPathVectorFlags.Fallback;

    FlightPathUtils.setVectorFromCircle(
      vector,
      path,
      start, end,
      flags,
      joinedVector.heading,
      joinedVector.isHeadingTrue
    );
  }

  /**
   * Sets the ingress transition of a flight plan leg to a single vector.
   * @param legCalc The flight path calculations for the transition's leg.
   * @param path A GeoCircle that defines the path of the vector.
   * @param start The start point of the vector.
   * @param end The end point of the vector.
   * @param flags The flags to set on the vector.
   * @param setIngressArrayLength Whether to remove extra vectors from the ingress vector array after the vector has
   * been added.
   */
  private setIngressVector(
    legCalc: LegCalculations,
    path: GeoCircle,
    start: ReadonlyFloat64Array | LatLonInterface,
    end: ReadonlyFloat64Array | LatLonInterface,
    flags: number,
    setIngressArrayLength: boolean
  ): void {
    const ingress = legCalc.ingress[0] ??= FlightPathUtils.createEmptyVector();

    if (setIngressArrayLength) {
      legCalc.ingress.length = 1;
    }
    legCalc.ingressJoinIndex = 0;

    const joinedVector = legCalc.flightPath[legCalc.ingressJoinIndex];

    flags |= joinedVector.flags & FlightPathVectorFlags.Fallback;

    FlightPathUtils.setVectorFromCircle(
      ingress,
      path,
      start, end,
      flags,
      joinedVector.heading,
      joinedVector.isHeadingTrue
    );
  }

  private readonly resolveIngressCache = {
    geoPoint: ArrayUtils.create(3, () => new GeoPoint(0, 0)),
    geoCircle: ArrayUtils.create(1, () => new GeoCircle(Vec3Math.create(), 0))
  };

  /**
   * Resolves vectors for an ingress transition that is joined to an anticipated turn.
   * @param legCalc The flight path calculations for the ingress transition's leg.
   */
  private resolveIngressJoinedToAnticipatedTurn(legCalc: LegCalculations): void {
    const joinIndex = legCalc.ingressBase.length - 1;
    const joinVector = legCalc.ingressBase[joinIndex];
    const firstEgressVector = legCalc.egress[0];

    // Copy all base ingress vectors except the last one into the ingress array.
    for (let i = 0; i < joinIndex; i++) {
      Object.assign(legCalc.ingress[i] ??= FlightPathUtils.createEmptyVector(), legCalc.ingressBase[i]);
    }

    const egressStart = this.resolveIngressCache.geoPoint[0].set(firstEgressVector.startLat, firstEgressVector.startLon);
    const joinVectorStart = this.resolveIngressCache.geoPoint[1].set(joinVector.startLat, joinVector.startLon);
    const joinVectorEnd = this.resolveIngressCache.geoPoint[2].set(joinVector.endLat, joinVector.endLon);

    const joinVectorCircle = FlightPathUtils.setGeoCircleFromVector(joinVector, this.resolveIngressCache.geoCircle[0]);

    const egressStartAlongVectorDistance = FlightPathUtils.getAlongArcNormalizedDistance(
      joinVectorCircle, joinVectorStart, joinVectorEnd, egressStart
    );
    const normalizedTolerance = GeoMath.ANGULAR_TOLERANCE / UnitType.METER.convertTo(joinVector.distance, UnitType.GA_RADIAN);

    if (egressStartAlongVectorDistance > normalizedTolerance) {
      // Egress joins the ingress path after the start of the joined vector. This means we have to copy all or part of
      // the joined vector into the ingress array.

      const copiedJoinVector = Object.assign(legCalc.ingress[joinIndex] ??= FlightPathUtils.createEmptyVector(), joinVector);

      if (egressStartAlongVectorDistance < 1 - normalizedTolerance) {
        // Egress joins the ingress path after the start and before the end of the joined vector. Therefore we must
        // remove part of the copied joined vector in the ingress array.

        joinVectorCircle.closest(egressStart, egressStart);

        copiedJoinVector.endLat = egressStart.lat;
        copiedJoinVector.endLon = egressStart.lon;
        copiedJoinVector.distance *= egressStartAlongVectorDistance;
      }

      legCalc.ingress.length = joinIndex + 1;
    } else {
      legCalc.ingress.length = joinIndex;
    }
  }

  private readonly trackTrackCache = {
    vec3: ArrayUtils.create(3, () => Vec3Math.create()),
    geoPoint: ArrayUtils.create(4, () => new GeoPoint(0, 0)),
    geoCircle: ArrayUtils.create(2, () => new GeoCircle(Vec3Math.create(), 0))
  };

  /**
   * Calculates a leg-to-leg transition between two great-circle ("track") vectors. In calculating the specified
   * transition, this method may also calculate a sequence of consecutive transitions following the specified
   * transition.
   * @param legs An array containing the legs for which to calculate transitions.
   * @param fromIndex The index of the transition's FROM leg.
   * @param toIndex The index of the transition's TO leg.
   * @param endIndex The index of the flight plan leg at which to stop calculating transitions. The last transition to
   * be calculated will be between the this leg and the previous leg.
   * @param state The airplane state to use for calculations.
   * @param fromLegUseIngress Whether the transition joins the FROM leg's ingress path instead of its base flight path.
   * @param fromVector The last vector of the FROM leg's flight path that the transition joins (the FROM vector).
   * @param toVector The first vector of the TO leg's flight path that the transition joins (the TO vector).
   * @param isRestrictedByPrevTransition Whether the FROM leg's egress transition is restricted by the leg's ingress
   * transition.
   * @param previousTanTheta The tangent of the theta angle of the previous transition's anticipated turn. Theta is
   * defined as the (acute) angle between either the FROM vector or the TO vector's path and the great circle passing
   * through the point where the FROM and TO vectors meet and the center of the anticipated turn. If there is no
   * previous transition, the previous transition is not an anticipated turn, or the previous transition's FROM and
   * TO vectors are not both great-circle paths, then this value should be left undefined.
   * @param previousDesiredD The desired along-track distance of the previous transition's anticipated turn, in
   * great-arc radians. If there is no previous transition, the previous transition is not an anticipated turn, or the
   * previous transition's FROM and TO vectors are not both great-circle paths, then this value should be left
   * undefined.
   * @returns The number of consecutive leg-to-leg transitions calculated by this method.
   */
  private calculateTrackTrackTransition(
    legs: LegDefinition[],
    fromIndex: number,
    toIndex: number,
    endIndex: number,
    state: FlightPathPlaneState,
    fromLegUseIngress: boolean,
    fromVector: FlightPathVector,
    toVector: FlightPathVector,
    isRestrictedByPrevTransition: boolean,
    previousTanTheta?: number,
    previousDesiredD?: number
  ): number {
    const fromLegCalc = legs[fromIndex].calculated!;
    const toLegCalc = legs[toIndex].calculated!;

    if (
      fromVector.distance <= FlightPathLegToLegCalculator.ANGULAR_TOLERANCE_METERS
      || toVector.distance <= FlightPathLegToLegCalculator.ANGULAR_TOLERANCE_METERS
    ) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return 1;
    }

    const fromVectorEnd = this.trackTrackCache.geoPoint[0].set(fromVector.endLat, fromVector.endLon);
    const toVectorStart = this.trackTrackCache.geoPoint[1].set(toVector.startLat, toVector.startLon);

    // If the TO vector doesn't start where the FROM vector ends, then there can be no transition. We use a rather
    // large tolerance here (~60 meters) to accommodate imprecise nav data and floating point errors during base flight
    // path calculation.
    if (!fromVectorEnd.equals(toVectorStart, 1e-5)) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return 1;
    }

    const fromVectorPath = FlightPathUtils.setGeoCircleFromVector(fromVector, this.trackTrackCache.geoCircle[0]);
    const toVectorPath = FlightPathUtils.setGeoCircleFromVector(toVector, this.trackTrackCache.geoCircle[1]);
    const trackAngleDiff = Vec3Math.unitAngle(fromVectorPath.center, toVectorPath.center) * Avionics.Utils.RAD2DEG;

    if (trackAngleDiff < 1) {
      // The FROM and TO vectors are parallel or nearly so. Therefore there is no need for a transition between the
      // two.

      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return 1;
    } else if (trackAngleDiff > 175) {
      // The FROM and TO vectors are anti-parallel or nearly so. Therefore we will use a course reversal to connect the
      // two.

      return this.calculateTrackTrackCourseReversal(
        legs, fromIndex, toIndex, endIndex,
        state,
        fromVector, toVector
      );
    }

    if (legs[fromIndex].leg.flyOver) {
      // The FROM leg ends at a flyover fix. Therefore we must calculate a flyover transition.

      return this.calculateFlyoverTransition(
        legs, fromIndex, toIndex, endIndex,
        state,
        fromVector
      );
    }

    let anticipationLimit = UnitType.METER.convertTo(state.getTurnAnticipationLimit(fromIndex), UnitType.GA_RADIAN);

    // Calculate the maximum distance along the FROM vector that we are allowed to anticipate a turn after taking into
    // account where the FROM leg's ingress transition ends. If necessary, the anticipation limit will be clamped to
    // be no greater than this value.
    if (
      isRestrictedByPrevTransition
      // The ingress transition can only restrict the anticipated distance if the anticipated turn joins the FROM leg's
      // base flight path.
      && !fromLegUseIngress
    ) {
      // If previousTanTheta and previousDesiredD are defined, then the distance restriction must be optimized by
      // calculateTrackTrackAnticipatedTurn(). Therefore we will only calculate the restriction ourselves if these
      // values are not both defined.

      if (previousTanTheta === undefined || previousDesiredD === undefined) {
        // The ingress can only restrict the anticipated distance if it exists and it joins the same base flight path
        // vector as the anticipated turn (which is always the last base flight path vector).
        if (fromLegCalc.ingress.length > 0 && fromLegCalc.ingressJoinIndex === fromLegCalc.flightPath.length - 1) {
          const lastIngressVector = fromLegCalc.ingress[fromLegCalc.ingress.length - 1];
          const ingressJoinDistance = fromVectorPath.distanceAlong(
            GeoPoint.sphericalToCartesian(lastIngressVector.endLat, lastIngressVector.endLon, this.trackTrackCache.vec3[0]),
            fromVectorEnd,
            Math.PI
          );

          const prevTransitionRestrictedDistance = ingressJoinDistance > Math.PI + GeoMath.ANGULAR_TOLERANCE ? 0 : ingressJoinDistance;
          anticipationLimit = Math.min(anticipationLimit, prevTransitionRestrictedDistance);
        }
      }
    }

    // Check whether there is no room for an anticipated turn. If so, then we will calculate a flyover transition
    // instead.
    if (anticipationLimit <= GeoMath.ANGULAR_TOLERANCE) {
      return this.calculateFlyoverTransition(
        legs, fromIndex, toIndex, endIndex,
        state,
        fromVector
      );
    }

    return this.calculateTrackTrackAnticipatedTurn(
      legs, fromIndex, toIndex, endIndex,
      state,
      fromLegUseIngress,
      fromVector, toVector,
      anticipationLimit,
      previousTanTheta, previousDesiredD
    );
  }

  /**
   * Calculates a leg-to-leg course reversal transition between two great-circle ("track") vectors. In calculating the
   * specified transition, this method may also calculate a sequence of consecutive transitions following the specified
   * transition.
   * @param legs An array containing the legs for which to calculate transitions.
   * @param fromIndex The index of the transition's FROM leg.
   * @param toIndex The index of the transition's TO leg.
   * @param endIndex The index of the flight plan leg at which to stop calculating transitions. The last transition to
   * be calculated will be between the this leg and the previous leg.
   * @param state The airplane state to use for calculations.
   * @param fromVector The last vector of the FROM leg's flight path that the transition joins (the FROM vector).
   * @param toVector The first vector of the TO leg's flight path that the transition joins (the TO vector).
   * @returns The number of consecutive leg-to-leg transitions calculated by this method.
   */
  private calculateTrackTrackCourseReversal(
    legs: LegDefinition[],
    fromIndex: number,
    toIndex: number,
    endIndex: number,
    state: FlightPathPlaneState,
    fromVector: FlightPathVector,
    toVector: FlightPathVector
  ): number {
    let calculatedCount = 1;

    const fromLegCalc = legs[fromIndex].calculated!;
    const toLegCalc = legs[toIndex].calculated!;

    const desiredTurnRadius = state.getDesiredCourseReversalTurnRadius(fromIndex);

    if (desiredTurnRadius < FlightPathLegToLegCalculator.MIN_TURN_RADIUS) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return calculatedCount;
    }

    fromLegCalc.egress.length = 0;
    fromLegCalc.egressJoinIndex = -1;

    let toVectorStartVec: Float64Array | undefined;
    let toVectorPath: GeoCircle | undefined;

    // Allow the course reversal to "cut" into the TO vector. In other words, the course reversal is allowed to
    // intercept the TO leg in the middle of the leg.

    let courseReversalEndDistance = UnitType.METER.convertTo(toVector.distance, UnitType.GA_RADIAN);

    // If the TO leg only has one base flight path vector, then we need to make sure the course reversal doesn't cut
    // into the leg past the point where the egress joins the vector.
    if (toLegCalc.flightPath.length === 1) {
      let needCheckEgressJoin = true;

      // We need to check if the TO leg's egress transition is going to be recalculated with the current round of
      // calculations. Depending on if and how the transition is going to be recalculated, we may need not need to
      // check the egress vectors or we may need to pre-compute the egress transition.

      if (toIndex < endIndex) {
        const nextLegCalc = legs[toIndex + 1]?.calculated;
        if (nextLegCalc) {
          if (
            FlightPathLegToLegCalculator.canCalculateTransition(toLegCalc.egressBase)
            && FlightPathLegToLegCalculator.canCalculateTransition(nextLegCalc.ingressBase)
          ) {
            if (legs[toIndex].leg.flyOver) {
              // If the TO leg ends in a flyover fix, then the recalculation will be guaranteed to erase any egress
              // vectors on the TO leg, so there is no need to check the egress vectors.
              needCheckEgressJoin = false;
            } else if (nextLegCalc.flightPath.length > 0) {
              const nextVector = nextLegCalc.flightPath[0];
              if (FlightPathUtils.isVectorGreatCircle(nextVector)) {
                // If the TO vector of the next leg-to-leg transition is a great circle, then we are
                // allowed to pre-compute the next transition.

                calculatedCount += this.calculateTrackTrackTransition(
                  legs, toIndex, toIndex + 1, endIndex,
                  state,
                  false,
                  toVector, nextVector,
                  false
                );

                // We still need to check the egress here since we don't know where the egress joins until after it is
                // calculated.
              } else {
                // If the TO vector of the next leg-to-leg transition to share a vector with the current leg-toleg
                // transition is not a great circle, then we know that the distance from the start of the vector to
                // where the egress joins is guaranteed to be at least half the distance of the vector.

                courseReversalEndDistance = UnitType.METER.convertTo(toVector.distance / 2, UnitType.GA_RADIAN);
                needCheckEgressJoin = false;
              }
            } else {
              // If the next leg after the TO leg has no base flight path vectors, then the recalculation will erase
              // any egress vectors on the TO leg, so there is no need to check the egress vectors.
              needCheckEgressJoin = false;
            }
          }
        } else {
          // If there is no leg that has a calculated flight path after the TO leg and the TO leg's egress is
          // recalculated, then it is guaranteed to be erased, in which case there is no need to check the egress
          // vectors.
          if (FlightPathLegToLegCalculator.canCalculateTransition(toLegCalc.egressBase)) {
            needCheckEgressJoin = false;
          }
        }
      }

      if (needCheckEgressJoin && toLegCalc.egress.length > 0 && toLegCalc.egressJoinIndex === 0) {
        toVectorStartVec = GeoPoint.sphericalToCartesian(toVector.startLat, toVector.startLon, this.trackTrackCache.vec3[1]);
        toVectorPath = FlightPathUtils.setGeoCircleFromVector(toVector, this.trackTrackCache.geoCircle[1]);

        const egressJoinDistance = toVectorPath.distanceAlong(
          toVectorStartVec,
          GeoPoint.sphericalToCartesian(toLegCalc.egress[0].startLat, toLegCalc.egress[0].startLon, this.trackTrackCache.vec3[2]),
          Math.PI
        );
        courseReversalEndDistance = egressJoinDistance > Math.PI + GeoMath.ANGULAR_TOLERANCE ? 0 : egressJoinDistance;
      }
    }

    const fromVectorEndVec = GeoPoint.sphericalToCartesian(fromVector.endLat, fromVector.endLon, this.trackTrackCache.vec3[0]);
    const fromVectorPath = FlightPathUtils.setGeoCircleFromVector(fromVector, this.trackTrackCache.geoCircle[0]);

    toVectorStartVec ??= GeoPoint.sphericalToCartesian(toVector.startLat, toVector.startLon, this.trackTrackCache.vec3[1]);
    toVectorPath ??= FlightPathUtils.setGeoCircleFromVector(toVector, this.trackTrackCache.geoCircle[1]);

    const courseReversalEndVec = toVectorPath.offsetDistanceAlong(toVectorStartVec, courseReversalEndDistance, this.trackTrackCache.vec3[2], Math.PI);

    const fromVectorCourse = fromVectorPath.bearingAt(fromVectorEndVec, Math.PI);
    const toVectorCourse = toVectorPath.bearingAt(fromVectorEndVec, Math.PI);

    const turnDirection = MathUtils.angularDistanceDeg(fromVectorCourse, toVectorCourse, 1) > 180 ? 'left' : 'right';

    const vectorCount = this.procTurnVectorBuilder.build(
      toLegCalc.ingress, 0,
      fromVectorEndVec, fromVectorPath,
      courseReversalEndVec, toVectorPath,
      fromVectorCourse + (turnDirection === 'left' ? -45 : 45),
      desiredTurnRadius, turnDirection,
      fromVectorCourse, toVectorCourse,
      FlightPathVectorFlags.LegToLegTurn | FlightPathVectorFlags.CourseReversal, true,
      toLegCalc.flightPath[0].heading, toLegCalc.flightPath[0].isHeadingTrue
    );

    toLegCalc.ingress.length = vectorCount;
    toLegCalc.ingressJoinIndex = 0;

    return calculatedCount;
  }

  /**
   * Calculates a leg-to-leg anticipated turn transition between two great-circle ("track") vectors. In calculating the
   * specified transition, this method may also calculate a sequence of consecutive transitions following the specified
   * transition.
   * @param legs An array containing the legs for which to calculate transitions.
   * @param fromIndex The index of the transition's FROM leg.
   * @param toIndex The index of the transition's TO leg.
   * @param endIndex The index of the flight plan leg at which to stop calculating transitions. The last transition to
   * be calculated will be between the this leg and the previous leg.
   * @param state The airplane state to use for calculations.
   * @param fromLegUseIngress Whether the transition joins the FROM leg's ingress path instead of its base flight path.
   * @param fromVector The last vector of the FROM leg's flight path that the transition joins (the FROM vector).
   * @param toVector The first vector of the TO leg's flight path that the transition joins (the TO vector).
   * @param anticipationLimit The maximum distance, in great-arc radians, from the end of the FROM
   * vector that the transition is allowed to anticipate.
   * @param previousTanTheta The tangent of the theta angle of the previous transition's anticipated turn. Theta is
   * defined as the (acute) angle between either the FROM vector or the TO vector's path and the great circle passing
   * through the point where the FROM and TO vectors meet and the center of the anticipated turn. If there is no
   * previous transition, the previous transition is not an anticipated turn, or the previous transition's FROM and
   * TO vectors are not both great-circle paths, then this value should be left undefined.
   *
   * If this value is defined and the current anticipated turn would infringe on the previous anticipated turn, then
   * the anticipated distance of the current turn will be adjusted to maximize the radius of the smaller of the two
   * turns assuming the current turn starts exactly where the previous turn ends.
   * @param previousDesiredD The desired along-track distance of the previous transition's anticipated turn, in
   * great-arc radians. If there is no previous transition, the previous transition is not an anticipated turn, or the
   * previous transition's FROM and TO vectors are not both great-circle paths, then this value should be left
   * undefined.
   * @returns The number of consecutive leg-to-leg transitions calculated by this method.
   */
  private calculateTrackTrackAnticipatedTurn(
    legs: LegDefinition[],
    fromIndex: number,
    toIndex: number,
    endIndex: number,
    state: FlightPathPlaneState,
    fromLegUseIngress: boolean,
    fromVector: FlightPathVector,
    toVector: FlightPathVector,
    anticipationLimit: number,
    previousTanTheta?: number,
    previousDesiredD?: number
  ): number {
    let calculatedCount = 1;

    const fromLegCalc = legs[fromIndex].calculated!;
    const toLegCalc = legs[toIndex].calculated!;

    const desiredTurnRadius = state.getDesiredTurnAnticipationTurnRadius(fromIndex);

    if (desiredTurnRadius < FlightPathLegToLegCalculator.MIN_TURN_RADIUS) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return calculatedCount;
    }

    const fromVectorEnd = this.trackTrackCache.geoPoint[0].set(fromVector.endLat, fromVector.endLon);

    // From this point on, to simplify calculations, we will assume that the FROM and TO paths intersect at the end
    // point of the FROM vector. (This may not actually be the case since the end point of the FROM vector and the
    // start point of the TO vector are allowed to be different within some tolerance. Accumulated floating point
    // errors can also lead to violations of this assumption.) Using this assumption, calculate the position of the
    // anticipated turn circle and the start, end, and midpoints of the turn.

    let fromVectorCourse = fromVectorEnd.bearingFrom(fromVector.startLat, fromVector.startLon);
    if (!isFinite(fromVectorCourse)) {
      const fromVectorPath = FlightPathUtils.setGeoCircleFromVector(fromVector, this.trackTrackCache.geoCircle[0]);
      fromVectorCourse = fromVectorPath.bearingAt(fromVectorEnd, Math.PI);
    }

    let toVectorCourse = fromVectorEnd.bearingTo(toVector.endLat, toVector.endLon);
    if (!isFinite(toVectorCourse)) {
      const toVectorPath = FlightPathUtils.setGeoCircleFromVector(toVector, this.trackTrackCache.geoCircle[0]);
      toVectorCourse = toVectorPath.bearingAt(fromVectorEnd, Math.PI);
    }

    const courseAngleDiff = MathUtils.angularDistanceDeg(fromVectorCourse, toVectorCourse, 0);

    if (courseAngleDiff < 1) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return calculatedCount;
    }

    const desiredTurnRadiusRad = UnitType.METER.convertTo(desiredTurnRadius, UnitType.GA_RADIAN);
    const theta = (180 - courseAngleDiff) / 2;
    const tanTheta = Math.tan(theta * Avionics.Utils.DEG2RAD);
    // D is defined as the distance along the FROM or TO vectors from the start or end of the anticipated turn to the
    // turn vertex (where the FROM and TO vectors meet). In other words, D is the along-track anticipated turn
    // distance.
    const desiredD = Math.asin(MathUtils.clamp(Math.tan(desiredTurnRadiusRad) / tanTheta, -1, 1));

    let restrictedD = anticipationLimit;
    if (previousTanTheta !== undefined && previousDesiredD !== undefined) {
      // D is restricted by a previous anticipated turn. The values of D_current and D_previous are restricted such
      // that their sum cannot exceed the total length of their shared vector (the current FROM vector). Therefore,
      // we set the maximum value of D_current such that at D_current(max), the radius of the current anticipated
      // turn equals the radius of the previous turn. This will maximize the radius of the smaller of the current
      // anticipated turn and the previous anticipated turn. We will also compare the calculated value of
      // D_current(max) to the total distance available assuming the previous anticipated turn uses its desired
      // radius, D_current(avail). If D_current(max) is less than D_current(avail), then we will increase
      // D_current(max) to be equal to D_current(avail).

      const tanThetaRatio = previousTanTheta / tanTheta;
      const totalD = UnitType.METER.convertTo(fromVector.distance, UnitType.GA_RADIAN);
      const cosTotalD = Math.cos(totalD);
      let prevTurnRestrictedD = Math.acos(
        MathUtils.clamp((tanThetaRatio * cosTotalD + 1) / Math.sqrt(tanThetaRatio * tanThetaRatio + 2 * tanThetaRatio * cosTotalD + 1), -1, 1)
      );
      if (prevTurnRestrictedD > totalD) {
        prevTurnRestrictedD = Math.PI - prevTurnRestrictedD;
      }
      restrictedD = Math.min(Math.max(prevTurnRestrictedD, totalD - previousDesiredD), restrictedD);
    }

    // If the TO leg only has one base flight path vector, then we need to scan forward in the leg sequence to compute
    // any restrictions on D imposed by later transitions.
    if (toLegCalc.flightPath.length === 1) {
      let nextTransitionRestrictedD: number | undefined;

      // We need to check if the TO leg's egress transition is going to be recalculated with the current round of
      // calculations. Depending on if and how the transition is going to be recalculated, we may need not need to
      // check the egress vectors or we may need to pre-compute the egress transition.
      if (toIndex < endIndex && FlightPathLegToLegCalculator.canCalculateTransition(toLegCalc.egressBase)) {
        const nextLegCalc = legs[toIndex + 1]?.calculated;
        if (nextLegCalc && FlightPathLegToLegCalculator.canCalculateTransition(nextLegCalc.ingressBase)) {
          if (legs[toIndex].leg.flyOver) {
            // If the TO leg ends in a flyover fix, then the recalculation will be guaranteed to erase any egress
            // vectors on the TO leg. Therefore, D is not restricted by the egress transition.
            nextTransitionRestrictedD = Infinity;
          } else if (nextLegCalc.flightPath.length > 0) {
            const nextVector = nextLegCalc.flightPath[0];
            if (FlightPathUtils.isVectorGreatCircle(nextVector)) {
              // If the TO vector of the next leg-to-leg transition is a great circle, then we are allowed to pre-compute
              // the next transition.
              calculatedCount += this.calculateTrackTrackTransition(
                legs, toIndex, toIndex + 1, endIndex,
                state,
                false,
                toVector, nextVector,
                true,
                tanTheta, desiredD
              );
            } else {
              // If the TO vector of the next leg-to-leg transition to share a vector with the current leg-to-leg
              // transition is not a great circle, then we know that the distance from the start of the vector to where
              // the egress joins is guaranteed to be at least half the distance of the vector.

              nextTransitionRestrictedD = UnitType.METER.convertTo(toVector.distance / 2, UnitType.GA_RADIAN);
            }
          } else {
            // If the next leg after the TO leg has no base flight path vectors, then the recalculation will erase
            // any egress vectors on the TO leg. Therefore, D is not restricted by the egress transition.
            nextTransitionRestrictedD = Infinity;
          }
        }
      }

      // If we haven't defined a restriction on D from the next transition yet, then check if the TO leg has a
      // calculated egress. If it does, then set the restriction to the distance from the start of the TO vector to
      // where the egress joins the vector.
      if (nextTransitionRestrictedD === undefined) {
        if (toLegCalc.egress.length > 0 && toLegCalc.egressJoinIndex === 0) {
          const toVectorPath = FlightPathUtils.setGeoCircleFromVector(toVector, this.trackTrackCache.geoCircle[0]);
          const egressJoinDistance = toVectorPath.distanceAlong(
            GeoPoint.sphericalToCartesian(toVector.startLat, toVector.startLon, this.trackTrackCache.vec3[0]),
            GeoPoint.sphericalToCartesian(toLegCalc.egress[0].startLat, toLegCalc.egress[0].startLon, this.trackTrackCache.vec3[1]),
            Math.PI
          );
          nextTransitionRestrictedD = egressJoinDistance > Math.PI + GeoMath.ANGULAR_TOLERANCE ? 0 : egressJoinDistance;
        } else {
          nextTransitionRestrictedD = Infinity;
        }
      }

      restrictedD = Math.min(restrictedD, nextTransitionRestrictedD);
    }

    const D = Math.min(
      desiredD,
      restrictedD,
      UnitType.METER.convertTo(fromVector.distance, UnitType.GA_RADIAN),
      UnitType.METER.convertTo(toVector.distance, UnitType.GA_RADIAN)
    );

    // The distance from the turn vertex to the center of the turn.
    const H = Math.atan(Math.tan(D) / Math.cos(theta * Avionics.Utils.DEG2RAD));
    const turnRadiusRad = desiredD === D
      ? desiredTurnRadiusRad
      : Math.atan(Math.sin(D) * tanTheta);

    if (D <= GeoMath.ANGULAR_TOLERANCE || turnRadiusRad <= GeoMath.ANGULAR_TOLERANCE) {
      // Prevent zero-length turns.
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return calculatedCount;
    }

    // We need to reset the GeoPoint because the potential call to calculateTrackTrackTransition() above can overwrite
    // it.
    fromVectorEnd.set(fromVector.endLat, fromVector.endLon);

    const turnDirection = FlightPathUtils.getShortestTurnDirection(fromVectorCourse, toVectorCourse) ?? 'right';
    const turnBisectorBearing = toVectorCourse + theta * (turnDirection === 'left' ? -1 : 1);
    const turnCenterVec = fromVectorEnd.offset(turnBisectorBearing, H, this.trackTrackCache.geoPoint[1]).toCartesian(this.trackTrackCache.vec3[0]);

    const turnStart = fromVectorEnd.offset(fromVectorCourse, -D, this.trackTrackCache.geoPoint[1]);
    const turnMiddle = fromVectorEnd.offset(turnBisectorBearing, H - turnRadiusRad, this.trackTrackCache.geoPoint[2]);
    const turnEnd = fromVectorEnd.offset(toVectorCourse, D, this.trackTrackCache.geoPoint[3]);

    this.setAnticipatedTurn(
      fromLegCalc, toLegCalc,
      fromLegUseIngress,
      turnRadiusRad, turnDirection,
      turnCenterVec,
      turnStart, turnMiddle, turnEnd,
      true
    );

    if (fromLegUseIngress) {
      // If the anticipated turn connects to the FROM leg's ingress transition instead of its base flight path, then
      // we need to shorten the ingress path to end where the anticipated turn starts (i.e. where the FROM leg's egress
      // transition starts).
      this.resolveIngressJoinedToAnticipatedTurn(fromLegCalc);
    }

    return calculatedCount;
  }

  private readonly turnXCache = {
    vec3: ArrayUtils.create(2, () => Vec3Math.create()),
    geoPoint: ArrayUtils.create(2, () => new GeoPoint(0, 0)),
    geoCircle: ArrayUtils.create(2, () => new GeoCircle(Vec3Math.create(), 0)),
  };

  /**
   * Calculates a leg-to-leg transition between a small-circle ("turn") vector and another vector.
   * @param legs An array containing the legs for which to calculate transitions.
   * @param fromIndex The index of the transition's FROM leg.
   * @param toIndex The index of the transition's TO leg.
   * @param endIndex The index of the flight plan leg at which to stop calculating transitions. The last transition to
   * be calculated will be between the this leg and the previous leg.
   * @param state The airplane state to use for calculations.
   * @param fromLegUseIngress Whether the transition joins the FROM leg's ingress path instead of its base flight path.
   * @param fromVector The last vector of the FROM leg's flight path that the transition joins (the FROM vector).
   * @param toVector The first vector of the TO leg's flight path that the transition joins (the TO vector).
   * @returns The number of consecutive leg-to-leg transitions calculated by this method.
   */
  private calculateTurnXTransition(
    legs: LegDefinition[],
    fromIndex: number,
    toIndex: number,
    endIndex: number,
    state: FlightPathPlaneState,
    fromLegUseIngress: boolean,
    fromVector: FlightPathVector,
    toVector: FlightPathVector
  ): number {
    const fromLeg = legs[fromIndex];
    const toLeg = legs[toIndex];

    const fromLegCalc = fromLeg.calculated!;
    const toLegCalc = toLeg.calculated!;

    if (
      fromVector.distance <= FlightPathLegToLegCalculator.ANGULAR_TOLERANCE_METERS
      || toVector.distance <= FlightPathLegToLegCalculator.ANGULAR_TOLERANCE_METERS
    ) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return 1;
    }

    const fromVectorEnd = this.turnXCache.geoPoint[0].set(fromVector.endLat, fromVector.endLon);
    const toVectorStart = this.turnXCache.geoPoint[1].set(toVector.startLat, toVector.startLon);

    const areLegsContinuous = fromVectorEnd.equals(toVectorStart, 1e-5);

    if (!areLegsContinuous) {
      // The FROM leg does not end within ~60 meters of the start of the TO leg. We will set an empty transition
      // UNLESS either the FROM or TO leg is an AF or RF leg. These leg types often end up being somewhat discontinuous
      // with the preceding or proceeding leg, because the arcs can be slightly offset from the intended origin and/or
      // terminator fixes.

      let shouldQuit = true;

      if (
        fromLeg.leg.type === LegType.AF
        || fromLeg.leg.type === LegType.RF
        || toLeg.leg.type === LegType.AF
        || toLeg.leg.type === LegType.RF
      ) {
        shouldQuit = false;
      }

      if (shouldQuit) {
        this.setEmptyTransition(fromLegCalc, toLegCalc);
        return 1;
      }
    }
    const fromVectorPath = FlightPathUtils.setGeoCircleFromVector(fromVector, this.turnXCache.geoCircle[0]);
    const toVectorPath = FlightPathUtils.setGeoCircleFromVector(toVector, this.turnXCache.geoCircle[1]);

    // Calculate whether the vectors intersect. If they don't (or if they are entirely coincident), then we will
    // immediately bail out.

    const transitionTurn = this.circleToCircleTurn
      .setFromCircle(fromVectorPath)
      .setToCircle(toVectorPath)
      .updateAnchors(GeoMath.ANGULAR_TOLERANCE);

    const intersections = transitionTurn.getIntersections();
    const turnTurnIntersectionCount = intersections.length;

    if (turnTurnIntersectionCount === 0) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return 1;
    }

    const fromVectorEndVec = fromVectorEnd.toCartesian(this.turnXCache.vec3[0]);
    const toVectorStartVec = toVectorStart.toCartesian(this.turnXCache.vec3[1]);

    const fromVectorHalfDistanceRad = UnitType.METER.convertTo(fromVector.distance / 2, UnitType.GA_RADIAN);
    const toVectorHalfDistanceRad = UnitType.METER.convertTo(toVector.distance / 2, UnitType.GA_RADIAN);

    let intersectionFromVectorEndOffset = 0;
    let intersectionToVectorStartOffset = 0;

    let isFlyover = false;
    let transitionTurnRadiusRad = 0;

    if (turnTurnIntersectionCount === 1) {
      // The FROM and TO vectors are tangent.

      // The FROM vector does not necessarily end exactly at the tangent point and the TO vector does not
      // necessarily start exactly at the tangent point. Therefore, we need to check whether the intersection
      // between the FROM and TO vectors is valid.

      const intersectionVec = intersections[0];

      intersectionFromVectorEndOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(fromVectorPath, fromVectorEndVec, intersectionVec);
      intersectionToVectorStartOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(toVectorPath, intersectionVec, toVectorStartVec);

      if (!this.isTurnXIntersectionValid(
        intersectionVec,
        fromVectorPath, fromVectorEndVec, fromVectorHalfDistanceRad, intersectionFromVectorEndOffset,
        toVectorPath, toVectorStartVec, toVectorHalfDistanceRad, intersectionToVectorStartOffset
      )) {
        this.setEmptyTransition(fromLegCalc, toLegCalc);
        return 1;
      }

      transitionTurn.selectAnchor(0);

      // Whether the TO and FROM vectors are oriented in the same direction at the tangent point (i.e. whether their
      // paths are parallel).
      const isForward = Math.abs(transitionTurn.getAngleDelta()!) <= MathUtils.HALF_PI;
      if (isForward) {
        // The FROM and TO vectors are parallel at the tangent point. In this case no anticipated turn is needed
        // between the FROM and TO vectors. Therefore, we will set the transition turn radius to zero so that the
        // code that builds the anticipated turn skips the turn but still tries to "connect" the FROM and TO vectors
        // if their ends are not entirely coincident.
        transitionTurnRadiusRad = 0;
      } else {
        // The FROM and TO vectors are antiparallel at the tangent point. In this case the plane needs to make a
        // 180-degree turn. Therefore, we will build a flyover transition.
        isFlyover = true;
      }
    } else {
      // The turn circle and track path are secant.

      // Check whether either of the intersections between the FROM and TO vectors is valid.

      const intersection0FromVectorEndOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(fromVectorPath, fromVectorEndVec, intersections[0]);
      const intersection0ToVectorStartOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(toVectorPath, intersections[0], toVectorStartVec);

      const intersection1FromVectorEndOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(fromVectorPath, fromVectorEndVec, intersections[1]);
      const intersection1ToVectorStartOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(toVectorPath, intersections[1], toVectorStartVec);

      const isIntersection0Valid = this.isTurnXIntersectionValid(
        intersections[0],
        fromVectorPath, fromVectorEndVec, fromVectorHalfDistanceRad, intersection0FromVectorEndOffset,
        toVectorPath, toVectorStartVec, toVectorHalfDistanceRad, intersection0ToVectorStartOffset
      );
      const isIntersection1Valid = this.isTurnXIntersectionValid(
        intersections[1],
        fromVectorPath, fromVectorEndVec, fromVectorHalfDistanceRad, intersection1FromVectorEndOffset,
        toVectorPath, toVectorStartVec, toVectorHalfDistanceRad, intersection1ToVectorStartOffset
      );

      if (!isIntersection0Valid && !isIntersection1Valid) {
        this.setEmptyTransition(fromLegCalc, toLegCalc);
        return 1;
      }

      let intersectionIndex: 0 | 1;

      if (!isIntersection0Valid) {
        intersectionIndex = 1;
      } else if (!isIntersection1Valid) {
        intersectionIndex = 0;
      } else {
        // Both intersections are valid. We will bias toward intersections that lie after the end of the FROM vector
        // and before the start of the TO vector.

        if (intersection0FromVectorEndOffset + intersection0ToVectorStartOffset >= intersection1FromVectorEndOffset + intersection1ToVectorStartOffset) {
          intersectionIndex = 0;
        } else {
          intersectionIndex = 1;
        }
      }

      if (intersectionIndex === 0) {
        intersectionFromVectorEndOffset = intersection0FromVectorEndOffset;
        intersectionToVectorStartOffset = intersection0ToVectorStartOffset;
      } else {
        intersectionFromVectorEndOffset = intersection1FromVectorEndOffset;
        intersectionToVectorStartOffset = intersection1ToVectorStartOffset;
      }

      transitionTurn.selectAnchor(intersectionIndex);

      // Check whether the FROM leg ends in a flyover fix. If so, then we must build a flyover transition. Otherwise,
      // attempt to calculate the parameters for an anticipated turn.
      if (fromLeg.leg.flyOver) {
        isFlyover = true;
      } else {
        const angleDeltaAbs = Math.abs(transitionTurn.getAngleDelta()!);
        if (angleDeltaAbs <= 0.017453292519943295 /* 1 deg */) {
          // The FROM and TO vectors are nearly parallel. In this case no anticipated turn is needed. Therefore, we
          // will set the transition turn radius to zero so that the code that builds the anticipated turn skips the
          // turn but still tries to "connect" the FROM and TO vectors if their ends are not entirely coincident.
          transitionTurnRadiusRad = 0;
        } else if (angleDeltaAbs >= 3.12413936106985 /* 179 deg */) {
          // The FROM and TO vectors are nearly antiparallel. In this case the plane needs to make a 180-degree turn.
          // Therefore, we will build a flyover transition.
          isFlyover = true;
        } else if (!transitionTurn.isTurnValid()) {
          // If a valid anticipated turn is not possible at this point, then we have run into an unexpected case and
          // therefore will immediately bail out.
          this.setEmptyTransition(fromLegCalc, toLegCalc);
          return 1;
        } else {
          const desiredTransitionTurnRadius = state.getDesiredTurnAnticipationTurnRadius(fromIndex);
          if (desiredTransitionTurnRadius < FlightPathLegToLegCalculator.MIN_TURN_RADIUS) {
            // The desired transition turn radius is lower than the minimum supported radius. Therefore, we will set
            // the transition turn radius to zero so that the code that builds the anticipated turn skips the turn but
            // still tries to "connect" the FROM and TO vectors if their ends are not entirely coincident.
            transitionTurnRadiusRad = 0;
          } else {
            // The desired transition turn radius is not lower than the minimum supported radius. Therefore we will
            // calculate parameters for an anticipated turn.

            const anticipationLimit = UnitType.METER.convertTo(state.getTurnAnticipationLimit(fromIndex), UnitType.GA_RADIAN);

            const maxTurnStartAngularOffset = fromVectorPath.angularWidth(
              Math.min(fromVectorHalfDistanceRad, anticipationLimit) + intersectionFromVectorEndOffset
            );
            const maxTurnEndAngularOffset = toVectorPath.angularWidth(
              toVectorHalfDistanceRad + intersectionToVectorStartOffset
            );

            transitionTurnRadiusRad = Math.min(
              UnitType.METER.convertTo(desiredTransitionTurnRadius, UnitType.GA_RADIAN),
              transitionTurn.getMaxTurnRadius(),
              MathUtils.HALF_PI
            );

            if (maxTurnStartAngularOffset < transitionTurn.getStartAngularOffsetForMaxTurnRadius()) {
              transitionTurnRadiusRad = Math.min(
                transitionTurnRadiusRad,
                transitionTurn.getTurnRadiusForStartAngularOffset(maxTurnStartAngularOffset)
              );
            }
            if (maxTurnEndAngularOffset < transitionTurn.getEndAngularOffsetForMaxTurnRadius()) {
              transitionTurnRadiusRad = Math.min(
                transitionTurnRadiusRad,
                transitionTurn.getTurnRadiusForEndAngularOffset(maxTurnEndAngularOffset)
              );
            }

            // Check whether there is no room for an anticipated turn. If so, then we will calculate a flyover transition
            // instead.
            if (transitionTurnRadiusRad <= GeoMath.ANGULAR_TOLERANCE) {
              isFlyover = true;
            }
          }
        }
      }
    }

    if (isFlyover) {
      return this.calculateFlyoverTransition(
        legs, fromIndex, toIndex, endIndex,
        state,
        fromVector
      );
    }

    return this.calculateTurnXAnticipatedTurn(
      legs, fromIndex, toIndex, endIndex,
      state,
      fromLegUseIngress,
      fromVector, toVector,
      fromVectorPath, toVectorPath,
      transitionTurn,
      transitionTurnRadiusRad,
      intersectionFromVectorEndOffset, intersectionToVectorStartOffset
    );
  }

  private readonly trackTurnIntersectionValidCache = {
    vec3: ArrayUtils.create(2, () => Vec3Math.create())
  };

  /**
   * Checks if an intersection between a turn vector and another vector is valid for computing turn anticipation
   * between the two vectors. The intersection is considered valid if and only if all the following conditions are
   * true:
   * - The intersection is within one nautical mile of the end of the vector on which the turn begins.
   * - The intersection is within one nautical mile of the start of the vector on which the turn ends.
   * - The intersection is located after the mid-point of the vector on which the turn begins.
   * - The intersection is located before the mid-point of the vector on which the turn ends.
   * @param intersection The intersection to check.
   * @param fromVectorPath A geo circle defining the path of the vector on which the turn begins.
   * @param fromVectorEnd The end point of the vector on which the turn begins.
   * @param fromVectorHalfDistance Half of the distance covered by the vector on which the turn begins.
   * @param intersectionFromVectorEndOffset The along-vector offset distance, in great-arc radians, of the intersection
   * from the end point of the vector on which the turn begins. Positive offsets indicate the intersection is located
   * after the end point.
   * @param toVectorPath A geo circle defining the path of the vector on which the turn ends.
   * @param toVectorStart The start point of the vector on which the turn ends.
   * @param toVectorHalfDistance Half of the distance covered by the vector on which the turn ends.
   * @param intersectionToVectorStartOffset The along-vector offset distance, in great-arc radians, of the intersection
   * from the start point of the vector on which the turn ends. Positive offsets indicate the intersection is located
   * before the start point.
   * @returns Whether the specified intersection is valid for computing turn anticipation between arc and track
   * vectors.
   */
  private isTurnXIntersectionValid(
    intersection: ReadonlyFloat64Array,
    fromVectorPath: GeoCircle,
    fromVectorEnd: ReadonlyFloat64Array,
    fromVectorHalfDistance: number,
    intersectionFromVectorEndOffset: number,
    toVectorPath: GeoCircle,
    toVectorStart: ReadonlyFloat64Array,
    toVectorHalfDistance: number,
    intersectionToVectorStartOffset: number
  ): boolean {
    const fromVectorMidVec = fromVectorPath.offsetDistanceAlong(
      fromVectorEnd,
      -fromVectorHalfDistance,
      this.trackTurnIntersectionValidCache.vec3[0],
      Math.PI
    );
    const toVectorMidVec = toVectorPath.offsetDistanceAlong(
      toVectorStart,
      toVectorHalfDistance,
      this.trackTurnIntersectionValidCache.vec3[1],
      Math.PI
    );

    return (
      Math.abs(intersectionFromVectorEndOffset) <= 2.9e-4 // 2.9e-4 radians ~= 1 nautical mile
      && Math.abs(intersectionToVectorStartOffset) <= 2.9e-4
      && FlightPathUtils.isPointAlongArc(fromVectorPath, fromVectorMidVec, Math.PI, intersection)
      && !FlightPathUtils.isPointAlongArc(toVectorPath, toVectorMidVec, Math.PI, intersection)
    );
  }

  private readonly turnXAnticipatedTurnCache = {
    vec3: ArrayUtils.create(4, () => Vec3Math.create()),
    geoPoint: ArrayUtils.create(2, () => new GeoPoint(0, 0)),
    geoCircle: ArrayUtils.create(2, () => new GeoCircle(Vec3Math.create(), 0)),
  };

  /**
   * Calculates a leg-to-leg anticipated turn transition between a small-circle ("turn") vector and another vector.
   * @param legs An array containing the legs for which to calculate transitions.
   * @param fromIndex The index of the transition's FROM leg.
   * @param toIndex The index of the transition's TO leg.
   * @param endIndex The index of the flight plan leg at which to stop calculating transitions. The last transition to
   * be calculated will be between the this leg and the previous leg.
   * @param state The airplane state to use for calculations.
   * @param fromLegUseIngress Whether the transition joins the FROM leg's ingress path instead of its base flight path.
   * @param fromVector The last vector of the FROM leg's flight path that the transition joins (the FROM vector).
   * @param toVector The first vector of the TO leg's flight path that the transition joins (the TO vector).
   * @param fromVectorPath A GeoCircle that defines the path of the FROM vector.
   * @param toVectorPath A GeoCircle that defines the path of the TO vector.
   * @param turn A circle-to-circle turn object that defines the anticipated turn. The turn must be valid if the
   * anticipated turn radius is greater than zero.
   * @param transitionTurnRadius The radius of the anticipated turn, in great-arc radians.
   * @param intersectionFromVectorEndOffset The along-vector offset distance, in great-arc radians, of the intersection
   * from the end point of the FROM vector. Positive offsets indicate the intersection is located after the end point.
   * @param intersectionToVectorStartOffset The along-vector offset distance, in great-arc radians, of the intersection
   * from the start point of the TO vector. Positive offsets indicate the intersection is located before the start
   * point.
   * @returns The number of consecutive leg-to-leg transitions calculated by this method.
   */
  private calculateTurnXAnticipatedTurn(
    legs: LegDefinition[],
    fromIndex: number,
    toIndex: number,
    endIndex: number,
    state: FlightPathPlaneState,
    fromLegUseIngress: boolean,
    fromVector: FlightPathVector,
    toVector: FlightPathVector,
    fromVectorPath: GeoCircle,
    toVectorPath: GeoCircle,
    turn: FlightPathCircleToCircleTurn,
    transitionTurnRadius: number,
    intersectionFromVectorEndOffset: number,
    intersectionToVectorStartOffset: number,
  ): number {
    const fromLegCalc = legs[fromIndex].calculated!;
    const toLegCalc = legs[toIndex].calculated!;

    const intersection = turn.getSelectedAnchor()!;

    let transitionTurnStartVec: ReadonlyFloat64Array;
    let transitionTurnEndVec: ReadonlyFloat64Array;

    // The distance along the FROM vector from the end of the FROM vector to the start of the transition (anticipated
    // turn). Positive distances indicate that the transition starts after the end of the FROM vector.
    let transitionStartFromVectorEndOffset = 0;
    // The distance along the TO vector from the end of the transition (anticipated turn) to the start of the TO
    // vector. Positive distances indicate that the transition ends before the start of the TO vector.
    let transitionEndToVectorStartOffset = 0;

    let egressVectorCount = 0;
    let ingressVectorCount = 0;

    if (transitionTurnRadius <= GeoMath.ANGULAR_TOLERANCE) {
      transitionTurnStartVec = intersection;
      transitionTurnEndVec = intersection;

      transitionStartFromVectorEndOffset = intersectionFromVectorEndOffset;
      transitionEndToVectorStartOffset = intersectionToVectorStartOffset;
    } else {
      turn.setTurnRadius(transitionTurnRadius);

      transitionTurnStartVec = turn.getTurnStart(this.turnXAnticipatedTurnCache.vec3[0]);
      transitionTurnEndVec = turn.getTurnEnd(this.turnXAnticipatedTurnCache.vec3[1]);

      const transitionTurnCircle = turn.getTurnCircle(this.turnXAnticipatedTurnCache.geoCircle[0]);
      const transitionTurnMiddleVec = transitionTurnCircle.offsetAngleAlong(
        transitionTurnStartVec,
        transitionTurnCircle.angleAlong(transitionTurnStartVec, transitionTurnEndVec, Math.PI, GeoMath.ANGULAR_TOLERANCE) * 0.5,
        this.turnXAnticipatedTurnCache.vec3[2],
        Math.PI
      );

      this.setAnticipatedTurn(
        fromLegCalc, toLegCalc,
        fromLegUseIngress,
        FlightPathUtils.getTurnRadiusFromCircle(transitionTurnCircle),
        FlightPathUtils.getTurnDirectionFromCircle(transitionTurnCircle),
        FlightPathUtils.getTurnCenterFromCircle(transitionTurnCircle, this.turnXAnticipatedTurnCache.vec3[3]),
        transitionTurnStartVec,
        transitionTurnMiddleVec,
        transitionTurnEndVec,
        false
      );

      const intersectionTransitionStartOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(fromVectorPath, transitionTurnStartVec, intersection);
      const intersectionTransitionEndOffset = FlightPathLegToLegCalculator.getAlongCircleOffset(toVectorPath, intersection, transitionTurnEndVec);

      transitionStartFromVectorEndOffset = intersectionFromVectorEndOffset - intersectionTransitionStartOffset;
      transitionEndToVectorStartOffset = intersectionToVectorStartOffset - intersectionTransitionEndOffset;

      egressVectorCount = 1;
      ingressVectorCount = 1;
    }

    if (Math.abs(transitionStartFromVectorEndOffset) > 1e-5) {
      // The transition does not begin within ~60 meters of the end of the FROM vector. If the transition begins
      // after the end of the FROM vector, then we need to extend the transition at the egress end so that it joins
      // the FROM vector. If the transition begins before the end of the FROM vector and there is no anticipated turn
      // vector in the egress, then we need to add a zero-length egress vector so that we can properly mark the
      // beginning of the transition.

      if (transitionStartFromVectorEndOffset > 0 || egressVectorCount === 0) {
        // Copy the first egress vector if it exists to the second egress vector.
        if (egressVectorCount > 0) {
          const movedVector = fromLegCalc.egress[1] ??= FlightPathUtils.createEmptyVector();
          Object.assign(movedVector, fromLegCalc.egress[0]);
        }

        // The end of the extension vector is always the start of the transition turn.
        const vectorEnd = this.turnXAnticipatedTurnCache.geoPoint[0].setFromCartesian(transitionTurnStartVec);
        // If the transition starts after the end of the FROM vector, then the start of the extension vector is the end
        // of the FROM vector. Otherwise, it is the start of the transition turn (because we want to create a
        // zero-length vector).
        const vectorStart = transitionStartFromVectorEndOffset > 0
          ? this.turnXAnticipatedTurnCache.geoPoint[1].set(fromVector.endLat, fromVector.endLon)
          : vectorEnd;

        const flags = FlightPathVectorFlags.LegToLegTurn
          | FlightPathVectorFlags.AnticipatedTurn
          | (fromVector.flags & FlightPathVectorFlags.Fallback);

        FlightPathUtils.setVectorFromCircle(
          fromLegCalc.egress[0] ??= FlightPathUtils.createEmptyVector(),
          fromVectorPath,
          vectorStart, vectorEnd,
          flags,
          fromVector.heading, fromVector.isHeadingTrue
        );

        fromLegCalc.egressJoinIndex = fromLegCalc.flightPath.length - 1;

        egressVectorCount += 1;
      }
    }

    if (Math.abs(transitionEndToVectorStartOffset) > 1e-5) {
      // The transition does not end within ~60 meters of the start of the TO vector. If the transition begins before
      // the start of the TO vector, then we need to extend the transition at the ingress end so that it joins the TO
      // TO vector. If the transition ends after the end of the TO vector and there is no anticipated turn vector in
      // the ingress, then we need to add a zero-length ingress vector so that we can properly mark the end of the
      // transition.

      if (transitionEndToVectorStartOffset > 0 || ingressVectorCount === 0) {
        // The start of the extension vector is always the end of the transition turn.
        const vectorStart = this.turnXAnticipatedTurnCache.geoPoint[0].setFromCartesian(transitionTurnEndVec);
        // If the transition ends before the start of the TO vector, then the end of the extension vector is the start
        // of the TO vector. Otherwise, it is the end of the transition turn (because we want to create a zero-length
        // vector).
        const vectorEnd = transitionEndToVectorStartOffset > 0
          ? this.turnXAnticipatedTurnCache.geoPoint[1].set(toVector.startLat, toVector.startLon)
          : vectorStart;

        const flags = FlightPathVectorFlags.LegToLegTurn
          | FlightPathVectorFlags.AnticipatedTurn
          | (toVector.flags & FlightPathVectorFlags.Fallback);

        FlightPathUtils.setVectorFromCircle(
          toLegCalc.ingress[ingressVectorCount] ??= FlightPathUtils.createEmptyVector(),
          toVectorPath,
          vectorStart, vectorEnd,
          flags,
          toVector.heading, toVector.isHeadingTrue
        );

        toLegCalc.ingressJoinIndex = 0;

        ingressVectorCount += 1;
      }
    }

    fromLegCalc.egress.length = egressVectorCount;
    if (egressVectorCount === 0) {
      fromLegCalc.egressJoinIndex = -1;
    }

    toLegCalc.ingress.length = ingressVectorCount;
    if (ingressVectorCount === 0) {
      toLegCalc.ingressJoinIndex = -1;
    }

    if (fromLegUseIngress && egressVectorCount > 0) {
      // If the anticipated turn connects to the FROM leg's ingress transition instead of its base flight path, then
      // we need to shorten the ingress path to end where the anticipated turn starts (i.e. where the FROM leg's egress
      // transition starts).
      this.resolveIngressJoinedToAnticipatedTurn(fromLegCalc);
    }

    return 1;
  }

  private readonly flyoverCache = {
    vec3: ArrayUtils.create(2, () => Vec3Math.create()),
    geoCircle: ArrayUtils.create(2, () => new GeoCircle(Vec3Math.create(), 0)),
  };

  /**
   * Calculates a leg-to-leg flyover transition.
   * @param legs An array containing the legs for which to calculate transitions.
   * @param fromIndex The index of the transition's FROM leg.
   * @param toIndex The index of the transition's TO leg.
   * @param endIndex The index of the flight plan leg at which to stop calculating transitions. The last transition to
   * be calculated will be between the this leg and the previous leg.
   * @param state The airplane state to use for calculations.
   * @param fromVector The last vector of the FROM leg's flight path that the transition joins (the FROM vector).
   * @returns The number of consecutive leg-to-leg transitions calculated by this method.
   */
  private calculateFlyoverTransition(
    legs: LegDefinition[],
    fromIndex: number,
    toIndex: number,
    endIndex: number,
    state: FlightPathPlaneState,
    fromVector: FlightPathVector
  ): number {
    const fromLegCalc = legs[fromIndex].calculated!;
    const toLegCalc = legs[toIndex].calculated!;

    const desiredTurnRadius = state.getDesiredTurnRadius(toIndex);

    if (desiredTurnRadius < FlightPathLegToLegCalculator.MIN_TURN_RADIUS) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return 1;
    }

    const fromVectorEnd = GeoPoint.sphericalToCartesian(fromVector.endLat, fromVector.endLon, this.flyoverCache.vec3[0]);

    const startPath = FlightPathUtils.isVectorGreatCircle(fromVector)
      ? FlightPathUtils.setGeoCircleFromVector(fromVector, this.flyoverCache.geoCircle[0])
      : FlightPathUtils.getGreatCircleTangentToVector(fromVectorEnd, fromVector, this.flyoverCache.geoCircle[0]);

    if (!startPath.isValid()) {
      this.setEmptyTransition(fromLegCalc, toLegCalc);
      return 1;
    }

    // Clear the egress transition on the FROM leg because flyover transitions start at the end of the FROM leg.
    fromLegCalc.egress.length = 0;
    fromLegCalc.egressJoinIndex = -1;

    const ingress = toLegCalc.ingress;
    let ingressJoinIndex = -1;
    let ingressVectorIndex = 0;

    const flags = FlightPathVectorFlags.LegToLegTurn;
    const turnToCourseFlags = flags | FlightPathVectorFlags.TurnToCourse;

    // Scan forward through all base flight path vectors in the TO leg and attempt to build a path to intercept and
    // join each vector. The first such intercept path that is successfully built will be used as the ingress
    // transition.
    for (let i = 0; i < toLegCalc.flightPath.length; i++) {
      const vector = toLegCalc.flightPath[i];
      const vectorPath = FlightPathUtils.setGeoCircleFromVector(vector, this.flyoverCache.geoCircle[1]);
      const vectorEnd = GeoPoint.sphericalToCartesian(vector.endLat, vector.endLon, this.flyoverCache.vec3[1]);

      const maxInterceptDistanceFromEnd = vectorPath.isGreatCircle()
        ? FlightPathLegToLegCalculator.HALF_EARTH_CIRCUMFERENCE
        : vector.distance;

      if (maxInterceptDistanceFromEnd > 10) {
        const toVectorFlags = vector.flags & FlightPathVectorFlags.Fallback;

        ingressVectorIndex += this.interceptAtPointVectorBuilder.build(
          ingress, ingressVectorIndex,
          fromVectorEnd, startPath,
          desiredTurnRadius, undefined,
          FlightPathLegToLegCalculator.FLYOVER_INTERCEPT_ANGLE,
          vectorPath,
          vectorEnd, maxInterceptDistanceFromEnd,
          desiredTurnRadius,
          turnToCourseFlags | toVectorFlags, flags | toVectorFlags, turnToCourseFlags | toVectorFlags
        );

        if (ingressVectorIndex > 0) {
          // Check if the intercept path that was built ends within the bounds of the joined vector. If it does not,
          // then extend the ingress along the joined vector path (the intercept path is guaranteed to end along the
          // joined vector path) until it reaches the start of the joined vector.

          const vectorStart = this.trackTrackCache.geoPoint[0].set(vector.startLat, vector.startLon);

          const lastIngressVector = ingress[ingressVectorIndex - 1];
          const ingressEnd = this.trackTrackCache.geoPoint[1].set(lastIngressVector.endLat, lastIngressVector.endLon);

          if (!FlightPathUtils.isPointAlongArc(vectorPath, vectorStart, vectorEnd, ingressEnd)) {
            ingressVectorIndex += this.circleVectorBuilder.build(ingress, ingressVectorIndex, vectorPath, ingressEnd, vectorStart, flags | toVectorFlags);
          }

          ingressJoinIndex = i;
          break;
        }
      }
    }

    if (ingressJoinIndex < 0) {
      // We were unable to build an intercept path to join any of the vectors on the TO leg. As a fallback, we will
      // build a direct-to path from the end of the FROM leg to the end of the TO leg. We will write this path to the
      // *base* ingress array so that we can calculate turn anticipation (if necessary) using this ingress path for the
      // future transition where the leg is the FROM leg.

      const lastVector = toLegCalc.flightPath[toLegCalc.flightPath.length - 1];
      const toLegEnd = this.trackTrackCache.geoPoint[0].set(lastVector.endLat, lastVector.endLon);

      ingressVectorIndex += this.directToPointVectorBuilder.build(
        toLegCalc.ingressBase, ingressVectorIndex,
        fromVectorEnd, startPath,
        toLegEnd,
        desiredTurnRadius, undefined,
        flags | FlightPathVectorFlags.LegToLegFallback, true, true
      );

      toLegCalc.ingressBase.length = ingressVectorIndex;

      if (ingressVectorIndex > 0) {
        FlightPathUtils.deepCopyVectorArray(toLegCalc.ingressBase, toLegCalc.ingress);
        toLegCalc.ingressJoinIndex = toLegCalc.flightPath.length;
      } else {
        toLegCalc.ingressJoinIndex = -1;
      }
    } else {
      toLegCalc.ingressJoinIndex = ingressJoinIndex;
    }

    ingress.length = ingressVectorIndex;

    return 1;
  }

  /**
   * Checks whether the contents of a transition vector array can be replaced with calculated leg-to-leg transition
   * vectors.
   * @param transition The transition vector array to check.
   * @returns Whether the contents of the specified transition vector array can be replaced with calculated leg-to-leg
   * transition vectors.
   */
  private static canCalculateTransition(transition: FlightPathVector[]): boolean {
    return transition.length === 0 || BitFlags.isAll(transition[0].flags, FlightPathVectorFlags.LegToLegTurn);
  }

  /**
   * Gets the along-circle offset distance from a reference point to a query point, in great-arc radians. The offset
   * is signed, with positive values indicating offsets in the direction of the circle. The calculated offset has the
   * range `[-c / 2, c / 2)`, where `c` is the circumference of the circle.
   * @param circle The geo circle along which to measure the offset.
   * @param reference The reference point.
   * @param query The query point.
   * @param equalityTolerance The tolerance for considering the reference and query points to be equal, in great-arc
   * radians. If the absolute (direction-agnostic) along-circle distance between the reference and query points is less
   * than or equal to this value, then zero will be returned. Defaults to `0`.
   * @returns The along-circle offset distance from the specified reference point to the query point, in great-arc
   * radians.
   */
  private static getAlongCircleOffset(
    circle: GeoCircle,
    reference: LatLonInterface | ReadonlyFloat64Array,
    query: LatLonInterface | ReadonlyFloat64Array,
    equalityTolerance?: number
  ): number {
    return circle.arcLength(
      MathUtils.normalizeAngle(circle.angleAlong(reference, query, Math.PI, equalityTolerance), -Math.PI)
    );
  }
}

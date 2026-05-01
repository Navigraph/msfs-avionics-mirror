import { EventBus } from '../../data/EventBus';
import {
  FlightPlan, FlightPlanCalculatedEvent, FlightPlanLegEvent, FlightPlanner, FlightPlanSegment, FlightPlanSegmentEvent,
  FlightPlanSegmentType, LegDefinition, LegDefinitionFlags, VerticalFlightPhase
} from '../../flightplan';
import { GeoPoint } from '../../geo/GeoPoint';
import { BitFlags } from '../../math/BitFlags';
import { MathUtils } from '../../math/MathUtils';
import { UnitType } from '../../math/NumberUnit';
import { AltitudeRestrictionType, LegType } from '../../navigation';
import { ReadonlySubEvent, SubEvent } from '../../sub';
import { AltitudeConstraintDetails, VerticalFlightPlan, VNavConstraint, VNavLeg } from '../VerticalNavigation';
import { VNavControlEvents } from '../vnav/VNavControlEvents';
import { VNavUtils } from '../vnav/VNavUtils';
import { VNavPathCalculator } from './VNavPathCalculator';

/**
 * A leg in a {@link VerticalFlightPlan} that does not contain computed vertical path information.
 */
export type UncomputedVNavLeg = Pick<VNavLeg, 'segmentIndex' | 'legIndex' | 'name' | 'distance' | 'isEligible' | 'isUserDefined' | 'isDirectToTarget'>;

/**
 * An altitude constraint in a {@link VerticalFlightPlan} that does not contain computed vertical path information.
 */
export type UncomputedVNavConstraint = Pick<VNavConstraint, 'type' | 'index' | 'minAltitude' | 'maxAltitude' | 'name' | 'isBeyondFaf'>;

/**
 * Options for a SmoothingPathCalculator.
 */
export type SmoothingPathCalculatorOptions = {
  /**
   * The VNAV index to assign to the path calculator. The VNAV index determines the index of the control events used
   * to control the calculator. Defaults to `0`.
   */
  index?: number;

  /**
   * The default flight path angle, in degrees, for descent paths. Increasingly positive values indicate steeper
   * descents. Defaults to 3 degrees.
   */
  defaultFpa?: number;

  /**
   * The minimum allowed flight path angle, in degrees, for descent paths. Increasingly positive values indicate
   * steeper descents. Paths that require angles less than the minimum value will be assigned the default flight path
   * angle instead to create a step-down descent. Vertical direct-to paths are exempt from the minimum FPA requirement.
   * Defaults to 1.5 degrees.
   */
  minFpa?: number;

  /**
   * The maximum allowed flight path angle, in degrees, for descent paths. Increasingly positive values indicate
   * steeper descents. Paths that require angles greater than the maximum value will have their FPAs clamped to the
   * maximum value, even if this would create a discontinuity in the vertical profile. Defaults to 6 degrees.
   */
  maxFpa?: number;

  /**
   * Whether to force the first constraint in the approach to an AT constraint. Defaults to `false`.
   * @deprecated Please use the `getLegConstraintAltitudes` option to customize minimum and maximum altitudes for VNAV
   * constraints.
   */
  forceFirstApproachAtConstraint?: boolean;

  /** The index offset of a lateral direct-to leg from its direct-to target leg. Defaults to `3`. */
  directToLegOffset?: number;

  /**
   * A function which gets the minimum and maximum altitudes to enforce for a VNAV constraint assigned to a lateral
   * flight plan leg.
   * 
   * If not defined, then the minimum and maximum altitudes will be taken from the leg's vertical data based on the
   * value of the altitude restriction type field as follows:
   * * {@link AltitudeRestrictionType.At}: minimum and maximum altitude equal to the first altitude restriction field.
   * * {@link AltitudeRestrictionType.AtOrAbove}: minimum altitude equal to the first altitude restriction field,
   * maximum altitude equal to infinity.
   * * {@link AltitudeRestrictionType.AtOrBelow}: minimum altitude equal to negative infinity, maximum altitude equal
   * to the second altitude restriction field.
   * * {@link AltitudeRestrictionType.Between}: minimum altitude equal to the second altitude restriction field,
   * maximum altitude equal to the first altitude restriction field.
   * * {@link AltitudeRestrictionType.Unused} (or any other value): no altitudes.
   * @param out The tuple to which to write the minimum and maximum altitudes, as
   * `[minimum_altitude, maximum_altitude]` in meters.
   * @param lateralPlan The lateral flight plan that hosts the leg for which to get the constraint altitudes.
   * @param lateralLeg The lateral flight plan leg for which to get the constraint altitudes.
   * @param globalLegIndex The global index of the lateral flight plan leg for which to get the constraint altitudes.
   * @param segment The latearl flight plan segment containing the flight plan leg for which to get the constraint
   * altitudes.
   * @param segmentLegIndex The index of the lateral flight plan leg for which to get the constraint altitudes in its
   * containing segment.
   * @returns The minimum and maximum altitudes to enforce for a VNAV constraint assigned to the specified lateral
   * flight plan leg, as the tuple passed to the `out` parameter, or `undefined` if there should be no constraint
   * assigned to the leg.
   */
  getLegConstraintAltitudes?: (
    out: [min: number, max: number],
    lateralPlan: FlightPlan,
    lateralLeg: LegDefinition,
    globalLegIndex: number,
    segment: FlightPlanSegment,
    segmentLegIndex: number
  ) => [min: number, max: number] | undefined;

  /**
   * A function which checks whether a lateral flight plan leg is eligible for VNAV. VNAV descent paths will not be
   * calculated through VNAV-ineligible legs. If not defined, then a leg will be considered eligible if and only if it
   * does not contain a discontinuity.
   */
  isLegEligible?: (lateralLeg: LegDefinition) => boolean;

  /**
   * A function which checks whether an altitude constraint defined for a lateral flight plan leg should be used for
   * VNAV. If not defined, then all constraints will be used.
   * @param lateralPlan The lateral flight plan that hosts the altitude constraint.
   * @param lateralLeg The lateral flight plan leg that hosts the altitude constraint.
   * @param globalLegIndex The global index of the lateral flight plan leg that hosts the altitude constraint.
   * @param segment The lateral flight plan segment containing the flight plan leg that hosts the altitude constraint.
   * @param segmentLegIndex The index of the lateral flight plan leg that hosts the altitude constraint in its
   * containing segment.
   * @returns Whether the altitude constraint defined for the specified lateral flight plan leg should be used for
   * VNAV.
   */
  shouldUseConstraint?: (lateralPlan: FlightPlan, lateralLeg: LegDefinition, globalLegIndex: number, segment: FlightPlanSegment, segmentLegIndex: number) => boolean;

  /**
   * A function which gets the along-track offset to use for a VNAV constraint.
   * @param constraint The constraint for which to get an along-track offset.
   * @param constraintIndex The index of the constraint for which to get an along-track offset.
   * @param verticalLeg The vertical flight plan leg that hosts the constraint for which to get an along-track offset.
   * @param lateralLeg The lateral flight plan leg that hosts the constraint for which to get an along-track offset.
   * @param verticalPlan The vertical flight plan containing the constraint for which to get an along-track offset.
   * Use caution when accessing information from the vertical flight plan - computed vertical path information may be
   * unavailable or out-of-date. Refer to the {@link UncomputedVNavLeg} and {@link UncomputedVNavConstraint} types for
   * guidance on what information from legs and constraints is safe to access.
   * @param lateralPlan The lateral flight plan associated with the constraint for which to get an along-track offset.
   * @returns The along-track offset to use for the specified VNAV constraint, in meters. An offset of zero indicates
   * the constraint is coincident with the end of its host leg, positive offsets move the constraint forward along the
   * flight plan, and negative offsets move the constraint backward along the flight plan.
   */
  getConstraintAlongTrackOffset?: (
    constraint: UncomputedVNavConstraint,
    constraintIndex: number,
    verticalLeg: UncomputedVNavLeg,
    lateralLeg: LegDefinition,
    verticalPlan: VerticalFlightPlan,
    lateralPlan: FlightPlan
  ) => number;

  /**
   * A function which checks whether a climb constraint should be invalidated. Invalidated constraints will not appear
   * in the vertical flight plan.
   * 
   * If not defined, then no climb constraints will be invalidated.
   * @param constraint The climb constraint to check.
   * @param index The index of the constraint to check.
   * @param constraints The array of VNAV constraints currently in the vertical flight plan.
   * @param firstDescentConstraintIndex The index of the first descent constraint in the vertical flight plan, if one
   * exists.
   * @param priorMinAltitude The most recent minimum altitude, in meters, defined by a VNAV constraint prior to the
   * constraint to check. Only prior constraints connected to the constraint to check by a contiguous sequence of
   * constraints of the same category (climb or missed approach) are included.
   * @param priorMaxAltitude The most recent maximum altitude, in meters, defined by a VNAV constraint prior to the
   * constraint to check. Only prior constraints connected to the constraint to check by a contiguous sequence of
   * constraints of the same category (climb or missed approach) are included.
   * @returns Whether the specified climb constraint should be invalidated.
   */
  invalidateClimbConstraint?: (
    constraint: UncomputedVNavConstraint,
    index: number,
    constraints: readonly UncomputedVNavConstraint[],
    firstDescentConstraintIndex: number,
    priorMinAltitude: number,
    priorMaxAltitude: number
  ) => boolean;

  /**
   * A function which checks whether a descent constraint should be invalidated. Invalidated constraints will not
   * appear in the vertical flight plan.
   * 
   * If not defined, then a constraint is invalidated if any of the following conditions is met:
   * * The constraint defines a minimum altitude and the minimum altitude is greater than the most recent maximum
   * altitude defined by a prior constraint that is connected to the constraint to check by a contiguous sequence of
   * descent constraints.
   * * The required flight path angle to meet the constraint is greater than the maximum allowed flight path angle.
   * @param constraint The descent constraint to check.
   * @param index The index of the constraint to check.
   * @param constraints The array of VNAV constraints currently in the vertical flight plan.
   * @param priorMinAltitude The most recent minimum altitude, in meters, defined by a VNAV constraint prior to the
   * constraint to check. Only prior constraints connected to the constraint to check by a contiguous sequence of
   * descent constraints are included.
   * @param priorMaxAltitude The most recent maximum altitude, in meters, defined by a VNAV constraint prior to the
   * constraint to check. Only prior constraints connected to the constraint to check by a contiguous sequence of
   * descent constraints are included.
   * @param requiredFpa The minimum flight path angle, in degrees, required to meet the maximum altitude of the
   * constraint to check, assuming a descent starting from the constraint defining the most recent prior minimum
   * altitude. Positive values indicate a descending path. If there is no required FPA because there is no defined
   * prior minimum altitude or maximum altitude for the constraint to check, or if the constraint to check is higher
   * than the prior minimum altitude, then this value will equal zero.
   * @param maxFpa The maximum allowed flight path angle, in degrees. Positive values indicate a descending path.
   * @returns Whether the specified descent constraint should be invalidated.
   */
  invalidateDescentConstraint?: (
    constraint: UncomputedVNavConstraint,
    index: number,
    constraints: readonly UncomputedVNavConstraint[],
    priorMinAltitude: number,
    priorMaxAltitude: number,
    requiredFpa: number,
    maxFpa: number
  ) => boolean;

  /**
   * Gets the target altitude to use for a target descent constraint, in meters. A target descent constraint is a
   * constraint at which a section of the vertical path with a constant flight path angle terminates. The target
   * altitude of the constraint is the altitude at which the vertical path crosses the constraint.
   * 
   * Note: this function is only called to get target altitudes for constraints for which the target altitude is not
   * otherwise constrained by the vertical path to one possible value.
   * @param constraint The constraint for which to get a target altitude.
   * @param constraintIndex The index of the constraint for which to get a target altitude.
   * @param verticalLeg The vertical flight plan leg that hosts the constraint for which to get a target altitude.
   * @param lateralLeg The lateral flight plan leg that hosts the constraint for which to get a target altitude.
   * @param verticalPlan The vertical flight plan containing the constraint for which to get a target altitude. Use
   * caution when accessing information from the vertical flight plan - computed vertical path information may be
   * unavailable or out-of-date. Refer to the {@link UncomputedVNavLeg} and {@link UncomputedVNavConstraint} types for
   * guidance on what information from legs and constraints is safe to access.
   * @param lateralPlan The lateral flight plan associated with the constraint for which to get a target altitude. 
   * @returns The target altitude to use for the specified target descent constraint, in meters.
   */
  getDescentTargetConstraintAltitude?: (
    constraint: UncomputedVNavConstraint,
    constraintIndex: number,
    verticalLeg: UncomputedVNavLeg,
    lateralLeg: LegDefinition,
    verticalPlan: VerticalFlightPlan,
    lateralPlan: FlightPlan
  ) => number;
};

/**
 * Handles the calculation of the VNAV flight path for Path Smoothing VNAV Implementations.
 */
export class SmoothingPathCalculator implements VNavPathCalculator {
  protected static readonly DEFAULT_DEFAULT_FPA = 3;
  protected static readonly DEFAULT_MIN_FPA = 1.5;
  protected static readonly DEFAULT_MAX_FPA = 6;

  protected static readonly DEFAULT_DIRECT_TO_LEG_OFFSET = 3;

  /** The Vertical Flight Plans managed by this Path Calculator */
  protected readonly verticalFlightPlans: (VerticalFlightPlan | undefined)[] = [];

  /** This calculator's VNAV index. */
  public readonly index: number;

  /** The default flight path angle, in degrees, for descent paths. Increasingly positive values indicate steeper descents. */
  public flightPathAngle: number;

  /**
   * The minimum allowed flight path angle, in degrees, for descent paths. Increasingly positive values indicate
   * steeper descents. Paths that require angles less than the minimum value will be assigned the default flight path
   * angle instead to create a step-down descent. Vertical direct-to paths are exempt from the minimum FPA requirement.
   */
  public minFlightPathAngle: number;

  /**
   * The maximum allowed flight path angle, in degrees, for descent paths. Increasingly positive values indicate
   * steeper descents. Paths that require angles greater than the maximum value will have their FPAs clamped to the
   * maximum value, even if this would create a discontinuity in the vertical profile.
   */
  public maxFlightPathAngle: number;

  /** @inheritdoc */
  public readonly planBuilt: ReadonlySubEvent<this, number> = new SubEvent<this, number>();

  /** @inheritdoc */
  public readonly vnavCalculated: ReadonlySubEvent<this, number> = new SubEvent<this, number>();

  protected readonly forceFirstApproachAtConstraint: boolean;

  protected readonly directToLegOffset: number;

  protected getLegConstraintAltitudesFunc: (
    out: [min: number, max: number],
    lateralPlan: FlightPlan,
    lateralLeg: LegDefinition,
    globalLegIndex: number,
    segment: FlightPlanSegment,
    segmentLegIndex: number
  ) => [min: number, max: number] | undefined;

  protected isLegEligibleFunc: (lateralLeg: LegDefinition) => boolean;

  protected shouldUseConstraintFunc: (lateralPlan: FlightPlan, lateralLeg: LegDefinition, globalLegIndex: number, segment: FlightPlanSegment, segmentLegIndex: number) => boolean;

  protected getConstraintAlongTrackOffsetFunc: (
    constraint: UncomputedVNavConstraint,
    constraintIndex: number,
    verticalLeg: UncomputedVNavLeg,
    lateralLeg: LegDefinition,
    verticalPlan: VerticalFlightPlan,
    lateralPlan: FlightPlan
  ) => number;

  protected invalidateClimbConstraintFunc: (
    constraint: UncomputedVNavConstraint,
    index: number,
    constraints: readonly UncomputedVNavConstraint[],
    firstDescentConstraintIndex: number,
    priorMinAltitude: number,
    priorMaxAltitude: number,
  ) => boolean;

  protected invalidateDescentConstraintFunc: (
    constraint: UncomputedVNavConstraint,
    index: number,
    constraints: readonly UncomputedVNavConstraint[],
    priorMinAltitude: number,
    priorMaxAltitude: number,
    requiredFpa: number,
    maxFpa: number
  ) => boolean;

  protected getDescentTargetConstraintAltitudeFunc: (
    constraint: UncomputedVNavConstraint,
    constraintIndex: number,
    verticalLeg: UncomputedVNavLeg,
    lateralLeg: LegDefinition,
    verticalPlan: VerticalFlightPlan,
    lateralPlan: FlightPlan
  ) => number;

  /**
   * A scratch tuple that can hold minimum and maximum constraint altitudes for a flight plan leg, as
   * `[minimum, maximum]` in meters.
   */
  protected readonly legAltitudes: [number, number] = [0, 0];

  /**
   * A scratch tuple that can hold the result of applying descent path values to a sequence of constraints, as
   * `[index, distance]`, where `index` is the index of the constraint at which the path was terminated early, or
   * `undefined` if the path was not terminated early, and `distance` is the total distance of the path, in meters.
   */
  protected readonly applyPathValuesResult: [number | undefined, number] = [undefined, 0];

  /**
   * Creates an instance of SmoothingPathCalculator.
   * @param bus The EventBus to use with this instance.
   * @param flightPlanner The flight planner to use with this instance.
   * @param primaryPlanIndex The primary flight plan index to use to calculate a path from.
   * @param options Options for the calculator.
   */
  constructor(
    protected readonly bus: EventBus,
    protected readonly flightPlanner: FlightPlanner,
    protected readonly primaryPlanIndex: number,
    options?: SmoothingPathCalculatorOptions
  ) {
    this.index = options?.index ?? 0;

    this.flightPathAngle = options?.defaultFpa ?? SmoothingPathCalculator.DEFAULT_DEFAULT_FPA;
    this.minFlightPathAngle = options?.minFpa ?? SmoothingPathCalculator.DEFAULT_MIN_FPA;
    this.maxFlightPathAngle = options?.maxFpa ?? SmoothingPathCalculator.DEFAULT_MAX_FPA;
    this.forceFirstApproachAtConstraint = options?.forceFirstApproachAtConstraint ?? false;
    this.directToLegOffset = options?.directToLegOffset ?? SmoothingPathCalculator.DEFAULT_DIRECT_TO_LEG_OFFSET;
    this.getLegConstraintAltitudesFunc = options?.getLegConstraintAltitudes ?? SmoothingPathCalculator.getLegConstraintAltitudes;
    this.isLegEligibleFunc = options?.isLegEligible ?? SmoothingPathCalculator.isLegVnavEligible;
    this.shouldUseConstraintFunc = options?.shouldUseConstraint ?? (() => true);
    this.getConstraintAlongTrackOffsetFunc = options?.getConstraintAlongTrackOffset ?? SmoothingPathCalculator.getConstraintAlongTrackOffset;
    this.invalidateClimbConstraintFunc = options?.invalidateClimbConstraint ?? SmoothingPathCalculator.invalidateClimbConstraint;
    this.invalidateDescentConstraintFunc = options?.invalidateDescentConstraint ?? SmoothingPathCalculator.invalidateDescentConstraint;
    this.getDescentTargetConstraintAltitudeFunc = options?.getDescentTargetConstraintAltitude ?? SmoothingPathCalculator.getDescentTargetConstraintAltitude;

    this.flightPlanner.onEvent('fplCreated').handle(e => this.createVerticalPlan(e.planIndex));

    this.flightPlanner.onEvent('fplCopied').handle(e => this.onPlanChanged(e.targetPlanIndex));
    this.flightPlanner.onEvent('fplLoaded').handle(e => this.onPlanChanged(e.planIndex));

    this.flightPlanner.onEvent('fplLegChange').handle(e => this.onPlanChanged(e.planIndex, e));

    this.flightPlanner.onEvent('fplSegmentChange').handle(e => this.onPlanChanged(e.planIndex, undefined, e));

    this.flightPlanner.onEvent('fplIndexChanged').handle(e => this.onPlanChanged(e.planIndex));

    this.flightPlanner.onEvent('fplCalculated').handle(e => this.onPlanCalculated(e));

    const vnavTopicSuffix = VNavUtils.getEventBusTopicSuffix(this.index);

    const sub = bus.getSubscriber<VNavControlEvents>();

    sub.on(`vnav_set_default_fpa${vnavTopicSuffix}`).handle(this.setDefaultFpa.bind(this));

    sub.on(`vnav_set_vnav_direct_to${vnavTopicSuffix}`).handle(data => {
      if (data.globalLegIndex < 0) {
        this.cancelVerticalDirect(data.planIndex);
      } else {
        this.activateVerticalDirect(data.planIndex, data.globalLegIndex, data.fpa);
      }
    });
  }

  /** @inheritdoc */
  public getVerticalFlightPlan(planIndex: number): VerticalFlightPlan {
    return this.verticalFlightPlans[planIndex] ??= this.createVerticalPlan(planIndex);
  }

  /** @inheritdoc */
  public createVerticalPlan(planIndex: number): VerticalFlightPlan {
    const verticalFlightPlan: VerticalFlightPlan = {
      planIndex,
      length: 0,
      constraints: [],
      segments: [],
      destLegIndex: undefined,
      fafLegIndex: undefined,
      firstDescentConstraintLegIndex: undefined,
      lastDescentConstraintLegIndex: undefined,
      missedApproachStartIndex: undefined,
      currentAlongLegDistance: undefined,
      verticalDirectIndex: undefined,
      verticalDirectFpa: undefined,
      planChanged: true
    };

    this.verticalFlightPlans[planIndex] = verticalFlightPlan;

    return verticalFlightPlan;
  }

  /** @inheritdoc */
  public requestPathCompute(planIndex: number): boolean {
    if (this.flightPlanner.hasFlightPlan(planIndex) && this.verticalFlightPlans[planIndex] !== undefined) {
      const lateralPlan = this.flightPlanner.getFlightPlan(planIndex);
      const verticalPlan = this.getVerticalFlightPlan(planIndex);

      this.computePathAndNotify(lateralPlan, verticalPlan);

      return true;
    }
    return false;
  }

  /**
   * Gets the index of the VNAV constraint defining the target VNAV altitude for a flight plan leg.
   * @param planIndex The flight plan index.
   * @param globalLegIndex The global index of the flight plan leg.
   * @returns The index of the VNAV constraint defining the target VNAV altitude for a flight plan leg, or `-1` if one
   * could not be found.
   */
  public getTargetConstraintIndex(planIndex: number, globalLegIndex: number): number {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    if (this.getFlightPhase(planIndex) === VerticalFlightPhase.Descent) {
      const currentConstraint = VNavUtils.getPriorConstraintFromLegIndex(verticalPlan, globalLegIndex);
      if (currentConstraint && currentConstraint.nextVnavEligibleLegIndex !== undefined && globalLegIndex < currentConstraint.nextVnavEligibleLegIndex) {
        const priorConstraintIndex = VNavUtils.getPriorConstraintIndexFromLegIndex(verticalPlan, globalLegIndex);
        const priorConstraint = verticalPlan.constraints[priorConstraintIndex];
        if (priorConstraint && priorConstraint.type !== 'climb' && priorConstraint.type !== 'missed') {
          return priorConstraintIndex;
        } else {
          return -1;
        }
      }

      let i = verticalPlan.constraints.length - 1;
      while (i >= 0) {
        const constraint = verticalPlan.constraints[i];
        if (globalLegIndex <= constraint.index && constraint.isTarget && constraint.type !== 'climb' && constraint.type !== 'missed') {
          return i;
        }

        i--;
      }
    } else {
      const currentConstraintIndex = VNavUtils.getConstraintIndexFromLegIndex(verticalPlan, globalLegIndex);
      if (currentConstraintIndex >= 0) {
        const currentConstraint = verticalPlan.constraints[currentConstraintIndex];
        const isMissed = currentConstraint.type === 'missed';

        for (let i = currentConstraintIndex; i >= 0; i--) {
          const constraint = verticalPlan.constraints[i];
          if (constraint.type === 'climb' || (isMissed && constraint.type === 'missed')) {
            if (constraint.maxAltitude < Number.POSITIVE_INFINITY) {
              return i;
            }
          } else {
            return -1;
          }
        }
      }
    }

    return -1;
  }

  /**
   * Gets the VNAV constraint defining the target VNAV altitude for a flight plan leg.
   * @param planIndex The flight plan index.
   * @param globalLegIndex The global index of the flight plan leg.
   * @returns The VNAV constraint defining the target VNAV altitude for a flight plan leg, or `undefined` if one could
   * not be found.
   */
  public getTargetConstraint(planIndex: number, globalLegIndex: number): VNavConstraint | undefined {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);
    return verticalPlan.constraints[this.getTargetConstraintIndex(planIndex, globalLegIndex)];
  }

  /** @inheritdoc */
  public getTargetAltitude(planIndex: number, globalLegIndex: number): number | undefined {
    if (this.getFlightPhase(planIndex) === VerticalFlightPhase.Descent) {
      return this.getTargetConstraint(planIndex, globalLegIndex)?.targetAltitude;
    } else {
      return this.getTargetConstraint(planIndex, globalLegIndex)?.maxAltitude;
    }
  }

  /** @inheritdoc */
  public getFlightPhase(planIndex: number): VerticalFlightPhase {
    if (this.flightPlanner.hasFlightPlan(planIndex)) {
      const lateralPlan = this.flightPlanner.getFlightPlan(planIndex);
      const verticalPlan = this.getVerticalFlightPlan(planIndex);
      const globalLegIndex = VNavUtils.getConstraintLegIndexFromLegIndex(verticalPlan, lateralPlan.activeLateralLeg);
      if (globalLegIndex > -1) {
        const constraint = VNavUtils.getConstraintFromLegIndex(verticalPlan, globalLegIndex);
        switch (constraint?.type) {
          case 'climb':
          case 'missed':
            return VerticalFlightPhase.Climb;
        }
      }
    }
    return VerticalFlightPhase.Descent;
  }

  /** @inheritdoc */
  public getCurrentConstraintAltitude(planIndex: number, globalLegIndex: number): number | undefined {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    const currentConstraint = VNavUtils.getConstraintFromLegIndex(verticalPlan, globalLegIndex);

    if (currentConstraint === undefined) {
      return undefined;
    }

    const priorConstraint = VNavUtils.getPriorConstraintFromLegIndex(verticalPlan, globalLegIndex);

    if (
      currentConstraint.type !== 'climb' && currentConstraint.type !== 'missed'
      && currentConstraint.nextVnavEligibleLegIndex !== undefined
      && globalLegIndex < currentConstraint.nextVnavEligibleLegIndex
    ) {
      return priorConstraint?.targetAltitude;
    } else {
      return currentConstraint.targetAltitude;
    }
  }

  /** @inheritdoc */
  public getCurrentConstraintDetails(planIndex: number, globalLegIndex: number): AltitudeConstraintDetails {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    const currentConstraint = VNavUtils.getConstraintFromLegIndex(verticalPlan, globalLegIndex);

    if (currentConstraint === undefined) {
      return { type: AltitudeRestrictionType.Unused, altitude: 0 };
    }

    const priorConstraint = VNavUtils.getPriorConstraintFromLegIndex(verticalPlan, globalLegIndex);

    if (
      currentConstraint.type !== 'climb' && currentConstraint.type !== 'missed'
      && currentConstraint.nextVnavEligibleLegIndex !== undefined
      && globalLegIndex < currentConstraint.nextVnavEligibleLegIndex
    ) {
      if (priorConstraint) {
        return VNavUtils.getConstraintDetails(priorConstraint, { type: AltitudeRestrictionType.Unused, altitude: 0 });
      } else {
        return { type: AltitudeRestrictionType.Unused, altitude: 0 };
      }
    } else {
      return VNavUtils.getConstraintDetails(currentConstraint, { type: AltitudeRestrictionType.Unused, altitude: 0 });
    }
  }

  /** @inheritdoc */
  public getNextConstraintAltitude(planIndex: number, globalLegIndex: number): number | undefined {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    const currentConstraint = VNavUtils.getConstraintFromLegIndex(verticalPlan, globalLegIndex);
    // added check for climb or descent for smoothing path calc

    if (currentConstraint !== undefined) {

      if (this.getFlightPhase(planIndex) === VerticalFlightPhase.Climb) {
        if (currentConstraint.maxAltitude < Number.POSITIVE_INFINITY) {
          return currentConstraint.maxAltitude;
        } else {
          return currentConstraint.minAltitude;
        }
      } else {
        if (currentConstraint.minAltitude > Number.NEGATIVE_INFINITY) {
          return currentConstraint.minAltitude;
        } else {
          return currentConstraint.maxAltitude;
        }
      }
    }
    return undefined;
  }

  /** @inheritdoc */
  public getNextRestrictionForFlightPhase(planIndex: number, activeLateralLeg: number): VNavConstraint | undefined {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    const currentConstraint = VNavUtils.getConstraintFromLegIndex(verticalPlan, activeLateralLeg);
    if (currentConstraint) {
      const currentConstraintIndex = verticalPlan.constraints.indexOf(currentConstraint);

      if (currentConstraintIndex > -1) {

        if (this.getFlightPhase(planIndex) === VerticalFlightPhase.Climb) {
          for (let i = currentConstraintIndex; i >= 0; i--) {
            const constraint = verticalPlan.constraints[i];
            if (constraint.type === 'climb' || constraint.type === 'missed') {
              if (constraint.minAltitude > Number.NEGATIVE_INFINITY) {
                return constraint;
              }
            } else {
              return undefined;
            }
          }
        } else {
          for (let i = currentConstraintIndex; i >= 0; i--) {
            const constraint = verticalPlan.constraints[i];
            if (constraint.type === 'descent' || constraint.type === 'direct' || constraint.type === 'manual') {
              if (constraint.maxAltitude < Number.POSITIVE_INFINITY) {
                return constraint;
              }
            } else {
              return undefined;
            }
          }
        }
      }
    }

    return undefined;
  }

  /** @inheritdoc */
  public activateVerticalDirect(planIndex: number, constraintGlobalLegIndex: number, fpa?: number): void {
    if (constraintGlobalLegIndex < 0) {
      return;
    }

    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    verticalPlan.verticalDirectIndex = constraintGlobalLegIndex;
    verticalPlan.verticalDirectFpa = fpa ?? this.flightPathAngle;
    const lateralPlan = this.flightPlanner.getFlightPlan(planIndex);
    this.buildVerticalFlightPlanAndNotify(lateralPlan, verticalPlan);
    this.computePathAndNotify(lateralPlan, verticalPlan);
  }

  /**
   * Cancels the existing VNAV direct-to for a vertical flight plan.
   * @param planIndex The index of the vertical flight plan for which to cancel the VNAV direct-to.
   */
  public cancelVerticalDirect(planIndex: number): void {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    if (verticalPlan.verticalDirectIndex === undefined) {
      return;
    }

    verticalPlan.verticalDirectIndex = undefined;
    verticalPlan.verticalDirectFpa = undefined;
    const lateralPlan = this.flightPlanner.getFlightPlan(planIndex);
    this.buildVerticalFlightPlanAndNotify(lateralPlan, verticalPlan);
    this.computePathAndNotify(lateralPlan, verticalPlan);
  }

  /**
   * Sets this calculator's default flight path angle.
   * @param fpa The new default flight path angle, in degrees. Increasingly positive values indicate steeper descents.
   */
  protected setDefaultFpa(fpa: number): void {
    const newFpa = Math.max(0, fpa);

    if (newFpa !== this.flightPathAngle) {
      this.flightPathAngle = newFpa;

      for (let i = 0; i < this.verticalFlightPlans.length; i++) {
        const lateralPlan = this.flightPlanner.hasFlightPlan(i) ? this.flightPlanner.getFlightPlan(i) : undefined;
        const verticalPlan = this.verticalFlightPlans[i];
        if (lateralPlan && verticalPlan) {
          this.computePathAndNotify(lateralPlan, verticalPlan);
        }
      }
    }
  }

  /**
   * Sets planChanged to true to flag that a plan change has been received over the bus.
   * @param planIndex The Plan Index that changed.
   * @param legChangeEvent The FlightPlanLegEvent, if any.
   * @param segmentChangeEvent The FlightPlanSegmentEvent, if any.
   */
  protected onPlanChanged(planIndex: number, legChangeEvent?: FlightPlanLegEvent, segmentChangeEvent?: FlightPlanSegmentEvent): void {

    const plan = this.flightPlanner.getFlightPlan(planIndex);
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    if (verticalPlan.verticalDirectIndex !== undefined) {
      if (legChangeEvent !== undefined) {
        const globalIndex = plan.getSegment(legChangeEvent.segmentIndex).offset + legChangeEvent.legIndex;
        if (globalIndex <= verticalPlan.verticalDirectIndex) {
          verticalPlan.verticalDirectIndex = undefined;
        }
      } else if (segmentChangeEvent !== undefined) {
        const verticalDirectSegmentIndex = plan.getSegmentIndex(verticalPlan.verticalDirectIndex);
        if (segmentChangeEvent.segmentIndex <= verticalDirectSegmentIndex) {
          verticalPlan.verticalDirectIndex = undefined;
        }
      }
    }

    verticalPlan.planChanged = true;
    verticalPlan.currentAlongLegDistance = undefined;
  }

  /**
   * Method fired on a flight plan change event to rebuild the vertical path.
   * @param event The Flight Plan Calculated Event
   */
  protected onPlanCalculated(event: FlightPlanCalculatedEvent): void {
    this.buildVerticalFlightPlanAndComputeAndNotify(event.planIndex);
  }

  /**
   * Builds a vertical flight plan if its corresponding lateral flight plan has been changed since the last rebuild,
   * then computes the vertical path sends events notifying subscribers that the plan was built and calculated.
   * @param planIndex The index of the plan to build and compute.
   */
  protected buildVerticalFlightPlanAndComputeAndNotify(planIndex: number): void {
    const lateralPlan = this.flightPlanner.getFlightPlan(planIndex);
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    if (verticalPlan.planChanged) {
      this.buildVerticalFlightPlanAndNotify(lateralPlan, verticalPlan);
    }

    this.computePathAndNotify(lateralPlan, verticalPlan);
  }

  /**
   * Sends an event notifying subscribers that a vertical flight plan was built or rebuilt.
   * @param planIndex The index of the plan that was built.
   */
  protected notifyBuilt(planIndex: number): void {
    (this.planBuilt as SubEvent<this, number>).notify(this, planIndex);
  }

  /**
   * Sends an event notifying subscribers that a vertical flight plan was calculated.
   * @param planIndex The index of the plan that was calculated.
   */
  protected notifyCalculated(planIndex: number): void {
    (this.vnavCalculated as SubEvent<this, number>).notify(this, planIndex);
  }

  /**
   * Builds a vertical flight plan from a lateral flight plan and sends an event notifying subscribers that the plan
   * was built.
   * @param lateralPlan The lateral flight plan.
   * @param verticalPlan The vertical flight plan to build.
   */
  protected buildVerticalFlightPlanAndNotify(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {
    this.buildVerticalFlightPlan(lateralPlan, verticalPlan);
    this.notifyBuilt(verticalPlan.planIndex);
  }

  /**
   * Builds a vertical flight plan from a lateral flight plan.
   * @param lateralPlan The lateral flight plan.
   * @param verticalPlan The vertical flight plan to build.
   */
  protected buildVerticalFlightPlan(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {
    this.buildVerticalLegsAndConstraints(lateralPlan, verticalPlan);
    SmoothingPathCalculator.handleDirectToLegInVerticalPlan(lateralPlan, verticalPlan, this.directToLegOffset);
    verticalPlan.planChanged = false;
  }

  /**
   * Resets the Vertical Flight Plan, populates the vertical segments and legs, finds and builds the vertical constraints.
   * @param lateralPlan The Lateral Flight Plan.
   * @param verticalPlan The Vertical Flight Plan.
   */
  protected buildVerticalLegsAndConstraints(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {

    // Reset the constraints array.
    verticalPlan.constraints.length = 0;
    // Reset the segments array.
    verticalPlan.segments.length = 0;
    verticalPlan.destLegIndex = undefined;
    verticalPlan.firstDescentConstraintLegIndex = undefined;
    verticalPlan.lastDescentConstraintLegIndex = undefined;
    verticalPlan.missedApproachStartIndex = undefined;

    // Find the FAF in the lateral plan, if any.
    verticalPlan.fafLegIndex = VNavUtils.getFafIndex(lateralPlan);

    const directToTargetLegIndex = SmoothingPathCalculator.getDirectToTargetLegIndex(lateralPlan);

    let firstApproachGlobalLegIndex;

    // Iterate forward through the lateral plan to build the constraints
    for (const segment of lateralPlan.segments()) {
      // Add the plan segments to the VNav Path Calculator Segments
      verticalPlan.segments[segment.segmentIndex] = {
        offset: segment.offset,
        legs: []
      };

      if (segment.segmentType === FlightPlanSegmentType.Approach && firstApproachGlobalLegIndex === undefined) {
        firstApproachGlobalLegIndex = segment.offset;
      }

      for (let segmentLegIndex = 0; segmentLegIndex < segment.legs.length; segmentLegIndex++) {
        const globalLegIndex = segment.offset + segmentLegIndex;
        const lateralLeg = segment.legs[segmentLegIndex];
        const verticalLeg = VNavUtils.createLeg(segment.segmentIndex, segmentLegIndex, lateralLeg.name ?? '', lateralLeg.calculated?.distanceWithTransitions ?? undefined);

        // Check if the leg is part of the missed approach, and set the missed approach start index.
        if (
          verticalPlan.missedApproachStartIndex === undefined
          && segment.segmentType === FlightPlanSegmentType.Approach
          && BitFlags.isAll(lateralLeg.flags, LegDefinitionFlags.MissedApproach)
        ) {
          verticalPlan.missedApproachStartIndex = globalLegIndex;
        }

        const constraintAltitudes = this.getLegConstraintAltitudesFunc(this.legAltitudes, lateralPlan, lateralLeg, globalLegIndex, segment, segmentLegIndex);

        verticalLeg.isEligible = this.isLegEligibleFunc(lateralLeg);

        verticalLeg.distance = lateralLeg.calculated?.distanceWithTransitions ?? 0;

        // Check if the leg precedes a defined vertical direct for this vertical flight plan.
        const legPrecedesVerticalDirectIndex = verticalPlan.verticalDirectIndex !== undefined && globalLegIndex < verticalPlan.verticalDirectIndex;

        const legPrecedesDirectTo = directToTargetLegIndex !== undefined && globalLegIndex < directToTargetLegIndex + this.directToLegOffset;

        if (
          constraintAltitudes !== undefined
          && !legPrecedesVerticalDirectIndex
          && !legPrecedesDirectTo
          && this.shouldUseConstraintFunc(lateralPlan, lateralLeg, globalLegIndex, segment, segmentLegIndex)
        ) {
          verticalLeg.isUserDefined = VNavUtils.isUserConstraint(lateralLeg);

          const verticalConstraint = this.buildConstraint(verticalPlan, globalLegIndex, lateralLeg, constraintAltitudes, verticalLeg.name);

          // Add the new vertical constraint to the array of constraints in reverse order.
          verticalPlan.constraints.unshift(verticalConstraint);
        }

        // Add the new vertical leg to the vertical flight plan
        verticalPlan.segments[segment.segmentIndex].legs.push(verticalLeg);
      }
    }

    verticalPlan.length = lateralPlan.length;

    if (this.forceFirstApproachAtConstraint && firstApproachGlobalLegIndex !== undefined) {
      const firstApproachConstraint = VNavUtils.getConstraintFromLegIndex(
        verticalPlan,
        directToTargetLegIndex === firstApproachGlobalLegIndex ? directToTargetLegIndex + 3 : firstApproachGlobalLegIndex
      );

      if (firstApproachConstraint && firstApproachConstraint.type !== 'climb' && firstApproachConstraint.type !== 'missed') {
        SmoothingPathCalculator.forceAtConstraint(firstApproachConstraint);
      }
    }

    verticalPlan.firstDescentConstraintLegIndex = verticalPlan.constraints[VNavUtils.getFirstDescentConstraintIndex(verticalPlan)]?.index;
    verticalPlan.lastDescentConstraintLegIndex = verticalPlan.constraints[VNavUtils.getLastDescentConstraintIndex(verticalPlan)]?.index;
  }

  /**
   * Builds a VNAV constraint for a lateral flight plan leg.
   * @param verticalPlan The vertical flight plan.
   * @param globalLegIndex The global index of the lateral flight plan leg for which to build the constraint.
   * @param lateralLeg The lateral flight plan leg for which to build the constraint.
   * @param constraintAltitudes The constraint altitudes, as `[minimum_altitude, maximum_altitude]`.
   * @param name The name of the new constraint.
   * @returns A new VNAV constraint for the specified lateral flight plan leg.
   */
  protected buildConstraint(
    verticalPlan: VerticalFlightPlan,
    globalLegIndex: number,
    lateralLeg: LegDefinition,
    constraintAltitudes: [number, number],
    name: string
  ): VNavConstraint {
    const constraint = VNavUtils.createConstraint(
      globalLegIndex,
      constraintAltitudes[0],
      constraintAltitudes[1],
      name,
      BitFlags.isAll(lateralLeg.flags, LegDefinitionFlags.MissedApproach) ? 'missed' : lateralLeg.verticalData.phase === VerticalFlightPhase.Descent ? 'descent' : 'climb'
    );

    constraint.isBeyondFaf = verticalPlan.fafLegIndex === undefined ? false : globalLegIndex > verticalPlan.fafLegIndex;

    // Check if this constraint is a vertical direct.
    if (verticalPlan.verticalDirectIndex === globalLegIndex) {
      constraint.fpa = verticalPlan.verticalDirectFpa ?? this.flightPathAngle;
      constraint.type = 'direct';
    }

    const userFpa = lateralLeg.verticalData.fpa;

    if (userFpa !== undefined && constraint.type !== 'climb' && constraint.type !== 'missed') {
      constraint.fpa = userFpa;
      constraint.type = 'manual';
    }

    return constraint;
  }

  /**
   * Computes the vertical path for a flight plan and sends an event notifying subscribers that the plan was
   * calculated.
   * @param lateralPlan The lateral flight plan for which to compute a path.
   * @param verticalPlan The vertical flight plan for which to compute a path.
   */
  protected computePathAndNotify(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {
    this.computePath(lateralPlan, verticalPlan);
    this.notifyCalculated(lateralPlan.planIndex);
  }

  /**
   * Computes the vertical path for a flight plan.
   * @param lateralPlan The lateral flight plan for which to compute a path.
   * @param verticalPlan The vertical flight plan for which to compute a path.
   */
  protected computePath(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {
    this.computeDescentPath(lateralPlan, verticalPlan);
  }

  /**
   * Computes the descent path for a flight plan.
   * @param lateralPlan The lateral flight plan for which to compute a path.
   * @param verticalPlan The vertical flight plan for which to compute a path.
   */
  protected computeDescentPath(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {

    this.fillLegDistances(lateralPlan, verticalPlan);

    // Updated leg distances could cause some invalidated constraints to become valid, so we will re-insert all
    // invalidated constraints and filter them again.
    this.reinsertInvalidConstraints(verticalPlan, lateralPlan);

    this.refreshConstraintAlongTrackOffsets(lateralPlan, verticalPlan);

    this.findAndRemoveInvalidConstraints(verticalPlan);

    if (verticalPlan.constraints.length < 1) {
      return;
    }

    this.populateConstraints(verticalPlan);

    if (this.computeFlightPathAngles(verticalPlan)) {
      this.computeLegAltitudes(lateralPlan, verticalPlan);

      for (let constraintIndex = 0; constraintIndex < verticalPlan.constraints.length; constraintIndex++) {
        const constraint = verticalPlan.constraints[constraintIndex];

        let isDescent = false;
        let constraintIsBod = false;

        if (constraint.type === 'descent' || constraint.type === 'direct' || constraint.type === 'manual') {
          isDescent = true;
          constraintIsBod = true;

          // Check to see if the current constraint is not considered a BOD constraint. A constraint is not BOD if and
          // only if there is a following constraint (in flight plan order) that is not a climb constraint and is
          // path-eligible, and one of the following is true:
          // - the following constraint is not flat (has FPA > 0) and the computed vertical path to the following
          // constraint is not above the path ending at the current constraint at the location of the current
          // constraint (with a 25-meter margin).
          // - the current constraint is flat (has FPA = 0).
          if (constraintIndex > 0) {
            const followingConstraint = verticalPlan.constraints[constraintIndex - 1];
            if (
              followingConstraint.type !== 'climb'
              && followingConstraint.type !== 'missed'
              && followingConstraint.nextVnavEligibleLegIndex === undefined
            ) {
              const constraintAltForDist = followingConstraint.targetAltitude + VNavUtils.altitudeForDistance(followingConstraint.fpa, followingConstraint.distance);
              if ((followingConstraint.fpa > 0 && constraintAltForDist <= constraint.targetAltitude + 25) || constraint.fpa === 0) {
                constraintIsBod = false;
              }
            }
          }

          if (constraint.isPathEnd) {
            constraintIsBod = true;
          }
        }

        for (let legIndex = 0; legIndex < constraint.legs.length; legIndex++) {
          const leg = constraint.legs[legIndex];

          leg.fpa = constraint.fpa;

          if (isDescent && legIndex === 0) {
            leg.isAdvisory = false;
          } else {
            leg.isAdvisory = true;
          }

          if (legIndex === 0 && constraint.isTarget && constraintIsBod) {
            leg.isBod = true;
          } else {
            leg.isBod = false;
          }
        }
      }

      // Iterate through all legs that are not part of a constraint (i.e. all legs that are past the leg hosting the
      // last constraint in the flight plan) and reset the fpa, isAdvisory, and isBod flags.

      const lastConstraintLegIndex = verticalPlan.constraints[0]?.index ?? -1;
      outer: for (let segmentIndex = verticalPlan.segments.length - 1; segmentIndex >= 0; segmentIndex--) {
        const segment = verticalPlan.segments[segmentIndex];
        if (segment) {
          for (let segmentLegIndex = segment.legs.length - 1; segmentLegIndex >= 0; segmentLegIndex--) {
            const globalLegIndex = segment.offset + segmentLegIndex;

            if (globalLegIndex <= lastConstraintLegIndex) {
              break outer;
            }

            const leg = segment.legs[segmentLegIndex];
            leg.fpa = 0;
            leg.isAdvisory = true;
            leg.isBod = false;
          }
        }
      }
    }
  }

  /**
   * Fills the distance properties of all legs in a vertical flight plan.
   * @param lateralPlan The lateral flight plan associated with the vertical flight plan for which to fill leg
   * distances.
   * @param verticalPlan The vertical flight plan for which to fill leg distances.
   */
  protected fillLegDistances(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {
    if (lateralPlan.length > 0) {
      for (const segment of lateralPlan.segments()) {
        if (segment) {
          const vnavSegment = verticalPlan.segments[segment.segmentIndex];
          for (let l = 0; l < segment.legs.length; l++) {
            const leg = segment.legs[l];
            if (leg && leg.calculated && leg.calculated.distanceWithTransitions) {
              vnavSegment.legs[l].distance = leg.calculated.distanceWithTransitions;
            } else if (leg && leg.calculated && leg.calculated.endLat !== undefined && leg.calculated.endLon !== undefined) {
              let prevLeg;
              for (const checkLeg of lateralPlan.legs(true, segment.offset + l - 1)) {
                if (checkLeg.calculated?.endLat !== undefined && checkLeg.calculated?.endLon !== undefined) {
                  prevLeg = checkLeg;
                  break;
                }
              }
              if (prevLeg?.calculated?.endLat && prevLeg.calculated.endLon) {
                vnavSegment.legs[l].distance = UnitType.GA_RADIAN.convertTo(
                  GeoPoint.distance(leg.calculated.endLat, leg.calculated.endLon, prevLeg.calculated.endLat, prevLeg.calculated.endLon),
                  UnitType.METER);
              }
            } else {
              vnavSegment.legs[l].distance = 0;
            }
          }
        }
      }
    }
  }

  /**
   * Finds and removes invalid constraints from the vertical plan.
   * @param verticalPlan The Vertical Flight Plan.
   */
  protected findAndRemoveInvalidConstraints(verticalPlan: VerticalFlightPlan): void {
    let firstDescentConstraintIndex = verticalPlan.firstDescentConstraintLegIndex === undefined
      ? -1
      : VNavUtils.getConstraintIndexFromLegIndex(verticalPlan, verticalPlan.firstDescentConstraintLegIndex);

    // If there is a vertical direct-to active (and it has not been invalidated), skip all constraints prior to the
    // direct-to.
    const startIndex = verticalPlan.constraints[firstDescentConstraintIndex]?.type === 'direct'
      ? firstDescentConstraintIndex
      : verticalPlan.constraints.length - 1;

    let phase: 'climb' | 'descent' | 'missed' = 'climb';
    let priorMinAltitude = -Infinity;
    let priorMaxAltitude = Infinity;
    let distanceFromPriorMinAltitude = 0;
    let requiredFpa = 0;

    for (let constraintIndex = startIndex; constraintIndex >= 0; constraintIndex--) {
      const currentConstraint = verticalPlan.constraints[constraintIndex];
      const currentConstraintDistance = VNavUtils.getConstraintDistanceWithOffsetsFromLegs(verticalPlan, constraintIndex, constraintIndex + 1);

      let currentPhase: 'climb' | 'descent' | 'missed';
      switch (currentConstraint.type) {
        case 'climb':
        case 'missed':
          currentPhase = currentConstraint.type;
          break;
        default:
          currentPhase = 'descent';
      }

      if (currentPhase !== phase) {
        // Reset prior altitudes when switching phases.
        phase = currentPhase;
        priorMinAltitude = -Infinity;
        priorMaxAltitude = Infinity;
        distanceFromPriorMinAltitude = currentConstraintDistance;
      } else {
        distanceFromPriorMinAltitude += currentConstraintDistance;
      }

      let isDescentConstraint: boolean;
      let shouldInvalidate: boolean;
      switch (phase) {
        case 'climb':
        case 'missed':
          isDescentConstraint = false;

          // Invalidate the constraint if the constraint is located before the prior constraint or if the configuration
          // tells us to invalidate it.
          shouldInvalidate = currentConstraintDistance < 0
            || this.invalidateClimbConstraintFunc(
              currentConstraint,
              constraintIndex,
              verticalPlan.constraints,
              firstDescentConstraintIndex,
              priorMinAltitude,
              priorMaxAltitude
            );
          break;
        default:
          isDescentConstraint = true;

          if (isFinite(priorMinAltitude) && isFinite(currentConstraint.maxAltitude)) {
            requiredFpa = Math.max(0, -VNavUtils.getFpa(distanceFromPriorMinAltitude, currentConstraint.maxAltitude - priorMinAltitude));
          } else {
            requiredFpa = 0;
          }

          // Invalidate the constraint if the constraint is located before the prior constraint or if the configuration
          // tells us to invalidate it.
          shouldInvalidate = currentConstraintDistance < 0
            || this.invalidateDescentConstraintFunc(
              currentConstraint,
              constraintIndex,
              verticalPlan.constraints,
              priorMinAltitude,
              priorMaxAltitude,
              requiredFpa,
              this.maxFlightPathAngle
            );
      }

      const constraintLeg = VNavUtils.getVerticalLegFromPlan(verticalPlan, currentConstraint.index);

      if (shouldInvalidate) {
        constraintLeg.invalidConstraintAltitude = currentConstraint.minAltitude !== Number.NEGATIVE_INFINITY ? currentConstraint.minAltitude : currentConstraint.maxAltitude;
        verticalPlan.constraints.splice(constraintIndex, 1);
        // Need to subtract current constraint distance because it will get added again at the beginning of the next iteration.
        // (The next constraint inherits the legs that belonged to the current constraint after it is removed.)
        distanceFromPriorMinAltitude -= currentConstraintDistance;

        // If we invalidated the first descent constraint, we need to find the new one.
        if (isDescentConstraint && constraintIndex === firstDescentConstraintIndex) {
          firstDescentConstraintIndex = VNavUtils.getFirstDescentConstraintIndex(verticalPlan);
          verticalPlan.firstDescentConstraintLegIndex = verticalPlan.constraints[firstDescentConstraintIndex]?.index;
        }
      } else {
        constraintLeg.invalidConstraintAltitude = undefined;

        if (isFinite(currentConstraint.minAltitude)) {
          priorMinAltitude = currentConstraint.minAltitude;
          distanceFromPriorMinAltitude = 0;
        }

        if (isFinite(currentConstraint.maxAltitude)) {
          priorMaxAltitude = currentConstraint.maxAltitude;
        }
      }
    }

    // Update last descent leg in case we invalidated some descent constraints
    verticalPlan.lastDescentConstraintLegIndex = verticalPlan.constraints[VNavUtils.getLastDescentConstraintIndex(verticalPlan)]?.index;
  }

  /**
   * Finds previously invalidated constraints and re-inserts them into the vertical flight plan.
   * @param verticalPlan The Vertical Flight Plan.
   * @param lateralPlan The Lateral Flight Plan.
   */
  protected reinsertInvalidConstraints(verticalPlan: VerticalFlightPlan, lateralPlan: FlightPlan): void {
    const firstDescentConstraintIndex = verticalPlan.firstDescentConstraintLegIndex === undefined
      ? -1
      : VNavUtils.getConstraintIndexFromLegIndex(verticalPlan, verticalPlan.firstDescentConstraintLegIndex);

    // If there is a vertical direct-to active (and it has not been invalidated), skip all legs prior to and including
    // the direct-to.
    const startIndex = verticalPlan.constraints[firstDescentConstraintIndex]?.type === 'direct'
      ? (verticalPlan.firstDescentConstraintLegIndex as number + 1)
      : 0;

    lateralPlan.forEachLeg(
      (lateralLeg, lateralSegment, segmentIndex, segmentLegIndex) => {
        const verticalLeg = verticalPlan.segments[segmentIndex].legs[segmentLegIndex];
        if (verticalLeg.invalidConstraintAltitude !== undefined) {
          const globalLegIndex = lateralSegment.offset + segmentLegIndex;

          const constraintIndex = VNavUtils.getConstraintIndexFromLegIndex(verticalPlan, globalLegIndex);
          const constraintAltitudes = this.getLegConstraintAltitudesFunc(this.legAltitudes, lateralPlan, lateralLeg, globalLegIndex, lateralSegment, segmentLegIndex);
          if (constraintAltitudes !== undefined) {
            const proposedConstraint = this.buildConstraint(verticalPlan, globalLegIndex, lateralLeg, constraintAltitudes, verticalLeg.name);
            verticalPlan.constraints.splice(constraintIndex + 1, 0, proposedConstraint);

            // If we re-validated a descent constraint, we need to update the first/last descent constraint when appropriate.
            if (
              proposedConstraint.type === 'descent'
              || proposedConstraint.type === 'manual'
              || proposedConstraint.type === 'direct'
              || proposedConstraint.type === 'dest'
            ) {
              if (verticalPlan.firstDescentConstraintLegIndex === undefined || globalLegIndex < verticalPlan.firstDescentConstraintLegIndex) {
                verticalPlan.firstDescentConstraintLegIndex = globalLegIndex;
              }
              if (verticalPlan.lastDescentConstraintLegIndex === undefined || globalLegIndex > verticalPlan.lastDescentConstraintLegIndex) {
                verticalPlan.lastDescentConstraintLegIndex = globalLegIndex;
              }
            }
          }
        }
      },
      false,
      startIndex
    );
  }

  /**
   * Refreshes the along-track offsets to use for all constraints in a vertical flight plan.
   * @param lateralPlan The lateral flight plan associated with the vertical flight plan containing the constraints to
   * refresh.
   * @param verticalPlan The vertical flight plan containing the constraints to refresh.
   */
  protected refreshConstraintAlongTrackOffsets(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {
    for (let constraintIndex = verticalPlan.constraints.length - 1; constraintIndex >= 0; constraintIndex--) {
      const constraint = verticalPlan.constraints[constraintIndex];
      const verticalLeg = VNavUtils.getVerticalLegFromPlan(verticalPlan, constraint.index);
      constraint.alongTrackOffset = this.getConstraintAlongTrackOffsetFunc(
        constraint,
        constraintIndex,
        verticalLeg,
        lateralPlan.getLeg(verticalLeg.segmentIndex, verticalLeg.legIndex),
        verticalPlan,
        lateralPlan
      );
    }
  }

  /**
   * Populates a vertical flight plan's constraints with legs, updates the constraint distances and VNAV path
   * eligibility data, and resets the constraint path and FPA data.
   * @param verticalPlan The vertical flight plan for which to populate constraints.
   */
  protected populateConstraints(verticalPlan: VerticalFlightPlan): void {
    for (let constraintIndex = 0; constraintIndex < verticalPlan.constraints.length; constraintIndex++) {
      const constraint = verticalPlan.constraints[constraintIndex];
      const previousConstraint = verticalPlan.constraints[constraintIndex + 1];

      constraint.isPathEnd = false;
      constraint.isTarget = false;

      // Do not reset the FPAs of direct and manual constraints. FPAs for these constraints are written at the time of
      // constraint creation and should never be changed.
      if (constraint.type !== 'direct' && constraint.type !== 'manual') {
        constraint.fpa = 0;
      }

      constraint.targetAltitude = 0;

      constraint.legs.length = 0;

      let eligibleLegIndex = constraint.index + 1;
      let ineligibleLegIndex: number | undefined;

      const endLegIndex = previousConstraint !== undefined ? previousConstraint.index : -1;
      for (let globalLegIndex = constraint.index; globalLegIndex > endLegIndex; globalLegIndex--) {
        const verticalLeg = VNavUtils.getVerticalLegFromPlan(verticalPlan, globalLegIndex);
        constraint.legs.push(verticalLeg);

        if (ineligibleLegIndex === undefined && verticalLeg.isEligible) {
          eligibleLegIndex = globalLegIndex;
        }

        if (ineligibleLegIndex === undefined && !verticalLeg.isEligible) {
          ineligibleLegIndex = globalLegIndex;
        }
      }

      if (ineligibleLegIndex !== undefined) {
        constraint.nextVnavEligibleLegIndex = eligibleLegIndex;
      }

      this.refreshConstraintLocation(verticalPlan, constraintIndex);
      this.refreshConstraintDistance(verticalPlan, constraintIndex);
    }
  }

  /**
   * Refreshes the location of a VNAV constraint based on its along-track offset.
   * @param verticalPlan The vertical flight plan containing the constraint to refresh.
   * @param constraintIndex The index of the constraint to refresh.
   */
  protected refreshConstraintLocation(verticalPlan: VerticalFlightPlan, constraintIndex: number): void {
    const constraint = verticalPlan.constraints[constraintIndex];

    let constraintLegIndex = constraint.index;
    let constraintDistanceToLegEnd = -(constraint.alongTrackOffset ?? 0);

    if (constraintDistanceToLegEnd === 0) {
      constraint.containingLegIndex = undefined;
      constraint.containingLegDistanceToEnd = undefined;
      return;
    }

    if (constraintDistanceToLegEnd < 0) {
      // The constraint is past the end of the constraint leg. We need to iterate forward through the flight plan to
      // find the leg that contains the constraint.

      let legIndex = constraintLegIndex + 1;
      for (const leg of VNavUtils.planLegs(verticalPlan, false, legIndex)) {
        constraintLegIndex = legIndex;

        constraintDistanceToLegEnd += leg.distance;
        if (constraintDistanceToLegEnd >= 0) {
          // The constraint is located within the current leg. We are done with the iteration.
          break;
        }

        ++legIndex;
      }
    } else {
      // The constraint is prior to the end of the constraint leg. We need to iterate backward through the flight plan
      // to find the leg that contains the constraint.

      let legIndex = constraintLegIndex;
      for (const leg of VNavUtils.planLegs(verticalPlan, true, legIndex)) {
        constraintLegIndex = legIndex;

        if (constraintDistanceToLegEnd <= leg.distance) {
          // The constraint is located within the current leg. We are done with the iteration.
          break;
        } else {
          constraintDistanceToLegEnd -= leg.distance;
        }

        --legIndex;
      }
    }

    constraint.containingLegIndex = constraintLegIndex;
    constraint.containingLegDistanceToEnd = constraintDistanceToLegEnd;
  }

  /**
   * Refreshes the distance property of a VNAV constraint based on the distances of the legs contained in the
   * constraint's leg array, the constraint's along-track offset, and the along-track offset of the prior constraint
   * (if one exists).
   * @param verticalPlan The vertical flight plan containing the constraint to refresh.
   * @param constraintIndex The index of the constraint to refresh.
   */
  protected refreshConstraintDistance(verticalPlan: VerticalFlightPlan, constraintIndex: number): void {
    const constraint = verticalPlan.constraints[constraintIndex];
    const priorConstraint = verticalPlan.constraints[constraintIndex + 1] as VNavConstraint | undefined;

    let distance = 0;

    if (priorConstraint) {
      distance -= priorConstraint.alongTrackOffset ?? 0;
    }

    for (let i = constraint.legs.length - 1; i >= 0; i--) {
      distance += constraint.legs[i].distance;
    }

    distance += constraint.alongTrackOffset ?? 0;

    constraint.distance = distance;
  }

  private readonly _descentPathRequiredFpas: number[] = [];

  /**
   * Computes the flight path angles for each constraint segment.
   * @param verticalPlan The Vertical Flight Plan.
   * @returns Whether the flight path angles were computed.
   */
  protected computeFlightPathAngles(verticalPlan: VerticalFlightPlan): boolean {
    // TODO: pass in the lateral plan as an argument instead of getting it from the planner when it's acceptable to
    // break backward compatibility.
    const lateralPlan = this.flightPlanner.getFlightPlan(verticalPlan.planIndex);

    // Iterate through all descent constraints in reverse flight plan order and attempt to assign one as an anchor
    // constraint. An anchor constraint has a known target altitude and anchors a constant-FPA path connecting it to
    // one or more prior constraints (in flight plan order). Once an anchor constraint is found, we will attempt to
    // build a constant-FPA path backwards from the anchor constraint as far as possible until we encounter a
    // constraint that prevents us from extending the path any farther. At that point, we will designate a new anchor
    // constraint and repeat the process until we run out of constraints.

    // The overall goal is to produce a descent path with the following properties (roughly in order of decreasing
    // priority):
    // - The flight path angle always remains within the limits set by the minimum and maximum FPAs (with an exception
    //   for flat segments).
    // - The path does not violate any descent constraints.
    // - When the flight path angle of the path terminating at a constraint is fixed (i.e. by a manual or direct
    //   constraint), the fixed FPA is extended forward through the flight path for as long as possible without
    //   violating any constraints.
    // - The number of level-offs (where the flight path angle transitions from non-zero to zero) is minimized.
    // - Where the flight path is descending (i.e. not flat) and the flight path angle is not fixed, the FPA remains as
    //   close to the default FPA as possible for as long as possible.

    let currentAnchorConstraint: VNavConstraint | undefined;

    const firstDescentConstraintIndex = verticalPlan.firstDescentConstraintLegIndex === undefined
      ? -1
      : VNavUtils.getConstraintIndexFromLegIndex(verticalPlan, verticalPlan.firstDescentConstraintLegIndex);
    const lastDescentConstraintIndex = verticalPlan.lastDescentConstraintLegIndex === undefined
      ? -1
      : VNavUtils.getConstraintIndexFromLegIndex(verticalPlan, verticalPlan.lastDescentConstraintLegIndex);

    if (firstDescentConstraintIndex < 0 || lastDescentConstraintIndex < 0) {
      // There are no descent constraints, so no FPAs to be calculated
      return false;
    }

    let anchorConstraintIndex = lastDescentConstraintIndex;
    let hasFoundPathEndConstraint = false;

    while (anchorConstraintIndex <= firstDescentConstraintIndex) {
      const constraint = verticalPlan.constraints[anchorConstraintIndex];

      // If the current constraint is climb or missed, skip it.
      if (constraint.type === 'climb' || constraint.type === 'missed') {
        continue;
      }

      // If we haven't found an anchor constraint yet, then attempt to make the current constraint the anchor
      // constraint if it defines either a minimum or maximum altitude. If the current constraint has neither a minimum
      // nor maximum altitude (which should technically never happen), skip it.
      if (!currentAnchorConstraint) {
        if (constraint.minAltitude > Number.NEGATIVE_INFINITY || constraint.maxAltitude < Number.POSITIVE_INFINITY) {
          currentAnchorConstraint = constraint;
          currentAnchorConstraint.targetAltitude = this.getDescentTargetConstraintAltitude(
            constraint,
            anchorConstraintIndex,
            constraint.legs[0],
            lateralPlan.getLeg(constraint.legs[0].segmentIndex, constraint.legs[0].legIndex),
            verticalPlan,
            lateralPlan
          );

          if (!hasFoundPathEndConstraint) {
            currentAnchorConstraint.isPathEnd = true;
            hasFoundPathEndConstraint = true;
          }
        } else {
          ++anchorConstraintIndex;
          continue;
        }
      }

      const currentAnchorConstraintIsFirstDescentConstraint = anchorConstraintIndex === firstDescentConstraintIndex;

      if (currentAnchorConstraintIsFirstDescentConstraint) {

        if (currentAnchorConstraint.type === 'descent') {
          // If this is the first descent constraint and it is not a direct or manual, set the FPA to the default
          // value. We don't set the FPA of direct or manual constraints because FPAs on those constraints will have
          // already been set when the constraints were created.
          currentAnchorConstraint.fpa = this.flightPathAngle;
        }

        currentAnchorConstraint.isTarget = this.isDescentConstraintTarget(verticalPlan, anchorConstraintIndex, lastDescentConstraintIndex);

        // If the current anchor constraint is the first descent constraint, then we're done with this method since
        // there are no more constraints to compute.
        return true;
      }

      const currentAnchorConstraintHasFixedFpa = currentAnchorConstraint.type === 'manual' || currentAnchorConstraint.type === 'direct';

      // Find the lookahead constraint for the current anchor constraint. The lookahead constraint is the closest
      // descent constraint equal to or prior to the anchor constraint (in flight plan order) that meets at least one
      // of the following criteria:
      // - The constraint is the first descent constraint in the flight plan.
      // - The constraint is a direct constraint.
      // - The constraint has a manual flight path angle.
      // - The constraint immediately follows (in flight plan order) a non-descent constraint.
      // - The constraint contains at least one path-ineligible leg.
      // - The constraint is at the faf (final approach fix).
      // - The constraint's minimum and maximum altitudes are the same (only if the current anchor constraint does not
      //   have a fixed FPA).

      // The lookahead constraint is effectively the closest constraint to the current anchor constraint that must be
      // designated as a target constraint or where the flight path angle of the descent path is either forced to
      // change or allowed to change in order to optimize the smoothed path.

      let lookaheadConstraintIndex = anchorConstraintIndex;
      let isLookaheadConstraintPathStart = false;
      let isLookaheadConstraintFpaFixed = currentAnchorConstraintHasFixedFpa;
      let distanceFromAnchorConstraintToLookahead = 0;

      let currentDistanceFromAnchorConstraint = currentAnchorConstraint.distance;

      for (let currentConstraintIndex = anchorConstraintIndex + 1; currentConstraintIndex <= firstDescentConstraintIndex; currentConstraintIndex++) {
        const currentConstraint = verticalPlan.constraints[currentConstraintIndex];
        const isCurrentContraintFpaFixed = currentConstraint.type === 'direct' || currentConstraint.type === 'manual';

        if (currentConstraintIndex === firstDescentConstraintIndex) {
          lookaheadConstraintIndex = currentConstraintIndex;
          isLookaheadConstraintPathStart = true;
          isLookaheadConstraintFpaFixed = isCurrentContraintFpaFixed;
          distanceFromAnchorConstraintToLookahead = currentDistanceFromAnchorConstraint;
          break;
        }

        if (isCurrentContraintFpaFixed) {
          lookaheadConstraintIndex = currentConstraintIndex;
          isLookaheadConstraintFpaFixed = true;
          distanceFromAnchorConstraintToLookahead = currentDistanceFromAnchorConstraint;
          break;
        }

        if (currentConstraint.type === 'climb' || currentConstraint.type === 'missed') {
          lookaheadConstraintIndex = currentConstraintIndex - 1;
          isLookaheadConstraintPathStart = true;
          distanceFromAnchorConstraintToLookahead = currentDistanceFromAnchorConstraint - verticalPlan.constraints[lookaheadConstraintIndex].distance;
          break;
        }

        if (
          currentConstraint.nextVnavEligibleLegIndex !== undefined
          || currentConstraint.index === verticalPlan.fafLegIndex
          || (!currentAnchorConstraintHasFixedFpa && currentConstraint.minAltitude === currentConstraint.maxAltitude)
        ) {
          lookaheadConstraintIndex = currentConstraintIndex;
          distanceFromAnchorConstraintToLookahead = currentDistanceFromAnchorConstraint;
          break;
        }

        const requiredFpasIndex = (currentConstraintIndex - anchorConstraintIndex - 1) * 2;

        this._descentPathRequiredFpas[requiredFpasIndex]
          = VNavUtils.getFpa(currentDistanceFromAnchorConstraint, currentConstraint.minAltitude - currentAnchorConstraint.targetAltitude);
        this._descentPathRequiredFpas[requiredFpasIndex + 1]
          = VNavUtils.getFpa(currentDistanceFromAnchorConstraint, currentConstraint.maxAltitude - currentAnchorConstraint.targetAltitude);

        currentDistanceFromAnchorConstraint += currentConstraint.distance;
      }

      let lookaheadConstraint = verticalPlan.constraints[lookaheadConstraintIndex];
      let minFpaToLookaheadConstraint = -Infinity;
      let maxFpaToLookaheadConstraint = Infinity;

      if (lookaheadConstraintIndex !== anchorConstraintIndex) {
        minFpaToLookaheadConstraint = VNavUtils.getFpa(distanceFromAnchorConstraintToLookahead, lookaheadConstraint.minAltitude - currentAnchorConstraint.targetAltitude);
        maxFpaToLookaheadConstraint = VNavUtils.getFpa(distanceFromAnchorConstraintToLookahead, lookaheadConstraint.maxAltitude - currentAnchorConstraint.targetAltitude);
      }

      let desiredFpaToLookaheadConstraint: number;
      if (currentAnchorConstraintHasFixedFpa) {
        // If the current anchor constraint has a fixed FPA, then the desired FPA is just the fixed value.

        desiredFpaToLookaheadConstraint = currentAnchorConstraint.fpa;
      } else {
        // If the current anchor constraint does not have a fixed FPA, then set the desired FPA to the angle closest
        // to the default FPA that meets the lookahead constraint. If this desired angle violates the minimum or
        // maximum FPA, then adjust the desired angle appropriately.

        desiredFpaToLookaheadConstraint = MathUtils.clamp(this.flightPathAngle, minFpaToLookaheadConstraint, maxFpaToLookaheadConstraint);
        if (desiredFpaToLookaheadConstraint !== this.flightPathAngle) {
          if (desiredFpaToLookaheadConstraint > this.maxFlightPathAngle) {
            desiredFpaToLookaheadConstraint = this.maxFlightPathAngle;
          } else if (desiredFpaToLookaheadConstraint < this.minFlightPathAngle) {
            // If the FPA required to meet the lookahead constraint is less than the minimum, then set the desired
            // angle to the default angle. We do this instead of setting the desired angle to the minimum angle because
            // a level-off is required for any FPA greater than or equal to the minimum angle, so choosing the minimum
            // angle has no advantages over choosing the default angle.
            desiredFpaToLookaheadConstraint = this.flightPathAngle;
          }
        }
      }

      // Find the constraint between the current anchor constraint and the lookahead constraint (if any) that requires
      // the flight path angle that is most different from the desired angle to the lookahead constraint. Ties go to
      // the constraint closest to the current anchor constraint. If we find such a constraint, then it becomes the new
      // lookahead constraint and we repeat the process until no constraints are left between the lookahead constraint
      // and current anchor constraint that require a flight path angle different from the desired angle.

      while (lookaheadConstraintIndex > anchorConstraintIndex + 1) {
        let maxFpaDiff = 0;
        let maxFpaDiffConstraintIndex = -1;
        let requiredFpaToMaxDiffConstraint = 0;
        let minFpaToMaxDiffConstraint = 0;
        let maxFpaToMaxDiffConstraint = 0;

        for (let currentConstraintIndex = anchorConstraintIndex + 1; currentConstraintIndex < lookaheadConstraintIndex; currentConstraintIndex++) {
          const requiredFpasIndex = (currentConstraintIndex - anchorConstraintIndex - 1) * 2;

          const minFpa = this._descentPathRequiredFpas[requiredFpasIndex];
          const maxFpa = this._descentPathRequiredFpas[requiredFpasIndex + 1];

          let fpaDiff = 0;
          let requiredFpa = 0;

          if (desiredFpaToLookaheadConstraint > maxFpa) {
            fpaDiff = desiredFpaToLookaheadConstraint - maxFpa;
            requiredFpa = maxFpa;
          } else if (desiredFpaToLookaheadConstraint < minFpa) {
            fpaDiff = minFpa - desiredFpaToLookaheadConstraint;
            requiredFpa = minFpa;
          }

          if (fpaDiff > maxFpaDiff) {
            maxFpaDiff = fpaDiff;
            maxFpaDiffConstraintIndex = currentConstraintIndex;
            requiredFpaToMaxDiffConstraint = requiredFpa;
            minFpaToMaxDiffConstraint = minFpa;
            maxFpaToMaxDiffConstraint = maxFpa;
          }
        }

        if (maxFpaDiffConstraintIndex < 0) {
          break;
        }

        lookaheadConstraintIndex = maxFpaDiffConstraintIndex;
        lookaheadConstraint = verticalPlan.constraints[lookaheadConstraintIndex];

        // NOTE: if we are assigning a new lookahead constraint, then we are guaranteed that the new lookahead
        // constraint is not the start of a contiguous descent path and it does not have a fixed FPA. This is because
        // of the way we picked the original lookahead constraint for the current anchor constraint, which guarantees
        // that there are no constraints meeting either of those criteria between the original lookahead constraint and
        // the current anchor constraint.
        isLookaheadConstraintPathStart = false;
        isLookaheadConstraintFpaFixed = false;

        minFpaToLookaheadConstraint = minFpaToMaxDiffConstraint;
        maxFpaToLookaheadConstraint = maxFpaToMaxDiffConstraint;

        // If the current anchor constraint does not have a fixed FPA, then we need to recompute the desired FPA using
        // the new lookahead constraint.
        if (!currentAnchorConstraintHasFixedFpa) {
          desiredFpaToLookaheadConstraint = requiredFpaToMaxDiffConstraint;
          if (desiredFpaToLookaheadConstraint > this.maxFlightPathAngle) {
            desiredFpaToLookaheadConstraint = this.maxFlightPathAngle;
          } else if (desiredFpaToLookaheadConstraint < this.minFlightPathAngle) {
            // If the FPA required to meet the lookahead constraint is less than the minimum, then set the desired
            // angle to the default angle. We do this instead of setting the desired angle to the minimum angle because
            // a level-off is required for any FPA greater than or equal to the minimum angle, so choosing the minimum
            // angle has no advantages over choosing the default angle.
            desiredFpaToLookaheadConstraint = this.flightPathAngle;
          }
        }
      }

      if (lookaheadConstraintIndex === anchorConstraintIndex) {
        // The lookahead constraint is the current anchor constraint. This means that there are no restrictions on the
        // flight path angle of the current anchor constraint. Therefore, we will set the FPA of the current anchor
        // constraint to the default angle if the current anchor constraint does not have a fixed FPA.

        if (!currentAnchorConstraintHasFixedFpa) {
          currentAnchorConstraint.fpa = this.flightPathAngle;
        }

        currentAnchorConstraint.isTarget = this.isDescentConstraintTarget(verticalPlan, anchorConstraintIndex, lastDescentConstraintIndex);

        // Continue the outer loop and let it find the next anchor constraint.
        currentAnchorConstraint = undefined;
        ++anchorConstraintIndex;
        continue;
      }

      // At this point, we are guaranteed that we can extend a flight path with angle equal to
      // desiredFpaToLookaheadConstraint from the current anchor constraint to the lookahead constraint without
      // violating any constraints between the two.

      if (!currentAnchorConstraintHasFixedFpa && lookaheadConstraint.maxAltitude <= currentAnchorConstraint.targetAltitude) {
        // The current anchor constraint does not have a fixed flight path angle and we cannot extend a non-flat path
        // from the current anchor constraint that respects the lookahead constraint. In this case, we will extend a
        // flat path (FPA = 0) from the current anchor constraint to the lookahead constraint and make the lookahead
        // constraint the next anchor constraint.

        currentAnchorConstraint.fpa = 0;
        currentAnchorConstraint.isTarget = this.isDescentConstraintTarget(verticalPlan, anchorConstraintIndex, lastDescentConstraintIndex);

        const flatSegmentAltitude = currentAnchorConstraint.targetAltitude;

        SmoothingPathCalculator.applyPathValuesToSmoothedConstraints(
          verticalPlan,
          anchorConstraintIndex,
          lookaheadConstraintIndex,
          // Maximum altitude is not needed because we are guaranteed that the target altitudes of all smoothed
          // constraints are equal to the flat segment altitude.
          Infinity,
          this.applyPathValuesResult
        );

        anchorConstraintIndex = lookaheadConstraintIndex;
        currentAnchorConstraint = verticalPlan.constraints[anchorConstraintIndex];
        currentAnchorConstraint.targetAltitude = flatSegmentAltitude;

        continue;
      }

      // If the current anchor constraint does not have a fixed FPA, then we will set the FPA to the desired angle. If
      // the current anchor constraint has a fixed FPA, then its FPA is already set to the fixed value.
      if (!currentAnchorConstraintHasFixedFpa) {
        currentAnchorConstraint.fpa = desiredFpaToLookaheadConstraint;
      }

      currentAnchorConstraint.isTarget = this.isDescentConstraintTarget(verticalPlan, anchorConstraintIndex, lastDescentConstraintIndex);

      let terminatedIndex: number;

      if (isLookaheadConstraintPathStart) {
        // The lookahead constraint is the first constraint in a contiguous descent path. In other words, it is either
        // the first descent constraint in the flight plan, or it immediately follows a non-descent constraint.

        let extendPathPastAnchor = false;
        if (currentAnchorConstraintHasFixedFpa) {
          // If the current anchor constraint has a fixed FPA, then we will extend the constant-FPA path past the
          // lookahead constraint if and only if the lookahead constraint does not itself have a fixed FPA, the
          // lookahead constraint is not at the faf, and such a path does not violate the lookahead constraint.

          extendPathPastAnchor = !isLookaheadConstraintFpaFixed
            && lookaheadConstraint.index !== verticalPlan.fafLegIndex
            && currentAnchorConstraint.fpa >= minFpaToLookaheadConstraint
            && currentAnchorConstraint.fpa <= maxFpaToLookaheadConstraint;
        }

        if (extendPathPastAnchor) {
          const terminatingConstraintIndex = lookaheadConstraintIndex + 1;
          SmoothingPathCalculator.applyPathValuesToSmoothedConstraints(
            verticalPlan,
            anchorConstraintIndex,
            terminatingConstraintIndex,
            // If we are extending the path past the lookahead constraint, then there is no maximum altitude to respect
            // because there are no more constraints along the contiguous descent path prior to the lookahead
            // constraint.
            Infinity,
            this.applyPathValuesResult
          );

          // Continue the outer loop and let it find the next anchor constraint.
          currentAnchorConstraint = undefined;
          anchorConstraintIndex = terminatingConstraintIndex;
          continue;
        } else {
          terminatedIndex = this.terminateSmoothedPath(
            verticalPlan,
            anchorConstraintIndex,
            lookaheadConstraintIndex,
            lookaheadConstraint.maxAltitude,
            true
          );
        }
      } else if (lookaheadConstraint.nextVnavEligibleLegIndex !== undefined) {
        // The lookahead constraint contains at least one path-ineligible leg. In this case, we will attempt to extend
        // a constant-FPA path from the current anchor constraint through the lookahead constraint and ending at the
        // constraint prior to the lookahead constraint (in flight plan order). We do not need the path to respect the
        // prior constraint because there is a discontinuity in the vertical path between the prior constraint and the
        // lookahead constraint thanks to the path-ineligible leg(s).

        // NOTE: we are guaranteed that there exists a constraint prior to the lookahead constraint (in flight plan
        // order) and that this constraint is a descent constraint. This is because if there were not, then we would
        // have entered the isLookaheadConstraintPathStart case above and continued the outer loop instead of ending up
        // here.
        const priorConstraintIndex = lookaheadConstraintIndex + 1;
        const priorConstraint = verticalPlan.constraints[priorConstraintIndex];

        // Attempt to set the maximum altitude of the path from the prior constraint to the target altitude of the
        // prior constraint if it were a target constraint. We will then clamp this from below using the current
        // anchor constraint's target altitude. Since we didn't restrict the current anchor constraint's FPA based on
        // the prior constraint, this ensures we don't have to climb when traveling from the prior constraint to
        // the current anchor constraint. We will also clamp from above using the prior (in flight plan order)
        // maximum altitude constraint. This ensures we don't have to descend when traveling to the prior
        // constraint.
        const priorConstraintTargetAltitude = this.getDescentTargetConstraintAltitude(
          priorConstraint,
          priorConstraintIndex,
          priorConstraint.legs[0],
          lateralPlan.getLeg(priorConstraint.legs[0].segmentIndex, priorConstraint.legs[0].legIndex),
          verticalPlan,
          lateralPlan
        );
        const priorMaxAltitude = SmoothingPathCalculator.findPriorMaxAltitude(verticalPlan, priorConstraintIndex, firstDescentConstraintIndex);
        const maxAltitude = Math.min(Math.max(priorConstraintTargetAltitude, currentAnchorConstraint.targetAltitude), priorMaxAltitude);

        terminatedIndex = this.terminateSmoothedPath(
          verticalPlan,
          anchorConstraintIndex,
          priorConstraintIndex,
          maxAltitude,
          true
        );
      } else {
        // Designate a terminating constraint to which to attempt to extend a constant-FPA path from the current anchor
        // constraint. If the minimum FPA required to meet the lookahead constraint is greater than the chosen FPA
        // (meaning that the constant-FPA path would cross the lookahead constraint *below* its minimum altitude) and the
        // current anchor constraint does not immediately follow the lookahead constraint, then designate the constraint
        // after the lookahead constraint (in flight plan order) as the terminating constraint. This is done so that we
        // don't find ourselves above the path after sequencing the terminating constraint. Otherwise, designate the
        // lookahead constraint as the terminating constraint.
        const terminatingConstraintIndex = minFpaToLookaheadConstraint > currentAnchorConstraint.fpa && lookaheadConstraintIndex - 1 > anchorConstraintIndex
          ? lookaheadConstraintIndex - 1
          : lookaheadConstraintIndex;

        // Set the maximum altitude of the path from the terminating constraint to the current anchor constraint to
        // the prior (in flight plan order) maximum altitude constraint. This ensures we don't have to descend when
        // traveling to the terminating constraint.
        const priorMaxAltitude = SmoothingPathCalculator.findPriorMaxAltitude(verticalPlan, terminatingConstraintIndex, firstDescentConstraintIndex);

        terminatedIndex = this.terminateSmoothedPath(
          verticalPlan,
          anchorConstraintIndex,
          terminatingConstraintIndex,
          priorMaxAltitude,
          true
        );
      }

      // Make the terminating constraint the new anchor constraint.
      anchorConstraintIndex = terminatedIndex;
      currentAnchorConstraint = verticalPlan.constraints[terminatedIndex];
    }

    return true;
  }

  /**
   * Gets the target altitude to use for a target descent constraint, in meters.
   * @param constraint The constraint for which to get a target altitude.
   * @param constraintIndex The index of the constraint for which to get a target altitude.
   * @param verticalLeg The vertical flight plan leg that hosts the constraint for which to get a target altitude.
   * @param lateralLeg The lateral flight plan leg that hosts the constraint for which to get a target altitude.
   * @param verticalPlan The vertical flight plan containing the constraint for which to get a target altitude.
   * @param lateralPlan The lateral flight plan associated with the constraint for which to get a target altitude. 
   * @returns The target altitude to use for the specified target descent constraint, in meters.
   */
  protected getDescentTargetConstraintAltitude(
    constraint: VNavConstraint,
    constraintIndex: number,
    verticalLeg: VNavLeg,
    lateralLeg: LegDefinition,
    verticalPlan: VerticalFlightPlan,
    lateralPlan: FlightPlan
  ): number {
    return MathUtils.clamp(
      this.getDescentTargetConstraintAltitudeFunc(constraint, constraintIndex, verticalLeg, lateralLeg, verticalPlan, lateralPlan),
      constraint.minAltitude,
      constraint.maxAltitude
    );
  }

  /**
   * Attempts to extend a constant-FPA path backwards from an anchor constraint and terminate the path at another
   * constraint, applying flight path angles and target altitudes to each constraint along the path. The anchor
   * constraint defines the FPA of the path.
   *
   * If the target altitude of one of the constraints in the sequence, as prescribed by the path, violates a maximum
   * altitude, then the path will be terminated at the constraint immediately following (in flight plan order) the
   * violating constraint, and FPA and target altitudes will not be written to the terminating constraint or any prior
   * constraints.
   * @param verticalPlan The vertical flight plan.
   * @param anchorConstraintIndex The index of the anchor constraint.
   * @param terminatingConstraintIndex The index of the constraint at which to terminate the path.
   * @param maxAltitude The maximum allowable target altitude, in meters.
   * @param designateTerminatingConstraintAsAnchor Whether to designate the terminating constraint as an anchor
   * constraint if the path is not terminated early. If the path is terminated early, then this argument is ignored and
   * the constraint at which the path was terminated early is always designated as an anchor constraint. If the
   * terminating constraint is designated as an anchor constraint, then its target altitude value will be set to the
   * altitude of the constant-FPA path at the constraint.
   * @returns The index of the constraint at which the constant-FPA path was actually terminated.
   */
  protected terminateSmoothedPath(
    verticalPlan: VerticalFlightPlan,
    anchorConstraintIndex: number,
    terminatingConstraintIndex: number,
    maxAltitude: number,
    designateTerminatingConstraintAsAnchor: boolean
  ): number {
    const [maxAltitudeViolatedIndex, smoothedSegmentDistance] = SmoothingPathCalculator.applyPathValuesToSmoothedConstraints(
      verticalPlan,
      anchorConstraintIndex,
      terminatingConstraintIndex,
      maxAltitude,
      this.applyPathValuesResult
    );

    if (designateTerminatingConstraintAsAnchor || maxAltitudeViolatedIndex !== undefined) {
      // A constant-FPA path was not able to be extended from the anchor constraint to the requested terminating
      // constraint, so we need to designate a new anchor constraint where the path terminated.

      const currentAnchorConstraint = verticalPlan.constraints[anchorConstraintIndex];

      // Establish the proposed new anchor constraint target altitude
      const proposedNewAnchorConstraintAltitude =
        currentAnchorConstraint.targetAltitude + VNavUtils.altitudeForDistance(currentAnchorConstraint.fpa, smoothedSegmentDistance);

      const newAnchorConstraintIndex = maxAltitudeViolatedIndex ?? terminatingConstraintIndex;

      // Set the new anchor constraint values
      const newAnchorConstraint = verticalPlan.constraints[newAnchorConstraintIndex];

      newAnchorConstraint.targetAltitude = MathUtils.clamp(
        proposedNewAnchorConstraintAltitude,
        newAnchorConstraint.minAltitude,
        Math.min(newAnchorConstraint.maxAltitude, maxAltitude)
      );
    }

    return maxAltitudeViolatedIndex ?? terminatingConstraintIndex;
  }

  /**
   * Checks whether a descent constraint can be designated as a target constraint. A target constraint is a constraint
   * for which at least one of the following is true:
   * - The vertical flight path ends at the constraint.
   * - There is a discontinuity in the vertical flight path after the constraint.
   * - The constraint is located at the final approach fix.
   * - The angle of the vertical flight path changes at the constraint.
   * @param verticalPlan The vertical flight plan containing the constraint to check.
   * @param constraintIndex The index of the constraint to check.
   * @param lastDescentConstraintIndex The index of the last descent constraint in the flight plan.
   * @returns Whether the specified descent constraint can be designated as a target constraint.
   */
  protected isDescentConstraintTarget(verticalPlan: VerticalFlightPlan, constraintIndex: number, lastDescentConstraintIndex: number): boolean {
    const constraint = verticalPlan.constraints[constraintIndex];

    if (constraintIndex <= lastDescentConstraintIndex || constraint.isPathEnd) {
      return true;
    }

    if (constraint.type === 'direct' || constraint.type === 'manual') {
      return true;
    }

    const followingConstraint = verticalPlan.constraints[constraintIndex - 1];

    if (followingConstraint.type === 'climb' || followingConstraint.type === 'missed') {
      return true;
    }

    if (
      followingConstraint.nextVnavEligibleLegIndex !== undefined
      || constraint.fpa !== followingConstraint.fpa
      || constraint.index === verticalPlan.fafLegIndex
    ) {
      return true;
    }

    // If the constraint and the following constraint have the same FPA, then we need to check whether there is a
    // level-off between the two constraints. If there is, then the constraint is a target constraint. Otherwise, it
    // is not a target constraint.

    const desiredAltitudeFromFollowingConstraint
      = followingConstraint.targetAltitude + VNavUtils.altitudeForDistance(followingConstraint.fpa, followingConstraint.distance);

    return desiredAltitudeFromFollowingConstraint !== constraint.targetAltitude;
  }

  /**
   * Computes flight path altitudes for each leg in a vertical flight plan.
   * @param lateralPlan The lateral flight plan associated with the vertical flight plan for which to calculate leg altitudes.
   * @param verticalPlan The vertical flight plan for which to calculate leg altitudes.
   */
  protected computeLegAltitudes(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan): void {
    let currentConstraint = undefined as VNavConstraint | undefined;
    let currentConstraintLegIndex = -1;
    let currentConstraintDistanceToLegEnd = 0;
    let currentConstraintGradient = 0;

    let priorConstraintIndex = 0;
    let priorConstraint = verticalPlan.constraints[priorConstraintIndex] as VNavConstraint | undefined;
    let priorConstraintLegIndex = priorConstraint ? (priorConstraint.containingLegIndex ?? priorConstraint.index) : -1;
    let priorConstraintDistanceToLegEnd = priorConstraint?.containingLegDistanceToEnd ?? 0;

    let distanceToCurrentConstraint = 0;

    let followingLeg: VNavLeg | undefined;
    for (let segmentIndex = verticalPlan.segments.length - 1; segmentIndex >= 0; segmentIndex--) {
      const segment = verticalPlan.segments[segmentIndex];
      if (segment) {
        for (let segmentLegIndex = segment.legs.length - 1; segmentLegIndex >= 0; segmentLegIndex--) {
          const globalLegIndex = segment.offset + segmentLegIndex;
          const leg = segment.legs[segmentLegIndex];

          if (priorConstraint) {
            while (
              priorConstraint
              && (
                priorConstraintLegIndex > globalLegIndex
                || (priorConstraintLegIndex === globalLegIndex && priorConstraintDistanceToLegEnd <= 0)
              )
            ) {
              currentConstraint = priorConstraint;
              currentConstraintLegIndex = priorConstraintLegIndex;
              currentConstraintDistanceToLegEnd = priorConstraintDistanceToLegEnd;
              currentConstraintGradient = currentConstraint.fpa <= 0 ? 0 : Math.tan(currentConstraint.fpa * Avionics.Utils.DEG2RAD);

              priorConstraint = verticalPlan.constraints[++priorConstraintIndex];
              priorConstraintLegIndex = priorConstraint ? (priorConstraint.containingLegIndex ?? priorConstraint.index) : -1;
              priorConstraintDistanceToLegEnd = priorConstraint?.containingLegDistanceToEnd ?? 0;

              // Because the current constraint has changed, we need to re-initialize the distance from the end of the
              // current leg to the current constraint.
              if (globalLegIndex === currentConstraintLegIndex) {
                // If the current leg contains the current constraint, then the constraint is guaranteed to be located
                // at or past the end of the leg. Therefore, the distance to the current constraint is the negation of
                // the distance from the constraint to the end of its containing leg (which is equal to the current
                // leg).
                distanceToCurrentConstraint = -currentConstraintDistanceToLegEnd;
              } else {
                // If the current leg does not contain the current constraint, then the leg immediately following the
                // current leg (in flight plan order) is guaranteed to contain the current constraint. This is because
                // we iterate backward through the legs one at a time and the current constraint is guaranteed to be
                // the earliest constraint (in flight plan order) located at or after the end of the current leg. In
                // this case, the distance to the current constraint is the distance of the following leg minus the
                // distance from the constraint to the end of its containing leg (which is equal to the following leg).
                if (followingLeg) {
                  distanceToCurrentConstraint = followingLeg.distance - currentConstraintDistanceToLegEnd;
                } else {
                  distanceToCurrentConstraint = 0;
                }
              }
            }
          }

          if (currentConstraint && (currentConstraint.type === 'descent' || currentConstraint.type === 'direct' || currentConstraint.type === 'manual')) {
            leg.altitude = currentConstraint.targetAltitude + currentConstraintGradient * distanceToCurrentConstraint;
            distanceToCurrentConstraint += leg.distance;
          } else {
            leg.altitude = 0;
          }

          followingLeg = leg;
        }
      }
    }
  }

  /** @inheritdoc */
  public getFirstDescentConstraintAltitude(planIndex: number): number | undefined {
    const verticalPlan = this.getVerticalFlightPlan(planIndex);

    if (verticalPlan.constraints.length > 0) {
      for (let i = verticalPlan.constraints.length - 1; i >= 0; i--) {
        const constraint = verticalPlan.constraints[i];
        if (constraint.type !== 'climb') {
          return constraint.targetAltitude;
        }
      }
    }
    return undefined;
  }

  // Start of buildVerticalFlightPlan helper methods

  /**
   * Gets the constraint altitudes for a lateral flight plan leg.
   * @param leg A lateral flight plan leg.
   * @param out The tuple to which to write the altitudes, as `[minimum_altitude, maximum_altitude]`.
   * @returns The constraint altitudes, in meters, for the specified flight plan leg, as
   * `[minimum_altitude, maximum_altitude]`, or `undefined` if the leg does not define any altitude constraints.
   */
  protected static getConstraintAltitudes(leg: LegDefinition, out: [number, number]): [number, number] | undefined {
    if (leg.verticalData !== undefined) {
      switch (leg.verticalData.altDesc) {
        case AltitudeRestrictionType.At:
          out[0] = leg.verticalData.altitude1;
          out[1] = leg.verticalData.altitude1;
          return out;
        case AltitudeRestrictionType.AtOrAbove:
          out[0] = leg.verticalData.altitude1;
          out[1] = Number.POSITIVE_INFINITY;
          return out;
        case AltitudeRestrictionType.AtOrBelow:
          out[0] = Number.NEGATIVE_INFINITY;
          out[1] = leg.verticalData.altitude1;
          return out;
        case AltitudeRestrictionType.Between:
          out[0] = leg.verticalData.altitude2;
          out[1] = leg.verticalData.altitude1;
          return out;
      }
    }
    return undefined;
  }

  /**
   * Forces a constraint to an AT constraint.
   * @param constraint The constraint to force to an AT constraint.
   */
  protected static forceAtConstraint(constraint: VNavConstraint): void {
    if (constraint.minAltitude !== constraint.maxAltitude) {
      if (constraint.minAltitude > Number.NEGATIVE_INFINITY) {
        constraint.maxAltitude = constraint.minAltitude;
      } else {
        constraint.minAltitude = constraint.maxAltitude;
      }
    }
  }

  /**
   * Gets the global index of a flight plan's lateral direct-to target leg.
   * @param lateralPlan A flight plan.
   * @returns The global index of the flight plan's lateral direct-to target leg, or `undefined` if the plan does not
   * have an existing lateral direct-to.
   */
  protected static getDirectToTargetLegIndex(lateralPlan: FlightPlan): number | undefined {

    const directToData = lateralPlan.directToData;
    if (lateralPlan.length > 0 && directToData.segmentIndex > -1 && directToData.segmentLegIndex > -1) {
      const segment = lateralPlan.tryGetSegment(directToData.segmentIndex);

      if (segment !== null) {
        return segment.offset + directToData.segmentLegIndex;
      }
    }

    return undefined;
  }

  /**
   * Checks if there is a lateral direct-to leg in the flight plan and if so, flags the corresponding vertical flight
   * plan leg as such and marks the first descent constraint
   * @param lateralPlan The Lateral Flight Plan.
   * @param verticalPlan The Vertical Flight Plan.
   * @param directToLegOffset The offset of the lateral direct-to leg from the direct-to target leg.
   */
  protected static handleDirectToLegInVerticalPlan(lateralPlan: FlightPlan, verticalPlan: VerticalFlightPlan, directToLegOffset: number): void {

    // Check for a direct to in the lateral plan
    if (lateralPlan.directToData.segmentIndex > -1 && lateralPlan.directToData.segmentLegIndex > -1) {
      const directLateralLeg = lateralPlan.getLeg(lateralPlan.directToData.segmentIndex, lateralPlan.directToData.segmentLegIndex + directToLegOffset);

      if (BitFlags.isAll(directLateralLeg.flags, LegDefinitionFlags.DirectTo)) {
        const directVerticalLeg = VNavUtils.getVerticalLegFromSegmentInPlan(
          verticalPlan,
          lateralPlan.directToData.segmentIndex,
          lateralPlan.directToData.segmentLegIndex + directToLegOffset
        );

        directVerticalLeg.isDirectToTarget = true;
        const segment = verticalPlan.segments[lateralPlan.directToData.segmentIndex];
        if (segment !== undefined) {
          const globalLegIndex = segment.offset + lateralPlan.directToData.segmentLegIndex + directToLegOffset;
          for (let i = verticalPlan.constraints.length - 1; i >= 0; i--) {
            const constraint = verticalPlan.constraints[i];
            if (constraint.type !== 'climb' && constraint.type !== 'missed' && constraint.index >= globalLegIndex) {
              verticalPlan.firstDescentConstraintLegIndex = constraint.index;
              return;
            }
          }

          verticalPlan.firstDescentConstraintLegIndex = undefined;
        }
      }
    }
  }

  /**
   * Checks whether a leg constraint is part of the missed approach.
   * @param lateralSegment The lateral flight plan segment to which the constraint's leg belongs.
   * @param lateralLeg The lateral flight plan leg to which the constraint belongs.
   * @returns Whether the leg constraint is part of the missed approach.
   */
  protected static isConstraintInMissedApproach(lateralSegment: FlightPlanSegment, lateralLeg: LegDefinition): boolean {

    if (lateralSegment.segmentType === FlightPlanSegmentType.Approach && BitFlags.isAny(lateralLeg.flags, LegDefinitionFlags.MissedApproach)) {
      return true;
    }

    return false;
  }

  /**
   * Checks whether a leg constriant is a descent constraint and is higher than the prior descent leg constraint.
   * @param previousConstrant The previous VNav Constraint.
   * @param currentConstraint The current VNav Constraint.
   * @returns Whether the current constraint is higher than the previous constraint.
   */
  protected static isConstraintHigherThanPriorConstraint(previousConstrant: VNavConstraint, currentConstraint: VNavConstraint): boolean {
    const currentMinWithPrecision = Math.round(currentConstraint.minAltitude * 10) / 10;
    const priorMaxWithPrecision = Math.round(previousConstrant.maxAltitude * 10) / 10;

    if (currentMinWithPrecision > priorMaxWithPrecision) {
      return true;
    }

    return false;
  }

  /**
   * Checks whether a leg constraint requires an FPA greater than the max allowed value.
   * @param previousConstrant The previous VNavConstraint.
   * @param currentConstraint The VNavConstraint being evaluated.
   * @param verticalPlan The vertical flight plan.
   * @param maxFpa The maximum FPA allowed.
   * @returns Whether this constraint requires an invalid FPA.
   */
  protected static doesConstraintRequireInvalidFpa(
    previousConstrant: VNavConstraint,
    currentConstraint: VNavConstraint,
    verticalPlan: VerticalFlightPlan,
    maxFpa: number
  ): boolean {

    if (currentConstraint.maxAltitude < Number.POSITIVE_INFINITY && previousConstrant.minAltitude >= 0) {
      const constraintDistance = VNavUtils.getConstraintDistanceFromLegs(currentConstraint, previousConstrant, verticalPlan);
      const minFpaTempValue = VNavUtils.getFpa(constraintDistance, Math.abs(currentConstraint.maxAltitude - previousConstrant.minAltitude));

      if (minFpaTempValue > maxFpa) {
        return true;
      }
    }
    return false;
  }

  /**
   * The default function that gets the minimum and maximum altitudes to enforce for a VNAV constraint assigned to a
   * lateral flight plan leg. The minimum and maximum altitudes will be taken from the leg's vertical data based on the
   * value of the altitude restriction type field as follows:
   * * {@link AltitudeRestrictionType.At}: minimum and maximum altitude equal to the first altitude restriction field.
   * * {@link AltitudeRestrictionType.AtOrAbove}: minimum altitude equal to the first altitude restriction field,
   * maximum altitude equal to infinity.
   * * {@link AltitudeRestrictionType.AtOrBelow}: minimum altitude equal to negative infinity, maximum altitude equal
   * to the second altitude restriction field.
   * * {@link AltitudeRestrictionType.Between}: minimum altitude equal to the second altitude restriction field,
   * maximum altitude equal to the first altitude restriction field.
   * * {@link AltitudeRestrictionType.Unused} (or any other value): no altitudes.
   * @param out The tuple to which to write the minimum and maximum altitudes, as
   * `[minimum_altitude, maximum_altitude]` in meters.
   * @param lateralPlan The lateral flight plan that hosts the leg for which to get the constraint altitudes.
   * @param lateralLeg The lateral flight plan leg for which to get the constraint altitudes.
   * @returns The minimum and maximum altitudes to enforce for a VNAV constraint assigned to the specified lateral
   * flight plan leg, as the tuple passed to the `out` parameter, or `undefined` if there should be no constraint
   * assigned to the leg.
   */
  public static getLegConstraintAltitudes(out: [min: number, max: number], lateralPlan: FlightPlan, lateralLeg: LegDefinition): [min: number, max: number] | undefined {
    return SmoothingPathCalculator.getConstraintAltitudes(lateralLeg, out);
  }

  /**
   * The default function that checks whether a lateral flight plan leg is eligible for VNAV.
   * @param lateralLeg A lateral flight plan leg.
   * @returns Whether the specified leg is eligible for VNAV.
   */
  public static isLegVnavEligible(lateralLeg: LegDefinition): boolean {
    switch (lateralLeg.leg.type) {
      case LegType.VM:
      case LegType.FM:
      case LegType.Discontinuity:
      case LegType.ThruDiscontinuity:
        return false;
      default:
        return true;
    }
  }

  /**
   * The default function that gets the along-track offset to use for a VNAV constraint. The offset is taken from the
   * along-track offset defined by the vertical data of the constraint's host lateral leg.
   * @param constraint The constraint for which to get an along-track offset.
   * @param constraintIndex The index of the constraint for which to get an along-track offset.
   * @param verticalLeg The vertical flight plan leg that hosts the constraint for which to get an along-track offset.
   * @param lateralLeg The lateral flight plan leg that hosts the constraint for which to get an along-track offset.
   * @returns The along-track offset to use for the specified VNAV constraint, in meters. An offset of zero indicates
   * the constraint is coincident with the end of its host leg, positive offsets move the constraint forward along the
   * flight plan, and negative offsets move the constraint backward along the flight plan.
   */
  public static getConstraintAlongTrackOffset(
    constraint: UncomputedVNavConstraint,
    constraintIndex: number,
    verticalLeg: UncomputedVNavLeg,
    lateralLeg: LegDefinition
  ): number {
    return lateralLeg.verticalData.alongTrackOffset ?? 0;
  }

  /**
   * The default function that checks whether a climb constraint should be invalidated. This function always returns
   * `false`.
   * @returns Whether the specified climb constraint should be invalidated (always `false`).
   */
  public static invalidateClimbConstraint(): boolean {
    return false;
  }

  /**
   * The default function that checks whether a descent constraint should be invalidated. A constraint is invalidated
   * if any of the following conditions is met:
   * * The constraint defines a minimum altitude and the minimum altitude is greater than the most recent maximum
   * altitude defined by a prior constraint that is connected to the constraint to check by a contiguous sequence of
   * descent constraints.
   * * The required flight path angle to meet the constraint is greater than the maximum allowed flight path angle.
   * @param constraint The descent constraint to check.
   * @param index The index of the constraint to check.
   * @param constraints The array of VNAV constraints currently in the vertical flight plan.
   * @param priorMinAltitude The most recent minimum altitude, in meters, defined by a VNAV constraint prior to the
   * constraint to check. Only prior constraints connected to the constraint to check by a contiguous sequence of
   * descent constraints are included.
   * @param priorMaxAltitude The most recent maximum altitude, in meters, defined by a VNAV constraint prior to the
   * constraint to check. Only prior constraints connected to the constraint to check by a contiguous sequence of
   * descent constraints are included.
   * @param requiredFpa The minimum flight path angle, in degrees, required to meet the maximum altitude of the
   * constraint to check, assuming a descent starting from the constraint defining the most recent prior minimum
   * altitude. Positive values indicate a descending path. If there is no required FPA because there is no defined
   * prior minimum altitude or maximum altitude for the constraint to check, or if the constraint to check is higher
   * than the prior minimum altitude, then this value will equal zero.
   * @param maxFpa The maximum allowed flight path angle, in degrees. Positive values indicate a descending path.
   * @returns Whether the specified descent constraint should be invalidated.
   */
  public static invalidateDescentConstraint(
    constraint: UncomputedVNavConstraint,
    index: number,
    constraints: readonly UncomputedVNavConstraint[],
    priorMinAltitude: number,
    priorMaxAltitude: number,
    requiredFpa: number,
    maxFpa: number
  ): boolean {
    return (isFinite(constraint.minAltitude) && MathUtils.round(constraint.minAltitude, 10) > MathUtils.round(priorMaxAltitude, 10)) || requiredFpa > maxFpa;
  }

  /**
   * The default function that gets the target altitude to use for a target descent constraint, in meters. The selected
   * target altitude is equal to the constraint's minimum altitude if it is defined, or the constraint's maximum
   * altitude otherwise.
   * @param constraint The constraint for which to get a target altitude.
   * @returns The target altitude to use for the specified target descent constraint, in meters.
   */
  public static getDescentTargetConstraintAltitude(constraint: UncomputedVNavConstraint): number {
    return constraint.minAltitude > Number.NEGATIVE_INFINITY ? constraint.minAltitude : constraint.maxAltitude;
  }

  // Start of computeFlightPathAngles helper methods

  /**
   * Finds the maximum altitude, in meters, of the constraint that defines a maximum altitude and is closest to a
   * given constraint, among all constraints prior to and including (in flight plan order) the given constraint. If a
   * vertical direct constraint is among the candidates, its minimum altitude is used if it does not define a maximum
   * altitude.
   * @param verticalPlan The vertical flight plan.
   * @param constraintIndex The index of the constraint for which to find the closest prior maximum altitude.
   * @param firstDescentConstraintIndex The index of the first descent constraint.
   * @returns The maximum altitude, in meters, of the constraint that defines a maximum altitude and is closest to the
   * specified constraint, among all constraints prior to and including (in flight plan order) the specified
   * constraint, or `Infinity` if there is no such altitude.
   */
  protected static findPriorMaxAltitude(
    verticalPlan: VerticalFlightPlan,
    constraintIndex: number,
    firstDescentConstraintIndex: number
  ): number {

    for (let i = constraintIndex; i <= firstDescentConstraintIndex; i++) {
      const constraint = verticalPlan.constraints[i];

      if (constraint.maxAltitude < Infinity) {
        return constraint.maxAltitude;
      }

      if (i === firstDescentConstraintIndex && constraint.type === 'direct') {
        if (constraint.minAltitude > -Infinity) {
          return constraint.minAltitude;
        }
      }
    }

    return Infinity;
  }

  /**
   * Applies flight path angle and target altitude values to a sequence of constraints connected to an anchor
   * constraint by a constant-FPA path extending backwards from the anchor constraint. The anchor constraint defines
   * the FPA of the path.
   *
   * If the target altitude of one of the constraints in the sequence, as prescribed by the path, violates a maximum
   * altitude, then the path will be terminated at the constraint immediately following (in flight plan order) the
   * violating constraint, and FPA and target altitudes will not be written to the terminating constraint or any prior
   * constraints.
   * @param verticalPlan The vertical flight plan.
   * @param anchorConstraintIndex The index of the anchor constraint.
   * @param endConstraintIndex The index of the constraint at which the constant-FPA path ends, exclusive.
   * @param maxAltitude The maximum allowable target altitude, in meters.
   * @param out The tuple to which to write the result of the operation.
   * @returns `[index, distance]`, where `index` is the index of the constraint at which the path was terminated due to
   * violation of the maximum target altitude, or `undefined` if no constraint violated the maximum altitude, and
   * `distance` is the total distance of the path, in meters.
   */
  protected static applyPathValuesToSmoothedConstraints(
    verticalPlan: VerticalFlightPlan,
    anchorConstraintIndex: number,
    endConstraintIndex: number,
    maxAltitude: number,
    out: [number | undefined, number]
  ): [number | undefined, number] {
    const anchorConstraint = verticalPlan.constraints[anchorConstraintIndex];

    const gradient = Math.tan(UnitType.DEGREE.convertTo(anchorConstraint.fpa, UnitType.RADIAN));

    let distance = anchorConstraint.distance;

    for (let i = anchorConstraintIndex + 1; i < endConstraintIndex; i++) {
      const smoothedConstraint = verticalPlan.constraints[i];
      const targetAltitude = anchorConstraint.targetAltitude + distance * gradient;

      // The path can continue past the current constraint if the target altitude at the current constraint is less
      // than the maximum altitude.
      if (targetAltitude < maxAltitude) {
        smoothedConstraint.fpa = anchorConstraint.fpa;
        smoothedConstraint.targetAltitude = targetAltitude;

        distance += smoothedConstraint.distance;
      } else {
        out[0] = i;
        out[1] = distance;
        return out;
      }
    }

    out[0] = undefined;
    out[1] = distance;
    return out;
  }
}

import { SpeedConstraint } from '../flightplan';
import { AltitudeRestrictionType } from '../navigation';

/**
 * The current vertical navigation state.
 */
export enum VNavState {
  /** VNAV Disabled. */
  Disabled,

  /** VNAV Enabled and Inactive. */
  Enabled_Inactive,

  /** VNAV Enabled and Active. */
  Enabled_Active
}

/**
 * The current VNAV path mode.
 */
export enum VNavPathMode {
  /** VNAV path is not active. */
  None,

  /** VNAV path is armed for capture. */
  PathArmed,

  /** VNAV path is actively navigating. */
  PathActive,

  /** The current VNAV path is not valid. */
  PathInvalid
}

/**
 * The current Approach Guidance Mode.
 */
export enum ApproachGuidanceMode {
  /** VNAV is not currently following approach guidance. */
  None,

  /** VNAV has armed ILS glideslope guidance for capture. */
  GSArmed,

  /** VNAV is actively following ILS glideslope guidance. */
  GSActive,

  /** VNAV RNAV glidepath guidance is armed for capture. */
  GPArmed,

  /** VNAV is actively follow RNAV glidepath guidance. */
  GPActive
}

/**
 * The current VNAV altitude capture type.
 */
export enum VNavAltCaptureType {
  /** Altitude capture is not armed. */
  None,

  /** Altitude will capture the selected altitude. */
  Selected,

  /** Altitude will capture the VANV target altitude. */
  VNAV
}

/**
 * A Vertical Flight Plan cooresponding to a lateral flight plan.
 */
export interface VerticalFlightPlan {

  /** The Flight Plan Index */
  planIndex: number;

  /** The number of legs in this flight plan. */
  length: number;

  /**
   * The flight plan segments in this flight plan. Vertical flight plan segments have a one-to-one correspondence with
   * the segments in the associated lateral flight plan and have the same ordering.
   */
  segments: VNavPlanSegment[];

  /**
   * The VNAV constraints in this flight plan. Constraints are positioned in the array in the *reverse* order in which
   * they appear in the flight plan.
   */
  constraints: VNavConstraint[];

  /** The global leg index of the destination leg, or undefined */
  destLegIndex: number | undefined;

  /** The global leg index of the FAF leg, or undefined */
  fafLegIndex: number | undefined;

  /** The global leg index of the first descent constraint, or undefined */
  firstDescentConstraintLegIndex: number | undefined;

  /** The global leg index of the last descent constraint, or undefined */
  lastDescentConstraintLegIndex: number | undefined;

  /** The global leg index of the first missed approach leg, or undefined */
  missedApproachStartIndex: number | undefined;

  /** The global leg index of the currently active vertical direct leg, or undefined */
  verticalDirectIndex: number | undefined;

  /**
   * The flight path angle, in degrees, of this plan's vertical direct constraint, or `undefined` if there is no
   * vertical direct constraint. Positive angles represent descending paths.
   */
  verticalDirectFpa: number | undefined;

  /** The current along leg distance for the active lateral leg in this flight plan */
  currentAlongLegDistance: number | undefined;

  /** Whether the corresponding lateral flight plan has changed since the last time this plan was calculated. */
  planChanged: boolean;
}

/**
 * Details about the next TOD and BOD.
 */
export interface TodBodDetails {
  /**
   * The global index of the leg that contains the next BOD, or -1 if there is no BOD. The next BOD is defined as the
   * next point in the flight path including or after the active leg where the VNAV profile transitions from a descent
   * to a level-off, discontinuity, or the end of the flight path. The BOD is always located at the end of its
   * containing leg.
   */
  bodLegIndex: number;

  /**
   * The global index of the leg that contains the TOD associated with the next BOD, or -1 if there is no such TOD. The
   * TOD is defined as the point along the flight path at which the aircraft will intercept the VNAV profile continuing
   * to the next BOD if it continues to fly level at its current altitude.
   */
  todLegIndex: number;

  /** The distance from the TOD to the end of its containing leg, in meters. */
  todLegDistance: number;

  /** The distance along the flight path from the airplane's present position to the TOD, in meters. */
  distanceFromTod: number;

  /** The distance along the flight path from the airplane's present position to the BOD, in meters. */
  distanceFromBod: number;

  /** The global index of the leg that contains the current VNAV constraint. */
  currentConstraintLegIndex: number;
}

/**
 * Details about the next TOC and BOC.
 */
export interface TocBocDetails {
  /**
   * The global index of the leg that contains the next BOC, or -1 if there is no BOC. The BOC is always located at the
   * beginning of its containing leg.
   */
  bocLegIndex: number;

  /** The global index of the leg that contains the next TOC, or -1 if there is no such TOC. */
  tocLegIndex: number;

  /** The distance from the TOC to the end of its containing leg, in meters. */
  tocLegDistance: number;

  /** The distance along the flight path from the airplane's present position to the TOC, in meters. */
  distanceFromToc: number;

  /** The distance along the flight path from the airplane's present position to the BOC, in meters. */
  distanceFromBoc: number;

  /** The index of the vertical constraint defining the TOC altitude, or -1 if there is no TOC. */
  tocConstraintIndex: number;

  /** The TOC altitude in meters. A negative value indicates there is no TOC. */
  tocAltitude: number;
}

/**
 * A leg in a {@link VerticalFlightPlan}.
 */
export interface VNavLeg {
  /** The index of the flight plan segment that contains this leg. */
  segmentIndex: number;

  /** The index of this leg within its containing flight plan segment. */
  legIndex: number;

  /** The name of this leg. */
  name: string;

  /**
   * The flight path angle of the vertical path terminating at the constraint to which this leg is assigned, in
   * degrees. Positive angles represent a descending path. This leg is assigned to the earliest (in flight plan order)
   * constraint whose host leg is equal to or past (in flight plan order) this leg.
   */
  fpa: number;

  /** The distance of this leg, in meters. */
  distance: number;

  /** Whether this leg is eligible for VNAV to compute a vertical path through it. */
  isEligible: boolean;

  // TODO: Move isBod out of VNavLeg and into VNavConstraint when it's acceptable to break backward compatibility. It
  // no longer makes sense to assign a BOD flag to legs now that constraints are not always located at the end of a
  // leg.

  /** Whether this leg hosts a descent constraint that is considered to be a bottom-of-descent (BOD) point. */
  isBod: boolean;

  // TODO: Change isAdvisory to something more generally useful and with a name that better reflects the semantics
  // being represented (e.g. "isConstraintHost") when it's acceptable to break backward compatibility..

  /** Whether this leg does _not_ host a descent constraint. */
  isAdvisory: boolean;

  /** The altitude of the vertical path at the end of this leg, in meters. */
  altitude: number;

  /** Whether or not the constraint at this leg is user defined. */
  isUserDefined: boolean;

  /** Whether or not this leg is a direct to target. */
  isDirectToTarget: boolean;

  /** The constrant altitude assigned to this leg that is invalid, in meters, if one exists. */
  invalidConstraintAltitude?: number;
}

/**
 * An altitude constraint in a {@link VerticalFlightPlan}.
 */
export interface VNavConstraint {
  /** The type of this constraint. */
  type: 'climb' | 'descent' | 'direct' | 'manual' | 'missed' | 'dest';

  /** The global index of the flight plan leg that hosts this constraint. */
  index: number;

  // TODO: Make alongTrackOffset, containingLegIndex, and containingLegDistanceToEnd required properties when it's
  // acceptable to break backward compatibility.

  /**
   * The along-track offset of this constraint from the end of the flight plan leg that hosts this constraint, in
   * meters. Positive values indicate this constraint is located past the end of the leg, and negative values indicate
   * this constraint is located prior to the end of the leg. If not defined, then the offset is zero.
   */
  alongTrackOffset?: number;

  /**
   * The global index of the flight plan leg that contains this constraint. Only defined if this constraint's
   * along-track offset is non-zero.
   */
  containingLegIndex?: number;

  /**
   * The distance from this constraint to the end of its containing leg. Only defined if this constraint's along-track
   * offset is non-zero.
   */
  containingLegDistanceToEnd?: number;

  /** The minimum altitude of this constraint in meters, or negative infinity if this constraint has no minimum altitude. */
  minAltitude: number;

  /** The maximum altitude of this constraint in meters, or positive infinity if this constraint has no maximum altitude. */
  maxAltitude: number;

  /** The target altitude of this constraint in meters. */
  targetAltitude: number;

  /** Whether this constraint is designated as a target constraint. */
  isTarget: boolean;

  /** Whether or not this constraint is the last constraint prior to a MANSEQ or other VNAV ineligible leg type. */
  isPathEnd: boolean;

  /**
   * The global index of the earliest flight plan leg that is eligible for computing a VNAV path that is not followed
   * by a path-ineligible leg in this constraint, if this constraint contains at least one path-ineligible leg. If the
   * last leg in this constraint is path-ineligible, then this index will be equal to the global index of this
   * constraint's host leg plus one. If this constraint has no path-ineligible legs, then this property is undefined.
   */
  nextVnavEligibleLegIndex?: number;

  /** The name of the flight plan leg that hosts this constraint. */
  name: string;

  /**
   * The distance from this constraint to the constraint immediately prior to it (in flight plan order), in meters. If
   * there is no prior constraint, then the distance is measured to the beginning of the flight plan.
   */
  distance: number;

  /**
   * The flight path angle of the vertical path terminating at this constraint, in degrees. Positive angles represent a
   * descending path.
   */
  fpa: number;

  /**
   * The vertical flight plan legs assigned to this constraint. The legs appear in the array in the reverse order in
   * which they appear in the flight plan. The first leg in the array is always the leg that hosts this constraint.
   * All subsequent legs in the array represent a consecutive sequence of legs in the flight plan that ends with the
   * leg immediately following (in flight plan order) the leg hosting the prior constraint, or the first leg in the
   * flight plan if there is no prior constraint.
   */
  legs: VNavLeg[];

  /** Whether or not this constraint is beyond the FAF. */
  isBeyondFaf: boolean;
}

/**
 * A segment in the Vertical Flight Plan.
 */
export interface VNavPlanSegment {
  /** The index offset that the segment begins at. */
  offset: number,

  /** The VNAV legs contained in the segment. */
  legs: VNavLeg[]
}

/**
 * The current state of VNAV availability from the director.
 */
export enum VNavAvailability {
  Available = 'Available',
  InvalidLegs = 'InvalidLegs'
}

/**
 * The current altitude constraint details including target altitude and type.
 */
export type AltitudeConstraintDetails = {
  /** The type of this constraint. */
  type: Exclude<AltitudeRestrictionType, AltitudeRestrictionType.Between>;

  /** The altitude for this constraint, in feet. */
  altitude: number;
};

/**
 * The current speed constraint details including the currently applicable speed constraint (if any),
 * the next speed constraint (if any) and the distance to the next speed constraint (if any).
 */
export type SpeedConstraintDetails = {

  /** The currently applicable speed constraint. */
  readonly currentSpeedConstraint: SpeedConstraint;

  /** The next applicable speed constraint. */
  readonly nextSpeedConstraint: SpeedConstraint;

  /** The distance to the next speed constraint, in NM. */
  readonly distanceToNextSpeedConstraint?: number;
};

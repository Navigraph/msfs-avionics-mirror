import { ApproachProcedure, ExtendedApproachType, OneWayRunway, RnavTypeFlags, VorFacility } from '@microsoft/msfs-sdk';

export enum DirectToState {
  NONE,
  TOEXISTING,
}

export enum ProcedureType {
  DEPARTURE,
  ARRIVAL,
  APPROACH,
  VISUALAPPROACH
}

export enum AirwayLegType {
  NONE,
  ENTRY,
  EXIT,
  ONROUTE,
  EXIT_ENTRY
}

/**
 * Additional IFD approach types.
 */
export enum IfdAdditionalApproachType {
  APPROACH_TYPE_VFR = 200
}

/**
 * Types of approaches supported.
 */
export type IfdApproachType = ExtendedApproachType | IfdAdditionalApproachType;

/**
 * A VFR approach procedure.
 */
export type IfdVfrApproachProcedure = Omit<ApproachProcedure, 'approachType'> & {
  /** The approach type. */
  readonly approachType: IfdAdditionalApproachType.APPROACH_TYPE_VFR;

  /** Information about the published approach on which this VFR approach is based. */
  readonly parentApproachInfo: Pick<ApproachProcedure, 'approachType' | 'rnavTypeFlags'>;
};

/**
 * A approach procedure.
 */
export type IfdApproachProcedure = ApproachProcedure | IfdVfrApproachProcedure;

/**
 * Details on the primary flight plan's loaded approach procedure.
 */
export type ApproachDetails = {
  /** Whether an approach is loaded. */
  isLoaded: boolean;

  /** The type of the loaded approach. */
  type: IfdApproachType;

  /** Whether the loaded approach is an RNAV RNP (AR) approach. */
  isRnpAr: boolean;

  /** The best RNAV minima type available on the loaded approach. */
  bestRnavType: RnavTypeFlags;

  /** The RNAV minima types available on the loaded approach. */
  rnavTypeFlags: RnavTypeFlags;

  /** Whether the loaded approach is circling */
  isCircling: boolean;

  /** Whether the loaded approach is a vectors-to-final approach. */
  isVtf: boolean;

  /** The reference navaid facility for the loaded approach. */
  referenceFacility: VorFacility | null;

  /** The runway associated with the loaded approach. */
  runway: OneWayRunway | null;
}

/**
 * Details on the current FMS phase of flight.
 */
export type FmsFlightPhase = {
  /** Whether the approach is active. */
  isApproachActive: boolean;

  /** Whether the active leg is the leg to the final approach fix. */
  isToFaf: boolean;

  /** Whether the active leg is past the final approach fix. */
  isPastFaf: boolean;

  /** Whether the missed approach is active. */
  isInMissedApproach: boolean;
};

export enum FlightPlanIndex {
  /** The index of the active flight plan. */
  Active = 0,
  /** The index of the pending modification flight plan. */
  PendingModification = 1,
  /** The index of the procedure preview flight plan. */
  ProcedurePreview = 2,
}

export enum ApproachTransitionType {
  VectorsToFinal = -2,
  NotSelected = -1,
}

/**
 * All IFD discontinuity/notice banners we render in the flight plan list.
 */
export enum IfdDiscontinuityType {
  /** A break in continuity between two legs (e.g. manual termination). */
  GapInRoute = 'Gap in route',

  /** A gap in the route caused by mismatched altitude constraints. */
  GapInRouteConstraint = 'Gap in route - constraint',

  /** A vectors-to-final transition before the FAF. */
  VectorsToFinal = 'Vectors to final',

  /** A vectors-to-final transition before the FAF, with the VTF is not yet activated. */
  VectorsToFinalInactive = 'Vectors to final - Inactive',

  /** A visual approach segment banner. */
  VisualApproach = 'Visual Approach',

  /** A published missed approach procedure banner. */
  MissedApproach = 'Published missed approach',

  /** A published missed approach procedure banner with sequencing enabled (shown after the MAP becomes active). */
  MissedApproachEnabled = 'Published missed approach - Enabled',

  /** A warning that intercept to FAF is too sharp (>45°). */
  FafInterceptTooSharp = 'FAF Intercept Too Sharp',
}

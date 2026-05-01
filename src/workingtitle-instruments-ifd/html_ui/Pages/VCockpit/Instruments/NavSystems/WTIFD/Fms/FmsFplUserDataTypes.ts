import { ExtendedApproachType, RnavTypeFlags } from '@microsoft/msfs-sdk';

import { IfdDiscontinuityType } from './FmsTypes';

/**
 * Flight plan user data keys.
 */
export enum FmsFplUserDataKey {
  /** The name of the flight plan. */
  Name = 'name',

  /** Data describing the flight plan's loaded visual approach procedure. */
  VisualApproach = 'visual_approach_data',

  /** Data describing the flight plan's loaded VFR approach procedure. */
  VfrApproach = 'vfr_approach_data',

  /** Whether the flight plan's loaded approach procedure skips an initial course reversal. */
  ApproachSkipCourseReversal = 'skipCourseReversal',

  /**
   * Whether the current DTO to an existing leg is created by the user from the direct to dialog.
   * Excludes other types of direct to e.g. activating a leg.
   */
  DtoExistingIsUser = 'dto_existing_user',

  /** Whether the flight plan is activated. */
  IsActivated = 'is_activated',
}

/**
 * Data describing a visual approach procedure that is loaded into a flight plan.
 */
export type FmsFplVisualApproachData = {
  /** The designation of the runway associated with the loaded visual approach procedure. */
  runwayDesignation: string;
};

/**
 * Data describing a VFR approach procedure that is loaded into a flight plan.
 */
export type FmsFplVfrApproachData = {
  /** The index of the published approach procedure on which the loaded VFR approach is based. */
  approachIndex: number;

  /** Whether the loaded approach is a vectors-to-final (VTF) approach. */
  isVtf: boolean;
};

/**
 * Mappings from flight plan user data keys to their data types.
 */
export type FmsFplUserDataTypeMap = {
  /** The name of the flight plan. */
  [FmsFplUserDataKey.Name]: string;

  /** Data describing the flight plan's loaded visual approach procedure. */
  [FmsFplUserDataKey.VisualApproach]: Readonly<FmsFplVisualApproachData>;

  /** Data describing the flight plan's loaded VFR approach procedure. */
  [FmsFplUserDataKey.VfrApproach]: Readonly<FmsFplVfrApproachData>;

  /** Whether the flight plan's loaded approach procedure skips an initial course reversal. */
  [FmsFplUserDataKey.ApproachSkipCourseReversal]: boolean;

  /**
   * Whether the current DTO to an existing leg is created by the user from the direct to dialog.
   * Excludes other types of direct to e.g. activating a leg.
   */
  [FmsFplUserDataKey.DtoExistingIsUser]: boolean;

  /** Whether the flight plan is activated. */
  [FmsFplUserDataKey.IsActivated]: boolean;
};

/**
 * IFD flight plan leg user data items.
 */
export enum FmsFplLegUserDataKey {
  /** The type of approach the leg is associated with, only used on the FAF leg for each approach in the plan. */
  ApproachType = 'approachType',
  /** The RNAV type of the approach the leg is associated with, only used on the FAF leg for each approach in the plan. */
  ApproachTypeFlags = 'approachTypeFlags',
  /** The discontinuity type for UI display. Used on all discontinuity legs. */
  DiscontinuityType = 'discontinuityType',
}

/**
 * IFD flight plan leg user data item types.
 */
export type FmsFplLegUserDataTypeMap = {
  /** The type of approach the leg is associated with. */
  [FmsFplLegUserDataKey.ApproachType]: ExtendedApproachType;
  /** The RNAV type of the approach the leg is associated with. */
  [FmsFplLegUserDataKey.ApproachTypeFlags]: RnavTypeFlags;
  /** The discontinuity type for UI display. Used on all discontinuity legs. */
  [FmsFplLegUserDataKey.DiscontinuityType]: IfdDiscontinuityType;
}

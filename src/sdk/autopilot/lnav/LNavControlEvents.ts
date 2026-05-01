/**
 * Options for resetting the flight path vector tracked by LNAV.
 * @see {@link BaseLNavControlEvents.lnav_reset_tracked_vector | `lnav_reset_tracked_vector`}
 */
export enum LNavResetTrackedVectorOption {
  /** Resets the tracked vector to the first vector of the ingress transition. */
  Ingress,

  /** Resets the tracked vector to the first vector of the base flight path. */
  Base,

  /**
   * Resets the tracked vector to the first vector of the egress transition. If leg sequencing is suspended, then the
   * tracked vector will not be reset.
   */
  Egress,
}

/**
 * Events used to control LNAV keyed by base topic names.
 */
export interface BaseLNavControlEvents {
  /** Sets whether automatic sequencing of flight plan legs by LNAV is suspended. */
  suspend_sequencing: boolean;

  /** Sets whether LNAV should automatically inhibit the next attempt to sequence to the next flight plan leg. */
  lnav_inhibit_next_sequence: boolean;

  /** Whether LNAV can freely sequence into the missed approach. */
  activate_missed_approach: boolean;

  /**
   * Sets whether automatic sequencing of flight path vectors by LNAV is locked.
   * 
   * While vector sequencing is locked, LNAV will not sequence from the currently tracked vector to the next one. The
   * tracked vector may still change for reasons other than automatic sequencing. While vector sequencing is locked,
   * LNAV will also not sequence from the active flight plan leg to the next leg. If the active flight plan leg changes
   * for reasons other than automatic sequencing, then the tracked vector will be set to the first trackable vector in
   * the new active leg.
   */
  lnav_set_vector_sequencing_lock: boolean;

  /**
   * Resets LNAV's tracked vector to the first vector of a section of the the currently tracked flight plan leg. The
   * event data determines to which section tracking will be reset.
   */
  lnav_reset_tracked_vector: LNavResetTrackedVectorOption;
}

/**
 * Events used to control LNAV keyed by indexed topic names.
 */
export type IndexedLNavControlEvents<Index extends number = number> = {
  [P in keyof BaseLNavControlEvents as `${P}_${Index}`]: BaseLNavControlEvents[P];
};

/**
 * Events used to control LNAV.
 */
export type LNavControlEvents = BaseLNavControlEvents & IndexedLNavControlEvents;

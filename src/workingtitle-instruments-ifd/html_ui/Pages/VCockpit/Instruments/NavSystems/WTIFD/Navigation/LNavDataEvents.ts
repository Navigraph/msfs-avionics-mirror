import { IcaoValue, BaseLNavDataEvents as SdkBaseLNavDataEvents, VorToFrom } from '@microsoft/msfs-sdk';

/**
 * Information on a vector associated with a nominal LNAV desired track.
 */
export type LNavDataDtkVector = {
  /** The global index of the flight plan leg to which the vector belongs, or `-1` if there is no vector. */
  globalLegIndex: number,

  /** The index of the vector in its parent leg's `flightPath` array, or `-1` if there is no vector. */
  vectorIndex: number;
}

export enum IfdCdiScaleLabel {
  /** Oceanic scaling, 4.0 NM. */
  Oceanic,
  /** Enroute scaling, 2.0 NM. */
  Enroute,
  /** Terminal scaling, 1.0 NM. */
  Terminal,
  /** Approach scaling, 0.3 NM or 2° (smaller of the two at FAF). */
  Approach,
}

/**
 * Events related to IFD LNAV data keyed by base topic names.
 */
export interface BaseLNavDataEvents extends SdkBaseLNavDataEvents {
  /** Whether LNAV is nominally attempting to steer to follow a constant heading instead of a track. */
  lnavdata_is_steer_heading: boolean;

  /** The nominal desired track at the beginning of the flight plan leg following the currently tracked leg, in degrees true. */
  lnavdata_next_dtk_true: number;

  /** The nominal desired track at the beginning of the flight plan leg following the currently tracked leg, in degrees magnetic. */
  lnavdata_next_dtk_mag: number;

  /** Whether the flight plan leg following the currently tracked leg is a nominally flown as a constant heading leg. */
  lnavdata_next_is_steer_heading: boolean;

  /** The current CDI scale label. */
  lnavdata_cdi_scale_label: IfdCdiScaleLabel;

  /** The nominal along-track distance remaining to the egress transition of the currently tracked flight plan leg, in nautical miles. */
  lnavdata_egress_distance: number;

  /**
   * The nominal along-track time remaining to the egress transition of the currently tracked flight plan leg, in seconds,
   * or NaN if not available.
   */
  lnavdata_egress_ete: number;

  /** The nominal TO/FROM flag. */
  lnavdata_tofrom: VorToFrom;

  /** The ICAO of the active flight plan destination, or the empty ICAO if there is no destination. */
  lnavdata_destination_icao: IcaoValue;

  /** The ident of the active flight plan destination, or the empty string if there is no destination. */
  lnavdata_destination_ident: string;

  /** The ICAO of the active flight plan destination runway, or the empty ICAO if there is no destination runway. */
  lnavdata_destination_runway_icao: IcaoValue;

  /** Information on the nominal current desired track vector. */
  lnavdata_dtk_vector: Readonly<LNavDataDtkVector>;

  /** Information on the nominal next desired track vector. */
  lnavdata_next_dtk_vector: Readonly<LNavDataDtkVector>;

  /** The nominal time remaining to the next waypoint currently tracked by LNAV, in seconds, or NaN if not available. */
  lnavdata_waypoint_ete: number;

  /** Whether OBS mode can be activated on the current active flight plan leg. */
  obs_available: boolean;
}

/**
 * Events related to IFD LNAV keyed by indexed topic names.
 */
export type IndexedLNavDataEvents<Index extends number = number> = {
  [P in keyof BaseLNavDataEvents as `${P}_${Index}`]: BaseLNavDataEvents[P];
};

/**
 * Events related to IFD LNAV.
 */
export interface LNavDataEvents extends BaseLNavDataEvents, IndexedLNavDataEvents {
}

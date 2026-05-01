import { AvionicsSystemStateEvent, GPSSatelliteState, LatLongInterface } from '@microsoft/msfs-sdk';

/**
 * A navigation specification defining the parameters used for computing uncertainty values.
 */
export enum GnssNavigationMode {
  /** SBAS is being used for enroute navigation using LNAV. */
  Enroute = 'Enroute',
  /** SBAS is being used for terminal area navigation using LNAV. */
  Terminal = 'Terminal',
  /** SBAS is being used for conducting an RNP approach (LNAV/VNAV, LP or LPV). */
  Approach = 'Approach',
}

export enum GnssNavigationState {
  SelfTest = 'Self Test',
  Init = 'Init',
  Search = 'Search',
  BasicNav = 'Basic Nav',
  FdeNav = 'FDE Nav',
  SbasNav = 'SBAS Nav',
  Fault = 'Fault',
}

/**
 * An interface which describes the state of a GNSS satellite.
 */
export interface GnssSatelliteData {
  /** The current satellite state. */
  readonly state: GPSSatelliteState;

  /** The PRN number for this satellite. */
  readonly prn: number;

  /** The current satellite position, in zenith angle radians and hour angle radians. */
  readonly position: readonly number[];

  /** The current satellite position, in cartesian coordinates (X, Y, Z). */
  readonly positionCartesian: readonly number[];

  /** The current satellite signal strength. */
  readonly signalStrength: number;

  /** The name of the SBAS group the satellite is a part of, or undefined if not an SBAS satellite. */
  readonly sbasGroup: string | undefined;

  /** Whether SBAS differential correction data have been downloaded from this satellite. */
  readonly areDiffCorrectionsDownloaded: boolean;
}


/**
 * Events used to control the GNSS receiver.
 */
export interface GnssReceiverControlEvents {
  /**
   * Sets the receiver's navigation mode to the supplied value. The default value is Enroute.
   */
  gnss_receiver_set_navigation_mode: GnssNavigationMode;


  /** Sets the receiver's vertical alert limit (VAL) in metres. The default value is null (none). */
  gnss_receiver_set_desired_val_m: number | null;
}

/**
 * Data labels for the GNSS systems.
 */
export interface GnssReceiverEvents {
  /** The current state of the GNSS receiver system. */
  gnss_receiver_state: AvionicsSystemStateEvent;

  /** The airplane's GNSS position, or NaN/NaN when not available. */
  gnss_position: Readonly<LatLongInterface>;

  /** The airplane's raw, unfiltered GNSS position, or NaN/NaN when not available. */
  gnss_raw_position: Readonly<LatLongInterface>;

  /** The airplane's GNSS altitude, in feet, or null when not available. */
  gnss_altitude_ft: number | null;

  /** The airplane's raw, unfiltered GNSS altitude, in feet, or null when not available. */
  gnss_raw_altitude_ft: number | null;

  /** The GNSS UTC time, in seconds since Unix epoch, or null when not available. */
  gnss_utc_time: number | null;

  /** The airplane's GNSS ground track, in degrees relative to true north, or null when not available. */
  gnss_track_true_deg: number | null;

  /** The airplane's GNSS ground speed, in knots, or null when not available. */
  gnss_ground_speed_kts: number | null;

  /**
   * The north-south component (positive points towards true north) of the airplane's GNSS ground speed, in knots,
   * or null when not available.
   */
  gnss_ground_speed_ns_kts: number | null;

  /** The east-west component (positive points towards east) of the airplane's GNSS ground speed, in knots. */
  gnss_ground_speed_ew_kts: number | null;

  /**
   * The GNSS Horizontal Dilution of Precision (HDOP). Dilution of precision is factor which describes the amount of error in the GNSS
   * position solution due to satellite geometry, ignoring atmospheric and receiver-induced errors.
   */
  gnss_hdop: number | null;

  /**
   * The GNSS Vertical Dilution of Precision (VDOP). Dilution of precision is factor which describes the amount of error in the GNSS
   * position solution due to satellite geometry, ignoring atmospheric and receiver-induced errors.
   */
  gnss_vdop: number | null;

  /**
   * The GNSS Horizontal Figure of Merit (HFOM), which is the radius of the circle which contains the true position with
   * at least 95% certainty, in meters, or null when not available.
   */
  gnss_hfom_m: number | null;

  /**
   * The GNSS Vertical Figure of Merit (VFOM), which is the length of the line segment which contains the true altitude with
   * at least 95% certainty, in meters, or null when not available.
   */
  gnss_vfom_m: number | null;

  /**
   * The GNSS Horizontal Uncertainty Level (HUL), which is the radius of the circle which contains the true position with
   * at least 99.9% certainty, in meters, or null when not available.
   */
  gnss_hul_m: number | null;

  /**
   * The GNSS Vertical Uncertainty Level (VUL), which is the length of the line segment which contains the true altitude with
   * at least 99.9% certainty, in meters, or null when not available.
   */
  gnss_vul_m: number | null;

  /**
   * The GNSS Horizontal Protection Level (HPL), which is the radius of the circle which is assured to contain the true position with
   * a very high degree of certainty, in meters. The degree of certainty depends on the current SBAS navigation specification.
   */
  gnss_hpl_m: number | null;

  /**
   * The GNSS Vertical Protection Level (VPL), which is the length of the line segment which is assured to contain the true position with
   * a very high degree of certainty, in meters, or null when not available.
   */
  gnss_vpl_m: number | null;

  /** The GNSS Horizontal Alert Limit (HAL) in metres, or null when not available. */
  gnss_hal_m: number | null;

  /** The GNSS Vertical Alert Limit (VAL) in metres, or null when not available. */
  gnss_val_m: number | null;

  /** The number of satellites in use by the GNSS receiver, or null when not available. */
  gnss_number_of_satellites: number | null;

  /** The GNSS receiver's mode, or null if the receiver is unpowered, or null when not available. */
  gnss_navigation_state: GnssNavigationState | null;

  /** The current navigation mode of the GNSS receiver, or null when not available/unpowered. */
  gnss_navigation_mode: GnssNavigationMode | null;

  /** The GNSS vertical speed, in feet per minute, or null when not available. */
  gnss_vertical_speed_fpm: number | null;

  /** The name of the SBAS group currently in use, or null if SBAS is not in use, or null when not available. */
  gnss_sbas_group_in_use: string | null;

  /** The states of all the GNSS satellites. */
  gnss_satellite_data: readonly GnssSatelliteData[];
}

import { GpwsOperatingMode } from './GpwsTypes';

/**
 * Events related to GPWS data.
 */
export interface GpwsEvents {
  /** The current GPWS operating mode. */
  gpws_operating_mode: GpwsOperatingMode;

  /** Whether the forward-looking terrain avoidance function is enabled. */
  gpws_terrain_enabled: boolean;

  /** Whether GPWS has a valid position fix for the airplane. */
  gpws_is_pos_valid: boolean;

  /** The geometric altitude of the airplane, in feet. */
  gpws_geo_altitude: number;

  /** The geometric vertical speed of the airplane, in feet per minute. */
  gpws_geo_vertical_speed: number;

  /**
   * The geometric altitude (elevation) of the nearest runway to the airplane, in feet, or `null` if nearest runway
   * data are not available.
   */
  gpws_nearest_runway_altitude: number | null;

  /** EDR module red warning. */
  gpws_excessive_descent_rate: boolean;
  /** EDR module yellow sink rate caution. */
  gpws_sink_rate: boolean;
  /** FLTA module red pull up warning. */
  gpws_terrain_warning: boolean;
  /** FLTA module yellow caution. */
  gpws_terrain_caution: boolean;
  /** NCR module yellow caution after takeoff. */
  gpws_dont_sink: boolean;
  /** PDA module yellow premature descent/too low terrain caution. */
  gpws_premature_descent: boolean;
}

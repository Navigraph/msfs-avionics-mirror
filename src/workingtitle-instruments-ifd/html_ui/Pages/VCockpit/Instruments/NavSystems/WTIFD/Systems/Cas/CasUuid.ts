/**
 * UUIDs for all CAS messages in the IFD (except those that will never apply in the sim).
 * Un-comment as you implement, and define the message in {@link CAS_MESSAGES}.
 */
export enum CasUuid {
  // Red Warnings
  PullUp = 'warning-pull_up',
  TerrainPullUp = 'warning-terrain_pull_up',

  // Yellow Cautions
  CautionTerrain = 'caution-caution_terrain',
  CheckAltitudeTooLow = 'caution-check_altitude_too_low',
  DontSink = 'caution-dont_sink',
  GpsFault = 'caution-gps_fault',
  GpsIntegrityLost = 'caution-gps_integrity_lost',
  HeadingLost = 'caution-heading_lost',
  LpUnavailableUseLnavMda = 'caution-lp_unavailable_us_lnav_mda',
  LpvUnavailableUseLVnavDa = 'caution-lpv_unavailable_us_l_vnav_da',
  LpvUnavailableUseLnavMda = 'caution-lpv_unavailable_us_lnav_mda',
  LVNavUnavailableUseLnavMda = 'caution-lv_nav_unavailable_use_lnav_mda',
  ManualSequenceReqd = 'caution-manual_sequence_reqd',
  NoCommWithVhf = 'caution-no_comm_with_vhf',
  NoCommWithXpdr = 'caution-no_comm_with_xpdr',
  NoPosition = 'caution-no_position',
  SinkRate = 'caution-sink_rate',
  TawsFail = 'caution-taws_fail',
  TooLowTerrain = 'caution-too_low_terrain',
  Traffic = 'caution-traffic', // special case with variable message...

  // Cyan Advisories
  AirspaceAhead = 'advisory-airspace_ahead',
  BeginDescent = 'advisory-begin_descent', // message varies with time remaining
  CheckInitFuel = 'advisory-check_init_fuel',
  CheckNavFrequency = 'advisory-check_nav_frequency',
  CheckNavaidIdentifier = 'advisory-check_navadi_identifier',
  DeadReckoning = 'advisory-dead_reckoning',
  EnableApApr = 'advisory-enable_ap_apr',
  ExitingHoldAtFix = 'advisory-exiting_hold_at_fix',
  ExitingHoldAtIntercept = 'advisory-exiting_hold_at_intercept',
  FltaOff = 'advisory-flta_off',
  FltaUnavailable = 'advisory-flta_unavailable',
  GapInRouteAhead = 'advisory-gap_in_route_ahead',
  HoldCourseXXX = 'advisory-hold_course_xxx',
  InterceptTooSharp = 'advisory-intercept_too_sharp',
  NextLegCCCinXXSec = 'advisory-next_leg_cc_cin_xx_sec',
  ParallelEntry = 'advisory-parallel_entry',
  SetCourseToX = 'advisory-set_course_to_x',
  SwitchTanks = 'advisory-switch_tanks',
  TeardropEntry = 'advisory-teardrop_entry',
  TimerExpired = 'advisory-timer_expired',
  TimerCustom1Expired = 'advisory-custom_timer_1_expired',
  TimerCustom2Expired = 'advisory-custom_timer_2_expired',
  TimerCustom3Expired = 'advisory-custom_timer_3_expired',
  TimerCustom4Expired = 'advisory-custom_timer_4_expired',
  TimerCustom5Expired = 'advisory-custom_timer_5_expired',
  TimerCustom6Expired = 'advisory-custom_timer_6_expired',
  TimerCustom7Expired = 'advisory-custom_timer_7_expired',
  TimerCustom8Expired = 'advisory-custom_timer_8_expired',
  TimerCustom9Expired = 'advisory-custom_timer_9_expired',
  TimerCustom10Expired = 'advisory-custom_timer_10_expired',
  TransAltXXX = 'advisory-trans_alt_xxx',
  TransLevelXXX = 'advisory-trans_level_xxx',
  VnavSuspendedXtkLimit = 'advisory-vnav_suspended_xtk_limit',
  VnavSuspendedCourseLimit = 'advisory-vnav_suspended_course_limit',
  VnavTerminatedAltiConstraint = 'advisory-vnav_terminated_alti_constraint',
}

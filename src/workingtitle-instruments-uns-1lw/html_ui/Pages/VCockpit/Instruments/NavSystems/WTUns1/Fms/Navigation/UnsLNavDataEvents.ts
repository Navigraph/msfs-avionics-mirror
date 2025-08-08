import { EventBus, LNavDataSimVarEvents, LNavDataVars, SimVarPublisher, SimVarValueType } from '@microsoft/msfs-sdk';

import { UnsFlightAreas } from '../UnsFlightAreas';

/**
 * Valid CDI scale labels for the LVar scale enum.
 */
export enum CDIScaleLabel {
  Departure,
  Terminal,
  TerminalDeparture,
  TerminalArrival,
  Enroute,
  Oceanic,
  Approach,
  MissedApproach
}

/**
 * Sim var names for Epic 2 LNAV-related data.
 */
export enum UnsLNavDataVars {
  /** The global leg index of the flight plan leg that is nominally being tracked by LNAV. */
  NominalLegIndex = 'L:WT_UNS1_LNavData_Nominal_Leg_Index',

  /** The current CDI scale label. */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  CDIScaleLabel = 'L:WT_UNS1_LNavData_CDI_Scale_Label',

  /** The current flight area */
  FlightArea = 'L:WT_UNS1_LNavData_Flight_Area_Index',

  /** The nominal distance remaining to the end of the currently tracked flight plan leg. */
  TrackedLegEndDistance = 'L:WT_UNS1_LNavData_Tracked_Leg_End_Distance',

  /** The straight-line distance between the present position and the destination, in nautical miles. */
  DestinationDistanceDirect = 'L:WT_UNS1_LNavData_Destination_Distance_Direct',

  /** The flight plan distance to the final approach fix, in nautical miles. */
  FafDistance = 'L:WT_UNS1_LNavData_Faf_Distance'
}

/**
 * Events derived from Epic 2 LNAV-related data sim vars.
 */
interface BaseUnsLNavDataSimVarEvents extends LNavDataSimVarEvents {
  /** The global leg index of the flight plan leg that is nominally being tracked by LNAV. */
  lnavdata_nominal_leg_index: number;

  /** The current CDI scale label. */
  lnavdata_cdi_scale_label: CDIScaleLabel;

  /** The current flight area. */
  lnavdata_flight_area: UnsFlightAreas;

  /** The nominal distance remaining to the end of the currently tracked flight plan leg, in nautical miles. */
  lnavdata_tracked_leg_end_distance: number;

  /** The straight-line distance between the present position and the destination, in nautical miles. */
  lnavdata_destination_distance_direct: number;

  /** The flight plan distance to the final approach fix, in nautical miles. */
  lnavdata_distance_to_faf: number;
}

/**
 * Events derived from LNAV SimVars keyed by indexed topic names.
 */
export type IndexedUnsLNavDataEvents<Index extends number = number> = {
  [P in keyof BaseUnsLNavDataSimVarEvents as `${P}_${Index}`]: BaseUnsLNavDataSimVarEvents[P];
};

/**
 * UNS-1 LNAV data events
 */
export type UnsLNavDataEvents = BaseUnsLNavDataSimVarEvents & IndexedUnsLNavDataEvents


/**
 * A publisher for Epic 2 LNAV-related data sim var events.
 */
export class UnsNavDataSimVarPublisher extends SimVarPublisher<UnsLNavDataEvents> {
  /**
   * Constructor.
   * @param bus The event bus to which to publish.
   */
  public constructor(bus: EventBus) {
    super([
      ['lnavdata_dtk_true', { name: `${LNavDataVars.DTKTrue}:#index#`, type: SimVarValueType.Degree, indexed: true, defaultIndex: null }],
      ['lnavdata_dtk_mag', { name: `${LNavDataVars.DTKMagnetic}:#index#`, type: SimVarValueType.Degree, indexed: true, defaultIndex: null }],
      ['lnavdata_xtk', { name: `${LNavDataVars.XTK}:#index#`, type: SimVarValueType.NM, indexed: true, defaultIndex: null }],
      ['lnavdata_cdi_scale', { name: `${LNavDataVars.CDIScale}:#index#`, type: SimVarValueType.NM, indexed: true, defaultIndex: null }],
      ['lnavdata_cdi_scale_label', { name: `${UnsLNavDataVars.CDIScaleLabel}:#index#`, type: SimVarValueType.Number, indexed: true, defaultIndex: null }],
      ['lnavdata_waypoint_bearing_true', { name: `${LNavDataVars.WaypointBearingTrue}:#index#`, type: SimVarValueType.Degree, indexed: true, defaultIndex: null }],
      ['lnavdata_waypoint_bearing_mag', { name: `${LNavDataVars.WaypointBearingMagnetic}:#index#`, type: SimVarValueType.Degree, indexed: true, defaultIndex: null }],
      ['lnavdata_waypoint_distance', { name: `${LNavDataVars.WaypointDistance}:#index#`, type: SimVarValueType.NM, indexed: true, defaultIndex: null }],
      ['lnavdata_destination_distance', { name: `${LNavDataVars.DestinationDistance}:#index#`, type: SimVarValueType.NM, indexed: true, defaultIndex: null }],
      ['lnavdata_nominal_leg_index', { name: `${UnsLNavDataVars.NominalLegIndex}:#index#`, type: SimVarValueType.Number, indexed: true, defaultIndex: null }],
      ['lnavdata_tracked_leg_end_distance', { name: `${UnsLNavDataVars.TrackedLegEndDistance}:#index#`, type: SimVarValueType.NM, indexed: true, defaultIndex: null }],
      ['lnavdata_destination_distance_direct', { name: `${UnsLNavDataVars.DestinationDistanceDirect}:#index#`, type: SimVarValueType.NM, indexed: true, defaultIndex: null }],
      ['lnavdata_distance_to_faf', { name: `${UnsLNavDataVars.FafDistance}:#index#`, type: SimVarValueType.NM, indexed: true, defaultIndex: null }],
    ], bus);
  }
}

import { EventBus, LNavDataSimVarEvents, LNavDataVars, SimVarDefinition, SimVarPublisher, SimVarValueType } from '@microsoft/msfs-sdk';

import { Epic2FlightArea } from '../Autopilot/Epic2FlightAreaComputer';

/**
 * Sim var names for Epic 2 LNAV-related data.
 */
export enum Epic2LNavDataVars {
  /** The global leg index of the flight plan leg that is nominally being tracked by LNAV. */
  NominalLegIndex = 'L:WT_EPIC2_LNavData_Nominal_Leg_Index',

  /** The current CDI scale label. */
  // eslint-disable-next-line @typescript-eslint/no-shadow
  FlightArea = 'L:WT_EPIC2_LNavData_FlightArea',

  /** The nominal distance remaining to the end of the currently tracked flight plan leg. */
  TrackedLegEndDistance = 'L:WT_EPIC2_LNavData_Tracked_Leg_End_Distance',

  /** The straight-line distance between the present position and the destination, in nautical miles. */
  DestinationDistanceDirect = 'L:WT_EPIC2_LNavData_Destination_Distance_Direct',

  /** The flight plan distance to the final approach fix, in nautical miles. */
  FafDistance = 'L:WT_EPIC2_LNavData_Faf_Distance',

  /** Whether the aircraft is currently in a hold */
  IsHolding = 'L:WT_EPIC2_LNavData_Is_Holding'
}

/**
 * Events derived from Epic 2 LNAV-related data sim vars.
 */
export interface Epic2LNavDataSimVarEvents extends LNavDataSimVarEvents {
  /** The global leg index of the flight plan leg that is nominally being tracked by LNAV. */
  lnavdata_nominal_leg_index: number;

  /** The current CDI scale label. */
  lnavdata_flight_area: Epic2FlightArea;

  /** The nominal distance remaining to the end of the currently tracked flight plan leg, in nautical miles. */
  lnavdata_tracked_leg_end_distance: number;

  /** The straight-line distance between the present position and the destination, in nautical miles. */
  lnavdata_destination_distance_direct: number;

  /** The flight plan distance to the final approach fix, in nautical miles. */
  lnavdata_distance_to_faf: number;

  /** The CDI scale, or RNP, in nautical miles. */
  lnavdata_cdi_scale: number;

  /** Whether the aircraft is currently holding */
  lnavdata_is_holding: boolean
}

/**
 * Events related to Epic 2 LNAV data.
 */
export type Epic2LNavDataEvents = Epic2LNavDataSimVarEvents;

/**
 * A publisher for Epic 2 LNAV-related data sim var events.
 */
export class Epic2LNavDataSimVarPublisher extends SimVarPublisher<Epic2LNavDataSimVarEvents> {
  private static simvars = new Map<keyof Epic2LNavDataSimVarEvents, SimVarDefinition>([
    ['lnavdata_dtk_true', { name: LNavDataVars.DTKTrue, type: SimVarValueType.Degree }],
    ['lnavdata_dtk_mag', { name: LNavDataVars.DTKMagnetic, type: SimVarValueType.Degree }],
    ['lnavdata_xtk', { name: LNavDataVars.XTK, type: SimVarValueType.NM }],
    ['lnavdata_cdi_scale', { name: LNavDataVars.CDIScale, type: SimVarValueType.NM }],
    ['lnavdata_flight_area', { name: Epic2LNavDataVars.FlightArea, type: SimVarValueType.Number }],
    ['lnavdata_waypoint_bearing_true', { name: LNavDataVars.WaypointBearingTrue, type: SimVarValueType.Degree }],
    ['lnavdata_waypoint_bearing_mag', { name: LNavDataVars.WaypointBearingMagnetic, type: SimVarValueType.Degree }],
    ['lnavdata_waypoint_distance', { name: LNavDataVars.WaypointDistance, type: SimVarValueType.NM }],
    ['lnavdata_destination_distance', { name: LNavDataVars.DestinationDistance, type: SimVarValueType.NM }],
    ['lnavdata_nominal_leg_index', { name: Epic2LNavDataVars.NominalLegIndex, type: SimVarValueType.Number }],
    ['lnavdata_tracked_leg_end_distance', { name: Epic2LNavDataVars.TrackedLegEndDistance, type: SimVarValueType.NM }],
    ['lnavdata_destination_distance_direct', { name: Epic2LNavDataVars.DestinationDistanceDirect, type: SimVarValueType.NM }],
    ['lnavdata_distance_to_faf', { name: Epic2LNavDataVars.FafDistance, type: SimVarValueType.NM }],
    ['lnavdata_is_holding', { name: Epic2LNavDataVars.IsHolding, type: SimVarValueType.Bool }]
  ]);

  /**
   * Constructor.
   * @param bus The event bus to which to publish.
   */
  public constructor(bus: EventBus) {
    super(Epic2LNavDataSimVarPublisher.simvars, bus);
  }
}

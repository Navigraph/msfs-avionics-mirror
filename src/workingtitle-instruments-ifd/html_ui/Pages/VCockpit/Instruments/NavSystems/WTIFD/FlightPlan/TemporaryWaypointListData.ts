import { Subject } from '@microsoft/msfs-sdk';

import { FlightPlanBaseListData } from './FlightPlanDataTypes';

/**
 * Represents a temporary waypoint data that can be inserted to the flight plan.
 * Does not belong to the actual flight plan. It's a proposal waypoint that can be added to the plan.
 */
export class TemporaryWaypointListData implements FlightPlanBaseListData {
  /** @inheritdoc */
  public readonly type = 'temporary_wpt';

  /** @inheritdoc */
  public readonly isVisible = Subject.create(true);

  public readonly heightPx = Subject.create(81);

  /**
   * Constructor.
   * @param keyboardOpenOnInit Whether the keyboard should open on init.
   * @param fromLat The latitude to sort the waypoint list by distance from, in degrees, or undefined for no sort.
   * @param fromLon The longitude to sort the waypoint list by distance from, in degrees, or undefined for no sort.
   */
  public constructor(public readonly keyboardOpenOnInit: boolean, public readonly fromLat?: number, public readonly fromLon?: number) { }
}

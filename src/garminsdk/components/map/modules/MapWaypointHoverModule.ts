import { Subject, Waypoint } from '@microsoft/msfs-sdk';

/**
 * A module which defines a selected waypoint.
 */
export class MapWaypointHoverModule {
  /** The hovered waypoint. */
  public readonly waypoint = Subject.create<Waypoint | null>(null);
}

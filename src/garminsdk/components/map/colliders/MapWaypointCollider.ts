import { MapCollider, Waypoint } from '@microsoft/msfs-sdk';

/**
 * A map collider for a rendered waypoint.
 */
export interface MapWaypointCollider extends MapCollider {
  /** Flags this object as a `MapWaypointCollider`. */
  readonly isWaypointCollider: true;

  /** This collider's waypoint. */
  readonly waypoint: Waypoint;
}

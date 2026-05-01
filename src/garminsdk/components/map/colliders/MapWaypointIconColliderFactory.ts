import { MapWaypointIcon, Waypoint } from '@microsoft/msfs-sdk';

import { MapWaypointCollider } from './MapWaypointCollider';

/**
 * A factory that creates and manages map colliders for rendered waypoint icons.
 */
export interface MapWaypointIconColliderFactory {
  /**
   * Creates a collider for a rendered waypoint icon.
   * @param waypoint The icon's waypoint.
   * @param renderRole The render role under which the waypoint icon was rendered.
   * @param icon The rendered waypoint icon.
   * @returns A new collider for the specified rendered waypoint icon, or `null` if no collider should be created.
   */
  createCollider(waypoint: Waypoint, renderRole: number, icon: MapWaypointIcon<Waypoint>): MapWaypointCollider | null;

  /**
   * Updates a collider for a rendered waypoint icon.
   * @param waypoint The icon's waypoint.
   * @param renderRole The render role under which the waypoint icon was rendered.
   * @param icon The rendered waypoint icon.
   * @param collider The collider that was previously assigned to the waypoint, or `null` if there is no such collider.
   * @returns A collider to assign to the specified rendered waypoint icon, or `null` if no collider should be
   * assigned. The returned collider can be the same or different from the previously assigned collider.
   */
  updateCollider(waypoint: Waypoint, renderRole: number, icon: MapWaypointIcon<Waypoint>, collider: MapWaypointCollider | null): MapWaypointCollider | null;

  /**
   * Cleans up a collider for a rendered waypoint icon.
   * @param collider The collider to clean up.
   */
  cleanupCollider(collider: MapWaypointCollider): void;
}

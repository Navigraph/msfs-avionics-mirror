import {
  AbstractMapWaypointIcon, Accessible, MapColliderUtils, MapProjection, Vec2Math, Waypoint
} from '@microsoft/msfs-sdk';

import { MapBasicWaypointCollider } from './MapBasicWaypointCollider';

/**
 * An implementation of {@link MapWaypointCollider} with a circular shape which derives its position from a
 * {@link AbstractMapWaypointIcon}.
 */
export class MapWaypointIconCollider extends MapBasicWaypointCollider {
  /**
   * Creates a new instance of MapWaypointIconCollider.
   * @param waypoint This collider's waypoint.
   * @param icon The rendered icon for this collider's waypoint.
   * @param priority This collider's priority.
   * @param radius This collider's radius.
   */
  public constructor(
    waypoint: Waypoint,
    private icon: AbstractMapWaypointIcon<Waypoint>,
    priority: Accessible<number>,
    radius: number
  ) {
    super(waypoint, priority, radius);
  }

  /**
   * Sets the rendered icon for this collider's waypoint.
   * @param icon The icon to set.
   */
  public setIcon(icon: AbstractMapWaypointIcon<Waypoint>): void {
    this.icon = icon;
  }

  /** @inheritDoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public intersectsBox(cx: number, cy: number, axisX: number, axisY: number, halfWidth: number, halfHeight: number, mapProjection: MapProjection): boolean {
    const waypointProjectedPos = this.icon.getLastDrawData().waypointProjectedPos;

    if (!Vec2Math.isFinite(waypointProjectedPos)) {
      return false;
    }

    return MapColliderUtils.obbCircleIntersection(cx, cy, axisX, axisY, halfWidth, halfHeight, waypointProjectedPos[0], waypointProjectedPos[1], this.radius);
  }

  /** @inheritDoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public intersectsCircle(cx: number, cy: number, radius: number, mapProjection: MapProjection): boolean {
    const waypointProjectedPos = this.icon.getLastDrawData().waypointProjectedPos;

    if (!Vec2Math.isFinite(waypointProjectedPos)) {
      return false;
    }

    return MapColliderUtils.circle2Intersection(cx, cy, radius, waypointProjectedPos[0], waypointProjectedPos[1], this.radius);
  }
}

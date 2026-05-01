import { Accessible, MapColliderUtils, MapProjection, Vec2Math, Waypoint } from '@microsoft/msfs-sdk';

import { MapWaypointCollider } from './MapWaypointCollider';

/**
 * A basic implementation of {@link MapWaypointCollider} with a circular shape.
 */
export class MapBasicWaypointCollider implements MapWaypointCollider {
  protected static readonly vec2Cache = [Vec2Math.create()];

  /** @inheritDoc */
  public readonly isMapCollider = true;

  /** @inheritDoc */
  public readonly isWaypointCollider = true;

  /**
   * Creates a new instance of MapWaypointIconCollider.
   * @param waypoint This collider's waypoint.
   * @param priority This collider's priority.
   * @param radius This collider's radius.
   */
  public constructor(
    public readonly waypoint: Waypoint,
    protected priority: Accessible<number>,
    protected radius: number
  ) {
  }

  /** @inheritDoc */
  public getPriority(): number {
    return this.priority.get();
  }

  /**
   * Sets this collider's priority.
   * @param priority The priority to set.
   */
  public setPriority(priority: Accessible<number>): void {
    this.priority = priority;
  }

  /**
   * Sets this collider's radius.
   * @param radius The radius to set.
   */
  public setRadius(radius: number): void {
    if (this.radius === radius) {
      return;
    }

    this.radius = radius;
  }

  /** @inheritDoc */
  public intersectsBox(cx: number, cy: number, axisX: number, axisY: number, halfWidth: number, halfHeight: number, mapProjection: MapProjection): boolean {
    const pos = mapProjection.project(this.waypoint.location.get(), MapBasicWaypointCollider.vec2Cache[0]);
    return MapColliderUtils.obbCircleIntersection(cx, cy, axisX, axisY, halfWidth, halfHeight, pos[0], pos[1], this.radius);
  }

  /** @inheritDoc */
  public intersectsCircle(cx: number, cy: number, radius: number, mapProjection: MapProjection): boolean {
    const pos = mapProjection.project(this.waypoint.location.get(), MapBasicWaypointCollider.vec2Cache[0]);
    return MapColliderUtils.circle2Intersection(cx, cy, radius, pos[0], pos[1], this.radius);
  }

  /** @inheritDoc */
  public destroy(): void {
    // noop
  }
}

import { MapProjection } from '../MapProjection';

/**
 * A map element that supports collision detection against simple shapes.
 */
export interface MapCollider {
  /** Flags this object as a `MapCollider`. */
  readonly isMapCollider: true;

  /**
   * Gets this collider's priority.
   * @returns This collider's priority.
   */
  getPriority(): number;

  /**
   * Tests whether this collider intersects an oriented rectangular box.
   * @param cx The x coordinate of the center of the box.
   * @param cy The y coordinate of the center of the box.
   * @param axisX The x component of the unit vector parallel to the axis that defines the box's _width_.
   * @param axisY The y component of the unit vector parallel to the axis that defines the box's _width_.
   * @param halfWidth The half width of the box.
   * @param halfHeight The half height of the box.
   * @returns Whether this collider intersects the specified oriented rectangular box.
   */
  intersectsBox(cx: number, cy: number, axisX: number, axisY: number, halfWidth: number, halfHeight: number, mapProjection: MapProjection): boolean;

  /**
   * Tests whether this collider intersects a circle.
   * @param cx The x coordinate of the center of the circle.
   * @param cy The y coordinate of the center of the circle.
   * @param radius The radius of the circle.
   * @returns Whether this collider intersects the specified circle.
   */
  intersectsCircle(cx: number, cy: number, radius: number, mapProjection: MapProjection): boolean;

  /**
   * Destroys this collider.
   */
  destroy(): void;
}

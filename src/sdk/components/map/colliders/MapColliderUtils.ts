import { Vec2Math } from '../../../math/VecMath';
import { ArrayUtils } from '../../../utils/datastructures/ArrayUtils';
import { MapCollider } from './MapCollider';
import { MapIndexedCollider } from './MapIndexedCollider';

/**
 * A utility class for working with map colliders.
 */
export class MapColliderUtils {
  /**
   * Checks whether a query value is a {@link MapCollider}.
   * @param query The query value to check.
   * @returns Whether the specified query value is a `MapCollider`.
   */
  public static isCollider(query: unknown): query is MapCollider {
    return typeof query === 'object' && query !== null && (query as any).isMapCollider === true;
  }

  /**
   * Checks whether a query value is a {@link MapIndexedCollider}.
   * @param query The query value to check.
   * @returns Whether the specified query value is a `MapCollider`.
   */
  public static isIndexedCollider(query: unknown): query is MapIndexedCollider {
    return typeof query === 'object' && query !== null && (query as any).isMapIndexedCollider === true;
  }

  /**
   * Tests whether two circles intersect.
   * @param c1x The x coordinate of the center of the first circle.
   * @param c1y The y coordinate of the center of the first circle.
   * @param c1Radius The radius of the first circle.
   * @param c2x The x coordinate of the center of the second circle.
   * @param c2y The x coordinate of the center of the second circle.
   * @param c2Radius The radius of the second circle.
   * @returns Whether the two specified circles intersect.
   */
  public static circle2Intersection(c1x: number, c1y: number, c1Radius: number, c2x: number, c2y: number, c2Radius: number): boolean {
    return Math.hypot(c2x - c1x, c2y - c1y) <= c1Radius + c2Radius;
  }

  /**
   * Tests whether two axis-aligned bounding boxes (AABB) intersect. AABBs are rectangles whose horizontal and vertical
   * axes are aligned with the x and y axes, respectively.
   * @param b1x1 The x coordinate of the first box's minimum-x edge.
   * @param b1y1 The y coordinate of the first box's minimum-y edge.
   * @param b1x2 The x coordinate of the first box's maximum-x edge.
   * @param b1y2 The y coordinate of the first box's maximum-y edge.
   * @param b2x1 The x coordinate of the second box's minimum-x edge.
   * @param b2y1 The y coordinate of the second box's minimum-y edge.
   * @param b2x2 The x coordinate of the second box's maximum-x edge.
   * @param b2y2 The y coordinate of the second box's maximum-y edge.
   * @returns Whether the two axis-aligned bounding boxes (AABB) intersect.
   */
  public static aabb2Intersection(b1x1: number, b1y1: number, b1x2: number, b1y2: number, b2x1: number, b2y1: number, b2x2: number, b2y2: number): boolean {
    return b1x1 <= b2x2 && b1x2 >= b2x1 && b1y1 <= b2y2 && b1y2 >= b2y1;
  }

  /**
   * Tests whether an axis-aligned bounding box (AABB) intersects a circle. 
   * @param bx1 The x coordinate of the box's minimum-x edge.
   * @param by1 The y coordinate of the box's minimum-y edge.
   * @param bx2 The x coordinate of the box's maximum-x edge.
   * @param by2 The y coordinate of the box's maximum-y edge.
   * @param cx The x coordinate of the center of the circle.
   * @param cy The y coordinate of the center of the circle.
   * @param cRadius The radius of the circle.
   * @returns Whether the specified axis-aligned bounding box (AABB) and circle intersect.
   */
  public static aabbCircleIntersection(bx1: number, by1: number, bx2: number, by2: number, cx: number, cy: number, cRadius: number): boolean {
    // Check whether the center of the circle is within the axis-aligned bounding box that has the same width as the
    // given box and whose top and bottom bounds are extended outwards from the given box by a distance equal to the
    // circle's radius.
    if (cx <= bx2 && cx >= bx1) {
      return cy <= by2 + cRadius && cy >= by1 - cRadius;
    }

    // Check whether the center of the circle is within the axis-aligned bounding box that has the same height as the
    // given box and whose left and right bounds are extended outwards from the given box by a distance equal to the
    // circle's radius.
    if (cy <= by2 && cy >= by1) {
      return cx <= bx2 + cRadius && cx >= bx1 - cRadius;
    }

    // At this point, the circle can only intersect the box if the distance between the circle's center and any one of
    // this box's corners is less than or equal to the circle's radius.

    if (cRadius > 0) {
      if (cx < bx1 && cy < by1) {
        return Math.hypot(cx - bx1, cy - by1) <= cRadius;
      } else if (cx > bx2 && cy < by1) {
        return Math.hypot(cx - bx2, cy - by1) <= cRadius;
      } else if (cx < bx1 && cy > by2) {
        return Math.hypot(cx - bx1, cy - by2) <= cRadius;
      } else {
        return Math.hypot(cx - bx2, cy - by2) <= cRadius;
      }
    } else {
      return false;
    }
  }

  private static readonly obb2IntersectionCache = {
    axes: ArrayUtils.create(4, () => Vec2Math.create()),
    delta: Vec2Math.create(),
  };

  /**
   * Tests whether two oriented bounding boxes (OBB) intersect. OBBs are rectangles whose horizontal and vertical axes
   * have arbitrary orientations relative to the x and y axes.
   * @param b1x The x coordinate of the center of the first box.
   * @param b1y The y coordinate of the center of the first box.
   * @param b1AxisX The x component of the unit vector parallel to the axis that defines the first box's _width_.
   * @param b1AxisY The y component of the unit vector parallel to the axis that defines the first box's _width_.
   * @param b1HalfWidth The half width of the first box.
   * @param b1HalfHeight The half height of the first box.
   * @param b2x The x coordinate of the center of the second box.
   * @param b2y The y coordinate of the center of the second box.
   * @param b2AxisX The x component of the unit vector parallel to the axis that defines the second box's _width_.
   * @param b2AxisY The y component of the unit vector parallel to the axis that defines the second box's _width_.
   * @param b2HalfWidth The half width of the second box.
   * @param b2HalfHeight The half height of the second box.
   * @returns Whether the two oriented bounding boxes (OBB) intersect.
   */
  public static obb2Intersection(
    b1x: number,
    b1y: number,
    b1AxisX: number,
    b1AxisY: number,
    b1HalfWidth: number,
    b1HalfHeight: number,
    b2x: number,
    b2y: number,
    b2AxisX: number,
    b2AxisY: number,
    b2HalfWidth: number,
    b2HalfHeight: number,
  ): boolean {
    // Check if we can trivially convert this into an AABB x AABB test.

    const isb1AlignedWithX = b1AxisY === 0;
    const isb1AlignedWithY = b1AxisX === 0;
    const isb2AlignedWithX = b2AxisY === 0;
    const isb2AlignedWithY = b2AxisX === 0;

    if ((isb1AlignedWithX || isb1AlignedWithY) && (isb2AlignedWithX || isb2AlignedWithY)) {
      if (isb1AlignedWithY) {
        const width = b1HalfWidth;
        b1HalfWidth = b1HalfHeight;
        b1HalfHeight = width;
      }

      if (isb2AlignedWithY) {
        const width = b2HalfWidth;
        b2HalfWidth = b2HalfHeight;
        b2HalfHeight = width;
      }

      return MapColliderUtils.aabb2Intersection(
        b1x - b1HalfWidth, b1y - b1HalfHeight, b1x + b1HalfWidth, b1y + b1HalfHeight,
        b2x - b2HalfWidth, b2y - b2HalfHeight, b2x + b2HalfWidth, b2y + b2HalfHeight
      );
    }

    // The following algorithm is based on the Separating Axis Theorem, which gives us the following two true
    // statements:
    // - Two rectangles do not intersect if and only if there exists a separating axis between the two.
    // - The separating axis between two rectangles, if it exists, must be parallel to one of the edges of the two
    //   rectangles.

    // Define unit vectors parallel to all four possible axes (two axes per rectangle).
    const axes = MapColliderUtils.obb2IntersectionCache.axes;
    Vec2Math.set(b1AxisX, b1AxisY, axes[0]);
    Vec2Math.normal(axes[0], axes[1]);
    Vec2Math.set(b2AxisX, b2AxisY, axes[2]);
    Vec2Math.normal(axes[2], axes[3]);

    // The vector from the center of box 1 to the center of box 2.
    const delta = Vec2Math.set(b2x - b1x, b2y - b1y, MapColliderUtils.obb2IntersectionCache.delta);

    // Check each axis to see if it is a separating axis.
    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];

      const deltaProjected = Math.abs(Vec2Math.dot(delta, axis));
      const b1WidthProjected = b1HalfWidth * Math.abs(Vec2Math.dot(axes[0], axis));
      const b1HeightProjected = b1HalfHeight * Math.abs(Vec2Math.dot(axes[1], axis));
      const b2WidthProjected = b2HalfWidth * Math.abs(Vec2Math.dot(axes[2], axis));
      const b2HeightProjected = b2HalfHeight * Math.abs(Vec2Math.dot(axes[3], axis));

      if (deltaProjected > b1WidthProjected + b1HeightProjected + b2WidthProjected + b2HeightProjected) {
        return false;
      }
    }

    return true;
  }

  /**
   * Tests whether an oriented bounding box (OBB) intersects a circle. 
   * @param bx The x coordinate of the center of the box.
   * @param by The y coordinate of the center of the box.
   * @param bAxisX The x component of the unit vector parallel to the axis that defines the box's _width_.
   * @param bAxisY The y component of the unit vector parallel to the axis that defines the box's _width_.
   * @param bHalfWidth The half width of the box.
   * @param bHalfHeight The half height of the box.
   * @param cx The x coordinate of the center of the circle.
   * @param cy The y coordinate of the center of the circle.
   * @param cRadius The radius of the circle.
   * @returns Whether the specified oriented bounding box (OBB) and circle intersect.
   */
  public static obbCircleIntersection(
    bx: number,
    by: number,
    bAxisX: number,
    bAxisY: number,
    bHalfWidth: number,
    bHalfHeight: number,
    cx: number,
    cy: number,
    cRadius: number
  ): boolean {
    // Transform the coordinate system so that it is aligned with the axes of the box and the origin is located at the
    // center of the box. Then perform an AABB x circle intersection test.

    const dx = cx - bx;
    const dy = cy - by;

    const sin = -bAxisY;
    const cos = bAxisX;

    const rotatedCx = dx * cos - dy * sin;
    const rotatedCy = dx * sin + dy * cos;

    return MapColliderUtils.aabbCircleIntersection(-bHalfWidth, -bHalfHeight, bHalfWidth, bHalfHeight, rotatedCx, rotatedCy, cRadius);
  }
}

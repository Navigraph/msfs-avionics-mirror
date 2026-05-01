import { MapCollider } from './MapCollider';
import { MapProjection } from '../MapProjection';

/**
 * A collection of {@link MapCollider} objects. This collection supports collision (intersection) testing against
 * simple shapes on all members of the collection at once, allowing you to enumerate all members that collide with a
 * given shape.
 * 
 * Members are stored using a regular hash set, allowing for fast, constant-time addition and removal of colliders to
 * and from the collection. This also means that collision tests on the collection have linear time complexity with
 * respect to the size of the collection. Therefore, it is recommended to use this collection with colliders that
 * implement relatively fast intersection tests and/or restrict the size of the collection to a reasonable limit.
 */
export class MapColliderCollection {
  private readonly colliders = new Set<MapCollider>();

  private isAlive = true;

  /**
   * Registers a collider with this collection.
   * @param collider The collider to register.
   * @throws Error if this collection has been destroyed.
   */
  public register(collider: MapCollider): void {
    if (!this.isAlive) {
      throw new Error('MapColliderCollection::register(): cannot manipulate a dead collection');
    }

    this.colliders.add(collider);
  }

  /**
   * Deregisters a collider with this collection.
   * @param collider The collider to deregister.
   * @throws Error if this collection has been destroyed.
   */
  public deregister(collider: MapCollider): void {
    if (!this.isAlive) {
      throw new Error('MapColliderCollection::deregister(): cannot manipulate a dead collection');
    }

    this.colliders.delete(collider);
  }

  /**
   * Finds all colliders in this collection that intersect an oriented rectangular box.
   * @param cx The x coordinate of the center of the box.
   * @param cy The y coordinate of the center of the box.
   * @param axisX The x component of the unit vector parallel to the axis that defines the box's _width_.
   * @param axisY The y component of the unit vector parallel to the axis that defines the box's _width_.
   * @param halfWidth The half width of the box.
   * @param halfHeight The half height of the box.
   * @param mapProjection The map projection.
   * @param out The array to which to write the results.
   * @returns All colliders in this collection that intersect the specified oriented rectangular box, in order of
   * decreasing priority.
   * @throws Error if this collection has been destroyed.
   */
  public intersectBox(
    cx: number,
    cy: number,
    axisX: number,
    axisY: number,
    halfWidth: number,
    halfHeight: number,
    mapProjection: MapProjection,
    out: unknown[]
  ): MapCollider[] {
    if (!this.isAlive) {
      throw new Error('MapColliderCollection::intersectBox(): cannot query a dead collection');
    }

    let index = 0;

    for (const collider of this.colliders) {
      if (collider.intersectsBox(cx, cy, axisX, axisY, halfWidth, halfHeight, mapProjection)) {
        out[index++] = collider;
      }
    }

    out.length = index;

    (out as MapCollider[]).sort(MapColliderCollection.compareColliders);

    return out as MapCollider[];
  }

  /**
   * Finds all colliders in this collection that intersect a circle.
   * @param cx The x coordinate of the center of the circle.
   * @param cy The y coordinate of the center of the circle.
   * @param radius The radius of the circle.
   * @param mapProjection The map projection.
   * @param out The array to which to write the results.
   * @returns All colliders in this collection that intersect the specified circle, in order of decreasing priority.
   * @throws Error if this collection has been destroyed.
   */
  public intersectCircle(
    cx: number,
    cy: number,
    radius: number,
    mapProjection: MapProjection,
    out: unknown[]
  ): MapCollider[] {
    if (!this.isAlive) {
      throw new Error('MapColliderCollection::intersectCircle(): cannot query a dead collection');
    }

    let index = 0;

    for (const collider of this.colliders) {
      if (collider.intersectsCircle(cx, cy, radius, mapProjection)) {
        out[index++] = collider;
      }
    }

    out.length = index;

    (out as MapCollider[]).sort(MapColliderCollection.compareColliders);

    return out as MapCollider[];
  }

  /**
   * Destroys this collection.
   */
  public destroy(): void {
    this.isAlive = false;

    this.colliders.clear();
  }

  /**
   * Compares two colliders.
   * @param a The first collider to compare.
   * @param b The second collider to compare.
   * @returns A negative number if the first collider is ordered before the second, a positive number if the first
   * collider is ordered after the second, or zero if both colliders have equivalent ordering.
   */
  private static compareColliders(a: MapCollider, b: MapCollider): number {
    return b.getPriority() - a.getPriority();
  }
}

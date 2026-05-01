import { ReadonlyFloat64Array } from '../../../math/VecMath';
import { Subscribable } from '../../../sub/Subscribable';
import { MapCollider } from './MapCollider';

/**
 * A map element that supports collision detection against simple shapes and can be spatially indexed.
 */
export interface MapIndexedCollider extends MapCollider {
  /** Flags this object as a `MapIndexedCollider`. */
  readonly isMapIndexedCollider: true;

  /**
   * This collider's axis-aligned bounding box, as `[minX, minY, maxX, maxY]` in pixels.
   */
  readonly boundingBox: Subscribable<ReadonlyFloat64Array>;
}

import { ReadonlyFloat64Array, VecNMath } from '../../../math/VecMath';
import { Subscription } from '../../../sub/Subscription';
import { MapColliderUtils } from './MapColliderUtils';
import { MapIndexedCollider } from './MapIndexedCollider';
import { MapProjection } from '../MapProjection';

/**
 * A cell in a spatial index tree for {@link MapIndexedColliderCollection}.
 */
type Cell = {
  /** The index of this cell. */
  index: number;

  /** The depth of this cell in the spatial index tree. The root cell has a depth of zero. */
  depth: number;

  /** The minimum x boundary of this cell. */
  minX: number;

  /** The minimum y boundary of this cell. */
  minY: number;

  /** The maximum x boundary of this cell. */
  maxX: number;

  /** The maximum y boundary of this cell. */
  maxY: number;

  /** The x coordinate of the center of this cell. */
  centerX: number;

  /** The y coordinate of the center of this cell. */
  centerY: number;

  /**
   * If this cell is a leaf, the colliders whose axis-aligned bounding boxes are at least partially contained in this
   * cell. Otherwise, this is undefined.
   */
  colliders?: Set<ColliderEntry>;
};

/**
 * A leaf cell in a spatial index tree for {@link MapIndexedColliderCollection}.
 */
type LeafCell = Cell & {
  /** The colliders whose axis-aligned bounding boxes are at least partially contained in this cell. */
  colliders: Set<ColliderEntry>;
};

/**
 * An entry for a collider registered with a {@link MapIndexedColliderCollection}.
 */
type ColliderEntry = {
  /** The collider. */
  collider: MapIndexedCollider;

  /** The cells whose boundaries at least partially contain the collider's axis-aligned bounding box. */
  cells: LeafCell[];

  /** The subscription to the collider's bounding box. */
  boundingBoxSub: Subscription;

  /** The ID of the last intersection test that this entry's collider passed. */
  lastIntersectionTestId?: number;
};

/**
 * Configuration options for {@link MapIndexedColliderCollection}.
 */
export type MapIndexedColliderCollectionOptions = {
  /**
   * The depth of the collection's spatial index tree. A depth of zero effectively disables spatial indexing. Each
   * increase of one in depth halves the area of the leaf cells (nodes) into which the collection's colliders are
   * ultimately sorted. Larger depths potentially increase the performance of intersection queries on the collection,
   * but also increase the overhead needed to maintain the spatial index. Defaults to `0`.
   * @see {@link MapIndexedColliderCollection.getDepth | MapIndexedColliderCollection.getDepth()}
   * @see {@link MapIndexedColliderCollection.setDepth | MapIndexedColliderCollection.setDepth()}
   */
  depth?: number;

  /**
   * The axis along which the collection's spatial index tree first splits its cells. At each successive level of the
   * tree, the axis along with the cells are split alternates between x (horizontal) and y (vertical). The `'x'` option
   * will cause the tree to split along the x axis at level 1, then the y axis at level 2, then the x axis at level 3,
   * etc. The `'y'` option will cause the tree to split along the y axis at level 1, then the x axis at level 2, then
   * the y axis at level 3, etc. The `'auto'` option will cause the tree to select the first-split axis to be the one
   * along which the collection's {@link MapIndexedColliderCollection.getBounds | bounds} is longest. Defaults to
   * `'auto'`.
   * @see {@link MapIndexedColliderCollection.getFirstSplitAxis | MapIndexedColliderCollection.getFirstSplitAxis()}
   * @see {@link MapIndexedColliderCollection.setFirstSplitAxis | MapIndexedColliderCollection.setFirstSplitAxis()}
   */
  firstSplitAxis?: 'x' | 'y' | 'auto';
};

/**
 * A spatially indexed collection of {@link MapIndexedCollider} objects. This collection supports collision
 * (intersection) testing against simple shapes on all members of the collection at once, allowing you to enumerate all
 * members that collide with a given shape.
 * 
 * Members are stored in a spatial index tree. The tree divides the area contained in the collection's
 * {@link getBounds | bounds} in half at each depth level, alternating between the x (horizontal) and y (vertical) axes
 * at each successive level. Each division forms a cell (node) in the tree. When a collider is added to the collection,
 * it is sorted into those cells that intersect its axis-aligned bounding box. This partitioning scheme results in an
 * expected `O(n / 2^d + d)` time complexity for intersection tests against the collection, where `n` is the number of
 * colliders in the collection and `d` is the depth of the tree. This assumes colliders are at least roughly uniformly
 * distributed in position and most colliders are sorted into only one leaf cell.
 */
export class MapIndexedColliderCollection {
  private readonly colliders = new Map<MapIndexedCollider, ColliderEntry>();

  private readonly invalidated = new Set<ColliderEntry>();

  private depth: number;
  private readonly bounds = VecNMath.create(4);

  private readonly cells: Cell[] = [];
  private firstSplitAxis: 'x' | 'y' | 'auto';
  private firstSplitAxisIndex: 0 | 1;

  private intersectionTestId = 0;

  private isAlive = true;

  /**
   * Creates a new instance of MapIndexedColliderCollection. The collection is created with initial
   * {@link getBounds | bounds} of size zero.
   * @param options Options with which to configure the collection.
   */
  public constructor(options?: Readonly<MapIndexedColliderCollectionOptions>) {
    this.depth = Math.max(options?.depth ?? 0, 0);

    switch (options?.firstSplitAxis) {
      case 'x':
        this.firstSplitAxis = 'x';
        this.firstSplitAxisIndex = 0;
        break;
      case 'y':
        this.firstSplitAxis = 'y';
        this.firstSplitAxisIndex = 1;
        break;
      default:
        this.firstSplitAxis = 'auto';
        this.firstSplitAxisIndex = 0;
    }

    this.rebuildIndex();
  }

  /**
   * Gets the bounds of this collection, as `[minX, minY, maxX, maxY]` in pixels. Intersection tests against this
   * collection that fall outside the bounds will always fail to return any intersections.
   * @returns The bounds of this collection, as `[minX, minY, maxX, maxY]` in pixels.
   * @throws Error if this collection has been destroyed.
   * @see {@link setBounds | setBounds()}
   */
  public getBounds(): ReadonlyFloat64Array {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::getBounds(): cannot query a dead collection');
    }

    return this.bounds;
  }

  /**
   * Gets the depth of this collection's spatial index tree. A depth of zero effectively disables spatial indexing.
   * Each increase of one in depth halves the area of the cells (buckets) into which the collection's colliders are
   * sorted.
   * @returns The depth of this collection's spatial index tree.
   * @throws Error if this collection has been destroyed.
   * @see {@link setDepth | setDepth()}
   */
  public getDepth(): number {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::getDepth(): cannot query a dead collection');
    }

    return this.depth;
  }

  /**
   * Gets the axis along which the collection's spatial index tree first splits its cells. At each successive level of
   * the tree, the axis along with the cells are split alternates between x (horizontal) and y (vertical). The `'x'`
   * option indicates the tree is split along the x axis at level 1, then the y axis at level 2, then the x axis at
   * level 3, etc. The `'y'` option indicates the tree is split along the y axis at level 1, then the x axis at level
   * 2, then the y axis at level 3, etc. The `'auto'` option indicates the tree automatically selects the first-split
   * axis to be the one along which the collection's {@link getBounds | bounds} is longest.
   * @returns The axis along which the collection's spatial index tree first splits its cells.
   * @throws Error if this collection has been destroyed.
   * @see {@link setFirstSplitAxis | setFirstSplitAxis()}
   */
  public getFirstSplitAxis(): 'x' | 'y' | 'auto' {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::getFirstSplitAxis(): cannot query a dead collection');
    }

    return this.firstSplitAxis;
  }

  /**
   * Sets the bounds of this collection. Intersection tests against this collection that fall outside the bounds will
   * always fail to return any intersections.
   * @param bounds The bounds to set, as `[minX, minY, maxX, maxY]` in pixels.
   * @throws Error if this collection has been destroyed.
   * @see {@link getBounds | getBounds()}
   * @see {@link setParams | setParams()}
   */
  public setBounds(bounds: ReadonlyFloat64Array): void {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::setBounds(): cannot manipulate a dead collection');
    }

    this.setParams(bounds, this.depth, this.firstSplitAxis);
  }

  /**
   * Sets the depth of this collection's spatial index tree. A depth of zero effectively disables spatial indexing.
   * Each increase of one in depth halves the area of the cells (buckets) into which the collection's colliders are
   * sorted. Larger depths potentially increase the performance of intersection queries on the collection, but also
   * increase the overhead needed to maintain the spatial index.
   * @param depth The depth to set.
   * @throws Error if this collection has been destroyed.
   * @see {@link getDepth | getDepth()}
   * @see {@link setParams | setParams()}
   */
  public setDepth(depth: number): void {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::setDepth(): cannot manipulate a dead collection');
    }

    this.setParams(this.bounds, depth, this.firstSplitAxis);
  }

  /**
   * Sets the axis along which the collection's spatial index tree first splits its cells. At each successive level of
   * the tree, the axis along with the cells are split alternates between x (horizontal) and y (vertical). The `'x'`
   * option will cause the tree to split along the x axis at level 1, then the y axis at level 2, then the x axis at
   * level 3, etc. The `'y'` option will cause the tree to split along the y axis at level 1, then the x axis at level
   * 2, then the y axis at level 3, etc. The `'auto'` option will cause the tree to select the first-split axis to be
   * the one along which the collection's {@link getBounds | bounds} is longest.
   * @param axis The axis to set.
   * @throws Error if this collection has been destroyed.
   * @see {@link getFirstSplitAxis | getFirstSplitAxis()}
   * @see {@link setParams | setParams()}
   */
  public setFirstSplitAxis(axis: 'x' | 'y' | 'auto'): void {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::setFirstSplitAxis(): cannot manipulate a dead collection');
    }

    this.setParams(this.bounds, this.depth, axis);
  }

  /**
   * Sets various parameters of this collection. Calling this method when changing multiple parameters is more
   * efficient than calling the methods to set the individual parameters separately.
   * @param bounds The bounds of this collection to set, as `[minX, minY, maxX, maxY]` in pixels. If not defined, then
   * the bounds will not be changed. See {@link setBounds | setBounds()} for more information on setting bounds.
   * @param depth The depth of this collection's spatial index tree to set. If not defined, then the depth will not be
   * changed. See {@link setDepth | setDepth()} on setting depth.
   * @param firstSplitAxis The axis along which the collection's spatial index tree first splits its cells. If not
   * defined, then the first-split axis will not be changed. See {@link setFirstSplitAxis | setFirstSplitAxis()} for
   * more information on setting the first-split axis.
   * @throws Error if this collection has been destroyed.
   */
  public setParams(bounds?: ReadonlyFloat64Array, depth?: number, firstSplitAxis?: 'x' | 'y' | 'auto'): void {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::setParams(): cannot manipulate a dead collection');
    }

    let needRebuildIndex = false;

    if (bounds) {
      if (!VecNMath.equals(bounds, this.bounds)) {
        VecNMath.copy(bounds, this.bounds);
        needRebuildIndex = true;
      }
    }


    if (depth !== undefined) {
      const newDepth = Math.max(depth, 0);
      if (newDepth !== this.depth) {
        this.depth = depth;
        needRebuildIndex = true;
      }
    }

    if (firstSplitAxis !== undefined) {
      if (firstSplitAxis !== this.firstSplitAxis) {
        this.firstSplitAxis = firstSplitAxis;
        needRebuildIndex = true;
      }
    }

    if (needRebuildIndex) {
      this.rebuildIndex();
    }
  }

  /**
   * Rebuilds this collection's spatial index tree.
   */
  private rebuildIndex(): void {
    const [boundsMinX, boundsMinY, boundsMaxX, boundsMaxY] = this.bounds;

    const width = boundsMaxX - boundsMinX;
    const height = boundsMaxY - boundsMinY;

    if (width <= 0 || height <= 0) {
      this.cells.length = 0;
      return;
    }

    if (this.firstSplitAxis === 'auto') {
      this.firstSplitAxisIndex = width >= height ? 0 : 1;
    }

    // Root cell.
    this.cells[0] = {
      index: 0,
      depth: 0,
      minX: boundsMinX,
      minY: boundsMinY,
      maxX: boundsMaxX,
      maxY: boundsMaxY,
      centerX: 0.5 * (boundsMinX + boundsMaxX),
      centerY: 0.5 * (boundsMinY + boundsMaxY),
      colliders: this.depth === 0 ? new Set() : undefined,
    };

    const len = (1 << (this.depth + 1)) - 1;
    for (let index = 1; index < len; index++) {
      const parent = this.cells[MapIndexedColliderCollection.parentCell(index)];

      const splitAxis = (this.firstSplitAxisIndex + parent.depth) % 2;
      const isLesserChild = index % 2 === 1;

      let minX: number, minY: number, maxX: number, maxY: number;

      if (splitAxis === 0) {
        // x axis

        if (isLesserChild) {
          minX = parent.minX;
          maxX = 0.5 * (parent.minX + parent.maxX);
        } else {
          minX = 0.5 * (parent.minX + parent.maxX);
          maxX = parent.maxX;
        }

        minY = parent.minY;
        maxY = parent.maxY;
      } else {
        // y axis

        if (isLesserChild) {
          minY = parent.minY;
          maxY = 0.5 * (parent.minY + parent.maxY);
        } else {
          minY = 0.5 * (parent.minY + parent.maxY);
          maxY = parent.maxY;
        }

        minX = parent.minX;
        maxX = parent.maxX;
      }

      const depth = parent.depth + 1;

      this.cells[index] = {
        index,
        depth,
        minX,
        minY,
        maxX,
        maxY,
        centerX: 0.5 * (minX + maxX),
        centerY: 0.5 * (minY + maxY),
        colliders: depth === this.depth ? new Set() : undefined,
      };
    }

    for (const entry of this.colliders.values()) {
      entry.cells.length = 0;
      this.addColliderToIndex(entry);
    }

    this.invalidated.clear();
  }

  /**
   * Adds a collider to this collection's spatial index.
   * @param entry The entry for the collider to add.
   */
  private addColliderToIndex(entry: ColliderEntry): void {
    if (this.cells.length === 0) {
      return;
    }

    const boundingBox = entry.collider.boundingBox.get();

    if (!(isNaN(boundingBox[0]) || isNaN(boundingBox[1]) || isNaN(boundingBox[2]) || isNaN(boundingBox[3]))) {
      this.tryAddColliderToCell(this.cells[0], entry, boundingBox);
    }
  }

  /**
   * Attempts to add a collider to a spatial index tree cell.
   * @param cell The cell to which to add the collider.
   * @param entry The entry for the collider to add.
   * @param colliderBox The axis-aligned bounding box of the collider to add.
   */
  private tryAddColliderToCell(
    cell: Cell,
    entry: ColliderEntry,
    colliderBox: ReadonlyFloat64Array
  ): void {
    if (!MapColliderUtils.aabb2Intersection(
      cell.minX, cell.minY, cell.maxX, cell.maxY,
      colliderBox[0], colliderBox[1], colliderBox[2], colliderBox[3]
    )) {
      return;
    }

    if (cell.colliders) {
      // We are at a leaf cell. Add the collider to the cell.

      cell.colliders.add(entry);
      entry.cells.push(cell as LeafCell);
    } else {
      // We are not at a leaf cell. Try to add the collider to both children.

      this.tryAddColliderToCell(this.cells[MapIndexedColliderCollection.lesserChildCell(cell.index)], entry, colliderBox);
      this.tryAddColliderToCell(this.cells[MapIndexedColliderCollection.greaterChildCell(cell.index)], entry, colliderBox);
    }
  }

  /**
   * Registers a collider with this collection.
   * @param collider The collider to register.
   * @throws Error if this collection has been destroyed.
   */
  public register(collider: MapIndexedCollider): void {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::register(): cannot manipulate a dead collection');
    }

    if (this.colliders.has(collider)) {
      return;
    }

    const entry: ColliderEntry = {
      collider,
      cells: [],
      boundingBoxSub: collider.boundingBox.sub(() => { this.onColliderBoundingBoxChanged(entry); }, false)
    };
    this.colliders.set(collider, entry);

    this.addColliderToIndex(entry);
  }

  /**
   * Deregisters a collider with this collection.
   * @param collider The collider to deregister.
   * @throws Error if this collection has been destroyed.
   */
  public deregister(collider: MapIndexedCollider): void {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::deregister(): cannot manipulate a dead collection');
    }

    const entry = this.colliders.get(collider);
    if (entry) {
      entry.boundingBoxSub.destroy();

      for (const cell of entry.cells) {
        cell.colliders.delete(entry);
      }

      this.invalidated.delete(entry);
      this.colliders.delete(collider);
    }
  }

  /**
   * Responds to when the bounding box of a collider registered with this collection changes.
   * @param entry The entry for the collider whose bounding box changed.
   */
  private onColliderBoundingBoxChanged(entry: ColliderEntry): void {
    this.invalidated.add(entry);
  }

  /**
   * Finds all colliders in this collection that intersect an oriented rectangular box. If the specified box lies
   * outside this collection's bounds, then the test is guaranteed to return zero colliders.
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
  ): MapIndexedCollider[] {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::intersectBox(): cannot query a dead collection');
    }

    this.revalidate();

    if (this.cells.length === 0) {
      out.length = 0;
      return out as MapIndexedCollider[];
    }

    out.length = this.intersectBoxHelper(this.intersectionTestId++, this.cells[0], cx, cy, axisX, axisY, halfWidth, halfHeight, mapProjection, out, 0);

    (out as MapIndexedCollider[]).sort(MapIndexedColliderCollection.compareColliders);

    return out as MapIndexedCollider[];
  }

  /**
   * Finds all colliders contained in a cell that intersect an oriented rectangular box.
   * @param testId The ID of the intersection test.
   * @param cell The cell for which to perform the intersection test.
   * @param cx The x coordinate of the center of the box.
   * @param cy The y coordinate of the center of the box.
   * @param axisX The x component of the unit vector parallel to the axis that defines the box's _width_.
   * @param axisY The y component of the unit vector parallel to the axis that defines the box's _width_.
   * @param halfWidth The half width of the box.
   * @param halfHeight The half height of the box.
   * @param mapProjection The map projection.
   * @param out The array to which to write the results.
   * @param outIndex The index of the results array at which to start adding colliders.
   * @returns The number of colliders added to the results array.
   */
  private intersectBoxHelper(
    testId: number,
    cell: Cell,
    cx: number,
    cy: number,
    axisX: number,
    axisY: number,
    halfWidth: number,
    halfHeight: number,
    mapProjection: MapProjection,
    out: unknown[],
    outIndex: number
  ): number {
    if (!MapColliderUtils.obb2Intersection(
      cell.centerX, cell.centerY, 1, 0, cell.centerX - cell.minX, cell.centerY - cell.minY,
      cx, cy, axisX, axisY, halfWidth, halfHeight
    )) {
      return 0;
    }

    const originalOutIndex = outIndex;

    if (cell.colliders) {
      // We are at a leaf cell. Test the query shape against all colliders in the cell.

      for (const entry of cell.colliders) {
        if (
          // Because a collider can be in multiple cells, only add the collider to the results array if it has not
          // already been marked as passing the current intersection test (via entry.lastIntersectionTestId).
          entry.lastIntersectionTestId !== testId
          && entry.collider.intersectsBox(cx, cy, axisX, axisY, halfWidth, halfHeight, mapProjection)
        ) {
          entry.lastIntersectionTestId = testId;
          out[outIndex++] = entry;
        }
      }
    } else {
      // We are not at a leaf cell. Traverse both children.

      outIndex += this.intersectBoxHelper(
        testId,
        this.cells[MapIndexedColliderCollection.lesserChildCell(cell.index)],
        cx,
        cy,
        axisX,
        axisY,
        halfWidth,
        halfHeight,
        mapProjection,
        out,
        outIndex,
      );

      outIndex += this.intersectBoxHelper(
        testId,
        this.cells[MapIndexedColliderCollection.greaterChildCell(cell.index)],
        cx,
        cy,
        axisX,
        axisY,
        halfWidth,
        halfHeight,
        mapProjection,
        out,
        outIndex,
      );
    }

    return outIndex - originalOutIndex;
  }

  /**
   * Finds all colliders in this collection that intersect a circle. If the specified circle lies outside this
   * collection's bounds, then the test is guaranteed to return zero colliders.
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
  ): MapIndexedCollider[] {
    if (!this.isAlive) {
      throw new Error('MapIndexedColliderCollection::intersectCircle(): cannot query a dead collection');
    }

    this.revalidate();

    if (this.cells.length === 0) {
      out.length = 0;
      return out as MapIndexedCollider[];
    }

    out.length = this.intersectCircleHelper(this.intersectionTestId++, this.cells[0], cx, cy, radius, mapProjection, out, 0);

    (out as MapIndexedCollider[]).sort(MapIndexedColliderCollection.compareColliders);

    return out as MapIndexedCollider[];
  }

  /**
   * Finds all colliders contained in a cell that intersect a circle.
   * @param testId The ID of the intersection test.
   * @param cell The cell for which to perform the intersection test.
   * @param cx The x coordinate of the center of the circle.
   * @param cy The y coordinate of the center of the circle.
   * @param radius The radius of the circle.
   * @param mapProjection The map projection.
   * @param out The array to which to write the results.
   * @param outIndex The index of the results array at which to start adding colliders.
   * @returns The number of colliders added to the results array.
   */
  private intersectCircleHelper(
    testId: number,
    cell: Cell,
    cx: number,
    cy: number,
    radius: number,
    mapProjection: MapProjection,
    out: unknown[],
    outIndex: number
  ): number {
    if (!MapColliderUtils.obbCircleIntersection(
      cell.centerX, cell.centerY, 1, 0, cell.centerX - cell.minX, cell.centerY - cell.minY,
      cx, cy, radius
    )) {
      return 0;
    }

    const originalOutIndex = outIndex;

    if (cell.colliders) {
      // We are at a leaf cell. Test the query shape against all colliders in the cell.

      for (const entry of cell.colliders) {
        if (
          // Because a collider can be in multiple cells, only add the collider to the results array if it has not
          // already been marked as passing the current intersection test (via entry.lastIntersectionTestId).
          entry.lastIntersectionTestId !== testId
          && entry.collider.intersectsCircle(cx, cy, radius, mapProjection)
        ) {
          entry.lastIntersectionTestId = testId;
          out[outIndex++] = entry;
        }
      }
    } else {
      // We are not at a leaf cell. Traverse both children.

      outIndex += this.intersectCircleHelper(
        testId,
        this.cells[MapIndexedColliderCollection.lesserChildCell(cell.index)],
        cx,
        cy,
        radius,
        mapProjection,
        out,
        outIndex,
      );

      outIndex += this.intersectCircleHelper(
        testId,
        this.cells[MapIndexedColliderCollection.greaterChildCell(cell.index)],
        cx,
        cy,
        radius,
        mapProjection,
        out,
        outIndex,
      );
    }

    return outIndex - originalOutIndex;
  }

  /**
   * Revalidates this collection's spatial index tree. After this operation is completed, all invalidated colliders
   * will have been moved to the correct cells for their current bounding boxes.
   */
  private revalidate(): void {
    if (this.invalidated.size === 0) {
      return;
    }

    if (this.cells.length > 0) {
      this.invalidated.forEach(this.revalidateColliderFunc);
    }

    this.invalidated.clear();
  }

  private readonly revalidateColliderFunc = this.revalidateCollider.bind(this);

  /**
   * Revalidates a collider. After this operation is completed, the collider will have been moved to the correct
   * cell(s) for its current bounding box.
   * @param entry The entry for the collider to revalidate.
   */
  private revalidateCollider(entry: ColliderEntry): void {
    const colliderBox = entry.collider.boundingBox.get();

    // Check for the special case where the collider was only in one leaf cell. If this is the case, then we will
    // check whether the collider is still only in that same leaf cell. If most colliders are smaller than a cell and
    // only move short distances between revalidations, then this will allow us to avoid the relatively more costly
    // process of re-inserting the collider into the index for most invalidated colliders.
    if (
      entry.cells.length === 1
      && MapIndexedColliderCollection.isBoxEntirelyInCell(colliderBox, entry.cells[0])
    ) {
      return;
    }

    for (const cell of entry.cells) {
      cell.colliders.delete(entry);
    }
    entry.cells.length = 0;

    this.addColliderToIndex(entry);
  }

  /**
   * Destroys this collection.
   */
  public destroy(): void {
    this.isAlive = false;

    for (const entry of this.colliders.values()) {
      entry.boundingBoxSub.destroy();
    }

    this.colliders.clear();
    this.invalidated.clear();

    this.cells.length = 0;
  }

  /**
   * Finds the index of a cell's parent.
   * @param index The index of the cell for which to find the parent.
   * @returns The index of the query cell's parent.
   */
  private static parentCell(index: number): number {
    return (index - 1) >> 1;
  }

  /**
   * Finds the index of a cell's lesser child.
   * @param index The index of the cell for which to find the child.
   * @returns The index of the query cell's lesser child.
   */
  private static lesserChildCell(index: number): number {
    return index * 2 + 1;
  }

  /**
   * Finds the index of a cell's greater child.
   * @param index The index of the cell for which to find the child.
   * @returns The index of the query cell's greater child.
   */
  private static greaterChildCell(index: number): number {
    return index * 2 + 2;
  }

  /**
   * Checks whether an axis-aligned bounding box lies entirely within a cell. A bounding box lies entirely within a
   * cell if and only if the entire bounding box is inside the cell bounds and none of the edges of the bounding box
   * crosses or is coincident with any edge of the cell bounds.
   * @param box The axis-aligned bounding box to check, as `[minX, minY, maxX, maxY]`.
   * @param cell The cell to check against.
   * @returns Whether the specified bounding box lies entirely within the specified cell.
   */
  private static isBoxEntirelyInCell(box: ReadonlyFloat64Array, cell: Cell): boolean {
    return box[0] > cell.minX
      && box[1] > cell.minY
      && box[2] < cell.maxX
      && box[3] < cell.maxY;
  }

  /**
   * Compares two colliders.
   * @param a The first collider to compare.
   * @param b The second collider to compare.
   * @returns A negative number if the first collider is ordered before the second, a positive number if the first
   * collider is ordered after the second, or zero if both colliders have equivalent ordering.
   */
  private static compareColliders(a: MapIndexedCollider, b: MapIndexedCollider): number {
    return b.getPriority() - a.getPriority();
  }
}

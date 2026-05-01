import { GeoCircle, ReadonlyGeoCircle } from '../../geo/GeoCircle';
import { LatLonInterface } from '../../geo/GeoInterfaces';
import { GeoMath } from '../../geo/GeoMath';
import { GeoPoint } from '../../geo/GeoPoint';
import { MathUtils } from '../../math/MathUtils';
import { ReadonlyFloat64Array, Vec3Math } from '../../math/VecMath';
import { ArrayUtils } from '../../utils/datastructures/ArrayUtils';
import { FlightPathUtils } from './FlightPathUtils';
import { VectorTurnDirection } from './FlightPathVector';

/**
 * A representation of a "turn" (a geo-circle path) that connects two other geo circles (the FROM and TO circles). The
 * turn is always tangent to the FROM and TO circles and is parallel to these circles at the respective tangent points;
 * the turn starts at the tangent point with the FROM circle and ends at the tangent point with the TO circle. The turn
 * can be adjusted by specifying either its turn radius or the distance (angular offset) of its start or end point from
 * an anchor point as measured along the FROM or TO circle. Anchor points are those points that minimize the distance
 * from both the FROM and TO circles and therefore the turn radius is minimized at the anchor point.
 */
export class FlightPathCircleToCircleTurn {
  private static readonly vec3Cache = ArrayUtils.create(3, () => Vec3Math.create());
  private static readonly geoCircleCache = ArrayUtils.create(2, () => new GeoCircle(Vec3Math.create(), 0));

  private readonly _fromCircle = new GeoCircle(Vec3Math.create(), NaN);
  /** The circle on which this turn begins (the FROM circle). */
  public readonly fromCircle = this._fromCircle as ReadonlyGeoCircle;

  private readonly _toCircle = new GeoCircle(Vec3Math.create(), NaN);
  /** The circle on which this turn ends (the TO circle). */
  public readonly toCircle = this._toCircle as ReadonlyGeoCircle;

  private readonly intersections = [Vec3Math.create(), Vec3Math.create()];
  private intersectionCount = 0;
  private readonly intersectionsWithCount: ReadonlyFloat64Array[] = [];

  private readonly floatingAnchor = Vec3Math.create();

  private readonly anchors: ReadonlyFloat64Array[] = [];
  private readonly anchorsMinTurnRadius: number[] = [0, 0];

  private _areAnchorsUpdated = false;

  private selectedAnchorIndex = -1;
  private selectedAnchorSide: -1 | 1 = -1;

  private pathAngleDelta: number | undefined = undefined;

  private _isTurnValid = false;

  private turnDirection: VectorTurnDirection = 'left';

  private readonly workingFromCircle = new GeoCircle(Vec3Math.create(), NaN);
  private readonly workingToCircle = new GeoCircle(Vec3Math.create(), NaN);

  private workingFromCircleDirection: -1 | 1 = 1;
  private workingToCircleDirection: -1 | 1 = 1;

  private sinD = 0;
  private cosD = 0;

  private fromBeta = 0;
  private toBeta = 0;

  private sinFromRadius = 0;
  private cosFromRadius = 0;

  private sinToRadius = 0;
  private cosToRadius = 0;

  private minTurnRadius = 0;
  private maxTurnRadius = 0;
  private maxTurnRadiusFromAlpha = 0;
  private maxTurnRadiusToAlpha = 0;

  private turnRadius = 0;
  private fromAlpha = 0;
  private toAlpha = 0;

  private readonly turnCenter = Vec3Math.create();
  private readonly turnStart = Vec3Math.create();
  private readonly turnEnd = Vec3Math.create();

  /**
   * Checks whether the potential anchor points for this turn have been updated since the last time the FROM or TO
   * circle was changed. The anchor points can be updated by calling `updateAnchors()`.
   * @returns Whether the potential anchor points for this turn have been updated since the last time the FROM or TO
   * circle was changed.
   */
  public areAnchorsUpdated(): boolean {
    return this._areAnchorsUpdated;
  }

  /**
   * Gets the intersection points between this turn's FROM and TO circles.
   * @returns The intersection points between this turn's FROM and TO circles.
   * @throws Error if the potential anchor points have not been updated since the last time either the FROM or TO
   * circle was changed.
   */
  public getIntersections(): readonly ReadonlyFloat64Array[] {
    if (!this._areAnchorsUpdated) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to access anchors that are not updated');
    }

    return this.intersectionsWithCount;
  }

  /**
   * Gets the potential anchor points for this turn. If this turn's FROM and TO circles intersect at a finite number
   * of points (if the array returned by `this.getIntersections()` is not empty), then the potential anchor points are
   * the same as the intersection points. If this turn's FROM and TO circles do not intersect, then any potential
   * anchor points are floating anchor points that do not lie on either the FROM or TO circle. Floating anchor points
   * are always positioned such that they are equidistant from the FROM and TO circles and the distance from the point
   * to both circles is minimized.
   * @returns The potential anchor points for this turn.
   * @throws Error if the potential anchor points have not been updated since the last time either the FROM or TO
   * circle was changed.
   */
  public getAnchors(): readonly ReadonlyFloat64Array[] {
    if (!this._areAnchorsUpdated) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to access anchors that are not updated');
    }

    return this.anchors;
  }

  /**
   * Gets the selected anchor point for this turn.
   * @returns The selected anchor point for this turn, or `undefined` if no anchor point has been selected.
   * @throws Error if the potential anchor points have not been updated since the last time either the FROM or TO
   * circle was changed.
   */
  public getSelectedAnchor(): ReadonlyFloat64Array | undefined {
    if (!this._areAnchorsUpdated) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to access anchors that are not updated');
    }

    return this.anchors[this.selectedAnchorIndex];
  }

  /**
   * Gets the selected side of this turn's anchor point on which the turn starts.
   * @returns The selected side of this turn's anchor point on which the turn starts. A value of `-1` indicates that
   * the turn starts prior to the anchor point, as measured along the FROM circle. A value of `1` indicates that the
   * turn starts after the anchor point, as measured along the FROM circle.
   */
  public getSelectedAnchorSide(): -1 | 1 {
    return this.selectedAnchorSide;
  }

  /**
   * Gets the angular difference, in radians, between the course along this turn's FROM circle and the course along
   * this turn's TO circle at the selected anchor point. If the anchor point is a floating anchor point, then the
   * courses along the FROM and TO circles are measured at the projections of the anchor point onto the circles.
   * @returns The angular difference, in radians, between the course along this turn's FROM circle and the course along
   * this turn's TO circle at the selected anchor point (or its projections onto the circles), or `undefined` if no
   * anchor point has been selected. Positive values indicate the shortest turn from the course along the FROM circle
   * to the course along the TO circle is to the right. Negative values indicate shortest turn is to the left.
   * @throws Error if the potential anchor points have not been updated since the last time either the FROM or TO
   * circle was changed.
   */
  public getAngleDelta(): number | undefined {
    if (!this._areAnchorsUpdated) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to access anchors that are not updated');
    }

    return this.pathAngleDelta;
  }

  /**
   * Checks whether this turn is valid. A turn is considered valid if all of the following conditions are satisfied:
   * * The FROM and TO circles are well-defined with non-zero radii.
   * * The FROM and TO circles are not coincident or concentric.
   * * The anchor points between the FROM and TO circles have been updated.
   * * An anchor point has been selected.
   * @returns Whether this turn is valid.
   */
  public isTurnValid(): boolean {
    return this._isTurnValid;
  }

  /**
   * Gets this turn's turn radius, in great-arc radians. Values greater than `pi / 2` represent a reversal of the
   * normal direction for this turn; in this case the physical turn radius can be obtained as `pi - [turn radius]`.
   * @returns This turn's turn radius, in great-arc radians.
   * @throws Error if this turn is not valid.
   */
  public getTurnRadius(): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return this.turnRadius;
  }

  /**
   * Gets the angular offset from the start of this turn to this turn's anchoring intersection point, as measured along
   * this turn's FROM circle in radians.
   * @returns The angular offset from the start of this turn to this turn's anchoring intersection point, as measured
   * along this turn's FROM circle in radians.
   * @throws Error if this turn is not valid.
   */
  public getStartAngularOffset(): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return this.fromAlpha;
  }

  /**
   * Gets the angular offset from this turn's anchoring intersection point to the end of this turn, as measured along
   * this turn's TO circle in radians.
   * @returns The angular offset from this turn's anchoring intersection point to the end of this turn, as measured
   * along this turn's TO circle in radians.
   * @throws Error if this turn is not valid.
   */
  public getEndAngularOffset(): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return this.toAlpha;
  }

  /**
   * Gets the direction of this turn.
   * @returns The direction of this turn.
   * @throws Error if this turn is not valid.
   */
  public getTurnDirection(): VectorTurnDirection {
    return this.getTurnDirectionForTurnRadius(this.turnRadius);
  }

  /**
   * Gets the minimum possible turn radius for this turn, in great-arc radians. This is the equivalent to the required
   * turn radius when the angular offsets between this turn's start and end points to the anchor point, as measured
   * along the FROM and TO circles, are both zero.
   * @returns The minimum possible turn radius for this turn, in great-arc radians.
   * @throws Error if this turn is not valid.
   */
  public getMinTurnRadius(): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return this.minTurnRadius;
  }

  /**
   * Gets the maximum possible turn radius for this turn, in great-arc radians. Values greater than `pi / 2` represent
   * a reversal of the normal direction for this turn; in this case the physical turn radius can be obtained as
   * `pi - [turn radius]`.
   * @returns The maximum possible turn radius for this turn, in great-arc radians.
   * @throws Error if this turn is not valid.
   */
  public getMaxTurnRadius(): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return this.maxTurnRadius;
  }

  /**
   * Gets the angular offset from the start of this turn to this turn's anchor point, as measured along this turn's
   * FROM circle in radians, assuming this turn takes the maximum possible turn radius.
   * @returns The angular offset from the start of this turn to this turn's anchor point, as measured along this turn's
   * FROM circle in radians, assuming this turn takes the maximum possible turn radius.
   * @throws Error if this turn is not valid.
   */
  public getStartAngularOffsetForMaxTurnRadius(): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return this.maxTurnRadiusFromAlpha;
  }

  /**
   * Gets the angular offset from this turn's anchor point to the end of this turn, as measured along this turn's TO
   * circle in radians, assuming this turn takes the maximum possible turn radius.
   * @returns The angular offset from this turn's anchor point to the end of this turn, as measured along this turn's
   * TO circle in radians, assuming this turn takes the maximum possible turn radius.
   * @throws Error if this turn is not valid.
   */
  public getEndAngularOffsetForMaxTurnRadius(): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return this.maxTurnRadiusToAlpha;
  }

  /**
   * Gets the angular offset from the start of this turn to this turn's anchor point, as measured along this turn's
   * FROM circle in radians, assuming this turn takes a given turn radius.
   * @param radius The turn radius, in great-arc radians. The radius will be clamped to be greater than or equal to
   * the minimum possible turn radius and less than or equal to the maximum possible turn radius. Values greater than
   * `pi / 2` are acceptable (as long as they are not greater than the maximum possible turn radius) and represent a
   * reversal of the normal direction for this turn.
   * @returns The angular offset from the start of this turn to this turn's anchor point, as measured along this turn's
   * FROM circle in radians, assuming this turn takes the specified turn radius.
   * @throws Error if this turn is not valid.
   */
  public getStartAngularOffsetForTurnRadius(radius: number): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (radius <= this.minTurnRadius) {
      return 0;
    } else if (radius >= this.maxTurnRadius) {
      return this.maxTurnRadiusFromAlpha;
    }

    return Math.max(
      this.turnRadiusToAlpha(radius, this.fromBeta, this.workingFromCircle.radius, this.workingToCircle.radius),
      0
    );
  }

  /**
   * Gets the angular offset from this turn's anchor point to the end of this turn, as measured along this turn's TO
   * circle in radians, assuming this turn takes a given turn radius.
   * @param radius The turn radius, in great-arc radians. The radius will be clamped to be greater than or equal to
   * the minimum possible turn radius and less than or equal to the maximum possible turn radius. Values greater than
   * `pi / 2` are acceptable (as long as they are not greater than the maximum possible turn radius) and represent a
   * reversal of the normal direction for this turn.
   * @returns The angular offset from this turn's anchor point to the end of this turn, as measured along this turn's
   * TO circle in radians, assuming this turn takes the specified turn radius.
   * @throws Error if this turn is not valid.
   */
  public getEndAngularOffsetForTurnRadius(radius: number): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (radius <= this.minTurnRadius) {
      return 0;
    } else if (radius >= this.maxTurnRadius) {
      return this.maxTurnRadiusToAlpha;
    }

    return Math.max(
      this.turnRadiusToAlpha(radius, this.toBeta, this.workingToCircle.radius, this.workingFromCircle.radius),
      0
    );
  }

  /**
   * Gets the radius of this turn, in great-arc radians, assuming the angular offset from the start of this turn to
   * this turn's anchor point, as measured along this turn's FROM circle, takes a given value.
   * @param angle The angular offset from the start of the turn to the anchor point, as measured along the FROM circle,
   * in radians. The angular offset will be clamped to be greater than or equal to zero and less than or equal to the
   * angular offset of the maximum-radius turn.
   * @returns The radius of this turn, in great-arc radians, assuming the angular offset from the start of this turn to
   * this turn's anchor point, as measured along this turn's FROM circle, takes the specified value.
   * @throws Error if this turn is not valid.
   */
  public getTurnRadiusForStartAngularOffset(angle: number): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (angle <= 0) {
      return this.minTurnRadius;
    } else if (angle >= this.maxTurnRadiusFromAlpha) {
      return this.maxTurnRadius;
    }

    return MathUtils.clamp(
      this.alphaToTurnRadius(angle, this.fromBeta, this.sinFromRadius, this.cosFromRadius, this.sinToRadius, this.cosToRadius),
      this.minTurnRadius,
      this.maxTurnRadius
    );
  }

  /**
   * Gets the radius of this turn, in great-arc radians, assuming the angular offset from this turn's anchor point to
   * the end of this turn, as measured along this turn's TO circle, takes a given value.
   * @param angle The angular offset from this turn's anchor point to the end of this turn, as measured along this
   * turn's TO circle, in radians. The angular offset will be clamped to be greater than or equal to zero and less than
   * or equal to the angular offset of the maximum-radius turn.
   * @returns The radius of this turn, in great-arc radians, assuming the angular offset from this turn's anchor point
   * to the end of this turn, as measured along this turn's TO circle, takes the specified value.
   * @throws Error if this turn is not valid.
   */
  public getTurnRadiusForEndAngularOffset(angle: number): number {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (angle <= 0) {
      return this.minTurnRadius;
    } else if (angle >= this.maxTurnRadiusToAlpha) {
      return this.maxTurnRadius;
    }

    return MathUtils.clamp(
      this.alphaToTurnRadius(angle, this.toBeta, this.sinToRadius, this.cosToRadius, this.sinFromRadius, this.cosFromRadius),
      this.minTurnRadius,
      this.maxTurnRadius
    );
  }

  /**
   * Gets the direction of this turn, assuming this turn takes a given turn radius.
   * @param radius The turn radius, in great-arc radians. The radius will be clamped to be greater than or equal to
   * zero and less than or equal to the maximum possible turn radius. Values greater than `pi / 2` are acceptable (as
   * long as they are not greater than the maximum possible turn radius) and represent a reversal of the normal
   * direction for this turn.
   * @returns The direction of this turn, assuming this turn takes the specified turn radius.
   * @throws Error if this turn is not valid.
   */
  public getTurnDirectionForTurnRadius(radius: number): VectorTurnDirection {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return (this.turnDirection === 'left') === MathUtils.clamp(radius, 0, this.maxTurnRadius) <= MathUtils.HALF_PI ? 'left' : 'right';
  }

  /**
   * Gets the direction of this turn, assuming the angular offset from the start of this turn to this turn's anchor
   * point, as measured along this turn's FROM circle, takes a given value.
   * @param angle The angular offset from the start of the turn to the anchor point, as measured along the FROM circle,
   * in radians. The angular offset will be clamped to be greater than or equal to zero and less than or equal to the
   * angular offset of the maximum-radius turn.
   * @returns The direction of this turn, assuming the angular offset from the start of this turn to this turn's
   * anchor point, as measured along this turn's FROM circle, takes the specified value.
   * @throws Error if this turn is not valid.
   */
  public getTurnDirectionStartAngularOffset(angle: number): VectorTurnDirection {
    return this.getTurnDirectionForTurnRadius(this.getTurnRadiusForStartAngularOffset(angle));
  }

  /**
   * Gets the direction of this turn, assuming the angular offset from this turn's anchor point to the end of this
   * turn, as measured along this turn's TO circle, takes a given value.
   * @param angle The angular offset from this turn's anchor point to the end of this turn, as measured along this
   * turn's TO circle, in radians. The angular offset will be clamped to be greater than or equal to zero and less than
   * or equal to the angular offset of the maximum-radius turn.
   * @returns The direction of this turn, assuming the angular offset from this turn's anchor point to the end of this
   * turn, as measured along this turn's TO circle, takes the specified value.
   * @throws Error if this turn is not valid.
   */
  public getTurnDirectionEndAngularOffset(angle: number): VectorTurnDirection {
    return this.getTurnDirectionForTurnRadius(this.getTurnRadiusForEndAngularOffset(angle));
  }

  /**
   * Gets a geo circle that defines the path of this turn.
   * @param out The geo circle to which to write the result.
   * @returns A geo circle that defines the path of this turn.
   * @throws Error if this turn is not valid.
   */
  public getTurnCircle(out: GeoCircle): GeoCircle {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    return FlightPathUtils.getTurnCircle(
      this.turnCenter,
      this.turnRadius,
      this.turnDirection,
      out
    );
  }

  /**
   * Gets the start point of this turn.
   * @param out The GeoPoint or 3D vector to which to write the result.
   * @returns The start point of this turn.
   * @throws Error if this turn is not valid.
   */
  public getTurnStart<T extends GeoPoint | Float64Array>(out: T): T {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (out instanceof Float64Array) {
      return Vec3Math.copy(this.turnStart, out) as T;
    } else {
      return out.setFromCartesian(this.turnStart) as T;
    }
  }

  /**
   * Gets the end point of this turn.
   * @param out The GeoPoint or 3D vector to which to write the result.
   * @returns The end point of this turn.
   * @throws Error if this turn is not valid.
   */
  public getTurnEnd<T extends GeoPoint | Float64Array>(out: T): T {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (out instanceof Float64Array) {
      return Vec3Math.copy(this.turnEnd, out) as T;
    } else {
      return out.setFromCartesian(this.turnEnd) as T;
    }
  }

  /**
   * Sets the center and radius of the circle on which this turn begins (the FROM circle).
   * @param center The center to set.
   * @param radius The radius to set, in great-arc radians.
   * @returns This turn, after the FROM circle has been set.
   */
  public setFromCircle(center: ReadonlyFloat64Array | Readonly<LatLonInterface>, radius: number): this;
  /**
   * Sets the circle on which this turn begins (the FROM circle) to be equal to a given geo circle.
   * @param circle The circle to which to set the FROM circle.
   * @returns This turn, after the FROM circle has been set.
   */
  public setFromCircle(circle: ReadonlyGeoCircle): this;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public setFromCircle(arg1: ReadonlyFloat64Array | Readonly<LatLonInterface> | ReadonlyGeoCircle, arg2?: number): this {
    if (arg1 instanceof GeoCircle) {
      this._fromCircle.set(arg1.center, arg1.radius);
    } else {
      this._fromCircle.set(arg1 as ReadonlyFloat64Array | Readonly<LatLonInterface>, arg2 as number);
    }

    this.invalidateAnchors();

    return this;
  }

  /**
   * Sets the center and radius of the circle on which this turn ends (the TO circle).
   * @param center The center to set.
   * @param radius The radius to set, in great-arc radians.
   * @returns This turn, after the TO circle has been set.
   */
  public setToCircle(center: ReadonlyFloat64Array | Readonly<LatLonInterface>, radius: number): this;
  /**
   * Sets the circle on which this turn ends (the TO circle) to be equal to a given geo circle.
   * @param circle The circle to which to set the TO circle.
   * @returns This turn, after the TO circle has been set.
   */
  public setToCircle(circle: ReadonlyGeoCircle): this;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public setToCircle(arg1: ReadonlyFloat64Array | Readonly<LatLonInterface> | ReadonlyGeoCircle, arg2?: number): this {
    if (arg1 instanceof GeoCircle) {
      this._toCircle.set(arg1.center, arg1.radius);
    } else {
      this._toCircle.set(arg1 as ReadonlyFloat64Array | Readonly<LatLonInterface>, arg2 as number);
    }

    this.invalidateAnchors();

    return this;
  }

  /**
   * Invalidates the potential anchor points for this turn.
   */
  private invalidateAnchors(): void {
    this._areAnchorsUpdated = false;
    this._isTurnValid = false;
  }

  /**
   * Updates the potential anchor points for this turn. This will also deselect the selected anchor point, if any, and
   * reset this turn's turn radius to zero.
   * @param tolerance The error tolerance with which to calculate anchor points, in great-arc radians. Defaults to
   * zero.
   * @returns This turn, after the potential anchor points have been updated.
   */
  public updateAnchors(tolerance = 0): this {
    if (
      !this._fromCircle.isValid()
      || !this._toCircle.isValid()
      || FlightPathUtils.getTurnRadiusFromCircle(this._fromCircle) <= GeoMath.ANGULAR_TOLERANCE
      || FlightPathUtils.getTurnRadiusFromCircle(this._toCircle) <= GeoMath.ANGULAR_TOLERANCE
    ) {
      this.intersectionCount = 0;
      this.intersectionsWithCount.length = 0;
      this.anchors.length = 0;
    } else {
      this.intersectionCount = this._fromCircle.intersection(this._toCircle, this.intersections, tolerance);

      if (this.intersectionCount > 0) {
        // The FROM and TO circles are either tangent or secant. In this case we will use the intersection points
        // as the anchor points.

        for (let i = 0; i < this.intersectionCount; i++) {
          this.anchors[i] = this.intersectionsWithCount[i] = this.intersections[i];
          this.anchorsMinTurnRadius[i] = 0;
        }

        this.intersectionsWithCount.length = this.intersectionCount;
        this.anchors.length = this.intersectionCount;
      } else {
        // The FROM and TO circles either do not intersect or are coincident. 

        this.intersectionsWithCount.length = 0;

        const fromTurnCircle = FlightPathCircleToCircleTurn.geoCircleCache[0].set(this._fromCircle.center, this._fromCircle.radius);
        if (fromTurnCircle.radius > MathUtils.HALF_PI) {
          fromTurnCircle.reverse();
        }

        const toTurnCircle = FlightPathCircleToCircleTurn.geoCircleCache[1].set(this._toCircle.center, this._toCircle.radius);
        if (toTurnCircle.radius > MathUtils.HALF_PI) {
          toTurnCircle.reverse();
        }

        let hasAnchor = false;
        let minTurnRadius = 0;

        const fromToTurnCirclesDistance = Vec3Math.unitAngle(fromTurnCircle.center, toTurnCircle.center);
        if (Math.min(fromToTurnCirclesDistance, Math.PI - fromToTurnCirclesDistance) <= tolerance) {
          // The circles are concentric. In this case we don't define any anchor points.

          this.anchors.length = 0;
        } else if (fromToTurnCirclesDistance > Math.max(fromTurnCircle.radius, toTurnCircle.radius)) {
          // Neither turn circle encircles the other. In this case we only define an anchor point if the FROM and TO
          // circles have the same turn direction.

          if (FlightPathUtils.getTurnDirectionFromCircle(this._fromCircle) === FlightPathUtils.getTurnDirectionFromCircle(this._toCircle)) {
            const fromTurnCircleProjected = fromTurnCircle.closest(toTurnCircle.center, FlightPathCircleToCircleTurn.vec3Cache[0]);
            const toTurnCircleProjected = toTurnCircle.closest(fromTurnCircle.center, FlightPathCircleToCircleTurn.vec3Cache[1]);

            if (Vec3Math.isFinite(fromTurnCircleProjected) && Vec3Math.isFinite(toTurnCircleProjected)) {
              Vec3Math.set(
                (fromTurnCircleProjected[0] + toTurnCircleProjected[0]) * 0.5,
                (fromTurnCircleProjected[1] + toTurnCircleProjected[1]) * 0.5,
                (fromTurnCircleProjected[2] + toTurnCircleProjected[2]) * 0.5,
                this.floatingAnchor
              );

              hasAnchor = true;
              minTurnRadius = Math.max((fromToTurnCirclesDistance - (fromTurnCircle.radius + toTurnCircle.radius)) * 0.5, 0);
            }
          }
        } else {
          // One turn circle encircles the other. In this case we only define anchor points if the FROM and TO circles
          // have different turn direction.

          if (FlightPathUtils.getTurnDirectionFromCircle(this._fromCircle) !== FlightPathUtils.getTurnDirectionFromCircle(this._toCircle)) {
            let smallerTurnCircle: GeoCircle;
            let largerTurnCircle: GeoCircle;

            if (fromTurnCircle.radius <= toTurnCircle.radius) {
              smallerTurnCircle = fromTurnCircle;
              largerTurnCircle = toTurnCircle;
            } else {
              smallerTurnCircle = toTurnCircle;
              largerTurnCircle = fromTurnCircle;
            }

            const largerTurnCircleProjected = largerTurnCircle.closest(smallerTurnCircle.center, FlightPathCircleToCircleTurn.vec3Cache[0]);
            const smallerTurnCircleProjected = smallerTurnCircle.closest(largerTurnCircleProjected, FlightPathCircleToCircleTurn.vec3Cache[1]);

            Vec3Math.set(
              (largerTurnCircleProjected[0] + smallerTurnCircleProjected[0]) * 0.5,
              (largerTurnCircleProjected[1] + smallerTurnCircleProjected[1]) * 0.5,
              (largerTurnCircleProjected[2] + smallerTurnCircleProjected[2]) * 0.5,
              this.floatingAnchor
            );

            hasAnchor = true;
            minTurnRadius = Math.max((largerTurnCircle.radius - (fromToTurnCirclesDistance + smallerTurnCircle.radius)) * 0.5, 0);
          }
        }

        if (hasAnchor) {
          this.anchors[0] = this.floatingAnchor;
          this.anchorsMinTurnRadius[0] = minTurnRadius;
          this.anchors.length = 1;
        } else {
          this.anchors.length = 0;
        }
      }
    }

    this._areAnchorsUpdated = true;

    this.setSelectedAnchorIndex(-1);

    return this;
  }

  /**
   * Selects the anchor point for this turn.
   * 
   * Changing the anchor point will also reset this turn's turn radius to zero.
   * @param index The index of the anchor point to select in the array returned by `getAnchors()`. Specifying a
   * negative index will unselect the currently selected point, if any.
   * @returns This turn, after the anchor point has been selected.
   * @throws Error if the potential anchor points have not been updated since the last time either the FROM or TO
   * circle was changed.
   * @throws RangeError if `index` is greater than or equal to the length of the array returned by
   * `getAnchors()`.
   */
  public selectAnchor(index: number): this {
    if (!this._areAnchorsUpdated) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to access anchors that are not updated');
    }

    if (index >= this.anchors.length) {
      throw new RangeError(`FlightPathCircleToCircleTurn: attempted to select an invalid anchor (selected index ${index}, anchor count ${this.anchors.length})`);
    } else {
      this.setSelectedAnchorIndex(index);
    }

    return this;
  }

  /**
   * Selects the anchor point for this turn that is closest to a given point. If there are no potential anchor points,
   * then no point will be selected. If there are two anchor points and they are equidistant from the specified point,
   * then the anchor point at index zero will be arbitrarily selected.
   * 
   * Changing the anchor point will also reset this turn's turn radius to zero.
   * @param point The point to which the selected anchor point should be closest.
   * @returns This turn, after the anchor point has been selected.
   * @throws Error if the potential anchor points have not been updated since the last time either the FROM or TO
   * circle was changed.
   */
  public selectClosestAnchor(point: ReadonlyFloat64Array | Readonly<LatLonInterface>): this {
    if (!this._areAnchorsUpdated) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to access anchors that are not updated');
    }

    if (this.anchors.length < 2) {
      this.setSelectedAnchorIndex(this.anchors.length - 1);
    } else {
      if (!(point instanceof Float64Array)) {
        point = GeoPoint.sphericalToCartesian(point as Readonly<LatLonInterface>, FlightPathCircleToCircleTurn.vec3Cache[0]);
      }

      // The dot product of two points is the cosine of the angle between them. The cosine function is monotonically
      // decreasing in the domain [0, pi], so a larger dot product means less distance between the points.
      if (Vec3Math.dot(point, this.anchors[0]) >= Vec3Math.dot(point, this.anchors[1])) {
        this.setSelectedAnchorIndex(0);
      } else {
        this.setSelectedAnchorIndex(1);
      }
    }

    return this;
  }

  /**
   * Sets the index of this turn's anchoring intersection point. Changing the anchoring intersection point will also
   * reset this turn's turn radius to zero.
   * 
   * **Important:** This method assumes that the intersection points of this turn's FROM and TO circles have been
   * updated.
   * @param index The index to set.
   */
  private setSelectedAnchorIndex(index: number): void {
    if (index >= this.intersectionCount) {
      return;
    }

    const newIndex = Math.max(index, -1);

    if (newIndex === this.selectedAnchorIndex) {
      return;
    }

    this.selectedAnchorIndex = newIndex;

    const anchor = this.anchors[this.selectedAnchorIndex] as ReadonlyFloat64Array | undefined;

    if (anchor) {
      const fromCircleAnchorNormal = GeoCircle.getGreatCircleNormal(anchor, this._fromCircle, FlightPathCircleToCircleTurn.vec3Cache[0]);
      const toCircleAnchorNormal = GeoCircle.getGreatCircleNormal(anchor, this._toCircle, FlightPathCircleToCircleTurn.vec3Cache[1]);

      const dot = Vec3Math.dot(
        GeoCircle.getGreatCircleNormal(anchor, this._toCircle.center, FlightPathCircleToCircleTurn.vec3Cache[2]),
        this._fromCircle.center
      );

      this.pathAngleDelta = Vec3Math.unitAngle(fromCircleAnchorNormal, toCircleAnchorNormal) * (dot > 0 ? 1 : -1);
    } else {
      this.pathAngleDelta = undefined;
    }

    this.updateWorkingCircles();
  }

  /**
   * Selects the side of this turn's anchor point on which the turn starts.
   * @param side The side to select. A value of `-1` sets the turn to start prior to the anchor point, as measured
   * along the FROM circle. A value of `1` sets the turn to start after the anchor point, as measured along the FROM
   * circle.
   * @returns This turn, after the side has been selected.
   */
  public selectAnchorSide(side: -1 | 1): this {
    if (this.selectedAnchorSide !== side) {
      this.selectedAnchorSide = side;

      if (this._areAnchorsUpdated) {
        this.updateWorkingCircles();
      }
    }

    return this;
  }

  /**
   * Sets this turn's turn radius. This will also change the angular offsets of this turn's start and end points from
   * the anchor point to be consistent with the new radius.
   * @param radius The turn radius to set, in great-arc radians. The radius will be clamped to be greater than or equal
   * to the minimum possible turn radius and less than or equal to the maximum possible turn radius. Values greater
   * than `pi / 2` are acceptable (as long as they are not greater than the maximum possible turn radius) and represent
   * a reversal of the normal direction for this turn.
   * @returns This turn, after the turn radius has been set.
   * @throws Error if this turn is not valid.
   */
  public setTurnRadius(radius: number): this {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (radius <= this.minTurnRadius) {
      this.turnRadius = this.minTurnRadius;
      this.fromAlpha = 0;
      this.toAlpha = 0;
    } else if (radius >= this.maxTurnRadius) {
      this.turnRadius = this.maxTurnRadius;
      this.fromAlpha = this.maxTurnRadiusFromAlpha;
      this.toAlpha = this.maxTurnRadiusToAlpha;
    } else {
      this.turnRadius = radius;
      this.fromAlpha = Math.max(
        this.turnRadiusToAlpha(radius, this.fromBeta, this.workingFromCircle.radius, this.workingToCircle.radius),
        0
      );
      this.toAlpha = Math.max(
        this.turnRadiusToAlpha(radius, this.toBeta, this.workingToCircle.radius, this.workingFromCircle.radius),
        0
      );
    }

    this.updateTurn();

    return this;
  }

  /**
   * Sets the angular offset from the start of this turn to this turn's anchor point, as measured along this turn's
   * FROM circle. This will also change this turn's turn radius and the angular offset of this turn's end point from
   * the anchor point to be consistent with the new start point angular offset.
   * @param angle The angular offset to set, in radians. The angular offset will be clamped to be greater than or equal
   * to zero and less than or equal to the angular offset of the maximum-radius turn.
   * @returns This turn, after the angular offset has been set.
   * @throws Error if this turn is not valid.
   */
  public setStartAngularOffset(angle: number): this {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (angle <= 0) {
      this.turnRadius = this.minTurnRadius;
      this.fromAlpha = 0;
      this.toAlpha = 0;
    } else if (angle >= this.maxTurnRadiusFromAlpha) {
      this.turnRadius = this.maxTurnRadius;
      this.fromAlpha = this.maxTurnRadiusFromAlpha;
      this.toAlpha = this.maxTurnRadiusToAlpha;
    } else {
      this.turnRadius = MathUtils.clamp(
        this.alphaToTurnRadius(angle, this.fromBeta, this.sinFromRadius, this.cosFromRadius, this.sinToRadius, this.cosToRadius),
        this.minTurnRadius,
        this.maxTurnRadius
      );
      this.fromAlpha = angle;
      this.toAlpha = Math.max(
        this.turnRadiusToAlpha(this.turnRadius, this.toBeta, this.workingToCircle.radius, this.workingFromCircle.radius),
        0
      );
    }

    this.updateTurn();

    return this;
  }

  /**
   * Sets the angular offset from this turn's anchor point to the end of this turn, as measured along this turn's TO
   * circle. This will also change this turn's turn radius and the angular offset of this turn's start point from the
   * anchor point to be consistent with the new end point angular offset.
   * @param angle The angular offset to set, in radians. The angular offset will be clamped to be greater than or equal
   * to zero and less than or equal to the angular offset of the maximum-radius turn.
   * @returns This turn, after the angular offset has been set.
   * @throws Error if this turn is not valid.
   */
  public setEndAngularOffset(angle: number): this {
    if (!this._isTurnValid) {
      throw new Error('FlightPathCircleToCircleTurn: attempted to query an invalid turn');
    }

    if (angle <= 0) {
      this.turnRadius = this.minTurnRadius;
      this.fromAlpha = 0;
      this.toAlpha = 0;
    } else if (angle >= this.maxTurnRadiusToAlpha) {
      this.turnRadius = this.maxTurnRadius;
      this.fromAlpha = this.maxTurnRadiusFromAlpha;
      this.toAlpha = this.maxTurnRadiusToAlpha;
    } else {
      this.turnRadius = MathUtils.clamp(
        this.alphaToTurnRadius(angle, this.toBeta, this.sinToRadius, this.cosToRadius, this.sinFromRadius, this.cosFromRadius),
        this.minTurnRadius,
        this.maxTurnRadius
      );
      this.fromAlpha = Math.max(
        this.turnRadiusToAlpha(this.turnRadius, this.fromBeta, this.workingFromCircle.radius, this.workingToCircle.radius),
        0
      );
      this.toAlpha = angle;
    }

    this.updateTurn();

    return this;
  }

  /**
   * Updates this turn's working TO and FROM circles based on the selected anchor point and anchor point side. This
   * turn's validity flag will be set based on whether valid working circles could be computed. This also resets this
   * turn's turn radius to the minimum possible radius.
   * 
   * **Important:** This method assumes that the intersection points of this turn's FROM and TO circles have been
   * updated.
   */
  private updateWorkingCircles(): void {
    const anchor = this.anchors[this.selectedAnchorIndex] as ReadonlyFloat64Array | undefined;

    if (!anchor || this.pathAngleDelta === undefined) {
      this._isTurnValid = false;
      return;
    }

    const isFromCircleRightTurn = this._fromCircle.radius > MathUtils.HALF_PI;
    const isToCircleRightTurn = this._toCircle.radius > MathUtils.HALF_PI;

    let isTurnDirectionRight: boolean;

    const pathAngleDeltaAbs = Math.abs(this.pathAngleDelta);
    if (Math.min(pathAngleDeltaAbs, Math.PI - pathAngleDeltaAbs) <= GeoMath.ANGULAR_TOLERANCE) {
      // The FROM circle is tangent to the TO circle, or the anchor is a floating anchor. Find whether the FROM circle
      // is parallel or antiparallel to the TO circle at the tangent point or the projected floating anchor point.

      if (pathAngleDeltaAbs < MathUtils.HALF_PI) {
        // The FROM circle is parallel to the TO circle. There can be no valid turns.

        this._isTurnValid = false;
        return;
      } else {
        // The FROM circle is antiparallel to the TO circle.

        if (isFromCircleRightTurn === isToCircleRightTurn) {
          // If the direction of the FROM and TO circles are the same (great circles are arbitrarily considered to be
          // left-turning), then the turn direction is always the opposite of the TO circle's direction.

          isTurnDirectionRight = !isToCircleRightTurn;
        } else {
          // If the direction of the FROM and TO circles are different (great circles are arbitrarily considered to be
          // left-turning), then we must check whether the *turn* radius of the TO circle is greater than that of the
          // FROM circle. If the TO circle's turn radius is larger, then the turn direction is the same as the TO
          // circle's direction. Otherwise, the turn direction is the opposite of the TO circle's direction.

          // Note that the FROM and TO circles cannot have the same turn radius in this case, because if they had the
          // same turn radius, then it would be impossible for them to be tangent or non-intersecting *and* be
          // antiparallel at the tangent point or projected anchor point.

          const isToCircleTurnRadiusLarger = FlightPathUtils.getTurnRadiusFromCircle(this._toCircle) > FlightPathUtils.getTurnRadiusFromCircle(this._fromCircle);
          isTurnDirectionRight = isToCircleTurnRadiusLarger === isToCircleRightTurn;
        }
      }
    } else {
      // The FROM circle is secant to the TO circle. In this case the turn direction depends on whether the turn starts
      // before the intersection and the direction in which the TO circle crosses the FROM circle at the intersection.
      // If the turn starts before the intersection, then the turn direction is the same as the crossing direction.
      // Otherwise, the turn direction is the opposite of the crossing direction.

      isTurnDirectionRight = this.selectedAnchorSide * this.pathAngleDelta < 0;
    }

    // Choose our construction of the working circles such that the circle-to-circle turn lies *outside* both working
    // circles. In other words, neither working circle should encircle any point along the circle-to-circle turn.

    this.workingFromCircle.set(this._fromCircle.center, this._fromCircle.radius);
    this.workingToCircle.set(this._toCircle.center, this._toCircle.radius);

    if (isTurnDirectionRight) {
      this.workingFromCircleDirection = 1;
      this.workingToCircleDirection = 1;
    } else {
      this.workingFromCircle.reverse();
      this.workingToCircle.reverse();
      this.workingFromCircleDirection = -1;
      this.workingToCircleDirection = -1;
    }

    this.cosD = MathUtils.clamp(Vec3Math.dot(this.workingFromCircle.center, this.workingToCircle.center), -1, 1);
    this.sinD = Math.sqrt(1 - this.cosD * this.cosD);

    // Normal vector for the great circle from the center of the working FROM circle to the center of the working TO
    // circle.
    const fromCenterToCenterNormal = GeoCircle.getGreatCircleNormal(
      this.workingFromCircle.center,
      this.workingToCircle.center,
      FlightPathCircleToCircleTurn.vec3Cache[0]
    );
    // Normal vector for the great circle from the center of the working FROM circle to the intersection point.
    const fromIntersectionRadialNormal = GeoCircle.getGreatCircleNormal(
      this.workingFromCircle.center,
      anchor,
      FlightPathCircleToCircleTurn.vec3Cache[1]
    );
    // Normal vector for the great cirlce from the intersection point to the center of the working TO circle.
    const toIntersectionRadialNormal = GeoCircle.getGreatCircleNormal(
      anchor,
      this.workingToCircle.center,
      FlightPathCircleToCircleTurn.vec3Cache[2]
    );

    // Check whether any of the normal vectors we calculated are invalid. Theoretically they cannot be invalid because
    // if they were invalid it would mean the FROM and TO circles are either concentric or at least one of them has a
    // turn radius of zero. If either of those conditions were true, then there should be no valid intersection points
    // between the two. However, floating point error can cause violations of this assumption, so we will still guard
    // against invalid normal vectors.
    if (
      !Vec3Math.isFinite(fromCenterToCenterNormal)
      || !Vec3Math.isFinite(fromIntersectionRadialNormal)
      || !Vec3Math.isFinite(toIntersectionRadialNormal)
    ) {
      this._isTurnValid = false;
      return;
    }

    this.turnDirection = isTurnDirectionRight ? 'right' : 'left';

    this.fromBeta = Vec3Math.unitAngle(fromCenterToCenterNormal, fromIntersectionRadialNormal);
    this.toBeta = Vec3Math.unitAngle(fromCenterToCenterNormal, toIntersectionRadialNormal);

    if (this.workingFromCircle.isGreatCircle()) {
      this.sinFromRadius = 1;
      this.cosFromRadius = 0;
    } else {
      this.sinFromRadius = Math.sin(this.workingFromCircle.radius);
      this.cosFromRadius = Math.cos(this.workingFromCircle.radius);
    }

    if (this.workingToCircle.isGreatCircle()) {
      this.sinToRadius = 1;
      this.cosToRadius = 0;
    } else {
      this.sinToRadius = Math.sin(this.workingToCircle.radius);
      this.cosToRadius = Math.cos(this.workingToCircle.radius);
    }

    this.minTurnRadius = this.anchorsMinTurnRadius[this.selectedAnchorIndex];

    const D = Math.acos(this.cosD);
    this.maxTurnRadius = Math.PI - 0.5 * (D + this.workingFromCircle.radius + this.workingToCircle.radius);
    this.maxTurnRadiusFromAlpha = this.turnRadiusToAlpha(this.maxTurnRadius, this.fromBeta, this.workingFromCircle.radius, this.workingToCircle.radius);
    this.maxTurnRadiusToAlpha = this.turnRadiusToAlpha(this.maxTurnRadius, this.toBeta, this.workingToCircle.radius, this.workingFromCircle.radius);

    this.turnRadius = this.minTurnRadius;
    this.fromAlpha = 0;
    this.toAlpha = 0;

    this.updateTurn();

    this._isTurnValid = true;
  }

  /**
   * Updates this turn's center, start, and end points.
   * 
   * **Important:** This method assumes that this turn is valid.
   */
  private updateTurn(): void {
    const anchor = this.anchors[this.selectedAnchorIndex];

    if (this.turnRadius <= this.minTurnRadius) {
      Vec3Math.copy(anchor, this.turnCenter);

      if (this.turnRadius <= GeoMath.ANGULAR_TOLERANCE) {
        Vec3Math.copy(anchor, this.turnStart);
        Vec3Math.copy(anchor, this.turnEnd);
      } else {
        this.workingFromCircle.closest(anchor, this.turnStart);
        this.workingToCircle.closest(anchor, this.turnEnd);
      }
    } else {
      this.workingFromCircle.offsetAngleAlong(
        anchor,
        -this.workingFromCircleDirection * this.fromAlpha,
        this.turnStart,
        Math.PI
      );

      this.workingToCircle.offsetAngleAlong(
        anchor,
        this.workingToCircleDirection * this.toAlpha,
        this.turnEnd,
        Math.PI
      );

      const radial = FlightPathCircleToCircleTurn.geoCircleCache[0].setAsGreatCircle(this.workingFromCircle.center, this.turnStart);

      if (radial.isValid()) {
        radial.offsetAngleAlong(this.workingFromCircle.center, this.workingFromCircle.radius + this.turnRadius, this.turnCenter, Math.PI);
      } else {
        Vec3Math.copy(this.workingFromCircle.center, this.turnCenter);
        if (this.workingFromCircle.radius > MathUtils.HALF_PI) {
          Vec3Math.multScalar(this.turnCenter, -1, this.turnCenter);
        }
      }
    }
  }

  /**
   * Gets the angular offset between this turn's tangent point with the working FROM or TO circle and the anchor point,
   * as measured along the working FROM or TO circle in radians, for a given turn radius. If the anchor point is
   * a floating anchor point, then it will be projected onto the working circle before the angular offset is measured.
   * 
   * **Important:** This method assumes that this turn is valid.
   * @param turnRadius The turn radius for which to calculate the angular offset, in great-arc radians.
   * @param beta _If calculating the angular offset along the FROM working circle_: the angle between the FROM working
   * circle's radial to the anchor point and the radial to the projection of the center of the TO working circle. _If
   * calculating the angular offset along the TO working circle_: the angle between the TO working
   * circle's radial to the anchor point and the radial to the projection of the center of the FROM working circle.
   * @param circleRadius _If calculating the angular offset along the FROM working circle_: the radius of the FROM
   * working circle. _If calculating the angular offset along the TO working circle_: the radius of the TO working
   * circle.
   * @param otherCircleRadius _If calculating the angular offset along the FROM working circle_: the radius of the TO
   * working circle. _If calculating the angular offset along the TO working circle_: the radius of the FROM working
   * circle.
   * @returns The angular offset between this turn's tangent point with the working FROM or TO circle and the anchor
   * point, as measured along the working FROM or TO circle in radians, for the specified turn radius. If the anchor
   * point is a floating anchor point, then the angular offset is measured from the projection of the anchor point onto
   * the working circle.
   */
  private turnRadiusToAlpha(turnRadius: number, beta: number, circleRadius: number, otherCircleRadius: number): number {
    const circleRadiusSum = circleRadius + turnRadius;
    const otherCircleRadiusSum = otherCircleRadius + turnRadius;

    const cos = (Math.cos(otherCircleRadiusSum) - this.cosD * Math.cos(circleRadiusSum))
      / (this.sinD * Math.sin(circleRadiusSum));

    return Math.acos(MathUtils.clamp(cos, -1, 1)) - beta;
  }

  /**
   * Gets this turn's turn radius, in great-arc radians, for a given angular offset between this turn's tangent point
   * with the working FROM or TO circle and the anchor point, as measured along the working FROM or TO circle.
   * 
   * **Important:** This method assumes that this turn is valid.
   * @param alpha The angular offset for which to calculate the turn radius, in radians.
   * @param beta _If the angular offset is measured along the FROM working circle_: the angle between the FROM working
   * circle's radial to the anchor point and the radial to the projection of the center of the TO working circle. _If
   * the angular offset is measured along the TO working circle_: the angle between the TO working circle's radial to
   * the anchor point and the radial to the projection of the center of the FROM working circle.
   * @param sinCircleRadius _If the angular offset is measured along the FROM working circle_: the sine of the radius
   * of the FROM working circle. _If the angular offset is measured along the TO working circle_: the sine of the
   * radius of the TO working circle.
   * @param cosCircleRadius _If the angular offset is measured along the FROM working circle_: the cosine of the radius
   * of the FROM working circle. _If the angular offset is measured along the TO working circle_: the cosine of the
   * radius of the TO working circle.
   * @param sinOtherCircleRadius _If the angular offset is measured along the FROM working circle_: the sine of the
   * radius of the TO working circle. _If the angular offset is measured along the TO working circle_: the sine of the
   * radius of the FROM working circle.
   * @param cosOtherCircleRadius _If the angular offset is measured along the FROM working circle_: the cosine of the
   * radius of the TO working circle. _If the angular offset is measured along the TO working circle_: the cosine of
   * the radius of the FROM working circle.
   * @returns This turn's turn radius, in great-arc radians, for a given angular offset between this turn's tangent
   * point with the working FROM or TO circle and the anchor point, as measured along the working FROM or TO circle.
   */
  private alphaToTurnRadius(
    alpha: number,
    beta: number,
    sinCircleRadius: number,
    cosCircleRadius: number,
    sinOtherCircleRadius: number,
    cosOtherCircleRadius: number
  ): number {
    const sinDTimesCos = this.sinD * Math.cos(beta + alpha);

    const numerator = cosOtherCircleRadius - this.cosD * cosCircleRadius - sinCircleRadius * sinDTimesCos;
    const denominator = sinOtherCircleRadius - this.cosD * sinCircleRadius + cosCircleRadius * sinDTimesCos;

    if (denominator === 0) {
      return numerator >= 0 ? MathUtils.HALF_PI : -MathUtils.HALF_PI;
    } else {
      return Math.atan2(numerator, denominator);
    }
  }
}

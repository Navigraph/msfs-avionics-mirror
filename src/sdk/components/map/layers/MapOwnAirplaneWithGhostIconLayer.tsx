import { MapOwnAirplaneLayer, MapOwnAirplaneLayerModules, MapOwnAirplaneLayerProps } from './MapOwnAirplaneLayer';
import { Subscribable } from '../../../sub/Subscribable';
import { ReadonlyFloat64Array, Vec2Math, VecNMath } from '../../../math//VecMath';
import { MathUtils } from '../../../math/MathUtils';
import { FSComponent, VNode } from '../../FSComponent';
import { GeoPoint } from '../../../geo/GeoPoint';
import { CssTransformBuilder } from '../../../graphics';
import { MapOwnAirplaneIconOrientation } from '../modules/MapOwnAirplaneIconModule';
import { ObjectSubject } from '../../../sub/ObjectSubject';
import { Subject } from '../../../sub/Subject';
import { SubscribableUtils } from '../../../sub/SubscribableUtils';
import { Subscription } from '../../../sub/Subscription';
import { SubscribableMapFunctions } from '../../../sub/SubscribableMapFunctions';

/**
 * Rotation reference for an airplane ghost icon.
 */
export enum GhostIconRotationMode {
  /** The ghost icon is rotated to the bearing between the unprojected icon position and the airplane position */
  BearingFromEdge,

  /** The ghost icon is rotated to the current airplane rotation */
  AirplaneRotation,
}

/**
 * Props for {@link MapOwnAirplaneWithGhostIconLayer}
 */
export interface MapOwnAirplaneWithGhostIconLayerProps<M extends MapOwnAirplaneLayerModules> extends MapOwnAirplaneLayerProps<M> {
  /**
   * Whether the ghost icon is enabled. The ghost icon appears when the main airplane icon is out of bounds and
   * is located where a great circle path originating from the map center and ending at the airplane's position
   * intersects one of the map edges. Its rotation mode is controlled by {@link ghostIconBearingReferenceMode}.
   */
  enableGhostIcon?: Subscribable<boolean>;

  /** The rotation mode of the ghost icon. Defaults to {@link GhostIconRotationMode.BearingFromEdge}. */
  ghostIconBearingReferenceMode?: GhostIconRotationMode;

  /** Whether to clamp the ghost icon so that it's axis-aligned bounding box (AABB) is always within the map viewport. */
  ghostIconClamp?: boolean;


  /** The path to the ghost icon's image file. If undefined, {@link imageFilePath} will be used. */
  ghostIconImageFilePath?: string | Subscribable<string>;

  /** The size of the ghost airplane icon, in pixels. If undefined, {@link iconSize} will be used. */
  ghostIconSize?: number | Subscribable<number>;

  /**
   * The point on the ghost icon which is anchored to the edge of the screen, expressed relative to the icon's width and
   * height, with [0, 0] at the top left and [1, 1] at the bottom right. If `undefined`, {@link iconAnchor} will be used.
   */
  ghostIconAnchor?: ReadonlyFloat64Array | Subscribable<ReadonlyFloat64Array>;
}

/**
 * A version of {@link MapOwnAirplaneLayer} which includes a ghost icon that is shown when the main airplane icon
 * is out of the map viewport.
 */
export class MapOwnAirplaneWithGhostIconLayer<M extends MapOwnAirplaneLayerModules = MapOwnAirplaneLayerModules>
  extends MapOwnAirplaneLayer<M, MapOwnAirplaneWithGhostIconLayerProps<M>> {
  protected static readonly geoPointCache = [new GeoPoint(NaN, NaN)];

  protected static readonly vecCache = [Vec2Math.create(), Vec2Math.create(), VecNMath.create(4)];

  protected readonly ghostIconStyle = ObjectSubject.create({
    display: '',
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: '0px',
    height: '0px',
    transform: 'translate3d(0, 0, 0) rotate(0deg)',
    'transform-origin': '50% 50%'
  });

  protected readonly ghostIconTransform = CssTransformBuilder.concat(
    CssTransformBuilder.translate3d('px'),
    CssTransformBuilder.rotate('deg')
  );

  protected readonly enableGhostIcon = this.props.enableGhostIcon ?? Subject.create(true);

  protected readonly ghostImageFilePath = SubscribableUtils.isSubscribable(this.props.ghostIconImageFilePath)
    ? this.props.ghostIconImageFilePath.map(SubscribableMapFunctions.identity())
    : (this.props.ghostIconImageFilePath ?? this.props.imageFilePath);

  protected readonly ghostIconSize = this.props.ghostIconSize ? SubscribableUtils.toSubscribable(this.props.ghostIconSize, true) : this.iconSize;
  protected readonly ghostIconAnchor = this.props.ghostIconAnchor ? SubscribableUtils.toSubscribable(this.props.ghostIconAnchor, true) : this.iconAnchor;
  protected readonly ghostIconOffset = Vec2Math.create();

  protected isGhostIconVisible = false;

  protected needUpdateGhostIconVisibility = true;

  protected ghostIconEnabledSub?: Subscription;
  protected ghostIconSizeSub?: Subscription;
  protected ghostIconAnchorSub?: Subscription;

  /** @inheritDoc */
  public onAttached(): void {
    super.onAttached();

    this.ghostIconEnabledSub = this.enableGhostIcon.sub(() => {
      this.needUpdateGhostIconVisibility = true;
    });

    this.ghostIconSizeSub = this.ghostIconSize.sub(size => {
      this.ghostIconStyle.set('width', `${size}px`);
      this.ghostIconStyle.set('height', `${size}px`);

      this.updateGhostIconOffset();
    }, true);

    this.ghostIconAnchorSub = this.ghostIconAnchor.sub(() => {
      this.updateGhostIconOffset();
    });
  }

  /** @inheritDoc */
  protected onHeadingChanged(value: number): void {
    super.onHeadingChanged(value);

    this.updateVisibilityBounds();
  }

  /** @inheritDoc */
  protected onTrackChanged(value: number): void {
    super.onTrackChanged(value);

    this.updateVisibilityBounds();
  }

  /** @inheritDoc */
  protected onOrientationChanged(value: MapOwnAirplaneIconOrientation): void {
    super.onOrientationChanged(value);

    this.updateVisibilityBounds();
  }


  /** @inheritDoc */
  public onUpdated(time: number, elapsed: number): void {
    super.onUpdated(time, elapsed);

    if (this.needUpdateGhostIconVisibility) {
      this.updateGhostIconVisibility();
      this.needUpdateGhostIconVisibility = false;
    }
  }

  /**
   * Updates the boundaries within the map's projected window that define a region such that if the airplane's
   * projected position falls outside of it, the icon is not visible and therefore does not need to be updated.
   */
  protected updateVisibilityBounds(): void {
    let rotation: number;
    switch (this.ownAirplaneIconModule.orientation.get()) {
      case MapOwnAirplaneIconOrientation.HeadingUp:
      case MapOwnAirplaneIconOrientation.TrackUp:
        rotation = this.planeRotation + this.props.mapProjection.getRotation() * Avionics.Utils.RAD2DEG;
        break;
      default:
        rotation = 0;
    }

    const [bufferLeft, bufferTop, bufferRight, bufferBottom] = this.anchorAabbDistances(rotation * Avionics.Utils.DEG2RAD, MapOwnAirplaneWithGhostIconLayer.vecCache[2]);

    const projectedSize = this.props.mapProjection.getProjectedSize();

    this.visibilityBounds[0] = -bufferRight;
    this.visibilityBounds[1] = -bufferBottom;
    this.visibilityBounds[2] = projectedSize[0] + bufferLeft;
    this.visibilityBounds[3] = projectedSize[1] + bufferTop;

    this.needUpdatePositionRotation = this.showIcon;
  }

  /**
   * Updates the ghost icon's offset from the projected position of the airplane.
   */
  protected updateGhostIconOffset(): void {
    const ghostAnchor = this.ghostIconAnchor.get();
    this.ghostIconOffset.set(ghostAnchor);
    Vec2Math.multScalar(this.ghostIconOffset, -this.ghostIconSize.get(), this.ghostIconOffset);
    this.ghostIconStyle.set('left', `${this.ghostIconOffset[0]}px`);
    this.ghostIconStyle.set('top', `${this.ghostIconOffset[1]}px`);
    this.ghostIconStyle.set('transform-origin', `${ghostAnchor[0] * 100}% ${ghostAnchor[1] * 100}%`);
  }

  /** Updates the ghost icon's visibility */
  protected updateGhostIconVisibility(): void {
    this.ghostIconStyle.set('display', this.enableGhostIcon.get() && this.isGhostIconVisible && this.showIcon ? '' : 'none');
  }

  /** @inheritDoc */
  protected updateIconPositionRotation(): void {
    super.updateIconPositionRotation();

    this.updateGhostIconPositionRotation();
  }

  /**
   * Updates the position and rotation of the ghost icon
   */
  protected updateGhostIconPositionRotation(): void {
    this.needUpdateGhostIconVisibility ||= true;

    // If the projected position of the icon is within the viewport, don't show the ghost icon
    if (this.isInsideVisibilityBounds) {
      this.isGhostIconVisible = false;
      return;
    }

    const projected = this.props.mapProjection.project(this.ownAirplanePropsModule.position.get(), MapOwnAirplaneWithGhostIconLayer.vecCache[0]);

    this.isGhostIconVisible = true;

    if (!this.getGhostIconLocation(projected, MapOwnAirplaneWithGhostIconLayer.vecCache[1])) {
      // No intersection. Should never happen.
      return;
    }

    let intersection = MapOwnAirplaneWithGhostIconLayer.vecCache[1];

    let rotation: number;
    switch (this.props.ghostIconBearingReferenceMode ?? GhostIconRotationMode.BearingFromEdge) {
      case GhostIconRotationMode.AirplaneRotation:
        rotation = this.planeRotation + this.props.mapProjection.getRotation() * Avionics.Utils.RAD2DEG;
        break;
      case GhostIconRotationMode.BearingFromEdge: {
        const unprojectedGhostIconPosition = this.props.mapProjection.invert(intersection, MapOwnAirplaneWithGhostIconLayer.geoPointCache[0]);

        rotation = unprojectedGhostIconPosition.bearingTo(this.ownAirplanePropsModule.position.get()) + this.props.mapProjection.getRotation() * Avionics.Utils.RAD2DEG;
        break;
      }
      default:
        rotation = 0;
    }

    if (this.props.ghostIconClamp) {
      intersection = this.clampGhostIconLocation(intersection, rotation * Avionics.Utils.DEG2RAD, intersection);
    }

    this.ghostIconTransform.getChild(0).set(intersection[0], intersection[1], 0, 0.1);
    this.ghostIconTransform.getChild(1).set(rotation, 0.1);

    this.ghostIconStyle.set('transform', this.ghostIconTransform.resolve());
  }

  /**
   * Clamps a ghost icon position so that the entire axis-aligned bounding box (AABB) of the icon fits within the map viewport
   * @param location the location to clamp
   * @param rotationRad the rotation of the icon, in radians
   * @param out a {@link Float64Array} into which to write the clamped position as [x, y]
   * @returns the `out` parameter
   */
  private clampGhostIconLocation(location: ReadonlyFloat64Array, rotationRad: number, out: Float64Array): Float64Array {
    const [clampLeft, clampTop, clampRight, clampBottom] = this.anchorAabbDistances(rotationRad, MapOwnAirplaneWithGhostIconLayer.vecCache[2]);

    const projectedSize = this.props.mapProjection.getProjectedSize();

    out[0] = MathUtils.clamp(location[0], clampLeft, projectedSize[0] - clampRight);
    out[1] = MathUtils.clamp(location[1], clampTop, projectedSize[1] - clampBottom);

    return out;
  }

  /**
   * Finds the location to display a ghost airplane icon at
   * @param airplanePosition the airplane position
   * @param out where to write the result, as [x, y]
   * @returns whether a location is defined
   */
  private getGhostIconLocation(airplanePosition: ReadonlyFloat64Array, out: Float64Array): boolean {
    const x1 = airplanePosition[0];
    const y1 = airplanePosition[1];

    const [x2, y2] = this.props.mapProjection.getCenterProjected();

    const projectedSize = this.props.mapProjection.getProjectedSize();

    // Left edge
    let x3 = 0;
    let y3 = 0;
    let x4 = 0;
    let y4 = projectedSize[1];

    if (this.intersectLineSegments(x1, y1, x2, y2, x3, y3, x4, y4, out)) {
      return true;
    }

    // Top edge
    x3 = 0;
    y3 = 0;
    x4 = projectedSize[0];
    y4 = 0;

    if (this.intersectLineSegments(x1, y1, x2, y2, x3, y3, x4, y4, out)) {
      return true;
    }

    // Right edge
    x3 = projectedSize[0];
    y3 = 0;
    x4 = projectedSize[0];
    y4 = projectedSize[1];

    if (this.intersectLineSegments(x1, y1, x2, y2, x3, y3, x4, y4, out)) {
      return true;
    }

    // Bottom edge
    x3 = 0;
    y3 = projectedSize[1];
    x4 = projectedSize[0];
    y4 = projectedSize[1];

    if (this.intersectLineSegments(x1, y1, x2, y2, x3, y3, x4, y4, out)) {
      return true;
    }

    return false;
  }

  /**
   * Intersects two finite line segments that share a plane
   * @param x1 the x coordinate of the point defining the first point of the first line
   * @param y1 the y coordinate of the point defining the first point of the first line
   * @param x2 the x coordinate of the point defining the second point of the first line
   * @param y2 the y coordinate of the point defining the second point of the first line
   * @param x3 the x coordinate of the point defining the first point of the second line
   * @param y3 the y coordinate of the point defining the first point of the second line
   * @param x4 the x coordinate of the point defining the second point of the second line
   * @param y4 the y coordinate of the point defining the second point of the second line
   * @param out where to output the intersection, as [x, y]
   * @returns whether an intersection was found
   */
  private intersectLineSegments(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number,
    out: Float64Array,
  ): boolean {
    const uA = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
    const uB = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

    if (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1) {
      const intersectionX = x1 + uA * (x2 - x1);
      const intersectionY = y1 + uA * (y2 - y1);

      out[0] = intersectionX;
      out[1] = intersectionY;

      return true;
    }

    return false;
  }

  /**
   * Calculates the distance from the rotated anchor point of the icon to the four edges of the axis-aligned bounding
   * box (AABB) of the icon.
   * @param rotationRad the rotation of the icon in radians
   * @param out where to write the result to as [left, top, right, bottom]
   * @returns the output value
   */
  private anchorAabbDistances(rotationRad: number, out: Float64Array): Float64Array {
    const [anchorX, anchorY] = this.ghostIconAnchor.get();
    const size = this.ghostIconSize.get();

    const offsetHypot = Math.hypot(
      Math.abs(anchorX * size - 0.5 * size),
      Math.abs(anchorY * size - 0.5 * size),
    );

    const sinR = Math.sin(rotationRad);
    const cosR = Math.cos(rotationRad);

    const xToRotatedAnchor = offsetHypot * sinR;
    const yToRotatedAnchor = offsetHypot * -cosR;

    const aabbSize = size * Math.abs(sinR) + size * Math.abs(cosR);

    out[0] = aabbSize / 2 + xToRotatedAnchor;
    out[1] = aabbSize / 2 + yToRotatedAnchor;
    out[2] = aabbSize - out[0];
    out[3] = aabbSize - out[1];

    return out;
  }

  /** @inheritDoc */
  public destroy(): void {
    super.destroy();

    this.ghostIconSizeSub?.destroy();
    this.ghostIconAnchorSub?.destroy();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        <img src={this.imageFilePath} class={this.props.class ?? ''} style={this.style} />
        <img src={this.ghostImageFilePath} class={this.props.class ?? ''} style={this.ghostIconStyle} />
      </>
    );
  }
}

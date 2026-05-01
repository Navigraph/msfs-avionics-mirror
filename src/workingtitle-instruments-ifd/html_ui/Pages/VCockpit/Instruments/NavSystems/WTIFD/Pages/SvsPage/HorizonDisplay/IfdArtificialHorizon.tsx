import {
  ArrayUtils, BitFlags, ColorUtils, ComponentProps, HorizonProjection, HorizonProjectionChangeType, HorizonSharedCanvasSubLayer, MathUtils, Subscribable, Subscription,
  Transform2D, Vec2Math
} from '@microsoft/msfs-sdk';
import { IfdSvsController } from '../IfdSvsController';

/**
 * A color gradient stop for {@link IfdArtificialHorizon}. The first member (`distance`) defines the distance of the
 * stop from the horizon line, in pixels. The second member (`color`) defines the color of the stop. The optional
 * third member (`step`) defines the distance, in pixels, between adjacent interpolated colors used to draw the
 * gradient. The value of `step` must be at least `2` and defaults to `4`.
 */
export type IfdArtificialHorizonColorStop = [distance: number, color: string, step?: number];

/**
 * Options for {@link IfdArtificialHorizon}.
 */
export interface IfdArtificialHorizonOptions {
  /** The color stops of the ground gradient. */
  groundColors: IfdArtificialHorizonColorStop[];

  /** The color stops of the sky gradient. */
  skyColors: IfdArtificialHorizonColorStop[];
}

/**
 * An interpolated color gradient stop for HorizonDisplay.
 */
type GradientStop = {
  /** The distance of this stop from the horizon line, in pixels. */
  distance: number;

  /** The color of this stop. */
  color: string;
};

/** Component props for {@link IfdHorizonDisplay} */
export interface IfdArtificialHorizonProps extends ComponentProps {
  /** Whether to show the artificial horizon. */
  show: Subscribable<boolean>;

  /** Options for the artificial horizon. */
  options: Readonly<IfdArtificialHorizonOptions>;
}

/** An IFD artificial horizon. Renders sky and ground boxes. */
export class IfdArtificialHorizon extends HorizonSharedCanvasSubLayer<IfdArtificialHorizonProps> {
  private static readonly UPDATE_FLAGS
    = HorizonProjectionChangeType.ScaleFactor
    | HorizonProjectionChangeType.Fov
    | HorizonProjectionChangeType.Pitch
    | HorizonProjectionChangeType.Roll
    | HorizonProjectionChangeType.ProjectedSize;

  private readonly vec2Cache = [Vec2Math.create(), Vec2Math.create(), Vec2Math.create(), Vec2Math.create()];

  private readonly bgTranslation = Vec2Math.create();
  private bgRotation = 0;

  private readonly windowTransform = new Transform2D();

  private readonly groundColors = IfdArtificialHorizon.createColorGradient(this.props.options.groundColors);

  private readonly skyColors = IfdArtificialHorizon.createColorGradient(this.props.options.skyColors);

  private needUpdate = false;

  private showSub?: Subscription;

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();

    this.showSub = this.props.show.sub(() => {
      this.needUpdate = true;
    }, true);

    this.needUpdate = true;
  }

  /** @inheritdoc */
  public onProjectionChanged(projection: HorizonProjection, changeFlags: number): void {
    if (BitFlags.isAny(changeFlags, IfdArtificialHorizon.UPDATE_FLAGS)) {
      this.needUpdate = true;
    }
  }

  /** @inheritdoc */
  public shouldInvalidate(): boolean {
    return this.needUpdate && this.isVisible();
  }

  /** @inheritdoc */
  public onUpdated(): void {
    if (!this.display.isInvalidated || !this.isVisible()) {
      return;
    }

    if (this.props.show.get()) {
      const projection = this.projection;
      const pitchResolution = projection.getScaleFactor() / projection.getFov();
      const pitch = MathUtils.clamp(
        projection.getPitch(),
        this.projection.getFov() * IfdSvsController.MAX_SVS_MODE_PITCH_UP_COEF, // up limit to keep ground in view
        this.projection.getFov() * IfdSvsController.MAX_SVS_MODE_PITCH_DOWN_COEF, // down limit to keep sky in view
      );
      const roll = projection.getRoll();

      Vec2Math.set(0, pitchResolution * pitch, this.bgTranslation);
      this.bgRotation = -roll;

      this.drawHorizonRects(this.display.context, projection);
    }

    this.needUpdate = false;
  }

  /**
   * Draws the horizon rects.
   * @param context The canvas rendering context to which to draw.
   * @param projection The horizon projection.
   */
  private drawHorizonRects(context: CanvasRenderingContext2D, projection: HorizonProjection): void {
    const projectedCenter = projection.getOffsetCenterProjected();
    const projectedSize = projection.getProjectedSize();

    this.windowTransform.toIdentity();
    const transform = this.windowTransform
      .addTranslation(-projectedCenter[0], -projectedCenter[1])
      .addRotation(-this.bgRotation * Avionics.Utils.DEG2RAD)
      .addTranslation(-this.bgTranslation[0], -this.bgTranslation[1]);

    const windowUl = transform.apply(Vec2Math.set(0, 0, this.vec2Cache[0]), this.vec2Cache[0]);
    const windowUr = transform.apply(Vec2Math.set(projectedSize[0], 0, this.vec2Cache[1]), this.vec2Cache[1]);
    const windowLl = transform.apply(Vec2Math.set(0, projectedSize[1], this.vec2Cache[2]), this.vec2Cache[2]);
    const windowLr = transform.apply(Vec2Math.set(projectedSize[0], projectedSize[1], this.vec2Cache[3]), this.vec2Cache[3]);

    const minX = Math.min(windowUl[0], windowUr[0], windowLl[0], windowLr[0]);
    const maxX = Math.max(windowUl[0], windowUr[0], windowLl[0], windowLr[0]);
    const minY = Math.min(windowUl[1], windowUr[1], windowLl[1], windowLr[1]);
    const maxY = Math.max(windowUl[1], windowUr[1], windowLl[1], windowLr[1]);

    const inverted = transform.invert();
    const invertedParams = inverted.getParameters();

    context.setTransform(
      invertedParams[0], invertedParams[3],
      invertedParams[1], invertedParams[4],
      invertedParams[2], invertedParams[5]
    );

    if (maxY > 0) {
      this.drawGradientRect(context, this.groundColors, minX, maxX, maxY);
    }

    if (minY < 0) {
      this.drawGradientRect(context, this.skyColors, minX, maxX, minY);
    }

    context.resetTransform();
  }

  /**
   * Draws a gradient rectangle.
   * @param context The canvas rendering context to which to draw.
   * @param stops The interpolated color stops of the rectangle gradient.
   * @param x1 The minimum x-coordinate to which to extend the rectangle.
   * @param x2 The maximum x-coordinate to which to extend the rectangle.
   * @param y The y-coordinate to which to extend the rectangle.
   */
  private drawGradientRect(
    context: CanvasRenderingContext2D,
    stops: GradientStop[],
    x1: number,
    x2: number,
    y: number
  ): void {
    // We avoid using actual CanvasGradient objects to render the gradient because they are\
    // bugged in Coherent.

    const sign = y < 0 ? -1 : 1;

    const width = x2 - x1;
    const maxDistance = y * sign;
    let prevDistance = 0;

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];

      // Overlap each stripe with the next one to avoid sub-pixel rendering artifacts.
      const currentDistance = Math.min(stop.distance, maxDistance) + 1;
      const height = currentDistance - prevDistance;

      if (height > 0) {
        context.fillStyle = stop.color;
        context.fillRect(x1, Math.min(prevDistance * sign, currentDistance * sign), width, height);
      }

      if (stop.distance >= maxDistance) {
        break;
      }

      prevDistance = stop.distance;
    }

    const lastStop = stops[stops.length - 1];
    if (lastStop && prevDistance < maxDistance) {
      const currentDistance = maxDistance + 1;
      const height = currentDistance - prevDistance;
      context.fillStyle = lastStop.color;
      context.fillRect(x1, Math.min(prevDistance * sign, currentDistance * sign), width, height);
    }
  }

  /** @inheritdoc */
  public destroy(): void {
    this.showSub?.destroy();

    super.destroy();
  }

  /**
   * Creates an array of interpolated color gradient stops, ordered by increasing distance from the horizon line.
   * @param colors The gradient's defined color stops.
   * @returns An array of interpolated color gradient stops for the specified defined stops.
   */
  private static createColorGradient(colors: IfdArtificialHorizonColorStop[]): GradientStop[] {
    return ArrayUtils.flatMap(colors.slice().sort((a, b) => a[0] - b[0]), (stop, index, array) => {
      const next = array[index + 1];

      // If this is the last stop, then we will return the stop with no further interpolation.
      if (!next) {
        return { distance: stop[0], color: stop[1] };
      }

      const step = Math.max(Math.round(next[2] ?? 4), 2);

      // If this stop and the next one has the same color or the distance between them is less than the interpolation
      // step, then we will return the current stop with no interpolation.
      if (next[0] - stop[0] <= step || stop[1] === next[1]) {
        return { distance: stop[0], color: stop[1] };
      }

      const distance = next[0] - stop[0];
      const stepCount = Math.ceil(distance / step);

      const steps = ColorUtils.interpolateHex(stop[1], next[1], ArrayUtils.range(stepCount, 0, step / distance))
        .map((stepColor, stepIndex) => {
          return {
            distance: stop[0] + stepIndex * step,
            color: stepColor
          };
        });

      // If there are at least two steps and the last step is less than 2 pixels from the next stop, then remove the
      // last step.
      if (steps.length > 1 && distance - steps[steps.length - 1].distance < 2) {
        steps.length--;
      }

      return steps;
    });
  }
}

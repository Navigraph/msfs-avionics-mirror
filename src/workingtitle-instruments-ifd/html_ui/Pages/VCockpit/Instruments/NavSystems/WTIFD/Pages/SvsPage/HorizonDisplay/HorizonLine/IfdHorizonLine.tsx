import {
  AffineTransformPathStream,
  BitFlags, ClippedPathStream, ComponentProps, HorizonProjection, HorizonProjectionChangeType,
  HorizonSharedCanvasSubLayer, MagVar, MathUtils, NullPathStream, ReadonlyFloat64Array, Subscribable,
  SubscribableArray, SubscribableUtils, Subscription, Transform2D, Vec2Math, VecNMath, VecNSubject
} from '@microsoft/msfs-sdk';

import { IfdHorizonOcclusionArea } from './IfdHorizonOcclusionArea';

/**
 * Options for {@link IfdHorizonLine}.
 */
export type HorizonLineOptions = {
  /** The width of the horizon line stroke, in pixels. Defaults to 2 pixels. */
  lineStrokeWidth?: number;

  /** The color of the horizon line stroke. */
  lineStrokeColor?: string;

  /** The size of the heading reference pointer. as `[width, height]` in pixels. */
  headingPointerSize: ReadonlyFloat64Array;

  /** The length of a heading tick, in pixels, when the tick is projected to the center of the projection. */
  headingTickLength: number;

  /** The name of the heading label font. */
  font: string;

  /** The size of the heading label font, in pixels, when the label is projected to the center of the projection. */
  fontSize: number;

  /** The color of the heading label font. Defaults to `'white'`. */
  fontColor?: string;

  /** The width of the heading label font outline, in pixels. Defaults to 1 pixel. */
  fontOutlineWidth?: number;

  /** The color of the heading label font outline. Defaults to `'black'`. */
  fontOutlineColor?: string;

  /**
   * The offset of the heading label from its tick, in pixels. Positive offsets shift the label away from the tick.
   * Defaults to 0 pixels.
   */
  labelOffset?: number;
};

/**
 * Component props for HorizonLine.
 */
export interface HorizonLineProps extends ComponentProps {
  /** The size, as `[width, height]` in pixels, of the horizon component's projected window. */
  projectedSize: ReadonlyFloat64Array | Subscribable<ReadonlyFloat64Array>;

  /** Whether to show the horizon line. */
  show: Subscribable<boolean>;

  /** Whether to show heading labels. */
  showHeadingLabels: boolean | Subscribable<boolean>;

  /** Whether to approximate pitch scale based on FOV instead of performing a full projection. */
  approximate: boolean | Subscribable<boolean>;

  /** Whether to show magnetic heading. */
  useMagneticHeading: Subscribable<boolean>;

  /** The occlusion areas to apply to the horizon heading ticks and labels. */
  occlusions: SubscribableArray<IfdHorizonOcclusionArea>;

  /** Options for the horizon line. */
  options: Readonly<HorizonLineOptions>;
}

/**
 * A PFD horizon line with heading labels and arrows every 90 degrees
 */
export class IfdHorizonLine extends HorizonSharedCanvasSubLayer<HorizonLineProps> {
  // Have to make sure the gap between ticks is small enough that one will always be projected in the overscan on each side,
  // so the horizon line spans the full viewport.
  private static readonly LABEL_FACTOR = 2; // number of ticks per label
  private static readonly TICK_INCREMENT = 45 / IfdHorizonLine.LABEL_FACTOR; // degrees per tick
  private static readonly TICK_COUNT = 360 / IfdHorizonLine.TICK_INCREMENT;

  private static readonly BOUNDS_BUFFER = 0; // pixels

  private static readonly DEFAULT_LINE_STROKE_WIDTH = 1; // pixels
  private static readonly DEFAULT_LINE_STROKE_COLOR = 'white';

  private static readonly DEFAULT_FONT_COLOR = 'black';
  private static readonly DEFAULT_FONT_OUTLINE_WIDTH = 1; // pixels
  private static readonly DEFAULT_FONT_OUTLINE_COLOR = 'white';

  private static readonly vec2Cache = [Vec2Math.create(), Vec2Math.create()];

  private projectedSize: Subscribable<ReadonlyFloat64Array> | undefined;

  private readonly lineStrokeWidth = this.props.options.lineStrokeWidth ?? IfdHorizonLine.DEFAULT_LINE_STROKE_WIDTH;
  private readonly lineStrokeColor = this.props.options.lineStrokeColor ?? IfdHorizonLine.DEFAULT_LINE_STROKE_COLOR;

  private readonly font = `${this.props.options.fontSize}px ${this.props.options.font}`;
  private readonly fontColor = this.props.options.fontColor ?? IfdHorizonLine.DEFAULT_FONT_COLOR;
  private readonly fontOutlineWidth = this.props.options.fontOutlineWidth ?? IfdHorizonLine.DEFAULT_FONT_OUTLINE_WIDTH;
  private readonly fontOutlineColor = this.props.options.fontOutlineColor ?? IfdHorizonLine.DEFAULT_FONT_OUTLINE_COLOR;

  private readonly labelOffset = this.props.options.labelOffset ?? 0;

  private readonly approximate = SubscribableUtils.toSubscribable(this.props.approximate, true);

  private readonly showHeadingLabels = SubscribableUtils.toSubscribable(this.props.showHeadingLabels, true);

  private readonly bounds = VecNSubject.create(
    VecNMath.create(4, -IfdHorizonLine.BOUNDS_BUFFER, -IfdHorizonLine.BOUNDS_BUFFER, IfdHorizonLine.BOUNDS_BUFFER, IfdHorizonLine.BOUNDS_BUFFER)
  );

  private readonly clipPathStream = new ClippedPathStream(NullPathStream.INSTANCE, this.bounds);
  private readonly transformPathStream = new AffineTransformPathStream(this.clipPathStream);

  private readonly nodes = Array.from({ length: IfdHorizonLine.TICK_COUNT }, (v, index) => {
    const heading = Math.round(index * IfdHorizonLine.TICK_INCREMENT) % 360;
    const directionLabels: Record<number, string> = {
      0: 'N',
      45: 'NE',
      90: 'E',
      135: 'SE',
      180: 'S',
      225: 'SW',
      270: 'W',
      315: 'NW',
      360: 'N'
    };
    const labelText = directionLabels[heading] ?? undefined;
    return {
      heading,
      labelText,
      projected: Vec2Math.create(),
      drawTick: false,
      tickEndProjected: Vec2Math.create(),
      drawLabel: false,
      labelFontSize: 0
    };
  });

  private readonly approximateTransform = new Transform2D();

  private needUpdate = false;

  private readonly subscriptions: Subscription[] = [];

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();

    this.projectedSize = SubscribableUtils.toSubscribable(this.props.projectedSize, true);

    this.updateBounds();

    this.clipPathStream.setConsumer(this.display.context);

    const scheduleUpdate = (): void => { this.needUpdate = true; };

    this.subscriptions.push(
      this.projectedSize.sub(size => {
        this.projection.set({ projectedSize: size });
      }, true),
      this.props.show.sub(scheduleUpdate),
      this.approximate.sub(scheduleUpdate),
      this.showHeadingLabels.sub(scheduleUpdate),
      this.props.useMagneticHeading.sub(scheduleUpdate),
      this.props.occlusions.sub(scheduleUpdate)
    );

    this.needUpdate = true;
  }

  /** @inheritdoc */
  public onProjectionChanged(_projection: HorizonProjection, changeFlags: number): void {
    if (BitFlags.isAll(changeFlags, HorizonProjectionChangeType.ProjectedSize)) {
      this.updateBounds();
    }

    this.needUpdate = true;
  }

  /**
   * Updates this layer's drawing bounds.
   */
  private updateBounds(): void {
    if (!this.projectedSize) {
      return;
    }

    const projectedSize = this.projectedSize.get();
    this.bounds.set(
      -IfdHorizonLine.BOUNDS_BUFFER,
      -IfdHorizonLine.BOUNDS_BUFFER,
      projectedSize[0] + IfdHorizonLine.BOUNDS_BUFFER,
      projectedSize[1] + IfdHorizonLine.BOUNDS_BUFFER
    );
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
      const context = this.display.context;
      context.font = this.font;
      context.textAlign = 'center';
      context.fillStyle = this.fontColor;

      const projection = this.projection;

      const position = projection.getPosition();
      const useMagnetic = this.props.useMagneticHeading.get();
      const headingOffset = useMagnetic ? MagVar.get(position.lat, position.lon) : 0;
      const approximate = this.approximate.get();

      if (approximate) {
        const center = projection.getOffsetCenterProjected();
        const pitchResolution = projection.getScaleFactor() / projection.getFov();

        this.approximateTransform
          .toTranslation(0, pitchResolution * projection.getPitch())
          .addRotation(-projection.getRoll() * Avionics.Utils.DEG2RAD)
          .addTranslation(center[0], center[1]);

        this.approximateNodes(projection, headingOffset);
      } else {
        this.projectNodes(projection, headingOffset);
      }

      this.drawLine(context);

    }

    this.needUpdate = false;
  }

  /**
   * Applies a clip path based on this layer's occlusion areas. If there are no occlusion areas, then a clip path will
   * not be applied.
   * @param context The canvas rendering context to which to apply the clip path.
   * @param occlusions The occlusion areas to apply.
   * @returns Whether a clip path was applied.
   */
  private applyOcclusionClipPath(context: CanvasRenderingContext2D, occlusions: readonly IfdHorizonOcclusionArea[]): boolean {
    if (occlusions.length === 0) {
      return false;
    }

    const size = this.projection.getProjectedSize();

    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(size[0], 0);
    context.lineTo(size[0], size[1]);
    context.lineTo(0, size[1]);
    context.lineTo(0, 0);

    for (let i = 0; i < occlusions.length; i++) {
      occlusions[i].path(context);
    }

    context.clip('evenodd');

    return true;
  }

  /**
   * Recalculates the positions of this horizon line's nodes using projection.
   * @param projection The horizon projection.
   * @param headingOffset The offset, in degrees, of the heading ticks with respect to true heading.
   */
  private projectNodes(projection: HorizonProjection, headingOffset: number): void {
    // Model the horizon line and ticks as a virtual ring of arbitrary radius (the exact value of the radius does not
    // matter because it gets factored out with the perspective projection) within the zero-pitch/zero-roll plane
    // centered on the projection camera.

    const drawLabels = this.showHeadingLabels.get();

    // Compute the virtual tick length and label font size required to achieve the desired projected tick lengths and
    // font sizes, respectively.
    const scaledFocalLength = projection.getScaleFactor() * projection.getFocalLength();
    const virtualTickLength = this.props.options.headingTickLength / scaledFocalLength;
    const virtualFontSize = this.props.options.fontSize / scaledFocalLength;

    for (let i = 0; i < this.nodes.length; i++) {
      const drawLabel = i % IfdHorizonLine.LABEL_FACTOR === 0 && drawLabels;

      const node = this.nodes[i];
      const nominalHeading = node.heading + headingOffset;

      projection.projectCameraRelativeEuclidean(nominalHeading, 1, 0, node.projected);
      const isInBounds = projection.isInProjectedBounds(node.projected, this.bounds.get());

      if (isInBounds && drawLabels) {
        node.drawTick = true;

        projection.projectCameraRelativeEuclidean(
          nominalHeading,
          1,
          virtualTickLength,
          node.tickEndProjected
        );
      } else {
        node.drawTick = false;
      }

      if (isInBounds && drawLabel) {
        node.drawLabel = true;

        const labelOriginProjected = projection.projectCameraRelativeEuclidean(
          nominalHeading,
          1,
          virtualTickLength,
          IfdHorizonLine.vec2Cache[0]
        );
        const labelTopProjected = projection.projectCameraRelativeEuclidean(
          nominalHeading,
          1,
          virtualTickLength + virtualFontSize,
          IfdHorizonLine.vec2Cache[1]
        );
        const delta = Vec2Math.sub(labelTopProjected, labelOriginProjected, IfdHorizonLine.vec2Cache[1]);
        node.labelFontSize = Vec2Math.abs(delta);
      } else {
        node.drawLabel = false;
      }
    }
  }

  /**
   * Recalculates the positions of this horizon line's nodes using an approximated pitch scale based on FOV.
   * @param projection The horizon projection.
   * @param headingOffset The offset, in degrees, of the heading ticks with respect to true heading.
   */
  private approximateNodes(projection: HorizonProjection, headingOffset: number): void {
    // Approximate the position of the horizon line and heading ticks as follows: assume the plane is at 0 pitch and 0
    // roll and project the line and ticks via a perspective transform. Then, approximate translation due to pitch
    // using a constant pitch resolution (pixels per degree of pitch) derived from the projection's current field of
    // view. Finally, apply the rotation transformation due to roll. The error of this approximation increases with
    // the absolute deviation of the pitch and roll angles from 0 degrees.

    const drawLabels = this.showHeadingLabels.get();

    const scaleFactor = projection.getScaleFactor();
    const headingRad = projection.getHeading() * Avionics.Utils.DEG2RAD;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const drawLabel = drawLabels && node.labelText !== undefined;

      const angle = (MathUtils.diffAngle(headingRad, (node.heading + headingOffset) * Avionics.Utils.DEG2RAD) + Math.PI) % MathUtils.TWO_PI - Math.PI;
      if (Math.abs(angle) < MathUtils.HALF_PI) {
        const offset = Vec2Math.setFromPolar(1, angle, IfdHorizonLine.vec2Cache[0]);
        const z = offset[0];
        const ratio = 1 / z;

        const projectedX = offset[1] * ratio * scaleFactor;

        this.approximateTransform.apply(Vec2Math.set(projectedX, 0, IfdHorizonLine.vec2Cache[0]), node.projected);
        const isInBounds = projection.isInProjectedBounds(node.projected, this.bounds.get());

        if (isInBounds && drawLabels) {
          node.drawTick = true;

          const tickLength = this.props.options.headingTickLength * ratio;
          this.approximateTransform.apply(Vec2Math.set(projectedX, -tickLength, IfdHorizonLine.vec2Cache[0]), node.tickEndProjected);
        } else {
          node.drawTick = false;
        }

        if (isInBounds && drawLabel) {
          node.drawLabel = true;
          node.labelFontSize = this.props.options.fontSize * ratio;
        } else {
          node.drawLabel = false;
        }
      } else {
        Vec2Math.set(NaN, NaN, node.projected);
        node.drawTick = false;
        node.drawLabel = false;
      }
    }
  }

  /**
   * Draws this horizon line's heading ticks on a canvas.
   * @param context The canvas rendering context to which to draw the ticks.
   * @param projection The horizon projection.
   */
  private drawTicks(context: CanvasRenderingContext2D, projection: HorizonProjection): void {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      this.drawLabel(
        node.heading,
        context,
        projection,
        node.labelText,
      );

      if (node.labelText) {
        this.drawArrow(node.heading, context, projection);
      }
    }
  }

  /**
   * Calculates a scale factor for a heading label/arrow.
   * If cardinal headings in (0, 90, 180, 270, 360) then scale factor = 1
   * 0.7 for non-cardinal headings
   * @param heading The heading value
   * @returns the scale factor number
   */
  private getLabelScaleFactorFromHeading(heading: number): number {
    const normalized = heading % 360;

    const isCardinal =
      normalized === 0 ||
      normalized === 90 ||
      normalized === 180 ||
      normalized === 270;

    return isCardinal ? 1 : 0.7;
  }

  /**
   * Draws a heading label's reference arrow.
   * @param heading The heading value to draw an arrow at
   * @param context The canvas rendering context to which to draw the pointer.
   * @param projection The horizon projection.
   */
  private drawArrow(
    heading: number,
    context: CanvasRenderingContext2D,
    projection: HorizonProjection
  ): void {
    const pitchOffset = this.projection.getPitch();
    const scale = this.getLabelScaleFactorFromHeading(heading);

    const baseSize = this.props.options.headingPointerSize;
    const size: [number, number] = [baseSize[0] * scale, baseSize[1] * scale];
    const halfWidth = size[0] / 2;

    const currentHeadingProjected = IfdHorizonLine.vec2Cache[0];
    projection.projectCameraRelativeEuclidean(heading, 1, 0, currentHeadingProjected);

    if (!projection.isInProjectedBounds(currentHeadingProjected, this.bounds.get())) {
      return;
    }

    this.transformPathStream
      .resetTransform()
      .addTranslation(0, -(this.fontOutlineWidth / 2 + this.fontOutlineWidth) + pitchOffset)
      .addRotation(-projection.getRoll() * Avionics.Utils.DEG2RAD)
      .addTranslation(currentHeadingProjected[0], currentHeadingProjected[1]);

    this.transformPathStream.beginPath();
    this.transformPathStream.moveTo(0, 0);
    this.transformPathStream.lineTo(-halfWidth, -size[1]);
    this.transformPathStream.lineTo(halfWidth, -size[1]);
    this.transformPathStream.closePath();

    context.fillStyle = this.fontColor;
    context.fill();
    this.strokePath(context, this.fontOutlineWidth, this.fontOutlineColor);
  }

  /**
   * Draws a heading label above its reference arrow, centered horizontally.
   * @param heading The heading value to draw an arrow at
   * @param context The canvas rendering context to which to draw the label.
   * @param projection The horizon projection.
   * @param labelText The text to render for the heading label, or `undefined` if there is no label.
   */
  private drawLabel(
    heading: number,
    context: CanvasRenderingContext2D,
    projection: HorizonProjection,
    labelText?: string,
  ): void {
    if (labelText === undefined) {
      return;
    }

    const pitchOffset = this.projection.getPitch();
    const scale = this.getLabelScaleFactorFromHeading(heading);

    const baseSize = this.props.options.headingPointerSize;
    const size: [number, number] = [baseSize[0] * scale, baseSize[1] * scale];

    const currentHeadingProjected = IfdHorizonLine.vec2Cache[0];
    projection.projectCameraRelativeEuclidean(heading, 1, 0, currentHeadingProjected);

    if (!projection.isInProjectedBounds(currentHeadingProjected, this.bounds.get())) {
      return;
    }

    // verticalOffset to scale less aggressively for non-cardinal headings
    // than font size and arrow size
    const verticalOffset = (size[1] + this.labelOffset) * (scale === 1 ? 1 : 0.9);

    context.save();
    context.translate(currentHeadingProjected[0], currentHeadingProjected[1] + pitchOffset);
    context.rotate(-projection.getRoll() * Avionics.Utils.DEG2RAD);
    context.translate(0, -verticalOffset);

    context.textAlign = 'center';

    const fontSize = this.props.options.fontSize * scale;
    context.font = `${fontSize}px Arial Bold`;

    if (this.fontOutlineWidth > 0) {
      context.lineWidth = this.fontOutlineWidth * 2;
      context.strokeStyle = this.fontOutlineColor;
      context.strokeText(labelText, 0, 0);
    }
    context.fillStyle = this.fontColor;
    context.fillText(labelText, 0, 0);

    context.restore();
  }

  /**
   * Draws the horizon line on a canvas.
   * @param context The canvas rendering context to which to draw the line.
   */
  private drawLine(context: CanvasRenderingContext2D): void {
    this.clipPathStream.beginPath();

    let needMoveTo = true;

    for (let i = 0; i < this.nodes.length; i++) {
      const projected = this.nodes[i].projected;

      if (Vec2Math.isFinite(projected)) {
        if (needMoveTo) {
          this.clipPathStream.moveTo(projected[0], projected[1]);
          needMoveTo = false;
        } else {
          this.clipPathStream.lineTo(projected[0], projected[1]);
        }
      } else {
        needMoveTo = true;
      }
    }

    const first = this.nodes[0].projected;

    if (!needMoveTo && Vec2Math.isFinite(first)) {
      this.clipPathStream.lineTo(first[0], first[1]);
    }

    this.strokePath(context, this.lineStrokeWidth, this.lineStrokeColor);
  }

  /**
   * Strokes a path on a canvas.
   * @param context The canvas rendering context with which to stroke the path.
   * @param strokeWidth The width of the stroke.
   * @param strokeStyle The style of the stroke.
   */
  private strokePath(
    context: CanvasRenderingContext2D,
    strokeWidth: number,
    strokeStyle: string,
  ): void {
    context.lineWidth = strokeWidth;
    context.strokeStyle = strokeStyle;
    context.stroke();
  }

  /** @inheritdoc */
  public destroy(): void {
    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    super.destroy();
  }
}

import {
  BitFlags, ComponentProps, CssTransformBuilder, CssTransformSubject, FSComponent, HorizonProjection, HorizonProjectionChangeType, HorizonSharedCanvasSubLayer,
  MappedSubject, MathUtils, Subject, VecNMath, VNode
} from '@microsoft/msfs-sdk';

import { IfdSvsController } from '../IfdSvsController';

import './IfdPitchLadder.css';

/** Props for {@link IfdPitchLadder} */
export interface IfdPitchLadderProps extends ComponentProps {
  /** The IfdSvsController */
  controller: IfdSvsController;
}

/** An IfdPitchLadder */
export class IfdPitchLadder extends HorizonSharedCanvasSubLayer<IfdPitchLadderProps> {
  private readonly svgTicksRef = FSComponent.createRef<SVGGElement>();
  private readonly svgHorizonLineRef = FSComponent.createRef<SVGGElement>();
  private readonly svgNumbersRef = FSComponent.createRef<SVGGElement>();
  private readonly svgExtremeIndicatorRef = FSComponent.createRef<SVGGElement>();
  private readonly svgClipPathRef = FSComponent.createRef<SVGRectElement>();

  private static readonly EXTREME_UPPER_SYNVIS_OFF = [50, 60, 70, 80];
  private static readonly EXTREME_LOWER_SYNVIS_OFF = [-30, -40, -50, -60];
  private static readonly EXTREME_UPPER_SYNVIS_ON = [50, 55, 60, 65, 70];
  private static readonly EXTREME_LOWER_SYNVIS_ON = [-30, -35, -40, -45, -50];

  /*
   * The offset value, in pixels, for projection.getScaleFactor(), applied only for pitch ladder,
   * so that it matches with image reference.
   */
  public static readonly PITCH_LADDER_NOMINAL_SCALE_OFFSET = 0; // pixels

  private readonly minorLength = 30;
  private readonly majorLength = 71;
  private readonly majorHeight = 9.6;

  private readonly minorHalfLength = this.getHalfRounded(this.minorLength);

  /**
   * The clipping bounds of the pitch ladder, as `[left, top, right, bottom]`
   * in pixels relative to the center of the projection.
   */
  private readonly clipBounds = MappedSubject.create(
    ([width, height]) => {
      return VecNMath.create(4, -width / 2, -height / 2, width / 2, height / 2);
    },
    this.props.controller.ifdHorizonWidth,
    this.props.controller.ifdHorizonHeight,
  );

  private readonly displayStyle = Subject.create('');
  private readonly positionStyle = Subject.create('absolute');
  private readonly leftStyle = Subject.create('0px');
  private readonly topStyle = Subject.create('0px');
  private readonly widthStyle = Subject.create('0px');
  private readonly heightStyle = Subject.create('0px');

  private readonly pitchLadderTransform = CssTransformSubject.create(CssTransformBuilder.concat(
    CssTransformBuilder.translate3d('px'),
    CssTransformBuilder.rotate('deg'),
    CssTransformBuilder.translateY('px'),
  ));

  private readonly pitchLadderClipPathTransform = CssTransformSubject.create(CssTransformBuilder.concat(
    CssTransformBuilder.translate3d('px'),
  ));

  private resolution = 0; // pixels per degree of view

  private extremePitchUpperValues: number[] = [];
  private extremePitchLowerValues: number[] = [];

  private minorStep: number = 0;
  private majorStep: number = 0;

  private readonly synVisEnabledToStepsMap = MappedSubject.create(
    ([synVisEnabled]) => {
      this.minorStep = synVisEnabled ? 2.5 : 5;
      this.majorStep = synVisEnabled ? 5 : 10;
    },
    this.props.controller.svsActive
  );

  private needRebuildLadder = false;
  private needRebuildLadderClipPath = false;
  private needReposition = false;

  private defaultPitchResolution: number | undefined;

  /** @inheritdoc */
  protected onVisibilityChanged(isVisible: boolean): void {
    this.displayStyle.set(isVisible ? '' : 'none');
  }

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();
    this.updateClip();

    this.needRebuildLadder = true;
    this.needReposition = true;
    this.needRebuildLadderClipPath = true;
  }

  /** @inheritdoc */
  public onProjectionChanged(_projection: HorizonProjection, changeFlags: number): void {
    this.resolution = this.getAdjustedNominalScale() / this.projection.getFov();

    if (!this.defaultPitchResolution) {
      this.defaultPitchResolution = this.resolution;
    }

    if (BitFlags.isAny(changeFlags, HorizonProjectionChangeType.Fov | HorizonProjectionChangeType.ScaleFactor)) {
      this.needRebuildLadder = true;
    }

    this.needReposition = true;
  }

  /** @inheritdoc */
  public onUpdated(): void {
    if (!this.isVisible()) {
      return;
    }

    if (this.needRebuildLadderClipPath) {
      this.drawPitchLadderClipPath();
      this.needRebuildLadderClipPath = false;
    }

    if (this.needRebuildLadder) {
      this.rebuildLadder();
      this.needRebuildLadder = false;
    }


    if (this.needReposition) {
      this.repositionLadder();
      this.needReposition = false;
    }
  }

  /** Updates this ladder's clipping boundaries. */
  private updateClip(): void {
    const center = this.projection.getOffsetCenterProjected();
    const bounds = this.clipBounds.get();

    this.leftStyle.set(`${center[0] + bounds[0]}px`);
    this.topStyle.set(`${center[1] + bounds[1]}px`);
    this.widthStyle.set(`${bounds[2] - bounds[0]}px`);
    this.heightStyle.set(`${bounds[3] - bounds[1]}px`);

    // After we update the clip bounds we need to update the positioning of the ladder, because the ladder is
    // positioned relative to the clip bounds.
    this.needReposition = true;
  }

  /** Repositions this ladder based on the current pitch and bank. */
  private repositionLadder(): void {
    // Approximate translation due to pitch using a constant pitch resolution (pixels per degree of pitch) derived
    // from the projection's current field of view. This approximation always keeps the pitch ladder reading at the
    // center of the projection (i.e. at the symbolic aircraft reference) accurate. However, the error increases as
    // distance from the center of the projection increases because the true pitch resolution is not constant
    // throughout screen space. To get a truly accurate pitch ladder, we would need to project and position each pitch
    // line individually. Doing this via SVG is too performance-intensive (we would be redrawing the SVG every frame
    // that the pitch ladder is moving) and doing it via canvas looks horrible due to it not being able to draw text
    // with sub-pixel resolution.

    const bounds = this.clipBounds.get();
    const pitchOffset = (this.projection.getPitch() * this.resolution) + this.projection.getProjectedOffset()[1];

    this.pitchLadderTransform.transform.getChild(0).set(-bounds[0], -bounds[1], 0, 0.1, 0.1);
    this.pitchLadderTransform.transform.getChild(1).set(-this.projection.getRoll());
    this.pitchLadderTransform.transform.getChild(2).set(pitchOffset, 0.1);
    this.pitchLadderTransform.resolve();

    this.pitchLadderClipPathTransform.transform.getChild(0).set(0, -pitchOffset, 0, 0.1, 0.1);
    this.pitchLadderClipPathTransform.resolve();
  }

  /**
   * Gets the half value of a number, rounded to the nearest 0.1.
   * @param v The number to halve.
   * @returns Half the value of v, rounded to the nearest 0.1.
   */
  private getHalfRounded(v: number): number {
    return MathUtils.round(v / 2, 0.1);
  }

  /**
   * Creates the line paths for major ticks
   * @param y The Y position to use.
   * @param pitch The current pitch value.
   * @returns An SVG path string.
   */
  private getMajorTicksPaths(
    y: number,
    pitch: number,
  ): [string, string] {
    const position = pitch < 0 ? 'negative' : 'positive';
    const height = this.majorHeight;
    const fullLength = this.majorLength * this.getScaleFactor();
    const halfLength = fullLength / 2;
    const shortSides = `M -${halfLength} ${y + ((position === 'negative' ? -1 : 1) * (height - 1.6))} v ${position === 'positive' ? -height : height} m ${fullLength} 0 v ${position === 'positive' ? height : -height}`;
    const longLine = `M -${halfLength} ${y} h ${fullLength}`;
    return [shortSides, longLine];
  }

  /**
   * Draws extreme pitch indicators.
   */
  private drawExtremePitchIndicator(): void {
    if (this.props.controller.svsActive.get()) {
      this.extremePitchUpperValues = IfdPitchLadder.EXTREME_UPPER_SYNVIS_ON;
      this.extremePitchLowerValues = IfdPitchLadder.EXTREME_LOWER_SYNVIS_ON;
    } else {
      this.extremePitchUpperValues = IfdPitchLadder.EXTREME_UPPER_SYNVIS_OFF;
      this.extremePitchLowerValues = IfdPitchLadder.EXTREME_LOWER_SYNVIS_OFF;
    }

    for (const degree of this.extremePitchUpperValues) {
      FSComponent.render(
        <path
          class="upper-extreme-pitch-indicator"
          transform={`translate(0, ${-(degree * this.resolution)}) scale(${this.getScaleFactor()})`}
          d='M -25 -32 L 0 0 L 25 -32'
        />,
        this.svgExtremeIndicatorRef.instance
      );
    }

    for (const degree of this.extremePitchLowerValues) {
      FSComponent.render(
        <path
          class="lower-extreme-pitch-indicator"
          transform={`translate(0, ${-(degree * this.resolution)}) scale(${this.getScaleFactor()})`}
          d='M -25 32 L 0 0 L 25 32'
        />,
        this.svgExtremeIndicatorRef.instance
      );
    }
  }

  /**
   * Adjusts the nominal scale, in pixels, of the pitch ladder by an offset value.
   * @returns the adjusted nominal scale of the pitch ladder, in pixels
   */
  private getAdjustedNominalScale(): number {
    return this.projection.getScaleFactor() + IfdPitchLadder.PITCH_LADDER_NOMINAL_SCALE_OFFSET;
  }

  /**
   * Calculates scale factor of the pitch ladder based on pitch resolution and an offset value.
   * @returns the scale factor number.
   */
  private getScaleFactor(): number {
    if (this.props.controller.svsActive.get() && this.defaultPitchResolution) {
      return MathUtils.clamp(this.resolution / this.defaultPitchResolution, 0.5, 1.8);
    }

    return 1;
  }

  /**
   * Draws the pitch ladder rect clip path.
   */
  private drawPitchLadderClipPath(): void {
    const fovToPixels = this.resolution * this.projection.getFov() * this.getScaleFactor();
    this.svgClipPathRef.instance.setAttribute('y', String(-this.getHalfRounded(fovToPixels * 0.62)));
    this.svgClipPathRef.instance.setAttribute('height', `${String(fovToPixels * 0.62)}px`);
  }

  /** Rebuilds this ladder. */
  private rebuildLadder(): void {
    this.svgTicksRef.instance.innerHTML = '';
    this.svgHorizonLineRef.instance.innerHTML = '';
    this.svgNumbersRef.instance.innerHTML = '';
    this.svgExtremeIndicatorRef.instance.innerHTML = '';

    const scaleFactor = this.getScaleFactor();

    const scaledMajorLength = this.majorLength * scaleFactor;
    const scaledMinorHalfLength = this.minorHalfLength * scaleFactor;

    this.drawExtremePitchIndicator();

    const longTickShortSideStrokeWidth = scaleFactor > 0.7 ? 4 : 5;
    // TODO use this and refactor the `getMajorTicksPaths()` method to take scaleFactor into account.
    // const shortTickShortSideStrokeWidth = scaleFactor > 0.7 ? 2 : 1;

    // Draws lines and numbers
    for (let pitch = IfdSvsController.CLAMP_PITCH_MIN; pitch <= IfdSvsController.CLAMP_PITCH_MAX; pitch += this.minorStep) {
      const y = -pitch * this.resolution;

      if (
        (pitch % this.majorStep === 0 && pitch !== 0 && Math.abs(pitch) <= 30) ||
        (pitch % (this.majorStep * 2) === 0 && pitch !== 0 && Math.abs(pitch) > 30)
      ) {
        // Major step lines
        const [shortSidesPath, longLinePath] = this.getMajorTicksPaths(y, pitch);
        FSComponent.render(
          <path d={longLinePath} style={{ 'stroke-width': `${longTickShortSideStrokeWidth}px` }} class="pitch-ladder-line pitch-ladder-line-major" />,
          this.svgTicksRef.instance
        );
        FSComponent.render(
          <path d={shortSidesPath} class="pitch-ladder-line pitch-ladder-line-major" />,
          this.svgTicksRef.instance
        );
        // Numbers
        const pitchText = Math.abs(pitch).toString();
        const textAnchor = scaledMajorLength / 2 + 6;

        FSComponent.render(
          <text
            x={-textAnchor} y={y}
            text-anchor="end" dominant-baseline="central" class="pitch-ladder-text"
          >
            {pitchText}
          </text>,
          this.svgNumbersRef.instance
        );
        FSComponent.render(
          <text
            x={textAnchor - 2} y={y}
            text-anchor="start" dominant-baseline="central" class="pitch-ladder-text"
          >
            {pitchText}
          </text>,
          this.svgNumbersRef.instance
        );
      } else if (pitch === 0) {
        // Zero pitch line
        const fullLength = this.majorLength * this.getScaleFactor();
        FSComponent.render(
          <path
            d={`M ${-fullLength / 2} ${y} L ${fullLength / 2} ${y}`}
            class="pitch-ladder-line"
          />,
          this.svgTicksRef.instance
        );
      } else if (
        (pitch % this.minorStep === 0 && pitch !== 0 && Math.abs(pitch) <= 30) ||
        (pitch % (this.minorStep * 2) === 0 && pitch !== 0 && pitch > 30)
      ) {
        // Minor step lines
        FSComponent.render(
          <path
            d={`M ${-scaledMinorHalfLength + 1} ${y} L ${scaledMinorHalfLength - 1} ${y}`}
            class="pitch-ladder-line"
          />,
          this.svgTicksRef.instance
        );
      }
    }
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();
    this.synVisEnabledToStepsMap.destroy();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class="pitch-ladder-container"
        style={{
          display: this.displayStyle,
          position: this.positionStyle,
          left: this.leftStyle,
          top: this.topStyle,
          width: this.widthStyle,
          height: this.heightStyle,
        }}
      >
        <svg
          class="pitch-ladder"
          style={{ transform: this.pitchLadderTransform }}
        >
          <defs>
            <clipPath id="wt-ifd-pitch-ladder-clip">
              <rect
                style={{ transform: this.pitchLadderClipPathTransform }}
                ref={this.svgClipPathRef}
                x="-400" y="0" width="800" height="0"
              />
            </clipPath>
          </defs>

          <g clip-path="url(#wt-ifd-pitch-ladder-clip)">
            <g class="pitch-ladder-ticks" ref={this.svgTicksRef} />
            <g class="pitch-ladder-texts" ref={this.svgNumbersRef} />
            <g class="pitch-ladder-extreme-ind" ref={this.svgExtremeIndicatorRef} />
            <g class="pitch-ladder-horizon" ref={this.svgHorizonLineRef} />
          </g>
        </svg>
      </div>
    );
  }
}

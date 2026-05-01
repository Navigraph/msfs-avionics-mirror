import { ComponentProps, CssTransformBuilder, CssTransformSubject, FSComponent, LifecycleComponent, MathUtils, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdDataProvider } from '../../../Utilities/IfdDataProvider';

import './IfdAngleOfAttackIndicator.css';

/**
 * Props for {@link IfdAngleOfAttackIndicator}
 */
interface IfdAngleOfAttackIndicatorProps extends ComponentProps {
  /** The IfdDataProvider. */
  dataProvider: IfdDataProvider;
}

/**
 * Input to draw the AoA gauge arc.
 */
type AoAGaugeArcParams = {
  /** Circle center x */
  cx: number;
  /** Circle center y */
  cy: number;
  /** Circle radius */
  r: number;
  /** Start angle in degrees */
  startDeg: number;
};

/**
 * Type of a 2 dimensional point.
 */
type Point = {
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
};

/**
 * The IFD custom angle of attack (AOA) indicator.
 */
export class IfdAngleOfAttackIndicator extends LifecycleComponent<IfdAngleOfAttackIndicatorProps> {
  private readonly needleTransform = CssTransformSubject.create(CssTransformBuilder.rotate3d('deg'));

  private readonly MAJOR_TICK_LENGTH = 8;
  private readonly MINOR_TICK_LENGTH = 1;

  private readonly TICKS: number[] = [-5, 0, 5, 10, 17, 25];
  private readonly MAJOR_TICKS: number[] = [-5, 0, 17, 25];

  private readonly RESOLUTION: number = 6; // 1 degree of AoA = 6 degrees on the gauge.
  private readonly ARC_PARAMS: AoAGaugeArcParams = { cx: 52, cy: 52, r: 50, startDeg: 240 };

  private readonly MIN_AOA = -5;
  private readonly MAX_AOA = 25;

  /**
   * Convert a degree to a radian value
   * @param deg The degree value
   * @returns the radian value.
   */
  private deg2Radian(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  /**
   * Convert a nominal degree value on a circle to a 2-dimensional point.
   * @param deg The degree value
   * @param cx The circle center x
   * @param cy The circle center y
   * @param r The circle radius
   * @returns A 2-dimensional point
   */
  private angle2Point(deg: number, cx: number, cy: number, r: number): Point {
    const t = this.deg2Radian(deg - 90); // with a 90 degree offset so that 0 degree is at 12 o'clock position.
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  }

  /**
   * Convert an AoA degree to actual SVG arc degree.
   * @param aoa The AoA degree
   * @returns The actual arc degree number
   */
  private aoa2Degree(aoa: number): number {
    return this.RESOLUTION * aoa + 270;
  }

  /**
   * Draws the AoA gauge arc
   * @inheritDoc
   * @returns the SVG path string for an arc.
   */
  private drawArc({ cx, cy, r, startDeg }: AoAGaugeArcParams): string {
    const endDeg = (startDeg + 180) % 360;

    const start = this.angle2Point(startDeg, cx, cy, r);
    const end = this.angle2Point(endDeg, cx, cy, r);

    const largeArcFlag = 1;
    // Draw arc clockwise in SVG coords.
    const clockWiseFlag = 1;

    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} ${clockWiseFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  /**
   * Draws the AoA gauge tick marks
   * @param arcParams The parameters of the gauge arc.
   * @param aoa The AoA value at which a tick is drawn on the gauge.
   * @param type Whether a tick is of type 'major' or 'minor', default 'minor'
   * @param offset An offset applied to tick length to compensate for the thickness of arc stroke,
   * which would make the ticks shorter than they should be.
   * @returns the SVG path string for a tick;
   */
  private drawTick(arcParams: AoAGaugeArcParams, aoa: number, type: 'major' | 'minor' = 'minor', offset: number): string {
    const degree = this.aoa2Degree(aoa);
    const length = type === 'major' ? this.MAJOR_TICK_LENGTH + (aoa === this.MAX_AOA || degree === this.MIN_AOA ? 2 : 0) : this.MINOR_TICK_LENGTH;
    const { cx, cy, r } = arcParams;

    // Start point of the tick, mounted on the arc
    const pOuter = this.angle2Point(degree, cx, cy, r);
    // End point of the tick, making the tick going inwards from the arc to the arc center.
    const pInner = this.angle2Point(degree, cx, cy, r - length - offset);

    return `M ${pOuter.x.toFixed(2)} ${pOuter.y.toFixed(2)} L ${pInner.x.toFixed(2)} ${pInner.y.toFixed(2)}`;
  }


  /**
   * Draws the AoA needle.
   * @param arcParams The parameters of the gauge arc.
   * @param offset An offset applied to tick length to compensate for the thickness of arc stroke,
   * which would make the ticks shorter than they should be.
   * @returns the SVG path string for a needle;
   */
  private drawNeedle(arcParams: AoAGaugeArcParams, offset: number): string {
    const nWidth = 2.5;
    const nHalfWidth = nWidth / 2;
    const nLength = arcParams.cx - offset;

    return `${arcParams.cx},${arcParams.cy + nHalfWidth} ${arcParams.cx},${arcParams.cy - nHalfWidth} ${nLength / 2 + offset},${arcParams.cy - nWidth} ${offset},${arcParams.cy - nHalfWidth} ${offset},${arcParams.cy + nHalfWidth} ${nLength / 2 + offset},${arcParams.cy + nWidth}`;
  }

  /** @inheritDoc */
  public render(): VNode {
    const formatted = Subject.create<string>('0');
    let clamped: number = 0;

    this.register(
      this.props.dataProvider.events.adc.aoa.sub((v: number) => {
        clamped = MathUtils.clamp(v, this.MIN_AOA, this.MAX_AOA);
        formatted.set(clamped.toFixed());
        this.needleTransform.transform.set(0, 0, 1, this.RESOLUTION * clamped, 2);
        this.needleTransform.resolve();
      })
    );

    const textX = this.ARC_PARAMS.cx + 20;
    const textY = this.ARC_PARAMS.cy + 21;

    const strokeWidth = 4;

    const paths: string[] = [
      this.drawArc(this.ARC_PARAMS),
      ...this.TICKS.map((aoaValue: number) =>
        this.drawTick(this.ARC_PARAMS, aoaValue, this.MAJOR_TICKS.includes(aoaValue) ? 'major' : 'minor', strokeWidth)
      ),
      'Z'
    ];

    const arcDString = paths.join(' ');

    return (
      <div class="wt-ifd-aoa-container">
        <div class="aoa-gauge-container">
          <svg class="aoa-arc">
            <path d={arcDString} style={{ 'stroke-width': `${strokeWidth}px` }} />,
          </svg>
          <div
            class="aoa-needle-container"
            style={{
              'transform-style': 'preserve-3d',
              'transform-origin': `${this.ARC_PARAMS.cx}px ${this.ARC_PARAMS.cy}px`,
              'transition': 'ease',
              transform: this.needleTransform
            }}
          >
            <svg class="aoa-needle">
              <polygon
                points={this.drawNeedle(this.ARC_PARAMS, strokeWidth)}
                style={{ 'stroke': 'none', fill: 'var(--wtdyne-color-white)' }}
              />,
            </svg>
          </div>
          <svg class="aoa-number-display">
            <text
              class="shadow"
              dominant-baseline="middle"
              text-anchor="end"
              x={textX}
              y={textY}
            >
              {formatted}&deg;
            </text>
            <text
              dominant-baseline="middle"
              text-anchor="end"
              x={textX}
              y={textY}
            >
              {formatted}&deg;
            </text>
          </svg>
        </div>
      </div>
    );
  }
}

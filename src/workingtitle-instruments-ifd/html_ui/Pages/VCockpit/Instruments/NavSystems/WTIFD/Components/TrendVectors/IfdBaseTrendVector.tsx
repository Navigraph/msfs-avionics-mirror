import {
  ComponentProps, CssTransformBuilder, CssTransformSubject, EventBus, FSComponent, LifecycleComponent, MappedSubject, MathUtils, Subject, Subscribable, VNode
} from '@microsoft/msfs-sdk';


import './IfdBaseTrendVector.css';

/**
 * Properties for {@link IfdBaseTrendVector}
 */
export interface IfdBaseTrendVectorProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
  /** The CSS class name of the trend vector container */
  className: string;
  /** How many pixels in vector length (height) to display 1 unit of value acceleration */
  svgUnitPerUnit: number;
}

/**
 * The IfdBaseTrendVector component.
 */
export abstract class IfdBaseTrendVector<T extends IfdBaseTrendVectorProps = IfdBaseTrendVectorProps> extends LifecycleComponent<T> {
  /** The trend value. */
  protected readonly abstract trend: Subscribable<number>;

  protected readonly isVisible = Subject.create(false);

  private readonly svgHeight = 300; // SVG coordinate unit
  private readonly vectorWidth = 12; // SVG coordinate unit
  private readonly vectorCenterX = 6; // SVG coordinate unit
  private readonly vectorMaxHeight = this.svgHeight / 2; // SVG coordinate unit

  private readonly vectorTransform = CssTransformSubject.create(CssTransformBuilder.concat(CssTransformBuilder.scale3d()));

  private readonly arrowHeadWing = 3;
  private readonly arrowHeadWingLeftX = this.vectorCenterX - this.vectorWidth - this.arrowHeadWing;
  private readonly arrowHeadWingRightX = this.vectorCenterX + this.vectorWidth + this.arrowHeadWing;
  private readonly showUpArrow = Subject.create<boolean>(false);
  private readonly showDownArrow = Subject.create<boolean>(false);

  private readonly downArrowPath = 'M 21 131 L 6 150 L -9 131 L 0 131 V 0 H 12 V 131 Z';
  private readonly upArrowPath = 'M -9 -111 L 6 -130 L 21 -111 L 12 -111 V 0 H 0 V -111 Z';

  /**
   * The value against which the current value is compared, to decide if
   * the trend should be 0 or the actual trend value
   */
  protected abstract significanceThreshold: number;

  /**
   * Calculates the number of SVG units in vector length (height) to display the current trend
   * @param value The current trend value
   * @returns The pixel value to display for the nominal current trend.
   */
  protected getTrendToSvgUnit(value: number): number {
    if (value >= this.significanceThreshold || value <= -this.significanceThreshold) {
      return value * this.props.svgUnitPerUnit;
    }

    return 0;
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.trend.sub((value: number) => this.updateVector(value), true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Update the position and length of a vector on the tape.
   * @param trend The current trend of the data
   */
  private updateVector(trend: number): void {
    const trendPx = this.getTrendToSvgUnit(trend);

    const clampedTrend = MathUtils.clamp(trendPx, -this.vectorMaxHeight, this.vectorMaxHeight);

    if (Math.abs(trendPx) > Math.abs(clampedTrend)) {
      clampedTrend > 0 ? this.showUpArrow.set(true) : this.showDownArrow.set(true);
    } else {
      this.showUpArrow.set(false);
      this.showDownArrow.set(false);
    }

    this.vectorTransform.transform.getChild(0).set(1, -clampedTrend / this.vectorMaxHeight, 1);
    this.vectorTransform.resolve();
  }

  /** @inheritdoc */
  public render(): VNode {
    const viewBox = `${this.arrowHeadWingLeftX} -${this.vectorMaxHeight} ${this.arrowHeadWingRightX - this.arrowHeadWingLeftX} ${this.svgHeight}`;
    const svgWidth = `${this.arrowHeadWingRightX - this.arrowHeadWingLeftX}px`;
    const blackColor = 'var(--wtdyne-color-black)';
    const shadowWidth = '1.3';

    const hideUpArrow = this.showUpArrow.map((v) => !v);
    const hideDownArrow = this.showDownArrow.map((v) => !v);
    const hideVector = MappedSubject.create(
      ([showUp, showDown]) => showUp || showDown,
      this.showUpArrow,
      this.showDownArrow
    );

    this.register(hideUpArrow);
    this.register(hideDownArrow);
    this.register(hideVector);

    return (
      <div
        class={{
          'wt-ifd-base-trend-vector-container': true,
          [this.props.className]: true,
        }}
      >
        <div
          class={{
            'wt-ifd-base-arrow-vector-container': true,
            'hidden': hideUpArrow
          }}
        >
          <svg class="wt-ifd-base-trend-vector" viewBox={viewBox} width={svgWidth}>
            <path d={this.upArrowPath} stroke={blackColor} stroke-width={shadowWidth} />
            <path d={this.upArrowPath} />
          </svg>
        </div>

        <div
          class={{
            'wt-ifd-base-arrow-vector-container': true,
            'hidden': hideDownArrow
          }}
        >
          <svg class="wt-ifd-base-trend-vector" viewBox={viewBox} width={svgWidth}>
            <path d={this.downArrowPath} stroke={blackColor} stroke-width={shadowWidth} />
            <path d={this.downArrowPath} />
          </svg>
        </div>

        <svg
          class={{
            'wt-ifd-base-trend-vector': true,
            'hidden': hideVector
          }}
          style={{
            transform: this.vectorTransform,
            transformOrigin: 'center center'
          }}
          viewBox={viewBox} width={svgWidth}
        >
          <rect x="0" y="0" width={this.vectorWidth} height={this.vectorMaxHeight} stroke={blackColor} stroke-width={shadowWidth} />
          <rect x="0" y="0" width={this.vectorWidth} height={this.vectorMaxHeight} />
        </svg>
      </div>
    );
  }
}

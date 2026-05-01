import {
  ComponentProps, FSComponent, LifecycleComponent, MappedSubject, MathUtils, Subject, Subscribable, SubscribableUtils, VNode
} from '@microsoft/msfs-sdk';

import './IfdBaseTape.css';

/** Props for an {@link IfdBaseTape} */
export interface IfdBaseTapeProps extends ComponentProps {
  /**
   * The alignment of the tape's ticks and texts
   * against left or right margin
   */
  align: TapeAlign;
  /** The current value of the tape. */
  currentValue: Subscribable<number>;
  /** Minimum value, optional. */
  minValue?: number;
  /** Maximum value, optional. */
  maxValue?: number;
  /** The display unit string, default an empty string */
  displayUnit?: string;
  /** The minor tick increment step */
  minorStep: number;
  /** The major tick increment step */
  majorStep: number;
  /** The major tick increment step that is highlighted */
  majorHighlightStep?: Subscribable<number> | number;
  /** The major tick length in pixels */
  majorTickLength: number;
  /** The major tick length in pixels */
  minorTickLength: number;
  /** Tape element width in pixels. */
  width: number;
  /** Tape element height in pixels. */
  height: number;
  /** The visible range of the tape in terms of its units. */
  visibleRange: number;
  /** Sim time. */
  simTime: Subscribable<number>;
  /** An optional array of class names to be appended to the outer element. */
  classNameArray?: string[];
  /** Must be a multiple of the largest tick increment. */
  nearestMultiplePrecision: number;
  /** Vertical offset for centering the tape on the digital indicator. */
  verticalOffsetPx: number;
}

/**
 * The margin against which tape's ticks and texts are aligned.
 */
export type TapeAlign = 'left' | 'right';

/** An IfdBaseTape */
export abstract class IfdBaseTape<P extends IfdBaseTapeProps = IfdBaseTapeProps> extends LifecycleComponent<P> {
  /**
   * Renders the <text> SVG element of a tick
   * @param value The display value of the tick
   * @param centreY The Y-coordinate to start the tick
   * @param displayUnit The display unit string, default an empty string
   */
  protected abstract renderText(value: number, centreY: number, displayUnit: string): void;

  protected readonly pxPerUnit = this.props.height / this.props.visibleRange;

  protected readonly minValue = this.props.minValue ?? 0;
  protected readonly maxValue = this.props.maxValue ?? 1000;

  private readonly referenceValue = Subject.create(this.minValue);

  protected readonly majorHighlightStep = SubscribableUtils.toSubscribable(this.props.majorHighlightStep, true);

  protected readonly valueDifference = MappedSubject.create(
    ([currentValue, referenceValue]) => referenceValue - Math.max(this.minValue, currentValue),
    this.props.currentValue,
    this.referenceValue,
  );

  protected readonly endXSign: '' | '-' = this.props.align === 'left' ? '' : '-';
  protected readonly shadowXOffset: number = 0.5;

  protected readonly svgRef = FSComponent.createRef<SVGElement>();

  private readonly tapeBuffer = this.props.minorStep * 30;

  private needsToBeRedrawn = true;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(
      this.valueDifference.sub((diff) => {
        if (Math.abs(diff) >= this.props.visibleRange / 3) {
          this.needsToBeRedrawn = true;
        }
      }),
    );

    this.register(
      this.props.simTime.sub((): void => {
        if (this.needsToBeRedrawn) {
          this.needsToBeRedrawn = false;
          this.redrawTape();
        }
      }),
    );
  }

  /** Redraws the speed tape. */
  private redrawTape(): void {
    this.svgRef.instance.innerHTML = '';

    const nearestMultiple = Math.max(
      MathUtils.round(this.props.currentValue.get(), this.props.nearestMultiplePrecision),
      this.minValue,
    );

    this.renderSVG(nearestMultiple);

    this.referenceValue.set(nearestMultiple);
  }

  /**
   * Renders the <line> SVG element of a tick
   * @param length The length of the tick in pixel
   * @param centreY The Y-coordinate to start the tick
   * @param highlight Whether the tick should be highlighted in a different style
   */
  protected renderLine(length: number, centreY: number, highlight: boolean = false): void {
    FSComponent.render(
      <line
        class={{ 'shadow': true, 'highlight': highlight }}
        x1="0" x2={`${this.endXSign}${length + this.shadowXOffset}`} y1={centreY} y2={centreY}
      />, this.svgRef.instance,
    );
    FSComponent.render(
      <line
        class={{ 'highlight': highlight }}
        x1={`${this.endXSign}${this.shadowXOffset}`} x2={`${this.endXSign}${length}`} y1={centreY} y2={centreY}
      />,
      this.svgRef.instance,
    );
    return;
  }

  /**
   * Rendering instructions for the SVG elements.
   * @param nearestMultiple A multiple of the largest tick increment
   */
  protected renderSVG(nearestMultiple: number): void {
    const highlightStep = this.majorHighlightStep.get();
    for (let i = -this.tapeBuffer; i <= this.maxValue; i += this.props.minorStep) {
      const markerSpeed = nearestMultiple + i;
      const centreY = - this.pxPerUnit * i;

      if (markerSpeed % this.props.majorStep === 0) {
        // Major ticks and number
        this.renderLine(this.props.majorTickLength, centreY, highlightStep === undefined ? false : markerSpeed % highlightStep === 0);
        this.renderText(markerSpeed, centreY, this.props.displayUnit ?? '');
      } else {
        // Minor ticks and number
        this.renderLine(this.props.minorTickLength, centreY);
      }
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    let viewBox = '0 0 0 0';
    if (this.props.align === 'left') {
      viewBox = `0 -300 ${this.props.width} 600`;
    } else if (this.props.align === 'right') {
      viewBox = `-${this.props.width} -300 ${this.props.width} 600`;
    }

    return (
      <svg
        ref={this.svgRef}
        class={{
          'wt-ifd-tape': true,
          [[...this.props.classNameArray ?? []].join(' ')]: true,
        }}
        style={{
          transform: this.valueDifference.map((diff) =>
            `translateY(${(MathUtils.round(this.props.verticalOffsetPx - diff * this.pxPerUnit, 0.1))}px)`),
        }}
        viewBox={viewBox}
      />
    );
  }
}

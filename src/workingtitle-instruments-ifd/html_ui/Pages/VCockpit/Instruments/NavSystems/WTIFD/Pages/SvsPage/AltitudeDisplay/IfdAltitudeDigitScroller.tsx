import { ComponentProps, DigitScroller, FSComponent, LifecycleComponent, MathUtils, Subscribable, VNode } from '@microsoft/msfs-sdk';

/** Props for {@link IfdAltitudeDigitScroller} */
export interface IfdAltitudeDigitScrollerProps extends ComponentProps {
  /** Indicated value. */
  value: Subscribable<number>;
  /** Tape element width in pixels. */
  width: number;
  /** The smallest value that the scroller can display. */
  minValue: number;
  /** The largest value that the scroller can display. */
  maxValue: number;
}

/** An IfdAltitudeDigitScroller */
export class IfdAltitudeDigitScroller extends LifecycleComponent<IfdAltitudeDigitScrollerProps> {
  private readonly clamped = this.props.value.map((v) => MathUtils.clamp(v, this.props.minValue, this.props.maxValue)).withLifecycle(this.defaultLifecycle);

  /**
   * The renderer for base 10 digits
   * @param digit The digit to render
   * @param renderZero Whether to render zero as a digit
   * @returns The formatted digit as a string
   */
  private static renderBaseTenDigit(digit: number, renderZero = true): string {
    return (digit === 0 && !renderZero ? '' : Math.abs(digit) % 10).toString();
  }

  /**
   * The renderer for base 5 digits
   * @param digit The digit to render
   * @returns The formatted digit as a string
   */
  private static renderBaseFiveDigit(digit: number): string {
    return ((Math.abs(digit) % 5) * 20).toString().padStart(2, '0');
  }

  /** @inheritDoc */
  render(): VNode {
    return (
      <div class="ifd-digital-box" style={{ width: `${this.props.width}px` }}>
        <svg class='digital-box-border'>
          <path d='M 14.3 62.4 L 24.7 70.2 Q 24.7 78 32.5 78 H 85.8 V 98.8 Q 85.8 106.6 94.9 106.6 H 113.1 Q 122.2 106.6 122.2 98.8 V 26 Q 122.2 18.2 113.1 18.2 H 94.9 Q 85.8 18.2 85.8 26 V 46.8 H 32.5 Q 24.7 46.8 24.7 54.6 Z' />
        </svg>
        <div class="scroller-fade-mask-top" />
        <div class="scroller-fade-mask-bottom" />
        <div class="digital-box-tumblers">
          <DigitScroller
            value={this.clamped}
            base={10}
            factor={10000}
            scrollThreshold={9990}
            renderDigit={(x) => IfdAltitudeDigitScroller.renderBaseTenDigit(x, false)}
            class='ifd-digit-scroller ten-thousands-scroller'
          />
          <DigitScroller
            value={this.clamped}
            base={10}
            factor={1000}
            scrollThreshold={990}
            renderDigit={(x) => IfdAltitudeDigitScroller.renderBaseTenDigit(x, false)}
            class='ifd-digit-scroller thousands-scroller'
          />
          <DigitScroller
            value={this.clamped}
            base={10}
            factor={100}
            scrollThreshold={90}
            renderDigit={IfdAltitudeDigitScroller.renderBaseTenDigit}
            class='ifd-digit-scroller hundreds-scroller'
          />
          <DigitScroller
            value={this.clamped}
            base={5}
            factor={20}
            renderDigit={IfdAltitudeDigitScroller.renderBaseFiveDigit}
            class='ifd-digit-scroller tens-scroller'
          />
        </div>
      </div>
    );
  }
}

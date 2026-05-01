import { ComponentProps, DigitScroller, FSComponent, LifecycleComponent, MathUtils, Subscribable, VNode } from '@microsoft/msfs-sdk';

/** Props for {@link IfdAirspeedDigitScroller} */
export interface IfdAirspeedDigitScrollerProps extends ComponentProps {
  /** Indicated value. */
  value: Subscribable<number>;
  /** Tape element width in pixels. */
  width: number;
  /** The smallest value that the scroller can display. */
  minValue: number;
  /** The largest value that the scroller can display. */
  maxValue: number;
}

/** An IfdAirspeedDigitScroller */
export class IfdAirspeedDigitScroller extends LifecycleComponent<IfdAirspeedDigitScrollerProps> {
  private readonly clamped = this.props.value.map((v) => MathUtils.clamp(v, this.props.minValue, this.props.maxValue)).withLifecycle(this.defaultLifecycle);

  /**
   * Renders base 10 digits
   * @param digit The digit to render
   * @param renderZero Whether to render zero as a digit
   * @returns The formatted digit as a string
   */
  private static renderDigit(digit: number, renderZero = true): string {
    const result = (Math.abs(digit) % 10).toString();

    if (result === '0' && !renderZero) {
      return '';
    }

    return result;
  }

  /** @inheritDoc */
  render(): VNode {
    return (
      <div class="ifd-digital-box" style={{ width: `${this.props.width}px` }}>
        <svg class='digital-box-border'>
          <path d='M 85 37 L 75 31 V 9 Q 75 2 68 2 H 61 Q 55 2 55 9 V 22 H 16 Q 8 22 8 28 V 45 Q 8 51 16 51 H 55 V 64 Q 55 72 61 72 H 69 Q 75 72 75 64 V 43 Z' />
        </svg>
        <div class="scroller-fade-mask-top" />
        <div class="scroller-fade-mask-bottom" />
        <div class="digital-box-tumblers">
          <DigitScroller
            value={this.clamped}
            base={10}
            factor={100}
            scrollThreshold={99}
            renderDigit={(x) => IfdAirspeedDigitScroller.renderDigit(x, false)}
            class='ifd-digit-scroller hundreds-scroller'
          />
          <DigitScroller
            value={this.clamped}
            base={10}
            factor={10}
            scrollThreshold={9}
            renderDigit={IfdAirspeedDigitScroller.renderDigit}
            class='ifd-digit-scroller tens-scroller'
          />
          <DigitScroller
            value={this.clamped}
            base={10}
            factor={1}
            renderDigit={IfdAirspeedDigitScroller.renderDigit}
            class='ifd-digit-scroller ones-scroller'
          />
        </div>
      </div>
    );
  }
}

import { ComponentProps, FSComponent, LifecycleComponent, MappedSubject, MathUtils, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';
import { IfdSvsController } from '../../Pages/SvsPage/IfdSvsController';

import './IfdDeviationIndicator.css';

/** Props for an IfdDeviationIndicator */
export interface IfdDeviationIndicatorProps extends ComponentProps {
  /** The IfdSvsController */
  controller: IfdSvsController;
  /** Whether the component should be hidden. Defaults to not hidden. */
  isHidden?: Subscribable<boolean>;
  /** Orientation. */
  orientation: 'horizontal' | 'vertical';
  /** Current value, in units of the tick mark increment. */
  currentValue: Subscribable<number | null>;
  /** The full scale deviation (2 ticks) value, in the same units as currentValue. */
  fullScale: Subscribable<number> | number;
}

const INDICATOR_LENGTH_PX = 212;
const TICK_START_PX = 2;
const TICK_END_PX = 20;

/** A horizontal or vertical IfdDeviationIndicator */
export class IfdDeviationIndicator extends LifecycleComponent<IfdDeviationIndicatorProps> {
  /** The full scale deviation value (at 2 dots). */
  private readonly fullScale = SubscribableUtils.toSubscribable(this.props.fullScale, true);

  /**
   * Converts a distance to a pixel value for plotting.
   * @param distance The deviation distance.
   * @param fullScale The full scale deviation (2 dots).
   * @returns A pixel value for a CSS transform.
   */
  private distanceToPixel(distance: number, fullScale: number): number {
    return MathUtils.lerp(
      distance,
      fullScale * -3 / 2,
      fullScale * 3 / 2,
      0,
      INDICATOR_LENGTH_PX,
      true,
      true,
    );
  }

  // If deviation is more than two tick marks high or low, clamp it
  // to two and a half times the tick interval and color it yellow.

  private readonly deviationPx = MappedSubject.create(
    ([val, fullScale]) => val === null || Math.abs(val) > fullScale ?
      this.distanceToPixel(Math.sign(val ?? 1) * 2.5, 2) :
      MathUtils.round(this.distanceToPixel(val, fullScale), 0.05),
    this.props.currentValue,
    this.fullScale,
  ).withLifecycle(this.defaultLifecycle).pause();

  private readonly indicatorTransform = this.deviationPx.map((yShift) => `translate3d(11px, ${yShift}px, 0)`).withLifecycle(this.defaultLifecycle);

  private readonly indicatorFill = MappedSubject.create(
    ([val, fullScale]) => val === null || Math.abs(val) > fullScale ? 'yellow' : 'white',
    this.props.currentValue,
    this.fullScale,
  ).withLifecycle(this.defaultLifecycle).pause();

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    if (this.props.isHidden) {
      this.props.isHidden.sub((isHidden) => {
        if (isHidden) {
          this.deviationPx.pause();
          this.indicatorFill.pause();
        } else {
          this.deviationPx.resume();
          this.indicatorFill.resume();
        }
      }, true).withLifecycle(this.defaultLifecycle);
    } else {
      this.deviationPx.resume();
      this.indicatorFill.resume();
    }
  }

  /** @inheritDoc */
  render(): VNode {
    const firstTickY = this.distanceToPixel(-2, 2);
    const secondTickY = this.distanceToPixel(-1, 2);
    const thirdTickY = this.distanceToPixel(0, 2);
    const fourthTickY = this.distanceToPixel(1, 2);
    const fifthTickY = this.distanceToPixel(2, 2);

    return (
      <div class={{
        hidden: this.props.isHidden ?? false,
        'deviation-indicator': true,
        [this.props.orientation]: true
      }}>
        <svg class="scale">
          <rect class="background" rx={8} ry={8} />
          <line class="tick" x1={TICK_START_PX} x2={TICK_END_PX} y1={firstTickY} y2={firstTickY} />
          <line class="tick" x1={TICK_START_PX} x2={TICK_END_PX} y1={secondTickY} y2={secondTickY} />
          <line class="tick centerline" x1={13} x2={30} y1={thirdTickY} y2={thirdTickY} />
          <line class="tick" x1={TICK_START_PX} x2={TICK_END_PX} y1={fourthTickY} y2={fourthTickY} />
          <line class="tick" x1={TICK_START_PX} x2={TICK_END_PX} y1={fifthTickY} y2={fifthTickY} />
          <polygon
            class="centermark"
            points={`1,${INDICATOR_LENGTH_PX / 2 - 9} 11,${INDICATOR_LENGTH_PX / 2} 1,${INDICATOR_LENGTH_PX / 2 + 9}`}
          />

        </svg>
        <svg
          class="indicator"
          style={{ transform: this.indicatorTransform, fill: this.indicatorFill }}
          viewBox='0 -12 30 24'
        >
          <polygon
            class="indicator"
            points="0,0 22,-12 22,-4 30,-4 30,4 22,4 22,12"
          />
        </svg>
        {this.props.children}
      </div>
    );
  }
}

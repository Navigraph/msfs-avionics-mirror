import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, MathUtils, SubscribableMapFunctions, VNode } from '@microsoft/msfs-sdk';

import { ExternalHeadingSystemEvents } from '../../Systems/ExternalHeadingSystem';

import './SvsTurnRateIndicator.css';

/** Props for the {@link SvsTurnRateIndicator} component. */
interface SvsTurnRateIndicatorProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
}

/** Component to display the actual turn rate on the SVS page */
export class SvsTurnRateIndicator extends LifecycleComponent<SvsTurnRateIndicatorProps> {
  private static readonly FULL_ROTATION = 31; // degrees

  private readonly turnRateLeftRef = FSComponent.createRef<SVGElement>();
  private readonly turnRateRightRef = FSComponent.createRef<SVGElement>();

  private readonly deltaHeadingRate = ConsumerSubject.create(null, 0);
  private readonly isHeadingDataValid = ConsumerSubject.create(null, false);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ExternalHeadingSystemEvents>();
    this.deltaHeadingRate.setConsumer(sub.on('ext_hdg_delta_heading_rate'));
    this.isHeadingDataValid.setConsumer(sub.on('ext_hdg_heading_data_valid'));

    const headingRateSub = this.deltaHeadingRate.map(SubscribableMapFunctions.withPrecision(0.5)).withLifecycle(this.defaultLifecycle).sub(
      (rate) => {
        if (rate < 0) {
          this.turnRateRightRef.instance.classList.add('hidden');
          this.turnRateLeftRef.instance.classList.remove('hidden');
          const angle = MathUtils.round(SvsTurnRateIndicator.FULL_ROTATION * (MathUtils.clamp(4.5 + rate, 0, 4.5) / 4.5), 0.01);
          this.turnRateLeftRef.instance.style.transform = `rotate(${angle}deg)`;
          this.turnRateLeftRef.instance.classList.toggle('full', rate <= -4.5);
        } else {
          this.turnRateLeftRef.instance.classList.add('hidden');
          this.turnRateRightRef.instance.classList.remove('hidden');
          // this side has a scaleX(-1) so the angle should also take that into account (i.e., don't flip)
          const angle = MathUtils.round(SvsTurnRateIndicator.FULL_ROTATION * (MathUtils.clamp(4.5 - rate, 0, 4.5) / 4.5), 0.01);
          this.turnRateRightRef.instance.style.transform = `rotate(${angle}deg)`;
          this.turnRateRightRef.instance.classList.toggle('full', rate >= 4.5);
        }
      },
      true,
      true,
    );

    this.isHeadingDataValid.sub((isValid) => {
      if (isValid) {
        headingRateSub.resume(true);
      } else {
        headingRateSub.pause();
      }
    }, true);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={{ 'svs-turn-rate-indicator-container': true, 'hidden': this.isHeadingDataValid.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle) }}>
        <div class="svs-turn-rate left">
          <svg class="svs-turn-rate-indicator" width="115" height="43" viewBox="38 0 115 43" ref={this.turnRateLeftRef}>
            <path class="svs-turn-rate-arrow" d="M 45.88 30.001 l -7 10.985 l 12.697 0.89 z" />
            <path class="svs-turn-rate-outline" d="M 153 6.959 A 206 206 0 0 0 47.752 36.433" />
            <path class="svs-turn-rate-line" d="M 153 6.959 A 206 206 0 0 0 47.185 36.765" />
          </svg>
        </div>
        <div class="svs-turn-rate right">
          <svg class="svs-turn-rate-indicator" width="115" height="43" viewBox="38 0 115 43" ref={this.turnRateRightRef}>
            <path class="svs-turn-rate-arrow" d="M 45.88 30.001 l -7 10.985 l 12.697 0.89 z" />
            <path class="svs-turn-rate-outline" d="M 153 6.959 A 206 206 0 0 0 47.752 36.433" />
            <path class="svs-turn-rate-line" d="M 153 6.959 A 206 206 0 0 0 47.185 36.765" />
          </svg>
        </div>
        <svg class="svs-turn-rate-range" viewBox="43 0 220 43">
          <path
            class="svs-turn-rate-range-shadow"
            d="M 80.5 17.25 a 206 206 0 0 1 146 0 m -146 0 l 4 10 m 142 -10 l -4 10 m -106.972 -19.839 l 1.1 6.5 m 73.185 -6.806 l -1.1 6.5 m -35.216 -9.723 l 0 5"
          />
          <path
            class="svs-turn-rate-range-line"
            d="M 80 17 a 206 206 0 0 1 146 0 m -146 0 l 4 10 m 142 -10 l -4 10 m -106.972 -19.839 l 1.1 6.5 m 73.185 -6.806 l -1.1 6.5 m -35.216 -9.723 l 0 5"
          />
        </svg>
      </div>
    );
  }
}

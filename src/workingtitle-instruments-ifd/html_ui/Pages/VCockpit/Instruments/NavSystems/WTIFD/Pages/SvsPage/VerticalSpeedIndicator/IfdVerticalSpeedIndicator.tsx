import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, MappedSubject, MathUtils, VNode } from '@microsoft/msfs-sdk';

import { ExternalAdcSystemEvents } from '../../../Systems/ExternalAdcSystem';

import './IfdVerticalSpeedIndicator.css';

/**
 * Props for {@link IfdVerticalSpeedIndicator}
 */
interface IfdVerticalSpeedIndicatorProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
}

/**
 * The Ifd custom true airspeed indicator (TAS)
 */
export class IfdVerticalSpeedIndicator extends LifecycleComponent<IfdVerticalSpeedIndicatorProps> {
  private readonly vs = ConsumerSubject.create(null, 0);
  private readonly isValid = ConsumerSubject.create(null, false);

  private readonly formattedVs = MappedSubject.create(
    ([vs, valid]) => valid ? MathUtils.round(MathUtils.clamp(vs, -99950, 99950), 50).toFixed() : '----',
    this.vs,
    this.isValid,
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ExternalAdcSystemEvents>();
    this.vs.setConsumer(sub.on('ext_adc_vertical_speed'));
    this.isValid.setConsumer(sub.on('ext_adc_speed_data_valid'));
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="wt-ifd-vertical-speed-container">
        <div class="big-text">{this.formattedVs}</div>
        <div class="small-text">FPM</div>
      </div>
    );
  }
}

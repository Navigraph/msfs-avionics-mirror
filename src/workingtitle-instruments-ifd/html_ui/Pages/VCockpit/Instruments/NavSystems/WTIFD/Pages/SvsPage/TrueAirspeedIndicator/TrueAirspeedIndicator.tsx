import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, MappedSubject, MathUtils, VNode } from '@microsoft/msfs-sdk';

import { ExternalAdcSystemEvents } from '../../../Systems/ExternalAdcSystem';

import './TrueAirspeedIndicator.css';

/**
 * Props for {@link IfdTrueAirspeedIndicator}
 */
interface IfdTrueAirspeedIndicatorProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
}

/**
 * The Ifd custom true airspeed indicator (TAS)
 */
export class IfdTrueAirspeedIndicator extends LifecycleComponent<IfdTrueAirspeedIndicatorProps> {
  private readonly tas = ConsumerSubject.create(null, 0);
  private readonly isValid = ConsumerSubject.create(null, false);

  private readonly formattedTas = MappedSubject.create(
    ([tas, valid]) => valid ? MathUtils.clamp(Math.floor(tas), 50, 9999).toFixed().padStart(4, ' ') : '----',
    this.tas,
    this.isValid,
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ExternalAdcSystemEvents>();
    this.tas.setConsumer(sub.on('ext_adc_tas'));
    this.isValid.setConsumer(sub.on('ext_adc_speed_data_valid'));
  }

  /** @inheritdoc */
  public render(): VNode {

    return (
      <div class="wt-ifd-tas-container">
        <div class="small-text prefix">TAS</div>
        <div class="big-text">{this.formattedTas}</div>
        <div class="small-text suffix">KT</div>
      </div>
    );
  }
}

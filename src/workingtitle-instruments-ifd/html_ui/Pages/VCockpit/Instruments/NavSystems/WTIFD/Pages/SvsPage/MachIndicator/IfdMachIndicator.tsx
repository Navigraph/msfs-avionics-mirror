import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, MappedSubject, MathUtils, VNode } from '@microsoft/msfs-sdk';

import { ExternalAdcSystemEvents } from '../../../Systems/ExternalAdcSystem';

import './IfdMachIndicator.css';

/**
 * Props for {@link IfdMachIndicator}
 */
interface IfdMachIndicatorProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
}

/**
 * The Ifd custom true airspeed indicator (TAS)
 */
export class IfdMachIndicator extends LifecycleComponent<IfdMachIndicatorProps> {
  private readonly machNumber = ConsumerSubject.create(null, 0);
  private readonly isValid = ConsumerSubject.create(null, false);

  private readonly formattedMach = MappedSubject.create(
    ([mach, valid]) => valid ? MathUtils.clamp(mach, 0.10, 9.99).toFixed(2) : '-.--',
    this.machNumber,
    this.isValid,
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ExternalAdcSystemEvents>();
    this.machNumber.setConsumer(sub.on('ext_adc_mach_number'));
    this.isValid.setConsumer(sub.on('ext_adc_speed_data_valid'));
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="wt-ifd-mach-container">
        <div class="small-text prefix">M</div>
        <div class="big-text">{this.formattedMach}</div>
      </div>
    );
  }
}

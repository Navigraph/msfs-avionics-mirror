import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';

import { ExternalAdcSystemEvents } from '../../../Systems/ExternalAdcSystem';

import './IfdAirTempIndicator.css';

/**
 * Props for {@link IfdAirTempIndicator}
 */
interface IfdAirTempIndicatorProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
}

/**
 * The Ifd custom true airspeed indicator (TAS)
 */
export class IfdAirTempIndicator extends LifecycleComponent<IfdAirTempIndicatorProps> {
  private readonly oat = ConsumerSubject.create(null, 0);
  private readonly tat = ConsumerSubject.create(null, 0);
  private readonly isAirDataValid = ConsumerSubject.create(null, false);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ExternalAdcSystemEvents>();
    this.oat.setConsumer(sub.on('ext_adc_ambient_temp_c'));
    this.tat.setConsumer(sub.on('ext_adc_ram_air_temp_c'));
    this.isAirDataValid.setConsumer(sub.on('ext_adc_altitude_data_valid'));
  }

  /** @inheritdoc */
  public render(): VNode {
    const formattedOat = MappedSubject.create(
      ([oat, valid]) => valid ? oat.toFixed() : '---',
      this.oat,
      this.isAirDataValid,
    ).withLifecycle(this.defaultLifecycle);

    const formattedTat = MappedSubject.create(
      ([tat, valid]) => valid ? tat.toFixed() : '---',
      this.tat,
      this.isAirDataValid,
    ).withLifecycle(this.defaultLifecycle);

    return (
      <div class="wt-ifd-air-temp-container">
        <div class="oat-temp-row">
          <div class="small-text prefix">OAT</div>
          <div class="small-text value">{formattedOat}</div>
        </div>

        <div class="tat-temp-row">
          <div class="small-text prefix">TAT</div>
          <div class="small-text value">{formattedTat}</div>
        </div>
      </div>
    );
  }
}

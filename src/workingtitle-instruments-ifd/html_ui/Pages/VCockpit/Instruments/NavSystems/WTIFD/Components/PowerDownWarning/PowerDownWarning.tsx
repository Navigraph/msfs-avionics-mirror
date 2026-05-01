import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdPowerEvents } from '../../Misc/IfdPowerMonitor';

import './PowerDownWarning.css';

/** Props for the power down warning. */
export interface PowerDownWarningProps extends ComponentProps {
  /** The event bus to use. */
  readonly bus: EventBus;
}

/** the power down warning shown when the power button is held. */
export class PowerDownWarning extends LifecycleComponent<PowerDownWarningProps> {
  private readonly sub = this.props.bus.getSubscriber<IfdPowerEvents>();

  /** The time remaining before the IFD will shut down if the power button is held, or null if no power down is pending. */
  private readonly timeRemaining = ConsumerSubject.create(this.sub.on('ifd_power_down_time_remaining'), null);

  /** @inheritdoc */
  public override render(): VNode | null {
    return (
      <div class={{ 'power-down-warn-container': true, 'hidden': this.timeRemaining.map((v) => v === null).withLifecycle(this.defaultLifecycle) }}>
        <div class="power-down-warn">
          <p class="red-warning">***&nbsp;POWER&nbsp;DOWN&nbsp;WARNING&nbsp;***</p>
          <p class="instructions">Unit will power down if power knob is not released</p>
          <p class="time-remaining">{this.timeRemaining.map((v) => v !== null ? Math.round(v) : '-').withLifecycle(this.defaultLifecycle)}</p>
          <p class="red-warning">***&nbsp;POWER&nbsp;DOWN&nbsp;WARNING&nbsp;***</p>
        </div>
      </div>
    );
  }
}

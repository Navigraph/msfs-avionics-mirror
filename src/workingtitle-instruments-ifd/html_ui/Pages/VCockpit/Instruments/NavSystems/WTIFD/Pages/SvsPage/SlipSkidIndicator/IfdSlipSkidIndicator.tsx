import {
  ComponentProps, ConsumerSubject, CssTransformBuilder, CssTransformSubject, EventBus, FSComponent, LifecycleComponent, MappedSubject, SubscribableMapFunctions,
  VNode
} from '@microsoft/msfs-sdk';

import { ArsSystemEvents } from '../../../Systems/ArsSystem';

import './IfdSlipSkidIndicator.css';

/** Properties of the {@link IfdSlipSkidIndicator} component. */
export interface IfdSlipSkidIndicatorProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
}

/** The IFD slip/skid trapezoid indicator */
export class IfdSlipSkidIndicator extends LifecycleComponent<IfdSlipSkidIndicatorProps> {
  private readonly ballTransform = CssTransformSubject.create(CssTransformBuilder.translate3d('%', '%', 'px'));

  private readonly isAttitudeDataValid = ConsumerSubject.create(null, false);
  private readonly turnCoordinatorBall = ConsumerSubject.create(null, 0);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ArsSystemEvents>();
    this.isAttitudeDataValid.setConsumer(sub.on('ars_attitude_data_valid'));
    this.turnCoordinatorBall.setConsumer(sub.on('ars_turn_coordinator_ball'));

    this.register(
      MappedSubject.create(
        ([rollPointerPos, valid]) => {
          // rollPointerPos is -1 to 1
          // to keep the pointer within the window
          // pointer remains centered if data is invalid
          this.ballTransform.transform.set(valid ? rollPointerPos * 10 : 0, 0, 0, 0.1);
          this.ballTransform.resolve();
        },
        this.turnCoordinatorBall,
        this.isAttitudeDataValid,
      )
    );
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="wt-ifd-slip-skid-container">
        <svg
          class="wt-ifd-roll-pointer"
          viewBox="-35 -2 70 38.5"
        >
          <path d="M 0 0 L -14.5 14.5 L 14.5 14.5 z" />
        </svg>
        <svg
          class={{ 'wt-ifd-slip-skid-indicator': true, 'hidden': this.isAttitudeDataValid.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle) }}
          viewBox="-35 -2 70 38.5"
          style={{ transform: this.ballTransform }}
        >
          <path d="M -18 18 L -35 35 L 35 35 L 18 18 z" />
        </svg>
      </div>
    );
  }
}

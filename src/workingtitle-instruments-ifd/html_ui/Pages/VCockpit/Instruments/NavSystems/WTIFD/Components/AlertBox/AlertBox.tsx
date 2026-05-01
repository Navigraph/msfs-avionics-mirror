import { ComponentProps, DebounceTimer, EventBus, FSComponent, LifecycleComponent, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler } from '../../RightKnob';
import { IfdCasMessagePriority } from '../../Systems/Cas/CasMessages';
import { IfdCasAlertManager } from '../../Systems/Cas/IfdCasAlertManager';

import './AlertBox.css';

/** Props for the alert box. */
interface AlertBoxProps extends ComponentProps {
  /** An instance of the CAS alert manager. */
  readonly casAlertManager: IfdCasAlertManager;
  /** The event bus. */
  readonly bus: EventBus;
}

/** The message alert box shown at the bottom right corner of the display. */
export class AlertBox extends LifecycleComponent<AlertBoxProps> implements IfdInteractionEventHandler {
  private static readonly ACK_DEBOUNCE_TIME = 500;
  private static readonly MAX_TEXT_WIDTH_PX = 130;

  private readonly ref = FSComponent.createRef<HTMLDivElement>();
  private readonly textRef = FSComponent.createRef<HTMLSpanElement>();

  private readonly ackInProgress = Subject.create(false);
  private readonly ackTimer = new DebounceTimer();

  private readonly prio = Subject.create<IfdCasMessagePriority | undefined>(undefined);
  private readonly text = Subject.create('');

  private readonly textSize = Subject.create('1em');

  // eslint-disable-next-line jsdoc/require-jsdoc
  private readonly messageSubs: { destroy: () => void }[] = [];
  private messageSub?: Subscription;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.messageSub = this.props.casAlertManager.highestPriorityUnacknowledgedAlert.sub((alert) => {
      for (let i = 0; i < this.messageSubs.length; i++) {
        this.messageSubs[i].destroy();
      }
      this.messageSubs.length = 0;

      this.prio.set(alert?.priority);
      const message = alert?.message;
      if (message && typeof message === 'function') {
        const textSub = this.props.casAlertManager.createMessageSubject(alert);
        this.messageSubs.push(textSub);
        this.messageSubs.push(textSub.pipe(this.text));
      } else {
        this.text.set(message ? message : '');
      }
    }, true).withLifecycle(this.defaultLifecycle);

    // Dynamically size the (potentially dynamic) text so it fits in the box.
    this.text.sub((t) => {
      if (t.length === 0) {
        return;
      }
      this.textSize.set('1em');
      const bbox = this.textRef.instance.getBoundingClientRect();
      this.textSize.set(`${Math.min(1, AlertBox.MAX_TEXT_WIDTH_PX / bbox.width).toFixed(2)}em`);
    }).withLifecycle(this.defaultLifecycle);

    this.ref.instance.addEventListener('click', this.acknowledge);
  }

  /** @inheritdoc */
  onInteractionEvent(event: IfdInteractionEvent): boolean {
    return event === IfdInteractionEvent.CLR && this.acknowledge();
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.ref.instance.removeEventListener('click', this.acknowledge);
    this.messageSub?.destroy();
    for (let i = 0; i < this.messageSubs.length; i++) {
      this.messageSubs[i].destroy();
    }
    this.messageSubs.length = 0;
  }

  private resetAckInProgress = (): void => {
    this.ackInProgress.set(false);
    this.messageSub?.resume(true);
  };

  /**
   * Acknowledges any active unacknowledged messages.
   * @returns true if an alert was acknowledged.
   */
  private acknowledge = (): boolean => {
    if (this.prio.get() === undefined || this.ackInProgress.get()) {
      return false;
    }

    // Show the acked message in green for a short time
    this.messageSub?.pause();
    this.props.casAlertManager.acknowledgeHighestPriorityMessage();
    this.ackInProgress.set(true);
    this.ackTimer.schedule(this.resetAckInProgress, AlertBox.ACK_DEBOUNCE_TIME);
    return true;
  };

  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div
        ref={this.ref}
        class={{
          'alert-box': true,
          'hidden': this.prio.map((v) => v === undefined),
          'red-highlight': this.prio.map((v) => v === IfdCasMessagePriority.Warning),
          'yellow-highlight': this.prio.map((v) => v === IfdCasMessagePriority.Caution),
          'cyan-highlight': this.prio.map((v) => v === IfdCasMessagePriority.Advisory),
          'green-highlight': this.prio.map((v) => v === IfdCasMessagePriority.Notice),
          'green-text': this.ackInProgress,
        }}
      >
        <span ref={this.textRef} style={{
          'font-size': this.textSize,
        }}>
          {this.text}
        </span>
      </div>
    );
  }
}

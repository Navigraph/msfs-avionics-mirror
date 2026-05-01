import {
  ClockEvents, ComponentProps, ConsumerSubject, DisplayComponent, EventBus, FSComponent, LifecycleComponent, NodeReference, Subject, Subscribable,
  SubscribableArrayEventType, VNode, Wait
} from '@microsoft/msfs-sdk';

import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { CasMessageDefinition, IfdCasActiveMessage, IfdCasMessagePriority } from '../../../Systems/Cas/CasMessages';
import { IfdCasAlertManager } from '../../../Systems/Cas/IfdCasAlertManager';

import './AlertTab.css';

/** The properties for the {@link AlertTab} component. */
interface AlertTabProps extends TabContentProps {
  /** The CAS alert manager. */
  readonly casAlertManager: IfdCasAlertManager;
  /** An instance of the event bus. */
  readonly bus: EventBus;
}

/** The AlertTab component. */
export class AlertTab extends TabContent<AlertTabProps> {
  public readonly title: string = 'ALERT';

  private readonly categories: Record<IfdCasMessagePriority, NodeReference<AlertCategory>> = {
    [IfdCasMessagePriority.Warning]: FSComponent.createRef(),
    [IfdCasMessagePriority.Caution]: FSComponent.createRef(),
    [IfdCasMessagePriority.Advisory]: FSComponent.createRef(),
    [IfdCasMessagePriority.Notice]: FSComponent.createRef(),
  };

  private readonly activeSimDuration = ConsumerSubject.create<number>(null, 0);
  private readonly noActiveAlerts = Subject.create(true);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.props.casAlertManager.getActiveAlertSubject().sub((_, ev, items, arr) => {
      if (ev === SubscribableArrayEventType.Added) {
        if (Array.isArray(items)) {
          for (const item of items as IfdCasActiveMessage[]) {
            this.categories[item.def.priority].instance.addAlert(item);
          }
        } else if (items) {
          this.categories[(items as IfdCasActiveMessage).def.priority].instance.addAlert((items as IfdCasActiveMessage));
        }
      } else if (ev === SubscribableArrayEventType.Removed) {
        if (Array.isArray(items)) {
          for (const item of items as IfdCasActiveMessage[]) {
            this.categories[item.def.priority].instance.removeAlert(item);
          }
        } else if (items) {
          this.categories[(items as IfdCasActiveMessage).def.priority].instance.removeAlert((items as IfdCasActiveMessage));
        }
      } else if (ev === SubscribableArrayEventType.Cleared) {
        this.categories[IfdCasMessagePriority.Warning].instance.clearAlerts();
        this.categories[IfdCasMessagePriority.Caution].instance.clearAlerts();
        this.categories[IfdCasMessagePriority.Advisory].instance.clearAlerts();
        this.categories[IfdCasMessagePriority.Notice].instance.clearAlerts();
      }

      this.noActiveAlerts.set(arr.length < 1);
    }, true);

    this.activeSimDuration.setConsumer(this.bus.getSubscriber<ClockEvents>().on('activeSimDuration'));
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="ifd-aux-alert-tab">
        <div class="no-active-alerts">No Active Alerts</div>
        <div
          class={{
            'active-alert-container': true,
            'hidden': this.noActiveAlerts,
          }}
        >
          <AlertCategory name='WARNINGS' ref={this.categories[IfdCasMessagePriority.Warning]} casManager={this.props.casAlertManager} activeSimDuration={this.activeSimDuration} />
          <AlertCategory name='CAUTIONS' ref={this.categories[IfdCasMessagePriority.Caution]} casManager={this.props.casAlertManager} activeSimDuration={this.activeSimDuration} />
          <AlertCategory name='ADVISORIES' ref={this.categories[IfdCasMessagePriority.Advisory]} casManager={this.props.casAlertManager} activeSimDuration={this.activeSimDuration} />
          <AlertCategory name='NOTICES' ref={this.categories[IfdCasMessagePriority.Notice]} casManager={this.props.casAlertManager} activeSimDuration={this.activeSimDuration} />
        </div>
      </div>
    );
  }
}

/**
 *
 */
interface AlertCategoryProps extends ComponentProps {
  /** The CAS alert manager. */
  casManager: IfdCasAlertManager,
  /** The name of the category. */
  name: string;
  /** The elapsed sim time since the simulation began in ms. */
  activeSimDuration: Subscribable<number>;
}

/**
 *
 */
class AlertCategory extends DisplayComponent<AlertCategoryProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  private readonly alertCount = Subject.create(0);
  // eslint-disable-next-line jsdoc/require-jsdoc
  private readonly alerts: { ref: NodeReference<ActiveAlert>, node: Node }[] = [];

  /** Clear all of the alerts. */
  public clearAlerts(): void {
    for (let i = this.alerts.length - 1; i >= 0; i--) {
      this.deleteAlertNode(i);
    }
    this.alertCount.set(0);
  }

  /**
   * Add an alert to the list.
   * @param casMessage The CAS message to add.
   */
  public addAlert(casMessage: IfdCasActiveMessage): void {
    const def = this.props.casManager.getDefinition(casMessage.uuid);
    if (!def) {
      return;
    }

    const alertRef = FSComponent.createRef<ActiveAlert>();
    FSComponent.render(
      <ActiveAlert ref={alertRef} casManager={this.props.casManager} alert={casMessage} definition={def} activeSimDuration={this.props.activeSimDuration} />,
      this.ref.instance,
    );
    this.alerts.push({ ref: alertRef, node: this.ref.instance.lastElementChild! });

    this.alertCount.set(this.alerts.length);
  }

  /**
   * Remove an alert from the list.
   * @param alert The alert to remove.
   */
  public removeAlert(alert: IfdCasActiveMessage): void {
    for (let i = 0; i < this.alerts.length; i++) {
      if (this.alerts[i].ref.instance.getUuid() === alert.uuid) {
        this.deleteAlertNode(i);
        break;
      }
    }

    this.alertCount.set(this.alerts.length);
  }

  /**
   * Deletes and cleans up an alert node.
   * @param index Index of the node to delete.
   */
  private deleteAlertNode(index: number): void {
    this.alerts[index].ref.instance.destroy();
    this.ref.instance.removeChild(this.alerts[index].node);
    this.alerts.splice(index, 1);
  }

  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div ref={this.ref} class={{ 'alert-category': true, [this.props.name.toLowerCase()]: true, 'hidden': this.alertCount.map((n) => n < 1) }}>
        <div class='header'>
          <div class='title'>{this.alertCount.map((n) => `${this.props.name}\xa0(${n})`)}</div>
          <div class='duration'>Duration</div>
        </div>
      </div>
    );
  }
}

/**
 *
 */
interface ActiveAlertProps extends ComponentProps {
  /** The CAS alert manager. */
  casManager: IfdCasAlertManager;
  /** The CAS alert this component is to represent. */
  alert: IfdCasActiveMessage;
  /** CAS alert definition. */
  definition: CasMessageDefinition;
  /** The elapsed sim time since the simulation began in ms. */
  activeSimDuration: Subscribable<number>;
}

/** An active alert row. */
class ActiveAlert extends LifecycleComponent<ActiveAlertProps> {
  private static readonly MAX_MESSAGE_WIDTH_PX = 140;

  private readonly message = Subject.create('');
  private readonly description = Subject.create('');
  private readonly duration = Subject.create(this.calculateDuration());

  private readonly messageTextRef = FSComponent.createRef<HTMLSpanElement>();

  private readonly messageFontSize = Subject.create('1em');

  /**
   * Gets the UUID of this alert.
   * @returns The UUID.
   */
  public getUuid(): string {
    return this.props.alert.uuid;
  }

  /**
   * Calculates the active duration for this alert.
   * @returns the duration in seconds.
   */
  private calculateDuration(): number {
    return Math.trunc(Math.max(0, (this.props.activeSimDuration.get() - this.props.alert.lastActivated) / 1000));
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // Dynamically size the (potentially dynamic) text so it fits in the box.
    // We have to wait a frame after first render so the text is visible before the bounding box can be calculated.
    Wait.awaitFrames(0, true).then(() => {
      this.message.sub((m) => {
        if (m.length === 0) {
          return;
        }
        this.messageFontSize.set('1em');
        const bbox = this.messageTextRef.instance.getBoundingClientRect();
        this.messageFontSize.set(`${Math.min(1, ActiveAlert.MAX_MESSAGE_WIDTH_PX / bbox.width).toFixed(2)}em`);
      }, true).withLifecycle(this.defaultLifecycle);
    });

    if (typeof this.props.definition.message === 'string') {
      this.message.set(this.props.definition.message);
    } else {
      const message = this.props.casManager.createMessageSubject(this.props.definition).withLifecycle(this.defaultLifecycle);
      message.pipe(this.message).withLifecycle(this.defaultLifecycle);
    }

    if (this.props.definition.description === undefined) {
      // default to same as message
      this.message.pipe(this.description).withLifecycle(this.defaultLifecycle);
    } else if (typeof this.props.definition.description === 'function') {
      // we have a dynamic description that changes while active
      const description = this.props.casManager.createDescriptionSubject(this.props.definition).withLifecycle(this.defaultLifecycle);
      description.pipe(this.description).withLifecycle(this.defaultLifecycle);
    } else {
      // plain old static text
      this.description.set(this.props.definition.description);
    }

    this.props.activeSimDuration.sub(() => this.duration.set(this.calculateDuration())).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div class="active-alert">
        <div class="alert-message"><span ref={this.messageTextRef} style={{ 'font-size': this.messageFontSize }}>{this.message}</span></div>
        <div class="alert-description">{this.description}</div>
        <div class="alert-duration"><span>{this.duration.map((v) => (Math.trunc(v / 3600)).toFixed(0))}</span><span>:</span><span>{this.duration.map((v) => (Math.trunc(v / 60) % 60).toFixed(0).padStart(2, '0'))}</span><span>:</span><span>{this.duration.map((v) => (v % 60).toFixed(0).padStart(2, '0'))}</span></div>
      </div>
    );
  }
}

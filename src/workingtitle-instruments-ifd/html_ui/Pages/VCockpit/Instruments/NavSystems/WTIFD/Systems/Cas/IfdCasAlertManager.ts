import {
  ArraySubject, EventBus, MappedSubject, RegisteredSimVarUtils, SimVarValueType, SortedMappedSubscribableArray, Subject, Subscribable, SubscribableArray
} from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../FlightPlan';
import { IfdOptions } from '../../IfdOptions';
import { TimerManager } from '../Timer/TimerManager';
import { CasMessageDataSource } from './CasMessageDataSource';
import { CAS_MESSAGES, CasMessageDefinition, IfdCasActiveMessage, IfdCasMessagePriority } from './CasMessages';
import { CasUuid } from './CasUuid';
import { IfdCasControlEvents } from './IfdCasControlEvents';

/**
 * Manages the CAS alert state for this instrument.
 */
export class IfdCasAlertManager {
  private readonly casSubscriber = this.bus.getSubscriber<IfdCasControlEvents>();
  private readonly casPublisher = this.bus.getPublisher<IfdCasControlEvents>();

  private readonly activeSimDuration = RegisteredSimVarUtils.create('E:SIMULATION TIME', SimVarValueType.Seconds);

  private readonly _highestActivePriority = Subject.create<IfdCasMessagePriority | undefined>(undefined);
  public readonly highestActivePriority: Subscribable<IfdCasMessagePriority | undefined> = this._highestActivePriority;

  private readonly _highestPriorityUnacknowledgedAlert = Subject.create<CasMessageDefinition | undefined>(undefined);
  public readonly highestPriorityUnacknowledgedAlert: Subscribable<CasMessageDefinition | undefined> = this._highestPriorityUnacknowledgedAlert;

  private readonly messageDataSource = new CasMessageDataSource(this.bus, this.flightPlanStore, this.timerManager, this.ifdOptions);

  private readonly activeMessages = ArraySubject.create<IfdCasActiveMessage>();
  private activeMessageSort = (a: IfdCasActiveMessage, b: IfdCasActiveMessage): number => {
    if (a.def.priority === b.def.priority) {
      return b.lastActivated - a.lastActivated;
    }
    return a.def.priority - b.def.priority;
  };

  private activeMessageEquality = (a: IfdCasActiveMessage, b: IfdCasActiveMessage): boolean => {
    return a.uuid === b.uuid;
  };
  private readonly sortedActiveMessages = SortedMappedSubscribableArray.create(this.activeMessages, this.activeMessageSort, this.activeMessageEquality);



  /**
   * Constructs a new CasAlertManager.
   * @param bus The event bus.
   * @param ifdOptions The IFD instrument config to use.
   * @param flightPlanStore the flight plan store to use.
   * @param timerManager the timer manager to use.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly ifdOptions: IfdOptions,
    private readonly flightPlanStore: FlightPlanStore,
    private readonly timerManager: TimerManager,
  ) {
    this.sortedActiveMessages.sub(this.updateHighestActivePriority.bind(this), true);
    this.sortedActiveMessages.sub(this.updateHighestPriorityUnacknowledged.bind(this), true);

    this.casSubscriber.on('ifd_cas_acknowledge_alert').handle(this.handleAcknowledge.bind(this));
    this.casSubscriber.on('ifd_cas_activate_alert').handle(this.handleActivate.bind(this));
    this.casSubscriber.on('ifd_cas_deactivate_alert').handle(this.handleDeactivate.bind(this));
  }

  /**
   * Gets the current time (sim duration) in ms.
   * @returns Current sim session elapsed time in ms.
   */
  private getTime(): number {
    return this.activeSimDuration.get() * 1_000;
  }

  /**
   * Handles ack commands.
   * @param uuid UUID of the message to ack.
   */
  private handleAcknowledge(uuid: CasUuid): void {
    for (const message of this.activeMessages.getArray()) {
      if (message.uuid === uuid && !message.acknowledged) {
        this.activeMessages.removeItem(message);
        message.acknowledged = true;
        this.activeMessages.insert(message);
        return;
      }
    }
  }

  /**
   * Handles activate commands.
   * @param uuid UUID of the message to activate.
   */
  private handleActivate(uuid: CasUuid): void {
    for (const message of this.activeMessages.getArray()) {
      if (message.uuid === uuid) {
        this.activeMessages.removeItem(message);
        message.lastActivated = this.getTime();
        message.acknowledged = false;
        this.activeMessages.insert(message);
        return;
      }
    }

    const def = CAS_MESSAGES[uuid];
    if (!def) {
      console.warn('[IfdCasAlertManager] Trying to activate a UUID that doesn\'t exist!', uuid);
      return;
    }

    this.activeMessages.insert({
      def,
      uuid,
      lastActivated: this.getTime(),
      acknowledged: false,
    });
  }

  /**
   * Handles de-activate commands.
   * @param uuid UUID of the message to de-activate.
   */
  private handleDeactivate(uuid: CasUuid): void {
    for (let i = 0; i < this.activeMessages.length; i++) {
      if (this.activeMessages.get(i).uuid === uuid) {
        this.activeMessages.removeAt(i);
        return;
      }
    }
  }

  /** Updates the current highest priority that has an active alert active. */
  private updateHighestActivePriority(): void {
    if (this.sortedActiveMessages.length > 0) {
      this._highestActivePriority.set(this.sortedActiveMessages.get(0).def.priority);
    } else {
      this._highestActivePriority.set(undefined);
    }
  }

  /**
   * Gets the current highest priority unacknowledged message.
   * @returns either a message, or undefined if there are no unacknowledged messages.
   */
  private getHighestPriorityUnacknowledged(): CasUuid | undefined {
    for (let i = 0; i < this.sortedActiveMessages.length; i++) {
      const message = this.sortedActiveMessages.get(i);
      if (!message.acknowledged) {
        return message.uuid as CasUuid;
      }
    }
  }


  /** Updates the current highest priority unacknowledged message. */
  private updateHighestPriorityUnacknowledged(): void {
    const uuid = this.getHighestPriorityUnacknowledged();
    this._highestPriorityUnacknowledgedAlert.set(uuid !== undefined ? CAS_MESSAGES[uuid] : undefined);
  }

  /**
   * Acknowledges the highest priority unacknowledged CAS alert, if there is one.
   */
  public acknowledgeHighestPriorityMessage(): void {
    const uuid = this.getHighestPriorityUnacknowledged();
    const def = uuid ? CAS_MESSAGES[uuid] : undefined;
    if (!uuid || !def) {
      return;
    }

    if (def.deleteOnAck) {
      this.casPublisher.pub('ifd_cas_deactivate_alert', uuid, !!def.isGlobal, false);
    } else {
      this.casPublisher.pub('ifd_cas_acknowledge_alert', uuid, !!def.isGlobal, false);
    }
  }

  /**
   * Gets a CAS alert definition.
   * @param uuid The UUID of the alert to get.
   * @returns The alert definition if it exists, else undefined.
   */
  public getDefinition(uuid: string): CasMessageDefinition | undefined {
    return CAS_MESSAGES[uuid as CasUuid];
  }

  /**
   * Creates a mapped subject for the dynamic message in a CAS alert.
   * @param definition The CAS alert definition.
   * @returns A new MappedSubject that outputs the current message text.
   * @throws If the alert message is not a dynamic one.
   */
  public createMessageSubject(definition: CasMessageDefinition): MappedSubject<any, string> {
    const format = definition.message;
    if (typeof format !== 'function') {
      throw new Error('[CasAlertManager::createMessageSubject] Invalid dynamic message definition!');
    }

    return MappedSubject.create(
      () => format(this.messageDataSource),
      ...definition.dataSubs!.map((k) => this.messageDataSource[k]),
    );
  }

  /**
   * Creates a mapped subject for the dynamic description in a CAS alert.
   * @param definition The CAS alert definition.
   * @returns A new MappedSubject that outputs the current description text.
   * @throws If the alert description not a dynamic one.
   */
  public createDescriptionSubject(definition: CasMessageDefinition): MappedSubject<any, string> {
    const format = definition.description;
    if (typeof format !== 'function') {
      throw new Error('[CasAlertManager::createDescriptionSubject] Invalid dynamic description definition!');
    }

    return MappedSubject.create(
      () => format(this.messageDataSource),
      ...definition.dataSubs!.map((k) => this.messageDataSource[k]),
    );
  }

  /**
   * Gets a sorted array of the active alerts.
   * @returns The sorted subscribable array.
   */
  public getActiveAlertSubject(): SubscribableArray<IfdCasActiveMessage> {
    return this.sortedActiveMessages;
  }
}

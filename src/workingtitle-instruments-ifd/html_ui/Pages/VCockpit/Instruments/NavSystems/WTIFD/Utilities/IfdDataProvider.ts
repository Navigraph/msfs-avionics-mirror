import { AdcEvents, ClockEvents, Consumer, ConsumerSubject, EventBus, Subscribable } from '@microsoft/msfs-sdk';

import { IFD_INITIAL_EVENT_VALUES } from './IfdDataProviderConfig';

/**
 * Information about an IFD event.
 */
export type IfdEventInfo<V> = V | {
  /** The initial value of the event. */
  initialValue: V;
  /** The frequency in Hz at which the event updates. Optional. */
  frequency?: number | 'UNLIMITED';
}

/** A subset of an Event interface. */
export type SelectedEvents<E, K extends keyof E> = {
  [P in K]: IfdEventInfo<E[P]>;
};

/** Wraps the values of an object in {@link Subscribable}s. */
type SubscribableWrapper<E> = {
  [K in keyof E]: Subscribable<E[K]>;
};

/** Wraps a subset of an Event interface in {@link Subscribable}s. */
export type EventSubscribables<E, K extends keyof E> = SubscribableWrapper<Pick<E, K>>;

/** Events supplied by an IFD data provider. */
export interface IfdEventData {
  /** ADC events. */
  adc: EventSubscribables<AdcEvents, keyof typeof IFD_INITIAL_EVENT_VALUES.adc>;
  /** Clock events. */
  clock: EventSubscribables<ClockEvents, keyof typeof IFD_INITIAL_EVENT_VALUES.clock>;
}

/** An XB-1 data provider. */
export class IfdDataProvider {
  public events: IfdEventData;

  /**
   * An XB-1 data provider.
   * @param bus An EventBus.
   * @param initialVals The initial values to supply to the {@link Subscribable}s.
   */
  constructor(public bus: EventBus, initialVals: typeof IFD_INITIAL_EVENT_VALUES) {
    this.events = {
      adc: this.createSubscribables(initialVals.adc),
      clock: this.createSubscribables(initialVals.clock),
    };
  }

  /**
   * Creates consumer subjects for each event.
   * @param initialVals The initial values to supply to the {@link Subscribable}s.
   * @param frequency Allows a common update frequency to be optionally set for all event topics of an interface, in Hz.
   * @returns An object of {@link Subscribable}s.
   */
  private createSubscribables<E, K extends keyof E & string, T extends E[K]>(
    initialVals: SelectedEvents<E, K>,
    frequency?: number,
  ): EventSubscribables<E, K> {
    const subscribables: Partial<EventSubscribables<E, K>> = {};

    for (const [eventTopic, eventInfo] of Object.entries(initialVals) as [K, IfdEventInfo<T>][]) {
      // `eventInfo` is either an object with multiple parameters or a scalar holding the initial value directly.
      let consumer: Consumer<E[K]>;

      if (eventInfo instanceof Object && typeof eventInfo.frequency === 'number') {
        // The event specifies its own frequency, overriding an interface-level one.
        consumer = this.bus.getSubscriber<E>().on(eventTopic).atFrequency(eventInfo.frequency);
      } else if (eventInfo instanceof Object && eventInfo.frequency === 'UNLIMITED') {
        // The event explicitly rejects a throttling frequency, ignoring an interface-level one.
        consumer = this.bus.getSubscriber<E>().on(eventTopic);
      } else if (typeof frequency === 'number') {
        // A frequency is specified for all events within the interface.
        consumer = this.bus.getSubscriber<E>().on(eventTopic).atFrequency(frequency);
      } else {
        // No throttling frequency defined, either at the event level or the interface level.
        consumer = this.bus.getSubscriber<E>().on(eventTopic);
      }

      subscribables[eventTopic] = ConsumerSubject.create(
        consumer,
        eventInfo instanceof Object ? eventInfo.initialValue : eventInfo
      );
    }

    return subscribables as EventSubscribables<E, K>;
  }
}

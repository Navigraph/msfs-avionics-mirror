import {
  AhrsEvents, AvionicsSystemState, AvionicsSystemStateEvent, BaseAhrsEvents, BasicAvionicsSystem, EventBus, EventBusMetaEvents, Subscribable, Subscription,
  SystemPowerKey
} from '@microsoft/msfs-sdk';

//
// no heading for 30 sec after instrument power up
// comes back after 10 seconds of solid heading input if it was off

/** Topics sourced from the SDK AHRS. */
type HeadingAhrsDataSourceTopics = 'actual_hdg_deg' | 'actual_hdg_deg_true' | 'delta_heading_rate';

/**
 * Data events sourced from the SDK AHRS.
 */
type HeadingAhrsDataEvents = {
  [P in keyof Pick<BaseAhrsEvents, HeadingAhrsDataSourceTopics> as `ext_hdg_${P}`]: BaseAhrsEvents[P];
};

/** Data source events. */
type HeadingSourceEvents = AhrsEvents;

/** Data events published by each ADAHRS channel. */
type HeadingDataEvents = HeadingAhrsDataEvents;

/** External heading system events. */
export interface ExternalHeadingSystemEvents extends HeadingDataEvents {
  /** The ARS system state. */
  'ext_hdg_state': AvionicsSystemStateEvent;
  /** Accelerometer data is valid. */
  'ext_hdg_heading_data_valid': boolean;
}

/**
 * An external heading system providing input to the IFD.
 */
export class ExternalHeadingSystem extends BasicAvionicsSystem<ExternalHeadingSystemEvents> {
  protected initializationTime = 10_000; // TODO no data for 30 sec after instrument power up

  private readonly attitudeDataValidTopic = 'ext_hdg_heading_data_valid' as const;

  private readonly dataSourceTopicMap: Record<keyof HeadingDataEvents, keyof HeadingSourceEvents> = {
    ['ext_hdg_actual_hdg_deg']: 'actual_hdg_deg',
    ['ext_hdg_actual_hdg_deg_true']: 'actual_hdg_deg_true',
    ['ext_hdg_delta_heading_rate']: 'delta_heading_rate',
  } as const;

  private readonly dataSourceSubscriber = this.bus.getSubscriber<HeadingSourceEvents>();

  private readonly dataSubs: Subscription[] = [];

  /**
   * Constructor
   * @param bus The event bus to use.
   * @param electrical The electrical supply for the system, or undefined for always powered.
   */
  constructor(bus: EventBus, electrical?: SystemPowerKey | CompositeLogicXMLElement | Subscribable<boolean>) {
    super(1, bus, 'ext_hdg_state');

    this.publisher.pub(this.attitudeDataValidTopic, true, false, true);

    if (electrical) {
      this.connectToPower(electrical);
    }

    this.startDataPublish();
  }

  /**
   * Starts publishing ADC data on the event bus.
   */
  private startDataPublish(): void {
    for (const topic of Object.keys(this.dataSourceTopicMap)) {
      if (this.bus.getTopicSubscriberCount(topic) > 0) {
        this.onTopicSubscribed(topic as keyof HeadingDataEvents);
      }
    }

    this.bus.getSubscriber<EventBusMetaEvents>().on('event_bus_topic_first_sub').handle(topic => {
      if (topic in this.dataSourceTopicMap) {
        this.onTopicSubscribed(topic as keyof HeadingDataEvents);
      }
    });
  }

  /**
   * Responds to when someone first subscribes to one of this system's data topics on the event bus.
   * @param topic The topic that was subscribed to.
   */
  private onTopicSubscribed(topic: keyof HeadingDataEvents): void {
    const paused = this.state !== undefined && this.state !== AvionicsSystemState.On;

    this.dataSubs.push(this.dataSourceSubscriber.on(this.dataSourceTopicMap[topic]).handle(val => {
      this.publisher.pub(topic, val, false, true);
    }, paused));
  }

  /** @inheritdoc */
  protected onStateChanged(previousState: AvionicsSystemState | undefined, currentState: AvionicsSystemState): void {
    if (currentState === AvionicsSystemState.On) {
      for (const sub of this.dataSubs) {
        sub.resume(true);
      }

      this.publisher.pub(this.attitudeDataValidTopic, true, false, true);
    } else {
      for (const sub of this.dataSubs) {
        sub.pause();
      }

      this.publisher.pub(this.attitudeDataValidTopic, false, false, true);
    }
  }
}

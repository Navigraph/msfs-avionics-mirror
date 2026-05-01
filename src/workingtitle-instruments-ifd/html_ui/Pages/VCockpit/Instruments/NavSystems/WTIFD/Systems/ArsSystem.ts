import {
  AhrsEvents, AircraftInertialEvents, AvionicsSystemState, AvionicsSystemStateEvent, BaseAhrsEvents, BasicAvionicsSystem, EventBus, EventBusMetaEvents,
  Subscribable, Subscription, SystemPowerKey
} from '@microsoft/msfs-sdk';

/** Topics sourced from the SDK AHRS. */
type ArsAhrsDataSourceTopics = 'actual_pitch_deg' | 'actual_roll_deg' | 'turn_coordinator_ball';

/**
 * Data events sourced from the SDK AHRS.
 */
type ArsAhrsDataEvents = {
  [P in keyof Pick<BaseAhrsEvents, ArsAhrsDataSourceTopics> as `ars_${P}`]: BaseAhrsEvents[P];
};

/** Topics sourced from the SDK AircraftPublisher. */
type ArsAircraftInertialDataSourceTopics = 'acceleration_body_x' | 'acceleration_body_y' | 'acceleration_body_z' | 'rotation_velocity_body_x' | 'rotation_velocity_body_y' | 'rotation_velocity_body_z';

/**
 * Data events sourced from the SDK AHRS.
 */
type ArsAircraftInertialDataEvents = {
  [P in keyof Pick<AircraftInertialEvents, ArsAircraftInertialDataSourceTopics> as `ars_${P}`]: AircraftInertialEvents[P];
};

/** Data source events. */
type ArsSourceEvents = AhrsEvents & AircraftInertialEvents;

/** Data events published by the ARS. */
type ArsDataEvents = ArsAhrsDataEvents & ArsAircraftInertialDataEvents;

/** ARS system events. */
export interface ArsSystemEvents extends ArsDataEvents {
  /** The ARS system state. */
  'ars_state': AvionicsSystemStateEvent;
  /** Accelerometer data is valid. */
  'ars_attitude_data_valid': boolean;
}

/** An Air Data Attitude Heading Reference System representing one channel of a dual-channel KSG 7200. */
export class ArsSystem extends BasicAvionicsSystem<ArsSystemEvents> {
  protected initializationTime = 15000;

  private readonly attitudeDataValidTopic = 'ars_attitude_data_valid' as const;

  private readonly dataSourceTopicMap: Record<keyof ArsDataEvents, keyof ArsSourceEvents> = {
    'ars_actual_pitch_deg': 'actual_pitch_deg',
    'ars_actual_roll_deg': 'actual_roll_deg',
    'ars_turn_coordinator_ball': 'turn_coordinator_ball',

    'ars_acceleration_body_x': 'acceleration_body_x',
    'ars_acceleration_body_y': 'acceleration_body_y',
    'ars_acceleration_body_z': 'acceleration_body_z',
    'ars_rotation_velocity_body_x': 'rotation_velocity_body_x',
    'ars_rotation_velocity_body_y': 'rotation_velocity_body_y',
    'ars_rotation_velocity_body_z': 'rotation_velocity_body_z',
  } as const;

  private readonly dataSourceSubscriber = this.bus.getSubscriber<ArsSourceEvents>();

  private readonly dataSubs: Subscription[] = [];

  /**
   * Ctor.
   * @param bus The instrument event bus.
   * @param powerSource The power source for this ARS.
   */
  constructor(
    protected readonly bus: EventBus,
    powerSource?: SystemPowerKey | CompositeLogicXMLElement | Subscribable<boolean>,
  ) {
    super(1, bus, 'ars_state');

    this.publisher.pub(this.attitudeDataValidTopic, true, false, true);

    if (powerSource) {
      this.connectToPower(powerSource);
    }

    this.startDataPublish();
  }

  /**
   * Starts publishing ADC data on the event bus.
   */
  private startDataPublish(): void {
    for (const topic of Object.keys(this.dataSourceTopicMap)) {
      if (this.bus.getTopicSubscriberCount(topic) > 0) {
        this.onTopicSubscribed(topic as keyof ArsDataEvents);
      }
    }

    this.bus.getSubscriber<EventBusMetaEvents>().on('event_bus_topic_first_sub').handle(topic => {
      if (topic in this.dataSourceTopicMap) {
        this.onTopicSubscribed(topic as keyof ArsDataEvents);
      }
    });
  }

  /**
   * Responds to when someone first subscribes to one of this system's data topics on the event bus.
   * @param topic The topic that was subscribed to.
   */
  private onTopicSubscribed(topic: keyof ArsDataEvents): void {
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

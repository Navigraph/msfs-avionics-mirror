import {
  AdcEvents, AvionicsSystemState, AvionicsSystemStateEvent, BasicAvionicsSystem, ClockEvents, ConsumerSubject, EventBus, EventBusMetaEvents, GNSSEvents,
  LatLongInterface, Subject, Subscribable, Subscription, UnitType
} from '@microsoft/msfs-sdk';

import { ArsSystemEvents } from './ArsSystem';
import { GnssNavigationState, GnssReceiverEvents } from './Gnss/GnssTypes';

/**
 * FMS positioning system data modes.
 */
export enum FmsPositionMode {
  /** No position data is available. */
  None = 'None',

  /** Position data is sourced from GPS. */
  Gps = 'Gps',

  GpsSbas = 'GpsSbas',

  /** Position data is sourced from dead reckoning. */
  DeadReckoning = 'DeadReckoning',

  /** Position data is sourced from dead reckoning and more than 20 minutes have elapsed since the last accurate position fix. */
  DeadReckoningExpired = 'DeadReckoningExpired'
}

/**
 * Data events published by the GPS receiver system sourced from GNSS.
 */
type FmsPositionGnssReceiverDataEvents = {
  [fms_pos_ground_speed_: `fms_pos_ground_speed_${number}`]: GnssReceiverEvents['gnss_ground_speed_kts'],
  [fms_pos_ground_speed_: `fms_pos_track_deg_true_${number}`]: GnssReceiverEvents['gnss_track_true_deg'],
};

/**
 * Topics for bus events from which raw sim geo-positioning data is sourced.
 * @todo support for configurable heading source
 */
type FmsPositionGnssDataSourceTopics = 'track_deg_magnetic';

/**
 * Data events published by the GPS receiver system sourced from GNSS.
 */
type FmsPositionRawGnssDataEvents = {
  [P in Extract<FmsPositionGnssDataSourceTopics, keyof GNSSEvents> as `fms_pos_${P}_${number}`]: GNSSEvents[P];
};

/**
 * Topics for bus events from which FMS geo-positioning data is sourced.
 */
type FmsPositionAdcDataSourceTopics = 'ambient_wind_velocity' | 'ambient_wind_direction';

/**
 * Data events published by the GPS receiver system sourced from GNSS.
 */
type FmsPositionAdcDataEvents = {
  [P in Extract<FmsPositionAdcDataSourceTopics, keyof AdcEvents> as `fms_pos_${P}_${number}`]: AdcEvents[P];
};

/**
 * Events fired by the FMS geo-positioning system.
 */
export interface FmsPositionSystemEvents extends FmsPositionGnssReceiverDataEvents, FmsPositionRawGnssDataEvents, FmsPositionAdcDataEvents {
  /** An event fired when the FMS geo-positioning system state changes. */
  [fms_pos_state_: `fms_pos_state_${number}`]: AvionicsSystemStateEvent;

  /** The current positioning mode used by the FMS geo-positioning system. */
  [fms_pos_mode_: `fms_pos_mode_${number}`]: FmsPositionMode;

  /** The current position, or NaN/NaN when no position is available (dead-reckoning expired, or none to start with). */
  [fms_pos_position_: `fms_pos_position_${number}`]: LatLongInterface;
}

/*
 * Polar Operation
 * When magnetic field is less than 60 mGauss, the magnetometers stop supplying magnetic heading to the ADAHRS.
 * The ADAHRS then switch to GPS track (and PFDs to TRK UP MODE on the HSI). GPS track is available when travveling > 9 knots GS.
 * If the FMS database magnetic varition is available, magnetic track is used, otherwise true track.
 * The field needs to rise above 75 mGauss to switch back to magnetic heading from the magnetometers.
 * FMS mag database coverage is 82° north, with the exception of 73.125° between 80° and 130° west,
 * and 82° south, with the exception of 55° south between 120° and 160° east.
 */

/**
 * An FMS geo-positioning system.
 * The FMS uses primarily GPS position, and if unavailable falls back to dead reckoning from the last known GPS position based on ADAHRS
 */
export class FmsPositionSystem extends BasicAvionicsSystem<FmsPositionSystemEvents> {
  private static readonly DEAD_RECKONING_EXPIRE_TIME = UnitType.MINUTE.convertTo(5, UnitType.MILLISECOND);
  private static readonly INVALID_LAT_LONG_POS: LatLongInterface = { lat: NaN, long: NaN };

  protected initializationTime = 0;

  private readonly gnssReceiverDataSourceTopicMap: Record<keyof FmsPositionSystemEvents, keyof GnssReceiverEvents> = {
    [`fms_pos_ground_speed_${this.index}`]: 'gnss_ground_speed_kts',
    [`fms_pos_track_deg_true_${this.index}`]: 'gnss_track_true_deg',
  } as const;

  private readonly rawGnssDataSourceTopicMap: Record<keyof FmsPositionSystemEvents, keyof GNSSEvents> = {
    [`fms_pos_track_deg_magnetic_${this.index}`]: 'track_deg_magnetic'
  } as const;

  private readonly adcDataSourceTopicMap = {
    [`fms_pos_ambient_wind_velocity_${this.index}`]: 'ambient_wind_velocity',
    [`fms_pos_ambient_wind_direction_${this.index}`]: 'ambient_wind_direction',
  } as const;

  private readonly modeTopic = `fms_pos_mode_${this.index}` as const;
  private readonly posTopic = `fms_pos_position_${this.index}` as const;

  private readonly dataSourceSubscriber = this.bus.getSubscriber<ArsSystemEvents & AdcEvents & GNSSEvents & GnssReceiverEvents>();

  private readonly dataSubs: Subscription[] = [];

  private readonly simTime = ConsumerSubject.create(this.bus.getSubscriber<ClockEvents>().on('simTime'), 0);

  private readonly gpsState = ConsumerSubject.create<GnssNavigationState | null>(null, null);

  private readonly rawGnssPos = ConsumerSubject.create(null, FmsPositionSystem.INVALID_LAT_LONG_POS, FmsPositionSystem.latLongEquality);
  private readonly gnssReceiverPos = ConsumerSubject.create(null, FmsPositionSystem.INVALID_LAT_LONG_POS, FmsPositionSystem.latLongEquality);
  private readonly fmsPos = Subject.create<LatLongInterface>(FmsPositionSystem.INVALID_LAT_LONG_POS, FmsPositionSystem.latLongEquality);
  private readonly gnssReceiverToFmsPosPipe = this.gnssReceiverPos.pipe(this.fmsPos, true);
  private readonly rawGnssPosToFmsPosPipe = this.rawGnssPos.pipe(this.fmsPos, true);

  private readonly mode = Subject.create(FmsPositionMode.None);
  public readonly selectedFmsPosMode: Subscribable<FmsPositionMode> = this.mode;

  private lastFixTime: number | undefined = undefined;

  /**
   * Creates an instance of an FMS geo-positioning system.
   * @param index The index of the FMS geo-positioning system.
   * @param bus An instance of the event bus.
   * @param powerSource Whether the system is powered.
   */
  constructor(
    index: number,
    bus: EventBus,
    powerSource: Subscribable<boolean>,
  ) {
    super(index, bus, `fms_pos_state_${index}` as const);

    this.mode.sub((v) => this.publisher.pub(this.modeTopic, v, false, true), true);

    this.connectToPower(powerSource);

    this.startDataPublish();
  }

  /**
   * Starts publishing data on the event bus.
   */
  private startDataPublish(): void {
    for (const topic of Object.keys(this.gnssReceiverDataSourceTopicMap)) {
      if (this.bus.getTopicSubscriberCount(topic) > 0) {
        this.onGnssReceiverTopicSubscribed(topic as keyof FmsPositionGnssReceiverDataEvents);
      }
    }

    for (const topic of Object.keys(this.rawGnssDataSourceTopicMap)) {
      if (this.bus.getTopicSubscriberCount(topic) > 0) {
        this.onGnssTopicSubscribed(topic as keyof FmsPositionRawGnssDataEvents);
      }
    }

    for (const topic of Object.keys(this.adcDataSourceTopicMap)) {
      if (this.bus.getTopicSubscriberCount(topic) > 0) {
        this.onAdcTopicSubscribed(topic as keyof FmsPositionAdcDataEvents);
      }
    }

    if (this.bus.getTopicSubscriberCount(this.posTopic) > 0) {
      this.onPosTopicSubscribed();
    }

    this.bus.getSubscriber<EventBusMetaEvents>().on('event_bus_topic_first_sub').handle(topic => {
      if (topic in this.gnssReceiverDataSourceTopicMap) {
        this.onGnssReceiverTopicSubscribed(topic as keyof FmsPositionGnssReceiverDataEvents);
      }

      if (topic in this.rawGnssDataSourceTopicMap) {
        this.onGnssTopicSubscribed(topic as keyof FmsPositionRawGnssDataEvents);
      }

      if (topic in this.adcDataSourceTopicMap) {
        this.onAdcTopicSubscribed(topic as keyof FmsPositionAdcDataEvents);
      }

      if (topic === this.posTopic) {
        this.onPosTopicSubscribed();
      }
    });

    this.gpsState.setConsumer(this.dataSourceSubscriber.on('gnss_navigation_state'));
    this.gnssReceiverPos.setConsumer(this.dataSourceSubscriber.on('gnss_position'));
    this.rawGnssPos.setConsumer(this.dataSourceSubscriber.on('gps-position'));

    const paused = this.state === AvionicsSystemState.Failed || this.state === AvionicsSystemState.Off;
    if (!paused) {
      this.gpsState.resume();
    }
  }

  /**
   * Responds to when someone first subscribes to one of this system's GNSS receiver sourced data topics on the event bus.
   * @param topic The topic that was subscribed to.
   */
  private onGnssReceiverTopicSubscribed(topic: keyof FmsPositionGnssReceiverDataEvents): void {
    const paused = this.state === AvionicsSystemState.Failed || this.state === AvionicsSystemState.Off;

    this.dataSubs.push(this.dataSourceSubscriber.on(this.gnssReceiverDataSourceTopicMap[topic]).handle(val => {
      this.publisher.pub(topic, val as any, false, true);
    }, paused));
  }

  /**
   * Responds to when someone first subscribes to one of this system's raw GNSS-sourced data topics on the event bus.
   * @param topic The topic that was subscribed to.
   */
  private onGnssTopicSubscribed(topic: keyof FmsPositionRawGnssDataEvents): void {
    const paused = this.state === AvionicsSystemState.Failed || this.state === AvionicsSystemState.Off;

    this.dataSubs.push(this.dataSourceSubscriber.on(this.rawGnssDataSourceTopicMap[topic]).handle(val => {
      this.publisher.pub(topic, val as any, false, true);
    }, paused));
  }

  /**
   * Responds to when someone first subscribes to one of this system's Adc-sourced data topics on the event bus.
   * @param topic The topic that was subscribed to.
   */
  private onAdcTopicSubscribed(topic: keyof FmsPositionAdcDataEvents): void {
    const paused = this.state === AvionicsSystemState.Failed || this.state === AvionicsSystemState.Off;

    this.dataSubs.push(this.dataSourceSubscriber.on(this.adcDataSourceTopicMap[topic]).handle(val => {
      this.publisher.pub(topic, val as any, false, true);
    }, paused));
  }

  /**
   * Responds to when someone first subscribes to one of this system's position data topic on the event bus.
   */
  private onPosTopicSubscribed(): void {
    const paused = this.state === AvionicsSystemState.Failed || this.state === AvionicsSystemState.Off;

    this.dataSubs.push(this.rawGnssPos, this.gnssReceiverPos, this.fmsPos.sub((v) => this.publisher.pub(this.posTopic, v as any, false, true), true, paused));
  }

  /** @inheritdoc */
  protected onStateChanged(previousState: AvionicsSystemState | undefined, currentState: AvionicsSystemState): void {
    if (currentState === AvionicsSystemState.Failed || currentState === AvionicsSystemState.Off) {
      for (const sub of this.dataSubs) {
        sub.pause();
      }

      this.mode.set(FmsPositionMode.None);
      this.lastFixTime = undefined;

      this.rawGnssPosToFmsPosPipe.pause();
      this.gnssReceiverToFmsPosPipe.pause();
      this.fmsPos.set(FmsPositionSystem.INVALID_LAT_LONG_POS);
    } else {
      for (const sub of this.dataSubs) {
        sub.resume(true);
      }
    }
  }

  /** @inheritdoc */
  public onUpdate(): void {
    super.onUpdate();

    if (this._state === AvionicsSystemState.On || this._state === undefined) {
      this.updateMode();
    }
  }

  /**
   * Updates this system's data mode.
   */
  private updateMode(): void {
    const gpsState = this.gpsState.get();

    if (gpsState === GnssNavigationState.BasicNav || gpsState === GnssNavigationState.FdeNav) {
      this.rawGnssPosToFmsPosPipe.pause();
      this.gnssReceiverToFmsPosPipe.resume(true);
      this.mode.set(FmsPositionMode.Gps);
      this.lastFixTime = this.simTime.get();
    } else if (gpsState === GnssNavigationState.SbasNav) {
      this.rawGnssPosToFmsPosPipe.pause();
      this.gnssReceiverToFmsPosPipe.resume(true);
      this.mode.set(FmsPositionMode.GpsSbas);
      this.lastFixTime = this.simTime.get();
    } else if (this.lastFixTime !== undefined) {
      this.gnssReceiverToFmsPosPipe.pause();
      if (this.simTime.get() - this.lastFixTime > FmsPositionSystem.DEAD_RECKONING_EXPIRE_TIME) {
        this.rawGnssPosToFmsPosPipe.pause();
        this.fmsPos.set(FmsPositionSystem.INVALID_LAT_LONG_POS);
        this.mode.set(FmsPositionMode.DeadReckoningExpired);
      } else {
        this.rawGnssPosToFmsPosPipe.resume(true);
        this.mode.set(FmsPositionMode.DeadReckoning);
      }
    } else {
      this.mode.set(FmsPositionMode.None);
    }
  }

  /**
   * Compares two {@link LatLongInterface} for equality.
   * @param a The first object to compare.
   * @param b The second object to compare.
   * @returns true if equal.
   */
  private static latLongEquality(a: LatLongInterface, b: LatLongInterface): boolean {
    return (a.lat === b.lat || (Number.isNaN(a.lat) && Number.isNaN(b.lat))) && (a.long === b.long || (Number.isNaN(a.long) && Number.isNaN(b.long)));
  }
}

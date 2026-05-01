import {
  AdcEvents, AvionicsSystemState, AvionicsSystemStateEvent, BaseAdcEvents, BasicAvionicsSystem, EventBus, EventBusMetaEvents, Subscribable, Subscription,
  SystemPowerKey
} from '@microsoft/msfs-sdk';

/**
 * Topics for bus events from which ADC data is sourced.
 */
type AdcDataSourceTopics = 'ias' | 'tas' | 'mach_number' | 'mach_to_kias_factor'
  | 'indicated_alt' | 'pressure_alt' | 'vertical_speed'
  | 'altimeter_baro_setting_inhg' | 'altimeter_baro_preselect_inhg' | 'altimeter_baro_preselect_mb' | 'altimeter_baro_preselect_raw' | 'altimeter_baro_is_std'
  | 'ambient_density' | 'ambient_temp_c' | 'ambient_pressure_inhg' | 'isa_temp_c' | 'ram_air_temp_c';

/**
 * Data events published by the ADC system.
 */
type AdcDataEvents = {
  [P in keyof Pick<BaseAdcEvents, AdcDataSourceTopics> as `ext_adc_${P}`]: BaseAdcEvents[P];
};

/**
 * Events fired by the ADC system.
 */
export interface ExternalAdcSystemEvents extends AdcDataEvents {
  /** An event fired when the ADC system state changes. */
  ext_adc_state: AvionicsSystemStateEvent;

  /** An event fired when the airspeed data state of an ADC system changes. */
  ext_adc_speed_data_valid: boolean;

  /** An event fired when the altitude data state of an ADC system changes. */
  ext_adc_altitude_data_valid: boolean;
}

/**
 * An external ADC system.
 */
export class ExternalAdcSystem extends BasicAvionicsSystem<ExternalAdcSystemEvents> {
  protected initializationTime = 10_000;

  private readonly speedDataValidTopic = 'ext_adc_speed_data_valid' as const;
  private readonly altitudeDataValidTopic = 'ext_adc_altitude_data_valid' as const;

  private readonly speedDataSourceTopicMap = this.airspeedIndicatorIndex !== undefined ? new Map<keyof AdcDataEvents, keyof AdcEvents>([
    ['ext_adc_ias', `ias_${this.airspeedIndicatorIndex}`],
    ['ext_adc_tas', `tas_${this.airspeedIndicatorIndex}`],
    ['ext_adc_mach_to_kias_factor', `mach_to_kias_factor_${this.airspeedIndicatorIndex}`],
    ['ext_adc_mach_number', 'mach_number'],
  ]) : new Map();

  private readonly altitudeDataSourceTopicMap = this.altimeterIndex !== undefined ? new Map<keyof AdcDataEvents, keyof AdcEvents>([
    ['ext_adc_indicated_alt', `indicated_alt_${this.altimeterIndex}`],
    ['ext_adc_altimeter_baro_setting_inhg', `altimeter_baro_setting_inhg_${this.altimeterIndex}`],
    ['ext_adc_altimeter_baro_preselect_inhg', `altimeter_baro_preselect_inhg_${this.altimeterIndex}`],
    ['ext_adc_altimeter_baro_preselect_mb', `altimeter_baro_preselect_mb_${this.altimeterIndex}`],
    ['ext_adc_altimeter_baro_preselect_raw', `altimeter_baro_preselect_raw_${this.altimeterIndex}`],
    ['ext_adc_altimeter_baro_is_std', `altimeter_baro_is_std_${this.altimeterIndex}`],
    ['ext_adc_pressure_alt', 'pressure_alt'],
    ['ext_adc_vertical_speed', 'vertical_speed'],
    ['ext_adc_ambient_density', 'ambient_density'],
    ['ext_adc_ambient_temp_c', 'ambient_temp_c'],
    ['ext_adc_ambient_pressure_inhg', 'ambient_pressure_inhg'],
    ['ext_adc_isa_temp_c', 'isa_temp_c'],
    ['ext_adc_ram_air_temp_c', 'ram_air_temp_c'],
  ]) : new Map();

  private readonly dataSourceSubscriber = this.bus.getSubscriber<AdcEvents>();

  private readonly dataSubs: Subscription[] = [];

  /**
   * Creates an instance of an ADC system.
   * @param bus An instance of the event bus.
   * @param airspeedIndicatorIndex The index of the sim airspeed indicator from which this ADC derives its data.
   * @param altimeterIndex The index of the sim altimeter from which this ADC derives its data.
   * @param powerSource The {@link ElectricalEvents} topic or electricity logic element to which to connect the
   * system's power.
   */
  constructor(
    bus: EventBus,
    private readonly airspeedIndicatorIndex?: number,
    private readonly altimeterIndex?: number,
    powerSource?: SystemPowerKey | CompositeLogicXMLElement | Subscribable<boolean>,
  ) {
    super(1, bus, 'ext_adc_state' as const);

    if (airspeedIndicatorIndex !== undefined) {
      this.publisher.pub(this.speedDataValidTopic, true, false, true);
    }
    if (altimeterIndex !== undefined) {
      this.publisher.pub(this.altitudeDataValidTopic, true, false, true);
    }

    if (powerSource !== undefined) {
      this.connectToPower(powerSource);
    }

    this.startDataPublish();
  }

  /**
   * Starts publishing ADC data on the event bus.
   */
  private startDataPublish(): void {
    for (const topic of this.altitudeDataSourceTopicMap.keys()) {
      if (this.bus.getTopicSubscriberCount(topic) > 0) {
        this.onTopicSubscribed(topic as keyof AdcDataEvents, this.altitudeDataSourceTopicMap.get(topic));
      }
    }

    for (const topic of this.speedDataSourceTopicMap.keys()) {
      if (this.bus.getTopicSubscriberCount(topic) > 0) {
        this.onTopicSubscribed(topic as keyof AdcDataEvents, this.speedDataSourceTopicMap.get(topic));
      }
    }

    this.bus.getSubscriber<EventBusMetaEvents>().on('event_bus_topic_first_sub').handle(topic => {
      const dataSourceTopic = this.altitudeDataSourceTopicMap.get(topic) ?? this.speedDataSourceTopicMap.get(topic);
      if (dataSourceTopic) {
        this.onTopicSubscribed(topic as keyof AdcDataEvents, dataSourceTopic);
      }
    });
  }

  /**
   * Responds to when someone first subscribes to one of this system's data topics on the event bus.
   * @param topic The topic that was subscribed to.
   * @param dataSourceTopic The data source topic to subscribe.
   */
  private onTopicSubscribed(topic: keyof AdcDataEvents, dataSourceTopic: keyof AdcEvents): void {
    const paused = this.state !== undefined && this.state !== AvionicsSystemState.On;

    this.dataSubs.push(this.dataSourceSubscriber.on(dataSourceTopic).handle(val => {
      this.publisher.pub(topic, val, false, true);
    }, paused));
  }

  /** @inheritdoc */
  protected onStateChanged(previousState: AvionicsSystemState | undefined, currentState: AvionicsSystemState): void {
    if (currentState === AvionicsSystemState.On) {
      for (const sub of this.dataSubs) {
        sub.resume(true);
      }

      this.publisher.pub(this.speedDataValidTopic, true, false, true);
      this.publisher.pub(this.altitudeDataValidTopic, true, false, true);
    } else {
      for (const sub of this.dataSubs) {
        sub.pause();
      }

      this.publisher.pub(this.speedDataValidTopic, false, false, true);
      this.publisher.pub(this.altitudeDataValidTopic, false, false, true);
    }
  }
}

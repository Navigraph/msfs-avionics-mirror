import {
  ConsumerValue, EventBus, GNSSEvents, Instrument, MappedSubject, SoundServerController, Subscribable, SubscribableMapFunctions
} from '@microsoft/msfs-sdk';

import { IfdAudioOptions } from '../../IfdOptions';
import { AlertUserSettings } from '../../Settings/AlertUserSettings';
import { GnssReceiverEvents } from '../Gnss/GnssTypes';

/** The altitude callout alerts. */
export class AltitudeAlerts implements Instrument {
  private readonly gnssSub = this.bus.getSubscriber<GNSSEvents & GnssReceiverEvents>();

  private readonly gnssAltitudeFeet = ConsumerValue.create(this.gnssSub.on('gnss_altitude_ft'), null);
  private readonly groundAltitudeFeet = ConsumerValue.create(this.gnssSub.on('ground_altitude'), 0);

  private readonly isEnabled = MappedSubject.create(
    SubscribableMapFunctions.and(),
    AlertUserSettings.getManager(this.bus).getSetting('altitudeCallouts'),
    this.isPowered,
  );

  private isInit = false;

  /**
   * Altitude alerts in priority order from highest to lowest priority.
   * Alerts of lower priority will be inhibted for a cycle when a higher priority
   * alert is active.
   */
  private readonly alerts: AltitudeAlert[] = [];

  /**
   * Ctor.
   * @param bus The event bus to use.
   * @param soundController The sound server controller to use.
   * @param isPowered Whether the instrument is powered.
   * @param options The audio configuration options.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly soundController: SoundServerController,
    private readonly isPowered: Subscribable<boolean>,
    options: IfdAudioOptions,
  ) {
    if (options.altitude100Event) {
      this.alerts.push(new AltitudeAlert(options.altitude100Event, 100));
    }
    if (options.altitude200Event) {
      this.alerts.push(new AltitudeAlert(options.altitude200Event, 200));
    }
    if (options.altitude300Event) {
      this.alerts.push(new AltitudeAlert(options.altitude300Event, 300));
    }
    if (options.altitude400Event) {
      this.alerts.push(new AltitudeAlert(options.altitude400Event, 400));
    }
    if (options.altitude500Event) {
      this.alerts.push(new AltitudeAlert(options.altitude500Event, 500));
    }
    if (options.altitude1000Event) {
      this.alerts.push(new AltitudeAlert(options.altitude1000Event, 1000));
    }
  }

  /** @inheritdoc */
  public init(): void {
    this.isInit = true;
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isInit || !this.isEnabled.get()) {
      return;
    }

    const gnssAltitudeFeet = this.gnssAltitudeFeet.get();
    const groundAltitudeFeet = this.groundAltitudeFeet.get();
    const aglAltitude = gnssAltitudeFeet === null || groundAltitudeFeet === null ? null : gnssAltitudeFeet - groundAltitudeFeet;

    let inhibitAlerts = false;
    for (let i = 0; i < this.alerts.length; i++) {
      if (inhibitAlerts) {
        this.alerts[i].reset();
      } else {
        const active = this.alerts[i].computeActive(aglAltitude);

        if (active) {
          this.soundController.playSound(this.alerts[i].wwiseEvent);
        }

        inhibitAlerts ||= active;
      }
    }
  }
}

/** A single altitude alert. */
export class AltitudeAlert {
  private static readonly HYSTERESIS = 50;
  private static readonly ANTICIPATION = 10;

  private isArmed = false;

  /**
   * Ctor.
   * @param wwiseEvent The name of the WWise event to trigger for this alert.
   * @param value The nominal altitude value this alert triggers at in feet.
   */
  constructor(public readonly wwiseEvent: string, private readonly value: number) { }


  /** @inheritdoc */
  public computeActive(aglAltitude: number | null): boolean {
    if (aglAltitude === null) {
      return false;
    }

    if (this.isArmed) {
      if (aglAltitude < this.value + AltitudeAlert.ANTICIPATION) {
        this.isArmed = false;
        return true;
      }
    } else {
      this.isArmed = aglAltitude > this.value + AltitudeAlert.HYSTERESIS;
    }

    return false;
  }

  /** Resets the state of this alert. */
  public reset(): void {
    this.isArmed = false;
  }
}

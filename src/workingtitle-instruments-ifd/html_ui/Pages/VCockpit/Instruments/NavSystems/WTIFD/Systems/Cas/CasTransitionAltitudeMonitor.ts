import { AdcEvents, DebounceTimer, EventBus, Instrument, Subject, Subscription } from '@microsoft/msfs-sdk';

import { AlertUserSettings } from '../../Settings/AlertUserSettings';
import { FmsUserSettings } from '../../Settings/FmsUserSettings';
import { GnssReceiverEvents } from '../Gnss/GnssTypes';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** CAS transition altitude alert monitor. */
export class CasTransitionAltitudeMonitor implements Instrument {
  private static readonly ALERT_DEADBAND = 250;
  private static readonly ARM_DEADBAND = 500;
  private static readonly RESET_TIME = 5000;

  private altitude: number | null = null;
  private readonly altitudeSub: Subscription;

  private transAltArmed = false;
  private transLevelArmed = false;

  private readonly transAltActive = Subject.create(false);
  private readonly transLevelActive = Subject.create(false);

  private readonly transAltResetTimer = new DebounceTimer();
  private readonly transLevelResetTimer = new DebounceTimer();

  private readonly transitionAltTransporter = casTransporterFactory(this.bus, CasUuid.TransAltXXX);
  private readonly transitionLevelTransporter = casTransporterFactory(this.bus, CasUuid.TransLevelXXX);

  private readonly fmsSettingManager = FmsUserSettings.getManager(this.bus);
  private readonly transAlt = this.fmsSettingManager.getSetting('transitionAltitude');
  private readonly transLevel = this.fmsSettingManager.getSetting('transitionLevel');

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param altimeterIndex Index of the altimeter to use. A value less than 1 will use GNSS altitude instead.
   */
  constructor(private readonly bus: EventBus, private readonly altimeterIndex: number | undefined) {
    const sub = this.bus.getSubscriber<AdcEvents & GnssReceiverEvents>();

    if (this.altimeterIndex !== undefined) {
      this.altitudeSub = sub.on(`indicated_alt_${this.altimeterIndex}`).handle((v) => this.altitude = v, true);
    } else {
      this.altitudeSub = sub.on('gnss_altitude_ft').handle((v) => this.altitude = v, true);
    }
  }

  /** @inheritdoc */
  public init(): void {
    this.transitionAltTransporter.bind(this.transAltActive);
    this.transitionLevelTransporter.bind(this.transLevelActive);

    AlertUserSettings.getManager(this.bus).getSetting('transitionAltitudeLevelAlerts').sub((v) => {
      if (v) {
        this.altitudeSub.resume(true);
      } else {
        this.altitudeSub.pause();
        this.resetState();
      }
    }, true);
  }

  private readonly resetTransAlt = (): void => this.transAltActive.set(false);
  private readonly resetTransLevel = (): void => this.transLevelActive.set(false);

  /** @inheritdoc */
  public onUpdate(): void {
    const alertsEnabled = !this.altitudeSub.isPaused;
    if (!alertsEnabled) {
      return;
    }

    if (this.altitude === null) {
      return;
    }

    const transAlt = this.transAlt.get();
    const transLevel = this.transLevel.get();

    if (this.altitude < (transAlt - CasTransitionAltitudeMonitor.ARM_DEADBAND)) {
      this.transAltArmed = true;
    } else if (this.transAltArmed && this.altitude >= (transAlt - CasTransitionAltitudeMonitor.ALERT_DEADBAND)) {
      this.transAltArmed = false;
      this.transAltActive.set(true);
      this.transAltResetTimer.schedule(this.resetTransAlt, CasTransitionAltitudeMonitor.RESET_TIME);
    }

    if (this.altitude > (transLevel + CasTransitionAltitudeMonitor.ARM_DEADBAND)) {
      this.transLevelArmed = true;
    } else if (this.transLevelArmed && this.altitude <= (transLevel + CasTransitionAltitudeMonitor.ALERT_DEADBAND)) {
      this.transLevelArmed = false;
      this.transLevelActive.set(true);
      this.transLevelResetTimer.schedule(this.resetTransLevel, CasTransitionAltitudeMonitor.RESET_TIME);
    }
  }

  /** Resets the alert state. */
  private resetState(): void {
    this.transAltArmed = false;
    this.transLevelArmed = false;
    this.transAltActive.set(false);
    this.transLevelActive.set(false);
  }
}

import {
  ClockEvents, ConsumerValue, EventBus, Instrument, MappedSubject, SoundServerController, Subject, Subscribable, SubscribableMapFunctions
} from '@microsoft/msfs-sdk';

import { IfdAudioOptions } from '../../IfdOptions';
import { AlertUserSettings } from '../../Settings/AlertUserSettings';
import { IfdCasActiveMessage } from '../Cas/CasMessages';
import { CasUuid } from '../Cas/CasUuid';
import { IfdCasAlertManager } from '../Cas/IfdCasAlertManager';

/** The airspace ahead alert. */
export class AirspaceAlert implements Instrument {
  private static readonly SOUND_PERIOD = 5_000;

  private readonly isEnabled = MappedSubject.create(
    SubscribableMapFunctions.and(),
    AlertUserSettings.getManager(this.bus).getSetting('airspaceAural'),
    this.isPowered,
  );

  private readonly airspaceAlertUnAcked = Subject.create(false);

  private readonly realTime = ConsumerValue.create(null, 0);

  private isInit = false;

  private lastPlayed = 0;

  /**
   * Ctor.
   * @param bus The event bus to use.
   * @param soundController The sound server controller to use.
   * @param isPowered Whether the instrument is powered.
   * @param options The audio configuration options.
   * @param cas The CAS alert manager.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly soundController: SoundServerController,
    private readonly isPowered: Subscribable<boolean>,
    private readonly options: Readonly<IfdAudioOptions>,
    private readonly cas: IfdCasAlertManager,
  ) { }

  /** @inheritdoc */
  public init(): void {
    if (this.options.airspaceAheadEvent) {
      this.realTime.setConsumer(this.bus.getSubscriber<ClockEvents>().on('realTime'));

      this.cas.getActiveAlertSubject().sub(this.onCasAlertsChanged.bind(this), true);

      this.airspaceAlertUnAcked.sub((v) => {
        if (v && this.isEnabled.get()) {
          this.playSound();
        }
      });

      this.isInit = true;
    }
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isInit || !this.isEnabled.get() || !this.airspaceAlertUnAcked.get()) {
      return;
    }

    if (this.realTime.get() - AirspaceAlert.SOUND_PERIOD >= this.lastPlayed) {
      this.playSound();
    }
  }

  /** Plays the airspace ahead aural. */
  private playSound(): void {
    this.soundController.playSound(this.options.airspaceAheadEvent!);
    this.lastPlayed = this.realTime.get();
  }

  /**
   * Handles changes to active CAS alerts.
   * @param index Changed index.
   * @param type Change type.
   * @param item Changed item(s).
   * @param alerts The alerts array.
   */
  private onCasAlertsChanged(index: unknown, type: unknown, item: unknown, alerts: readonly IfdCasActiveMessage[]): void {
    this.airspaceAlertUnAcked.set(alerts.some((a) => a.uuid === CasUuid.AirspaceAhead && !a.acknowledged));
  }
}

import { ConsumerSubject, EventBus, Instrument, SubscribableMapFunctions } from '@microsoft/msfs-sdk';

import { IfdAirframeType, IfdOptions } from '../../IfdOptions';
import { GpwsEvents } from '../GPWS/GpwsEvents';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** CAS TAWS system alert monitor. */
export class CasTawsMonitor implements Instrument {
  private readonly fltaOff = casTransporterFactory(this.bus, CasUuid.FltaOff);
  private readonly fltaUnavailable = casTransporterFactory(this.bus, CasUuid.FltaUnavailable);
  private readonly fltaWarning = casTransporterFactory(this.bus, CasUuid.TerrainPullUp);
  private readonly fltaCaution = casTransporterFactory(this.bus, CasUuid.CautionTerrain);

  private readonly tawsFail = casTransporterFactory(this.bus, CasUuid.TawsFail);

  private readonly edrWarning = casTransporterFactory(this.bus, CasUuid.PullUp);
  private readonly edrCaution = casTransporterFactory(this.bus, CasUuid.SinkRate);

  private readonly ncrDontSink = casTransporterFactory(this.bus, CasUuid.DontSink);

  private readonly pdaTooLow = casTransporterFactory(this.bus, CasUuid.TooLowTerrain);

  // TODO implement as TAWS?
  // private readonly tooLowFaf = casTransporterFactory(this.bus, CasUuid.CheckAltitudeTooLow);

  private readonly sub = this.bus.getSubscriber<GpwsEvents>();

  private readonly tawsPosValid = ConsumerSubject.create(this.sub.on('gpws_is_pos_valid'), true);

  private readonly tawsFltaEnabled = ConsumerSubject.create(this.sub.on('gpws_terrain_enabled'), true);

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param ifdOptions The IFD configuration to use.
   */
  constructor(private readonly bus: EventBus, private readonly ifdOptions: IfdOptions) { }

  /** @inheritdoc */
  public init(): void {
    if (this.ifdOptions.enableFlta) {
      this.fltaOff.bind(this.tawsFltaEnabled, SubscribableMapFunctions.not());
      this.fltaUnavailable.bind(this.tawsPosValid, SubscribableMapFunctions.not());

      this.sub.on('gpws_terrain_caution').handle(this.fltaCaution.set.bind(this.fltaCaution));
      this.sub.on('gpws_terrain_warning').handle(this.fltaWarning.set.bind(this.fltaWarning));
    }

    if (this.ifdOptions.enableTaws && this.ifdOptions.airframeType !== IfdAirframeType.Helicopter) {
      this.tawsFail.bind(this.tawsPosValid, SubscribableMapFunctions.not());

      this.sub.on('gpws_excessive_descent_rate').handle(this.edrWarning.set.bind(this.edrWarning));
      this.sub.on('gpws_sink_rate').handle(this.edrCaution.set.bind(this.edrCaution));

      this.sub.on('gpws_dont_sink').handle(this.ncrDontSink.set.bind(this.ncrDontSink));

      this.sub.on('gpws_premature_descent').handle(this.pdaTooLow.set.bind(this.pdaTooLow));
    }
  }

  /** @inheritdoc */
  public onUpdate(): void { }
}

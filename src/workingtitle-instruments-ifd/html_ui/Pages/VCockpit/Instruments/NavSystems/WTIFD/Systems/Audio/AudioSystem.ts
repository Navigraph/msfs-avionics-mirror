import { ConsumerSubject, EventBus, FlightPlanner, Instrument, InstrumentBackplane, SoundServerController } from '@microsoft/msfs-sdk';

import { IfdOptions } from '../../IfdOptions';
import { IfdCasAlertManager } from '../Cas/IfdCasAlertManager';
import { AirspaceAlert } from './AirspaceAlert';
import { AltitudeAlerts } from './AltitudeAlert';
import { TawsAlert } from './TawsAlert';
import { TopOfDescentAlert } from './TopOfDescentAlert';
import { WaypointAlerts } from './WaypointAlerts';
import { IfdPowerEvents } from '../../Misc/IfdPowerMonitor';

/** The IFD audio system. */
export class AudioSystem implements Instrument {
  private readonly backplane = new InstrumentBackplane();

  private readonly isPowered = ConsumerSubject.create(null, true);

  /**
   * Constructs a new instance.
   * @param bus The event bus to use.
   * @param options The audio options.
   * @param flightPlanner The flight planner to use.
   * @param cas The CAS alert manager.
   */
  constructor(bus: EventBus, options: Readonly<IfdOptions>, flightPlanner: FlightPlanner, cas: IfdCasAlertManager) {
    const soundController = new SoundServerController(bus);

    this.isPowered.setConsumer(bus.getSubscriber<IfdPowerEvents>().on('ifd_powered'));

    this.isPowered.sub((v) => !v && soundController.killAll());

    this.backplane.addInstrument('Airspace', new AirspaceAlert(bus, soundController, this.isPowered, options.audio, cas));
    this.backplane.addInstrument('AltitudeAlerts', new AltitudeAlerts(bus, soundController, this.isPowered, options.audio));
    this.backplane.addInstrument('Taws', new TawsAlert(bus, soundController, this.isPowered, options));
    this.backplane.addInstrument('TopOfDescent', new TopOfDescentAlert(bus, soundController, this.isPowered, options.audio, options.vnavIndex));
    this.backplane.addInstrument('WaypointAlerts', new WaypointAlerts(bus, soundController, this.isPowered, options.audio, flightPlanner));
  }

  /** @inheritdoc */
  public init(): void {
    this.backplane.init();
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.backplane.onUpdate();
  }
}

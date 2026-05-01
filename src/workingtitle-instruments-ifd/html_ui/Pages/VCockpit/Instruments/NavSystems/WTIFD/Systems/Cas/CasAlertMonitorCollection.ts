import { EventBus, Instrument, InstrumentBackplane } from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../FlightPlan';
import { IfdOptions } from '../../IfdOptions';
import { IfdGlidePathComputer } from '../../Navigation/Vnav/IfdGlidePathComputer';
import { IfdVnavManager } from '../../Navigation/Vnav/IfdVnavManager';
import { TimerManager } from '../Timer/TimerManager';
import { CasAirspaceMonitor } from './CasAirspaceMonitor';
import { CasGpsMonitor } from './CasGpsMonitor';
import { CasNavigationMonitor } from './CasNavigationMonitor';
import { CasRadioMonitor } from './CasRadioMonitor';
import { CasFuelMonitor } from './CasFuelMonitor';
import { CasTawsMonitor } from './CasTawsMonitor';
import { CasTimerMonitor } from './CasTimerMonitor';
import { CasTransitionAltitudeMonitor } from './CasTransitionAltitudeMonitor';
import { CasVerticalNavigationMonitor } from './CasVerticalNavigationMonitor';

/** A collection of CAS alert monitors. */
export class CasAlertMonitorCollection implements Instrument {
  private readonly backplane = new InstrumentBackplane();

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param ifdOptions The IFD config options.
   * @param flightPlanStore The flight plan store to use.
   * @param vnavManager The VNAV manager to use.
   * @param gpComputer The glide path computer to use.
   * @param timerManager the timer manager to use.
   */
  constructor(
    bus: EventBus,
    ifdOptions: Readonly<IfdOptions>,
    flightPlanStore: FlightPlanStore,
    vnavManager: IfdVnavManager,
    gpComputer: IfdGlidePathComputer,
    timerManager: TimerManager,
  ) {
    this.backplane.addInstrument('AirspaceMonitor', new CasAirspaceMonitor(bus));
    this.backplane.addInstrument('GpsMonitor', new CasGpsMonitor(bus));
    this.backplane.addInstrument('Navigation', new CasNavigationMonitor(bus, flightPlanStore, gpComputer, ifdOptions));
    this.backplane.addInstrument('RadioMonitor', new CasRadioMonitor(bus, ifdOptions.comIndex));
    this.backplane.addInstrument('FuelMonitor', new CasFuelMonitor(bus, ifdOptions.fuelFlow));
    this.backplane.addInstrument('TawsMonitor', new CasTawsMonitor(bus, ifdOptions));
    this.backplane.addInstrument('TimerMonitor', new CasTimerMonitor(bus, timerManager));
    this.backplane.addInstrument('TransitionAltitudeMonitor', new CasTransitionAltitudeMonitor(bus, ifdOptions.airData?.altimeterIndex));
    this.backplane.addInstrument('VerticalNavigation', new CasVerticalNavigationMonitor(bus, flightPlanStore, vnavManager));
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

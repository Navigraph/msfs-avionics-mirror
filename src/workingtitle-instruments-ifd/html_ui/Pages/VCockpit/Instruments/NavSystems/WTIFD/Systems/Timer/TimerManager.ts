import { EventBus, FlightTimerController, Instrument, InstrumentBackplane } from '@microsoft/msfs-sdk';

import { TimerUserSettings, TimerUserSettingTypes } from '../../Settings/TimerUserSettings';
import { CustomTimer } from './CustomTimer';
import { EventTimer } from './EventTimer';
import { GenericTimer } from './GenericTimer';
import { IfdFlightTimer } from './IfdFlightTimers';
import { TimerContext } from './TimerContext';
import { TripTimer } from './TripTimer';

/** Manages all of the timers on the utilities tab in the IFD. */
export class TimerManager implements Instrument {
  private readonly backplane = new InstrumentBackplane();

  private readonly context = new TimerContext(this.bus);

  private readonly flightTimerController = new FlightTimerController(this.bus, this.id);

  public readonly genericTimer = new GenericTimer(this.bus, this.context, IfdFlightTimer.Generic, this.flightTimerController);

  public readonly tripTimer = new TripTimer(this.bus, this.context, IfdFlightTimer.PowerOn, IfdFlightTimer.Takeoff, this.flightTimerController);

  public readonly eventTimer = new EventTimer(this.bus, this.context);

  private readonly timerSettings = TimerUserSettings.getManager(this.bus);
  public readonly customTimers: CustomTimer[] = Array.from({ length: 10 }, (_, i) => CustomTimer.create(this.bus, this.context, i + 1, this.flightTimerController, this.timerSettings.getSetting(`customTimer${i + 1}` as keyof TimerUserSettingTypes)));

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param id The ID to use the SDK flight timers.
   */
  constructor(private readonly bus: EventBus, private readonly id: string) {
    this.backplane.addInstrument('Generic', this.genericTimer);
    this.backplane.addInstrument('Trip', this.tripTimer);
    this.backplane.addInstrument('Event', this.eventTimer);
    for (const timer of this.customTimers) {
      this.backplane.addInstrument(`Custom${timer.customNumber}`, timer, true);
    }
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

import { ConsumerSubject, EventBus, FlightTimerController, FlightTimerMode, FlightTimerUtils, Instrument, Subject, Subscribable } from '@microsoft/msfs-sdk';

import { IfdFlightTimer } from './IfdFlightTimers';
import { TimerContext } from './TimerContext';

/** The generic timer, for counting up or down. */
export class GenericTimer implements Instrument {
  /** Whether the timer is set to count up or down. */
  public readonly mode: Subscribable<FlightTimerMode> = ConsumerSubject.create(
    FlightTimerUtils.onEvent(this.flightTimerController.id, this.flightTimerId, this.bus, 'timer_mode'),
    FlightTimerMode.CountingUp,
  );

  /** Whether the timer is currently running or not. */
  public readonly isRunning: Subscribable<boolean> = ConsumerSubject.create(
    FlightTimerUtils.onEvent(this.flightTimerController.id, this.flightTimerId, this.bus, 'timer_is_running'),
    false,
  );

  private readonly _value = Subject.create(0);
  /** Timer value in milliseconds. */
  public readonly value: Subscribable<number> = this._value;

  /**
   * Creates a new instance.
   * @param bus The event bus to use.
   * @param context The timer context data.
   * @param flightTimerId The SDK flight timer to use.
   * @param flightTimerController The SDK flight timer controller.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly context: TimerContext,
    private readonly flightTimerId: IfdFlightTimer,
    private readonly flightTimerController: FlightTimerController<any>,
  ) { }

  /** @inheritdoc */
  public init(): void {
    FlightTimerUtils.onEvent(this.flightTimerController.id, this.flightTimerId, this.bus, 'timer_value_ms').handle((v) => this._value.set(v));

    // reset to good state
    this.onPowerOff();

    this.context.isPowered.sub((isPowered) => {
      if (!isPowered) {
        this.onPowerOff();
      }
    }, true);

    this.mode.sub((v) => {
      if (v === FlightTimerMode.CountingDown) {
        this.setValue(2 * 60_000);
      } else if (v === FlightTimerMode.CountingUp) {
        this.setValue(0);
      }
    }, true);

    this._value.sub((v) => {
      if (v === FlightTimerMode.CountingDown && this._value.get() <= 0) {
        this.flightTimerController.stop(this.flightTimerId);
        this._value.set(0);
      }
    }, true);
  }

  /** @inheritdoc */
  public onUpdate(): void { }

  /** Toggles the running state of the timer. */
  public toggle(): void {
    if (this.isRunning.get()) {
      this.flightTimerController.stop(this.flightTimerId);
    } else {
      this.flightTimerController.start(this.flightTimerId);
    }
  }

  /** Resets the timer. */
  public reset(): void {
    this.flightTimerController.reset(this.flightTimerId);
  }

  /**
   * Sets the initial value, stops, and resets the timer.
   * @param value The value in ms.
   */
  public setValue(value: number): void {
    this.flightTimerController.stop(this.flightTimerId);
    this.flightTimerController.setInitialValue(this.flightTimerId, value);
    this.flightTimerController.reset(this.flightTimerId);
  }

  /**
   * Sets the mode of the timer.
   * @param mode The new mode to set.
   */
  public setMode(mode: FlightTimerMode): void {
    this.flightTimerController.setMode(this.flightTimerId, mode);
  }

  /** Handles instrument power off. */
  private onPowerOff(): void {
    this.flightTimerController.stop(this.flightTimerId);
    this.flightTimerController.setMode(this.flightTimerId, FlightTimerMode.CountingUp);
    this.flightTimerController.reset(this.flightTimerId);
  }
}

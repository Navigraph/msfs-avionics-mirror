import { EventBus, FlightTimerController, FlightTimerMode, FlightTimerUtils, Instrument, Subject, Subscribable } from '@microsoft/msfs-sdk';

import { IfdFlightTimer } from './IfdFlightTimers';
import { TimerContext } from './TimerContext';

export enum TripTimerMode {
  FromPowerOn,
  FromTakeoff,
}

/** The trip timer, for counting up from power on or takeoff. */
export class TripTimer implements Instrument {
  private readonly _mode = Subject.create(TripTimerMode.FromPowerOn);
  public readonly mode: Subscribable<TripTimerMode> = this._mode;

  private readonly _value = Subject.create(0);
  /** Timer value in milliseconds. */
  public readonly value: Subscribable<number> = this._value;

  private readonly powerOnValue = Subject.create(0);

  private readonly _takeoffValue = Subject.create(0);
  /** Timer value since takeoff in milliseconds. */
  public readonly takeoffValue: Subscribable<number> = this._takeoffValue;

  /**
   * Creates a new instance.
   * @param bus The event bus to use.
   * @param context The timer context data.
   * @param powerOnFlightTimerId The SDK flight timer to use for power on.
   * @param takeoffFlightTimerId The SDK flight timer to use for takeoff.
   * @param flightTimerController The SDK flight timer controller.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly context: TimerContext,
    private readonly powerOnFlightTimerId: IfdFlightTimer,
    private readonly takeoffFlightTimerId: IfdFlightTimer,
    private readonly flightTimerController: FlightTimerController<any>,
  ) { }

  /** @inheritdoc */
  public init(): void {
    this.context.isPowered.sub(this.onPowerChanged.bind(this), true);
    this.context.isOnGround.sub(this.onGroundChanged.bind(this), true);

    this.flightTimerController.setMode(this.takeoffFlightTimerId, FlightTimerMode.CountingUp);
    this.flightTimerController.setMode(this.powerOnFlightTimerId, FlightTimerMode.CountingUp);

    FlightTimerUtils.onEvent(this.flightTimerController.id, this.takeoffFlightTimerId, this.bus, 'timer_value_ms').handle((v) => this._takeoffValue.set(v));
    FlightTimerUtils.onEvent(this.flightTimerController.id, this.powerOnFlightTimerId, this.bus, 'timer_value_ms').handle((v) => this.powerOnValue.set(v));

    const takeoffPipe = this._takeoffValue.pipe(this._value, true);
    const powerOnPipe = this.powerOnValue.pipe(this._value, true);

    this._mode.sub((v) => {
      switch (v) {
        case TripTimerMode.FromPowerOn:
          takeoffPipe.pause();
          powerOnPipe.resume(true);
          break;
        case TripTimerMode.FromTakeoff:
          powerOnPipe.pause();
          takeoffPipe.resume(true);
          break;
      }
    }, true);
  }

  /** @inheritdoc */
  public onUpdate(): void { }

  /**
   * Sets the mode of the timer.
   * @param mode The new mode to set.
   */
  public setMode(mode: TripTimerMode): void {
    this._mode.set(mode);
  }

  /** Resets the timer to zero. */
  public reset(): void {
    switch (this._mode.get()) {
      case TripTimerMode.FromPowerOn:
        this.flightTimerController.reset(this.powerOnFlightTimerId);
        break;
      case TripTimerMode.FromTakeoff:
        this.flightTimerController.reset(this.takeoffFlightTimerId);
        break;
    }
  }

  /**
   * Handles instrument powering on or off.
   * @param isPowered whether the instrument is powered.
   */
  private onPowerChanged(isPowered: boolean): void {
    if (isPowered) {
      this.flightTimerController.reset(this.takeoffFlightTimerId);
      this.flightTimerController.reset(this.powerOnFlightTimerId);

      this.flightTimerController.start(this.powerOnFlightTimerId);

      if (!this.context.isOnGround.get()) {
        this.flightTimerController.start(this.takeoffFlightTimerId);
      }
    } else {
      this.flightTimerController.stop(this.takeoffFlightTimerId);
      this.flightTimerController.stop(this.powerOnFlightTimerId);

      this.flightTimerController.reset(this.takeoffFlightTimerId);
      this.flightTimerController.reset(this.powerOnFlightTimerId);
    }
  }

  /**
   * Handles takeoff or landing.
   * @param isOnGround Whether the plane is on the ground.
   */
  private onGroundChanged(isOnGround: boolean): void {
    if (isOnGround) {
      this.flightTimerController.stop(this.takeoffFlightTimerId);
    } else if (this.context.isPowered.get()) {
      this.flightTimerController.reset(this.takeoffFlightTimerId);
      this.flightTimerController.start(this.takeoffFlightTimerId);
    }
  }
}

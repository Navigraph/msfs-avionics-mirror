import { EventBus, Instrument, Subject, Subscribable } from '@microsoft/msfs-sdk';

import { TimerContext } from './TimerContext';

export enum EventTimerMode {
  PowerOn,
  Takeoff,
}

/** The trip timer, for counting up from power on or takeoff. */
export class EventTimer implements Instrument {
  private readonly _mode = Subject.create(EventTimerMode.PowerOn);
  public readonly mode: Subscribable<EventTimerMode> = this._mode;

  private readonly _value = Subject.create(0);
  /** Time in milliseconds since the unix epoch (JS timestamp). */
  public readonly value: Subscribable<number> = this._value;

  private readonly powerOnTime = Subject.create(0);
  private readonly takeoffTime = Subject.create(0);

  /**
   * Creates a new instance.
   * @param bus The event bus to use.
   * @param context The timer context data.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly context: TimerContext,
  ) { }

  /** @inheritdoc */
  public init(): void {
    this.context.isPowered.sub(this.onPowerChanged.bind(this), true);
    this.context.isOnGround.sub(this.onGroundChanged.bind(this), true);

    const takeoffPipe = this.takeoffTime.pipe(this._value, true);
    const powerOnPipe = this.powerOnTime.pipe(this._value, true);

    this._mode.sub((v) => {
      switch (v) {
        case EventTimerMode.PowerOn:
          takeoffPipe.pause();
          powerOnPipe.resume(true);
          break;
        case EventTimerMode.Takeoff:
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
  public setMode(mode: EventTimerMode): void {
    this._mode.set(mode);
  }

  /** Resets the timer to zero. */
  public reset(): void {
    switch (this._mode.get()) {
      case EventTimerMode.PowerOn:
        this.powerOnTime.set(this.context.simTime.get());
        break;
      case EventTimerMode.Takeoff:
        if (this.context.isOnGround.get()) {
          this.takeoffTime.set(0);
        } else {
          this.takeoffTime.set(this.context.simTime.get());
        }
        break;
    }
  }

  /**
   * Handles instrument powering on or off.
   * @param isPowered whether the instrument is powered.
   */
  private onPowerChanged(isPowered: boolean): void {
    if (isPowered) {
      this.powerOnTime.set(this.context.simTime.get());

      if (!this.context.isOnGround.get()) {
        this.takeoffTime.set(this.context.simTime.get());
      }
    } else {
      this.powerOnTime.set(0);
      this.takeoffTime.set(0);
    }
  }

  /**
   * Handles takeoff or landing.
   * @param isOnGround Whether the plane is on the ground.
   */
  private onGroundChanged(isOnGround: boolean): void {
    if (!isOnGround && this.context.isPowered.get()) {
      this.takeoffTime.set(this.context.simTime.get());
    }
  }
}

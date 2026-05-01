import {
  ClockEvents, EventBus, FlightTimerController, FlightTimerMode, FlightTimerUtils, Instrument, MappedSubject, MathUtils, MutableSubscribable, Subject,
  Subscribable, UnitType
} from '@microsoft/msfs-sdk';

import { IfdFlightTimer } from './IfdFlightTimers';
import { TimerContext } from './TimerContext';

export enum CustomTimerMode {
  Event,
  OneTime,
  Periodic,
}

/** Serialized state of an event timer. */
interface SerializedEventCustomTimer {
  /** The type of timer. */
  mode: CustomTimerMode.Event;
  /** The datetime in ms since UNIX epoch. */
  time: number;
  /** The name of the timer. */
  name: string;
}

/** Serialized state of a one time timer. */
interface SerializedOneTimeCustomTimer {
  /** The type of timer. */
  mode: CustomTimerMode.OneTime;
  /** The period in ms. */
  period: number;
  /** The remaining time value in ms. */
  value: number;
  /** The name of the timer. */
  name: string;
}

/** Serialized state of a periodic timer. */
interface SerializedPeriodicCustomTimer {
  /** The type of timer. */
  mode: CustomTimerMode.Periodic;
  /** The period in ms. */
  period: number;
  /** The remaining time value in ms. */
  value: number;
  /** The name of the timer. */
  name: string;
}

/** Serialized state of a custom timer. */
type SerializedCustomTimer = SerializedEventCustomTimer | SerializedOneTimeCustomTimer | SerializedPeriodicCustomTimer;

/** A custom timer, capable of triggering at a specific time, once after a specific time, or periodically. */
export class CustomTimer implements Instrument {
  private static readonly ONE_MINUTE_MS = UnitType.MILLISECOND.convertFrom(1, UnitType.MINUTE);
  private static readonly TEN_MINUTES_MS = UnitType.MILLISECOND.convertFrom(10, UnitType.MINUTE);

  private readonly _isEnabled = Subject.create(false);
  /** Whether this timer is in use. */
  public readonly isEnabled: Subscribable<boolean> = this._isEnabled;

  private static readonly defaultMode = CustomTimerMode.Event;
  private readonly _mode = Subject.create(CustomTimer.defaultMode);
  public readonly mode: Subscribable<CustomTimerMode> = this._mode;

  private static readonly defaultName = 'Event';
  private readonly _name = Subject.create(CustomTimer.defaultName);
  public readonly name: Subscribable<string> = this._name;

  private readonly _value = Subject.create(0);
  /** The remaining time in milliseconds (only used in OneTime or Periodic mode!). */
  public readonly value: Subscribable<number> = this._value;

  private readonly _period = Subject.create(0);
  /** The time period in milliseconds (only used in OneTime or Periodic mode!). */
  public readonly period: Subscribable<number> = this._period;

  private readonly _time = Subject.create(0);
  /** The event time as a unix timestamp in milliseconds (only used in Event mode!). */
  public readonly time: Subscribable<number> = this._time;

  /** The SDK flight timer to use (only used in OneTime or Periodic mode!). */
  private readonly flightTimerId: IfdFlightTimer = IfdFlightTimer.Custom1 + this.customNumber - 1;

  private readonly _isExpired = Subject.create(false);
  /** Whether the timer is expired. Reset with {@link CustomTimer.resetExpiry}. */
  public readonly isExpired: Subscribable<boolean> = this._isExpired;

  private eventExpired = false;

  /** The cached serialized state, to save us recomputing it all the time. The cache is invalidated by setting it to undefined. */
  private cachedSerializedState: string | undefined;

  /**
   * Creates a new instance.
   * @param bus The event bus to use.
   * @param context The timer context data.
   * @param customNumber The 1-based number of this custom timer.
   * @param flightTimerController The SDK flight timer controller.
   * @param serializedSetting The serialized state to save/restore from.
   */
  private constructor(
    private readonly bus: EventBus,
    private readonly context: TimerContext,
    public readonly customNumber: number,
    private readonly flightTimerController: FlightTimerController<any>,
    private readonly serializedSetting: MutableSubscribable<string>,
  ) { }

  /**
   * Creates a new instance.
   * @param bus The event bus to use.
   * @param context The timer context data.
   * @param customNumber The 1-based number of this custom timer.
   * @param flightTimerController The SDK flight timer controller.
   * @param serializedSetting The serialized state to save/restore from.
   * @returns The new instance.
   */
  public static create(
    bus: EventBus,
    context: TimerContext,
    customNumber: number,
    flightTimerController: FlightTimerController<any>,
    serializedSetting: MutableSubscribable<string>,
  ): CustomTimer {
    const timer = new CustomTimer(bus, context, customNumber, flightTimerController, serializedSetting);
    return timer;
  }

  /** @inheritdoc */
  public init(): void {
    // clear all state so we start fresh, as the flight timers can retain state in local vars
    this.clear(false);

    // restored state from past flights
    this.deserialize(this.serializedSetting.get());

    FlightTimerUtils.onEvent(this.flightTimerController.id, this.flightTimerId, this.bus, 'timer_value_ms').handle((v) => this._value.set(v));
    FlightTimerUtils.onEvent(this.flightTimerController.id, this.flightTimerId, this.bus, 'timer_initial_value_ms').handle((v) => this._period.set(v));

    this.context.isPowered.sub(this.onPowerChanged.bind(this), true);
    this.context.isOnGround.sub(this.onGroundChanged.bind(this), true);

    // store the state periodically at a relatively low frequency, so the long running timers can be restored in a future flight
    this.bus.getSubscriber<ClockEvents>().on('realTime').atFrequency(0.06).handle(this.saveState.bind(this));

    // invalidate the cached state whenever anything changes
    MappedSubject.create(
      this._isEnabled,
      this._mode,
      this._name,
      this._period,
      this._time,
      this._value,
    ).sub(() => this.cachedSerializedState = undefined);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this._isEnabled.get()) {
      return;
    }

    switch (this.mode.get()) {
      case CustomTimerMode.Event:
        {
          const time = this._time.get();
          const eventExpired = time > 0 && this.context.simTime.get() >= time;
          if (eventExpired && !this.eventExpired) {
            this._isExpired.set(true);
          }
          this.eventExpired = eventExpired;
        }
        break;
      case CustomTimerMode.OneTime:
        {
          const value = this._value.get();
          const eventExpired = value <= 0 && this._period.get() > 0;
          if (eventExpired && !this.eventExpired) {
            this.flightTimerController.stop(this.flightTimerId);
            this._isExpired.set(true);
          }
          this.eventExpired = eventExpired;

          if (value < 0) {
            this.flightTimerController.stop(this.flightTimerId);
            this._value.set(0);
          }
        }
        break;
      case CustomTimerMode.Periodic:
        {
          const value = this._value.get();
          const eventExpired = value <= 0 && this._period.get() > 0;
          if (eventExpired && !this.eventExpired) {
            this._isExpired.set(true);
          }
          this.eventExpired = eventExpired;

          if (value <= 0) {
            this.flightTimerController.reset(this.flightTimerId);
          }
        }
        break;
    }
  }

  /**
   * Sets the mode of the timer.
   * @param mode The new mode to set.
   */
  public setMode(mode: CustomTimerMode): void {
    this._mode.set(mode);

    switch (mode) {
      case CustomTimerMode.Event:
        // disable the onetime/periodic timer
        this.flightTimerController.stop(this.flightTimerId);
        this.flightTimerController.setInitialValue(this.flightTimerId, 0);
        this.flightTimerController.reset(this.flightTimerId);
        // start the event timer with default time
        this.resetExpiry();
        this._isEnabled.set(true);
        break;
      case CustomTimerMode.OneTime:
      case CustomTimerMode.Periodic:
        // disable the event time
        this._time.set(0);
        if (this._period.get() > 0) {
          // switching from onetime -> periodic, or periodic -> onetime
          // start/keep running but reset
          this._isEnabled.set(true);
          this.flightTimerController.reset(this.flightTimerId);
          if (this.context.isOnGround.get()) {
            this.flightTimerController.stop(this.flightTimerId);
          } else {
            this.flightTimerController.start(this.flightTimerId);
          }
        } else {
          // switching from a event or a timer with no period, so stop
          this._isEnabled.set(false);
          this.flightTimerController.stop(this.flightTimerId);
          this.flightTimerController.reset(this.flightTimerId);
        }
        break;
    }
  }

  /**
   * Sets the name of the timer/event.
   * @param name The new name.
   */
  public setName(name: string): void {
    this._name.set(name);
  }

  /**
   * Sets the event timestamp for this timer.
   * @param time The timestamp in ms since the UNIX epoch (i.e. JS timestamp).
   */
  public setTime(time: number): void {
    if (this._mode.get() === CustomTimerMode.Event) {
      this._time.set(time);
    }
  }

  /**
   * Sets the one shot or periodic period for this timer.
   * @param period The duration in ms.
   */
  public setPeriod(period: number): void {
    if (this._mode.get() !== CustomTimerMode.Event) {
      this.flightTimerController.setInitialValue(this.flightTimerId, period);
      this.flightTimerController.reset(this.flightTimerId);
      this._isEnabled.set(period > 0);
      if (period > 0 && !this.context.isOnGround.get()) {
        this.flightTimerController.start(this.flightTimerId);
      } else {
        this.flightTimerController.stop(this.flightTimerId);
      }
    }
  }

  /** Sets the default timer options (event type with current datetime + 10 minutes) */
  public setDefault(): void {
    // known good state
    this.clear();

    // nearest minute + 10 minutes
    this._time.set(MathUtils.round(this.context.simTime.get(), CustomTimer.ONE_MINUTE_MS) + CustomTimer.TEN_MINUTES_MS);

    this._isEnabled.set(true);

    this.saveState();
  }

  /**
   * Clears the stored state of this timer (e.g. when it is deleted from the UI view).
   * @param saveState Whether to save the state to data storage.
   */
  public clear(saveState = true): void {
    this._isEnabled.set(false);

    this.flightTimerController.stop(this.flightTimerId);
    this.flightTimerController.setInitialValue(this.flightTimerId, 0);
    this.flightTimerController.setMode(this.flightTimerId, FlightTimerMode.CountingDown);
    this.flightTimerController.reset(this.flightTimerId);

    this._mode.set(CustomTimer.defaultMode);
    this._name.set(CustomTimer.defaultName);

    if (saveState) {
      this.saveState();
    }
  }

  /**
   * Resets the expired state.
   */
  public resetExpiry(): void {
    this._isExpired.set(false);

    if (this._mode.get() === CustomTimerMode.Event) {
      // nearest minute + 10 minutes
      this._time.set(MathUtils.round(this.context.simTime.get(), CustomTimer.ONE_MINUTE_MS) + CustomTimer.TEN_MINUTES_MS);
    }
  }

  /**
   * Handles instrument powering on or off.
   * @param isPowered whether the instrument is powered.
   */
  private onPowerChanged(isPowered: boolean): void {
    if (isPowered) {
      if (this.mode.get() !== CustomTimerMode.Event && !this.context.isOnGround.get()) {
        this.flightTimerController.start(this.flightTimerId);
      }
    } else {
      this.flightTimerController.stop(this.flightTimerId);
    }
  }

  /**
   * Handles takeoff or landing.
   * @param isOnGround Whether the plane is on the ground.
   */
  private onGroundChanged(isOnGround: boolean): void {
    if (isOnGround) {
      this.flightTimerController.stop(this.flightTimerId);
    } else if (this.mode.get() !== CustomTimerMode.Event && this.context.isPowered.get()) {
      this.flightTimerController.start(this.flightTimerId);
    }
  }

  /** Saves the current state to settings. */
  private saveState(): void {
    this.serializedSetting.set(this.serialize());
  }

  /**
   * Serialise the timer state for storage in a user setting.
   * @returns The serialised state.
   */
  private serialize(): string {
    if (this.cachedSerializedState !== undefined) {
      return this.cachedSerializedState;
    }

    let serialized: string | undefined;

    if (this._isEnabled.get()) {
      const mode = this.mode.get();
      switch (mode) {
        case CustomTimerMode.Event:
          serialized = JSON.stringify({
            mode,
            time: this._time.get(),
            name: this._name.get(),
          } satisfies SerializedEventCustomTimer);
          break;
        case CustomTimerMode.OneTime:
        case CustomTimerMode.Periodic:
          serialized = JSON.stringify({
            mode,
            period: this._period.get(),
            value: this._value.get(),
            name: this._name.get(),
          } satisfies SerializedOneTimeCustomTimer | SerializedPeriodicCustomTimer);
          break;
      }
    }

    this.cachedSerializedState = serialized ?? '';
    return this.cachedSerializedState;
  }

  /**
   * Deserialises a stored state into this timer.
   * @param stored The stored state.
   */
  private deserialize(stored: string): void {
    if (stored.length > 0) {
      try {
        const state: Partial<SerializedCustomTimer> = JSON.parse(stored);
        switch (state.mode) {
          case CustomTimerMode.Event:
            if (state.time) {
              this._name.set(state.name ?? CustomTimer.defaultName);
              this._mode.set(state.mode);
              this._time.set(state.time);
              // don't generate a new alert if the time is in the past
              this.eventExpired = this.context.simTime.get() > state.time;
              this._isEnabled.set(true);
              return;
            }
            break;
          case CustomTimerMode.OneTime:
          case CustomTimerMode.Periodic:
            if (state.period && state.value !== undefined) {
              this._name.set(state.name ?? CustomTimer.defaultName);
              this._mode.set(state.mode);
              this.flightTimerController.stop(this.flightTimerId);
              this.flightTimerController.setInitialValue(this.flightTimerId, state.period);
              this.flightTimerController.setValue(this.flightTimerId, state.value);
              if (state.period > 0 && (state.value > 0 || state.mode === CustomTimerMode.Periodic)) {
                this._isEnabled.set(true);
                if (!this.context.isOnGround.get()) {
                  this.flightTimerController.start(this.flightTimerId);
                }
              } else {
                this._isEnabled.set(false);
              }
              return;
            }
            break;
          default:
        }
      } catch (e) {
        console.warn('[CustomTimer::deserialise] Failed to deserialze timer', stored, e);
      }
    }
  }
}

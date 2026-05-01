import { ClockEvents, ConsumerSubject, EventBus, SimVarValueType, Subscribable, TimeUtils } from '@microsoft/msfs-sdk';

import { IfdPowerEvents } from '../../Misc/IfdPowerMonitor';
import { AirGroundEvents } from '../../Navigation/AirGroundMonitor';

/** Contextual data used by the timers. */
export class TimerContext {
  private readonly sub = this.bus.getSubscriber<AirGroundEvents & ClockEvents & IfdPowerEvents>();

  /**
   * Whether the instrument is currently powered on.
   * Defaults to true initially to handle hot spawns.
   */
  public readonly isPowered: Subscribable<boolean> = ConsumerSubject.create(this.sub.on('ifd_powered'), true);

  /**
   * Whether the aircraft is considered on the ground.
   * Defaults to true initially to handle pre-takeoff spawns.
   */
  public readonly isOnGround: Subscribable<boolean> = ConsumerSubject.create(this.sub.on('air_ground_on_ground'), true);

  /** The current sim time in milliseconds since the UNIX epoch (i.e. JS timestamp). */
  public readonly simTime: Subscribable<number> = ConsumerSubject.create(this.sub.on('simTime'), TimeUtils.simAbsoluteTimeToJSTimestamp(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds)));

  /**
   * Contructs a new instance.
   * @param bus The event bus to use.
   */
  constructor(private readonly bus: EventBus) { }
}

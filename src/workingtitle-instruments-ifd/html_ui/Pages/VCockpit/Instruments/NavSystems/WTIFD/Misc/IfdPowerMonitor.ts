import { EventBus, RegisteredSimVarUtils, SimVarValueType } from '@microsoft/msfs-sdk';

/** IFD power monitor events. */
export interface IfdPowerEvents {
  /** Whether the IFD is currently powered. */
  ifd_powered: boolean;
  /** The length of time the IFD has been powered on in seconds, or -1 when off. */
  ifd_powered_on_time: number;
  /** The time remaining before the IFD will shut down if the power button is held, or null if no power down is pending. */
  ifd_power_down_time_remaining: number | null;
}

/** Monitors the IFD power state. */
export class IfdPowerMonitor {
  private static readonly POWER_DOWN_HOLD_TIME_S = 5;

  private readonly publisher = this.bus.getPublisher<IfdPowerEvents>();

  private readonly simulationTimeVar = RegisteredSimVarUtils.create('E:SIMULATION TIME', SimVarValueType.Seconds);
  private powerdOnAt = -1;

  private readonly powerButtonHeldVar = RegisteredSimVarUtils.create(`L:1:XMLVAR_IFD_${this.ifdIndex}_VOLUME_PUSH_LONG_HELD`, SimVarValueType.Bool);
  /** The simulation time at which the IFD will shut down if the power button is held, or null if no power down is pending. */
  private powerDownTime: number | null = null;

  /**
   * Monitors the IFD power state.
   * @param bus The instrument event bus.
   * @param ifdIndex Index of the IFD instrument.
   */
  constructor(private readonly bus: EventBus, private readonly ifdIndex: number) { }

  /** Handles power on events. */
  public onPowerOn(): void {
    this.powerdOnAt = this.simulationTimeVar.get();
    this.publisher.pub('ifd_powered', true);
  }

  /** Handles power off events. */
  public onPowerOff(): void {
    this.publisher.pub('ifd_powered', false);
    this.powerdOnAt = -1;
  }

  /** Update handler. Must be called each frame to update state. */
  public onUpdate(): void {
    const simTime = this.simulationTimeVar.get();

    const poweredOnTime = this.powerdOnAt >= 0 ? Math.max(0, simTime - this.powerdOnAt) : -1;
    this.publisher.pub('ifd_powered_on_time', poweredOnTime);

    const powerButtonHeld = this.powerButtonHeldVar.get();
    if (powerButtonHeld) {
      if (this.powerDownTime === null) {
        if (this.isPoweredOn()) {
          this.powerDownTime = simTime + IfdPowerMonitor.POWER_DOWN_HOLD_TIME_S;
        } else {
          this.onPowerOn();
        }
      } else if (simTime >= this.powerDownTime && this.isPoweredOn()) {
        this.onPowerOff();
      }

      if (this.powerDownTime !== null) {
        this.publisher.pub('ifd_power_down_time_remaining', Math.max(0, this.powerDownTime - simTime), false, true);
      }
    } else if (this.powerDownTime !== null) {
      this.powerDownTime = null;
      this.publisher.pub('ifd_power_down_time_remaining', this.powerDownTime, false, true);
    }
  }

  /**
   * Checks whether the IFD is powered on.
   * @returns true if powered on.
   */
  public isPoweredOn(): boolean {
    return this.powerdOnAt >= 0;
  }
}

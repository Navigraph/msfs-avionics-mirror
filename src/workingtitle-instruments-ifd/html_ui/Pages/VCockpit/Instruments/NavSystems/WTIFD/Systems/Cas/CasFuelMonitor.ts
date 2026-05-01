import { ClockEvents, ConsumerValue, EventBus, Instrument } from '@microsoft/msfs-sdk';

import { AirGroundEvents } from '../../Navigation/AirGroundMonitor';
import { AlertUserSettings } from '../../Settings/AlertUserSettings';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';
import { IfdFuelComputerEvents } from '../FuelComputer/IfdFuelComputerEvents';
import { ExternalFuelFlowOptions } from '../../IfdOptions';

/** CAS switch tanks alert monitor. */
export class CasFuelMonitor implements Instrument {
  private readonly sub = this.bus.getSubscriber<ClockEvents & AirGroundEvents & IfdFuelComputerEvents>();

  private readonly switchTanksTransporter = casTransporterFactory(this.bus, CasUuid.SwitchTanks, true);
  private readonly checkInitFuelTransporter = casTransporterFactory(this.bus, CasUuid.CheckInitFuel, true);

  private readonly simDuration = ConsumerValue.create(this.sub.on('activeSimDuration'), 0);
  private readonly alertPeriodMinutes = AlertUserSettings.getManager(this.bus).getSetting('switchTanksAlert');
  private readonly onGround = ConsumerValue.create(this.sub.on('air_ground_on_ground'), true);

  private readonly fuelBurned: ConsumerValue<number> | undefined;
  private readonly fuelRemaining: ConsumerValue<number> | undefined;

  /** The simDuration of the last alert (or initialization), or 0 if alerting is disabled. */
  private lastAlert = 0;

  /** The previous fuel burned value to detect resets. */
  private previousFuelBurned = NaN;

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param externalFuelSystem The external fuel system options, if any.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly externalFuelSystem: ExternalFuelFlowOptions | undefined,
  ) {
    if (this.externalFuelSystem && !this.externalFuelSystem.hasTotalizer) {
      this.fuelBurned = ConsumerValue.create(this.sub.on('ifd_fuel_burned_total_gal'), 0);
      this.fuelRemaining = ConsumerValue.create(this.sub.on('ifd_fuel_remaining_gal'), 0);
    }
  }

  /** @inheritdoc */
  public init(): void {
    this.alertPeriodMinutes.sub((v) => {
      if (v <= 0) {
        this.switchTanksTransporter.set(false);
        this.lastAlert = 0;
      }
    });
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (this.alertPeriodMinutes.get() > 0) {
      const simDuration = this.simDuration.get();

      if (!this.lastAlert || this.onGround.get()) {
        this.lastAlert = simDuration;
      } else if (simDuration >= this.lastAlert + this.alertPeriodMinutes.get() * 60_000) {
        this.lastAlert = simDuration;
        this.switchTanksTransporter.set(true);
      }
    }

    if (this.externalFuelSystem && !this.externalFuelSystem.hasTotalizer && this.fuelBurned !== undefined && this.fuelRemaining !== undefined) {
      const currentBurned = this.fuelBurned.get();

      const wasReset = isNaN(this.previousFuelBurned) || currentBurned < this.previousFuelBurned;
      const pilotHasInitialized = this.fuelRemaining.get() > 0;

      if (wasReset && !pilotHasInitialized) {
        this.checkInitFuelTransporter.set(true);
      } else {
        this.checkInitFuelTransporter.set(false);
      }

      this.previousFuelBurned = currentBurned;
    }
  }
}

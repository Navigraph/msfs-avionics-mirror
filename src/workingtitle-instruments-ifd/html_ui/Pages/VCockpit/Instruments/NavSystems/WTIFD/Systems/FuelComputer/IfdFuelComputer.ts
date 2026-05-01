import {
  ConsumerSubject, EventBus, GNSSEvents, Instrument, Publisher, SimVarValueType
} from '@microsoft/msfs-sdk';

import { ExternalFuelFlowOptions } from '../../IfdOptions';
import { IfdFuelComputerControlEvents, IfdFuelComputerEvents } from './IfdFuelComputerEvents';

/** SimVar names for persisting fuel computer state. */
enum FuelComputerSimVars {
  Burned = 'L:WT_IFD_Fuel_Burned_Gal',
  Remaining = 'L:WT_IFD_Fuel_Remaining_Gal',
  Initialized = 'L:WT_IFD_Fuel_Initialized',
}

/**
 * The IFD Fuel Computer instrument.
 * Manages fuel flow monitoring, totalizer functionality, and derived calculations
 * when an external fuel flow system is configured.
 */
export class IfdFuelComputer implements Instrument {
  private readonly publisher: Publisher<IfdFuelComputerEvents>;

  private readonly groundSpeed = ConsumerSubject.create(null, 0);

  /** Per-sensor fuel flow values in GPH. */
  private readonly sensorFlows: number[] = [0, 0];
  /** Per-sensor fuel burned values in gallons. */
  private readonly sensorBurned: number[] = [0, 0];

  private fuelRemainingGal = 0;
  private totalFuelBurnedGal = 0;
  private lastUpdateTime = 0;
  private isInitialized = false;

  /**
   * Creates a new IFD Fuel Computer.
   * @param bus The event bus.
   * @param config The fuel flow system configuration.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly config: ExternalFuelFlowOptions,
  ) {
    this.publisher = this.bus.getPublisher<IfdFuelComputerEvents>();

    // Subscribe to control events
    const sub = this.bus.getSubscriber<IfdFuelComputerControlEvents>();

    sub.on('ifd_fuel_set_total').handle((total) => {
      this.fuelRemainingGal = total;
      this.totalFuelBurnedGal = 0;
      this.sensorBurned.fill(0);
      this.isInitialized = true;
      this.persistState();
      this.publishAllEvents();
    });

    sub.on('ifd_fuel_reset_burned').handle(() => {
      this.totalFuelBurnedGal = 0;
      this.sensorBurned.fill(0);
      this.persistState();
      this.publishAllEvents();
    });

    // Subscribe to ground speed for economy calculation
    this.groundSpeed.setConsumer(this.bus.getSubscriber<GNSSEvents>().on('ground_speed').atFrequency(1));
  }

  /** @inheritdoc */
  public init(): void {
    // Restore persisted state if no totalizer
    if (!this.config.hasTotalizer) {
      this.isInitialized = SimVar.GetSimVarValue(FuelComputerSimVars.Initialized, SimVarValueType.Bool) === 1;
      if (this.isInitialized) {
        this.fuelRemainingGal = SimVar.GetSimVarValue(FuelComputerSimVars.Remaining, SimVarValueType.GAL);
        this.totalFuelBurnedGal = SimVar.GetSimVarValue(FuelComputerSimVars.Burned, SimVarValueType.GAL);
      }
    }

    this.isInitialized = true;

    this.publisher.pub('ifd_fuel_system_valid', true, true, true);

    this.lastUpdateTime = Date.now();
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isInitialized) {
      this.publisher.pub('ifd_fuel_system_valid', false, true, true);
      return;
    }

    const currentTime = Date.now();
    const deltaTimeHrs = (currentTime - this.lastUpdateTime) / 3600000;
    this.lastUpdateTime = currentTime;

    // Calculate total flow and update burned values
    let totalFlow = 0;
    for (const sensor of this.config.sensors) {
      const flow = SimVar.GetSimVarValue(`ENG FUEL FLOW GPH:${sensor.engineIndex}`, SimVarValueType.GPH);
      this.sensorFlows[sensor.index - 1] = flow;
      totalFlow += flow;

      // Update burned for this sensor
      const deltaBurned = flow * deltaTimeHrs;
      this.sensorBurned[sensor.index - 1] += deltaBurned;
    }

    // Update totals
    const totalDeltaBurned = totalFlow * deltaTimeHrs;
    this.totalFuelBurnedGal += totalDeltaBurned;

    // If we have a totalizer, read from sim; otherwise calculate
    if (this.config.hasTotalizer) {
      this.fuelRemainingGal = SimVar.GetSimVarValue('FUEL TOTAL QUANTITY', SimVarValueType.GAL);
    } else {
      this.fuelRemainingGal = Math.max(0, this.fuelRemainingGal - totalDeltaBurned);
    }

    // Publish all events
    this.publishAllEvents();

    // Periodically persist state (only if no totalizer)
    if (!this.config.hasTotalizer) {
      this.persistState();
    }
  }

  /**
   * Publishes all fuel computer events.
   */
  private publishAllEvents(): void {
    const totalFlow = this.sensorFlows.reduce((sum, flow) => sum + flow, 0);
    const enduranceHrs = totalFlow > 0 ? this.fuelRemainingGal / totalFlow : NaN;
    const groundSpeed = this.groundSpeed.get();
    const fuelEconomy = totalFlow > 0 && groundSpeed > 30 ? groundSpeed / totalFlow : NaN;

    for (const sensor of this.config.sensors) {
      const idx = sensor.index - 1;
      this.publisher.pub(`ifd_fuel_flow_gph_${sensor.index}` as keyof IfdFuelComputerEvents, this.sensorFlows[idx], true, true);
      this.publisher.pub(`ifd_fuel_burned_gal_${sensor.index}` as keyof IfdFuelComputerEvents, this.sensorBurned[idx], true, true);
    }

    this.publisher.pub('ifd_fuel_flow_total_gph', totalFlow, true, true);
    this.publisher.pub('ifd_fuel_burned_total_gal', this.totalFuelBurnedGal, true, true);
    this.publisher.pub('ifd_fuel_remaining_gal', this.fuelRemainingGal, true, true);
    this.publisher.pub('ifd_fuel_endurance_hr', enduranceHrs, true, true);
    this.publisher.pub('ifd_fuel_economy_nmpg', fuelEconomy, true, true);
    this.publisher.pub('ifd_fuel_system_valid', this.isInitialized, true, true);
  }

  /**
   * Persist state to SimVars.
   */
  private persistState(): void {
    SimVar.SetSimVarValue(FuelComputerSimVars.Remaining, SimVarValueType.GAL, this.fuelRemainingGal);
    SimVar.SetSimVarValue(FuelComputerSimVars.Burned, SimVarValueType.GAL, this.totalFuelBurnedGal);
    SimVar.SetSimVarValue(FuelComputerSimVars.Initialized, SimVarValueType.Bool, this.isInitialized ? 1 : 0);
  }
}

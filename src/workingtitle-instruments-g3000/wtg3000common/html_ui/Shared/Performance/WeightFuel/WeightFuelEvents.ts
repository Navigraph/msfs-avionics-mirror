import { EventBus, SimVarPublisher, SimVarPublisherEntry, SimVarValueType } from '@microsoft/msfs-sdk';

/**
 * Simvars related to weight and fuel calculations.
 */
export enum WeightFuelSimVars {
  FobWeight = 'L:WTG3000_Weight_Fuel_Fob_Weight',
  AircraftWeight = 'L:WTG3000_Weight_Fuel_Aircraft_Weight',
  LandingFuel = 'L:WTG3000_Weight_Fuel_Landing_Fuel',
  LandingWeight = 'L:WTG3000_Weight_Fuel_Landing_Weight',
  HoldingFuel = 'L:WTG3000_Weight_Fuel_Holding_Fuel',
  ExcessFuel = 'L:WTG3000_Weight_Fuel_Excess_Fuel'
}

/**
 * Events related to weight and fuel calculations.
 */
export interface WeightFuelEvents {
  /** The weight of the current fuel on board, in pounds. A negative value indicates an uninitialized state. */
  weightfuel_fob_weight: number;

  /** The current total aircraft weight, in pounds. A negative value indicates an uninitialized state. */
  weightfuel_aircraft_weight: number;

  /**
   * The estimated amount of remaining fuel, in pounds, at time of landing. A value less than or equal to
   * {@link Number.MIN_SAFE_INTEGER} indicates the quantity could not be calculated.
   */
  weightfuel_landing_fuel: number;

  /**
   * The estimated landing weight, in pounds. A negative value indicates the quantity could not be calculated.
   */
  weightfuel_landing_weight: number;

  /**
   * The estimated amount of fuel, in pounds, required to complete the user-defined hold, in pounds. A negative value
   * indicates the quantity could not be calculated.
   */
  weightfuel_holding_fuel: number;

  /**
   * The estimated amount of remaining fuel, in pounds, at time of landing less reserve and holding fuel. A value less
   * than or equal to {@link Number.MIN_SAFE_INTEGER} indicates the quantity could not be calculated.
   */
  weightfuel_excess_fuel: number;
}

/**
 * A publisher for weight and fuel data.
 */
export class WeightFuelPublisher extends SimVarPublisher<WeightFuelEvents> {
  private static readonly simvars = new Map<keyof WeightFuelEvents, SimVarPublisherEntry<any>>([
    ['weightfuel_fob_weight', { name: WeightFuelSimVars.FobWeight, type: SimVarValueType.Pounds }],
    ['weightfuel_aircraft_weight', { name: WeightFuelSimVars.AircraftWeight, type: SimVarValueType.Pounds }],
    ['weightfuel_landing_fuel', { name: WeightFuelSimVars.LandingFuel, type: SimVarValueType.Pounds }],
    ['weightfuel_landing_weight', { name: WeightFuelSimVars.LandingWeight, type: SimVarValueType.Pounds }],
    ['weightfuel_holding_fuel', { name: WeightFuelSimVars.HoldingFuel, type: SimVarValueType.Pounds }],
    ['weightfuel_excess_fuel', { name: WeightFuelSimVars.ExcessFuel, type: SimVarValueType.Pounds }],
  ]);

  /**
   * Creates an instance of an WeightFuelPublisher.
   * @param bus The event bus to use with this instance.
   */
  public constructor(bus: EventBus) {
    super(WeightFuelPublisher.simvars, bus);
  }
}

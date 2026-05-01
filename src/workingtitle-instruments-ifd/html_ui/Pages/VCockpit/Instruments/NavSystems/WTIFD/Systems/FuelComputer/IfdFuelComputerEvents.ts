/**
 * Events published by the IFD fuel computer for external fuel flow systems.
 */
export interface IfdFuelComputerEvents {
  /** Total fuel flow rate in gallons per hour (sum of all configured sensors). */
  ifd_fuel_flow_total_gph: number;
  /** Fuel flow for sensor 1 in gallons per hour. */
  ifd_fuel_flow_gph_1: number;
  /** Fuel flow for sensor 2 in gallons per hour (0 if single engine). */
  ifd_fuel_flow_gph_2: number;
  /** Total fuel burned since initialization, in gallons. */
  ifd_fuel_burned_total_gal: number;
  /** Fuel burned by sensor 1 in gallons. */
  ifd_fuel_burned_gal_1: number;
  /** Fuel burned by sensor 2 in gallons (0 if single engine). */
  ifd_fuel_burned_gal_2: number;
  /** Fuel remaining in gallons. */
  ifd_fuel_remaining_gal: number;
  /** Whether the fuel system is providing valid data. */
  ifd_fuel_system_valid: boolean;
  /** Current aircraft endurance in hours. */
  ifd_fuel_endurance_hr: number;
  /** Fuel economy in nautical miles per gallon. */
  ifd_fuel_economy_nmpg: number;
}

/**
 * Control events for the IFD fuel computer.
 */
export interface IfdFuelComputerControlEvents {
  /** Set the total fuel quantity manually (in gallons). */
  ifd_fuel_set_total: number;
  /** Reset the fuel burned counter to zero. */
  ifd_fuel_reset_burned: void;
}

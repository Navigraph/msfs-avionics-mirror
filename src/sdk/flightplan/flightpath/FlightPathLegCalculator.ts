import { LegCalculations, LegDefinition } from '../FlightPlanning';
import { FlightPathState } from './FlightPathState';

/**
 * Options with which to configure flight path calculations for flight plan legs.
 */
export type FlightPathLegCalculationOptions = {
  /**
   * Whether to calculate flight path vectors to span discontinuities in the flight path. If `true`, then the
   * calculated discontinuity vectors will have the `Discontinuity` flag applied to them.
   */
  calculateDiscontinuityVectors: boolean;

  /**
   * Whether to calculate strictly great-circle paths to span discontinuities in the flight path. If `true`, then any
   * discontinuity-spanning path will always be the shortest great-circle path between the two ends of the
   * discontinuity. If `false`, then the discontinuity-spanning path will be calculated in a manner that smoothly joins
   * the two ends the discontinuity, if possible. Ignored if `calculateDiscontinuityVectors` is `false`. Defaults to
   * `false`.
   */
  useGreatCirclePathForDiscontinuity?: boolean;

  /** Whether to disable calculations that reference the present position of the airplane. */
  disableCalculateFromPpos?: boolean;
};

/**
 * A flight path calculator for individual flight plan legs.
 */
export interface FlightPathLegCalculator {
  /**
   * Calculates flight path vectors for a flight plan leg and adds the calculations to the leg.
   * @param legs A sequence of flight plan legs.
   * @param calculateIndex The index of the leg to calculate.
   * @param activeLegIndex The index of the active leg.
   * @param state The current flight path state.
   * @param options Options to use for the calculation.
   * @returns The flight plan leg calculations.
   */
  calculate(
    legs: LegDefinition[],
    calculateIndex: number,
    activeLegIndex: number,
    state: FlightPathState,
    options: Readonly<FlightPathLegCalculationOptions>
  ): LegCalculations;
}

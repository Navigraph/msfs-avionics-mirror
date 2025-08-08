import { EventBus, SimVarPublisher, SimVarPublisherEntry, SimVarValueType } from '@microsoft/msfs-sdk';

/**
 * Simvars related to G3000 weight and balance calculations.
 */
export enum G3000WeightBalanceSimVars {
  AircraftCgArm = 'L:WTG3000_Weight_Balance_Aircraft_CgArm',
  LandingCgArm = 'L:WTG3000_Weight_Balance_Landing_CgArm'
}

/**
 * Events related to G3000 weight and balance calculations.
 */
export interface G3000WeightBalanceEvents {
  /**
   * The current aircraft center of gravity arm, in inches. A value less than or equal to
   * {@link Number.MIN_SAFE_INTEGER} indicates the quantity could not be calculated.
   */
  weightbalance_aircraft_arm: number;

  /**
   * The estimated aircraft center of gravity arm, in inches, at time of landing. A value less than or equal to
   * {@link Number.MIN_SAFE_INTEGER} indicates the quantity could not be calculated.
   */
  weightbalance_landing_arm: number;
}

/**
 * A publisher for G3000 weight and balance data.
 */
export class G3000WeightBalancePublisher extends SimVarPublisher<G3000WeightBalanceEvents> {
  private static readonly simvars = new Map<keyof G3000WeightBalanceEvents, SimVarPublisherEntry<any>>([
    ['weightbalance_aircraft_arm', { name: G3000WeightBalanceSimVars.AircraftCgArm, type: SimVarValueType.Inches }],
    ['weightbalance_landing_arm', { name: G3000WeightBalanceSimVars.LandingCgArm, type: SimVarValueType.Inches }],
  ]);

  /**
   * Creates an instance of an G3000WeightBalancePublisher.
   * @param bus The event bus to use with this instance.
   */
  public constructor(bus: EventBus) {
    super(G3000WeightBalancePublisher.simvars, bus);
  }
}

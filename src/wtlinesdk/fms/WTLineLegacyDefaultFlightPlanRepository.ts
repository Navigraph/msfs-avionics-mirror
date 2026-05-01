import { FlightPlan, FlightPlanner, Subject } from '@microsoft/msfs-sdk';

import { WTLineFlightPlanRepository } from './WTLineFlightPlanRepository';
import { WTLineLegacyFlightPlans, WTLineLegacyMainFlightPlan } from './WTLineFmsTypes';
import { WTLineFmsUtils } from './WTLineFmsUtils';

/**
 * A (legacy) default implementation of {@link WTLineFlightPlanRepository}
 */
export class WTLineLegacyDefaultFlightPlanRepository implements WTLineFlightPlanRepository<WTLineLegacyFlightPlans, WTLineLegacyMainFlightPlan> {
  public readonly planInMod = Subject.create(false);

  /**
   * Ctor
   * @param flightPlanner the flight planner instance
   */
  constructor(private readonly flightPlanner: FlightPlanner) {
  }

  /**
   * Creates a MOD flight plan
   * @param fromIndex the flight plan index to copy the new MOD plan from
   * @param targetIndex the flight plan index to create the new MOD plan at
   * @returns the new MOD plan
   */
  private createModFlightPlan(fromIndex: number, targetIndex: number): FlightPlan {
    if (!this.planInMod.get()) {
      this.flightPlanner.copyFlightPlan(fromIndex, targetIndex, true);
      this.getFlightPlan(targetIndex).calculate(0);

      this.planInMod.set(true);
    }

    return this.getFlightPlan(targetIndex);
  }

  /** @inheritDoc */
  public initFlightPlans(): void {
    this.flightPlanner.createFlightPlan(WTLineLegacyFlightPlans.Active);
    this.flightPlanner.createFlightPlan(WTLineLegacyFlightPlans.Mod);
    this.flightPlanner.createFlightPlan(WTLineLegacyFlightPlans.Secondary);

    WTLineFmsUtils.emptyFlightPlan(this.getFlightPlan(WTLineLegacyFlightPlans.Active));
    WTLineFmsUtils.emptyFlightPlan(this.getFlightPlan(WTLineLegacyFlightPlans.Mod));
    WTLineFmsUtils.emptyFlightPlan(this.getFlightPlan(WTLineLegacyFlightPlans.Secondary));
  }

  /** @inheritDoc */
  public copyModPlanIntoActivePlan(): void {
    this.flightPlanner.copyFlightPlan(WTLineLegacyFlightPlans.Mod, WTLineLegacyFlightPlans.Active);
  }

  /** @inheritDoc */
  public emptyOrDeleteModFlightPlans(): void {
    const plan = this.getFlightPlan(WTLineLegacyFlightPlans.Mod);

    WTLineFmsUtils.emptyFlightPlan(plan);
  }

  /**
   * Copies the active flight plan into the secondary flight plan.
   */
  public copyActivePlanIntoSecondaryPlan(): void {
    this.flightPlanner.copyFlightPlan(WTLineLegacyFlightPlans.Active, WTLineLegacyFlightPlans.Secondary);
  }

  /**
   * Activates the secondary flight plan.
   */
  public activateSecondaryPlan(): void {
    this.flightPlanner.copyFlightPlan(WTLineLegacyFlightPlans.Secondary, WTLineLegacyFlightPlans.Mod);

    this.planInMod.set(true);
  }

  /** @inheritDoc */
  public getFlightPlan(index: WTLineLegacyFlightPlans): FlightPlan {
    return this.flightPlanner.getFlightPlan(index);
  }

  /** @inheritDoc */
  public getPlanIndexToEdit(index: WTLineLegacyFlightPlans): number {
    if (this.isMainPlanIndex(index)) {
      const modPlanIndex = this.getModPlanIndex(index);

      if (modPlanIndex !== null) {
        return this.createModFlightPlan(index, modPlanIndex).planIndex;
      }

      // Otherwise Don't need a MOD for this plan
    }

    return index;
  }

  /** @inheritDoc */
  public getPlanToEdit(index: WTLineLegacyFlightPlans): FlightPlan {
    return this.getFlightPlan(this.getPlanIndexToEdit(index));
  }

  /** @inheritDoc */
  public getPlanIndexToDisplay(index: WTLineLegacyFlightPlans): number {
    if (this.isMainPlanIndex(index)) {
      const modPlanIndex = this.getModPlanIndex(index);

      if (modPlanIndex !== null && this.planInMod.get()) {
        return modPlanIndex;
      }

      // Otherwise Don't need a MOD for this plan
    }

    return index;
  }

  /** @inheritDoc */
  public getPlanToDisplay(index: WTLineLegacyFlightPlans): FlightPlan {
    return this.getFlightPlan(this.getPlanIndexToDisplay(index));
  }

  /** @inheritDoc */
  public getModPlanIndex(index: WTLineLegacyMainFlightPlan): WTLineLegacyFlightPlans | null {
    if (index === WTLineLegacyFlightPlans.Active) {
      return WTLineLegacyFlightPlans.Mod;
    }

    return null;
  }

  /** @inheritDoc */
  public isMainPlanIndex(index: WTLineLegacyFlightPlans): index is WTLineLegacyMainFlightPlan {
    return index === WTLineLegacyFlightPlans.Active || index === WTLineLegacyFlightPlans.Secondary;
  }

  /** @inheritDoc */
  public isPlanIndexSecondaryPlan(mainIndex: WTLineLegacyMainFlightPlan): boolean {
    return mainIndex === WTLineLegacyFlightPlans.Secondary;
  }

  /** @inheritDoc */
  public isPlanIndexModPlan(index: WTLineLegacyFlightPlans): boolean {
    return index === WTLineLegacyFlightPlans.Mod;
  }
}

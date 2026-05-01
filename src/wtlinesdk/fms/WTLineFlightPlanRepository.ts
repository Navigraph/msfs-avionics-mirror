import { FlightPlan, MutableSubscribable } from '@microsoft/msfs-sdk';

/**
 * Describes a repository of flight plans for the WTLine FMS.
 *
 * There are two types of flight plan indices: regular indices and "main" indices.
 *
 * @template F An index that can refer to any flight plan. This can be internal plans used for temporary storage, MOD plans, or anything.
 * @template M An index that can refer to plans defined at a higher level, like the active flight plan, the secondary flight plan, etc.
 *
 * Some operations on the repository are limited to main indices. For example, you can only
 * call {@link getModPlanIndex} with a main index, because the method will return the index of a MOD plan.
 */
export interface WTLineFlightPlanRepository<F extends number, M extends F> {
  /** A {@link MutableSubscribable} indicating if the FMS should be displaying a MOD plan */
  readonly planInMod: MutableSubscribable<boolean>;

  /**
   * Returns a flight plan given an index
   * @param index
   */
  getFlightPlan(index: F): FlightPlan;

  /**
   * Initializes the needed flight plans in the FMS
   */
  initFlightPlans(): void;

  /**
   * Copies the MOD flight plan into the active flight plan
   */
  copyModPlanIntoActivePlan(): void;

  /**
   * Empties or deletes all MOD flight plans
   */
  emptyOrDeleteModFlightPlans(): void;

  /**
   * Copies the active flight plan into the secondary flight plan
   */
  copyActivePlanIntoSecondaryPlan(): void;

  /**
   * Activates the secondary flight plan
   */
  activateSecondaryPlan(): void;

  /**
   * Returns the index of the plan to perform an edit on (creating a MOD plan as needed) given an index
   * @param index the index to query
   * @returns a number
   */
  getPlanIndexToEdit(index: F): number;

  /**
   * Returns the plan to perform an edit on (creating a MOD plan as needed) given an index
   * @param index the index to query
   * @returns a flight plan
   */
  getPlanToEdit(index: F): FlightPlan;

  /**
   * Returns the index of the plan to display given an index
   * @param index the index to query
   * @returns a number
   */
  getPlanIndexToDisplay(index: F): number;

  /**
   * Returns the plan to display given an index
   * @param index the index to query
   * @returns a flight plan
   */
  getPlanToDisplay(index: F): FlightPlan;

  /**
   * Returns the index of the MOD plan for a given main plan, or `null` if there isn't one
   * @param index the plan index to query
   * @returns an index or `null`
   */
  getModPlanIndex(index: M): F | null;

  /**
   * Returns whether a given plan index is a main plan index
   * @param index the plan index to query
   * @returns a boolean
   */
  isMainPlanIndex(index: F): index is M;

  /**
   * Returns whether a given main plan index is a secondary plan index
   * @param mainIndex the main plan index to query
   * @returns a boolean
   */
  isPlanIndexSecondaryPlan(mainIndex: M): boolean;

  /**
   * Returns whether a given plan index corresponds to a MOD plan
   * @param index the plan index to query
   * @returns a boolean
   */
  isPlanIndexModPlan(index: F): boolean;
}

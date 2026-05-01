import { BitFlags, FlightPlanModBatch } from '@microsoft/msfs-sdk';

/**
 * Types of flight plan batches opened for edits by {@link WTLineFms}
 */
export enum WTLineFlightPlanEditBatch {
  ChangeLegFlyover = 'ChangeLegFlyover',
  UpdateDTOOrigin = 'UpdateDTOOrigin',
}

/**
 * Contracts (guarantees) that are made regarding certain flight plan edits.
 *
 * These contracts can be used with {@link WTLineFlightPlanEditBatchUtils.doesBatchGuaranteeContract} to check whether a given
 * flight plan edit batch guarantees a particular contract. This can be useful to avoid unnecessary work when responding to
 * flight plan edits.
 *
 * A batch guarantees a contract if the statement of the contract holds true after the batch is closed, when comparing the
 * state of the flight plan before and after the batch.
 */
export enum WTLineFlightPlanEditContract {
  /** Indicates that the edit maintains the overall structure (segments, legs) of the flight plan */
  MaintainsStructure = 1 << 0,

  /**
   * Indicates that the edit maintains the visible data of all segments and legs in the flight plan
   */
  MaintainsVisibleData = 1 << 1,

  /**
   * Indicates that the edit maintains the value of the `activeLateralLeg`, `activeVerticalLeg`
   * and `activeCalculatingLeg` flight plan properties.
   */
  MaintainsActiveLegIndices = 1 << 2,
}

/**
 * Utility class for working with flight plan edit batches
 */
export class WTLineFlightPlanEditBatchUtils {
  private static readonly CONTRACTS_GUARANTEED_BY_BATCH: { [batch in WTLineFlightPlanEditBatch]: number } = {
    [WTLineFlightPlanEditBatch.ChangeLegFlyover]: WTLineFlightPlanEditContract.MaintainsStructure | WTLineFlightPlanEditContract.MaintainsActiveLegIndices,
    [WTLineFlightPlanEditBatch.UpdateDTOOrigin]: WTLineFlightPlanEditContract.MaintainsVisibleData | WTLineFlightPlanEditContract.MaintainsActiveLegIndices,
  };

  /**
   * Checks whether a set of given edit contracts (as bit flags) are guaranteed by a given flight plan edit batch
   * @param batch the flight plan edit batch
   * @param contractsToCheck the contracts to check
   * @returns whether the contract is guaranteed by the batch
   */
  public static doesBatchGuaranteeContract(batch: FlightPlanModBatch, contractsToCheck: number): boolean {
    if (batch.name === undefined || !(batch.name in WTLineFlightPlanEditBatch)) {
      return false;
    }

    const contractsGuaranteedByBatch = WTLineFlightPlanEditBatchUtils.CONTRACTS_GUARANTEED_BY_BATCH[batch.name as WTLineFlightPlanEditBatch];

    return BitFlags.isAll(contractsGuaranteedByBatch, contractsToCheck);
  }
}

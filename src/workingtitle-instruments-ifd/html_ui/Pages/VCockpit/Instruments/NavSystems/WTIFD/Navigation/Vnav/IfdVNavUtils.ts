import { AltitudeRestrictionType, BitFlags, FixTypeFlags, FlightPlan, FlightPlanSegmentType, FlightPlanUtils, LegDefinition } from '@microsoft/msfs-sdk';

/**
 * A utility class for working with VNAV.
 */
export class IfdVNavUtils {
  /**
   * Checks if a leg is eligible as a VNAV target.
   * @param leg The leg to check.
   * @param aircraftAltitude The current aircraft altitude.
   * @returns true if the leg is eligible.
   */
  public static isLegVNavEligible(leg: LegDefinition, aircraftAltitude: number): boolean {
    const bottomAltitude = IfdVNavUtils.getBottomAltitude(leg);
    return bottomAltitude !== undefined && bottomAltitude < aircraftAltitude - 20;
  }

  /**
   * Checks if a leg is eligible for a VNAV direct to.
   * @param plan The flight plan.
   * @param globalLegIndex The global leg index of the proposed target leg.
   * @param aircraftAltitude The current aircraft altitude in metres.
   * @returns true if eligible.
   */
  public static isLegVNavDirectToEligible(plan: FlightPlan, globalLegIndex: number, aircraftAltitude: number): boolean {
    if (globalLegIndex < plan.activeLateralLeg) {
      return false;
    }

    const targetLeg = plan.tryGetLeg(globalLegIndex);
    if (!targetLeg || FlightPlanUtils.isHeadingToLeg(targetLeg.leg.type)) {
      return false;
    }

    const segment = plan.getSegmentFromLeg(targetLeg);
    if (
      segment === null ||
      segment.segmentType === FlightPlanSegmentType.Origin || segment.segmentType === FlightPlanSegmentType.Departure ||
      segment.segmentType === FlightPlanSegmentType.Destination || segment.segmentType === FlightPlanSegmentType.MissedApproach
    ) {
      return false;
    }

    if (segment.segmentType === FlightPlanSegmentType.Approach) {
      const fafIndex = segment.legs.findIndex((l) => BitFlags.isAll(l.leg.fixTypeFlags, FixTypeFlags.FAF));
      const legIndex = plan.getSegmentLegIndex(globalLegIndex);
      if (legIndex >= fafIndex) {
        return false;
      }
    }

    for (const leg of plan.legs(false, plan.activeLateralLeg, globalLegIndex + 1)) {
      if (FlightPlanUtils.isDiscontinuityLeg(leg.leg.type)) {
        return false;
      }
    }

    return IfdVNavUtils.isLegVNavEligible(targetLeg, aircraftAltitude);
  }

  /**
   * Gets the bottom altitude for a leg, or undefined if there isn't one.
   * @param leg The leg to check.
   * @returns The bottom altitude in metres, or undefined if there isn't one.
   */
  public static getBottomAltitude(leg: LegDefinition): number | undefined {
    switch (leg.verticalData.altDesc) {
      case AltitudeRestrictionType.At:
      case AltitudeRestrictionType.AtOrAbove: {
        return leg.verticalData.altitude1;
      }
      case AltitudeRestrictionType.Between: {
        return leg.verticalData.altitude2;
      }
    }
  }
}

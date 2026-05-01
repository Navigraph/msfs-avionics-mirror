import { AdditionalApproachType, ApproachProcedure, ApproachUtils, RnavTypeFlags, RunwayUtils } from '@microsoft/msfs-sdk';

import { FmsUtils } from '../Fms';
import { IfdRunwayUtils } from './IfdRunwayUtils';

/**
 * A utility class for working with approach procedures.
 */
export class IfdApproachUtils {
  /**
   * Gets the best available approach guidance type.
   * @param approach The approach to check.
   * @returns the annotation to display next to the approach.
   */
  public static getRnavTypeAnnotation(approach: ApproachProcedure): string | undefined {
    switch (FmsUtils.getBestRnavType(approach.rnavTypeFlags)) {
      case RnavTypeFlags.LNAV:
        return '(LNAV+V)';
      case RnavTypeFlags.LNAVVNAV:
        return '(L/VNAV)';
      case RnavTypeFlags.LP:
        return '(LP+V)';
      case RnavTypeFlags.LPV:
        return '(LPV)';
      default:
        return undefined;
    }
  }

  /**
   * Gets the approach name to display.
   * @param approach The approach.
   * @returns The display name.
   */
  public static getApproachName(approach: ApproachProcedure): string {
    if (approach.approachType === AdditionalApproachType.APPROACH_TYPE_VISUAL || approach.approachType === ApproachType.APPROACH_TYPE_UNKNOWN) {
      return approach.name;
    }

    const runwayNumber = IfdRunwayUtils.getNumberString(approach.runwayNumber);
    const runwayDesignator = RunwayUtils.getDesignatorLetter(approach.runwayDesignator);

    const name = ApproachUtils.typeToName(approach.approachType);
    return `${name}${approach.approachSuffix ? '-' + approach.approachSuffix : ''} ${runwayNumber}${runwayDesignator}`;
  }
}

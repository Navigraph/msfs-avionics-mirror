import { Unit, UnitFamily, UnitType } from '@microsoft/msfs-sdk';

import { UnitsUserSettingManager } from '../../Settings/UnitsUserSettings';
import { MapSystemCommon } from '../MapSystemCommon';

/**
 * Range Tier Configuration
 */
interface RangeTier {
  /**
   * Range number will be incremented by this step for the given tier
   */
  increment: number;
}

/**
 * Each key in the record represents an upper limit for a tier
 *
 * @example
 * {
 *   0: { increment: 1 },
 *   25: { increment: 5 },
 *   200: { increment: 50 }
 * }
 *
 * @type {Record<number, RangeTier>}
 */
export type RangeTiers = Record<number, RangeTier>;

/**
 * Range Zoom Direction
 */
export enum RangeDirection {
  Decline = -1,
  Incline = 1,
}

/**
 * The available nominal map ranges in NM
 */
export const IfdNominalRangesNm = [0.5, 1, 2, 6, 10, 20, 60, 120, 240, 300, 600, 750, 1000];

const defaultTierMapPerUnit: Record<string, RangeTiers> = {
  [UnitType.NMILE.name]: {
    0: { increment: 0.5 },
    1: { increment: 1 },
    2: { increment: 2 },
    6: { increment: 4 },
    10: { increment: 5 },
    20: { increment: 10 },
    60: { increment: 20 },
    120: { increment: 40 },
    240: { increment: 60 },
    300: { increment: 100 },
    600: { increment: 150 },
    750: { increment: 250 },
  },
  [UnitType.KILOMETER.name]: {
    0: { increment: 0.5 },
    1: { increment: 1 },
    2: { increment: 2 },
    6: { increment: 4 },
    10: { increment: 5 },
    20: { increment: 10 },
    50: { increment: 30 },
    80: { increment: 20 },
    100: { increment: 50 },
    300: { increment: 100 },
    600: { increment: 150 },
    750: { increment: 250 },
    1000: { increment: 200 },
    1200: { increment: 300 },
  },
  [UnitType.MILE.name]: {
    0: { increment: 0.5 },
    1: { increment: 1 },
    2: { increment: 2 },
    6: { increment: 4 },
    10: { increment: 5 },
    20: { increment: 10 },
    60: { increment: 20 },
    100: { increment: 50 },
    300: { increment: 100 },
    600: { increment: 200 },
  }
};

/**
 * Restrict upper/lower bounds of zoom
 * @param range number to check
 * @param currentUnit the current unit
 * @returns number
 */
export const applyBounds = (range: number, currentUnit: Unit<UnitFamily.Distance>): number => {
  if (range < MapSystemCommon.minRange) {
    return MapSystemCommon.minRange;
  } else if (range > MapSystemCommon.maxRange[currentUnit.name]) {
    return MapSystemCommon.maxRange[currentUnit.name];
  }
  return range;
};

/**
 * Get range number using the range tiers
 * @param currentRangeNm the current range number in NM
 * @param direction RangeDirection
 * @param unitSettingManager unit settings manager
 * @param tierMapPerUnit optional custom tier map
 * @returns number
 */
export const getRangeNumber = (
  currentRangeNm: number,
  direction: RangeDirection,
  unitSettingManager: UnitsUserSettingManager,
  tierMapPerUnit: Record<string, RangeTiers> = defaultTierMapPerUnit
): number => {

  const currentUnit = unitSettingManager.distanceUnitsLarge.get();
  const currentRange = UnitType.NMILE.convertTo(currentRangeNm, currentUnit);

  const tiers = tierMapPerUnit[currentUnit.name];
  let increment = 1;

  for (const [limit, tier] of Object.entries(tiers).reverse()) {
    if (currentRange >= Number(limit)) {
      increment = tier.increment;
      break;
    }
  }

  const newRange =
    Math.round((currentRange + increment * direction) / increment) * increment;
  const clamped = applyBounds(newRange, currentUnit);

  return currentUnit.convertTo(clamped, UnitType.NMILE);
};


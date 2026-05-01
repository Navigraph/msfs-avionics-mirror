import { BoundaryType } from '@microsoft/msfs-sdk';

/**
 * Airspace show types.
 */
export enum AirspaceShowType {
  ClassA = 'ClassA',
  ClassB = 'ClassB',
  ClassC = 'ClassC',
  ClassD = 'ClassD'
}

/**
 * A map of airspace show types to their associated boundary filters.
 */
export type AirspaceShowTypes = Record<AirspaceShowType, number>;

/**
 * A utility class containing a map of airspace show types to their associated boundary filters.
 */
export class AirspaceShowTypeMap {
  /** A map of airspace show types to their associated boundary filters. */
  public static readonly MAP: AirspaceShowTypes = {
    [AirspaceShowType.ClassA]: 1 << BoundaryType.ClassA,
    [AirspaceShowType.ClassB]: 1 << BoundaryType.ClassB,
    [AirspaceShowType.ClassC]: 1 << BoundaryType.ClassC,
    [AirspaceShowType.ClassD]: 1 << BoundaryType.ClassD
  };
}

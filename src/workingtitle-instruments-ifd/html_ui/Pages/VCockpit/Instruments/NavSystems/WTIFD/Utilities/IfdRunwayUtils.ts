import { AirportFacility, AirportRunway, ArrayUtils, RunwaySurfaceType } from '@microsoft/msfs-sdk';

/** Utility methods for working with runways. */
export class IfdRunwayUtils {
  private static readonly RUNWAY_NUMBER_STRINGS = [
    '', // NONE
    ...ArrayUtils.create(36, index => `${index + 1}`), // 1-36
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ];

  /**
   * Gets the standard string representation for a runway number.
   * @param runwayNumber A runway number.
   * @returns The standard string representation for the specified runway number.
   */
  public static getNumberString(runwayNumber: number): string {
    return IfdRunwayUtils.RUNWAY_NUMBER_STRINGS[runwayNumber] ?? '';
  }

  /**
   * Gets the longest runway at an airport.
   * @param airport An airport.
   * @returns The longest runway at the specified airport, or `null` if the airport has no runways.
   */
  public static getLongestRunway(airport: AirportFacility): AirportRunway | null {
    if (airport.runways.length === 0) {
      return null;
    }

    return airport.runways.reduce((a, b) => a.length > b.length ? a : b);
  }

  /**
   * Maps a RunwaySurfaceType enum value to its English name (using the enum token as the label).
   * @param surface The runway surface type.
   * @returns The English name of the surface.
   */
  public static getRunwaySurfaceName(surface: RunwaySurfaceType): string {
    switch (surface) {
      case RunwaySurfaceType.Concrete: return 'Concrete';
      case RunwaySurfaceType.Grass: return 'Grass';
      case RunwaySurfaceType.WaterFSX: return 'Water';
      case RunwaySurfaceType.GrassBumpy: return 'Grass';
      case RunwaySurfaceType.Asphalt: return 'Asphalt';
      case RunwaySurfaceType.ShortGrass: return 'Grass';
      case RunwaySurfaceType.LongGrass: return 'Grass';
      case RunwaySurfaceType.HardTurf: return 'Hard Turf';
      case RunwaySurfaceType.Snow: return 'Snow';
      case RunwaySurfaceType.Ice: return 'Ice';
      case RunwaySurfaceType.Urban: return 'Urban';
      case RunwaySurfaceType.Forest: return 'Forest';
      case RunwaySurfaceType.Dirt: return 'Dirt';
      case RunwaySurfaceType.Coral: return 'Coral';
      case RunwaySurfaceType.Gravel: return 'Gravel';
      case RunwaySurfaceType.OilTreated: return 'Oil Treated';
      case RunwaySurfaceType.SteelMats: return 'Steel Mats';
      case RunwaySurfaceType.Bituminous: return 'Bituminous';
      case RunwaySurfaceType.Brick: return 'Brick';
      case RunwaySurfaceType.Macadam: return 'Macadam';
      case RunwaySurfaceType.Planks: return 'Planks';
      case RunwaySurfaceType.Sand: return 'Sand';
      case RunwaySurfaceType.Shale: return 'Shale';
      case RunwaySurfaceType.Tarmac: return 'Tarmac';
      case RunwaySurfaceType.WrightFlyerTrack: return 'Wright Flyer Track';
      case RunwaySurfaceType.Ocean: return 'Ocean';
      case RunwaySurfaceType.Water: return 'Water';
      case RunwaySurfaceType.Pond: return 'Pond';
      case RunwaySurfaceType.Lake: return 'Lake';
      case RunwaySurfaceType.River: return 'River';
      case RunwaySurfaceType.WasteWater: return 'Waste Water';
      case RunwaySurfaceType.Paint: return 'Paint';
      default: return 'Unknown';
    }
  }


}

import {
  EventBus, Facility, FacilityLoader, FacilityRepository, FacilitySearchType, FacilityType, FacilityUtils, GeoPoint, GNSSEvents, VorType
} from '@microsoft/msfs-sdk';

/**
 * Utility class for searching facilities based on ICAO ident.
 * This class is a singleton and should be accessed through the static method `getSearchUtils`.
 */
export class FacilitySearchUtils {
  private static INSTANCE: FacilitySearchUtils | null = null;
  private readonly facilityLoader: FacilityLoader | null = null;

  private readonly position = new GeoPoint(0, 0);

  /**
   * Private constructor to enforce singleton pattern.
   * @param bus The event bus to use for facility loading and GPS position updates.
   */
  private constructor(bus: EventBus) {
    bus.getSubscriber<GNSSEvents>()
      .on('gps-position')
      .handle((pos) => {
        this.position.set(pos.lat, pos.long);
      });

    this.facilityLoader = new FacilityLoader(FacilityRepository.getRepository(bus));
  }

  /**
   * Returns the singleton instance of FacilitySearchUtils.
   * @param bus The event bus to use for facility loading and GPS position updates.
   * @returns The singleton instance of FacilitySearchUtils.
   */
  public static getSearchUtils(bus: EventBus): FacilitySearchUtils {
    return (FacilitySearchUtils.INSTANCE ??= new FacilitySearchUtils(bus));
  }

  /**
   * Orders two facilities by their ICAO ident and distance from the current GPS position.
   * @param a The first facility to compare.
   * @param b The second facility to compare.
   * @returns A negative number if `a` should come before `b`, a positive number if `b` should come before `a`, or zero if they are equal.
   */
  public orderByIdentsAndDistance(a: Facility, b: Facility): number {
    const aIdent = a.icaoStruct.ident.trim();
    const bIdent = b.icaoStruct.ident.trim();

    if (aIdent === bIdent) {
      const aDist = this.position.distance(a.lat, a.lon);
      const bDist = this.position.distance(b.lat, b.lon);

      return aDist - bDist;
    } else {
      return aIdent.localeCompare(bIdent);
    }
  }

  /**
   * Loads facilities based on an ident to search for, a search type and whether to exclude terminal facilities
   * @param ident The ident to search for
   * @param facilitySearchType The search type. Defaults to {@link FacilitySearchType.All}
   * @param excludeTerminalFacilities Whether to exclude terminal facilities. Defaults to `true`.
   * @param maxDistance The maximum distance away from present position in great-arc radians. Defaults to infinity.
   * @param excludeIlsOnly Whether to exclude ILS-only facilities (without DME).
   * @returns a readonly array of facilities
   */
  public async loadFacilities(
    ident: string,
    facilitySearchType = FacilitySearchType.All,
    excludeTerminalFacilities = true,
    maxDistance = Infinity,
    excludeIlsOnly = true,
  ): Promise<readonly Facility[]> {
    if (this.facilityLoader === null) {
      return Promise.resolve([]);
    }

    const targetLength = ident.trim().length;
    const icaos = await this.facilityLoader.searchByIdentWithIcaoStructs(facilitySearchType, ident, 15);
    const facilities = (await this.facilityLoader.getFacilities(icaos)).filter(
      (fac) =>
        fac !== null
        // keep only facilities whose ident length matches the query ident length
        && fac.icaoStruct.ident.length === targetLength
        // optionally exclude terminal facilities
        && (!excludeTerminalFacilities || fac.icaoStruct.airport.length === 0)
        // ILS without DME do not appear in the VHF navaids table and are not available in the IFD as fixes
        && (!excludeIlsOnly || !FacilityUtils.isFacilityType(fac, FacilityType.VOR) || fac.type !== VorType.ILS || fac.dme !== null)
        // optionally filter by distance
        && (!isFinite(maxDistance) || this.position.distance(fac) <= maxDistance)
    ) as Facility[];

    facilities.sort((a, b) => this.orderByIdentsAndDistance(a, b));

    return facilities;
  }
}

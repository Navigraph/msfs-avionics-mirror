import {
  AirportFacility,
  FacilityType,
  FacilitySearchType,
  LatLonInterface,
  VorFacility,
  NdbFacility,
  IntersectionFacility,
  UserFacility,
  ArrayUtils
} from '@microsoft/msfs-sdk';

import { SuggestionItem } from './SuggestionService';
import { FacilitySearchSessionManager } from './FacilitySearchSessionManager';
import { SuggestionAdapter } from './SuggestionAdapter';

/**
 * Handles searching for facilities by text (ident)
 */
export class IdentFacilitySearcher {
  /** The search session manager to use for searching */
  private readonly sessionManager: FacilitySearchSessionManager;

  /** Current position for distance calculations */
  private currentPosition: LatLonInterface | null = null;

  /** Maximum number of results per facility type */
  private readonly maxResultsPerType: number;

  /**
   * Creates a new ident facility searcher
   * @param sessionManager The session manager to use
   * @param maxResultsPerType Maximum number of results per facility type
   */
  constructor(
    sessionManager: FacilitySearchSessionManager,
    maxResultsPerType: number = 5
  ) {
    this.sessionManager = sessionManager;
    this.maxResultsPerType = maxResultsPerType;
  }

  /**
   * Updates the current position for distance calculations
   * @param position The new position
   */
  public updatePosition(position: LatLonInterface): void {
    this.currentPosition = position;
  }

  /**
   * Gets the current position
   * @returns The current position or null if not set
   */
  public getPosition(): LatLonInterface | null {
    return this.currentPosition;
  }

  /**
   * Gets a user-friendly name for a facility type
   * @param facilityType The facility type to get the name for
   * @returns A user-friendly name for the facility type
   */
  private getFacilityTypeName(facilityType: FacilityType): string {
    switch (facilityType) {
      case FacilityType.Airport:
        return 'Airport';
      case FacilityType.VOR:
        return 'VOR';
      case FacilityType.NDB:
        return 'NDB';
      case FacilityType.Intersection:
        return 'Intersection';
      case FacilityType.USR:
        return 'User Waypoint';
      default:
        return `Facility type ${facilityType}`;
    }
  }

  /**
   * Search facilities by ident text
   * @param searchText The text to search for
   * @returns Promise resolving to an array of SuggestionItems
   */
  public async searchByText(searchText: string): Promise<SuggestionItem[]> {

    if (!searchText || searchText.trim() === '') {
      return [];
    }

    // Ensure search sessions are initialized
    if (!this.sessionManager.isInitialized()) {
      await this.sessionManager.initSearchSessions();
    }

    const searchPromises = [];
    const facilityTypes = this.sessionManager.getFacilityTypes();

    // Create a mapping between facility types and their search types
    const searchMap: [FacilityType, FacilitySearchType][] = [
      [FacilityType.Airport, FacilitySearchType.Airport],
      [FacilityType.VOR, FacilitySearchType.Vor],
      [FacilityType.NDB, FacilitySearchType.Ndb],
      [FacilityType.Intersection, FacilitySearchType.Intersection],
      [FacilityType.USR, FacilitySearchType.User]
    ];

    // Start searches for each facility type
    for (const [facilityType, searchType] of searchMap) {
      if (facilityTypes.includes(facilityType)) {
        // Special case for airports due to unique filtering needs
        if (facilityType === FacilityType.Airport) {
          searchPromises.push(this.searchAirports(searchText));
        } else {
          searchPromises.push(this.searchFacilityByType(searchType, facilityType, searchText));
        }
      }
    }

    try {
      // Wait for all searches to complete and merge results
      const searchResults = await Promise.all(searchPromises);

      const allSuggestions: SuggestionItem[] = ArrayUtils.flat(searchResults);

      return allSuggestions;
    } catch (error) {
      console.error(`[IdentFacilitySearcher] Error searching facilities by text "${searchText}":`, error);
      return [];
    }
  }

  /**
   * Search airports by text
   * @param text The text to search for
   * @returns Promise resolving to an array of SuggestionItems
   */
  private async searchAirports(text: string): Promise<SuggestionItem[]> {
    if (!this.currentPosition) {
      console.warn('[IdentFacilitySearcher] Current position not set for airport search');
      return [];
    }

    const facilityLoader = this.sessionManager.getFacilityLoader();

    try {
      const results = await facilityLoader.searchByIdent(
        FacilitySearchType.Airport,
        text,
        this.maxResultsPerType
      );

      // Process search results in parallel using Promise.all
      const facilityPromises = results.map(icao =>
        facilityLoader.getFacility(FacilityType.Airport, icao)
      );

      const facilities = await Promise.all(facilityPromises);

      // Create suggestion items from the resolved facilities
      const suggestions = facilities
        .filter((facility): facility is AirportFacility =>
          facility &&
          facility.runways.length > 0
        )
        .map(facility =>
          SuggestionAdapter.createSuggestionItem(facility, FacilityType.Airport, false, this.currentPosition!)
        )
        .filter((item): item is SuggestionItem => item !== undefined);

      return suggestions;
    } catch (error) {
      console.error(`[IdentFacilitySearcher] Error searching airports by text "${text}":`, error);
      return [];
    }
  }

  /**
   * Generic method to search any facility type by text (except airports which need special handling)
   * @param searchType The facility search type
   * @param facilityType The facility type
   * @param text The text to search for
   * @returns Promise resolving to an array of SuggestionItems
   */
  private async searchFacilityByType(
    searchType: FacilitySearchType,
    facilityType: FacilityType,
    text: string
  ): Promise<SuggestionItem[]> {
    const facilityLoader = this.sessionManager.getFacilityLoader();

    try {
      // Search by ident
      const results = await facilityLoader.searchByIdent(
        searchType,
        text,
        this.maxResultsPerType
      );

      // Process search results in parallel
      const facilityPromises = results.map(icao =>
        facilityLoader.getFacility(facilityType, icao)
      );

      const facilities = await Promise.all(facilityPromises);

      // Create suggestion items from valid facilities
      const suggestions = facilities
        .filter((facility): facility is AirportFacility | VorFacility | NdbFacility | IntersectionFacility | UserFacility =>
          facility !== null && facility !== undefined
        )
        .map(facility =>
          SuggestionAdapter.createSuggestionItem(facility, facilityType, false, this.currentPosition ?? undefined)
        )
        .filter((item): item is SuggestionItem => item !== undefined);

      return suggestions;
    } catch (error) {
      // Get facility type name more safely
      const facilityTypeName = this.getFacilityTypeName(facilityType);
      console.error(`[IdentFacilitySearcher] Error searching ${facilityTypeName} by text "${text}":`, error);
      return [];
    }
  }
}

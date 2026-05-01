import {
  FacilityType,
  LatLonInterface,
  NearestAirportSubscription,
  NearestVorSubscription,
  NearestNdbSubscription,
  NearestIntersectionSubscription,
  NearestUsrSubscription
} from '@microsoft/msfs-sdk';
import { FacilitySearchSessionManager } from './FacilitySearchSessionManager';
import { SuggestionAdapter } from './SuggestionAdapter';
import { SuggestionItem } from './SuggestionService';

/**
 * Handles searching for nearest facilities using NearestXSubscription classes
 */
export class NearestFacilitySearcher {
  /** The search session manager to use for searching */
  private readonly sessionManager: FacilitySearchSessionManager;

  /** Current position for nearest facility search */
  private currentPosition: LatLonInterface | null = null;

  /** Maximum number of results per facility type */
  private readonly maxResultsPerType: number;

  /** Search radius in meters */
  private readonly searchRadiusMeters: number;

  /** Subscriptions for different facility types */
  private readonly airportSubscription: NearestAirportSubscription;
  private readonly vorSubscription: NearestVorSubscription;
  private readonly ndbSubscription: NearestNdbSubscription;
  private readonly intersectionSubscription: NearestIntersectionSubscription;
  private readonly userSubscription: NearestUsrSubscription;

  /**
   * Creates a new nearest facility searcher
   * @param sessionManager The session manager to use
   * @param maxResultsPerType Maximum number of results per facility type
   * @param searchRadiusMeters Search radius in meters
   */
  constructor(
    sessionManager: FacilitySearchSessionManager,
    maxResultsPerType: number = 5,
    searchRadiusMeters: number = 92600
  ) {
    this.sessionManager = sessionManager;
    this.maxResultsPerType = maxResultsPerType;
    this.searchRadiusMeters = searchRadiusMeters;

    // Initialize subscriptions for each facility type
    const facilityLoader = sessionManager.getFacilityLoader();
    this.airportSubscription = new NearestAirportSubscription(facilityLoader);
    this.vorSubscription = new NearestVorSubscription(facilityLoader);
    this.ndbSubscription = new NearestNdbSubscription(facilityLoader);
    this.intersectionSubscription = new NearestIntersectionSubscription(facilityLoader);
    this.userSubscription = new NearestUsrSubscription(facilityLoader);

    // Start all subscriptions
    this.startSubscriptions();
  }

  /**
   * Start all subscriptions
   */
  private async startSubscriptions(): Promise<void> {
    try {
      await Promise.all([
        this.airportSubscription.start(),
        this.vorSubscription.start(),
        this.ndbSubscription.start(),
        this.intersectionSubscription.start(),
        this.userSubscription.start()
      ]);
    } catch (e) {
      console.error('[NearestFacilitySearcher] Error starting subscriptions:', e);
    }
  }

  /**
   * Updates the current position for nearest facility searches
   * @param position The new position
   */
  public async updatePosition(position: LatLonInterface): Promise<void> {
    this.currentPosition = position;
    // Update all subscriptions with the new position
    try {
      await Promise.all([
        this.airportSubscription.update(
          position.lat,
          position.lon,
          this.searchRadiusMeters,
          this.maxResultsPerType
        ),
        this.vorSubscription.update(
          position.lat,
          position.lon,
          this.searchRadiusMeters,
          this.maxResultsPerType
        ),
        this.ndbSubscription.update(
          position.lat,
          position.lon,
          this.searchRadiusMeters,
          this.maxResultsPerType
        ),
        this.intersectionSubscription.update(
          position.lat,
          position.lon,
          this.searchRadiusMeters,
          this.maxResultsPerType
        ),
        this.userSubscription.update(
          position.lat,
          position.lon,
          this.searchRadiusMeters,
          this.maxResultsPerType
        )
      ]);
    } catch (e) {
      console.error('[NearestFacilitySearcher] Error updating subscriptions:', e);
    }
  }

  /**
   * Gets the current position
   * @returns The current position or null if not set
   */
  public getPosition(): LatLonInterface | null {
    return this.currentPosition;
  }

  /**
   * Finds the nearest facilities of the configured types
   * @returns Promise resolving to an array of suggestion items sorted by distance
   */
  public async findNearestFacilities(): Promise<SuggestionItem[]> {
    if (!this.currentPosition) {
      return [];
    }

    const facilityTypes = this.sessionManager.getFacilityTypes();

    const allSuggestions: SuggestionItem[] = [];

    try {
      // Collect facilities from all subscriptions and convert to suggestion items
      if (facilityTypes.includes(FacilityType.Airport)) {
        const airportsArray = this.airportSubscription.getArray();

        const airports = airportsArray.filter(airport => airport.runways && airport.runways.length > 0);

        airports.forEach(airport => {
          const suggestion = SuggestionAdapter.createSuggestionItem(
            airport,
            FacilityType.Airport,
            true,
            this.currentPosition!
          );
          if (suggestion) {
            allSuggestions.push(suggestion);
          } else {
            console.warn('[NearestFacilitySearcher] Failed to create suggestion for airport:', airport.icao);
          }
        });
      }

      if (facilityTypes.includes(FacilityType.VOR)) {
        const vors = this.vorSubscription.getArray();

        vors.forEach(vor => {
          const suggestion = SuggestionAdapter.createSuggestionItem(
            vor,
            FacilityType.VOR,
            true,
            this.currentPosition!
          );
          if (suggestion) {
            allSuggestions.push(suggestion);
          } else {
            console.warn('[NearestFacilitySearcher] Failed to create suggestion for VOR:', vor.icao);
          }
        });
      }

      if (facilityTypes.includes(FacilityType.NDB)) {
        const ndbs = this.ndbSubscription.getArray();

        ndbs.forEach(ndb => {
          const suggestion = SuggestionAdapter.createSuggestionItem(
            ndb,
            FacilityType.NDB,
            true,
            this.currentPosition!
          );
          if (suggestion) {
            allSuggestions.push(suggestion);
          } else {
            console.warn('[NearestFacilitySearcher] Failed to create suggestion for NDB:', ndb.icao);
          }
        });
      }

      if (facilityTypes.includes(FacilityType.Intersection)) {
        const intersections = this.intersectionSubscription.getArray();

        intersections.forEach(intersection => {
          const suggestion = SuggestionAdapter.createSuggestionItem(
            intersection,
            FacilityType.Intersection,
            true,
            this.currentPosition!
          );
          if (suggestion) {
            allSuggestions.push(suggestion);
          } else {
            console.warn('[NearestFacilitySearcher] Failed to create suggestion for intersection:', intersection.icao);
          }
        });
      }

      if (facilityTypes.includes(FacilityType.USR)) {
        const usrs = this.userSubscription.getArray();

        usrs.forEach(usr => {
          const suggestion = SuggestionAdapter.createSuggestionItem(
            usr,
            FacilityType.USR,
            true,
            this.currentPosition!
          );
          if (suggestion) {
            allSuggestions.push(suggestion);
          } else {
            console.warn('[NearestFacilitySearcher] Failed to create suggestion for USR:', usr.icao);
          }
        });
      }

      // Sort by distance
      allSuggestions.sort((a, b) => {
        const distA = a.distanceFromPosNM ?? Number.MAX_VALUE;
        const distB = b.distanceFromPosNM ?? Number.MAX_VALUE;
        return distA - distB;
      });

      // Limit the total number of results
      const maxResults = this.maxResultsPerType * facilityTypes.length;

      let finalResults = allSuggestions;
      if (allSuggestions.length > maxResults) {
        finalResults = allSuggestions.slice(0, maxResults);
      }

      return finalResults;
    } catch (error) {
      console.error('[NearestFacilitySearcher] Error finding nearest facilities:', error);
      return [];
    }
  }


}

import {
  AirportFacility,
  Facility,
  FacilityType,
  GeoPoint,
  IntersectionFacility,
  LatLonInterface,
  NdbFacility,
  RadioFrequencyFormatter,
  UnitType,
  UserFacility,
  VorFacility
} from '@microsoft/msfs-sdk';

import { SuggestionItem } from './SuggestionService';


/**
 * Options for converting facilities to suggestion items
 */
export interface AdapterOptions {
  /** Whether the facilities are from a nearest search */
  isNearestSearch: boolean;

  /** Current position for calculating distance */
  currentPosition?: LatLonInterface;
}

/**
 * Adapter for converting facility objects to suggestion items
 */
export class SuggestionAdapter {

  private static readonly NAV_FORMATTER = RadioFrequencyFormatter.createNav();
  private static readonly NDB_FORMATTER = RadioFrequencyFormatter.createAdf();

  /**
   * Converts an airport facility to a suggestion item
   * @param facility The airport facility
   * @param options Adapter options
   * @returns The suggestion item
   */
  /**
   * Options cache to reduce object allocations
   */
  private static adapterOptionsCache: AdapterOptions | undefined;

  /**
   * Gets adapter options, creating a new object only when necessary
   * @param isNearestSearch Whether the facilities are from a nearest search
   * @param currentPosition Current position for calculating distance
   * @returns Reused or newly created adapter options object
   */
  private static getAdapterOptions(isNearestSearch: boolean, currentPosition?: LatLonInterface): AdapterOptions {
    if (!this.adapterOptionsCache) {
      this.adapterOptionsCache = { isNearestSearch, currentPosition };
    } else {
      this.adapterOptionsCache.isNearestSearch = isNearestSearch;
      this.adapterOptionsCache.currentPosition = currentPosition;
    }
    return this.adapterOptionsCache;
  }

  /**
   * Converts an airport facility to a suggestion item
   * @param facility The airport facility
   * @param options Adapter options
   * @returns The suggestion item
   */
  public static createAirportSuggestion(
    facility: AirportFacility,
    options: AdapterOptions
  ): SuggestionItem | undefined {
    if (!facility) {
      return undefined;
    }

    try {
      const { isNearestSearch, currentPosition } = options;

      // Get distance once and reuse it
      const distanceNM = this.calculateDistanceNM(currentPosition, facility.lat, facility.lon);

      // Build details string
      let details = '';

      // Add city information
      if (facility.city && facility.city.trim() !== '') {
        details = facility.city;
      }

      // For nearest searches, prioritize showing distance over city
      if (isNearestSearch && distanceNM !== undefined && distanceNM > 0) {
        // Replace city with distance if we have it
        details = distanceNM + this.NM_UNIT;
      }

      // Add longest runway if available
      let longestRunway = 0;
      for (const runway of facility.runways) {
        if (runway.length > longestRunway) {
          longestRunway = runway.length;
        }
      }

      if (longestRunway > 0) {
        if (details.length > 0) {
          details += this.SEPARATOR_DASH;
        }
        details += this.RWY_PREFIX + Math.round(longestRunway);
      }

      // Get identifier from icaoStruct
      const ident = facility.icaoStruct.ident;

      // Use helper method to format display text
      const displayText = this.formatDisplayText(ident, facility.name, details, isNearestSearch);

      const item: SuggestionItem = {
        displayText,
        value: ident
      };

      // Add distance if calculated
      if (distanceNM !== undefined) {
        item.distanceFromPosNM = distanceNM;
      }

      return item;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Converts a VOR facility to a suggestion item
   * @param facility The VOR facility
   * @param options Adapter options
   * @returns The suggestion item
   */
  public static createVorSuggestion(
    facility: VorFacility,
    options: AdapterOptions
  ): SuggestionItem | undefined {
    if (!facility) {
      return undefined;
    }

    try {
      const { isNearestSearch, currentPosition } = options;

      // Get distance once and reuse it
      const distanceNM = this.calculateDistanceNM(currentPosition, facility.lat, facility.lon);

      // Create base details with frequency
      const details = this.NAV_FORMATTER(facility.freqMHz * 1e6);

      // Get identifier from icaoStruct
      const ident = facility.icaoStruct.ident;

      // Use helper method to format display text
      const displayText = this.formatDisplayText(ident, facility.name, details, isNearestSearch);

      const item: SuggestionItem = {
        displayText,
        value: ident
      };

      // Add distance if calculated
      if (distanceNM !== undefined) {
        item.distanceFromPosNM = distanceNM;
      }

      return item;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Converts an NDB facility to a suggestion item
   * @param facility The NDB facility
   * @param options Adapter options
   * @returns The suggestion item
   */
  public static createNdbSuggestion(
    facility: NdbFacility,
    options: AdapterOptions
  ): SuggestionItem | undefined {
    if (!facility) {
      return undefined;
    }

    try {
      const { isNearestSearch, currentPosition } = options;

      // Get distance once and reuse it
      const distanceNM = this.calculateDistanceNM(currentPosition, facility.lat, facility.lon);

      // Create base details with frequency
      const details = this.NDB_FORMATTER(facility.freqMHz * 1e3);

      // Get identifier from icaoStruct
      const ident = facility.icaoStruct.ident;

      // Use helper method to format display text
      const displayText = this.formatDisplayText(ident, facility.name, details, isNearestSearch);

      const item: SuggestionItem = {
        displayText,
        value: ident
      };

      // Add distance if calculated
      if (distanceNM !== undefined) {
        item.distanceFromPosNM = distanceNM;
      }

      return item;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Converts an intersection facility to a suggestion item
   * @param facility The intersection facility
   * @param options Adapter options
   * @returns The suggestion item
   */
  public static createIntersectionSuggestion(
    facility: IntersectionFacility,
    options: AdapterOptions
  ): SuggestionItem | undefined {
    if (!facility) {
      return undefined;
    }

    try {
      const { isNearestSearch, currentPosition } = options;

      // Get distance once and reuse it
      const distanceNM = this.calculateDistanceNM(currentPosition, facility.lat, facility.lon);

      // Get identifier from icaoStruct
      const ident = facility.icaoStruct.ident;
      const name = facility.name || ident;

      // Use helper method to format display text
      const displayText = this.formatDisplayText(ident, name, '', isNearestSearch, this.INTERSECTION_TYPE);

      const item: SuggestionItem = {
        displayText,
        value: ident
      };

      // Add distance if calculated
      if (distanceNM !== undefined) {
        item.distanceFromPosNM = distanceNM;
      }

      return item;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Converts a user waypoint facility to a suggestion item
   * @param facility The user waypoint facility
   * @param options Adapter options
   * @returns The suggestion item
   */
  public static createUserWaypointSuggestion(
    facility: UserFacility,
    options: AdapterOptions
  ): SuggestionItem | undefined {
    if (!facility) {
      return undefined;
    }

    try {
      const { isNearestSearch, currentPosition } = options;

      // Get distance once and reuse it
      const distanceNM = this.calculateDistanceNM(currentPosition, facility.lat, facility.lon);

      // Get identifier from icaoStruct
      const ident = facility.icaoStruct.ident;
      const name = facility.name || ident;

      // Use helper method to format display text
      const displayText = this.formatDisplayText(ident, name, '', isNearestSearch, this.USER_WAYPOINT_TYPE);

      const item: SuggestionItem = {
        displayText,
        value: ident
      };

      // Add distance if calculated
      if (distanceNM !== undefined) {
        item.distanceFromPosNM = distanceNM;
      }

      return item;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Reusable string constants to reduce allocations and improve consistency
   * Storing these as static readonly properties avoids creating the same strings repeatedly
   */
  private static readonly SEPARATOR_DASH = ' - ';
  private static readonly SEPARATOR_PIPE = ' | ';
  private static readonly OPEN_PAREN = ' (';
  private static readonly CLOSE_PAREN = ')';
  private static readonly INTERSECTION_TYPE = 'Intersection';
  private static readonly USER_WAYPOINT_TYPE = 'User Waypoint';
  private static readonly NM_UNIT = ' NM';
  private static readonly RWY_PREFIX = 'RWY ';

  /**
   * Format display text for suggestions with common patterns to reduce string allocations
   * @param ident The facility identifier
   * @param name The facility name
   * @param details Additional details to display (frequency, distance, etc)
   * @param isNearestSearch Whether this is for a nearest search display
   * @param facilityType Optional facility type string for display
   * @returns Formatted display text string
   */
  private static formatDisplayText(ident: string, name: string | undefined, details: string, isNearestSearch: boolean, facilityType?: string): string {
    // String concatenation is optimized by V8 for small strings
    // Let's keep the code simple and readable

    if (isNearestSearch) {
      // For nearest search format: IDENT (details) | NAME
      let text = ident;

      if (details) {
        text += this.OPEN_PAREN + details + this.CLOSE_PAREN;
      } else if (facilityType) {
        text += this.OPEN_PAREN + facilityType + this.CLOSE_PAREN;
      }

      if (name && (!ident || name !== ident)) {
        text += this.SEPARATOR_PIPE + name;
      }

      return text;
    } else {
      // For regular search format: IDENT - NAME (details)
      let text = ident;

      if (name && (!ident || name !== ident)) {
        text += this.SEPARATOR_DASH + name;
      }

      if (details) {
        text += this.OPEN_PAREN + details + this.CLOSE_PAREN;
      } else if (facilityType) {
        text += this.OPEN_PAREN + facilityType + this.CLOSE_PAREN;
      }

      return text;
    }
  }

  /**
   * Calculate distance only once per suggestion
   * @param currentPosition Current position for distance calculation
   * @param facilityLat Facility latitude
   * @param facilityLon Facility longitude
   * @returns Distance in nautical miles or undefined if position unavailable
   */
  private static calculateDistanceNM(currentPosition: LatLonInterface | undefined, facilityLat: number, facilityLon: number): number | undefined {
    if (!currentPosition) {
      return undefined;
    }

    const distanceGreatArcRadians = GeoPoint.distance(currentPosition.lat, currentPosition.lon, facilityLat, facilityLon);
    return UnitType.GA_RADIAN.convertTo(distanceGreatArcRadians, UnitType.NMILE);
  }

  /**
   * Creates a suggestion item from a facility based on its type
   * @param facility The facility
   * @param facilityType The facility type
   * @param isNearestSearch Whether the facility is from a nearest search
   * @param currentPosition Current position for calculating distance
   * @returns The suggestion item
   */
  public static createSuggestionItem(
    facility: Facility,
    facilityType: FacilityType,
    isNearestSearch: boolean,
    currentPosition?: LatLonInterface
  ): SuggestionItem | undefined {

    if (!facility) {
      return undefined;
    }

    // Reuse the same options object to reduce allocations
    const options = this.getAdapterOptions(isNearestSearch, currentPosition);

    try {
      // Avoid unnecessary type casting by using type guards
      switch (facilityType) {
        case FacilityType.Airport:
          return this.createAirportSuggestion(facility as AirportFacility, options);

        case FacilityType.VOR:
          return this.createVorSuggestion(facility as VorFacility, options);

        case FacilityType.NDB:
          return this.createNdbSuggestion(facility as NdbFacility, options);

        case FacilityType.Intersection:
          return this.createIntersectionSuggestion(facility as IntersectionFacility, options);

        case FacilityType.USR:
          return this.createUserWaypointSuggestion(facility as UserFacility, options);

        default:
          return undefined;
      }
    } catch (error) {
      return undefined;
    }
  }
}

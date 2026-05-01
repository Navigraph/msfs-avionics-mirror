import {
  EventBus,
  FacilityType,
  LatLonInterface
} from '@microsoft/msfs-sdk';

import { SuggestionHandler, SuggestionItem, KeyboardInputType } from './SuggestionService';
import { FacilitySearchSessionManager } from './FacilitySearchSessionManager';
import { NearestFacilitySearcher } from './NearestFacilitySearcher';
import { IdentFacilitySearcher } from './IdentFacilitySearcher';

/**
 * Options for facility suggestion handler
 */
export interface FacilitySuggestionHandlerOptions {
  /** Event bus to use */
  bus?: EventBus;

  /** Facility types to search for */
  facilityTypes?: FacilityType[];

  /** Maximum results per facility type */
  maxResultsPerType?: number;

  /** Search radius in meters */
  searchRadiusMeters?: number;
}

/**
 * Handles facility suggestions for search operations
 */
export class FacilitySuggestionHandler implements SuggestionHandler {
  /** Suggestion handler type */
  public readonly type: KeyboardInputType = KeyboardInputType.Facility;
  /** Whether handler is initialized */
  private isInitialized: boolean = false;

  /** Current position for nearest searches */
  private currentPos: LatLonInterface | null = null;

  /** Search session manager */
  private readonly sessionManager: FacilitySearchSessionManager;

  /** Nearest facility searcher */
  private readonly nearestSearcher: NearestFacilitySearcher;

  /** Text-based facility searcher */
  private readonly textSearcher: IdentFacilitySearcher;

  /** Maximum results per facility type */
  private readonly maxResultsPerType: number;

  /** Search radius in meters */
  private readonly searchRadiusMeters: number;

  /**
   * Creates a new facility suggestion handler
   * @param options Configuration options
   */
  constructor(options: FacilitySuggestionHandlerOptions = {}) {
    this.maxResultsPerType = options.maxResultsPerType ?? 5;
    this.searchRadiusMeters = options.searchRadiusMeters ?? 92600; // 50NM in meters

    // Create session manager
    this.sessionManager = new FacilitySearchSessionManager({
      bus: options.bus,
      facilityTypes: options.facilityTypes
    });

    // Create search components
    this.nearestSearcher = new NearestFacilitySearcher(
      this.sessionManager,
      this.maxResultsPerType,
      this.searchRadiusMeters
    );

    this.textSearcher = new IdentFacilitySearcher(
      this.sessionManager,
      this.maxResultsPerType
    );

    // Initialize search sessions
    this.init();
  }

  /**
   * Initialize the handler
   */
  private async init(): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      // Initialize search sessions
      await this.sessionManager.initSearchSessions();
      this.isInitialized = true;
    } catch (error) {
      console.error('[FacilitySuggestionHandler] Error initializing:', error);
    }
  }

  /**
   * Updates the current position for nearest facility searches
   * @param position The new position
   */
  public updatePosition(position: LatLonInterface): void {
    // Store position and update search components
    this.currentPos = position;
    this.nearestSearcher.updatePosition(position);
    this.textSearcher.updatePosition(position);
  }

  /**
   * Gets suggestions based on input text
   * @param input The user input text
   * @returns Promise resolving to array of suggestion items
   */
  public async getSuggestions(input: string): Promise<SuggestionItem[]> {
    try {
      // Ensure handler is initialized
      if (!this.isInitialized) {
        await this.init();
      }

      if (input.trim() === '') {
        return this.getNearestSuggestions();
      }

      if (input.length <= 2) {
        const nearestSuggestions = await this.getNearestSuggestions();
        const filteredSuggestions = nearestSuggestions.filter(s => s.value.startsWith(input.toUpperCase()));
        if (filteredSuggestions.length > 0) {
          return filteredSuggestions;
        }
      }
      return this.searchFacilitiesText(input);
    } catch (error) {
      console.error(`[FacilitySuggestionHandler] Error getting suggestions for input "${input}":`, error);
      return [];
    }
  }

  /**
   * Gets suggestions for the nearest facilities
   * @returns Promise resolving to array of suggestion items
   */
  private async getNearestSuggestions(): Promise<SuggestionItem[]> {
    if (!this.currentPos) {
      return [];
    }

    try {
      return await this.nearestSearcher.findNearestFacilities();
    } catch (error) {
      console.error('[FacilitySuggestionHandler] Error getting nearest suggestions:', error);
      return [];
    }
  }

  /**
   * Searches facilities by text
   * @param searchText The text to search for
   * @returns Promise resolving to array of suggestion items
   */
  private async searchFacilitiesText(searchText: string): Promise<SuggestionItem[]> {
    try {
      const suggestions = await this.textSearcher.searchByText(searchText);
      return suggestions;
    } catch (error) {
      console.error(`[FacilitySuggestionHandler] Error searching facilities by text "${searchText}":`, error);
      return [];
    }
  }

  /**
   * Gets the session manager
   * @returns The facility search session manager
   */
  public getSessionManager(): FacilitySearchSessionManager {
    return this.sessionManager;
  }

  /**
   * Gets the nearest facility searcher
   * @returns The nearest facility searcher
   */
  public getNearestSearcher(): NearestFacilitySearcher {
    return this.nearestSearcher;
  }

  /**
   * Gets the text facility searcher
   * @returns The text facility searcher
   */
  public getTextSearcher(): IdentFacilitySearcher {
    return this.textSearcher;
  }
}

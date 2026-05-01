import {
  EventBus,
  FacilityLoader,
  FacilityRepository,
  FacilitySearchType,
  FacilityType,
  NearestAirportSearchSession,
  NearestIntersectionSearchSession,
  NearestIcaoSearchSession,
  NearestVorSearchSession,
  NearestRepoFacilitySearchSession,
  NearestIcaoSearchSessionDataType
} from '@microsoft/msfs-sdk';

/**
 * Configuration options for facility search session manager
 */
export interface FacilitySearchSessionManagerOptions {
  /**
   * The facility loader to use for searching facilities
   */
  facilityLoader?: FacilityLoader;

  /**
   * The event bus to use
   */
  bus?: EventBus;

  /**
   * The facility types to search for
   */
  facilityTypes?: FacilityType[];
}

/**
 * Default facility types to search
 */
const DEFAULT_FACILITY_TYPES = [
  FacilityType.Airport,
  FacilityType.VOR,
  FacilityType.NDB,
  FacilityType.Intersection
];

/**
 * Manages search sessions for different facility types
 */
export class FacilitySearchSessionManager {
  /** The facility loader to use for searching */
  private readonly facilityLoader: FacilityLoader;

  /** The event bus */
  private readonly bus: EventBus;

  /** Facility types to search */
  private readonly facilityTypes: FacilityType[];

  /** Search sessions for different facility types */
  private airportSearchSession: NearestAirportSearchSession<NearestIcaoSearchSessionDataType.Struct> | null = null;
  private vorSearchSession: NearestVorSearchSession<NearestIcaoSearchSessionDataType.Struct> | null = null;
  private ndbSearchSession: NearestIcaoSearchSession<NearestIcaoSearchSessionDataType.Struct> | null = null;
  private intersectionSearchSession: NearestIntersectionSearchSession<NearestIcaoSearchSessionDataType.Struct> | null = null;
  private userSearchSession: NearestRepoFacilitySearchSession<FacilityType.USR, NearestIcaoSearchSessionDataType.Struct> | null = null;

  /** Whether search sessions are initialized */
  private areSessionsInitialized = false;

  /**
   * Creates a new facility search session manager
   * @param options Configuration options
   */
  constructor(options: FacilitySearchSessionManagerOptions = {}) {
    // Create a facility loader if one isn't provided
    this.bus = options.bus ?? new EventBus();
    this.facilityLoader = options.facilityLoader ??
      new FacilityLoader(FacilityRepository.getRepository(this.bus));

    this.facilityTypes = options.facilityTypes ?? DEFAULT_FACILITY_TYPES;

    // Initialize search sessions
    this.initSearchSessions();
  }

  /**
   * Initialize the nearest facility search sessions
   */
  public async initSearchSessions(): Promise<void> {
    try {
      // Wait for facility loader to initialize
      await this.facilityLoader.awaitInitialization();

      // Start search sessions for different facility types
      const [airportSession, vorSession, ndbSession, intSession, userSession] = await Promise.all([
        this.facilityTypes.includes(FacilityType.Airport) ?
          this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport) : Promise.resolve(null),
        this.facilityTypes.includes(FacilityType.VOR) ?
          this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor) : Promise.resolve(null),
        this.facilityTypes.includes(FacilityType.NDB) ?
          this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Ndb) : Promise.resolve(null),
        this.facilityTypes.includes(FacilityType.Intersection) ?
          this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Intersection) : Promise.resolve(null),
        this.facilityTypes.includes(FacilityType.USR) ?
          this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.User) : Promise.resolve(null)
      ]);

      // Store sessions
      this.airportSearchSession = airportSession;
      this.vorSearchSession = vorSession;
      this.ndbSearchSession = ndbSession;
      this.intersectionSearchSession = intSession;
      this.userSearchSession = userSession;

      this.areSessionsInitialized = true;
    } catch (e) {
      console.error('[FacilitySearchSessionManager] Error initializing search sessions:', e);
    }
  }

  /**
   * Checks if search sessions are initialized
   * @returns True if search sessions are initialized
   */
  public isInitialized(): boolean {
    return this.areSessionsInitialized;
  }

  /**
   * Gets the facility loader
   * @returns The facility loader
   */
  public getFacilityLoader(): FacilityLoader {
    return this.facilityLoader;
  }

  /**
   * Gets the airport search session
   * @returns The airport search session
   */
  public getAirportSearchSession(): NearestAirportSearchSession<NearestIcaoSearchSessionDataType.Struct> | null {
    return this.airportSearchSession;
  }

  /**
   * Gets the VOR search session
   * @returns The VOR search session
   */
  public getVorSearchSession(): NearestVorSearchSession<NearestIcaoSearchSessionDataType.Struct> | null {
    return this.vorSearchSession;
  }

  /**
   * Gets the NDB search session
   * @returns The NDB search session
   */
  public getNdbSearchSession(): NearestIcaoSearchSession<NearestIcaoSearchSessionDataType.Struct> | null {
    return this.ndbSearchSession;
  }

  /**
   * Gets the intersection search session
   * @returns The intersection search session
   */
  public getIntersectionSearchSession(): NearestIntersectionSearchSession<NearestIcaoSearchSessionDataType.Struct> | null {
    return this.intersectionSearchSession;
  }

  /**
   * Gets the user waypoint search session
   * @returns The user waypoint search session
   */
  public getUserSearchSession(): NearestRepoFacilitySearchSession<FacilityType.USR, NearestIcaoSearchSessionDataType.Struct> | null {
    return this.userSearchSession;
  }

  /**
   * Gets the facility types
   * @returns The facility types
   */
  public getFacilityTypes(): FacilityType[] {
    return this.facilityTypes;
  }
}

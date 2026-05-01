import {
  AirportFacility, AirwayData, ApproachTransition, EnrouteTransition, Facility, FacilitySearchType, FacilityType, GeoPoint, ICAO, IntersectionFacility,
  OneWayRunway, RunwayTransition, RunwayUtils
} from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';

/** A set of functions for modifying a flight plan in the simplest way possible. */
export class DevPlanUtils {
  /**
   * ctor
   * @param fms The FMS instance to use.
   */
  public constructor(private readonly fms: Fms) {
    // No-op
  }

  /**
   * Sets the origin for the flight plan.
   * @param ident The ICAO to set, like 'KDEN'.
   * @returns The origin facility.
   */
  public async setOrigin(ident: string): Promise<AirportFacility> {
    const originResults = await this.fms.facLoader.searchByIdent(FacilitySearchType.Airport, ident, 1);

    if (originResults && originResults.length === 1) {
      const origin = await this.fms.facLoader.getFacility(FacilityType.Airport, originResults[0]);

      if (origin) {
        this.fms.setOrigin(origin);
        return origin;
      }
    }

    throw new Error('error setting origin');
  }

  /**
   * Sets the origin for the flight plan.
   * @param origin The origin facility. Get this by calling setOrigin first.
   * @param runwayName The runway to set, like '34L'.
   * @returns The runway.
   * @throws Error if runway couldn't be found with given inputs.
   */
  public setOriginRunway(origin: AirportFacility, runwayName: string): OneWayRunway {

    const runwayNumber = parseInt(runwayName.replace(/[A-Za-z]*/g, ''));

    const runwayDesignationLetter = runwayName.replace(/\d*/g, '');

    const runwayDesignationNumber = runwayDesignationLetter === 'L' ? 1 : runwayDesignationLetter === 'R' ? 2 : 0;

    const runwayNameString = RunwayUtils.getRunwayNameString(runwayNumber, runwayDesignationNumber);

    const runway = RunwayUtils.matchOneWayRunwayFromDesignation(origin, runwayNameString);

    if (runway) {
      this.fms.setOrigin(origin, runway);
      return runway;
    } else {
      throw new Error('error setting runway');
    }
  }

  /**
   * Sets the destination for the flight plan.
   * @param ident The ICAO to set, like 'KCOS'.
   * @returns The destination facility.
   */
  public async setDestination(ident: string): Promise<AirportFacility> {
    const results = await this.fms.facLoader.searchByIdent(FacilitySearchType.Airport, ident, 1);
    if (results && results.length === 1) {
      const destination = await this.fms.facLoader.getFacility(FacilityType.Airport, results[0]);
      if (destination) {
        this.fms.setDestination(destination);
        return destination;
      }
    }

    throw new Error('error setting destination');
  }

  /** Removes the origin. */
  public removeOrigin(): void {
    this.fms.setOrigin(undefined);
  }

  /** Removes the destination. */
  public removeDestination(): void {
    this.fms.setDestination(undefined);
  }

  /**
   * Sets the destination for the flight plan.
   * @param ident The ident to search for.
   * @param segmentIndex The index of the segment to add the waypoint to.
   * @param segmentLegIndex The index inside the segment to insert the waypoint at (if none, append).
   * @returns The destination facility.
   */
  public async insertWaypoint(ident: string, segmentIndex: number, segmentLegIndex?: number): Promise<Facility> {
    const facility = await this.findNearestFacilityFromIdent(ident);

    this.fms.insertWaypoint(facility, segmentIndex, segmentLegIndex);

    return facility;
  }

  /**
   * Sets the destination for the flight plan.
   * @param airwayName The name of the airway.
   * @param entryIdent The ident for the airway entry.
   * @param exitIdent The ident for the airway exit.
   * @param segmentIndex The index of the segment to add the waypoint to.
   * @param segmentLegIndex The index inside the segment to insert the waypoint at (if none, append).
   * @returns The destination facility.
   */
  public async insertAirway(
    airwayName: string,
    entryIdent: string,
    exitIdent: string,
    segmentIndex: number,
    segmentLegIndex: number,
  ): Promise<[AirwayData, IntersectionFacility, IntersectionFacility]> {
    const entryFacility = await this.findNearestIntersectionFromIdent(entryIdent);
    const exitFacility = await this.findNearestIntersectionFromIdent(exitIdent);
    const airway = await this.getAirwayFromLeg(entryFacility.icao, airwayName);

    this.fms.insertAirwaySegment(airway, entryFacility, exitFacility, segmentIndex, segmentLegIndex);

    return [airway, entryFacility, exitFacility];
  }

  /**
   * Checks for an airway at a leg and returns the airway.
   * @param entryIdent The icao of the entry to check.
   * @param airwayName The airway to search for.
   * @returns The airway object.
   */
  public async getAirwayFromLeg(entryIdent: string, airwayName: string): Promise<AirwayData> {
    const facility = await this.fms.facLoader.getFacility(FacilityType.Intersection, entryIdent);
    if (facility) {
      const matchedRoute = facility.routes.find((r) => r.name === airwayName);
      if (matchedRoute) {
        const airway = await this.fms.facLoader.getAirway(matchedRoute.name, matchedRoute.type, entryIdent);
        return airway;
      }
    }
    throw new Error('airway not found: ' + JSON.stringify({ icao: entryIdent, airwayName }));
  }

  /**
   * Searches for facilities matching ident, returns the nearest one.
   * @param ident The intersection ident to search for.
   * @returns The selected facility.
   */
  public async findNearestIntersectionFromIdent(ident: string): Promise<IntersectionFacility> {
    return this.findNearestFacilityFromIdent(ident, FacilitySearchType.Intersection) as Promise<IntersectionFacility>;
  }

  /**
   * Searches for facilities matching ident, returns the nearest one.
   * @param ident The ident to search for.
   * @param facilityType The facility type to search for.
   * @returns The selected facility.
   */
  public async findNearestFacilityFromIdent(ident: string, facilityType = FacilitySearchType.All): Promise<Facility> {
    const ppos = this.fms.ppos;
    const referencePos = new GeoPoint(0, 0).set(ppos.lat, ppos.lon);

    let selectedFacility: Facility | null = null;

    const results = await this.fms.facLoader.searchByIdent(facilityType, ident);

    if (results) {
      const foundFacilities: Facility[] = [];
      // get facilities for results
      for (let i = 0; i < results.length; i++) {
        const icao = results[i];
        const facIdent = ICAO.getIdent(icao);
        if (facIdent === ident) {
          const fac = await this.fms.facLoader.getFacility(ICAO.getFacilityType(icao), icao);
          foundFacilities.push(fac);
        }
      }

      if (foundFacilities.length > 1) {
        foundFacilities.sort((a, b) => referencePos.distance(a) - referencePos.distance(b));
        selectedFacility = foundFacilities[0];
      } else if (foundFacilities.length === 1) {
        selectedFacility = foundFacilities[0];
      }
    }

    if (selectedFacility) {
      return selectedFacility;
    } else {
      throw new Error('facility not found with given ident: ' + ident);
    }
  }

  /**
   * Loads a departure.
   * @param origin The origin facility. Get this by calling setOrigin first.
   * @param departureName The departure name, like 'BAYLR6'.
   * @param runwayName The name of the runway, like '34L'.
   * @param transitionName The name of the enroute transition, like 'HBU'.
   * @throws Error if something couldn't be found with given inputs.
   * @returns true on success
   */
  public loadDeparture(origin: AirportFacility, departureName: string, runwayName: string, transitionName?: string): Promise<boolean> {
    // TODO enroute transition

    const departure = origin.departures.find(x => x.name.toUpperCase() === departureName.toUpperCase());

    if (!departure) {
      throw new Error('could not find departure procedure matching string: ' + departureName
        + '. Possible departures: ' + JSON.stringify(origin.departures.map(x => x.name)));
    }

    const departureIndex = origin.departures.indexOf(departure);

    let transition: EnrouteTransition | undefined;
    let transitionIndex = -1;

    if (transitionName) {
      transition = departure.enRouteTransitions.find(x => x.name.toUpperCase() === transitionName.toUpperCase());

      if (!transition) {
        throw new Error('could not find enroute transition matching string: ' + transitionName
          + '. Possible enroute transitions: ' + JSON.stringify(departure.enRouteTransitions.map(x => x.name)));
      }

      transitionIndex = departure.enRouteTransitions.indexOf(transition);
    }

    const runwayNumber = parseInt(runwayName.replace(/[A-Za-z]*/g, ''));

    const runwayDesignationLetter = runwayName.replace(/\d*/g, '');

    const runwayDesignationNumber = runwayDesignationLetter === 'L' ? 1 : runwayDesignationLetter === 'R' ? 2 : 0;

    const departureRunwayIndex = departure.runwayTransitions.findIndex(x => x.runwayNumber === runwayNumber && x.runwayDesignation === runwayDesignationNumber);

    if (departureRunwayIndex === -1) {
      throw new Error('could not find departureRunwayIndex matching inputs: ' + JSON.stringify({ runwayName, departureName })
        + '. Possible runways: ' + JSON.stringify(departure.runwayTransitions.map(x => ({ runwayNumber: x.runwayNumber, runwayDesignation: x.runwayDesignation }))));
    }

    const runwayNameString = RunwayUtils.getRunwayNameString(runwayNumber, runwayDesignationNumber);

    const runway = RunwayUtils.matchOneWayRunwayFromDesignation(origin, runwayNameString);

    return this.fms.loadDeparture(origin, departureIndex, departureRunwayIndex, transitionIndex, runway);
  }

  /**
   * Loads an arrival.
   * @param destination The destination facility. Get this by calling setDestination first.
   * @param arrivalName The name of the arrival, like 'DBRY4'.
   * @param transitionName The name of the arrival transition, like 'ALS'.
   * @param runwayTransitionName The name of the arrival runway transition, like '17R'.
   * @throws Error if something couldn't be found with given inputs.
   * @returns true on success
   */
  public loadArrival(
    destination: AirportFacility,
    arrivalName: string,
    transitionName?: string,
    runwayTransitionName?: string,
  ): Promise<boolean> {
    const arrival = destination.arrivals.find(x => x.name.toUpperCase() === arrivalName.toUpperCase());

    if (!arrival) {
      throw new Error('could not find arrival procedure matching string: ' + arrivalName
        + '. Possible arrivals: ' + JSON.stringify(destination.arrivals.map(x => x.name)));
    }

    const arrivalIndex = destination.arrivals.indexOf(arrival);

    let transition: EnrouteTransition | undefined;
    let transitionIndex = -1;

    if (transitionName) {
      transition = arrival.enRouteTransitions.find(x => x.name.toUpperCase() === transitionName.toUpperCase());

      if (!transition) {
        throw new Error('could not find arrival transition matching string: ' + transitionName
          + '. Possible arrival transitions: ' + JSON.stringify(arrival.enRouteTransitions.map(x => x.name)));
      }

      transitionIndex = arrival.enRouteTransitions.indexOf(transition);
    }

    let runwayTransition: RunwayTransition | undefined;
    let runwayTransitionIndex = -1;

    if (runwayTransitionName) {
      runwayTransition = arrival.runwayTransitions.find(x => {
        return RunwayUtils.getRunwayNameString(x.runwayNumber, x.runwayDesignation).toUpperCase() === runwayTransitionName.toUpperCase();
      });

      if (!runwayTransition) {
        throw new Error('could not find arrival runway transition matching string: ' + runwayTransitionName
          + '. Possible arrival runway transitions: '
          + JSON.stringify(arrival.runwayTransitions.map(x => RunwayUtils.getRunwayNameString(x.runwayNumber, x.runwayDesignation))));
      }

      runwayTransitionIndex = arrival.runwayTransitions.indexOf(runwayTransition);
    }

    return this.fms.loadArrival(destination, arrivalIndex, runwayTransitionIndex, transitionIndex);
  }

  /**
   * Loads an approach.
   * @param destination The destination facility. Get this by calling setDestination first.
   * @param approachName The name of the approach, like 'ILS 17L'.
   * @param transitionName The name of the approach transition, like 'BRK' or 'ADANE'.
   * @throws Error if something couldn't be found with given inputs.
   */
  public async loadApproach(destination: AirportFacility, approachName: string, transitionName?: string): Promise<void> {

    const approach = destination.approaches.find(x => x.name.toUpperCase().replace(/\s/g, '') === approachName.toUpperCase().replace(/\s/g, ''));

    if (!approach) {
      throw new Error('could not find approach procedure matching string: ' + approachName
        + '. Possible approachs: ' + JSON.stringify(destination.approaches.map(x => x.name)));
    }

    const approachIndex = destination.approaches.indexOf(approach);

    let transition: ApproachTransition | undefined;
    let approachTransitionIndex = -1;

    if (transitionName) {
      transition = approach.transitions.find(x => x.name.toUpperCase() === transitionName.toUpperCase());

      if (!transition) {
        throw new Error('could not find approach transition matching string: ' + transitionName
          + '. Possible approach transitions: ' + JSON.stringify(approach.transitions.map(x => x.name)));
      }

      approachTransitionIndex = approach.transitions.indexOf(transition);
    }

    await this.fms.insertApproach(destination, approachIndex, approachTransitionIndex);
  }
}

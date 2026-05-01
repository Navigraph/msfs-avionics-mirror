import { BitFlags, FlightPlanner, LegDefinition, LegDefinitionFlags } from '@microsoft/msfs-sdk';

/**
 * Provides utility functions for working with IFD maps.
 */
export class MapUtils {
  /**
   * Determines whether an altitude for a leg should be displayed on the map.
   * @param leg the leg def
   * @param flightPlanner flightplanner instance
   * @returns boolean
   */
  public static showAltitudeForLeg(leg: LegDefinition, flightPlanner: FlightPlanner): boolean {

    const activePlan = flightPlanner.getFlightPlan(flightPlanner.activePlanIndex);
    const legIndex = activePlan.getLegIndexFromLeg(leg);

    const isOrigin = legIndex === 0;
    const destinationIdent = activePlan.destinationAirportIcao?.ident;
    const isDestinationWithApproach = destinationIdent && leg.leg.fixIcaoStruct && leg.leg.fixIcaoStruct.ident === destinationIdent;

    const isMissedApproach = BitFlags.isAll(
      leg.flags,
      LegDefinitionFlags.MissedApproach
    );

    return !isOrigin &&
      !isDestinationWithApproach &&
      !isMissedApproach;

  }
}

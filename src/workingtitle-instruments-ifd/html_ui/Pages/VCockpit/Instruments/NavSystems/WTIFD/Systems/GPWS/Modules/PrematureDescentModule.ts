import { AirportFacility, EventBus, GeoPointInterface, LerpLookupTable, OneWayRunway, RunwayUtils, Subscription, UnitType } from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../../FlightPlan';
import { GpwsEvents } from '../GpwsEvents';
import { GpwsData, GpwsModule } from '../GpwsModule';
import { GpwsOperatingMode } from '../GpwsTypes';

/**
 * A GPWS module which handles the (PDA) premature descent function.
 */
export class PrematureDescentModule implements GpwsModule {
  private static readonly PDA_HYSTERESIS = 100;
  /** Mapping distance to closest FPL runway in nautical miles, to minimum AGL altitude in feet. */
  private static readonly PDA_ALERT_REGION = new LerpLookupTable([[80, 1], [150, 1.8], [170, 2.3], [170, 5]]);

  private readonly publisher = this.bus.getPublisher<GpwsEvents>();

  private isActive = false;

  private readonly originRunways: OneWayRunway[] = [];
  private readonly destinationRunways: OneWayRunway[] = [];

  private readonly subs: Subscription[] = [];

  /**
   * Creates a new instance of TouchdownCalloutModule.
   * @param bus The event bus.
   * @param flightPlanStore The flight plan store to use.
   */
  constructor(private readonly bus: EventBus, private readonly flightPlanStore: FlightPlanStore) { }

  /** @inheritdoc */
  public onInit(): void {
    this.subs.push(
      this.flightPlanStore.originFacility.sub((origin) => this.updateRunways(origin, this.originRunways)),
      this.flightPlanStore.destinationFacility.sub((dest) => this.updateRunways(dest, this.destinationRunways))
    );
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onUpdate(operatingMode: GpwsOperatingMode, data: Readonly<GpwsData>, realTime: number): void {
    if (
      operatingMode !== GpwsOperatingMode.Normal || data.isOnGround || !data.isAglAltitudeValid || data.aglAltitude > 2500 || data.inhibits.terrain ||
      (this.originRunways.length === 0 && this.destinationRunways.length === 0)
    ) {
      this.publisher.pub('gpws_premature_descent', false, false, true);
      return;
    }

    const closestOriginDist = this.getClosestRunwayDistance(this.originRunways, data.gpsPos);
    const closestDestinationDist = this.getClosestRunwayDistance(this.destinationRunways, data.gpsPos);

    const closestRunwayDist = Math.min(closestOriginDist, closestDestinationDist);

    if (closestRunwayDist < 1 || closestRunwayDist > 5) {
      this.publisher.pub('gpws_premature_descent', false, false, true);
      return;
    }

    this.isActive = data.aglAltitude < (PrematureDescentModule.PDA_ALERT_REGION.get(closestRunwayDist) + (this.isActive ? PrematureDescentModule.PDA_HYSTERESIS : 0));

    this.publisher.pub('gpws_premature_descent', this.isActive, false, true);
  }

  /**
   * Updates a runway set from an airport.
   * @param facility The airport facility, or undefined to clear the runways.
   * @param out The runway set.
   */
  private updateRunways(facility: AirportFacility | undefined, out: OneWayRunway[]): void {
    out.length = 0;

    if (!facility || facility.runways.length === 0) {
      out.length = 0;
      return;
    }

    out.push(...RunwayUtils.getOneWayRunwaysFromAirport(facility));
  }

  /**
   * Gets the distance to the closest runway in the set.
   * @param runways The runways to check.
   * @param pos The position to measure from.
   * @returns The distance to the closest runway in nautical miles, or infinity if none.
   */
  private getClosestRunwayDistance(runways: OneWayRunway[], pos: GeoPointInterface): number {
    let closest = Infinity;

    for (let i = 0; i < runways.length; i++) {
      const dist = pos.distance(runways[i].latitude, runways[i].longitude);
      if (dist < closest) {
        closest = dist;
      }
    }

    return UnitType.NMILE.convertFrom(closest, UnitType.GA_RADIAN);
  }

  /** @inheritdoc */
  public onDestroy(): void {
    // noop
  }
}

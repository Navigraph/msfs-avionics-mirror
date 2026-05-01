import {
  AirportFacility, AirportFacilityDataFlags, Facility, FacilityLoader, FacilityType, FacilityUtils, GeoPoint, ICAO,
  IcaoType, Metar, StatefulBasicLifecycle, Subject, Subscribable, Taf, UnitType
} from '@microsoft/msfs-sdk';

/**
 * Airport weather data for a waypoint information component.
 */
export type WaypointInfoAirportWeatherData = {
  /** The airport facility for which weather data were searched. */
  facility: AirportFacility;

  /** The airport facility for which the weather data were issued. */
  weatherFacility: AirportFacility;

  /** The issued METAR, or `undefined` if METAR data are unavailable. */
  metar: Metar | undefined;

  /** The issued TAF, or `undefined` if TAF data are unavailable.. */
  taf: Taf | undefined;
};

/**
 * A provider of airport weather data for a waypoint information component.
 */
export class WaypointInfoAirportWeatherProvider {
  // TODO: need to confirm the maximum distance.
  private static readonly MAX_DISTANCE = UnitType.NMILE.convertTo(15, UnitType.GA_RADIAN);

  private readonly lifecycle = new StatefulBasicLifecycle(true, false);

  private readonly _weatherData = Subject.create<Readonly<WaypointInfoAirportWeatherData> | null>(null);
  /** The most recently fetched airport weather data. */
  public readonly weatherData = this._weatherData as Subscribable<Readonly<WaypointInfoAirportWeatherData> | null>;

  private updateOpId = 0;

  private isAlive = true;
  private isResumed = false;

  /**
   * Creates a new instance of AirportInfoWeatherProvider. The provider is created in a paused state.
   * @param facLoader The facility loader this provider uses to retrieve facility data.
   * @param facility The facility for which to search airport weather data.
   */
  public constructor(
    private readonly facLoader: FacilityLoader,
    private readonly facility: Subscribable<Facility | null>
  ) {
    facility.sub(this.onFacilityChanged.bind(this), false, true).withLifecycle(this.lifecycle);
  }

  /**
   * Resumes this provider. When this provider is resumed, it will update its provided airport weather data whenever
   * the facility for which to search weather data changes.
   * @throws Error if this provider has been destroyed.
   */
  public resume(): void {
    if (!this.isAlive) {
      throw new Error('AirportInfoWeatherProvider::resume(): cannot resume a dead provider');
    }

    if (this.isResumed) {
      return;
    }

    this.isResumed = true;

    this.lifecycle.resume();
  }

  /**
   * Pauses this provider. When this provider is paused, it will not update its provided airport weather data.
   * @throws Error if this provider has been destroyed.
   */
  public pause(): void {
    if (!this.isAlive) {
      throw new Error('AirportInfoWeatherProvider::pause(): cannot pause a dead provider');
    }

    if (!this.isResumed) {
      return;
    }

    this.isResumed = false;

    this.lifecycle.pause();

    // Increment operation ID to terminate any ongoing updates.
    ++this.updateOpId;
  }

  /**
   * Refreshes this provider's airport weather data. This has no effect if this provider is paused.
   * @throws Error if this provider has been destroyed.
   */
  public refresh(): void {
    if (!this.isAlive) {
      throw new Error('AirportInfoWeatherProvider::refresh(): cannot refresh a dead provider');
    }

    if (!this.isResumed) {
      return;
    }

    this.onFacilityChanged(this.facility.get());
  }

  /**
   * Responds to when the facility for which to search airport weather data changes.
   * @param facility The new facility for which to search airport weather data.
   */
  private async onFacilityChanged(facility: Facility | null): Promise<void> {
    const opId = ++this.updateOpId;

    if (facility && FacilityUtils.isFacilityType(facility, FacilityType.Airport)) {
      let weatherFacility: AirportFacility | null = null;

      // Try to get METAR for the search facility.

      let metar = await this.facLoader.getMetar(facility);

      if (opId !== this.updateOpId) {
        return;
      }

      if (metar) {
        weatherFacility = facility;
      } else {
        // If there is no METAR for the search facility, then search for the closest METAR to the search facility. If
        // we find one, then only accept it if it is issued for a valid airport facility and the distance between the
        // search and weather facilities is within the maximum.

        metar = await this.facLoader.searchMetar(facility.lat, facility.lon);

        if (opId !== this.updateOpId) {
          return;
        }

        if (metar) {
          const airportIdent = metar.icao;
          if (airportIdent !== '') {
            weatherFacility = await this.facLoader.tryGetFacility(
              FacilityType.Airport,
              ICAO.value(IcaoType.Airport, '', '', airportIdent),
              AirportFacilityDataFlags.Frequencies
            );

            if (opId !== this.updateOpId) {
              return;
            }

            if (
              !weatherFacility
              || GeoPoint.distance(facility.lat, facility.lon, weatherFacility.lat, weatherFacility.lon) > WaypointInfoAirportWeatherProvider.MAX_DISTANCE
            ) {
              weatherFacility = null;
              metar = undefined;
            }
          } else {
            metar = undefined;
          }
        }
      }

      // Try to get TAF for the weather facility. If there is no weather facility, then try to get TAF for the search
      // facility.

      // TODO: disable TAF data for now because the TAF data retrieved from the sim is often incorrect.
      // Re-enable when sim TAF data is fixed.

      let taf: Taf | undefined;

      /* eslint-disable max-len */
      // if (weatherFacility) {
      //   taf = await this.facLoader.getTaf(weatherFacility);

      //   if (opId !== this.updateOpId) {
      //     return;
      //   }
      // } else {
      //   taf = await this.facLoader.getTaf(facility);

      //   if (opId !== this.updateOpId) {
      //     return;
      //   }

      //   if (taf) {
      //     weatherFacility = facility;
      //   } else {
      //     // If there is no TAF for the search facility, then search for the closest TAF to the search facility. If
      //     // we find one, then only accept it if it is issued for a valid airport facility and the distance between the
      //     // search and weather facilities is within the maximum.

      //     taf = await this.facLoader.searchTaf(facility.lat, facility.lon);

      //     if (opId !== this.updateOpId) {
      //       return;
      //     }

      //     if (taf) {
      //       const airportIdent = taf.icao;
      //       if (airportIdent !== '') {
      //         weatherFacility = await this.facLoader.tryGetFacility(
      //           FacilityType.Airport,
      //           ICAO.value(IcaoType.Airport, '', '', airportIdent),
      //           AirportFacilityDataFlags.Frequencies
      //         );

      //         if (opId !== this.updateOpId) {
      //           return;
      //         }

      //         if (
      //           !weatherFacility
      //           || GeoPoint.distance(facility.lat, facility.lon, weatherFacility.lat, weatherFacility.lon) > WaypointInfoAirportWeatherProvider.MAX_DISTANCE
      //         ) {
      //           weatherFacility = null;
      //           taf = undefined;
      //         }
      //       } else {
      //         taf = undefined;
      //       }
      //     }
      //   }
      // }

      if (weatherFacility) {
        this._weatherData.set({
          facility,
          weatherFacility,
          metar,
          taf,
        });
        return;
      }
    }

    this._weatherData.set(null);
  }

  /**
   * Destroys this provider.
   */
  public destroy(): void {
    this.isAlive = false;
    this.lifecycle.destroy();
  }
}

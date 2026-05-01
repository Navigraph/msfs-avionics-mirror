import {
  AirportClassMask, AirportFacility, ArraySubject, BitFlags, EventBus, Facility, FacilityLoader, GeoPoint, ICAO, NdbFacility, NearestContext,
  NearestNdbSubscription, NearestVorSubscription, Subject, SubscribableUtils, UnitType, VorFacility, VorType
} from '@microsoft/msfs-sdk';

import { IfdAirframeType, IfdOptions } from '../IfdOptions';
import { FmsPositionSystemEvents } from '../Systems/FmsPositionSystem';
import { NearbyNavaidInfo } from '../Pages/FmsPage/InfoTab/Components/NearbyNavaids';

/**
 * A wrapper for NearestContext.
 */
export class IfdNearestContext {
  private static readonly NEARBY_NAVAID_RADIUS_NM = 40;
  private static readonly NEARBY_NAVAID_MAX_RESULTS = 10;
  private static readonly CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  private readonly referencePosition = Subject.create(new GeoPoint(NaN, NaN), SubscribableUtils.NEVER_EQUALITY);
  private readonly gpsPositionPipe = this.bus.getSubscriber<FmsPositionSystemEvents>().on('fms_pos_position_1').atFrequency(1 / 3)
    .handle((pos) => {
      const posGeoPoint = this.referencePosition.get().set(pos.lat, pos.long);
      this.referencePosition.set(posGeoPoint);
      if (!NearestContext.isInitialized) {
        NearestContext.initialize(this.facLoader, this.bus, this.referencePosition);
      }
      if (this.referencePosition.get().isValid()) {
        NearestContext.getInstance().update();
      }

      const airportsIn40Nm = NearestContext.getInstance().airports.getArray()
        .filter((fac) => posGeoPoint.distance(fac.lat, fac.lon) <= UnitType.GA_RADIAN.convertFrom(40, UnitType.NMILE));
      const ndbsIn40Nm = NearestContext.getInstance().ndbs.getArray()
        .filter((fac) => posGeoPoint.distance(fac.lat, fac.lon) <= UnitType.GA_RADIAN.convertFrom(40, UnitType.NMILE));
      const vorsIn40Nm = NearestContext.getInstance().vors.getArray()
        .filter((fac) => posGeoPoint.distance(fac.lat, fac.lon) <= UnitType.GA_RADIAN.convertFrom(40, UnitType.NMILE));

      this.updateAirportsWithin40Nm(airportsIn40Nm.sort((a, b) => posGeoPoint.distance(a.lat, a.lon) - posGeoPoint.distance(b.lat, b.lon)));
      this.updateWaypointsWithin40Nm([...airportsIn40Nm, ...ndbsIn40Nm, ...vorsIn40Nm].sort((a, b) => posGeoPoint.distance(a.lat, a.lon) - posGeoPoint.distance(b.lat, b.lon)));


    }, true);

  /** @inheritdoc */
  constructor(
    private readonly bus: EventBus,
    private readonly facLoader: FacilityLoader,
    private readonly ifdOptions: IfdOptions
  ) {
    this.infoVorNearest = new NearestVorSubscription(this.facLoader);
    this.infoNdbNearest = new NearestNdbSubscription(this.facLoader);
  }

  public readonly airportsWithin40Nm = ArraySubject.create<AirportFacility>([]);
  public readonly waypointsWithin40Nm = ArraySubject.create<Facility>([]);

  // Dedicated subscriptions for nearby navaids around an arbitrary point (not plane position)
  private readonly infoVorNearest: NearestVorSubscription;
  private readonly infoNdbNearest: NearestNdbSubscription;


  /** Initializes the nearest context */
  public init(): void {
    this.facLoader.awaitInitialization().then(async () => {
      NearestContext.onInitialized(() => {
        NearestContext.getInstance().maxAirports = 50;
        NearestContext.getInstance().airportRadius = 100;
        NearestContext.getInstance().maxNdbs = 50;
        NearestContext.getInstance().ndbRadius = 100;
        NearestContext.getInstance().maxIntersections = 50;
        NearestContext.getInstance().intersectionRadius = 100;
        NearestContext.getInstance().maxVors = 50;
        NearestContext.getInstance().vorRadius = 100;

        NearestContext.getInstance().airports.awaitStart().then(() => {
          // Dont show helipads unless isHelicopter is true.
          this.ifdOptions.airframeType !== IfdAirframeType.Helicopter && NearestContext.getInstance().airports.setFilter(
            true,
            BitFlags.union(AirportClassMask.AllWater, AirportClassMask.HardSurface, AirportClassMask.SoftSurface, AirportClassMask.Private)
          );
        });

        // Filter out non-DME ILS
        NearestContext.getInstance().vors.awaitStart().then(() => {
          NearestContext.getInstance().vors.setFilterCb((fac) => fac.ils === null || (fac.ils !== null && fac.dme !== null));
        });
      });

      this.infoVorNearest.start();
      this.infoNdbNearest.start();
      this.gpsPositionPipe.resume();
    });
  }

  /**
   * Updates the airports within 40 NM.
   * Uses UID keys for disambiguation.
   * @param newAirports The airports that are now within 40 NM.
   */
  private updateAirportsWithin40Nm(newAirports: AirportFacility[]): void {
    const currentAirports = this.airportsWithin40Nm.getArray();

    const currentKeys = new Set<string>();
    for (let i = 0; i < currentAirports.length; i += 1) {
      const key = ICAO.getUid(currentAirports[i].icaoStruct);
      currentKeys.add(key);
    }

    const newKeys = new Set<string>();
    const toAdd: AirportFacility[] = [];

    for (let i = 0; i < newAirports.length; i += 1) {
      const airport = newAirports[i];
      const key = ICAO.getUid(airport.icaoStruct);
      newKeys.add(key);

      if (!currentKeys.has(key)) {
        toAdd.push(airport);
      }
    }

    for (let i = 0; i < currentAirports.length; i += 1) {
      const airport = currentAirports[i];
      const key = ICAO.getUid(airport.icaoStruct);

      if (!newKeys.has(key)) {
        this.airportsWithin40Nm.removeItem(airport);
      }
    }

    if (toAdd.length > 0) {
      this.airportsWithin40Nm.insertRange(undefined, toAdd);
    }
  }

  /**
   * Updates the mixed waypoints (airports, NDBs, VORs) within 40 NM.
   * Uses ICAO UID for unique identification.
   * @param newWaypoints The waypoints that are now within 40 NM.
   */
  private updateWaypointsWithin40Nm(newWaypoints: Facility[]): void {
    const currentWaypoints = this.waypointsWithin40Nm.getArray();

    const currentKeys = new Set<string>();
    for (let i = 0; i < currentWaypoints.length; i += 1) {
      const key = ICAO.getUid(currentWaypoints[i].icaoStruct);
      currentKeys.add(key);
    }

    const newKeys = new Set<string>();
    const toAdd: Facility[] = [];

    for (let i = 0; i < newWaypoints.length; i += 1) {
      const fac = newWaypoints[i];
      const key = ICAO.getUid(fac.icaoStruct);
      newKeys.add(key);

      if (!currentKeys.has(key)) {
        toAdd.push(fac);
      }
    }

    for (let i = 0; i < currentWaypoints.length; i += 1) {
      const fac = currentWaypoints[i];
      const key = ICAO.getUid(fac.icaoStruct);

      if (!newKeys.has(key)) {
        this.waypointsWithin40Nm.removeItem(fac);
      }
    }

    if (toAdd.length > 0) {
      this.waypointsWithin40Nm.insertRange(undefined, toAdd);
    }
  }

  /**
   * Gets nearby navaids for an airport.
   * @param airport The airport facility.
   * @returns The nearby navaids with distance and bearing information.
   */
  public async getNearbyNavaidsForAirport(airport: AirportFacility): Promise<NearbyNavaidInfo[]> {
    const fix = new GeoPoint(airport.lat, airport.lon);
    const searchRadiusMeters = UnitType.NMILE.convertTo(
      IfdNearestContext.NEARBY_NAVAID_RADIUS_NM,
      UnitType.METER
    );

    // Run nearest searches centred at the airport
    await Promise.all([
      this.infoVorNearest.update(
        airport.lat,
        airport.lon,
        searchRadiusMeters,
        IfdNearestContext.NEARBY_NAVAID_MAX_RESULTS
      ),
      this.infoNdbNearest.update(
        airport.lat,
        airport.lon,
        searchRadiusMeters,
        IfdNearestContext.NEARBY_NAVAID_MAX_RESULTS
      )
    ]);

    const maxDistanceRad = UnitType.GA_RADIAN.convertFrom(
      IfdNearestContext.NEARBY_NAVAID_RADIUS_NM,
      UnitType.NMILE
    );

    const all: (VorFacility | NdbFacility)[] = [];

    // Collect NDBs
    const ndbArray = this.infoNdbNearest.getArray();
    for (let i = 0; i < ndbArray.length; i += 1) {
      const fac = ndbArray[i];
      const distance = fix.distance(fac.lat, fac.lon);

      if (distance <= maxDistanceRad) {
        all.push(fac);
      }
    }

    // Collect VORs (only selected types)
    const vorArray = this.infoVorNearest.getArray();
    for (let i = 0; i < vorArray.length; i += 1) {
      const fac = vorArray[i];

      let isSupportedType = false;

      switch (fac.type) {
        case VorType.VOR:
        case VorType.VORTAC:
        case VorType.TACAN:
        case VorType.VORDME:
        case VorType.DME:
          isSupportedType = true;
          break;
        default:
          break;
      }

      if (!isSupportedType) {
        continue;
      }

      const distance = fix.distance(fac.lat, fac.lon);

      if (distance <= maxDistanceRad) {
        all.push(fac);
      }
    }

    const mapped: NearbyNavaidInfo[] = [];

    for (let i = 0; i < all.length; i += 1) {
      const fac = all[i];
      const distanceRad = fix.distance(fac.lat, fac.lon);
      const distanceNm = UnitType.NMILE.convertFrom(distanceRad, UnitType.GA_RADIAN);
      const bearingDeg = fix.bearingTo(fac.lat, fac.lon);
      const cardinal = IfdNearestContext.bearingToCardinal(bearingDeg);
      const freqMHz = fac.freqMHz;

      mapped.push({
        facility: fac,
        distanceNm,
        bearingDeg,
        cardinal,
        freqMHz
      });
    }

    mapped.sort((a, b) => a.distanceNm - b.distanceNm);

    if (mapped.length > IfdNearestContext.NEARBY_NAVAID_MAX_RESULTS) {
      mapped.length = IfdNearestContext.NEARBY_NAVAID_MAX_RESULTS;
    }

    return mapped;
  }

  /**
   * Converts a bearing in degrees to a cardinal direction string.
   * @param bearingDeg Bearing in degrees.
   * @returns The cardinal direction string.
   */
  private static bearingToCardinal(bearingDeg: number): string {
    const index = Math.round(bearingDeg / 45) & 7;
    return IfdNearestContext.CARDINALS[index];
  }
}

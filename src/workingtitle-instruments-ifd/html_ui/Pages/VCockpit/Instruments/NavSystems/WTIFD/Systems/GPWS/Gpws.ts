import {
  AirportClassMask, AirportFacility, ClockEvents, ConsumerSubject, ConsumerValue, EventBus, FacilityLoader, GeoPoint, GeoPointInterface, GNSSEvents,
  MappedSubject, MultiExpSmoother, NearestAirportSubscription, ObjectSubject, OneWayRunway, RegisteredSimVarUtils, RunwaySurfaceType, RunwayUtils,
  SimVarValueType, Subject, Subscription, UnitType
} from '@microsoft/msfs-sdk';

import { IfdOptions } from '../../IfdOptions';
import { IfdPowerEvents } from '../../Misc/IfdPowerMonitor';
import { AirGroundEvents } from '../../Navigation/AirGroundMonitor';
import { TerrainUserSettings } from '../../Settings/TerrainUserSettings';
import { GnssNavigationState, GnssReceiverEvents } from '../Gnss/GnssTypes';
import { GpwsEvents } from './GpwsEvents';
import { GpwsData, GpwsModule } from './GpwsModule';
import { GpwsOperatingMode } from './GpwsTypes';

/**
 * A GPWS system.
 */
export class Gpws {
  private static readonly SELF_TEST_DURATION = 8;

  private static readonly NEAREST_AIRPORT_UPDATE_INTERVAL = 5000; // milliseconds
  private static readonly NEAREST_AIRPORT_RADIUS_METERS = UnitType.NMILE.convertTo(5, UnitType.METER);
  private static readonly NEAREST_AIRPORT_RADIUS_GAR = UnitType.NMILE.convertTo(5, UnitType.GA_RADIAN);
  private static readonly RUNWAY_NO_WATER_MASK = ~(
    1 << RunwaySurfaceType.WaterFSX
    | 1 << RunwaySurfaceType.Lake
    | 1 << RunwaySurfaceType.Ocean
    | 1 << RunwaySurfaceType.Pond
    | 1 << RunwaySurfaceType.River
    | 1 << RunwaySurfaceType.WasteWater
    | 1 << RunwaySurfaceType.Water
  );

  private static readonly LOW_GO_AROUND_HEIGHT = 245;
  private static readonly LOW_GO_AROUND_APPROACH_VS = -400;
  private static readonly LOW_GO_AROUND_TAKEOFF_VS = 500;

  private static readonly NEAREST_RUNWAY_REFRESH_INTERVAL = 5000; // milliseconds

  private readonly operatingModeLocalVar = RegisteredSimVarUtils.create(`L:1:WT_IFD_${this.ifdOptions.instrumentIndex}_TAWS_MODE`, SimVarValueType.Enum);

  private readonly sub = this.bus.getSubscriber<GNSSEvents & GnssReceiverEvents & IfdPowerEvents>();

  private readonly publisher = this.bus.getPublisher<GpwsEvents>();

  private readonly modules: GpwsModule[] = [];

  private readonly operatingMode = Subject.create(GpwsOperatingMode.Off);

  private readonly simRate = ConsumerValue.create(null, 1);

  private readonly isOnGround = ConsumerValue.create(null, false);

  private readonly gpsPos = new GeoPoint(0, 0);

  private readonly aglAltitudeSmoother = new MultiExpSmoother(2000 / Math.LN2, 1000 / Math.LN2, undefined, null, null, null, 10000);

  private readonly verticalSpeedTakeoffSmoother = new MultiExpSmoother(5 / Math.LN2, undefined, undefined, null, null, null, 10000);

  private readonly gnssAltitudeFeet = ConsumerSubject.create(this.sub.on('gnss_altitude_ft'), null);
  private readonly groundAltitudeFeet = ConsumerSubject.create(this.sub.on('ground_altitude'), 0);

  private readonly planeAltAglFeet = MappedSubject.create(
    ([gnssFeet, groundFeet]) => gnssFeet === null ? null : Math.round(gnssFeet - groundFeet),
    this.gnssAltitudeFeet,
    this.groundAltitudeFeet,
  );

  private readonly fltaInhibitLocalVar = RegisteredSimVarUtils.createBoolean(`L:1:WT_IFD_${this.ifdOptions.instrumentIndex}_TAWS_FLTA_INHIBIT`);

  private readonly data: GpwsData = {
    isOnGround: false,
    isTakeoff: false,
    isPosValid: false,
    gpsPos: this.gpsPos.readonly,
    geoAltitude: 0,
    geoVerticalSpeed: 0,
    isAglAltitudeValid: false,
    aglAltitude: 0,
    nearestRunwayAltitude: null,
    nearestRunwayDistance: null,
    inhibits: {
      terrain: false,
    }
  };

  private readonly publishedData = ObjectSubject.create({
    gpws_operating_mode: GpwsOperatingMode.Off,
    gpws_is_pos_valid: false,
    gpws_geo_altitude: 0,
    gpws_geo_vertical_speed: 0,
    gpws_nearest_runway_altitude: null as number | null
  });

  /** How long the IFD has been powered on in seconds, or negative if not powered on. */
  private readonly poweredOnTime = ConsumerSubject.create(this.sub.on('ifd_powered_on_time'), -1);

  private readonly nearestSubscription: NearestAirportSubscription;
  private lastNearestSubscriptionUpdateTime: number | undefined = undefined;

  private nearestAirport: AirportFacility | undefined = undefined;
  private nearestAirportRunways: OneWayRunway[] | undefined = undefined;
  private lastNearestRunwayRefreshTime: number | undefined = undefined;

  private lastUpdateRealTime: number | undefined = undefined;

  private isAlive = true;
  private isInit = false;

  private fmsPosIndexSub?: Subscription;
  private fmsPosModeSub?: Subscription;
  private gpsPosSub?: Subscription;
  private updateSub?: Subscription;

  /**
   * Creates a new instance of Gpws.
   * @param bus The event bus.
   * @param facLoader The facility loader.
   * @param ifdOptions The IFD configuration.
   */
  constructor(
    private readonly bus: EventBus,
    facLoader: FacilityLoader,
    private readonly ifdOptions: IfdOptions,
  ) {
    this.nearestSubscription = new NearestAirportSubscription(facLoader);
    this.nearestSubscription.start().then(() => {
      this.nearestSubscription.setFilter(false, AirportClassMask.HardSurface | AirportClassMask.SoftSurface);
      this.nearestSubscription.setExtendedFilters(Gpws.RUNWAY_NO_WATER_MASK, ~0, ~0, 0);
    });

    this.operatingMode.sub(this.publishedData.set.bind(this.publishedData, 'gpws_operating_mode'), true);

    this.publishedData.sub(this.onPublishedDataChanged.bind(this), true);
  }

  /**
   * Adds a module to this system.
   * @param module The module to add.
   * @returns This system, after the module has been added.
   */
  public addModule(module: GpwsModule): this {
    this.modules.push(module);

    if (this.isInit) {
      module.onInit();
    }

    return this;
  }

  /**
   * Initializes this system. Once this system is initialized, it will begin collecting data and updating its modules.
   * @throws Error if this system has been destroyed.
   */
  public init(): void {
    if (!this.isAlive) {
      throw new Error('Gpws: cannot initialize a dead system');
    }

    if (this.isInit) {
      return;
    }

    this.isInit = true;

    const sub = this.bus.getSubscriber<AirGroundEvents & ClockEvents & GnssReceiverEvents>();

    this.simRate.setConsumer(sub.on('simRate'));

    this.isOnGround.setConsumer(sub.on('air_ground_on_ground'));

    this.sub.on('gnss_navigation_state').handle((v) => {
      this.data.isPosValid = v === GnssNavigationState.FdeNav || v === GnssNavigationState.SbasNav;
      this.publishedData.set('gpws_is_pos_valid', this.data.isPosValid);
    });

    this.sub.on('gnss_position').handle((v) => {
      this.gpsPos.set(v.lat, v.long);
    });

    this.sub.on('gnss_vertical_speed_fpm').handle((v) => {
      this.data.geoVerticalSpeed = v ?? 0;
      this.publishedData.set('gpws_geo_vertical_speed', this.data.geoVerticalSpeed);
    });

    this.sub.on('gnss_altitude_ft').handle((v) => {
      this.data.geoAltitude = v ?? 0;
      this.publishedData.set('gpws_geo_altitude', this.data.geoAltitude);
    });

    // Write the operating mode to an LVar so external annunciators can show correct self-test state etc.
    this.operatingMode.sub((v) => this.operatingModeLocalVar.set(v), true);

    for (let i = 0; i < this.modules.length; i++) {
      this.modules[i].onInit();
    }

    this.updateSub = sub.on('simTime').whenChanged().handle(this.update.bind(this));
  }

  /**
   * Responds when a data value to be published changes.
   * @param data An object containing all published data values.
   * @param topic The topic to publish.
   * @param value The data value to publish.
   */
  private onPublishedDataChanged(data: any, topic: keyof GpwsEvents, value: any): void {
    this.publisher.pub(topic, value, false, true);
  }

  /**
   * Updates this system.
   * @param simTime The current sim time, as a UNIX timestamp in milliseconds.
   */
  private update(simTime: number): void {
    const poweredOnTime = this.poweredOnTime.get();
    const prevOperatingMode = this.operatingMode.get();
    if (poweredOnTime < 0) {
      this.operatingMode.set(GpwsOperatingMode.Off);
    } else if (prevOperatingMode === GpwsOperatingMode.Off && poweredOnTime >= 0) {
      this.operatingMode.set(GpwsOperatingMode.Test);
    } else if (prevOperatingMode === GpwsOperatingMode.Test && poweredOnTime > Gpws.SELF_TEST_DURATION) {
      this.operatingMode.set(GpwsOperatingMode.Normal);
    }

    this.data.inhibits.terrain = !this.ifdOptions.enableFlta || this.fltaInhibitLocalVar.get() || !TerrainUserSettings.getManager(this.bus).getSetting('fltaEnabled').get();
    this.publisher.pub('gpws_terrain_enabled', !this.data.inhibits.terrain, false, true);

    const realTime = Date.now();
    const simRate = this.simRate.get();
    const dt = Math.min(realTime - (this.lastUpdateRealTime ?? realTime), 1000) * simRate;

    this.data.isOnGround = this.isOnGround.get();

    const aglAlt = this.planeAltAglFeet.get();
    this.data.isAglAltitudeValid = aglAlt !== null;
    if (aglAlt !== null) {
      this.data.aglAltitude = this.aglAltitudeSmoother.next(aglAlt, dt);
    } else {
      this.aglAltitudeSmoother.reset();
      this.data.aglAltitude = 0;
    }

    const operatingMode = this.operatingMode.get();

    this.updateTakeoffState(dt);
    this.updateNearestAirportSubscription(realTime, this.data.gpsPos);
    this.updateNearestAirport(realTime);

    for (let i = 0; i < this.modules.length; i++) {
      this.modules[i].onUpdate(operatingMode, this.data, realTime, simTime, simRate);
    }

    this.lastUpdateRealTime = realTime;
  }

  /**
   * Updates the GPWS takeoff (or low go-around) state
   * @param dt The change in time since the last update
   */
  private updateTakeoffState(dt: number): void {
    const smoothedVs = this.verticalSpeedTakeoffSmoother.next(this.data.geoVerticalSpeed, dt / 1000);

    if (this.isOnGround.get() === true) {
      this.data.isTakeoff = true;
      return;
    }

    const radarAlt = this.data.aglAltitude;
    if (!this.data.isAglAltitudeValid || radarAlt > 1500) {
      // If radar altitude is above 1500ft then we assume the aircraft to have left the takeoff region
      this.data.isTakeoff = false;
    } else if (
      this.data.isTakeoff === false && radarAlt < Gpws.LOW_GO_AROUND_HEIGHT &&
      smoothedVs < Gpws.LOW_GO_AROUND_APPROACH_VS && this.data.geoVerticalSpeed > Gpws.LOW_GO_AROUND_TAKEOFF_VS
    ) {
      // We also need to account for low go-arounds, we do this by comparing a smoothed vertical speed (with ~5s of delay)
      // against the current vertical speed
      this.data.isTakeoff = true;
    }
  }

  /**
   * Updates this system's nearest airport subscription, if necessary.
   * @param realTime The current real (operating system) time, as a UNIX timestamp in milliseconds.
   * @param position The current position of the airplane.
   */
  private updateNearestAirportSubscription(realTime: number, position: GeoPointInterface): void {
    if (
      this.nearestSubscription.started && this.data.isPosValid && this.gpsPos.isValid() && (
        this.lastNearestSubscriptionUpdateTime === undefined
        || realTime - this.lastNearestSubscriptionUpdateTime >= Gpws.NEAREST_AIRPORT_UPDATE_INTERVAL
      )
    ) {
      this.nearestSubscription.update(position.lat, position.lon, Gpws.NEAREST_AIRPORT_RADIUS_METERS, 1);
      this.lastNearestSubscriptionUpdateTime = realTime;
    }
  }

  /**
   * Updates the nearest airport (and if necessary, the nearest runway) to the airplane.
   * @param realTime The current real (operating system) time, as a UNIX timestamp in milliseconds.
   */
  private updateNearestAirport(realTime: number): void {
    if (this.data.isPosValid) {
      // Refresh nearest airport
      const nearestAirport = this.nearestSubscription.tryGet(0);
      // Sometimes the nearest search retains airports that are outside the search radius, so we need to check the
      // distance to the airport ourselves.
      if (nearestAirport && this.data.gpsPos.distance(nearestAirport) <= Gpws.NEAREST_AIRPORT_RADIUS_GAR) {
        this.updateNearestRunway(realTime, nearestAirport);
      } else {
        this.nearestAirport = undefined;
        this.nearestAirportRunways = undefined;
        this.data.nearestRunwayAltitude = null;
        this.data.nearestRunwayDistance = null;
      }
    } else {
      this.data.nearestRunwayAltitude = null;
      this.data.nearestRunwayDistance = null;
    }

    this.publishedData.set('gpws_nearest_runway_altitude', this.data.nearestRunwayAltitude);
  }

  /**
   * Updates the nearest runway to the airplane.
   * @param realTime The current real (operating system) time, as a UNIX timestamp in milliseconds.
   * @param nearestAirport The nearest airport to the airplane.
   */
  private updateNearestRunway(realTime: number, nearestAirport: AirportFacility): void {
    if (nearestAirport.icao !== this.nearestAirport?.icao) {
      this.nearestAirport = nearestAirport;
      this.nearestAirportRunways = RunwayUtils.getOneWayRunwaysFromAirport(nearestAirport);
      this.lastNearestRunwayRefreshTime = undefined;
    }

    if (this.lastNearestRunwayRefreshTime === undefined || realTime - this.lastNearestRunwayRefreshTime >= Gpws.NEAREST_RUNWAY_REFRESH_INTERVAL) {
      this.lastNearestRunwayRefreshTime = realTime;

      let nearestDistance = Infinity;
      let nearestRunway: OneWayRunway | undefined = undefined;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const runways = this.nearestAirportRunways!;
      for (let i = 0; i < runways.length; i++) {
        const runway = runways[i];
        const distance = this.data.gpsPos.distance(runway.latitude, runway.longitude);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestRunway = runway;
        }
      }

      if (nearestRunway) {
        this.data.nearestRunwayAltitude = UnitType.METER.convertTo(nearestRunway.elevation, UnitType.FOOT);
        this.data.nearestRunwayDistance = UnitType.GA_RADIAN.convertTo(nearestDistance, UnitType.NMILE);
      } else {
        this.data.nearestRunwayAltitude = null;
      }
    }
  }

  /**
   * Destroys this system.
   */
  public destroy(): void {
    this.isAlive = false;

    this.isOnGround.destroy();

    this.fmsPosIndexSub?.destroy();
    this.fmsPosModeSub?.destroy();
    this.gpsPosSub?.destroy();
    this.updateSub?.destroy();

    for (let i = 0; i < this.modules.length; i++) {
      this.modules[i].onDestroy();
    }
  }
}

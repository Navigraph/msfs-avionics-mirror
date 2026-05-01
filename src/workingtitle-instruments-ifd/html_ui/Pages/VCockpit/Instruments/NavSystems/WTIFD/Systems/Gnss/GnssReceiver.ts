import {
  ArrayUtils, AvionicsSystemState, BasicAvionicsSystem, ClockEvents, ConsumerSubject, EventBus, ExpSmoother, GameStateProvider, GeoPoint, GPSSatComputer,
  GPSSatComputerEvents, GPSSatelliteState, GPSSystemState, NavMath, RegisteredSimVarUtils, SBASGroupName, SetSubject, SimVarValueType, Subject, Subscribable,
  Subscription, UnitType, Vec2Math, Vec3Math, Wait
} from '@microsoft/msfs-sdk';

import { IfdStartupEvents } from '../../Misc/IfdStartupManager';
import { GnssErrorModel } from './GnssErrorModel';
import { GnssNavigationMode, GnssNavigationState as GnssNavigationState, GnssReceiverControlEvents, GnssReceiverEvents, GnssSatelliteData } from './GnssTypes';

/**
 * A GNSS receiver unit based on the IFD internal GPS receiver.
 */
export class GnssReceiver extends BasicAvionicsSystem<GnssReceiverEvents> {
  private static readonly NULLABLE_NAV_LABELS: Array<keyof GnssReceiverEvents> = [
    'gnss_altitude_ft',
    'gnss_raw_altitude_ft',
    'gnss_utc_time',
    'gnss_number_of_satellites',
    'gnss_track_true_deg',
    'gnss_ground_speed_kts',
    'gnss_ground_speed_ns_kts',
    'gnss_ground_speed_ew_kts',
    'gnss_vertical_speed_fpm',
    'gnss_hdop',
    'gnss_vdop',
    'gnss_hfom_m',
    'gnss_vfom_m',
    'gnss_hul_m',
    'gnss_vul_m',
    'gnss_hpl_m',
    'gnss_vpl_m',
    'gnss_hal_m',
    'gnss_val_m',
    'gnss_sbas_group_in_use',
    'gnss_navigation_mode'
  ];
  private static readonly LATLON_LABELS: Array<keyof GnssReceiverEvents> = ['gnss_position', 'gnss_raw_position'];
  private static readonly NAV_PUBLISH_MODES: Array<GnssNavigationState | null> = [GnssNavigationState.BasicNav, GnssNavigationState.FdeNav, GnssNavigationState.SbasNav];
  private static readonly SAT_IN_USE_STATES = [GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied];

  private static readonly GPS_COMPUTER_UPDATE_INTERVAL_MS = 5000;
  private static readonly MIN_TRACK_GROUND_SPEED_KTS = 20;
  private static readonly TIME_JUMP_THRESHOLD_MS = 10 * 60 * 1000;

  private static readonly HAL_ENROUTE = UnitType.METER.convertFrom(2, UnitType.NMILE);
  private static readonly HAL_APPROACH = UnitType.METER.convertFrom(0.3, UnitType.NMILE);

  protected initializationTime = 5_000;

  private readonly isHotStart = ConsumerSubject.create(this.bus.getSubscriber<IfdStartupEvents>().on('ifd_startup_hot_start'), false);

  private readonly _navigationState = Subject.create<GnssNavigationState | null>(null);
  public readonly navigationState: Subscribable<GnssNavigationState | null> = this._navigationState;
  private readonly enabledSbasGroups = SetSubject.create<SBASGroupName>();
  private readonly estimatedPos = new GeoPoint(0, 0);
  private readonly rawEstimatedPos = new GeoPoint(0, 0);
  private readonly errorModel = new GnssErrorModel();
  private readonly positionErrorCache: Float64Array = Vec2Math.create();
  private readonly vec3Cache = ArrayUtils.create(2, () => Vec3Math.create());
  private readonly truePos = new GeoPoint(0, 0);
  private readonly xErrorFilter = new ExpSmoother(10000 / Math.LN2);
  private readonly yErrorFilter = new ExpSmoother(10000 / Math.LN2);
  private readonly altitudeErrorFilter = new ExpSmoother(10000);

  private isInit = false;
  private prevIsHealthy = false;
  private prevSimDuration: number | undefined = undefined;
  private prevUtcTime: number | undefined = undefined;
  private countSatsInUse = 0;

  private readonly navigationMode = Subject.create(GnssNavigationMode.Enroute);
  private readonly navigationModeSub: Subscription;

  // Although we just have the single GPS receiver, and the sync role is none,
  // the GPSSatComputer still publishes with sync, so we have to make sure we use
  // an index that is unique to this instrument.
  private readonly gpsComputer = new GPSSatComputer(
    this.instrumentIndex,
    this.bus,
    'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Data/gps_ephemeris.json',
    'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Data/gps_sbas.json',
    GnssReceiver.GPS_COMPUTER_UPDATE_INTERVAL_MS,
    this.enabledSbasGroups,
    'none',
    {
      channelCount: 16,
      sbasChannelCount: 3,
    }
  );

  private readonly latitudeSimvar = RegisteredSimVarUtils.create('PLANE LATITUDE', SimVarValueType.Degree);
  private readonly longitudeSimvar = RegisteredSimVarUtils.create('PLANE LONGITUDE', SimVarValueType.Degree);
  private readonly altitudeSimvar = RegisteredSimVarUtils.create('PLANE ALTITUDE', SimVarValueType.Feet);
  private readonly worldVelocityXSimvar = RegisteredSimVarUtils.create('VELOCITY WORLD X', SimVarValueType.MetersPerSecond);
  private readonly worldVelocityYSimvar = RegisteredSimVarUtils.create('VELOCITY WORLD Y', SimVarValueType.MetersPerSecond);
  private readonly worldVelocityZSimvar = RegisteredSimVarUtils.create('VELOCITY WORLD Z', SimVarValueType.MetersPerSecond);
  private readonly simUtcTime = ConsumerSubject.create(this.bus.getSubscriber<ClockEvents>().on('simTime'), -1);
  private readonly simDuration = ConsumerSubject.create(this.bus.getSubscriber<ClockEvents>().on('activeSimDuration'), -1);

  /**
   * Creates an instance of a GNSS unit.
   * @param instrumentIndex The instrument index. Must be unique on each instrument.
   * @param bus The event bus to use with this instance.
   * @param isPowered Whether the receiver is powered.
   * @param enableSbas Whether to enable SBAS reception.
   */
  constructor(private readonly instrumentIndex: number, bus: EventBus, isPowered: Subscribable<boolean>, enableSbas: boolean) {
    super(1, bus, 'gnss_receiver_state');

    if (enableSbas) {
      this.enabledSbasGroups.set(Object.values(SBASGroupName));
    }

    this._navigationState.sub((state) => this.publisher.pub('gnss_navigation_state', state), true);
    this.navigationModeSub = this.navigationMode.sub((mode) => this.publisher.pub('gnss_navigation_mode', mode), true, true);

    // Subscribe to low frequency GPS computer events.
    const gpsComputerEvents = this.bus.getSubscriber<GPSSatComputerEvents>();
    gpsComputerEvents.on(`gps_system_state_changed_${this.instrumentIndex}`).handle(this.onGpsComputerStateChanged.bind(this));
    gpsComputerEvents.on(`gps_sat_state_changed_${this.instrumentIndex}`).handle(this.onGpsSatStateChanged.bind(this));

    // Subscribe to receiver control events.
    const gnssEvents = this.bus.getSubscriber<GnssReceiverControlEvents>();
    gnssEvents.on('gnss_receiver_set_navigation_mode').handle((navSpec) => {
      this.navigationMode.set(navSpec);
    });
    gnssEvents.on('gnss_receiver_set_desired_val_m').handle((val) => {
      this.publish('gnss_val_m', val);
    });

    this.connectToPower(isPowered);

    // Make sure the power state/flt file is loaded and everything is setup before we start
    Wait.awaitSubscribable(GameStateProvider.get(), (v) => v === GameState.ingame, true).then(() => Wait.awaitFrames(2).then(() => this.init()));
  }

  /**
   * Initializes the GNSS receiver.
   */
  public init(): void {
    this.gpsComputer.init();

    // Initially publish all values as failed
    this.publishAllNavAsInvalid();

    this.onGpsComputerStateChanged(this.gpsComputer.systemState.get());
    this.onGpsSatStateChanged();

    this.isHotStart.sub((hot) => {
      if (hot) {
        // eslint-disable-next-line no-console
        console.log('[GnssReceiver] Hot-start with sats acquired');
        this.setState(AvionicsSystemState.On);
        this.gpsComputer.acquireAndUseSatellites();
      }
    }, true);

    this.isInit = true;
  }

  /**
   * Updates the GNSS receiver.
   */
  public onUpdate(): void {
    super.onUpdate();

    if (!this.isInit) {
      return;
    }

    const isHealthy = this.state === AvionicsSystemState.On || this.state === AvionicsSystemState.Initializing;
    if (!isHealthy) {
      if (this.prevIsHealthy) {
        // The GNSS receiver has just been turned off.
        this.reset();
        this.publishAllNavAsInvalid();
      }

      return;
    } else if (!this.prevIsHealthy) {
      this.navigationModeSub.resume(true);
    }

    // NOTE: simDuration is used for the delta time as it has a much higher resolution (sub-ms) than simTime.
    const simDuration = this.simDuration.get();
    const dt = this.prevSimDuration !== undefined ? simDuration - this.prevSimDuration : undefined;

    this.prevSimDuration = simDuration;

    if (dt === undefined || dt === 0) {
      return;
    }

    const utcTime = this.simUtcTime.get();
    const dtUtc = this.prevUtcTime !== undefined ? utcTime - this.prevUtcTime : undefined;

    this.prevUtcTime = utcTime;

    const mode = this._navigationState.get();

    if (dtUtc !== undefined && Math.abs(dtUtc) > GnssReceiver.TIME_JUMP_THRESHOLD_MS && GnssReceiver.NAV_PUBLISH_MODES.includes(mode)) {
      // The UTC time changed by more than 10 minutes, likely due to the user changing the simulator time, meaning it's possible that the
      // fix will be lost. That behavior is not expected when simply changing the simulator time, so reacquire the fix immediately.
      this.gpsComputer.acquireAndUseSatellites();
    }

    if (mode !== GnssNavigationState.Init && mode !== GnssNavigationState.Fault) {
      this.gpsComputer.onUpdate();
    }

    this.publish('gnss_hal_m', this.navigationMode.get() === GnssNavigationMode.Approach ? GnssReceiver.HAL_APPROACH : GnssReceiver.HAL_ENROUTE);

    this.updateMode();

    if (GnssReceiver.NAV_PUBLISH_MODES.includes(mode)) {
      this.updateAndPublishUncertainties();

      this.truePos.set(this.latitudeSimvar.get(), this.longitudeSimvar.get());
      this.computePositionEstimate(this.truePos, dt, this.rawEstimatedPos, this.estimatedPos);

      this.publish('gnss_position', { lat: this.estimatedPos.lat, long: this.estimatedPos.lon });
      this.publish('gnss_raw_position', { lat: this.rawEstimatedPos.lat, long: this.rawEstimatedPos.lon });

      const trueAlt = this.altitudeSimvar.get();
      const altError = UnitType.METER.convertTo(this.errorModel.sampleAltitudeError(), UnitType.FOOT);
      const rawEstimatedAlt = trueAlt + altError;
      const filteredAltError = this.altitudeErrorFilter.next(altError, dt);
      const estimatedAlt = trueAlt + filteredAltError;

      this.publish('gnss_altitude_ft', estimatedAlt);
      this.publish('gnss_raw_altitude_ft', rawEstimatedAlt);

      this.publish('gnss_utc_time', utcTime);

      this.computeAndPublishVelocities();

      this.publish('gnss_hdop', this.gpsComputer.hdopValue.get());
      this.publish('gnss_vdop', this.gpsComputer.vdopValue.get());
    } else {
      this.publishAllNavAsInvalid();
    }

    this.prevIsHealthy = isHealthy;
    this.prevSimDuration = simDuration;
  }

  /**
   * Updates the mode based on the current state, and the number of satellites in use.
   */
  public updateMode(): void {
    if (!this.prevIsHealthy) {
      // The GNSS receiver has just powered on.
      this._navigationState.set(GnssNavigationState.Init);
    }

    // NOTE: Transitions _to_ Navigation and SBAS modes are handled in `onGpsComputerStateChanged`.
    switch (this._navigationState.get()) {
      case GnssNavigationState.Init:
        if (this.state === AvionicsSystemState.On) {
          this.onGpsComputerStateChanged(this.gpsComputer.systemState.get());
        }
        break;
      case GnssNavigationState.FdeNav:
      case GnssNavigationState.SbasNav:
        if (this.countSatsInUse < 5) {
          this._navigationState.set(GnssNavigationState.BasicNav);
        }
        break;
      case GnssNavigationState.BasicNav:
        if (this.countSatsInUse >= 5) {
          this.onGpsComputerStateChanged(this.gpsComputer.systemState.get());
        }
        break;
    }
  }

  /**
   * Handles when GPS computer state changes.
   * @param gpsState The new GPS computer state.
   */
  private onGpsComputerStateChanged(gpsState: GPSSystemState): void {
    if (this.state !== AvionicsSystemState.On) {
      return;
    }

    if (gpsState === GPSSystemState.SolutionAcquired) {
      this._navigationState.set(GnssNavigationState.FdeNav);
      // Ensure satellite information is published immediately.
      this.onGpsSatStateChanged();
    } else if (gpsState === GPSSystemState.DiffSolutionAcquired) {
      this._navigationState.set(GnssNavigationState.SbasNav);
      // Ensure satellite information is published immediately.
      this.onGpsSatStateChanged();
    } else if (gpsState === GPSSystemState.Acquiring || gpsState === GPSSystemState.Searching) {
      this._navigationState.set(GnssNavigationState.Search);
    }
  }

  /**
   * Handles the GPS satellite state changed event.
   */
  private onGpsSatStateChanged(): void {
    const satellites = this.gpsComputer.getSatellites();

    this.countSatsInUse = satellites.reduce((count, sat) => GnssReceiver.SAT_IN_USE_STATES.includes(sat.state.get()) ? count + 1 : count, 0);

    const sbasSatInUse = satellites.find((sat) => sat.sbasGroup && sat.areDiffCorrectionsDownloaded && GnssReceiver.SAT_IN_USE_STATES.includes(sat.state.get()));

    const satelliteData: GnssSatelliteData[] = satellites.map((sat) => ({
      state: sat.state.get(),
      prn: sat.prn,
      position: Array.from(sat.position.get()),
      positionCartesian: Array.from(sat.positionCartesian.get()),
      signalStrength: sat.signalStrength.get(),
      sbasGroup: sat.sbasGroup,
      areDiffCorrectionsDownloaded: sat.areDiffCorrectionsDownloaded,
    }));

    this.publish('gnss_sbas_group_in_use', sbasSatInUse?.sbasGroup ?? null);
    this.publish('gnss_number_of_satellites', this.countSatsInUse);
    this.publish('gnss_satellite_data', satelliteData);
  }

  /**
   * Publishes all nav labels as invalid.
   */
  private publishAllNavAsInvalid(): void {
    for (const label of GnssReceiver.NULLABLE_NAV_LABELS) {
      this.publisher.pub(label, null);
    }
    for (const label of GnssReceiver.LATLON_LABELS) {
      this.publisher.pub(label, { lat: NaN, long: NaN });
    }
    this.publisher.pub('gnss_satellite_data', []);
  }

  /**
   * Publishes a single label with the given value. If the value is undefined, it will be published as NCD, otherwise it will be published
   * as Normal.
   * @param label The label to publish.
   * @param value The value to publish, or undefined.
   */
  private publish<K extends keyof GnssReceiverEvents>(label: K, value: GnssReceiverEvents[K]): void {
    this.publisher.pub(label, value);
  }

  /**
   * Computes the position estimate based on the present uncertainty.
   * @param truePos The true position from the simulator.
   * @param dt The time since the last update, in milliseconds.
   * @param outRaw The point to store the raw position estimate in.
   * @param outFiltered The point to store the filtered position estimate in.
   */
  private computePositionEstimate(truePos: GeoPoint, dt: number, outRaw: GeoPoint, outFiltered: GeoPoint): void {
    const error = this.errorModel.samplePositionError(this.positionErrorCache);
    const bearing = UnitType.RADIAN.convertTo(Math.atan2(error[1], error[0]), UnitType.DEGREE);

    outRaw.set(truePos);
    outRaw.offset(bearing, UnitType.METER.convertTo(Math.hypot(error[0], error[1]), UnitType.GA_RADIAN));

    Vec2Math.set(this.xErrorFilter.next(error[0], dt), this.yErrorFilter.next(error[1], dt), error);
    const filteredBearing = UnitType.RADIAN.convertTo(Math.atan2(error[1], error[0]), UnitType.DEGREE);

    outFiltered.set(truePos);
    outFiltered.offset(filteredBearing, UnitType.METER.convertTo(Math.hypot(error[0], error[1]), UnitType.GA_RADIAN));
  }

  /**
   * Computes the current velocities and track angle and publishes them on the bus.
   */
  private computeAndPublishVelocities(): void {
    let velocity = this.vec3Cache[0];
    velocity = Vec3Math.set(this.worldVelocityXSimvar.get(), this.worldVelocityZSimvar.get(), this.worldVelocityYSimvar.get(), velocity);

    const error = this.errorModel.sampleVelocityError(this.vec3Cache[1]);
    const rawEstimatedVelocity = Vec3Math.add(velocity, error, velocity);

    const groundSpeed = UnitType.MPS.convertTo(Math.hypot(rawEstimatedVelocity[0], rawEstimatedVelocity[1]), UnitType.KNOT);
    const velocityNS = UnitType.MPS.convertTo(rawEstimatedVelocity[0], UnitType.KNOT);
    const velocityEW = UnitType.MPS.convertTo(rawEstimatedVelocity[1], UnitType.KNOT);
    const verticalSpeed = UnitType.MPS.convertTo(rawEstimatedVelocity[2], UnitType.FPM);

    let track = null;
    if (groundSpeed >= GnssReceiver.MIN_TRACK_GROUND_SPEED_KTS) {
      track = NavMath.normalizeHeading(UnitType.RADIAN.convertTo(Math.atan2(rawEstimatedVelocity[0], rawEstimatedVelocity[1]), UnitType.DEGREE));
    }

    this.publish('gnss_ground_speed_kts', groundSpeed);
    this.publish('gnss_ground_speed_ns_kts', velocityNS);
    this.publish('gnss_ground_speed_ew_kts', velocityEW);
    this.publish('gnss_vertical_speed_fpm', verticalSpeed);
    this.publish('gnss_track_true_deg', track);
  }

  /**
   * Computes the current horizontal and vertical uncertainties (HFOM/VFOM, HUL/VUL and HPL/VPL) and publishes them on the bus.
   */
  private updateAndPublishUncertainties(): void {
    const isSbasInUse = this._navigationState.get() === GnssNavigationState.SbasNav;
    const isFdeAvailable = this.countSatsInUse > 4;

    const uncertainties = this.errorModel.update(this.gpsComputer.covarMatrix.get(), isSbasInUse ? this.navigationMode.get() : undefined);

    this.publish('gnss_hfom_m', uncertainties.hfom);
    this.publish('gnss_vfom_m', uncertainties.vfom);

    this.publish('gnss_hul_m', uncertainties.hul);
    this.publish('gnss_vul_m', uncertainties.vul);

    const hpl = (isSbasInUse || isFdeAvailable) ? uncertainties.hpl : null;
    const vpl = (isSbasInUse || isFdeAvailable) ? uncertainties.vpl : null;

    this.publish('gnss_hpl_m', hpl);
    this.publish('gnss_vpl_m', vpl);
  }

  /**
   * Resets the GNSS receiver.
   */
  private reset(): void {
    this._navigationState.set(null);
    this.navigationModeSub.pause();
    this.enabledSbasGroups.set(Object.values(SBASGroupName));
    this.prevIsHealthy = false;
    this.prevSimDuration = 0;
    this.estimatedPos.set(0, 0);
    this.rawEstimatedPos.set(0, 0);
    this.countSatsInUse = 0;
    this.errorModel.reset();
    Vec2Math.set(0, 0, this.positionErrorCache);
    this.truePos.set(0, 0);
    this.xErrorFilter.reset();
    this.yErrorFilter.reset();
    this.altitudeErrorFilter.reset();
    this.gpsComputer.reset();
  }
}

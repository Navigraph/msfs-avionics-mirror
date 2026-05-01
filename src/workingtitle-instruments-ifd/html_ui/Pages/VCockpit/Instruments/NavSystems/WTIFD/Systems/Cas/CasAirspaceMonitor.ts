import { AirspaceType, ClockEvents, ConsumerValue, EventBus, ExpSmoother, GeoPoint, Instrument, UnitType } from '@microsoft/msfs-sdk';

import { AirGroundEvents } from '../../Navigation/AirGroundMonitor';
import { AlertUserSettings } from '../../Settings/AlertUserSettings';
import { GnssReceiverEvents } from '../Gnss/GnssTypes';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** Type of an airspace crossing. */
interface JS_AirspacesCrossing {
  /** The distance in nautical miles to the crossing, from the first point on the path. */
  dist: number,
  /** 1 if the crossing is entering the airspace, or 0 if exiting. */
  entering: number;
}

/** Type of an airspace profile cut result. */
interface JS_AirspaceProfileCut {
  /** Index in the ATC airspace array. Not stable! */
  index: number;
  /** The name of the airspace. Always empty at the moment... */
  name: string;
  /** The type of the airspace. */
  type: AirspaceType;
  /** The lower altitude bound of the airspace, or 0 if none. */
  altMin: number;
  /** The upper altitude bound of the airspace, or 0 if none. */
  altMax: number;
  /** The boundary crossing of this airspace along the path. */
  crossings: JS_AirspacesCrossing[]
}

/** An active alert airspace. */
type ActiveAlertAirspace = Pick<JS_AirspaceProfileCut, 'type' | 'altMin' | 'altMax'>;

const AirspaceClassNames = new Map<AirspaceType, string>([
  [AirspaceType.Alert, 'Alert Area'],
  [AirspaceType.Center, 'Controlled Airspace'],
  [AirspaceType.ClassA, 'Class A'],
  [AirspaceType.ClassB, 'Class B'],
  [AirspaceType.ClassC, 'Class C'],
  [AirspaceType.ClassD, 'Class D'],
  [AirspaceType.Danger, 'Danger Area'],
  [AirspaceType.MOA, 'MOA'],
  [AirspaceType.Prohibited, 'Prohibited Area'],
  [AirspaceType.Radar, 'Controlled Airspace'],
  [AirspaceType.Restricted, 'Restricted Area'],
  [AirspaceType.Warning, 'Warning Area'],
]);

/** Events published by the airspace monitor. */
export interface CasAirspaceMonitorEvents {
  /** The class name of the current alert airspace. */
  cas_airspace_monitor_class: string;
  /** The name of the current alert airspace. */
  cas_airspace_monitor_name: string;
  /** The lower altitude limit of the current alert airspace in feet, or undefined if surface. */
  cas_airspace_monitor_min_alt: number | undefined;
  /** The upper altitude limit of the current alert airspace in feet, or undefined if not limit. */
  cas_airspace_monitor_max_alt: number | undefined;
}

/** Monitors upcoming airspaces ahead of the aircraft. */
export class CasAirspaceMonitor implements Instrument {
  private static readonly UPDATE_PERIOD_MS = 1120;
  private static readonly INHIBIT_TIME_AFTER_AIRBORNE_MS = 10_000;
  private static readonly LOOKAHEAD_TIME_S = 5 * 60;
  private static readonly ALT_HYSTERESIS_FT = 150;
  // MSFS gives a huge number for unlimited airspace tops
  private static readonly UNLIMITED_AIRSPACE_TOP = 2 ** 31 - 1;

  private static readonly geoPointCache = new GeoPoint(NaN, NaN);
  private static readonly latLongCache = [new LatLong(), new LatLong()];

  private readonly isEnabled = AlertUserSettings.getManager(this.bus).getSetting('controlledAirspaceAlerts');

  private readonly sub = this.bus.getSubscriber<AirGroundEvents & ClockEvents & GnssReceiverEvents>();
  private readonly publisher = this.bus.getPublisher<CasAirspaceMonitorEvents>();

  private readonly simTime = ConsumerValue.create(this.sub.on('simTime'), 0);

  private readonly gnssPos = ConsumerValue.create(this.sub.on('gnss_position'), { lat: NaN, long: NaN });
  private readonly gnssAltitude = ConsumerValue.create(this.sub.on('gnss_altitude_ft'), null);
  private readonly gnssTrueTrack = ConsumerValue.create(this.sub.on('gnss_track_true_deg'), null);
  private readonly gnssGroundSpeed = ConsumerValue.create(this.sub.on('gnss_ground_speed_kts'), null);
  private readonly gnssVerticalVelocity = ConsumerValue.create(this.sub.on('gnss_vertical_speed_fpm'), null);

  private readonly onGround = ConsumerValue.create(this.sub.on('air_ground_on_ground'), false);

  private listenerReady = false;
  private readonly profileListener = RegisterViewListener('JS_LISTENER_PROFILE_CUT', () => this.listenerReady = true, true);

  private nextAirspaceUpdateDue = 0;
  private lastUpdate = 0;

  private readonly vsFilter = new ExpSmoother(5000 / Math.LN2);

  private readonly activeAlertAirspaces: ActiveAlertAirspace[] = [];

  private readonly alertTransporter = casTransporterFactory(this.bus, CasUuid.AirspaceAhead);

  /**
   * Contructs a new instance.
   * @param bus The event bus to use.
   */
  public constructor(private readonly bus: EventBus) { }

  /** @inheritdoc */
  public init(): void {
    this.isEnabled.sub((v) => !v && this.alertTransporter.set(false));
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const simTime = this.simTime.get();
    const dt = this.lastUpdate ? simTime - this.lastUpdate : 0;
    this.lastUpdate = simTime;

    const vs = this.gnssVerticalVelocity.get();
    if (vs !== null) {
      this.vsFilter.next(vs, dt);
    } else {
      this.vsFilter.reset();
    }

    if (this.onGround.get()) {
      this.activeAlertAirspaces.length = 0;
      this.nextAirspaceUpdateDue = simTime + CasAirspaceMonitor.INHIBIT_TIME_AFTER_AIRBORNE_MS;
    } else if (this.isEnabled.get() && simTime >= this.nextAirspaceUpdateDue) {
      this.updateAirspaces().then((success) => success && (this.nextAirspaceUpdateDue = simTime + CasAirspaceMonitor.UPDATE_PERIOD_MS));
    }
  }

  /**
   * Updates the upcoming airspaces, and issues an alert if needed.
   * @returns Whether the update was successful.
   */
  private async updateAirspaces(): Promise<boolean> {
    const gnssPos = this.gnssPos.get();
    const gnssAltFt = this.gnssAltitude.get();
    const gnssTrack = this.gnssTrueTrack.get();
    const gnssGroundSpeed = this.gnssGroundSpeed.get();

    CasAirspaceMonitor.geoPointCache.set(gnssPos.lat, gnssPos.long);

    if (!CasAirspaceMonitor.geoPointCache.isValid() || gnssAltFt === null || gnssTrack === null || gnssGroundSpeed === null || !this.listenerReady) {
      this.activeAlertAirspaces.length = 0;
      return false;
    }

    CasAirspaceMonitor.latLongCache[0].set(CasAirspaceMonitor.geoPointCache.lat, CasAirspaceMonitor.geoPointCache.lon);
    CasAirspaceMonitor.geoPointCache.offset(gnssTrack, UnitType.GA_RADIAN.convertFrom(gnssGroundSpeed * CasAirspaceMonitor.LOOKAHEAD_TIME_S / 3600, UnitType.NMILE));
    CasAirspaceMonitor.latLongCache[1].set(CasAirspaceMonitor.geoPointCache.lat, CasAirspaceMonitor.geoPointCache.lon);

    const newAirspaces: JS_AirspaceProfileCut[] = await this.profileListener.call('GET_AIRSPACES_PATH', CasAirspaceMonitor.latLongCache);

    this.updateAlerts(newAirspaces, gnssAltFt, gnssGroundSpeed);

    return true;
  }

  /**
   * Checks if an upcoming airspace is equal to an airspace profile cut entry.
   * @param a The upcoming airspace.
   * @param b The profile cut entry.
   * @returns true if they appear to refer to the same airspace.
   */
  private static upcomingAirspaceEquals(a: ActiveAlertAirspace, b: JS_AirspaceProfileCut): boolean {
    // Sadly the sim does not fill the name field, so we just have to compare the data we do get.
    // Note that the id property it gives is not stable, so not useful here.
    return a.type === b.type && a.altMin === b.altMin && a.altMax === b.altMax;
  }

  /**
   * Removes any airspaces that are no longer ahead in the upcoming airspace array.
   * @param newAirspaces The new array of profile cut airspaces.
   */
  private removeStaleAlerts(newAirspaces: JS_AirspaceProfileCut[]): void {
    for (let i = this.activeAlertAirspaces.length - 1; i >= 0; i--) {
      let found = false;

      for (let j = 0; j < newAirspaces.length; j++) {
        if (CasAirspaceMonitor.upcomingAirspaceEquals(this.activeAlertAirspaces[i], newAirspaces[j])) {
          found = true;
          break;
        }
      }

      if (!found) {
        this.activeAlertAirspaces.splice(i, 1);
      }
    }
  }

  /**
   * Adds an alert airspace if it's not already active.
   * @param airspace The airspace to add.
   */
  private tryAddAlert(airspace: JS_AirspaceProfileCut): void {
    // If we already have this airspace in the alert list, ignore it.
    for (let i = 0; i < this.activeAlertAirspaces.length; i++) {
      if (CasAirspaceMonitor.upcomingAirspaceEquals(this.activeAlertAirspaces[i], airspace)) {
        return;
      }
    }

    this.activeAlertAirspaces.push(airspace);

    // Set the data for the CAS message to show.
    this.publisher.pub('cas_airspace_monitor_class', airspace.name ? airspace.name : AirspaceClassNames.get(airspace.type) ?? 'Airspace', false, true);
    this.publisher.pub('cas_airspace_monitor_name', AirspaceClassNames.get(airspace.type) ?? 'Airspace', false, true);
    this.publisher.pub('cas_airspace_monitor_min_alt', airspace.altMin ? airspace.altMin : undefined, false, true);
    this.publisher.pub('cas_airspace_monitor_max_alt', airspace.altMax < CasAirspaceMonitor.UNLIMITED_AIRSPACE_TOP ? airspace.altMax : undefined, false, true);

    // Since it's new we must trigger an alert.
    this.alertTransporter.set(false);
    this.alertTransporter.set(true);
  }

  /**
   * Updates the state of the airspace alerts.
   * @param airspaces The airspaces lying ahead in the alert range laterally.
   * @param altitude The current aircraft altitude in feet.
   * @param gs The current aircraft ground speed in knots.
   */
  private updateAlerts(airspaces: JS_AirspaceProfileCut[], altitude: number, gs: number): void {
    this.removeStaleAlerts(airspaces);

    const vs = this.vsFilter.last() ?? 0;

    for (const entry of airspaces) {
      if (!AirspaceClassNames.has(entry.type)) {
        continue;
      }

      let shouldAlert = false;

      for (let i = 0; i < entry.crossings.length; i++) {
        const timeToReach = entry.crossings[i].dist / gs * 3600;
        const maxExpectedAlt = altitude + Math.max(0, vs * timeToReach / 60) + CasAirspaceMonitor.ALT_HYSTERESIS_FT;
        const minExpectedAlt = altitude + Math.min(0, vs * timeToReach / 60) - CasAirspaceMonitor.ALT_HYSTERESIS_FT;
        if (
          (minExpectedAlt >= entry.altMin || maxExpectedAlt >= entry.altMin) && // we will end up above the lower level
          (entry.altMax < entry.altMin || minExpectedAlt <= entry.altMax || maxExpectedAlt <= entry.altMax) && // we will end up below the upper level
          (entry.crossings[i].entering || altitude < entry.altMin || (altitude > entry.altMax && entry.altMax > entry.altMin)) // we are entering laterally, or we are not already in the airspace vertically
        ) {
          shouldAlert = true;
          break;
        }
      }

      if (shouldAlert) {
        this.tryAddAlert(entry);
      }
    }
  }
}

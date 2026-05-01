import { ConsumerValue, EventBus, GeoPoint, LerpLookupTable, MathUtils, TerrainProfile, TerrainProfileLoader, UnitType, VNavUtils } from '@microsoft/msfs-sdk';

import { GnssReceiverEvents } from '../../Gnss/GnssTypes';
import { GpwsEvents } from '../GpwsEvents';
import { GpwsData, GpwsModule } from '../GpwsModule';
import { GpwsOperatingMode } from '../GpwsTypes';

/**
 * A GPWS module which handles Forward-Looking Terrain Alerts.
 */
export class ForwardLookingTerrainAlertModule implements GpwsModule {
  private static readonly ENROUTE_FLOOR_HEIGHT = 700;
  private static readonly ENROUTE_DESCENT_FLOOR_HEIGHT = 500;
  private static readonly APPROACH_FLOOR_HEIGHT = 150;
  private static readonly APPROACH_DESCENT_FLOOR_HEIGHT = 300;
  private static readonly APPROACH_FLOOR_TRANSITION_DIST = 20; // nautical miles
  private static readonly APPROACH_FLOOR_TRANSITION_FINISH_DIST = 8; // nautical miles
  private static readonly DEPARTURE_FLOOR_HEIGHT = 100;

  private static readonly WARNING_FLOOR_PCT = 0.9; // The percentage of the terrain floor to use as a basis for the warning envelope

  private static readonly WARNING_ENVELOPE_TIME_POINTS = [2, 16, 17, 40];
  private static readonly CAUTION_ENVELOPE_TIME_POINTS = [2, 40, 41, 60];

  private static readonly TERRAIN_RESOLUTION_M = 150;
  private static readonly TERRAIN_RESOLUTION_NM = UnitType.NMILE.convertFrom(ForwardLookingTerrainAlertModule.TERRAIN_RESOLUTION_M, UnitType.METER);

  private readonly publisher = this.bus.getPublisher<GpwsEvents>();

  private readonly terrainLoader = new TerrainProfileLoader({ terrainMinimumResolution: ForwardLookingTerrainAlertModule.TERRAIN_RESOLUTION_M });
  private terrainProfile?: TerrainProfile;

  private lastUpdate = 0;
  private lastTerrainProfileTrack: number | null = null;
  private distSinceTerrainProfile = 0;
  private terrainProfileDist = 0;

  private latLongCache = [new LatLong(NaN, NaN), new LatLong(NaN, NaN)];
  private geoPointCache = new GeoPoint(0, 0);

  private readonly sub = this.bus.getSubscriber<GnssReceiverEvents>();

  private readonly groundTrack = ConsumerValue.create(this.sub.on('gnss_track_true_deg'), null);
  private readonly groundSpeed = ConsumerValue.create(this.sub.on('gnss_ground_speed_kts'), null);
  private readonly position = ConsumerValue.create(this.sub.on('gnss_position'), { lat: NaN, long: NaN });

  /**
   * Creates a new instance of TouchdownCalloutModule.
   * @param bus The event bus.
   */
  constructor(private readonly bus: EventBus) { }

  /** @inheritdoc */
  public onInit(): void { }

  /** @inheritdoc */
  public async onUpdate(operatingMode: GpwsOperatingMode, data: Readonly<GpwsData>, _realTime: number, simTime: number): Promise<void> {
    // Inhibit FLTA when on ground, or just after takeoff/landing to avoid nuisance alerts on short final and just after takeoff
    if (
      operatingMode !== GpwsOperatingMode.Normal || data.isOnGround || data.inhibits.terrain ||
      (data.nearestRunwayDistance && data.nearestRunwayAltitude && data.nearestRunwayDistance < 1.5 && data.geoAltitude - data.nearestRunwayAltitude < 200)
    ) {
      this.publisher.pub('gpws_terrain_warning', false, false, true);
      this.publisher.pub('gpws_terrain_caution', false, false, true);
      return;
    }

    if (data.isAglAltitudeValid && data.aglAltitude > 30) {
      // Only update envelopes and terrain profiles once per second
      if (simTime - this.lastUpdate > 1000) {
        const warningEnvelope = this.getWarningEnvelope(data);
        const cautionEnvelope = this.getCautionEnvelope(data);

        // console.log('NEW ENVELOPES', warningEnvelope, cautionEnvelope);

        this.updateTerrainProfile(simTime);

        if (warningEnvelope && cautionEnvelope) {
          const isWarningActive = this.isEnvelopeViolated(warningEnvelope);
          const isCautionActive = this.isEnvelopeViolated(cautionEnvelope);

          if (isWarningActive) {
            this.publisher.pub('gpws_terrain_warning', true, false, true);
            this.publisher.pub('gpws_terrain_caution', false, false, true);
          } else {
            this.publisher.pub('gpws_terrain_warning', false, false, true);
            this.publisher.pub('gpws_terrain_caution', isCautionActive, false, true);
          }
        }

        this.lastUpdate = simTime;
      }
    }
  }

  /**
   * Checks whether the terrain profile is predicted to violate the provided protection envelope
   * @param envelopeTable A lerp lookup table containing the envelope protection altitudes in metres
   * @returns If the envelope is violated
   */
  private isEnvelopeViolated(envelopeTable: LerpLookupTable): boolean {
    if (!this.terrainProfile) {
      return false;
    }

    const startIndex = Math.ceil(this.distSinceTerrainProfile / ForwardLookingTerrainAlertModule.TERRAIN_RESOLUTION_NM);
    for (let i = startIndex; i < this.terrainProfile.elevations.length; i++) {
      const distance = i * ForwardLookingTerrainAlertModule.TERRAIN_RESOLUTION_NM - this.distSinceTerrainProfile;
      const envelopeAlt = envelopeTable.get(distance);
      const elevation = this.terrainProfile.elevations[i];

      if (!isFinite(envelopeAlt)) {
        return false;
      } else if (elevation > envelopeAlt) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handles the updating of the terrain profile and any terrain profile related data
   * @param simTime The sim time, in milliseconds
   */
  private async updateTerrainProfile(simTime: number): Promise<void> {
    const acftTrk = this.groundTrack.get();
    const acftGs = this.groundSpeed.get();
    const acftPos = this.position.get();

    if (!acftGs || !acftTrk || !isFinite(acftPos.lat) || !isFinite(acftPos.long)) {
      return;
    }

    this.distSinceTerrainProfile += acftGs * UnitType.MILLISECOND.convertTo(simTime - this.lastUpdate, UnitType.HOUR);
    const profileUpdateDistance = this.terrainProfileDist - (acftGs * (1.2 / 60)); // We want to ensure that we always have atleast 60s of profile data for lookaheads

    if (!this.lastTerrainProfileTrack || this.distSinceTerrainProfile > profileUpdateDistance || Math.abs(this.lastTerrainProfileTrack - acftTrk) > 1) {
      const distanceToGet = acftGs * (4 / 60); // We want to get 4 minutes of terrain profile
      this.latLongCache[0].set(acftPos.lat, acftPos.long);
      this.geoPointCache.set(acftPos.lat, acftPos.long).offset(acftTrk, UnitType.GA_RADIAN.convertFrom(distanceToGet, UnitType.NMILE));
      this.latLongCache[1].set(this.geoPointCache.lat, this.geoPointCache.lon);

      const profilePoints = [this.latLongCache[0], this.latLongCache[1]];
      this.terrainProfile = await this.terrainLoader.getTerrainProfileAlongPath(profilePoints, distanceToGet / ForwardLookingTerrainAlertModule.TERRAIN_RESOLUTION_NM);

      this.terrainProfileDist = distanceToGet;
      this.distSinceTerrainProfile = 0;
      this.lastTerrainProfileTrack = acftTrk;
    }
  }

  /**
   * Gets the height of the terrain clearance floor based on aircraft conditions
   * @param data The aircraft GPWS data
   * @returns The terrain floor to use for the GPWS envelopes
   */
  private getTerrainFloorHeight(data: Readonly<GpwsData>): number {
    const nearestRwyAlt = data.nearestRunwayAltitude;
    const nearestRwyDist = data.nearestRunwayDistance;
    const isApproach = !data.isTakeoff && nearestRwyAlt && nearestRwyDist && nearestRwyDist < 20 && data.geoAltitude - nearestRwyAlt < 2000;

    const enrouteFloorHeight = data.geoVerticalSpeed < -500 ? ForwardLookingTerrainAlertModule.ENROUTE_DESCENT_FLOOR_HEIGHT : ForwardLookingTerrainAlertModule.ENROUTE_FLOOR_HEIGHT;
    const apprFloorHeight = data.geoVerticalSpeed < -500 ? ForwardLookingTerrainAlertModule.APPROACH_FLOOR_HEIGHT : ForwardLookingTerrainAlertModule.APPROACH_DESCENT_FLOOR_HEIGHT;

    let terrainFloor = 0;
    if (data.isTakeoff) {
      terrainFloor = ForwardLookingTerrainAlertModule.DEPARTURE_FLOOR_HEIGHT;
    } else if (isApproach) {
      terrainFloor = MathUtils.lerp(nearestRwyDist,
        ForwardLookingTerrainAlertModule.APPROACH_FLOOR_TRANSITION_FINISH_DIST, ForwardLookingTerrainAlertModule.APPROACH_FLOOR_TRANSITION_DIST,
        apprFloorHeight, enrouteFloorHeight, true, true
      );
    } else {
      terrainFloor = enrouteFloorHeight;
    }

    return terrainFloor;
  }

  /**
   * Gets the current warning envelope. This envelope changes based on the phase of flight, groundspeed and flight path angle
   * so it is significantly more complex than the other aircraft warning envelopes.
   * See https://discord.com/channels/750764704175226992/1135630034594439300/1354484350623682700 for explanation of the envelope
   * @param data The GPWS data
   * @returns A lerp lookup table [warningAltitude (metres), key: distance (nm)] or null if data is invalid
   */
  private getWarningEnvelope(data: Readonly<GpwsData>): LerpLookupTable | null {
    const terrainFloor = this.getTerrainFloorHeight(data) * ForwardLookingTerrainAlertModule.WARNING_FLOOR_PCT;

    const groundSpeed = this.groundSpeed.get();
    const altitude = data.geoAltitude;

    if (groundSpeed) {
      const fpa = VNavUtils.getFpaFromVerticalSpeed(data.geoVerticalSpeed, groundSpeed);
      const gsPerSecond = groundSpeed / 3600; // Groundspeed in nautical miles per second

      return ForwardLookingTerrainAlertModule.constructAlertEnvelopeLookupTable(
        ForwardLookingTerrainAlertModule.WARNING_ENVELOPE_TIME_POINTS, terrainFloor, altitude, fpa, gsPerSecond
      );
    }

    return null;
  }

  /**
   * Gets the current warning envelope. This envelope changes based on the phase of flight, groundspeed and flight path angle
   * so it is significantly more complex than the other aircraft warning envelopes.
   * See https://discord.com/channels/750764704175226992/1135630034594439300/1354484350623682700 for explanation of the envelope
   * @param data The GPWS data
   * @returns A lerp lookup table [warningAltitude (ft), key: distance (nm)] or null if data is invalid
   */
  private getCautionEnvelope(data: Readonly<GpwsData>): LerpLookupTable | null {
    const terrainFloor = this.getTerrainFloorHeight(data);

    const groundSpeed = this.groundSpeed.get();
    const altitude = data.geoAltitude;

    if (groundSpeed) {
      const fpa = VNavUtils.getFpaFromVerticalSpeed(data.geoVerticalSpeed, groundSpeed);
      const gsPerSecond = groundSpeed / 3600; // Groundspeed in nautical miles per second

      return ForwardLookingTerrainAlertModule.constructAlertEnvelopeLookupTable(
        ForwardLookingTerrainAlertModule.CAUTION_ENVELOPE_TIME_POINTS, terrainFloor, altitude, fpa, gsPerSecond
      );
    }

    return null;
  }

  /**
   * Constructs a lookup table for a Forward Looking Terrain Alert envelope.
   * @param pointTimes An array containing the time for each point in the envelope, in seconds
   * @param terrainFloor The alert terrain floor, in feet
   * @param altitude The aircraft altitude, in feet
   * @param fpa The aircraft flight path angle, in degrees
   * @param gsPerSecond The ground speed, in nautical miles per second
   * @returns A lerp lookup table [warningAltitude (metres), key: distance (nm)]
   */
  private static constructAlertEnvelopeLookupTable(pointTimes: number[], terrainFloor: number, altitude: number, fpa: number, gsPerSecond: number): LerpLookupTable {
    // Point 1 occurs pointTimes[0] seconds in the future, and is altitude of the acft - terrain floor + alt change based on fpa
    const point1Dist = gsPerSecond * pointTimes[0];
    const point1Alt = UnitType.METER.convertFrom(altitude - terrainFloor + VNavUtils.altitudeForDistance(fpa, point1Dist), UnitType.FOOT);
    // Point 2 occurs pointTimes[1] seconds in the future, and is level with point 1
    const point2Dist = gsPerSecond * pointTimes[1];
    const point2Alt = point1Alt;
    // Point 3 occurs pointTimes[2] seconds in the future, and is the altitude of the acft + alt change based on fpa
    const point3Dist = gsPerSecond * pointTimes[2];
    const point3Alt = UnitType.METER.convertFrom(altitude + VNavUtils.altitudeForDistance(fpa, point3Dist), UnitType.FOOT);
    // Point 4 occurs pointTimes[3] seconds in the future and is the point 3 altitude + alt change of the higher of current or 6deg FPA
    const point4Dist = gsPerSecond * pointTimes[3];
    const point4Alt = point3Alt + UnitType.METER.convertFrom(VNavUtils.altitudeForDistance(Math.max(fpa, 6), point4Dist - point3Dist), UnitType.FOOT);

    return new LerpLookupTable([
      [UnitType.METER.convertFrom(altitude, UnitType.FOOT), 0],
      [point1Alt, point1Dist], [point2Alt, point2Dist], [point3Alt, point3Dist], [point4Alt, point4Dist],
      [Infinity, point4Dist + 0.01]
    ]);
  }

  /** @inheritdoc */
  public onDestroy(): void {
    // noop
  }
}

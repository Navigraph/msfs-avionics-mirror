import {
  AdcEvents, AdditionalApproachType, ApproachGuidanceMode, ArrayUtils, BaseVNavEvents, BitFlags, ConsumerValue, EventBus, FlightPlan, FlightPlanner,
  FlightPlanSegment, FlightPlanSegmentType, GlidePathCalculator2, LegDefinition, LegDefinitionFlags, LNavEvents, LNavUtils, MappedSubject, MathUtils, NavMath,
  ObjectSubject, RegisteredSimVar, RegisteredSimVarUtils, RnavTypeFlags, SimVarValueType, Subject, Subscribable, SubscribableMapFunctions, UnitType, VNavEvents,
  VNavUtils, VNavVars
} from '@microsoft/msfs-sdk';

import { FlightPlanIndex, FmsFlightPhase, FmsUtils, IfdAdditionalApproachType } from '../../Fms';
import { FmsEvents } from '../../Fms/FmsEvents';
import { IfdOptions } from '../../IfdOptions';
import { FmsPositionSystemEvents } from '../../Systems/FmsPositionSystem';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';
import { LNavDataEvents } from '../LNavDataEvents';
import { BaseIfdVNavDataEvents, IfdVNavDataEvents } from './IfdVnavDataEvents';
import { GlidepathServiceLevel, IFdVNavGlidepathGuidance } from './IfdVnavTypes';

/** Manages the approach glide path and deviation information. */
export class IfdGlidePathComputer {
  private static readonly GLIDEPATH_ANGULAR_SCALE = 0.8; // degrees
  private static readonly GLIDEPATH_SCALE_TAN = Math.tan(IfdGlidePathComputer.GLIDEPATH_ANGULAR_SCALE * Avionics.Utils.DEG2RAD);

  private isInit = false;

  private readonly approachDetails = ObjectSubject.create(FmsUtils.createEmptyApproachDetails());

  private readonly gpSupported = ConsumerValue.create(FmsUtils.onFmsEvent(this.flightPlanner.id, this.bus, 'approach_supports_gp'), false);

  private readonly approachHasGp = Subject.create(false);
  private readonly gpScaling = Subject.create(0);

  private readonly gpApproachMode = Subject.create(ApproachGuidanceMode.None);
  private readonly gpVerticalDeviation = Subject.create<number | null>(null);
  private readonly gpDistance = Subject.create<number | null>(null);
  private readonly gpFpa = Subject.create<number | null>(null);
  private readonly gpRequiredVs = Subject.create(0);
  private readonly _gpServiceLevel = Subject.create(GlidepathServiceLevel.None);
  public readonly gpServiceLevel: Subscribable<GlidepathServiceLevel> = this._gpServiceLevel;
  private readonly _gpNominalServiceLevel = Subject.create(GlidepathServiceLevel.None);
  public readonly gpNominalServiceLevel: Subscribable<GlidepathServiceLevel> = this._gpNominalServiceLevel;

  /** Whether LNAV is currently tracking a leg. */
  private readonly lnavIsTracking = ConsumerValue.create(null, false);
  /** The currently tracked LNAV leg. */
  private readonly lnavLegIndex = ConsumerValue.create(null, 0);
  /** Distance remaining on active leg in nautical miles. */
  private readonly activeLegDtg = ConsumerValue.create<number>(null, 0);
  /** The LNAV cross-track error in nautical miles. */
  private readonly crossTrackError = ConsumerValue.create<number>(null, 0);
  /** The LNAV desired track in degrees true. */
  private readonly desiredTrackTrue = ConsumerValue.create<number>(null, 0);
  private readonly lnavCdiScale = ConsumerValue.create(null, 2);

  /** The current barometric aircraft altitude in feet, or null if baro alti not available. */
  private readonly aircraftBaroAltitudeFeet = ConsumerValue.create<number | null>(null, null);

  /** The current GNSS aircraft altitude in metres, or null when not valid. */
  private readonly aircraftGnssAltitudeFeet = ConsumerValue.create<number | null>(null, null);

  private readonly gnssHal = ConsumerValue.create<number | null>(null, null);
  private readonly gnssHpl = ConsumerValue.create<number | null>(null, null);
  private readonly gnssVal = ConsumerValue.create<number | null>(null, null);
  private readonly gnssVpl = ConsumerValue.create<number | null>(null, null);

  /** The current aircraft ground speed in knots, or null when invalid. */
  private readonly groundSpeed = ConsumerValue.create<number | null>(null, null);
  /** The current aircraft ground track in degrees true, or null when invalid. */
  private readonly groundTrackTrue = ConsumerValue.create<number | null>(null, null);

  private readonly fmsFlightPhase = ConsumerValue.create<Readonly<FmsFlightPhase>>(
    FmsUtils.onFmsEvent(this.flightPlanner.id, this.bus, 'fms_flight_phase'),
    {
      isApproachActive: false,
      isToFaf: false,
      isPastFaf: false,
      isInMissedApproach: false
    }
  );

  /** Whether the lateral plan tracking is within the cross-track limit for VNAV tracking (2 NM). False if LNAV is not tracking.  */
  private readonly isWithinXtkLimit = Subject.create(false);
  /** Whether the lateral plan tracking is within the desired track angle limit for VNAV tracking (45°). False if LNAV is not tracking.  */
  private readonly isWithinDtkLimit = Subject.create(false);

  /** Whether the lateral plan tracking is currently suitable for VNAV tracking (within 2 NM XTK and 45° DTK). */
  private readonly isWithinLateralLimits: Subscribable<boolean> = MappedSubject.create(
    SubscribableMapFunctions.and(),
    this.isWithinXtkLimit,
    this.isWithinDtkLimit,
  );

  private readonly localVarSuffix = this.ifdOptions.vnavIndex !== 0 ? `:${this.ifdOptions.vnavIndex}` : '';

  private readonly gpApproachModeVar = RegisteredSimVarUtils.create(`${VNavVars.GPApproachMode}${this.localVarSuffix}`, SimVarValueType.Enum);

  /** Registered local vars for publishing VNAV state from the primary IFD only. */
  private readonly publishLocalVars = new Map<keyof BaseVNavEvents, RegisteredSimVar<number>>(this.isPrimary ? [
    ['gp_vertical_deviation', RegisteredSimVarUtils.create(`${VNavVars.GPVerticalDeviation}${this.localVarSuffix}`, SimVarValueType.Feet)],
    ['gp_distance', RegisteredSimVarUtils.create(`${VNavVars.GPDistance}${this.localVarSuffix}`, SimVarValueType.NM)],
    ['gp_fpa', RegisteredSimVarUtils.create(`${VNavVars.GPFpa}${this.localVarSuffix}`, SimVarValueType.Degree)],
    ['gp_required_vs', RegisteredSimVarUtils.create(`${VNavVars.GPRequiredVS}${this.localVarSuffix}`, SimVarValueType.FPM)],
    ['gp_service_level', RegisteredSimVarUtils.create(`${VNavVars.GPServiceLevel}${this.localVarSuffix}`, SimVarValueType.Enum)],
  ] : []);

  private readonly topicSuffix = VNavUtils.getEventBusTopicSuffix(this.ifdOptions.vnavIndex);

  private readonly publishTopics = new Map<keyof BaseVNavEvents, keyof VNavEvents>([
    ['gp_approach_mode', 'gp_approach_mode'],
    ['gp_vertical_deviation', `gp_vertical_deviation${this.topicSuffix}`],
    ['gp_distance', `gp_distance${this.topicSuffix}`],
    ['gp_fpa', `gp_fpa${this.topicSuffix}`],
    ['gp_required_vs', `gp_required_vs${this.topicSuffix}`],
    ['gp_service_level', `gp_service_level${this.topicSuffix}`],
  ]);

  private readonly publishDataTopics = new Map<keyof BaseIfdVNavDataEvents, keyof IfdVNavDataEvents>([
    ['gp_available', `gp_available${this.topicSuffix}`],
    ['gp_gsi_scaling', `gp_gsi_scaling${this.topicSuffix}`],
    ['gp_can_capture', `gp_can_capture${this.topicSuffix}`],
  ]);

  private readonly gpCalculator = new GlidePathCalculator2(
    this.flightPlanner,
    { planIndex: FlightPlanIndex.Active, isEligibleReferenceLeg: IfdGlidePathComputer.isEligibleReferenceLeg },
  );

  private readonly glidepathGuidanceBuffer: IFdVNavGlidepathGuidance[] = ArrayUtils.create(2, () => {
    return {
      approachHasGlidepath: false,
      isValid: false,
      canCapture: false,
      fpa: 0,
      deviation: 0
    };
  });

  private readonly _glidepathGuidance = Subject.create(
    this.glidepathGuidanceBuffer[0],
    (a, b) => {
      return a.approachHasGlidepath === b.approachHasGlidepath
        && (
          (!a.isValid && !b.isValid)
          || (
            a.isValid === b.isValid
            && a.canCapture === b.canCapture
            && a.fpa === b.fpa
            && a.deviation === b.deviation
          )
        );
    }
  );
  /** The glidepath guidance calculated by this computer. */
  public readonly glidepathGuidance = this._glidepathGuidance as Subscribable<Readonly<IFdVNavGlidepathGuidance>>;

  /**
   * Constructs a new instance.
   * @param bus The event bus for this instrument.
   * @param flightPlanner The flight planner to use.
   * @param ifdOptions The IFD configuration to use.
   * @param isPrimary Only the primary writes VNAV LVars
   */
  constructor(
    private readonly bus: EventBus,
    private readonly flightPlanner: FlightPlanner,
    private readonly ifdOptions: IfdOptions,
    private readonly isPrimary: boolean,
  ) { }

  /** Initialise to computer. */
  public init(): void {
    const sub = this.bus.getSubscriber<AdcEvents & FmsEvents & FmsPositionSystemEvents & GnssReceiverEvents & LNavEvents & LNavDataEvents>();

    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex);

    this.lnavIsTracking.setConsumer(sub.on(`lnav_is_tracking${lnavSuffix}`));
    this.lnavLegIndex.setConsumer(sub.on(`lnav_tracked_leg_index${lnavSuffix}`));
    this.activeLegDtg.setConsumer(sub.on(`lnav_leg_distance_remaining${lnavSuffix}`));
    this.crossTrackError.setConsumer(sub.on(`lnavdata_xtk${lnavSuffix}`));
    this.desiredTrackTrue.setConsumer(sub.on(`lnavdata_dtk_true${lnavSuffix}`));
    this.lnavCdiScale.setConsumer(sub.on(`lnavdata_cdi_scale${lnavSuffix}`));

    if (this.ifdOptions.airData?.altimeterIndex !== undefined) {
      this.aircraftBaroAltitudeFeet.setConsumer(sub.on(`indicated_alt_${this.ifdOptions.airData?.altimeterIndex}`));
    }

    this.groundSpeed.setConsumer(sub.on('fms_pos_ground_speed_1'));
    this.groundTrackTrue.setConsumer(sub.on('fms_pos_track_deg_true_1'));
    this.aircraftGnssAltitudeFeet.setConsumer(sub.on('gnss_altitude_ft'));
    this.gnssHal.setConsumer(sub.on('gnss_hal_m'));
    this.gnssHpl.setConsumer(sub.on('gnss_hpl_m'));
    this.gnssVal.setConsumer(sub.on('gnss_val_m'));
    this.gnssVpl.setConsumer(sub.on('gnss_vpl_m'));

    FmsUtils.onFmsEvent(this.flightPlanner.id, this.bus, 'fms_approach_details').handle((v) => this.approachDetails.set(v));

    this.setupPublish();

    this.isInit = true;
  }

  /** Updates the GP state. */
  public update(): void {
    if (!this.isInit) {
      return;
    }

    this.updateLateralLimits();

    const lateralPlan = this.flightPlanner.hasActiveFlightPlan() ? this.flightPlanner.getActiveFlightPlan() : undefined;
    const legDistanceRemaining = UnitType.NMILE.convertTo(this.activeLegDtg.get(), UnitType.METER);

    const lateralLegIndex = this.lnavLegIndex.get();

    if (
      lateralPlan &&
      lateralPlan.length > 0
      && lateralLegIndex < lateralPlan.length
    ) {
      this.gpCalculator.update();
      this.manageGlidepath(lateralPlan, lateralLegIndex, legDistanceRemaining);
    } else {
      this.resetGpVars();
    }

    this.updateGlidepathGuidance();
    this.updateGpScaling();

    this.gpApproachMode.set(this.gpApproachModeVar.get());
  }

  /** Updates the LNAV tracking limits. */
  private updateLateralLimits(): void {
    if (!this.lnavIsTracking.get()) {
      this.isWithinDtkLimit.set(false);
      this.isWithinXtkLimit.set(false);
      return;
    }

    const groundTrackTrue = this.groundTrackTrue.get();
    const dtkError = groundTrackTrue !== null ? NavMath.diffAngle(groundTrackTrue, this.desiredTrackTrue.get()) : undefined;
    this.isWithinDtkLimit.set(dtkError !== undefined && Math.abs(dtkError) <= 45);

    this.isWithinXtkLimit.set(this.crossTrackError.get() <= 2);
  }

  /** Sets up writing VNAV state to local vars. */
  private setupPublish(): void {
    // We always publish the VNAV topics without sync for consumption on the local IFD
    // and the primary IFD also publishes to local vars for other instruments.

    const publisher = this.bus.getPublisher<IfdVNavDataEvents & VNavEvents>();

    this.gpApproachMode.sub((v) => {
      this.publishLocalVars.get('gp_approach_mode')?.set(v);
      publisher.pub(this.publishTopics.get('gp_approach_mode')!, v);
    }, true);
    this.gpDistance.sub((v) => {
      this.publishLocalVars.get('gp_distance')?.set(v ?? -1);
      publisher.pub(this.publishTopics.get('gp_distance')!, v ?? -1);
    }, true);
    this.gpFpa.sub((v) => {
      this.publishLocalVars.get('gp_fpa')?.set(v ?? 0);
      publisher.pub(this.publishTopics.get('gp_fpa')!, v ?? 0);
    }, true);
    this.gpRequiredVs.sub((v) => {
      this.publishLocalVars.get('gp_required_vs')?.set(v ?? 0);
      publisher.pub(this.publishTopics.get('gp_required_vs')!, v ?? 0);
    }, true);
    this._gpServiceLevel.sub((v) => {
      this.publishLocalVars.get('gp_service_level')?.set(v);
      publisher.pub(this.publishTopics.get('gp_service_level')!, v);
    }, true);
    this.gpVerticalDeviation.sub((v) => {
      this.publishLocalVars.get('gp_vertical_deviation')?.set(v ?? -1001);
      publisher.pub(this.publishTopics.get('gp_vertical_deviation')!, v ?? -1001);
    }, true);

    this.approachHasGp.sub((v) => publisher.pub(this.publishDataTopics.get('gp_available')!, v), true);
    this.gpScaling.sub((v) => publisher.pub(this.publishDataTopics.get('gp_gsi_scaling')!, v), true);
    this._glidepathGuidance.sub((v) => publisher.pub(this.publishDataTopics.get('gp_can_capture')!, v.canCapture), true);
  }

  /**
   * Resets glidepath-related SimVars.
   */
  private resetGpVars(): void {
    this.approachHasGp.set(false);
    this._gpServiceLevel.set(GlidepathServiceLevel.None);
    this._gpNominalServiceLevel.set(GlidepathServiceLevel.None);
    this.gpVerticalDeviation.set(null);
    this.gpDistance.set(null);
    this.gpFpa.set(null);
  }

  /**
   * Gets the RNAV approach type flags considering the IFD installation capabilities.
   * @param rnavTypeFlags The approach type flags.
   * @returns The available approach type flags.
   */
  private getAvailableRnavTypes(rnavTypeFlags: number): number {
    if (!this.ifdOptions.enableSbas) {
      return BitFlags.intersection(rnavTypeFlags, BitFlags.not(BitFlags.union(RnavTypeFlags.LP, RnavTypeFlags.LPV)));
    }
    return rnavTypeFlags;
  }

  /**
   * Gets the current GP service level.
   * @returns The current service level.
   */
  private getServiceLevel(): GlidepathServiceLevel {
    const approachDetails = this.approachDetails.get();

    if (!approachDetails.isLoaded || !this.lnavIsTracking.get()) {
      return GlidepathServiceLevel.None;
    }

    const baroAltAvailable = this.ifdOptions.airData?.altimeterIndex !== undefined;
    const hal = this.gnssHal.get();
    const hpl = this.gnssHpl.get();
    const val = this.gnssVal.get();
    const vpl = this.gnssVpl.get();
    const hplMet = hpl !== null && hal !== null && hpl < hal;
    const vplMet = vpl !== null && val !== null && vpl < val;
    const rnavTypeFlags = this.getAvailableRnavTypes(approachDetails.rnavTypeFlags);

    if (approachDetails.type === AdditionalApproachType.APPROACH_TYPE_VISUAL) {
      return baroAltAvailable ? GlidepathServiceLevel.LNavPlusVBaro : GlidepathServiceLevel.LNavPlusV;
    } else if (approachDetails.isLoaded && approachDetails.type !== IfdAdditionalApproachType.APPROACH_TYPE_VFR) {
      // Here we go down the list of increasingly imprecise modes until we reach one that is possible.
      if (BitFlags.isAny(rnavTypeFlags, RnavTypeFlags.LPV) && hplMet && vplMet) {
        return GlidepathServiceLevel.Lpv;
      }

      if (BitFlags.isAny(rnavTypeFlags, RnavTypeFlags.LP) && hplMet) {
        return GlidepathServiceLevel.LpPlusV;
      }

      if (BitFlags.isAny(rnavTypeFlags, RnavTypeFlags.LPV | RnavTypeFlags.LNAVVNAV) && hplMet) {
        return baroAltAvailable ? GlidepathServiceLevel.LNavVNavBaro : (vplMet ? GlidepathServiceLevel.LNavVNav : GlidepathServiceLevel.LNavPlusV);
      }

      if (approachDetails.bestRnavType > 0) {
        return baroAltAvailable ? GlidepathServiceLevel.LNavPlusVBaro : GlidepathServiceLevel.LNavPlusV;
      }
    }
    return GlidepathServiceLevel.None;
  }

  /**
   * Gets the nominal GP service level for the current approach.
   * @returns The nominal service level.
   */
  private getNominalServiceLevel(): GlidepathServiceLevel {
    const approachDetails = this.approachDetails.get();

    if (!approachDetails.isLoaded || !this.lnavIsTracking.get()) {
      return GlidepathServiceLevel.None;
    }

    const baroAltInstalled = this.ifdOptions.airData?.altimeterIndex !== undefined;
    const rnavTypeFlags = this.getAvailableRnavTypes(approachDetails.rnavTypeFlags);

    if (approachDetails.type === AdditionalApproachType.APPROACH_TYPE_VISUAL) {
      return baroAltInstalled ? GlidepathServiceLevel.LNavPlusVBaro : GlidepathServiceLevel.LNavPlusV;
    } else if (approachDetails.isLoaded && approachDetails.type !== IfdAdditionalApproachType.APPROACH_TYPE_VFR) {
      if (BitFlags.isAny(rnavTypeFlags, RnavTypeFlags.LPV)) {
        return GlidepathServiceLevel.Lpv;
      }
      if (BitFlags.isAny(rnavTypeFlags, RnavTypeFlags.LP)) {
        return GlidepathServiceLevel.LpPlusV;
      }
      if (BitFlags.isAny(rnavTypeFlags, RnavTypeFlags.LNAVVNAV)) {
        return baroAltInstalled ? GlidepathServiceLevel.LNavVNavBaro : GlidepathServiceLevel.LNavVNav;
      }
      if (BitFlags.isAny(rnavTypeFlags, RnavTypeFlags.LNAV)) {
        return baroAltInstalled ? GlidepathServiceLevel.LNavPlusVBaro : GlidepathServiceLevel.LNavPlusV;
      }
    }
    return GlidepathServiceLevel.None;
  }

  /**
   * Checks if a GP service level uses baro altitude.
   * @param serviceLevel The service level to check.
   * @returns true if the service level uses baro altitude.
   */
  private static isBaroServiceLevel(serviceLevel: GlidepathServiceLevel): boolean {
    switch (serviceLevel) {
      case GlidepathServiceLevel.LNavPlusVBaro:
      case GlidepathServiceLevel.LNavVNavBaro:
        return true;
      default:
        return false;
    }
  }

  /**
   * Manages glidepath state.
   * @param lateralPlan The lateral flight plan.
   * @param activeLegIndex The global index of the active flight plan leg.
   * @param distanceAlongLeg The along-track distance from the start of the active flight plan leg to the airplane's
   * position, in meters.
   */
  private manageGlidepath(lateralPlan: FlightPlan | undefined, activeLegIndex: number, distanceAlongLeg: number): void {
    if (lateralPlan && this.gpSupported.get() && this.isWithinLateralLimits.get()) {
      const gpServiceLevel = this.getServiceLevel();
      const gpNominalServiceLevel = this.getNominalServiceLevel();

      if (gpServiceLevel !== GlidepathServiceLevel.None) {
        const gpDistance = this.gpCalculator.getDistanceToReference(activeLegIndex, distanceAlongLeg);

        if (gpDistance !== undefined) {
          const currentAlt = IfdGlidePathComputer.isBaroServiceLevel(gpServiceLevel) ? this.aircraftBaroAltitudeFeet.get() : this.aircraftGnssAltitudeFeet.get();
          const desiredGPAltitude = this.gpCalculator.getDesiredAltitude(gpDistance);

          if (desiredGPAltitude && currentAlt !== null) {
            const desiredGPAltitudeFeet = UnitType.METER.convertTo(desiredGPAltitude, UnitType.FOOT);

            this._gpServiceLevel.set(gpServiceLevel);
            this._gpNominalServiceLevel.set(gpNominalServiceLevel);
            this.gpDistance.set(gpDistance);
            this.gpVerticalDeviation.set(MathUtils.clamp(desiredGPAltitudeFeet - currentAlt, -1000, 1000));
            this.gpFpa.set(this.gpCalculator.glidepath.get().angle);
            this.approachHasGp.set(true);
            return;
          }
        }
      }
    }

    this.resetGpVars();
  }

  /**
   * Updates the glidepath guidance provided by this computer.
   */
  private updateGlidepathGuidance(): void {
    const guidanceBufferActiveIndex = this._glidepathGuidance.get() === this.glidepathGuidanceBuffer[0] ? 0 : 1;
    const guidance = this.glidepathGuidanceBuffer[(guidanceBufferActiveIndex + 1) % 2];

    const fpa = this.gpFpa.get();
    const deviation = this.gpVerticalDeviation.get();

    const fmsFlightPhase = this.fmsFlightPhase.get();

    guidance.approachHasGlidepath = this.approachHasGp.get();

    // Glidepath guidance is valid if and only if...
    const isValid
      // ... FPA and deviation were successfully computed...
      = fpa !== null && deviation !== null
      // ... and the active flight plan leg is to or past the faf but not in the missed approach.
      && (fmsFlightPhase.isToFaf || fmsFlightPhase.isPastFaf) && !fmsFlightPhase.isInMissedApproach;

    guidance.isValid = isValid;

    // Can capture the glidepath if and only if...
    guidance.canCapture
      // ... guidance is valid...
      = isValid
      // ... and FPA is downward sloping...
      && fpa > 0
      // ... and deviation is within limits...
      && deviation <= 100 && deviation >= -15
      // ... and the CDI is at less than full-scale deviation.
      && Math.abs(this.crossTrackError.get() / this.lnavCdiScale.get()) < 1;

    guidance.fpa = fpa ?? 0;
    guidance.deviation = deviation ?? 0;

    this._glidepathGuidance.set(guidance);
  }

  /**
   * Checks whether a candidate flight plan leg is eligible to host a glidepath reference point.
   * @param leg The flight plan leg to check.
   * @param segment The flight plan segment containing the leg to check.
   * @returns Whether the specified flight plan leg is eligible to host a glidepath reference point.
   */
  private static isEligibleReferenceLeg(leg: LegDefinition, segment: FlightPlanSegment): boolean {
    return segment.segmentType === FlightPlanSegmentType.Approach
      && !BitFlags.isAny(leg.flags, LegDefinitionFlags.MissedApproach);
  }

  /**
   * Computes glidepath scaling.
   */
  private updateGpScaling(): void {
    const gpServiceLevel = this._gpServiceLevel.get();
    const gpDistance = this.gpDistance.get();
    if (gpServiceLevel !== GlidepathServiceLevel.None && gpDistance !== null) {
      const maxScaleFeet = 492; // 150 meters
      const minScaleFeet = gpServiceLevel === GlidepathServiceLevel.Lpv ? 49 : 148; // 15/45 meters

      const scale = MathUtils.round(MathUtils.clamp(IfdGlidePathComputer.GLIDEPATH_SCALE_TAN * gpDistance, minScaleFeet, maxScaleFeet));
      this.gpScaling.set(scale);
    } else {
      this.gpScaling.set(0);
    }
  }
}

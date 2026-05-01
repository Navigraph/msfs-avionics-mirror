import {
  Accessible, AdcEvents, BitFlags, ConsumerSubject, ConsumerValue, EventBus, FixTypeFlags, FlightPlan, FlightPlanner, FlightPlanSegmentType, FlightPlanUtils,
  Instrument, LegDefinitionFlags, LNavEvents, LNavUtils, MappedSubject, MathUtils, NavMath, ObjectSubject, RegisteredSimVar, RegisteredSimVarUtils,
  RnavTypeFlags, SetVnavDirectToData, SimVarValueType, Subject, Subscribable, SubscribableMapFunctions, TodBodDetails, UnitType, Value, VNavControlEvents,
  VNavEvents, VNavPathMode, VNavUtils, VNavVars
} from '@microsoft/msfs-sdk';

import { FmsUtils } from '../../Fms';
import { FmsEvents } from '../../Fms/FmsEvents';
import { FlightPlanIndex } from '../../Fms/FmsTypes';
import { IfdOptions } from '../../IfdOptions';
import { VnavPathBasis, VnavUserSettings } from '../../Settings/VnavUserSettings';
import { ExternalAdcSystemEvents } from '../../Systems/ExternalAdcSystem';
import { FmsPositionSystemEvents } from '../../Systems/FmsPositionSystem';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';
import { LNavDataEvents } from '../LNavDataEvents';
import { IfdVNavUtils } from './IfdVNavUtils';

export enum IfdVnavState {
  /** VNAV not available or no target leg selected. */
  Inactive,
  /** We have a target leg, but haven't reached T/D yet. */
  Armed,
  /** We are in a VNAV descent, with valid VDEV. */
  Active,
  /** We are in a VNAV descent, but laterally off track/course. */
  Flagged,
  /** We are in a VNAV descent, but the next altitude constraint requires a descent angle above 6 degrees. */
  Terminated,
}

/** Manages the enroute VNAV path and deviation information. */
export class IfdVnavManager implements Instrument {
  /** The minimum ground speed to use for calculating an FPA from an FPM, in knots. */
  private static readonly MIN_GROUND_SPEED_FOR_FPM = 50;

  private isInit = false;

  private state = IfdVnavState.Inactive;

  private readonly _verticalDirectIndex = Subject.create<number>(-1);
  /** The global leg index of the current vertical direct to, or -1 of there isn't one. */
  public readonly verticalDirectIndex: Subscribable<number> = this._verticalDirectIndex;

  /** The desired FPA for the next descent in degrees, positive = descent. */
  private readonly targetFpa = Subject.create<number | undefined>(undefined);

  /** The global leg index of the target VNAV leg, or undefined when there is none. */
  private targetLegIndex: number | undefined;

  /** The glidepath angle in degrees if the target leg is the final approach, else undefined. Positive = descent. */
  private targetLegApproachGpa: number | undefined;

  /** Whether the approach in the active flightplan is an LP/LPV approach. */
  private isApproachLpv = false;

  /** The target altitude, in metres. Only valid if targetLegIndex >= 0. */
  private readonly targetAltitude = Subject.create(0);

  /** The distance to the target leg termination, excluding the active leg DTG, and including any along track offset, in metres. */
  private targetLegDistanceAfterActive = 0;

  /** Whether LNAV is currently tracking a leg. */
  private readonly lnavIsTracking = ConsumerValue.create(null, false);
  /** Distance remaining on active leg in nautical miles. */
  private readonly activeLegDtg = ConsumerValue.create<number>(null, 0);
  /** The LNAV cross-track error in nautical miles. */
  private readonly crossTrackError = ConsumerValue.create<number>(null, 0);
  /** The LNAV desired track in degrees true. */
  private readonly desiredTrackTrue = ConsumerValue.create<number>(null, 0);

  /** The current barometric aircraft altitude in feet. */
  private readonly aircraftBaroAltitudeFeet = ConsumerSubject.create<number>(null, 0);
  /** The current barometric aircraft altitude in metres. */
  public readonly aircraftBaroAltitudeMeters: Subscribable<number> = this.aircraftBaroAltitudeFeet.map((v) => UnitType.METER.convertFrom(v, UnitType.FOOT));

  /** Whether the baro altitude is valid. */
  private readonly aircraftBaroAltitudeValid = ConsumerValue.create(null, false);

  /** The current GNSS aircraft altitude in metres, or null when not valid. */
  private readonly aircraftGnssAltitudeFeet = ConsumerSubject.create<number | null>(null, null);

  /** The current aircraft ground speed in knots, or null when invalid. */
  private readonly groundSpeed = ConsumerValue.create<number | null>(null, null);
  /** The current aircraft ground track in degrees true, or null when invalid. */
  private readonly groundTrackTrue = ConsumerValue.create<number | null>(null, null);

  /**
   * The vertical deviation in metres, or null when not computed.
   */
  private readonly verticalDeviation = Subject.create<number | null>(null);

  /** The vertical speed required to meet the next constraint, in feet per minute, or null when invalid. */
  private readonly verticalSpeedRequired = Subject.create<number | null>(null);

  private pathBasis = VnavPathBasis.DescentAngle;
  private targetRateFpm = 450;
  private readonly fpaSettingSub = VnavUserSettings.getManager(this.bus).getSetting('vnavDescentAngle').pipe(this.targetFpa, true);
  private readonly rateSettingSub = VnavUserSettings.getManager(this.bus).getSetting('vnavDescentRate').sub((v) => this.targetRateFpm = v, true, true);

  /** The current path mode for publishing. */
  private readonly pathMode = Subject.create(VNavPathMode.None);

  private readonly _isWithinXtkLimit = Subject.create(false);
  /** Whether the lateral plan tracking is within the cross-track limit for VNAV tracking (2 NM). False if LNAV is not tracking.  */
  public readonly isWithinXtkLimit: Subscribable<boolean> = this._isWithinXtkLimit;

  private readonly _isWithinDtkLimit = Subject.create(false);
  /** Whether the lateral plan tracking is within the desired track angle limit for VNAV tracking (45°). False if LNAV is not tracking.  */
  public readonly isWithinDtkLimit: Subscribable<boolean> = this._isWithinDtkLimit;

  /** Whether the lateral plan tracking is currently suitable for VNAV tracking (within 2 NM XTK and 45° DTK). */
  public readonly isWithinLateralLimits: Subscribable<boolean> = MappedSubject.create(
    SubscribableMapFunctions.and(),
    this._isWithinXtkLimit,
    this._isWithinDtkLimit,
  );

  private readonly _isEnabled = Value.create(false);
  /** Whether VNAV is enabled in this installation. */
  public readonly isEnabled: Accessible<boolean> = this._isEnabled;

  private readonly todBodDetails: TodBodDetails = {
    bodLegIndex: -1,
    todLegIndex: -1,
    todLegDistance: 0,
    distanceFromBod: 0,
    distanceFromTod: 0,
    currentConstraintLegIndex: -1,
  };
  private readonly todBodDetailsSub = ObjectSubject.create<TodBodDetails>(Object.assign({}, this.todBodDetails));

  private readonly localVarSuffix = this.ifdOptions.vnavIndex !== 0 ? `:${this.ifdOptions.vnavIndex}` : '';

  /** Registered local vars for publishing VNAV state from the primary IFD only. */
  private readonly publishLocalVars = new Map<keyof VNavEvents, RegisteredSimVar<number>>(this.isPrimary ? [
    ['vnav_path_mode', RegisteredSimVarUtils.create(`${VNavVars.PathMode}${this.localVarSuffix}`, SimVarValueType.Enum)],
    ['vnav_path_available', RegisteredSimVarUtils.create(`${VNavVars.PathAvailable}${this.localVarSuffix}`, SimVarValueType.Enum)],
    ['vnav_target_altitude', RegisteredSimVarUtils.create(`${VNavVars.TargetAltitude}${this.localVarSuffix}`, SimVarValueType.Feet)],
    ['vnav_constraint_altitude', RegisteredSimVarUtils.create(`${VNavVars.CurrentConstraintAltitude}${this.localVarSuffix}`, SimVarValueType.Feet)],
    ['vnav_fpa', RegisteredSimVarUtils.create(`${VNavVars.FPA}${this.localVarSuffix}`, SimVarValueType.Degree)],
    ['vnav_vertical_deviation', RegisteredSimVarUtils.create(`${VNavVars.VerticalDeviation}${this.localVarSuffix}`, SimVarValueType.Feet)],
    ['vnav_bod_global_leg_index', RegisteredSimVarUtils.create(`${VNavVars.BODLegIndex}${this.localVarSuffix}`, SimVarValueType.Number)],
    ['vnav_bod_distance', RegisteredSimVarUtils.create(`${VNavVars.BODDistance}${this.localVarSuffix}`, SimVarValueType.NM)],
    ['vnav_tod_global_leg_index', RegisteredSimVarUtils.create(`${VNavVars.TODLegIndex}${this.localVarSuffix}`, SimVarValueType.Number)],
    ['vnav_tod_leg_distance', RegisteredSimVarUtils.create(`${VNavVars.TODDistanceInLeg}${this.localVarSuffix}`, SimVarValueType.NM)],
    ['vnav_tod_distance', RegisteredSimVarUtils.create(`${VNavVars.TODDistance}${this.localVarSuffix}`, SimVarValueType.NM)],
    ['vnav_required_vs', RegisteredSimVarUtils.create(`${VNavVars.RequiredVS}${this.localVarSuffix}`, SimVarValueType.FPM)],
  ] : []);

  private readonly topicSuffix = VNavUtils.getEventBusTopicSuffix(this.ifdOptions.vnavIndex);

  private readonly publishTopics = new Map<keyof VNavEvents, keyof VNavEvents>([
    ['vnav_path_mode', `vnav_path_mode${this.topicSuffix}`],
    ['vnav_path_available', `vnav_path_available${this.topicSuffix}`],
    ['vnav_target_altitude', `vnav_target_altitude${this.topicSuffix}`],
    ['vnav_constraint_altitude', `vnav_constraint_altitude${this.topicSuffix}`],
    ['vnav_fpa', `vnav_fpa${this.topicSuffix}`],
    ['vnav_vertical_deviation', `vnav_vertical_deviation${this.topicSuffix}`],
    ['vnav_bod_global_leg_index', `vnav_bod_global_leg_index${this.topicSuffix}`],
    ['vnav_bod_distance', `vnav_bod_distance${this.topicSuffix}`],
    ['vnav_tod_global_leg_index', `vnav_tod_global_leg_index${this.topicSuffix}`],
    ['vnav_tod_leg_distance', `vnav_tod_leg_distance${this.topicSuffix}`],
    ['vnav_tod_distance', `vnav_tod_distance${this.topicSuffix}`],
    ['vnav_required_vs', `vnav_required_vs${this.topicSuffix}`]
  ]);

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

  /** @inheritdoc */
  public init(): void {
    if (!this.ifdOptions.enableVerticalNavigation || this.ifdOptions.airData?.altimeterIndex === undefined) {
      // IFD has no altitude source => no VNAV
      return;
    }

    this._isEnabled.set(true);

    const sub = this.bus.getSubscriber<
      AdcEvents & VNavControlEvents & ExternalAdcSystemEvents & FmsEvents & FmsPositionSystemEvents & GnssReceiverEvents & LNavEvents & LNavDataEvents
    >();

    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex);

    this.lnavIsTracking.setConsumer(sub.on(`lnav_is_tracking${lnavSuffix}`));
    this.activeLegDtg.setConsumer(sub.on(`lnav_leg_distance_remaining${lnavSuffix}`));
    this.crossTrackError.setConsumer(sub.on(`lnavdata_xtk${lnavSuffix}`));
    this.desiredTrackTrue.setConsumer(sub.on(`lnavdata_dtk_true${lnavSuffix}`));
    this.aircraftBaroAltitudeFeet.setConsumer(sub.on('ext_adc_indicated_alt'));
    this.aircraftBaroAltitudeValid.setConsumer(sub.on('ext_adc_altitude_data_valid'));
    this.groundSpeed.setConsumer(sub.on('fms_pos_ground_speed_1'));
    this.groundTrackTrue.setConsumer(sub.on('fms_pos_track_deg_true_1'));
    this.aircraftGnssAltitudeFeet.setConsumer(sub.on('gnss_altitude_ft'));

    const settingsManager = VnavUserSettings.getManager(this.bus);
    settingsManager.getSetting('vnavPathBasis').sub((v) => {
      if (v === VnavPathBasis.DescentAngle) {
        this.rateSettingSub.pause();
        this.fpaSettingSub.resume(true);
      } else {
        this.fpaSettingSub.pause();
        this.rateSettingSub.resume(true);
      }
      this.pathBasis = v;
    }, true);

    this.flightPlanner.onEvent('fplActiveLegChange').handle(this.onFlightPlanChanged);
    this.flightPlanner.onEvent('fplCopied').handle(this.onFlightPlanChanged);
    this.flightPlanner.onEvent('fplLegChange').handle(this.onFlightPlanChanged);
    this.flightPlanner.onEvent('fplLoaded').handle(this.onFlightPlanChanged);
    this.flightPlanner.onEvent('fplSegmentChange').handle(this.onFlightPlanChanged);

    this.flightPlanner.onEvent('fplCalculated').handle(this.onFlightPlanLegDistancesChanged);
    this.flightPlanner.onEvent('fplActiveLegChange').handle(this.onFlightPlanLegDistancesChanged);

    FmsUtils.onFmsEvent(this.flightPlanner.id, sub, 'fms_approach_details').handle((v) => this.isApproachLpv = v.bestRnavType === RnavTypeFlags.LP || v.bestRnavType === RnavTypeFlags.LPV);

    const vnavSuffix = VNavUtils.getEventBusTopicSuffix(this.ifdOptions.vnavIndex);
    sub.on(`vnav_set_vnav_direct_to${vnavSuffix}`).handle(this.onVerticalDirectTo.bind(this));

    this.onFlightPlanChanged();
    this.onFlightPlanLegDistancesChanged();

    this.setupPublish();

    this.isInit = true;
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isInit) {
      return;
    }

    this.updateLateralLimits();

    const targetLegIsApproach = this.targetLegApproachGpa !== undefined;
    const targetIsVerticalDirectTo = !targetLegIsApproach && this._verticalDirectIndex.get() >= 0;
    const gnssAltFeet = this.aircraftGnssAltitudeFeet.get();
    const aircraftAltitude = targetLegIsApproach && this.isApproachLpv ?
      (gnssAltFeet === null ? null : UnitType.METER.convertFrom(gnssAltFeet, UnitType.FOOT)) :
      (this.aircraftBaroAltitudeValid.get() ? this.aircraftBaroAltitudeMeters.get() : null);
    const groundSpeed = this.groundSpeed.get();
    let targetFpa = this.targetFpa.get();

    if (
      (targetFpa === undefined && !targetIsVerticalDirectTo) ||
      this.targetLegIndex === undefined || groundSpeed === null || aircraftAltitude === null || !this.lnavIsTracking.get()
    ) {
      this.state = IfdVnavState.Inactive;
      this.updatePathMode();
      this.updateTodBod();
      this.verticalDeviation.set(null);
      this.verticalSpeedRequired.set(null);
      return;
    }

    if ((this.state === IfdVnavState.Active || this.state === IfdVnavState.Flagged || this.state === IfdVnavState.Terminated) && aircraftAltitude < this.targetAltitude.get()) {
      this.state = IfdVnavState.Inactive;
      // Try find a new descent
      this.onFlightPlanChanged();
    }

    if (this.state === IfdVnavState.Inactive) {
      this.state = IfdVnavState.Armed;
    }

    if (targetLegIsApproach) {
      targetFpa = this.targetLegApproachGpa!;
    } else if ((targetIsVerticalDirectTo || this.pathBasis === VnavPathBasis.DescentRate) && this.state !== IfdVnavState.Active && this.state !== IfdVnavState.Flagged) {
      // If we are not active, and have DescentRate, update the FPA from current groundspeed.
      // We don't and can't know the TAS (as with the real unit), so groundspeed alone will be close enough.
      targetFpa = MathUtils.round(Math.atan2(
        UnitType.MPS.convertFrom(this.targetRateFpm, UnitType.FPM),
        UnitType.MPS.convertFrom(Math.max(IfdVnavManager.MIN_GROUND_SPEED_FOR_FPM, groundSpeed), UnitType.KNOT)
      ) * Avionics.Utils.RAD2DEG, 0.01);
    }

    const dist2Target = Math.max(0, this.targetLegDistanceAfterActive + UnitType.METER.convertFrom(this.activeLegDtg.get(), UnitType.NMILE));
    const desiredAltitude = Math.tan(targetFpa! * Avionics.Utils.DEG2RAD) * dist2Target + this.targetAltitude.get();
    const altitudeDiff2TargetConstraint = Math.max(0, aircraftAltitude - this.targetAltitude.get());
    const fpa2TargetConstraint = Math.atan2(altitudeDiff2TargetConstraint, dist2Target) * Avionics.Utils.RAD2DEG;
    const fpaWithinLimit = fpa2TargetConstraint >= -6;

    // If the path becomes too step, VNAV is terminated.
    // We add an altitude tolerance of 45 m to ensure this is not flagged erroneously when we get close to a constraint.
    if (
      (this.state === IfdVnavState.Armed || this.state === IfdVnavState.Active || this.state === IfdVnavState.Flagged) &&
      !fpaWithinLimit &&
      altitudeDiff2TargetConstraint > 45
    ) {
      this.state = IfdVnavState.Terminated;
    }

    // IF state is armed, check if we're above the desired alt
    // if we are that means we passed ToD, set active.
    if (this.state === IfdVnavState.Armed && aircraftAltitude >= desiredAltitude && fpaWithinLimit) {
      this.state = IfdVnavState.Active;

      // For descent rate and vertical DIR TO, we should update the fpa with the exact FPA required from ppos to the target
      if (!targetLegIsApproach && (targetIsVerticalDirectTo || this.pathBasis === VnavPathBasis.DescentRate)) {
        targetFpa = fpa2TargetConstraint;
      }
    }

    this.targetFpa.set(targetFpa);

    const vdev = aircraftAltitude - desiredAltitude;

    if (this.state === IfdVnavState.Active || (this.state === IfdVnavState.Armed && Math.abs(vdev) < 150)) {
      this.verticalDeviation.set(aircraftAltitude - desiredAltitude);
    } else {
      this.verticalDeviation.set(null);
    }

    if (this.state === IfdVnavState.Active || this.state === IfdVnavState.Armed) {
      const gsFpm = UnitType.FPM.convertFrom(groundSpeed, UnitType.KNOT);
      const vsFpm = gsFpm * Math.tan(-fpa2TargetConstraint * Avionics.Utils.DEG2RAD);
      this.verticalSpeedRequired.set(vsFpm < 0 ? vsFpm : null);
    } else {
      this.verticalSpeedRequired.set(null);
    }

    const isFlagged = !this.isWithinLateralLimits.get();
    if (this.state === IfdVnavState.Active && isFlagged) {
      this.state = IfdVnavState.Flagged;
    } else if (this.state === IfdVnavState.Flagged && !isFlagged) {
      this.state = IfdVnavState.Active;
    }

    this.updatePathMode();
    this.updateTodBod();
  }

  /**
   * Gets the current VNAV state.
   * @returns the state.
   */
  public getState(): IfdVnavState {
    return this.state;
  }

  /** Updates the LNAV tracking limits. */
  private updateLateralLimits(): void {
    if (!this.lnavIsTracking.get()) {
      this._isWithinDtkLimit.set(false);
      this._isWithinXtkLimit.set(false);
      return;
    }

    const groundTrackTrue = this.groundTrackTrue.get();
    const dtkError = groundTrackTrue !== null ? NavMath.diffAngle(groundTrackTrue, this.desiredTrackTrue.get()) : undefined;
    this._isWithinDtkLimit.set(dtkError !== undefined && Math.abs(dtkError) <= 45);

    this._isWithinXtkLimit.set(this.crossTrackError.get() <= 2);
  }

  /** Updates the path mode for VNAV publishing. */
  private updatePathMode(): void {
    switch (this.state) {
      case IfdVnavState.Active:
        this.pathMode.set(VNavPathMode.PathActive);
        break;
      case IfdVnavState.Armed:
        this.pathMode.set(VNavPathMode.PathArmed);
        break;
      case IfdVnavState.Terminated:
        this.pathMode.set(VNavPathMode.PathInvalid);
        break;
      default:
        this.pathMode.set(VNavPathMode.None);
        break;
    }
  }

  /** Sets up writing VNAV state to local vars. */
  private setupPublish(): void {
    const publisher = this.bus.getPublisher<VNavEvents>();

    // We always publish the VNAV topics without sync for consumption on the local IFD
    // and the primary IFD also publishes to local vars for other instruments.

    this.pathMode.sub((v) => {
      publisher.pub(this.publishTopics.get('vnav_path_mode')!, v, false, true);
      this.publishLocalVars.get('vnav_path_mode')?.set(v);
    }, true);
    this.pathMode.sub((v) => {
      const available = v !== VNavPathMode.None;
      publisher.pub(this.publishTopics.get('vnav_path_available')!, available, false, true);
      this.publishLocalVars.get('vnav_path_available')?.set(available ? 1 : 0);
    });
    this.targetAltitude.sub((v) => {
      const alt = this.targetLegIndex !== undefined ? UnitType.FOOT.convertFrom(v, UnitType.METER) : -1;
      publisher.pub(this.publishTopics.get('vnav_target_altitude')!, alt, false, true);
      publisher.pub(this.publishTopics.get('vnav_constraint_altitude')!, alt, false, true);
      this.publishLocalVars.get('vnav_target_altitude')?.set(alt);
      this.publishLocalVars.get('vnav_constraint_altitude')?.set(alt);
    }, true);
    this.targetFpa.sub((v) => {
      const fpa = v ?? 0;
      publisher.pub(this.publishTopics.get('vnav_fpa')!, fpa, false, true);
      this.publishLocalVars.get('vnav_fpa')?.set(fpa);
    }, true);
    this.verticalDeviation.sub((v) => {
      const deviation = v !== null ? UnitType.FOOT.convertFrom(v, UnitType.METER) : Number.MAX_SAFE_INTEGER;
      publisher.pub(this.publishTopics.get('vnav_vertical_deviation')!, deviation, false, true);
      this.publishLocalVars.get('vnav_vertical_deviation')?.set(deviation);
    }, true);
    this.verticalSpeedRequired.sub((v) => {
      publisher.pub(this.publishTopics.get('vnav_required_vs')!, v ?? 0, false, true);
      this.publishLocalVars.get('vnav_required_vs')?.set(v ?? 0);
    }, true);

    this.todBodDetailsSub.sub((_, key, newValue) => {
      switch (key) {
        case 'bodLegIndex':
          publisher.pub(this.publishTopics.get('vnav_bod_global_leg_index')!, newValue, false, true);
          this.publishLocalVars.get('vnav_bod_global_leg_index')?.set(newValue);
          break;
        case 'distanceFromBod':
          publisher.pub(this.publishTopics.get('vnav_bod_distance')!, newValue, false, true);
          this.publishLocalVars.get('vnav_bod_distance')?.set(newValue);
          break;
        case 'todLegIndex':
          publisher.pub(this.publishTopics.get('vnav_tod_global_leg_index')!, newValue, false, true);
          this.publishLocalVars.get('vnav_tod_global_leg_index')?.set(newValue);
          break;
        case 'todLegDistance':
          publisher.pub(this.publishTopics.get('vnav_tod_leg_distance')!, newValue, false, true);
          this.publishLocalVars.get('vnav_tod_leg_distance')?.set(newValue);
          break;
        case 'distanceFromTod':
          publisher.pub(this.publishTopics.get('vnav_tod_distance')!, newValue, false, true);
          this.publishLocalVars.get('vnav_tod_distance')?.set(newValue);
          break;
      }
    }, true);
  }

  private onFlightPlanChanged = (): void => {
    if (this.flightPlanner.hasActiveFlightPlan()) {
      const flightPlan = this.flightPlanner.getActiveFlightPlan();

      const verticalDirectIndex = this._verticalDirectIndex.get();
      const verticalDirectLeg = verticalDirectIndex >= 0 ? flightPlan.tryGetLeg(verticalDirectIndex) : null;
      if (
        verticalDirectLeg !== null &&
        verticalDirectIndex >= flightPlan.activeLateralLeg &&
        IfdVNavUtils.isLegVNavEligible(verticalDirectLeg, this.aircraftBaroAltitudeMeters.get())
      ) {
        this.targetLegIndex = verticalDirectIndex;
      } else {
        this.targetLegIndex = IfdVnavManager.findNextEligibleLegIndex(flightPlan, this.aircraftBaroAltitudeMeters.get());

        // clear an invalid direct to
        if (verticalDirectIndex >= 0) {
          this._verticalDirectIndex.set(-1);
        }
      }

      if (this.targetLegIndex !== undefined) {
        const targetLeg = flightPlan.getLeg(this.targetLegIndex);
        const targetAltitude = IfdVNavUtils.getBottomAltitude(targetLeg);
        if (targetAltitude !== undefined) {
          this.targetAltitude.set(targetAltitude);
          if (BitFlags.isAny(targetLeg.leg.fixTypeFlags, FixTypeFlags.MAP)) {
            this.targetLegApproachGpa = -(targetLeg.leg.verticalAngle - 360);
          } else {
            this.targetLegApproachGpa = undefined;
          }
        } else {
          console.error('[IfdVnavManager::onFlightPlanChanged] Somehow we found a target leg but it doesn\'t have a bottom alt!??!');
          this.resetTargetLeg();
        }
      }
    } else {
      this.resetTargetLeg();
    }

    this.onFlightPlanLegDistancesChanged();
    this.updateTodBod();
  };

  /**
   * Handles activation of vertical direct to.
   * @param data The vertical direct to data.
   */
  private onVerticalDirectTo(data: SetVnavDirectToData): void {
    if (data.planIndex !== FlightPlanIndex.Active) {
      return;
    }
    this._verticalDirectIndex.set(data.globalLegIndex);
    this.onFlightPlanChanged();
  }

  /** Resets the target leg to default undefined values. */
  private resetTargetLeg(): void {
    this.targetLegIndex = undefined;
    this.targetLegApproachGpa = undefined;
  }

  private onFlightPlanLegDistancesChanged = (): void => {
    if (this.targetLegIndex === undefined || !this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    const flightPlan = this.flightPlanner.getActiveFlightPlan();

    if (this.targetLegIndex <= flightPlan.activeLateralLeg) {
      this.targetLegDistanceAfterActive = 0;
      return;
    }

    const activeLeg = flightPlan.tryGetLeg(flightPlan.activeLateralLeg);
    const targetLeg = flightPlan.tryGetLeg(this.targetLegIndex);

    if (!activeLeg || !targetLeg || !activeLeg.calculated || !targetLeg.calculated) {
      this.targetLegDistanceAfterActive = 0;
      return;
    }

    this.targetLegDistanceAfterActive = targetLeg.calculated.cumulativeDistanceWithTransitions - activeLeg.calculated.cumulativeDistanceWithTransitions;
    if (targetLeg.verticalData.alongTrackOffset) {
      this.targetLegDistanceAfterActive -= targetLeg.verticalData.alongTrackOffset;
    }

    this.updateTodBod();
  };

  /** Resets the TOD/BOD to default invalid values. */
  private resetTodBod(): void {
    this.todBodDetails.bodLegIndex = -1;
    this.todBodDetails.todLegIndex = -1;
    this.todBodDetails.todLegDistance = 0;
    this.todBodDetails.distanceFromBod = 0;
    this.todBodDetails.distanceFromTod = 0;
    this.todBodDetails.currentConstraintLegIndex = -1;
    this.todBodDetailsSub.set(this.todBodDetails);
  }

  /** Updates the ToD/BoD details. */
  private updateTodBod(): void {
    const targetFpa = this.targetFpa.get();

    if (this.state === IfdVnavState.Inactive || this.targetLegIndex === undefined || targetFpa === undefined || !this.flightPlanner.hasActiveFlightPlan()) {
      this.resetTodBod();
      return;
    }

    const flightPlan = this.flightPlanner.getActiveFlightPlan();
    const targetLeg = flightPlan.tryGetLeg(this.targetLegIndex);
    this.todBodDetails.distanceFromBod = targetLeg?.calculated?.cumulativeDistanceWithTransitions ?? 0;

    if (this.state === IfdVnavState.Armed) {
      this.todBodDetails.bodLegIndex = this.targetLegIndex;
      this.todBodDetails.currentConstraintLegIndex = this.targetLegIndex;

      const activeLegDtgMetres = UnitType.METER.convertFrom(this.activeLegDtg.get(), UnitType.NMILE);
      const dist2Target = this.targetLegDistanceAfterActive + activeLegDtgMetres;
      const acAltitude = Math.max(0, this.aircraftBaroAltitudeMeters.get() - this.targetAltitude.get());
      const todToBodDistance = acAltitude / Math.tan(targetFpa * Avionics.Utils.DEG2RAD);
      this.todBodDetails.distanceFromTod = dist2Target - todToBodDistance;

      this.todBodDetails.todLegIndex = -1;
      this.todBodDetails.todLegDistance = 0;

      let distanceToTod = this.todBodDetails.distanceFromTod;
      for (const leg of flightPlan.legs(false, flightPlan.activeLateralLeg, this.targetLegIndex + 1)) {
        if (!leg.calculated) {
          continue;
        }
        const isActiveLeg = flightPlan.getLegIndexFromLeg(leg) === flightPlan.activeLateralLeg;
        const legDistanceRemaining = isActiveLeg ? activeLegDtgMetres : leg.calculated?.distance;
        if (distanceToTod <= legDistanceRemaining) {
          this.todBodDetails.todLegIndex = flightPlan.getLegIndexFromLeg(leg);
          this.todBodDetails.todLegDistance = leg.calculated.distance - distanceToTod;
        } else {
          distanceToTod -= legDistanceRemaining;
        }
      }
    } else {
      this.todBodDetails.distanceFromTod = 0;
    }

    this.todBodDetailsSub.set(this.todBodDetails);
  }

  /**
   * Finds the next eligible leg for the VNAV target.
   * @param flightPlan The flight plan to check.
   * @param aircraftAltitude The current altitude of the aicraft, in metres.
   * @returns the global index of the eligible leg, or undefined if there are none.
   */
  private static findNextEligibleLegIndex(flightPlan: FlightPlan, aircraftAltitude: number): number | undefined {
    let foundDiscontinuity = false;

    let firstEligibleLegIndex: number | undefined;
    for (const segment of flightPlan.segments()) {
      if (
        segment.segmentType === FlightPlanSegmentType.Enroute || segment.segmentType === FlightPlanSegmentType.Arrival || segment.segmentType === FlightPlanSegmentType.Approach
      ) {
        firstEligibleLegIndex = segment.offset;
        break;
      }
    }

    if (firstEligibleLegIndex === undefined) {
      return;
    }

    let foundFaf = false;

    for (let i = Math.max(firstEligibleLegIndex, flightPlan.activeLateralLeg); i < flightPlan.length; i++) {
      const leg = flightPlan.getLeg(i);

      if (IfdVNavUtils.isLegVNavEligible(leg, aircraftAltitude)) {
        return i;
      }

      if (foundFaf) {
        if (BitFlags.isAny(leg.leg.fixTypeFlags, FixTypeFlags.MAP)) {
          const mapAltitude = IfdVNavUtils.getBottomAltitude(leg);
          const mapVerticalAngle = -(leg.leg.verticalAngle - 360);
          if (mapAltitude !== undefined && mapVerticalAngle > 0) {
            return i;
          } else {
            return undefined;
          }
        } else {
          continue;
        }
      }

      foundFaf = BitFlags.isAny(leg.leg.fixTypeFlags, FixTypeFlags.FAF);

      if (foundDiscontinuity || FlightPlanUtils.isHoldLeg(leg.leg.type) ||
        BitFlags.isAny(leg.flags, LegDefinitionFlags.MissedApproach)
      ) {
        return undefined;
      }

      if (leg.calculated?.endsInDiscontinuity) {
        foundDiscontinuity = true;
      }
    }
  }
}

import {
  Accessible, BitFlags, ConsumerSubject, ConsumerValue, DebounceTimer, DirectToData, EventBus, FixTypeFlags, FlightPathVectorFlags, FlightPlan, FlightPlanUtils,
  GeoPoint, Instrument, LegDefinition, LegType, LNavEvents, LNavUtils, MagVar, NavComEvents, NavMath, Subject, UnitType, Wait
} from '@microsoft/msfs-sdk';

import { FlightPlanLegData, FlightPlanStore } from '../../FlightPlan';
import { ApproachDetails, FmsEvents, FmsUtils, IfdApproachType, IfdDiscontinuityType } from '../../Fms';
import { IfdOptions } from '../../IfdOptions';
import { ActiveNavSourceEvents } from '../../Navigation/ActiveNavSourceManager';
import { IfdApproachEvents } from '../../Navigation/IfdApproachManager';
import { LNavDataEvents } from '../../Navigation/LNavDataEvents';
import { IfdNavMode } from '../../Navigation/Sources/IfdNavSources';
import { IfdGlidePathComputer } from '../../Navigation/Vnav/IfdGlidePathComputer';
import { GlidepathServiceLevel } from '../../Navigation/Vnav/IfdVnavTypes';
import { ExternalHeadingSystemEvents } from '../ExternalHeadingSystem';
import { GnssReceiverEvents } from '../Gnss/GnssTypes';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** CAS Navigation alert monitor. */
export class CasNavigationMonitor implements Instrument {
  private static readonly HYSTERSIS_TIME_FACTOR = 1.2;

  private readonly checkNavFrequencyMonitor = casTransporterFactory(this.bus, CasUuid.CheckNavFrequency);
  private readonly checkNavIdentifierMonitor = casTransporterFactory(this.bus, CasUuid.CheckNavaidIdentifier);
  private readonly enableApApr = casTransporterFactory(this.bus, CasUuid.EnableApApr);
  private readonly exitingHoldAtFixMonitor = casTransporterFactory(this.bus, CasUuid.ExitingHoldAtFix);
  private readonly exitingHoldAtInterceptMonitor = casTransporterFactory(this.bus, CasUuid.ExitingHoldAtIntercept);
  private readonly gapInRouteAheadMonitor = casTransporterFactory(this.bus, CasUuid.GapInRouteAhead);
  private readonly headingLostMonitor = casTransporterFactory(this.bus, CasUuid.HeadingLost);
  private readonly holdCourseMonitor = casTransporterFactory(this.bus, CasUuid.HoldCourseXXX);
  private readonly interceptTooSharpMonitor = casTransporterFactory(this.bus, CasUuid.InterceptTooSharp, true);
  private readonly lpUnavailableUseLnavMdaMonitor = casTransporterFactory(this.bus, CasUuid.LpUnavailableUseLnavMda);
  private readonly lpvUnavailableUseLVnavDaMonitor = casTransporterFactory(this.bus, CasUuid.LpvUnavailableUseLVnavDa);
  private readonly lpvUnavailableUseLnavMdaMonitor = casTransporterFactory(this.bus, CasUuid.LpvUnavailableUseLnavMda);
  private readonly lVNavUnavailableUseLnavMdaMonitor = casTransporterFactory(this.bus, CasUuid.LVNavUnavailableUseLnavMda);
  private readonly manualSequenceRequiredMonitor = casTransporterFactory(this.bus, CasUuid.ManualSequenceReqd);
  private readonly nextLegCourseMonitor = casTransporterFactory(this.bus, CasUuid.NextLegCCCinXXSec);
  private readonly parallelEntryMonitor = casTransporterFactory(this.bus, CasUuid.ParallelEntry);
  private readonly setCourseMonitor = casTransporterFactory(this.bus, CasUuid.SetCourseToX);
  private readonly teardropEntryMonitor = casTransporterFactory(this.bus, CasUuid.TeardropEntry);

  private readonly exitingHoldAtFixState = Subject.create(false);
  private readonly exitingHoldAtInterceptState = Subject.create(false);
  private readonly gapInRouteAheadState = Subject.create(false);
  private readonly holdCourseState = Subject.create(false);
  private readonly manualSequenceRequiredState = Subject.create(false);
  private readonly nextLegCourseState = Subject.create(false);
  private readonly parallelEntryState = Subject.create(false);
  private readonly teardropEntryState = Subject.create(false);

  private readonly isLnavTracking = ConsumerValue.create(null, false);
  private readonly isLnavSuspended = ConsumerValue.create(null, false);
  private readonly lnavDesiredTrackMag = ConsumerValue.create(null, 0);
  private readonly lnavDesiredTrackTrue = ConsumerValue.create(null, 0);
  private readonly lnavSuspended = ConsumerValue.create(null, false);

  private readonly gnssPosition = new GeoPoint(NaN, NaN);
  private readonly gnssTrackTrue = ConsumerValue.create<number | null>(null, null);

  private readonly approachDetails: ApproachDetails = FmsUtils.createEmptyApproachDetails();
  private readonly navFrequency?: Accessible<number>;
  private readonly navIdent?: Accessible<string>;

  private readonly navMode = ConsumerSubject.create(null, IfdNavMode.GPS);

  private readonly obsCourse = ConsumerValue.create(null, 0);

  private readonly flightPlanner = this.store.fms.flightPlanner;

  private readonly manualSequenceDebounce = new DebounceTimer();

  private readonly lnavActiveLegEgressEte = ConsumerValue.create(null, NaN);

  private readonly headingValid = ConsumerSubject.create(null, false);

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param store The flight plan store to use.
   * @param gpComputer The glide path computer to use.
   * @param ifdOptions the IFD configuration to use.
   */
  constructor(private readonly bus: EventBus, private readonly store: FlightPlanStore, private readonly gpComputer: IfdGlidePathComputer, private readonly ifdOptions: IfdOptions) {
    if (this.ifdOptions.navIndex) {
      const sub = this.bus.getSubscriber<FmsEvents & NavComEvents>();
      this.navFrequency = ConsumerValue.create(sub.on(`nav_active_frequency_${this.ifdOptions.navIndex}`), 0);
      this.navIdent = ConsumerValue.create(sub.on(`nav_ident_${this.ifdOptions.navIndex}`), '');
      FmsUtils.onFmsEvent(this.flightPlanner.id, sub, 'fms_approach_details').handle((v) => Object.assign(this.approachDetails, v));
    }
  }

  /** @inheritdoc */
  public init(): void {
    const sub = this.bus.getSubscriber<ActiveNavSourceEvents & ExternalHeadingSystemEvents & GnssReceiverEvents & IfdApproachEvents & LNavDataEvents & LNavEvents & NavComEvents>();
    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex);

    this.isLnavTracking.setConsumer(sub.on(`lnav_is_tracking${lnavSuffix}`));
    this.isLnavSuspended.setConsumer(sub.on(`lnav_is_suspended${lnavSuffix}`));
    this.lnavDesiredTrackMag.setConsumer(sub.on(`lnavdata_dtk_mag${lnavSuffix}`));
    this.lnavDesiredTrackTrue.setConsumer(sub.on(`lnavdata_dtk_true${lnavSuffix}`));
    this.lnavSuspended.setConsumer(sub.on(`lnav_is_suspended${lnavSuffix}`));

    sub.on('gnss_position').handle((v) => this.gnssPosition.set(v.lat, v.long));
    this.gnssTrackTrue.setConsumer(sub.on('gnss_track_true_deg'));

    this.navMode.setConsumer(sub.on('pending_or_active_mode'));

    const checkManualSequence = this.checkManualSequence.bind(this);
    this.store.activeLeg.sub((leg) => {
      this.manualSequenceRequiredState.set(false);
      this.setCourseMonitor.set(false);

      if (leg && FlightPlanUtils.isAltitudeLeg(leg.leg.type)) {
        // give it a few frames for state to be sorted out so we're not racing flight plan store/planner/fms
        this.manualSequenceDebounce.schedule(checkManualSequence, 500);
      } else {
        this.manualSequenceDebounce.clear();
      }
    });

    this.store.directToData.sub(this.onDirectToDataChanged.bind(this));

    this.navMode.sub((v) => v !== IfdNavMode.GPS && this.setCourseMonitor.set(false), true);

    // Since GPS can only drive NAV1, we should just monitor NAV 1
    this.obsCourse.setConsumer(sub.on('nav_obs_1')); // `nav_obs_${this.ifdOptions.navIndex ?? 1}`

    this.lnavActiveLegEgressEte.setConsumer(sub.on(`lnavdata_egress_ete${lnavSuffix}`));

    this.headingValid.setConsumer(sub.on('ext_hdg_heading_data_valid'));

    // No initial notify as we only want the message if the heading was valid, *then* is lost.
    this.headingValid.sub((isValid) => this.headingLostMonitor.set(!isValid));

    this.exitingHoldAtFixMonitor.bind(this.exitingHoldAtFixState);
    this.exitingHoldAtInterceptMonitor.bind(this.exitingHoldAtInterceptState);
    this.gapInRouteAheadMonitor.bind(this.gapInRouteAheadState);
    this.holdCourseMonitor.bind(this.holdCourseState);
    this.manualSequenceRequiredMonitor.bind(this.manualSequenceRequiredState);
    this.parallelEntryMonitor.bind(this.parallelEntryState);
    this.teardropEntryMonitor.bind(this.teardropEntryState);

    if (this.ifdOptions.enableSetCourseAlert) {
      this.nextLegCourseMonitor.bind(this.nextLegCourseState);
    }

    sub.on('approach_prompt').handle((v) => this.enableApApr.set(v));
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (this.isLnavTracking.get()) {
      this.updateLnavAlerts();
      this.updateApproachAlerts();

      if (this.navFrequency) {
        this.updateNavaidAlerts();
      }
    } else {
      this.resetAll();
    }
  }

  /** Updates the LNAV related alerts. */
  private updateLnavAlerts(): void {
    const activeLeg = this.store.activeLegData.get();

    let nextLeg: FlightPlanLegData | undefined;
    let nextDiscontinuity: FlightPlanLegData | undefined;

    const activeLegGlobalIndex = this.store.activeLegGlobalIndex.get();
    if (activeLeg && activeLegGlobalIndex !== undefined) {
      for (const legData of this.store.legItems(activeLegGlobalIndex + 1)) {
        // The IFD skips over IF legs at segment boundaries for this data (but not for some other stuff like next leg data block!)
        if (!nextLeg && (legData.leg.leg.type !== LegType.IF || !legData.leg.calculated || legData.leg.calculated.flightPath.length > 0)) {
          nextLeg = legData;
        }

        if (!nextDiscontinuity && legData.isDiscontinuity && legData.leg.userData?.discontinuityType === IfdDiscontinuityType.GapInRoute) {
          nextDiscontinuity = legData;
        }

        if (nextLeg && nextDiscontinuity) {
          break;
        }
      }
    }

    this.gapInRouteAheadState.set(
      nextDiscontinuity !== undefined &&
      // Apply some hyteresis so it doesn't flicker.
      // Note that the flight plan store ETE only updates every 3 seconds, but that's good enough for us.
      nextDiscontinuity.estimatedTimeEnrouteCumulative.get().asUnit(UnitType.MINUTE) <
      (this.gapInRouteAheadState.get() ? CasNavigationMonitor.HYSTERSIS_TIME_FACTOR : 1) * 3
    );

    // We can't use the flight plan store ETE because we need more granular updates.
    const activeLegEgressEteSec = this.lnavActiveLegEgressEte.get();
    const isLnavSuspended = this.isLnavSuspended.get();

    const isHoldAlertActive = this.holdCourseState.get() || this.parallelEntryState.get() || this.teardropEntryState.get();
    if (!isLnavSuspended && nextLeg?.isHoldLeg && activeLegEgressEteSec <= (isHoldAlertActive ? CasNavigationMonitor.HYSTERSIS_TIME_FACTOR : 1) * 10 && nextLeg.leg.calculated) {
      const firstVector = nextLeg.leg.calculated.ingress[0];
      const parallel = firstVector?.flags ? BitFlags.isAny(firstVector.flags, FlightPathVectorFlags.HoldParallelEntry) : false;
      const teardrop = firstVector?.flags ? BitFlags.isAny(firstVector.flags, FlightPathVectorFlags.HoldTeardropEntry) : false;

      this.holdCourseState.set(!parallel && !teardrop);
      this.parallelEntryState.set(parallel);
      this.teardropEntryState.set(teardrop);
    } else {
      this.holdCourseState.set(false);
      this.parallelEntryState.set(false);
      this.teardropEntryState.set(false);
    }

    const isExitHoldActive = this.exitingHoldAtFixState.get() || this.exitingHoldAtInterceptState.get();
    const isExitingHold = !!activeLeg?.isHoldLeg && !isLnavSuspended && activeLegEgressEteSec <= (isExitHoldActive ? CasNavigationMonitor.HYSTERSIS_TIME_FACTOR : 1) * 10;

    this.exitingHoldAtFixState.set(isExitingHold && !activeLeg.isHoldInLieuOfProcedureTurn);
    this.exitingHoldAtInterceptState.set(isExitingHold && activeLeg.isHoldInLieuOfProcedureTurn);

    // 30 sec for turns more than 120°, else 10 sec
    const nextDtk = nextLeg?.leg.calculated?.initialDtk;
    const nextDtkAlertTime = nextDtk !== undefined && Math.abs(NavMath.diffAngle(nextDtk, this.lnavDesiredTrackMag.get())) > 120 ? 30 : 10;
    this.nextLegCourseState.set(
      !isLnavSuspended && !!nextLeg && !nextLeg.isDiscontinuity && !nextLeg.isHoldLeg &&
      activeLegEgressEteSec <= (this.nextLegCourseState.get() ? CasNavigationMonitor.HYSTERSIS_TIME_FACTOR : 1) * nextDtkAlertTime
    );

    // If ext course not set to DTK and aircraft pointing at DTK.. alert
    if (this.ifdOptions.enableSetCourseAlert) {
      const extCourseMag = this.obsCourse.get();
      const dtkMag = this.lnavDesiredTrackMag.get();
      const dtkTrue = this.lnavDesiredTrackTrue.get();
      const trackTrue = this.gnssTrackTrue.get();
      const extCourseTrue = NavMath.normalizeHeading(extCourseMag + NavMath.diffAngle(dtkMag, dtkTrue));
      this.setCourseMonitor.set(trackTrue !== null && Math.abs(NavMath.diffAngle(trackTrue, dtkTrue)) < 3 && Math.abs(NavMath.diffAngle(extCourseTrue, dtkTrue)) > 10);
    }
  }

  /** Resets all the alerts to false. */
  private resetAll(): void {
    this.checkNavFrequencyMonitor.set(false);
    this.checkNavIdentifierMonitor.set(false);
    this.exitingHoldAtFixState.set(false);
    this.exitingHoldAtInterceptState.set(false);
    this.gapInRouteAheadState.set(false);
    this.holdCourseState.set(false);
    this.interceptTooSharpMonitor.set(false);
    this.lpUnavailableUseLnavMdaMonitor.set(false);
    this.lpvUnavailableUseLVnavDaMonitor.set(false);
    this.lpvUnavailableUseLnavMdaMonitor.set(false);
    this.lVNavUnavailableUseLnavMdaMonitor.set(false);
    this.nextLegCourseState.set(false);
    this.parallelEntryState.set(false);
    this.setCourseMonitor.set(false);
    this.teardropEntryState.set(false);
  }

  /**
   * Checks if an approach is authorised for GNSS/FMS only.
   * @param type The approach type.
   * @returns true if the approach is authorised for GNSS/FMS only.
   */
  private static isAuthorisedForFmsApproach(type: IfdApproachType): boolean {
    // The sim is missing the GNSS/FMS indicator field (ARINC424 5.222),
    // so we assume only localizer approaches are not authorised for overlay.

    switch (type) {
      case ApproachType.APPROACH_TYPE_ILS:
      case ApproachType.APPROACH_TYPE_LDA:
      case ApproachType.APPROACH_TYPE_LOCALIZER:
      case ApproachType.APPROACH_TYPE_LOCALIZER_BACK_COURSE:
      case ApproachType.APPROACH_TYPE_SDF:
        return false;
      default:
        return true;
    }
  }

  /**
   * Checks if the approach condition for navaid checks is met.
   * @returns true if the condition to check navaids is met.
   */
  private isApproachNavaidConditionMet(): boolean {
    if (!this.approachDetails.isLoaded ||
      !this.approachDetails.referenceFacility ||
      !CasNavigationMonitor.isAuthorisedForFmsApproach(this.approachDetails.type) ||
      !this.flightPlanner.hasActiveFlightPlan()
    ) {
      return false;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();

    const fafDistance = this.getDistanceToFaf(plan);
    if (fafDistance === undefined || fafDistance > 4) {
      return false;
    }

    const finalApproachCourseTrue = this.getFinalApproachCourse(plan);
    if (finalApproachCourseTrue === undefined) {
      return false;
    }

    if (Math.abs(NavMath.diffAngle(finalApproachCourseTrue, this.lnavDesiredTrackTrue.get())) > 45) {
      return false;
    }

    const trackTrue = this.gnssTrackTrue.get();
    if (trackTrue === null || Math.abs(NavMath.diffAngle(finalApproachCourseTrue, trackTrue)) > 45) {
      return false;
    }

    return true;
  }

  /**
   * Gets the direct distance to the final approach fix.
   * @param plan The flight plan to check.
   * @returns The distance to the FAF in nautical miles, or undefined if FAF not found or data invalid.
   */
  private getDistanceToFaf(plan: FlightPlan): number | undefined {
    if (!this.gnssPosition.isValid()) {
      return undefined;
    }

    let faf: LegDefinition | undefined;

    for (const leg of plan.legs(true)) {
      if (BitFlags.isAll(leg.leg.fixTypeFlags, FixTypeFlags.FAF)) {
        faf = leg;
        break;
      }
    }

    if (faf && faf.calculated && faf.calculated.endLat !== undefined && faf.calculated.endLon !== undefined) {
      return UnitType.NMILE.convertFrom(this.gnssPosition.distance(faf.calculated.endLat, faf.calculated.endLon), UnitType.GA_RADIAN);
    }

    return undefined;
  }

  /**
   * Gets the final approach course for the first MAP beyond the plane.
   * @param plan The plan to check.
   * @returns The final approach course in degrees true, or undefined if MAP not found in front of plane.
   */
  private getFinalApproachCourse(plan: FlightPlan): number | undefined {
    let map: LegDefinition | undefined;

    for (const leg of plan.legs(false, plan.activeLateralLeg)) {
      if (BitFlags.isAll(leg.leg.fixTypeFlags, FixTypeFlags.MAP)) {
        map = leg;
        break;
      }
    }

    return map?.calculated?.initialDtk !== undefined ? MagVar.magneticToTrue(map.calculated.initialDtk, map.calculated.courseMagVar) : undefined;
  }

  /**
   * Updates the approach-related navaid alerts.
   */
  private updateNavaidAlerts(): void {
    if (!this.isApproachNavaidConditionMet() || !this.approachDetails.referenceFacility) {
      this.checkNavFrequencyMonitor.set(false);
      this.checkNavIdentifierMonitor.set(false);
      return;
    }

    const navFrequencyTuned = Math.abs(this.navFrequency!.get() - this.approachDetails.referenceFacility.freqMHz) < 0.005;
    this.checkNavFrequencyMonitor.set(!navFrequencyTuned);
    this.checkNavIdentifierMonitor.set(navFrequencyTuned && this.navIdent!.get() !== this.approachDetails.referenceFacility.icaoStruct.ident);
  }

  /**
   * Updates the approach-related navaid alerts.
   */
  private updateApproachAlerts(): void {
    const currentServiceLevel = this.gpComputer.gpServiceLevel.get();
    const nominalServiceLevel = this.gpComputer.gpNominalServiceLevel.get();

    this.lpUnavailableUseLnavMdaMonitor.set(
      nominalServiceLevel === GlidepathServiceLevel.LpPlusV &&
      (currentServiceLevel === GlidepathServiceLevel.LNavPlusV || currentServiceLevel === GlidepathServiceLevel.LNavPlusVBaro)
    );

    this.lpvUnavailableUseLVnavDaMonitor.set(
      nominalServiceLevel === GlidepathServiceLevel.Lpv &&
      (currentServiceLevel === GlidepathServiceLevel.LNavVNav || currentServiceLevel === GlidepathServiceLevel.LNavVNavBaro)
    );

    this.lpvUnavailableUseLnavMdaMonitor.set(
      nominalServiceLevel === GlidepathServiceLevel.Lpv &&
      (currentServiceLevel === GlidepathServiceLevel.LNavPlusV || currentServiceLevel === GlidepathServiceLevel.LNavPlusVBaro)
    );

    this.lVNavUnavailableUseLnavMdaMonitor.set(
      (nominalServiceLevel === GlidepathServiceLevel.LNavVNav || nominalServiceLevel === GlidepathServiceLevel.LNavVNavBaro) &&
      (currentServiceLevel === GlidepathServiceLevel.LNavPlusV || currentServiceLevel === GlidepathServiceLevel.LNavPlusVBaro)
    );
  }

  /**
   * Checks if manual sequencing is required.
   */
  private checkManualSequence(): void {
    const leg = this.store.activeLeg.get();
    this.manualSequenceRequiredState.set(!!leg && FlightPlanUtils.isAltitudeLeg(leg.leg.type) && this.lnavSuspended.get());
  }

  /**
   * Handles changes to the direct to data.
   * @param legIndices The leg indices of the direct to.
   */
  private onDirectToDataChanged(legIndices: DirectToData): void {
    if (legIndices.segmentIndex < 0 || legIndices.segmentLegIndex < 0 || !this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();

    const targetLeg = plan.getLeg(legIndices);
    const nextLeg = plan.getNextLeg(legIndices);
    if (nextLeg && BitFlags.isAll(targetLeg.leg.fixTypeFlags, FixTypeFlags.FAF)) {
      Wait.awaitCondition(() => targetLeg.calculated !== undefined && nextLeg.calculated !== undefined, 0, 5000).then(() => {
        if (
          targetLeg.calculated?.initialDtk !== undefined && nextLeg.calculated?.initialDtk !== undefined &&
          Math.abs(NavMath.diffAngle(targetLeg.calculated.initialDtk, nextLeg.calculated.initialDtk)) > 45
        ) {
          this.interceptTooSharpMonitor.set(true);
        }
      });
    }
  }
}

// SetCourseToX = 'advisory-set_course_to_x',

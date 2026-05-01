import {
  AltitudeRestrictionType, BitFlags, ConsumerValue, EventBus, FixTypeFlags, FlightPlan, FlightPlanner, FlightPlanSegment, FlightPlanSegmentType,
  FlightPlanUtils, GeoPoint, Instrument, LegDefinitionFlags, LegType, LNavEvents, LNavUtils, SubEvent, Subject, Subscribable, UnitType
} from '@microsoft/msfs-sdk';

import { FlightPlanIndex, Fms, FmsUtils, IfdDiscontinuityType } from '../Fms';
import { IfdOptions } from '../IfdOptions';
import { IfdApproachControlEvents, IfdApproachEvents } from './IfdApproachManager';

/** Manages the state of FMS hooks. */
export class FmsHooksManager implements Instrument {
  private static readonly ACTIVATE_APPROACH_FAF_DISTANCE = UnitType.GA_RADIAN.convertFrom(40, UnitType.NMILE);
  private static readonly SKIP_HOLD_FAF_DISTANCE = UnitType.GA_RADIAN.convertFrom(5, UnitType.NMILE);

  private readonly aircraftPosition = new GeoPoint(NaN, NaN);

  private readonly isLnavSuspended = ConsumerValue.create(this.bus.getSubscriber<LNavEvents>().on(`lnav_is_suspended${LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex)}`), false);

  private readonly _isActivateApproachEnabled = Subject.create(false);
  /** Whether the "Active Approach" FMS hook is enabled. */
  public readonly isActivateApproachEnabled: Subscribable<boolean> = this._isActivateApproachEnabled;

  private readonly _isRetryApproachEnabled = Subject.create(false);
  /** Whether the "Retry Approach" FMS hook is enabled. */
  public readonly isRetryApproachEnabled: Subscribable<boolean> = this._isRetryApproachEnabled;

  private readonly _isEnableMissedEnabled = Subject.create(false);
  /** Whether the "Enable Missed" FMS hook is enabled. */
  public readonly isEnableMissedEnabled: Subscribable<boolean> = this._isEnableMissedEnabled;

  private readonly _isDisableMissedEnabled = Subject.create(false);
  /** Whether the "Disable Missed" FMS hook is enabled. */
  public readonly isDisableMissedEnabled: Subscribable<boolean> = this._isDisableMissedEnabled;

  private readonly _isContinueHoldEnabled = Subject.create(false);
  /** Whether the "Continue Hold" FMS hook is enabled. */
  public readonly isContinueHoldEnabled: Subscribable<boolean> = this._isContinueHoldEnabled;

  private readonly _isDeleteHoldEnabled = Subject.create(false);
  /** Whether the "Delete Hold" FMS hook is enabled. */
  public readonly isDeleteHoldEnabled: Subscribable<boolean> = this._isDeleteHoldEnabled;

  private readonly _isExitHoldEnabled = Subject.create(false);
  /** Whether the "Exit Hold" FMS hook is enabled. */
  public readonly isExitHoldEnabled: Subscribable<boolean> = this._isExitHoldEnabled;

  private readonly _isSkipHoldEnabled = Subject.create(false);
  /** Whether the "Skip Hold" FMS hook is enabled. */
  public readonly isSkipHoldEnabled: Subscribable<boolean> = this._isSkipHoldEnabled;

  private readonly _isSequenceLegEnabled = Subject.create(false);
  /** Whether the "Sequence Leg" FMS hook is enabled. */
  public readonly isSequenceLegEnabled: Subscribable<boolean> = this._isSequenceLegEnabled;

  private readonly _isConnectLegsEnabled = Subject.create(false);
  /** Whether the "Connect <a> and <b>" FMS hook is enabled. */
  public readonly isConnectLegsEnabled: Subscribable<boolean> = this._isConnectLegsEnabled;

  private readonly _isDeleteWaypointEnabled = Subject.create(false);
  /** Whether the "Delete Waypoint" FMS hook is enabled. */
  public readonly isDeleteWaypointEnabled: Subscribable<boolean> = this._isDeleteWaypointEnabled;

  private readonly _isDeleteConstraintEnabled = Subject.create(false);
  /** Whether the "Delete Constraint" FMS hook is enabled. */
  public readonly isDeleteConstraintEnabled: Subscribable<boolean> = this._isDeleteConstraintEnabled;

  private readonly _isEnableApAprEnabled = Subject.create(false);
  /** Whether the "Enable A/P Approach" FMS hook is enabled. */
  public readonly isEnableApAprEnabled: Subscribable<boolean> = this._isEnableApAprEnabled;

  private readonly approachPrompt = ConsumerValue.create(this.bus.getSubscriber<IfdApproachEvents>().on('approach_prompt'), false);

  private readonly allHooks = [
    this._isActivateApproachEnabled,
    this._isRetryApproachEnabled,
    this._isEnableMissedEnabled,
    this._isDisableMissedEnabled,
    this._isContinueHoldEnabled,
    this._isDeleteHoldEnabled,
    this._isExitHoldEnabled,
    this._isSkipHoldEnabled,
    this._isSequenceLegEnabled,
    this._isConnectLegsEnabled,
    this._isDeleteWaypointEnabled,
    this._isDeleteConstraintEnabled,
    this._isEnableApAprEnabled,
  ];

  public readonly onHookStateChanged = new SubEvent();

  private selectedGlobalLegIndex = -1;

  /**
   * Ctor.
   * @param bus the event bus to use.
   * @param fms The FMS to use.
   * @param flightPlanner The flight planner to use.
   * @param ifdOptions The instrument config options.
   */
  constructor(private readonly bus: EventBus, private readonly fms: Fms, private readonly flightPlanner: FlightPlanner, private readonly ifdOptions: IfdOptions) {

  }

  /** @inheritdoc */
  public init(): void {
    const triggerHookChanged = (): void => this.onHookStateChanged.notify(this, undefined);
    for (let i = 0; i < this.allHooks.length; i++) {
      this.allHooks[i].sub(triggerHookChanged);
    }
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.flightPlanner.hasActiveFlightPlan()) {
      this.resetAllHooks();
      return;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();
    const activeLeg = plan.tryGetLeg(plan.activeLateralLeg);
    const activeSegmentIndex = plan.getSegmentIndex(plan.activeLateralLeg);
    const activeSegmentLegIndex = plan.getSegmentLegIndex(plan.activeLateralLeg);
    if (!activeLeg || activeSegmentIndex < 0) {
      this.resetAllHooks();
      return;
    }

    const activeSegment = plan.getSegment(activeSegmentIndex);
    const nextLeg = plan.getNextLeg(activeSegmentIndex, activeSegmentLegIndex);
    const selectedLeg = plan.tryGetLeg(this.selectedGlobalLegIndex);
    const selectedSegment = selectedLeg ? plan.getSegmentFromLeg(selectedLeg) : null;
    const selectedLegIndex = plan.getSegmentLegIndex(this.selectedGlobalLegIndex);

    const nextApproachSegment = this.getNextApproachSegment(plan);

    // activate approach
    if (nextApproachSegment && nextApproachSegment.segmentIndex > activeSegmentIndex && nextApproachSegment.legs.length > 0) {
      const approachStartsWithDiscont = FlightPlanUtils.isDiscontinuityLeg(nextApproachSegment.legs[0].leg.type);
      const faf = nextApproachSegment.legs.find((l) => BitFlags.isAll(l.leg.fixTypeFlags, FixTypeFlags.FAF));

      this._isActivateApproachEnabled.set(
        approachStartsWithDiscont && (
          nextApproachSegment.offset - 1 === plan.activeLateralLeg ||
          (faf?.calculated?.endLat !== undefined && faf?.calculated?.endLon !== undefined && this.aircraftPosition.isValid() &&
            this.aircraftPosition.distance(faf.calculated.endLat, faf.calculated.endLon) < FmsHooksManager.ACTIVATE_APPROACH_FAF_DISTANCE)
        )
      );
    } else {
      this._isActivateApproachEnabled.set(false);
    }

    // retry approach
    if (activeSegment.segmentType === FlightPlanSegmentType.MissedApproach) {
      this._isRetryApproachEnabled.set(FmsUtils.isVtfApproachLoaded(plan));
    } else {
      this._isRetryApproachEnabled.set(false);
    }

    // enable/disable missed approach
    if (
      selectedSegment?.segmentType === FlightPlanSegmentType.MissedApproach &&
      nextLeg && activeSegment.segmentType === FlightPlanSegmentType.Approach && BitFlags.isAll(nextLeg.flags, LegDefinitionFlags.MissedApproach)
    ) {
      const mapEnabled = this.fms.isMissedApproachActivated();
      this._isEnableMissedEnabled.set(!mapEnabled);
      this._isDisableMissedEnabled.set(mapEnabled);
    } else {
      this._isEnableMissedEnabled.set(false);
      this._isDisableMissedEnabled.set(false);
    }

    // continue/exit hold
    if (nextLeg && FlightPlanUtils.isHoldLeg(activeLeg.leg.type) && activeLeg === selectedLeg) {
      const isLnavSuspended = this.isLnavSuspended.get();
      this._isContinueHoldEnabled.set(!isLnavSuspended);
      this._isExitHoldEnabled.set(isLnavSuspended);
    } else {
      this._isContinueHoldEnabled.set(false);
      this._isExitHoldEnabled.set(false);
    }

    // delete hold
    this._isDeleteHoldEnabled.set(
      !!selectedLeg && !!selectedSegment && selectedLeg.leg.type === LegType.HM &&
      (selectedSegment.segmentType === FlightPlanSegmentType.Enroute || selectedSegment.segmentType === FlightPlanSegmentType.MissedApproach)
    );

    // skip hold
    if (nextLeg && nextLeg.leg.type === LegType.HF && nextApproachSegment) {
      const faf = nextApproachSegment.legs.find((l) => BitFlags.isAll(l.leg.fixTypeFlags, FixTypeFlags.FAF));

      this._isSkipHoldEnabled.set(
        faf?.calculated?.endLat !== undefined && faf?.calculated?.endLon !== undefined && this.aircraftPosition.isValid() &&
        this.aircraftPosition.distance(faf.calculated.endLat, faf.calculated.endLon) < FmsHooksManager.SKIP_HOLD_FAF_DISTANCE
      );
    } else {
      this._isSkipHoldEnabled.set(false);
    }

    // sequence leg
    this._isSequenceLegEnabled.set(this.ifdOptions.airData?.altimeterIndex === undefined && FlightPlanUtils.isAltitudeLeg(activeLeg.leg.type));

    // connect legs - one of them must be enroute, and both must terminate at a fix
    if (selectedLeg && selectedSegment && selectedLeg.userData?.discontinuityType === IfdDiscontinuityType.GapInRoute) {
      const legBeforeSelected = plan.getPrevLeg(selectedSegment.segmentIndex, selectedLegIndex);
      const legAfterSelected = plan.getNextLeg(selectedSegment.segmentIndex, selectedLegIndex);
      if (legBeforeSelected && legAfterSelected &&
        (FlightPlanUtils.isToFixLeg(legBeforeSelected.leg.type) || FlightPlanUtils.isHoldLeg(legBeforeSelected.leg.type)) &&
        (FlightPlanUtils.isToFixLeg(legAfterSelected.leg.type) || FlightPlanUtils.isHoldLeg(legAfterSelected.leg.type))
      ) {
        const prevSegment = plan.getSegmentFromLeg(legBeforeSelected);
        const nextSegment = plan.getSegmentFromLeg(legAfterSelected);
        this._isConnectLegsEnabled.set(prevSegment?.segmentType === FlightPlanSegmentType.Enroute || nextSegment?.segmentType === FlightPlanSegmentType.Enroute);
      } else {
        this._isConnectLegsEnabled.set(false);
      }
    } else {
      this._isConnectLegsEnabled.set(false);
    }

    // delete waypoint
    this._isDeleteWaypointEnabled.set(!!selectedSegment && selectedLegIndex >= 0 && FmsUtils.canDeleteLeg(plan, selectedSegment.segmentIndex, selectedLegIndex, false));

    // delete constraint
    this._isDeleteConstraintEnabled.set(
      !!selectedLeg && selectedLeg.verticalData.altDesc !== AltitudeRestrictionType.Unused &&
      !FlightPlanUtils.isAltitudeLeg(selectedLeg.leg.type) && selectedLeg.leg.type !== LegType.HA
    );

    // enable a/p approach
    this._isEnableApAprEnabled.set(this.approachPrompt.get());
  }

  /**
   * Gets the next approach segment (or active segment if it is an approach) after the active leg.
   * @param plan The flight plan to check.
   * @returns The next (or active) approach segment, or null if there isn't one.
   */
  private getNextApproachSegment(plan: FlightPlan): FlightPlanSegment | null {
    const activeSegmentIndex = plan.getSegmentIndex(plan.activeLateralLeg);
    for (let i = activeSegmentIndex; i < plan.segmentCount; i++) {
      const segment = plan.getSegment(i);
      if (segment.segmentType === FlightPlanSegmentType.Approach) {
        return segment;
      }
    }

    return null;
  }

  /**
   * Gets the previous approach segment before the active leg. It's assumed the active leg is the missed approach.
   * @param plan The flight plan to check.
   * @returns The previous approach segment, or null if there isn't one.
   */
  private getPreviousApproachSegment(plan: FlightPlan): FlightPlanSegment | null {
    const activeSegmentIndex = plan.getSegmentIndex(plan.activeLateralLeg);
    for (let i = activeSegmentIndex - 1; i >= 0; i--) {
      const segment = plan.getSegment(i);
      if (segment.segmentType === FlightPlanSegmentType.Approach) {
        return segment;
      }
    }

    return null;
  }

  /** Resets all hooks. */
  private resetAllHooks(): void {
    for (let i = 0; i < this.allHooks.length; i++) {
      this.allHooks[i].set(false);
    }
  }

  /**
   * Sets the global leg index of the item currently selected in the FPL pane, or -1 if none.
   * @param globalLegIndex The global leg index.
   */
  public setSelectedLegIndex(globalLegIndex: number): void {
    this.selectedGlobalLegIndex = globalLegIndex;
  }

  /** Activates the approach when that hook is enabled. */
  public activateApproach = (): void => {
    if (!this._isActivateApproachEnabled.get() || !this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    if (this.fms.isApproachVtf()) {
      this.fms.activateVtf();
    } else {
      this.fms.activateApproach();
    }
  };

  /** Retries the approach when that hook is enabled. */
  public retryApproach = (): void => {
    if (!this._isRetryApproachEnabled.get() || !this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    if (this.fms.isApproachVtf()) {
      this.fms.activateVtf();
    } else {
      this.fms.activateApproach();
    }
  };

  /** Disables sequencing of the missed approach when that hook is enabled. */
  public disableMissed = (): void => {
    if (!this._isDisableMissedEnabled.get()) {
      return;
    }

    this.fms.deactivateMissedApproach();
  };

  /** Enables sequencing of the missed approach when that hook is enabled. */
  public enableMissed = (): void => {
    if (!this._isEnableMissedEnabled.get()) {
      return;
    }

    this.fms.activateMissedApproach();
  };

  /** Disables sequencing when that hook is enabled. */
  public continueHold = (): void => {
    if (!this._isContinueHoldEnabled.get()) {
      return;
    }

    this.fms.suspendSequencing();
  };

  /** Deletes the hold when that hook is enabled. */
  public deleteHold = (): void => {
    if (!this._isDeleteHoldEnabled.get() || !this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();

    const segmentIndex = plan.getSegmentIndex(this.selectedGlobalLegIndex);
    const segmentLegIndex = plan.getSegmentLegIndex(this.selectedGlobalLegIndex);
    const leg = plan.tryGetLeg(this.selectedGlobalLegIndex);

    if (!leg || !FlightPlanUtils.isHoldLeg(leg.leg.type) || segmentIndex < 0 || segmentLegIndex < 0) {
      return;
    }

    this.fms.planRemoveLeg(segmentIndex, segmentLegIndex);
  };

  /** Enables sequencing when that hook is enabled. */
  public exitHold = (): void => {
    if (!this._isExitHoldEnabled.get()) {
      return;
    }

    this.fms.resumeSequencing();
  };

  /** Skips to the leg after the hold when that hook is enabled. */
  public skipHold = (): void => {
    if (!this._isSkipHoldEnabled.get()) {
      return;
    }

    this.tryIncrementActiveLeg(2);
    this.fms.resumeSequencing();
  };

  /** Sequences the current leg when that hook is enabled. */
  public sequenceLeg = (): void => {
    if (!this._isSequenceLegEnabled.get()) {
      return;
    }

    this.tryIncrementActiveLeg(1);
    this.fms.resumeSequencing();
  };

  /** Deletes the altitude constraint on the selected leg. */
  public deleteConstraint = (): void => {
    if (!this._isDeleteConstraintEnabled.get() || !this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();

    const segmentIndex = plan.getSegmentIndex(this.selectedGlobalLegIndex);
    const segmentLegIndex = plan.getSegmentLegIndex(this.selectedGlobalLegIndex);

    if (segmentIndex < 0 || segmentLegIndex < 0) {
      return;
    }

    this.fms.removeConstraint(segmentIndex, segmentLegIndex);
  };

  public enableApApproach = (): void => {
    if (!this._isEnableApAprEnabled.get()) {
      return;
    }

    this.bus.getPublisher<IfdApproachControlEvents>().pub('approach_prompt_acknowledge', true, false, false);
  };

  /**
   * Tries to increment the active leg in the flightplan.
   * @param increment How much to increment the active leg by.
   */
  private tryIncrementActiveLeg(increment: number): void {
    if (!this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();

    this.trySetActiveLeg(plan.activeLateralLeg + increment);
  }

  /**
   * Tries to set the active leg in the flightplan.
   * @param globalLegIndex The leg index to set active.
   */
  private trySetActiveLeg(globalLegIndex: number): void {
    if (!this.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();

    if (globalLegIndex < 0 || globalLegIndex >= plan.length) {
      return;
    }

    plan.setCalculatingLeg(globalLegIndex);
    plan.setLateralLeg(globalLegIndex);
    plan.calculate(FlightPlanIndex.Active);
  }
}

import {
  Accessible, ActiveLegType, AdcEvents, AdditionalApproachType, AirportFacility, AirportFacilityDataFlags, AirwayData,
  AltitudeRestrictionType, ApproachProcedure, ApproachUtils, BitFlags, ConsumerSubject, ConsumerValue, ControlEvents,
  DefaultFacilityWaypointCache, EventBus, ExistingUserWaypointsArray, ExtendedApproachType, Facility, FacilityLoader,
  FacilityRepository, FacilityType, FacilityUtils, FacilityWaypoint, FixTypeFlags, FlightPlan,
  FlightPlanCalculatedEvent, FlightPlanCopiedEvent, FlightPlanLeg, FlightPlanLegIndexes, FlightPlanner, FlightPlannerEvents,
  FlightPlanOriginDestEvent, FlightPlanSegment, FlightPlanSegmentType, FlightPlanUtils, GeoPoint, GeoPointInterface,
  GNSSEvents, ICAO, IcaoType, IcaoValue, IntersectionFacility, LegDefinition, LegDefinitionFlags, LegTurnDirection,
  LegType, LNavEvents, MagVar, NavEvents, NavMath, NavSourceId, NavSourceType, OneWayRunway, RnavTypeFlags, RunwayUtils,
  SmoothingPathCalculator, SpeedRestrictionType, SpeedUnit, SubscribableArray, UnitType, UserFacility, VerticalData,
  VerticalFlightPhase, VerticalFlightPlan, VisualFacility, VNavUtils, VorFacility,
} from '@microsoft/msfs-sdk';

import {
  ApproachDetails, FlightPlanIndexType, FlightPlanIndexTypes, MainFlightPlanIndexType, WTLineLegacyFlightPlans,
} from './WTLineFmsTypes';
import { WTLineFlightPlanEditBatch } from './WTLineFlightPlanEditContracts';
import { CDIScaleLabel, WTLineLNavDataEvents } from '../autopilot/WTLineLNavDataEvents';
import { FmcSimVarEvents } from '../publishers/FmcSimVars';
import { WT21LegDefinitionFlags, WTLineFmsUtils } from './WTLineFmsUtils';
import { WTLineControlEvents } from '../publishers/WTLineControlEvents';
import { WTLineFixInfoManager } from './WTLineFixInfoManager';
import { WT21VNavDataEvents } from '../navigation/WT21VnavEvents';
import { WTLineFacilityUtils } from '../navigation/WTLineFacilityUtils';
import { WTLineFlightPlanRepository } from './WTLineFlightPlanRepository';

export enum DirectToState {
  NONE,
  TOEXISTING
}

export enum AirwayLegType {
  NONE,
  ENTRY,
  EXIT,
  ONROUTE,
  EXIT_ENTRY
}

/**
 * A leg in an insert procedure object.
 */
type InsertProcedureObjectLeg = FlightPlanLeg & {
  /** Leg definition flags to apply when adding the leg to the flight plan. */
  legDefinitionFlags?: number;
};

/**
 * A type definition for inserting procedure legs and runway, if it exists.
 */
type InsertProcedureObject = {
  /** The Procedure Legs */
  procedureLegs: InsertProcedureObjectLeg[],
  /** The OneWayRunway Object if it exists */
  runway?: OneWayRunway
}

/**
 * Facility and runway information for the flight.
 */
export type FacilityInfo = {
  /** Facility info for the origin airport. */
  originFacility: AirportFacility | undefined;
  /** Facility info for the destination airport. */
  destinationFacility: AirportFacility | undefined;
}

/**
 * A WT 21 FMS
 */
export class WTLineFms<T extends FlightPlanIndexTypes<number, number>> {
  private static readonly legIndicesCache: FlightPlanLegIndexes = { segmentIndex: -1, segmentLegIndex: -1 };

  /** Set to true by FMC pages when the plan on this FMS instance is in modification and awaiting a cancel or exec. */
  public readonly planInMod = this.flightPlanRepo.planInMod;

  /** Set to true when an event is received from the bus indicating that another instrument is in MOD on the plan. */
  public remotePlanInMod = false;

  public readonly ppos = new GeoPoint(0, 0);

  private readonly facRepo = FacilityRepository.getRepository(this.bus);

  public readonly userFacilities = new ExistingUserWaypointsArray(
    this.facRepo,
    this.bus,
    DefaultFacilityWaypointCache.getCache(this.bus),
    { scope: WTLineFacilityUtils.USER_FACILITY_SCOPE },
  );

  /**
   * Information on our origin, arrival and destination facilities to save lookups.
   * When in MOD, this will reflect the current origin and destination in the MOD plan.
   *
   * @deprecated look facilities up using facLoader instead - they are cached anyway, and this does not support the secondary plan
   */
  public facilityInfo: FacilityInfo = {
    originFacility: undefined,
    destinationFacility: undefined
  };

  public approachDetails: ApproachDetails = {
    approachLoaded: false,
    approachType: ApproachType.APPROACH_TYPE_UNKNOWN,
    approachRnavType: RnavTypeFlags.None,
    approachIsActive: false,
    approachIsCircling: false,
    referenceFacility: null,
  };

  /** Current true aircraft track */
  private aircraftTrack: number | undefined = undefined;

  /** Current aircraft indicated altitude */
  private aircraftAltitude: number | undefined = undefined;

  private cdiSource: NavSourceId = { type: NavSourceType.Gps, index: 1 };
  private missedApproachActive = false;

  /** Set to true when a leg is activated,
   * meaning that sequencing should be resumed once EXEC is pressed.
   * Should be reset whenever leaving MOD. */
  private legWasActivatedInModPlan = false;

  /** Set to true when a new DTO is created,
   * meaning its origin should be regularly updated while in MOD and when hitting EXEC.
   * Should be reset whenever leaving MOD. */
  private dtoWasCreatedInModPlan = false;

  /** Set to true when a new vertical DTO is created,
   * meaning its origin should be regularly updated while in MOD and when hitting EXEC.
   * Should be reset whenever leaving MOD. */
  public verticalDtoWasCreatedInModPlan = false;


  /**
   * Set to true when the vertical DTO in the mod flight plan was automatic
   */
  public verticalDtoWasCreatedInModPlanWasAutomatic = false;

  private readonly cdiScaleLabel: ConsumerSubject<CDIScaleLabel>;

  public readonly lnavTrackedLegIndex: Accessible<number>;
  public readonly lnavLegDistanceAlong: Accessible<number>;
  public readonly lnavLegDistanceRemaining: Accessible<number>;

  /**
   * Initialize an instance of the FMS for the WT21.
   * @param bus is the event bus
   * @param facLoader The facility loader.
   * @param flightPlanner is the flight planner
   * @param verticalPathCalculator is the VNAV Path Calculator.
   * @param fixInfo The fix info manager.
   * @param flightPlanRepo The flight plan repository.
   */
  constructor(
    public readonly bus: EventBus,
    public readonly facLoader: FacilityLoader,
    public readonly flightPlanner: FlightPlanner,
    public readonly verticalPathCalculator: SmoothingPathCalculator,
    public readonly fixInfo: WTLineFixInfoManager,
    protected readonly flightPlanRepo: WTLineFlightPlanRepository<FlightPlanIndexType<T>, MainFlightPlanIndexType<T>>,
  ) {
    this.cdiScaleLabel = ConsumerSubject.create(this.bus.getSubscriber<WTLineLNavDataEvents>().on('lnavdata_cdi_scale_label'), 4);

    this.lnavTrackedLegIndex = ConsumerValue.create(this.bus.getSubscriber<LNavEvents>().on('lnav_tracked_leg_index'), 0);
    this.lnavLegDistanceAlong = ConsumerValue.create(this.bus.getSubscriber<LNavEvents>().on('lnav_leg_distance_along'), 0);
    this.lnavLegDistanceRemaining = ConsumerValue.create(this.bus.getSubscriber<LNavEvents>().on('lnav_leg_distance_remaining'), 0);

    this.bus.getSubscriber<GNSSEvents>().on('track_deg_true').handle((track) => this.aircraftTrack = track);
    this.bus.getSubscriber<AdcEvents>().on('indicated_alt').handle((track) => this.aircraftAltitude = track);
    this.bus.getSubscriber<NavEvents>().on('cdi_select').handle(source => this.cdiSource = source);

    const planEvents = this.bus.getSubscriber<FlightPlannerEvents>();
    planEvents.on('fplActiveLegChange').handle(data => this.onActiveLegChanged(data.type, data.planIndex));
    planEvents.on('fplLoaded').handle(this.onPlanLoaded);
    planEvents.on('fplCalculated').handle(this.onPlanCalculated);
    planEvents.on('fplCopied').handle(this.onPlanCopied);
    planEvents.on('fplOriginDestChanged').handle(this.onOriginDestinationChanged);

    this.planInMod.sub((v) => {
      if (v) {
        SimVar.SetSimVarValue('L:FMC_EXEC_ACTIVE', 'number', 1);
      } else {
        SimVar.SetSimVarValue('L:FMC_EXEC_ACTIVE', 'number', 0);
      }
    }, true);

    this.planInMod.sub((v) => {
      if (!v) {
        // Need to update facility info on CANCEL MOD
        this.setFacilityInfo();
      }
    });

    this.bus.getSubscriber<FmcSimVarEvents>().on('fmcExecActive').whenChanged().handle((v) => {
      const state = v === 1;
      this.remotePlanInMod = state;
    });

    this.bus.getSubscriber<WTLineControlEvents>().on('approach_details_set').handle(this.onApproachDetailsSet);

    this.cdiScaleLabel.sub(v => {
      const canApproachActivate = this.canApproachActivate(v);
      if (canApproachActivate !== this.approachDetails.approachIsActive) {
        this.setApproachDetails(undefined, undefined, undefined, canApproachActivate);
      }
    });

  }

  /**
   * Initializes and empties the flight plans used by the FMS
   */
  public async initFlightPlans(): Promise<void> {
    this.flightPlanRepo.initFlightPlans();
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public getCdiSource(): NavSourceId {
    return this.cdiSource;
  }

  /**
   * Checks whether an indexed flight plan exists.
   * @param index A flight plan index.
   * @returns Whether a flight plan at the specified index exists.
   */
  public hasFlightPlan(index: number): boolean {
    return this.flightPlanner.hasFlightPlan(index);
  }

  /**
   * Gets a specified flightplan, or by default the primary flight plan.
   * @param index The index of the flight plan.
   * @returns the requested flight plan
   * @throws Error if no flight plan exists at the specified index.
   */
  public getFlightPlan(index = WTLineLegacyFlightPlans.Active): FlightPlan {
    return this.flightPlanner.getFlightPlan(index);
  }

  /**
   * Checks whether the primary flight plan exists.
   * @returns Whether the primary flight plan exists.
   */
  public hasPrimaryFlightPlan(): boolean {
    return this.flightPlanner.hasFlightPlan(WTLineLegacyFlightPlans.Active);
  }

  /**
   * Gets the primary lateral flight plan.
   * @returns The primary flight plan.
   * @throws Error if the primary flight plan does not exist.
   */
  public getPrimaryFlightPlan(): FlightPlan {
    return this.flightPlanner.getFlightPlan(WTLineLegacyFlightPlans.Active);
  }

  /**
   * Gets the primary vertical flight plan.
   * @returns the primary vertical flight plan.
   */
  private getPrimaryVerticalFlightPlan(): VerticalFlightPlan {
    return this.verticalPathCalculator.getVerticalFlightPlan(WTLineLegacyFlightPlans.Active);
  }

  /**
   * Checks whether the Primary Mod Flight Plan Exists - when modifications to the plan are being made.
   * @returns Whether the Primary Mod Flight Plan Exists flight plan exists.
   */
  public hasPrimaryModFlightPlan(): boolean {
    return this.flightPlanner.hasFlightPlan(WTLineLegacyFlightPlans.Mod);
  }

  /**
   * Gets the Primary Mod Flight Plan Exists - when modifications to the plan are being made.
   * @returns The Primary Mod Flight Plan.
   * @throws Error if the Primary Mod flight plan does not exist.
   */
  private getPrimaryModFlightPlan(): FlightPlan {
    return this.flightPlanner.getFlightPlan(WTLineLegacyFlightPlans.Mod);
  }

  /**
   * Gets the primary mod vertical flight plan.
   * @returns the primary mod vertical flight plan.
   */
  private getPrimaryModVerticalFlightPlan(): VerticalFlightPlan {
    return this.verticalPathCalculator.getVerticalFlightPlan(WTLineLegacyFlightPlans.Mod);
  }

  /**
   * Checks whether the Secondary Flight Plan Exists.
   * @returns Whether the Secondary Flight Plan Exists flight plan exists.
   */
  public hasSecondaryFlightPlan(): boolean {
    return this.flightPlanner.hasFlightPlan(WTLineLegacyFlightPlans.Secondary);
  }

  /**
   * Gets the secondary lateral flight plan.
   * @returns The secondary flight plan.
   * @throws Error if the secondary flight plan does not exist.
   */
  public getSecondaryFlightPlan(): FlightPlan {
    return this.flightPlanner.getFlightPlan(WTLineLegacyFlightPlans.Secondary);
  }

  /**
   * Gets the secondary vertical flight plan.
   * @returns the secondary vertical flight plan.
   */
  private getSecondaryVerticalFlightPlan(): VerticalFlightPlan {
    return this.verticalPathCalculator.getVerticalFlightPlan(WTLineLegacyFlightPlans.Secondary);
  }

  /**
   * Executes changes to the mod flight plan.
   */
  public execModFlightPlan(): void {
    // FIXME make work better with multiple plans

    if (this.planInMod.get()) {
      const modPlan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

      if (this.getDirectToState(WTLineLegacyFlightPlans.Mod) === DirectToState.TOEXISTING) {
        this.updateDtoOrigin(modPlan);
      }

      if (this.verticalDtoWasCreatedInModPlan) {
        this.updateVerticalDtoOrigin(modPlan);
      }

      // Make sure this is only reset after the call to updateDTOOrigin
      this.dtoWasCreatedInModPlan = false;
      this.verticalDtoWasCreatedInModPlan = false;
      this.verticalDtoWasCreatedInModPlanWasAutomatic = false;

      this.flightPlanRepo.copyModPlanIntoActivePlan();
      this.getPrimaryFlightPlan().calculate(0);
      this.flightPlanRepo.emptyOrDeleteModFlightPlans();
      this.planInMod.set(false);

      const actPlan = this.getPrimaryFlightPlan();

      if (this.verticalDtoWasCreatedInModPlan) {
        this.updateVerticalDtoOrigin(actPlan);
      }

      if (this.legWasActivatedInModPlan) {
        this.legWasActivatedInModPlan = false;
        this.resumeSequencing();
      }
    }
  }

  /**
   * Copies the active flight plan into the secondary flight plan.
   */
  public copyActivePlanIntoSecondaryPlan(): void {
    this.flightPlanRepo.copyActivePlanIntoSecondaryPlan();
  }

  /**
   * Activates the secondary flight plan.
   */
  public activateSecondaryPlan(): void {
    this.flightPlanRepo.activateSecondaryPlan();
  }

  /** Resumes flight plan sequencing. */
  private resumeSequencing(): void {
    this.bus.getPublisher<ControlEvents>().pub('suspend_sequencing', false, true);
  }

  /**
   * Handles when the CANCEL MOD button is pressed.
   *
   * FIXME make work with multiple plans
   */
  public cancelMod(): void {
    if (this.planInMod.get()) {
      this.legWasActivatedInModPlan = false;
      this.dtoWasCreatedInModPlan = false;
      this.flightPlanRepo.emptyOrDeleteModFlightPlans();

      this.planInMod.set(false);
    }
  }

  /**
   * Gets the current lateral flight plan index for the FMC pages based on whether the plan is in MOD or ACT.
   * @param mainPlanIndex the plan to target
   * @returns A Lateral Flight Plan
   */
  public getPlanIndexToDisplay(mainPlanIndex: FlightPlanIndexType<T>): FlightPlanIndexType<T> {
    return this.flightPlanRepo.getPlanIndexToDisplay(mainPlanIndex);
  }

  /**
   * Gets the current lateral flight plan for the FMC pages based on whether the plan is in MOD or ACT.
   * @param mainPlanIndex the in plan to target
   * @returns A Lateral Flight Plan
   */
  public getPlanToDisplay(mainPlanIndex: FlightPlanIndexType<T>): FlightPlan {
    return this.flightPlanRepo.getPlanToDisplay(mainPlanIndex);
  }

  /**
   * Gets the current vertical flight plan for the FMC pages based on whether the plan is in MOD or ACT.
   * @param mainPlanIndex the plan to target
   * @returns A Vertical Flight Plan
   */
  public getVerticalPlanToDisplay(mainPlanIndex: FlightPlanIndexType<T>): VerticalFlightPlan {
    if (mainPlanIndex === WTLineLegacyFlightPlans.Secondary) {
      return this.getSecondaryVerticalFlightPlan();
    }

    if (this.planInMod.get()) {
      return this.getPrimaryModVerticalFlightPlan();
    } else {
      return this.getPrimaryVerticalFlightPlan();
    }
  }

  /**
   * Gets the flight plan to edit depending on the desired plan on which to make a modification, taking into account MOD logic
   * @param index the index of the plan
   * @returns a flight plan
   */
  public getPlanToEdit(index: FlightPlanIndexType<T>): FlightPlan {
    return this.flightPlanRepo.getPlanToEdit(index);
  }

  /**
   * Checks whether the plan can go into MOD/be edited on this instance of WT21Fms.
   * @param mainPlanIndex the main plan index to query
   * @returns Whether to allow plan edits or not
   */
  public canEditPlan(mainPlanIndex: MainFlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): boolean {
    // We can always edit the secondary plan
    if (this.flightPlanRepo.isPlanIndexSecondaryPlan(mainPlanIndex)) {
      return true;
    }

    return !(this.remotePlanInMod && !this.planInMod.get());
  }

  private onOriginDestinationChanged = (e: FlightPlanOriginDestEvent): void => {
    if (e.planIndex === this.getPlanIndexToDisplay(WTLineLegacyFlightPlans.Active)) {
      this.setFacilityInfo();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onPlanCopied = (ev: FlightPlanCopiedEvent): void => {
    this.setFacilityInfo();
    this.ensureActiveHMSuspended();
  };

  private onPlanCalculated = (e: FlightPlanCalculatedEvent): void => {
    // FIXME clean this up
    if (e.planIndex === WTLineFmsUtils.PRIMARY_ACT_PLAN_INDEX && this.planInMod.get()) {
      const plan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

      if (this.verticalDtoWasCreatedInModPlan) {
        this.updateVerticalDtoOrigin(plan);
      }

      if (this.getDirectToState(WTLineFmsUtils.PRIMARY_MOD_PLAN_INDEX)) {
        this.updateDtoOrigin(plan);
      }

      this.tryUpdatePposHoldPosition(plan);
    }
  };

  private onPlanLoaded = (): void => {
    this.checkApproachState().then();
  };

  /**
   * Sets the Facility Info cache in the WT21Fms.
   */
  public async setFacilityInfo(): Promise<void> {
    const plan = this.getPlanToDisplay(WTLineLegacyFlightPlans.Active);

    if (this.facilityInfo.originFacility?.icao !== plan.originAirport) {
      if (plan.originAirport) {
        const facility = await this.facLoader.getFacility(FacilityType.Airport, plan.originAirport);
        this.facilityInfo.originFacility = facility ?? undefined;
      } else {
        this.facilityInfo.originFacility = undefined;
      }
    }
    if (this.facilityInfo.destinationFacility?.icao !== plan.destinationAirport) {
      if (plan.destinationAirport) {
        const facility = await this.facLoader.getFacility(FacilityType.Airport, plan.destinationAirport);
        this.facilityInfo.destinationFacility = facility ?? undefined;
      } else {
        this.facilityInfo.destinationFacility = undefined;
      }
    }
  }

  /**
   * After a plan copy, ensure that a now active HM causes a suspend
   */
  private ensureActiveHMSuspended(): void {
    const activeLegIndex = this.getPlanToDisplay(WTLineLegacyFlightPlans.Active).activeLateralLeg;
    const activeLeg = this.getPlanToDisplay(WTLineLegacyFlightPlans.Active).tryGetLeg(activeLegIndex === 0 ? 1 : activeLegIndex);

    // TODO considerations for hold exit
    if (activeLeg?.leg.type === LegType.HM) {
      this.bus.getPublisher<ControlEvents>().pub('suspend_sequencing', true);
    }
  }

  /**
   * Handles when a flight plan active leg changes.
   * @param legType The type of flight plan active leg change.
   * @param planIndex The index of the plan whose active leg changed.
   */
  private onActiveLegChanged(legType: ActiveLegType, planIndex: number): void {
    if (legType === ActiveLegType.Lateral && planIndex === 0) {
      const activePlan = this.flightPlanner.getActiveFlightPlan();
      if (activePlan.length < 1 || this.missedApproachActive) {
        this.setApproachDetails(undefined, undefined, undefined, false);
      }
    }
  }

  /**
   * A method to check the current approach state.
   */
  private async checkApproachState(): Promise<void> {
    const plan = this.getFlightPlan();
    let approachLoaded = false;
    let approachIsActive = false;
    let approachType: ExtendedApproachType | undefined;
    let approachRnavType: RnavTypeFlags | undefined;
    let approachIsCircling = false;
    let referenceFacility = null;
    if (plan.destinationAirport && (plan.procedureDetails.approachIndex > -1 || plan.getUserData('visual_approach') !== undefined)) {
      approachLoaded = true;
      if (plan.length > 0 && plan.activeLateralLeg < plan.length && plan.activeLateralLeg > 0) {
        const segment = plan.getSegment(plan.getSegmentIndex(plan.activeLateralLeg));
        approachIsActive = segment.segmentType === FlightPlanSegmentType.Approach;
      }
      if (plan.procedureDetails.approachIndex > -1) {
        const facility = await this.facLoader.getFacility(FacilityType.Airport, plan.destinationAirport);
        const approach = facility.approaches[plan.procedureDetails.approachIndex];
        if (approach) {
          approachType = approach.approachType;
          approachRnavType = WTLineFmsUtils.getBestRnavType(approach.rnavTypeFlags);
          approachIsCircling = !approach.runway;
          if (WTLineFmsUtils.approachHasNavFrequency(approach)) {
            referenceFacility = (await ApproachUtils.getReferenceFacility(approach, this.facLoader) as VorFacility | undefined) ?? null;
          }
        }
      } else {
        approachType = AdditionalApproachType.APPROACH_TYPE_VISUAL;
        approachRnavType = RnavTypeFlags.None;
      }

    }
    this.setApproachDetails(approachLoaded, approachType, approachRnavType, approachIsActive, approachIsCircling, referenceFacility);
  }

  /**
   * Removes the direct to existing legs from the primary flight plan. If a direct to existing is currently active,
   * this will effectively cancel it.
   * @param planIndex The flight plan index.
   * @param lateralLegIndex The index of the leg to set as the active lateral leg after the removal operation. Defaults
   * @param calculate Whether to calculate the flight plan
   * to the index of the current active primary flight plan leg.
   */
  private removeDirectToExisting(planIndex = WTLineFmsUtils.PRIMARY_MOD_PLAN_INDEX, lateralLegIndex?: number, calculate = true): void {
    const plan = this.getFlightPlan(planIndex);
    const directToData = plan.directToData;
    if (directToData && directToData.segmentIndex > -1) {
      plan.removeLeg(directToData.segmentIndex, directToData.segmentLegIndex + 1, true);
      plan.removeLeg(directToData.segmentIndex, directToData.segmentLegIndex + 1, true);
      plan.removeLeg(directToData.segmentIndex, directToData.segmentLegIndex + 1, true);

      const activateIndex = lateralLegIndex ?? plan.activeLateralLeg;
      const adjustedActivateIndex = activateIndex - Utils.Clamp(activateIndex - (plan.getSegment(directToData.segmentIndex).offset + directToData.segmentLegIndex), 0, 3);

      plan.setDirectToData(-1, true);
      plan.setCalculatingLeg(adjustedActivateIndex);
      plan.setLateralLeg(adjustedActivateIndex);

      if (calculate) {
        plan.calculate(0);
      }
    }
  }

  /**
   * Method to cleanup any legs in segments that exist after the Approach/Arrival Segments.
   * @param plan The Mod Flight Plan.
   */
  private cleanupLegsAfterApproach(plan: FlightPlan): void {
    if (plan.procedureDetails.arrivalIndex > -1 || plan.procedureDetails.approachIndex > -1 || plan.getUserData('visual_approach') !== undefined) {

      while (plan.getSegment(plan.segmentCount - 1).segmentType === FlightPlanSegmentType.Enroute) {
        this.planRemoveSegment(plan.planIndex, plan.segmentCount - 1);
      }
    }
  }

  /**
   * Checks whether a leg in the primary flight plan can be manually activated.
   * @param segmentIndex The index of the segment in which the leg resides.
   * @param segmentLegIndex The index of the leg in its segment.
   * @returns Whether the leg can be manually activated.
   */
  public canActivateLeg(segmentIndex: number, segmentLegIndex: number): boolean {
    const plan = this.getPrimaryFlightPlan();

    if (!plan) {
      return false;
    }

    const leg = plan.tryGetLeg(segmentIndex, segmentLegIndex);

    if (!leg || BitFlags.isAll(leg.flags, WT21LegDefinitionFlags.DirectTo) || leg === plan.getLeg(0)) {
      return false;
    }

    switch (leg.leg.type) {
      case LegType.CF:
      case LegType.FC:
      case LegType.FD:
        return true;
      case LegType.CI:
      case LegType.VI:
      case LegType.FA:
      case LegType.CA:
      case LegType.VA:
      case LegType.VM:
        return false;
    }

    const prevLeg = plan.getPrevLeg(segmentIndex, segmentLegIndex) as LegDefinition;
    switch (prevLeg.leg.type) {
      case LegType.VA:
      case LegType.CA:
      case LegType.VM:
      case LegType.Discontinuity:
        return false;
    }

    return true;
  }

  /**
   * Checks whether a leg in the primary flight plan is a valid direct to target.
   * @param segmentIndex The index of the segment in which the leg resides.
   * @param segmentLegIndex The index of the leg in its segment.
   * @returns Whether the leg is a valid direct to target.
   * @throws Error if a leg could not be found at the specified location.
   * @deprecated use {@link WTLineFmsUtils.canDirectTo} instead
   */
  public canDirectTo(segmentIndex: number, segmentLegIndex: number): boolean {
    const plan = this.hasPrimaryFlightPlan() && this.getPrimaryFlightPlan();

    if (!plan) {
      return false;
    }

    return WTLineFmsUtils.canDirectTo(plan, segmentIndex, segmentLegIndex);
  }

  /**
   * Gets the current Direct To State.
   * @param planIndex The Plan Index to check.
   * @returns the DirectToState.
   */
  public getDirectToState(planIndex = WTLineFmsUtils.PRIMARY_ACT_PLAN_INDEX): DirectToState {
    if (!this.hasFlightPlan(planIndex)) {
      return DirectToState.NONE;
    }

    const plan = this.getFlightPlan(planIndex);
    const directDataExists = plan.directToData.segmentIndex > -1 && plan.directToData.segmentLegIndex > -1;
    if (!directDataExists) {
      return DirectToState.NONE;
    }

    // Guarding against rare cases where the segment with the dto has been removed and the dt odata hasn't been updated yet.
    const isDtoSegmentInPlan = plan.segmentCount >= plan.directToData.segmentIndex;
    if (!isDtoSegmentInPlan) {
      return DirectToState.NONE;
    }

    const dtoLegGlobalIndex = plan.getLegIndexFromLeg(plan.getSegment(plan.directToData.segmentIndex).legs[plan.directToData.segmentLegIndex]);
    // We subtract 3 to get the index of the original DTO target leg
    const doesDtoLegMatchActiveLeg = dtoLegGlobalIndex === plan.activeLateralLeg - 3;
    // TODO This seems to be returning false positives when in MOD in certain scenarios,
    // TODO like after passing the TO leg of a DTO, then trying to add a new DTO
    if (doesDtoLegMatchActiveLeg) {
      return DirectToState.TOEXISTING;
    } else {
      return DirectToState.NONE;
    }
  }

  /**
   * Gets the ICAO string of the current Direct To target.
   * @returns The ICAO string of the current Direct To target, or undefined if Direct To is not active.
   * @deprecated use {@link getDirectToTargetIcaoStruct} instead
   */
  public getDirectToTargetIcao(): string | undefined {
    return this.getDirectToLeg(WTLineLegacyFlightPlans.Active)?.fixIcao;
  }

  /**
   * Gets the ICAO string of the current Direct To target.
   * @param planIndex the plan index.
   * @returns The ICAO string of the current Direct To target, or undefined if Direct To is not active.
   */
  public getDirectToTargetIcaoStruct(planIndex: MainFlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): IcaoValue | undefined {
    return this.getDirectToLeg(planIndex)?.fixIcaoStruct;
  }

  /**
   * Gets the current DTO Target Flight Plan Leg.
   * @param planIndex the plan index.
   * @returns the FlightPlanLeg.
   */
  private getDirectToLeg(planIndex: MainFlightPlanIndexType<T>): FlightPlanLeg | undefined {
    switch (this.getDirectToState()) {
      case DirectToState.TOEXISTING: {
        const plan = this.getFlightPlan(planIndex);

        return plan.getSegment(plan.directToData.segmentIndex).legs[plan.directToData.segmentLegIndex + 3].leg;
      }
    }
    return undefined;
  }

  /**
   * Checks if a segment is the first enroute segment that is not an airway.
   * @param segmentIndex is the segment index of the segment to check
   * @returns whether or not the segment is the first enroute segment that is not an airway.
   */
  public isFirstEnrouteSegment(segmentIndex: number): boolean {
    const plan = this.getFlightPlan();
    for (let i = 0; i < plan.segmentCount; i++) {
      const segment = plan.getSegment(i);
      if (segment.segmentType === FlightPlanSegmentType.Enroute && !segment.airway) {
        return i === segmentIndex;
      }
    }
    return false;
  }

  /**
   * Adds a user facility.
   * @param userFacility the facility to add.
   */
  public addUserFacility(userFacility: UserFacility): void {
    this.facRepo.add(userFacility);
  }

  /**
   * Removes a user facility.
   * @param userFacility the facility to remove.
   */
  public removeUserFacility(userFacility: UserFacility): void {
    this.facRepo.remove(userFacility);
  }

  /**
   * Returns whether a user facility exists with a given ident
   * @param ident the identifier
   * @returns a boolean
   */
  public pilotDefinedWaypointExistsWithIdent(ident: string): boolean {
    return this.userFacilities.getArray().some(it => it.facility.get().icaoStruct.ident === ident);
  }

  /**
   * Gets all pilot waypoints
   *
   * @returns a subscribable array of user facility waypoints
   */
  public getPilotDefinedWaypoints(): SubscribableArray<FacilityWaypoint<UserFacility>> {
    return this.userFacilities;
  }

  /**
   * Gets all pilot waypoints
   *
   * @returns an array of user facility waypoints
   */
  public getPilotDefinedWaypointsArray(): readonly FacilityWaypoint<UserFacility>[] {
    return this.userFacilities.getArray();
  }

  /**
   * Adds a visual or runway facility from the FlightPlanLeg.
   * @param leg the leg to build the facility from.
   * @param visualRunwayDesignation is the visual runway this facility belongs to.
   */
  private addVisualFacilityFromLeg(leg: FlightPlanLeg, visualRunwayDesignation: string): void {
    const fac: VisualFacility = {
      icao: leg.fixIcao,
      icaoStruct: ICAO.copyValue(leg.fixIcaoStruct),
      lat: leg.lat !== undefined ? leg.lat : 0,
      lon: leg.lon !== undefined ? leg.lon : 0,
      approach: `VISUAL ${visualRunwayDesignation}`,
      city: '',
      name: `${visualRunwayDesignation} - ${ICAO.getIdent(leg.fixIcao)}`,
      region: '',
    };
    this.facRepo.add(fac);
  }

  /**
   * Method to insert a waypoint to the flightplan.
   * @param facility is the new facility to add a leg to.
   * @param segmentIndex is index of the segment to add the waypoint to
   * @param legIndex is the index to insert the waypoint (if none, append)
   * @param planIndex is the index of the flight plan on which to target the edit
   * @returns whether the waypoint was successfully inserted.
   * @throws if attempting to insert at the active leg index.
   */
  public insertWaypoint(facility: Facility, segmentIndex?: number, legIndex?: number, planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): boolean {
    const leg = FlightPlan.createLeg({
      type: LegType.TF,
      fixIcaoStruct: facility.icaoStruct,
    });

    let plan = this.getPlanToDisplay(planIndex);

    if (segmentIndex === undefined) {
      return this.insertWaypointAtEndOfPlan(plan.planIndex, facility);
    }

    const segment = plan.getSegment(segmentIndex);

    if (legIndex !== undefined && segment.offset + legIndex === plan.activeLateralLeg) {
      throw new Error('[WTLineFms](insertWaypoint) Cannot insert a waypoint at the active leg index');
    }

    const prevLeg = plan.getPrevLeg(segmentIndex, legIndex ?? Infinity);
    const nextLeg = plan.getNextLeg(segmentIndex, legIndex === undefined ? Infinity : legIndex - 1);

    // Make sure we are not inserting a duplicate leg
    if ((prevLeg && this.isDuplicateLeg(prevLeg.leg, leg)) || (nextLeg && this.isDuplicateLeg(leg, nextLeg.leg))) {
      // FIXME throw DUPLICATE WPT error here instead of in the UI when we have WTLineSDK FMS errors

      return false;
    }

    // Make sure we are not inserting a leg into a direct to sequence
    if (prevLeg) {
      const isInDirectTo = BitFlags.isAll(prevLeg?.flags, WT21LegDefinitionFlags.DirectTo);
      const isDirectToTarget = BitFlags.isAll(prevLeg?.flags, WT21LegDefinitionFlags.DirectToTarget);

      if (isInDirectTo && !isDirectToTarget) {
        return false;
      }
    }

    plan = this.getPlanToEdit(planIndex);

    let finalSegmentIndex = segmentIndex;
    let finalLeg: LegDefinition;
    if (legIndex === 0) {
      // Case 1 - We are inserting at the start of a segment.

      if (segment.legs.length !== 0) {
        // Case 1.1 - It has at least one leg. Create a segment before this one and insert there
        const newSegmentIndex = finalSegmentIndex = plan.insertSegment(segmentIndex, FlightPlanSegmentType.Enroute).segmentIndex;

        finalLeg = plan.addLeg(newSegmentIndex, leg);

        if (segment.airway !== undefined) {
          // If the original segment was an airway segment, we also need to make everything after our insertion
          // a DIRECT, since that's no longer on our airway
          const airwayReplacementSegmentIndex = plan.insertSegment(segmentIndex + 1, FlightPlanSegmentType.Enroute).segmentIndex;

          // FIXME this needs some airway logic like in splitSegmentThreeWays, right now this makes a big (and invalid) DIRECT segment
          for (let i = 0; i < segment.legs.length; i++) {
            this.cloneLegTo(plan.planIndex, segment.legs[i], airwayReplacementSegmentIndex, i);
          }

          // Remove the original segment
          plan.removeSegment(segmentIndex + 2);
        }
      } else {
        // Case 1.2 - It has no legs, meaning we just created it above. Insert there.
        finalLeg = plan.addLeg(segmentIndex, leg);
      }
    } else if (legIndex === undefined || legIndex === segment.legs.length) {
      // Case 2 - We are inserting at the end of a segment (because legIndex is undefined or one past the last leg) - create a new
      // segment after this one and insert there.

      const newSegmentIndex = finalSegmentIndex = plan.insertSegment(segmentIndex + 1, FlightPlanSegmentType.Enroute).segmentIndex;

      finalLeg = plan.addLeg(newSegmentIndex, leg);
    } else {
      // Case 3 - We are inserting in the middle of a segment. Split it into three.
      const newSegmentIndex = finalSegmentIndex = this.splitSegmentThreeWays(plan.planIndex, segmentIndex, legIndex).segmentIndex;

      // Insert the waypoint into the new segment
      finalLeg = plan.addLeg(newSegmentIndex, leg);
    }

    // Check if we inserted the leg right after a leg that did not have a discontinuity after it before (because
    // it was at the end of the flight plan), and if so, insert one now
    const finalLegIndex = plan.getLegIndexesFromLeg(finalLeg, WTLineFms.legIndicesCache).segmentLegIndex;
    this.insertDiscontinuityBeforeLegIfNeeded(plan, finalSegmentIndex, finalLegIndex);

    // Now, check downstream in the flight plan for legs that are both XF legs and terminate at the same facility
    const insertedLegGlobalIndex = plan.getLegIndexFromLeg(finalLeg);

    let duplicateLegGlobalIndex = -1;
    for (let i = insertedLegGlobalIndex + 1; i < plan.length; i++) {
      const checkLeg = plan.getLeg(i);

      if (BitFlags.isAll(checkLeg.flags, LegDefinitionFlags.MissedApproach)) {
        // We don't want to consider a leg a duplicate if it's after a missed approach
        break;
      }

      if (this.isDuplicateLeg(finalLeg.leg, checkLeg.leg)) {
        duplicateLegGlobalIndex = i;
      }
    }

    if (duplicateLegGlobalIndex !== -1) {
      // Remove all legs between the inserted leg (exclusive) and the duplicate leg (inclusive)
      const legsToRemove = duplicateLegGlobalIndex - insertedLegGlobalIndex;

      for (let i = 0; i < legsToRemove; i++) {
        const legIndices = plan.getLegIndexesFromLeg(plan.getLeg(insertedLegGlobalIndex + 1), WTLineFms.legIndicesCache);

        plan.removeLeg(legIndices.segmentIndex, legIndices.segmentLegIndex);

        this.checkAndRemoveEmptySegment(plan, legIndices.segmentIndex);
      }
    }

    return true;
  }

  /**
   * Inserts a waypoint at the end of the specified flight plan.
   * @param planIndex The index of the flight plan to insert the waypoint into.
   * @param facility The facility of the waypoint to insert.
   * @returns Whether the waypoint was successfully inserted.
   */
  private insertWaypointAtEndOfPlan(planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active, facility: Facility): boolean {
    const plan = this.getPlanToEdit(planIndex);

    let targetSegmentIndex: number;

    // Find the segment index of the last leg in the plan
    const lastLegSegmentIndex = plan.length > 0 ? plan.getSegmentIndex(plan.length - 1) : -1;

    if (lastLegSegmentIndex === -1) {
      // The plan is empty

      const lastEnrouteSegmentIndex = this.findLastEnrouteSegmentIndex(plan);

      if (lastEnrouteSegmentIndex !== -1) {
        // The plan has at least one enroute segment, use the last one
        targetSegmentIndex = lastEnrouteSegmentIndex;
      } else {
        // The plan has no segments, create the first segment
        targetSegmentIndex = plan.insertSegment(0, FlightPlanSegmentType.Enroute).segmentIndex;
      }
    } else {
      targetSegmentIndex = lastLegSegmentIndex;
    }

    const segment = plan.getSegment(targetSegmentIndex);

    // If the target segment is an enroute segment
    if (segment.segmentType === FlightPlanSegmentType.Enroute) {
      // ...and it is empty or only contains a discontinuity, we can insert into it
      if (
        segment.legs.length === 0 ||
        (segment.legs.length === 1 && FlightPlanUtils.isDiscontinuityLeg(segment.legs[0].leg.type))
      ) {
        // Do nothing, we can insert into this segment
      } else {
        // Otherwise, create a new enroute segment after the target segment
        targetSegmentIndex = plan.insertSegment(targetSegmentIndex + 1, FlightPlanSegmentType.Enroute).segmentIndex;
      }
    } else {
      // Otherwise, create a new enroute segment at the end of the
      // plan (we want it to be after any arrival/approach/dest departure segments)
      targetSegmentIndex = plan.insertSegment(plan.segmentCount, FlightPlanSegmentType.Enroute).segmentIndex;
    }

    const leg = FlightPlan.createLeg({
      type: LegType.TF,
      fixIcaoStruct: facility.icaoStruct,
    });

    // Make sure we are not inserting a duplicate leg
    const prevLeg = plan.getPrevLeg(targetSegmentIndex, Infinity);
    if (prevLeg && this.isDuplicateLeg(prevLeg.leg, leg)) {
      // FIXME throw DUPLICATE WPT error here instead of in the UI when we have WTLineSDK FMS errors

      return false;
    }

    plan.addLeg(targetSegmentIndex, leg);
    return true;
  }

  /**
   * Removes a leg to a waypoint from the primary flight plan.
   * @param segmentIndex The index of the segment containing the leg to remove.
   * @param segmentLegIndex The index of the leg to remove in its segment.
   * @param skipVectorsCheck Whether to force deletion regardless of vectors legs being before a discontinuity
   * @param skipFafMapCheck Whether to force deletion regardless of FAF/MAP flags
   * @param skipHoldDelete Whether to skip deleting holds associated with this leg
   * @param planIndex The index of the plan to target the edit to.
   * @returns Whether the waypoint was successfully removed.
   */
  public removeWaypoint(
    segmentIndex: number,
    segmentLegIndex: number,
    skipVectorsCheck = false,
    skipFafMapCheck = false,
    skipHoldDelete = false,
    planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active,
  ): boolean {
    let plan = this.getPlanToDisplay(planIndex);

    const leg = plan.tryGetLeg(segmentIndex, segmentLegIndex);

    if (!leg) {
      return false;
    }

    if (!skipFafMapCheck && (!leg || BitFlags.isAny(leg.leg.fixTypeFlags, FixTypeFlags.FAF | FixTypeFlags.MAP))) {
      return false;
    }

    if (!skipVectorsCheck && FlightPlanUtils.isDiscontinuityLeg(leg.leg.type) && !this.canDeleteDiscontinuity(planIndex, segmentIndex, segmentLegIndex)) {
      return false;
    }

    plan = this.getPlanToEdit(plan.planIndex);

    const legDeleted = this.planRemoveLeg(plan.planIndex, segmentIndex, segmentLegIndex);
    const nextLeg = plan.tryGetLeg(segmentIndex, segmentLegIndex);

    if (!skipHoldDelete && legDeleted && nextLeg && (nextLeg.leg.type === LegType.HA || nextLeg.leg.type === LegType.HM || nextLeg.leg.type === LegType.HF)) {
      if (plan.tryGetLeg(segmentIndex, segmentLegIndex)) {
        this.planRemoveLeg(plan.planIndex, segmentIndex, segmentLegIndex, true, true, true);
      }
    }

    this.checkAndRemoveEmptySegment(plan, segmentIndex);

    return legDeleted;
  }

  /**
   * Determines whether a discontinuity at a given position in the flight plan can be deleted
   * @param planIndex the index of the flight plan to check
   * @param segmentIndex ths segment index
   * @param localLegLindex the local leg index
   * @returns whether the discontinuity can be deleted
   */
  private canDeleteDiscontinuity(planIndex: number, segmentIndex: number, localLegLindex: number): boolean {
    const plan = this.flightPlanRepo.getFlightPlan(planIndex);
    const segment = plan.getSegment(segmentIndex);

    const prevLeg = plan.getPrevLeg(segmentIndex, localLegLindex);

    if (!prevLeg) {
      // We should really not have a discontinuity at the start of the plan, but allow deleting it if we do
      return true;
    }

    // Prevent deleting discontinuities that follow XM legs
    if (FlightPlanUtils.isManualDiscontinuityLeg(prevLeg.leg.type)) {
      return false;
    }

    // FIXME can't delete discontinuities before certain leg types (like AF). Find out which

    // Prevent deleting discontinuities that are the only leg in an airway segment
    if (segment.legs.length === 1) {
      return false;
    }

    return true;
  }

  /**
   * Toggles a leg being marked by fly-over or not
   * @param planIndex the index of the plan to modify
   * @param segmentIndex the segment index
   * @param localLegIndex the local leg index
   * @param value the value to force (toggled otherwise)
   * @returns whether the leg could be set as flyover or not
   */
  public toggleLegFlyover(planIndex: FlightPlanIndexType<T>, segmentIndex: number, localLegIndex: number, value?: boolean): boolean {
    let plan = this.flightPlanRepo.getFlightPlan(planIndex);
    const leg = plan.getLeg(segmentIndex, localLegIndex);

    if (!FlightPlanUtils.isToFixLeg(leg.leg.type)) {
      return false;
    }

    if (value !== undefined && leg.leg.flyOver === value) {
      return true;
    }

    plan = this.flightPlanRepo.getPlanToEdit(plan.planIndex);

    const newLegData = FlightPlan.createLeg({ ...leg.leg, flyOver: value !== undefined ? value : !leg.leg.flyOver });

    const batch = plan.openBatch(WTLineFlightPlanEditBatch.ChangeLegFlyover);

    this.cloneLegTo(plan.planIndex, leg, segmentIndex, localLegIndex, leg.flags, newLegData);
    plan.removeLeg(segmentIndex, localLegIndex + 1);

    plan.closeBatch(batch);

    return true;
  }

  /**
   * Sets the speed and altitude constraints for a log.
   * @param globalLegIndex Global leg index of the leg to modify.
   * @param verticalData The vertical data to set on the leg. Will be merged with existing data.
   * @param mainPlanIndex The index of the flight plan to target the edit to.
   * @returns Whether the data was set.
   */
  public setUserConstraint(globalLegIndex: number, verticalData: Omit<VerticalData, 'phase'>, mainPlanIndex: MainFlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): boolean {
    const plan = this.getFlightPlan(mainPlanIndex) && this.getPlanToEdit(mainPlanIndex);

    if (!plan) {
      return false;
    }

    const segment = plan.tryGetSegment(plan.getSegmentIndex(globalLegIndex));
    const leg = segment?.legs[globalLegIndex - segment.offset];

    if (segment === null || leg === undefined) {
      return false;
    }

    const isDeparture = segment.segmentType === FlightPlanSegmentType.Departure || segment.segmentType === FlightPlanSegmentType.Origin;
    const isMapr = BitFlags.isAny(leg.flags, LegDefinitionFlags.MissedApproach);

    plan.setLegVerticalData(
      globalLegIndex,
      { phase: isDeparture || isMapr ? VerticalFlightPhase.Climb : VerticalFlightPhase.Descent, ...verticalData },
      true
    );

    plan.calculate(plan.activeLateralLeg - 1);

    return true;
  }

  /**
   * Gets the airway leg type of a flight plan leg.
   * @param plan The flight plan containing the query leg.
   * @param segmentIndex The index of the flight plan segment containing the query leg.
   * @param segmentLegIndex The index of the query leg in its segment.
   * @returns The airway leg type of the query leg.
   */
  private getAirwayLegType(plan: FlightPlan, segmentIndex: number, segmentLegIndex: number): AirwayLegType {
    const segment = plan.getSegment(segmentIndex);
    const segmentIsAirway = segment.airway !== undefined;
    const nextSegmentIsAirway = segmentIndex + 1 < plan.segmentCount && plan.getSegment(segmentIndex + 1).airway !== undefined;
    const legIsLast = segmentLegIndex == segment.legs.length - 1;
    if ((segmentIsAirway && legIsLast && nextSegmentIsAirway)) {
      return AirwayLegType.EXIT_ENTRY;
    }
    if ((legIsLast && nextSegmentIsAirway)) {
      return AirwayLegType.ENTRY;
    }
    if (segmentIsAirway) {
      if (legIsLast) {
        return AirwayLegType.EXIT;
      }
      return AirwayLegType.ONROUTE;
    }
    return AirwayLegType.NONE;
  }

  /**
   * Method to get the distance of an airway segment.
   * @param segmentIndex is the index of the segment of the airway.
   * @returns the cumulative distance for the airway segment.
   */
  public getAirwayDistance(segmentIndex: number): number {
    const plan = this.getFlightPlan();
    const segment = plan.getSegment(segmentIndex);
    const entrySegment = plan.getSegment(segmentIndex - 1);
    const entryCumulativeDistance = entrySegment.legs[entrySegment.legs.length - 1]?.calculated?.cumulativeDistance;
    const exitCumulativeDistance = segment.legs[segment.legs.length - 1]?.calculated?.cumulativeDistance;
    return exitCumulativeDistance && entryCumulativeDistance ? exitCumulativeDistance - entryCumulativeDistance : -1;
  }

  /**
   * Method to set the origin airport of the flight plan.
   * @param planIndex is the index of the plan to target the edit to
   * @param airportIcao is the facility ICAO of the origin airport.
   */
  public setOriginAirport(planIndex: FlightPlanIndexType<T>, airportIcao: IcaoValue | undefined): void {
    const plan = this.getPlanToEdit(planIndex);

    if (airportIcao) {
      if (plan.originAirportIcao === undefined || !ICAO.valueEquals(plan.originAirportIcao, airportIcao)) {
        plan.setOriginAirport(airportIcao);
      }
    } else {
      plan.removeOriginAirport();
    }

    plan.calculate(0);
  }

  /**
   * Method to set the departure runway of a given airport, either the origin airport or the destination airport.
   * @param planIndex is the plan index to target the edit to
   * @param airportIcao is the facility ICAO of the airport.
   * @param runway is the selected runway at the facility.
   * @param isOrigin whether the airport is the origin airport (true) or the destination airport (false).
   */
  public async setDepartureRunway(planIndex: FlightPlanIndexType<T>, airportIcao: IcaoValue, runway: OneWayRunway | undefined, isOrigin: boolean): Promise<void> {
    const plan = this.getPlanToEdit(planIndex);

    if (isOrigin) {
      plan.setOriginRunway(runway);

      await this.removeDeparture(plan.planIndex, true);
    } else {
      WTLineFmsUtils.setFlightPlanDestinationAirportDepartureProcedure(
        plan,
        {
          airportIcao,
          runway: runway ?? null,
          departureIndex: -1,
          departureRunwayTransitionIndex: -1,
          departureEnrouteTransitionIndex: -1,
        }
      );

      await this.removeDeparture(plan.planIndex, false);
    }

    plan.calculate(0);
  }

  /**
   * Method to set the destination airport of the flight plan.
   * @param planIndex is the index of the plan to target the edit to
   * @param airportIcao is the facility ICAO of the destination airport.
   */
  public setDestinationAirport(planIndex: FlightPlanIndexType<T>, airportIcao: IcaoValue | undefined): void {
    const plan = this.getPlanToEdit(planIndex);

    this.removeApproach(plan.planIndex);
    this.removeArrival(plan.planIndex);

    if (airportIcao) {
      plan.setDestinationAirport(airportIcao);
    } else {
      plan.removeDestinationAirport();
    }

    plan.calculate(0);
  }

  /**
   * Method to ensure only one segment of a specific type exists in the flight plan and optionally insert it if needed.
   * This method should not be used for Departure segments, because they can exist as two separate
   * procedures (origin and destination departures).
   * @param planIndex is the index of the plan to edit.
   * @param segmentType is the segment type we want to evaluate.
   * @param insert is whether to insert the segment if missing
   * @returns segmentIndex of the only segment of this type in the flight plan, -1 if insert is false and and the segment does not exist.
   */
  protected ensureOnlyOneSegmentOfType(planIndex: FlightPlanIndexType<T>, segmentType: Exclude<FlightPlanSegmentType, FlightPlanSegmentType.Departure>, insert = true): number {
    const plan = this.getPlanToEdit(planIndex);

    let segmentIndex: number;

    const selectedSegments = plan.segmentsOfType(segmentType);
    const segmentIndexArray: number[] = [];

    for (const element of selectedSegments) {
      segmentIndexArray.push(element.segmentIndex);
    }

    if (segmentIndexArray.length === 0) {
      if (insert) {
        segmentIndex = this.planInsertSegmentOfType(plan.planIndex, segmentType);
      } else {
        segmentIndex = -1;
      }
    } else if (segmentIndexArray.length > 1) {
      for (let i = segmentIndexArray.length - 1; i >= 0; i--) {
        this.planRemoveSegment(plan.planIndex, segmentIndexArray[i]);
      }

      segmentIndex = this.planInsertSegmentOfType(plan.planIndex, segmentType);
    } else {
      segmentIndex = segmentIndexArray[0];
    }
    return segmentIndex;
  }

  /**
   * Gets an array of legs in a flight plan segment ending with the active leg that are to be displaced if the segment
   * is deleted.
   * @param plan The flight plan containing the segment for which to get the array.
   * @param segmentIndex The index of the segment for which to get the array.
   * @returns An array of legs in the specified flight plan segment ending with the active leg that are to be
   * displaced if the segment is deleted, or `undefined` if the segment does not contain the active leg.
   */
  private getSegmentActiveLegsToDisplace(plan: FlightPlan, segmentIndex: number): LegDefinition[] | undefined {
    const segment = plan.getSegment(segmentIndex);
    const activeLeg = segment.legs[plan.activeLateralLeg - segment.offset] as LegDefinition | undefined;

    // If active leg is not in the segment to be deleted, then nothing needs to be displaced
    if (!activeLeg) {
      return undefined;
    }

    if (BitFlags.isAll(activeLeg.flags, LegDefinitionFlags.DirectTo)) {
      // Active leg is part of a direct-to.

      if (plan.directToData.segmentIndex !== segmentIndex || plan.directToData.segmentLegIndex + WTLineFmsUtils.DTO_LEG_OFFSET >= segment.legs.length) {
        // If the plan's direct to data does not match what we would expect given the active leg, then something has
        // gone wrong with the flight plan's state and we will just bail.
        return undefined;
      }

      return segment.legs.slice(0, plan.directToData.segmentLegIndex + WTLineFmsUtils.DTO_LEG_OFFSET + 1);
    } else {
      // Active leg is not part of a direct-to. In this case we return every leg in the active segment prior to and
      // including the active leg.
      // FIXME this should only be the FROM and TO leg

      return segment.legs.slice(0, plan.activeLateralLeg - segment.offset + 1);
    }
  }

  /**
   * Displaces a sequence of flight plan legs contained in a now-removed segment ending with the active leg into a new
   * flight plan segment. If the displaced active leg was a direct-to leg, then a new direct-to will be created to the
   * displaced target leg. Otherwise, the active leg is set to the displaced active leg.
   * @param plan The flight plan into which to displace the legs.
   * @param segmentIndex The index of the flight plan segment into which to displace the legs.
   * @param activeLegArray The sequence of flight plan legs to displace. The sequence should contain all of the legs
   * contained in the former active segment up to and including the active leg.
   */
  private displaceActiveLegsIntoSegment(plan: FlightPlan, segmentIndex: number, activeLegArray: LegDefinition[]): void {
    WTLineFmsUtils.removeDisplacedActiveLegs(plan);

    const segment = plan.getSegment(segmentIndex);

    let insertAtIndex = 0;
    let addedDiscontinuity = false;

    const prevLeg = plan.getPrevLeg(segmentIndex, 0);

    if (prevLeg) {
      this.insertDiscontinuity(plan, segmentIndex, 0, WT21LegDefinitionFlags.DisplacedActiveLeg);

      if (segment.legs[0] && FlightPlanUtils.isDiscontinuityLeg(segment.legs[0].leg.type)) {
        insertAtIndex += 1;
        addedDiscontinuity = true;
      }
    }

    // The active leg is guaranteed to be the last leg in the array.
    const activeLegIndex = activeLegArray.length - 1;
    const activeLeg = activeLegArray[activeLegIndex];
    const isActiveLegDto = BitFlags.isAll(activeLeg.flags, LegDefinitionFlags.DirectTo);
    const dtoTargetLegIndex = isActiveLegDto ? activeLegIndex - WTLineFmsUtils.DTO_LEG_OFFSET : undefined;
    const dtoTargetLeg = dtoTargetLegIndex !== undefined ? activeLegArray[dtoTargetLegIndex] : undefined;

    let displacedDtoTargetLegIndex = undefined;

    // Add all displaced legs to the segment, skipping any active direct-to legs.
    for (let i = dtoTargetLegIndex ?? activeLegIndex; i >= 0; i--) {
      const leg = activeLegArray[i];

      // If we added a discontinuity at the start, and the displaced active leg is a discontinuity, we skip adding it, as
      // we don't want back-to-back discontinuities.
      if (addedDiscontinuity && FlightPlanUtils.isDiscontinuityLeg(leg.leg.type) && i === activeLegIndex) {
        break;
      }

      const newLeg = FlightPlan.createLeg(leg.leg);

      // Displaced legs aren't a part of a procedure anymore, so we clear the fix type flags
      newLeg.fixTypeFlags = 0;

      plan.addLeg(segmentIndex, newLeg, insertAtIndex, WT21LegDefinitionFlags.DisplacedActiveLeg);

      // Preserve altitude and speed restrictions on the active leg or direct-to target leg only.
      if (leg === activeLeg || leg === dtoTargetLeg) {
        plan.setLegVerticalData(segmentIndex, insertAtIndex, leg.verticalData);
      }

      // Check if we are displacing an inactive direct-to leg. If so, mark the index of the corresponding displaced
      // direct-to target leg so we can deal with it below.
      if (displacedDtoTargetLegIndex === undefined && BitFlags.isAll(leg.flags, LegDefinitionFlags.DirectTo)) {
        displacedDtoTargetLegIndex = i - WTLineFmsUtils.DTO_LEG_OFFSET + insertAtIndex;
      }
    }

    // If we displaced an inactive direct-to sequence, then we need to update the plan's direct-to data to match the
    // indexes of the now displaced direct-to target leg.
    if (displacedDtoTargetLegIndex !== undefined) {
      plan.setDirectToData(segmentIndex, displacedDtoTargetLegIndex);
    }

    if (dtoTargetLegIndex !== undefined) {
      const course = activeLeg.leg.type === LegType.CF ? activeLeg.leg.course : undefined;
      this.createDirectTo(segmentIndex, dtoTargetLegIndex + insertAtIndex, undefined, course, undefined);
    } else {
      const newActiveLegIndex = segment.offset + insertAtIndex + activeLegArray.length - 1;
      plan.setCalculatingLeg(newActiveLegIndex);
      plan.setLateralLeg(newActiveLegIndex);
    }
  }

  /**
   * Method to add or replace a departure procedure in the flight plan.
   * @param facility is the facility that contains the procedure to add.
   * @param departureIndex is the index of the departure
   * @param departureRunwayIndex is the index of the runway transition
   * @param enrouteTransitionIndex is the index of the enroute transition
   * @param oneWayRunway is the one way runway to set as the origin leg.
   * @param planIndex is the index of the plan to target the edit to
   * @deprecated Please use `loadDeparture()` instead.
   */
  public insertDeparture(
    facility: AirportFacility,
    departureIndex: number,
    departureRunwayIndex: number,
    enrouteTransitionIndex: number,
    oneWayRunway?: OneWayRunway | undefined,
    planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active,
  ): void {
    const plan = this.getPlanToEdit(planIndex);

    plan.setDeparture(facility.icaoStruct, departureIndex, enrouteTransitionIndex, departureRunwayIndex);
    WTLineFmsUtils.setFlightPlanProcedureIdents(
      plan,
      {
        ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
        originDepartureIdent: facility.departures[departureIndex].name,
        originDepartureEnrouteTransitionIdent: facility.departures[departureIndex].enRouteTransitions[enrouteTransitionIndex]?.name ?? null,
      },
    );

    const segmentIndex = this.ensureOnlyOneDepartureSegment(plan, true);

    // Grabbing the active legs (if there are any) in the existing departure semgent,
    // so that we can put them somewhere after clearing the segment.
    const activeLegArray = !Simplane.getIsGrounded() && plan.activeLateralLeg > 0 ? this.getSegmentActiveLegsToDisplace(plan, segmentIndex) : undefined;

    this.planClearSegment(plan.planIndex, segmentIndex, FlightPlanSegmentType.Departure);

    const insertProcedureObject = this.buildDepartureLegs(facility, departureIndex, enrouteTransitionIndex, departureRunwayIndex, oneWayRunway, false);

    if (plan.originAirport !== facility.icao) {
      plan.setOriginAirport(facility.icaoStruct);
    }

    plan.setOriginRunway(oneWayRunway);

    for (const procedureLeg of insertProcedureObject.procedureLegs) {
      this.planAddLeg(plan.planIndex, segmentIndex, procedureLeg, undefined, WT21LegDefinitionFlags.ProcedureLeg);
    }

    const nextLeg = plan.getNextLeg(segmentIndex, Infinity);
    const depSegment = plan.getSegment(segmentIndex);
    const lastDepLeg = depSegment.legs[depSegment.legs.length - 1];

    if (nextLeg && lastDepLeg && this.isDuplicateLeg(lastDepLeg.leg, nextLeg.leg)) {
      this.planRemoveDuplicateLeg(plan.planIndex, lastDepLeg, nextLeg);
    }

    this.generateSegmentVerticalData(plan, segmentIndex);

    if (activeLegArray) {
      this.displaceActiveLegsIntoSegment(plan, segmentIndex, activeLegArray);
    }

    plan.calculate(0);
  }

  private readonly loadDepartureOpIds: number[] = [];

  /**
   * Loads a departure procedure from the origin airport into a flight plan.
   * @param planIndex The index of the plan to target the edit to.
   * @param facility The procedure's parent airport facility.
   * @param departureIndex The index of the procedure in the parent airport facility's departure array.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * @param oneWayRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * include a runway transition.
   * @returns A Promise which fulfills with whether the specified departure procedure was successfully loaded.
   */
  public async loadOriginDeparture(
    planIndex: FlightPlanIndexType<T>,
    facility: AirportFacility,
    departureIndex: number,
    runwayTransitionIndex: number,
    enrouteTransitionIndex: number,
    oneWayRunway: OneWayRunway | undefined,
  ): Promise<boolean> {
    return this.loadDepartureImpl(
      planIndex,
      true,
      facility,
      departureIndex,
      runwayTransitionIndex,
      enrouteTransitionIndex,
      oneWayRunway,
    );
  }

  /**
   * Loads a departure procedure from the destination airport into a flight plan.
   * @param planIndex The index of the plan to target the edit to.
   * @param facility The procedure's parent airport facility.
   * @param departureIndex The index of the procedure in the parent airport facility's departure array.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * @param oneWayRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * include a runway transition.
   * @returns A Promise which fulfills with whether the specified departure procedure was successfully loaded.
   */
  public async loadDestinationDeparture(
    planIndex: FlightPlanIndexType<T>,
    facility: AirportFacility,
    departureIndex: number,
    runwayTransitionIndex: number,
    enrouteTransitionIndex: number,
    oneWayRunway: OneWayRunway | undefined,
  ): Promise<boolean> {
    return this.loadDepartureImpl(
      planIndex,
      false,
      facility,
      departureIndex,
      runwayTransitionIndex,
      enrouteTransitionIndex,
      oneWayRunway,
    );
  }

  /**
   * Loads a departure procedure into a flight plan.
   * @param planIndex The index of the plan to target the edit to.
   * @param isOrigin Whether the airport is the origin airport (true) or the destination airport (false).
   * @param facility The procedure's parent airport facility.
   * @param departureIndex The index of the procedure in the parent airport facility's departure array.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * include a runway transition.
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * include an enroute transition.
   * @param oneWayRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * @returns A Promise which fulfills with whether the specified departure procedure was successfully loaded.
   */
  protected async loadDepartureImpl(
    planIndex: FlightPlanIndexType<T>,
    isOrigin: boolean,
    facility: AirportFacility,
    departureIndex: number,
    runwayTransitionIndex: number,
    enrouteTransitionIndex: number,
    oneWayRunway: OneWayRunway | undefined,
  ): Promise<boolean> {
    this.loadDepartureOpIds[planIndex] ??= 0;
    const opId = ++this.loadDepartureOpIds[planIndex];

    const insertProcedureObject = await this.buildDepartureLegs(facility, departureIndex, enrouteTransitionIndex, runwayTransitionIndex, oneWayRunway, true);

    if (opId !== this.loadDepartureOpIds[planIndex]) {
      return false;
    }

    const plan = this.getPlanToEdit(planIndex);
    const segmentIndex = this.ensureOnlyOneDepartureSegment(plan, isOrigin);
    const depSegment = plan.getSegment(segmentIndex);

    // Grabbing the active legs (if there are any) in the existing departure semgent,
    // so that we can put them somewhere after clearing the segment.
    // FIXME don't use SimPlane
    const activeLegArray = !Simplane.getIsGrounded() && plan.activeLateralLeg > 0 ? this.getSegmentActiveLegsToDisplace(plan, segmentIndex) : undefined;

    this.planClearSegment(plan.planIndex, segmentIndex, FlightPlanSegmentType.Departure);

    if (isOrigin) {
      WTLineFmsUtils.setFlightPlanProcedureIdents(
        plan,
        {
          ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
          originDepartureIdent: facility.departures[departureIndex].name,
          originDepartureEnrouteTransitionIdent: facility.departures[departureIndex].enRouteTransitions[enrouteTransitionIndex]?.name ?? null,
        },
      );
      plan.setDeparture(facility.icaoStruct, departureIndex, enrouteTransitionIndex, runwayTransitionIndex);

      if (!plan.originAirportIcao || !ICAO.valueEquals(plan.originAirportIcao, facility.icaoStruct)) {
        plan.setOriginAirport(facility.icaoStruct);
      }

      plan.setOriginRunway(oneWayRunway);
    } else {
      WTLineFmsUtils.setFlightPlanDestinationAirportDepartureProcedure(
        plan,
        {
          airportIcao: facility.icaoStruct,
          runway: oneWayRunway ?? null,
          departureIndex,
          departureRunwayTransitionIndex: runwayTransitionIndex,
          departureEnrouteTransitionIndex: enrouteTransitionIndex,
        },
      );
      WTLineFmsUtils.setFlightPlanProcedureIdents(
        plan,
        {
          ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
          destinationDepartureIdent: facility.departures[departureIndex].name,
          destinationDepartureEnrouteTransitionIdent: facility.departures[departureIndex].enRouteTransitions[enrouteTransitionIndex]?.name ?? null,
        },
      );

      const prevLeg = plan.getPrevLeg(segmentIndex, 0);

      if (prevLeg) {
        this.insertDiscontinuity(plan, segmentIndex, 0, WT21LegDefinitionFlags.ProcedureLeg);
      }
    }

    for (const procedureLeg of insertProcedureObject.procedureLegs) {
      this.planAddLeg(plan.planIndex, segmentIndex, procedureLeg, undefined, WT21LegDefinitionFlags.ProcedureLeg);
    }

    const nextLeg = plan.getNextLeg(segmentIndex, Infinity);
    const lastDepLeg = depSegment.legs[depSegment.legs.length - 1];

    if (nextLeg && lastDepLeg && this.isDuplicateLeg(lastDepLeg.leg, nextLeg.leg)) {
      this.planRemoveDuplicateLeg(plan.planIndex, lastDepLeg, nextLeg);
    }

    if (activeLegArray) {
      this.displaceActiveLegsIntoSegment(plan, segmentIndex, activeLegArray);
    }

    this.checkDiscontinuityAtEndOfSegment(plan, segmentIndex);
    this.generateSegmentVerticalData(plan, segmentIndex);

    await plan.calculate(0);

    return true;
  }

  /**
   * Ensures that only a single departure segment for the origin or destination exists in a flight plan.
   *
   * If there were multiple departure segments, all but the first are removed, including any non-departure segments
   * between them. If there were no departure segments, one is inserted at the appropriate position.
   *
   * @param plan The flight plan to modify,
   * @param origin Whether to check for origin (true) or destination (false) departure segments.
   * @returns The index of the ensured departure segment.
   */
  private ensureOnlyOneDepartureSegment(plan: FlightPlan, origin: boolean): number {
    const firstDepartureSegmentIndex = WTLineFmsUtils.getFirstDepartureSegmentIndex(plan, origin);
    const lastDepartureSegmentIndex = WTLineFmsUtils.getLastDepartureSegmentIndex(plan, origin);

    if (firstDepartureSegmentIndex === -1 || lastDepartureSegmentIndex === -1) {
      if (origin) {
        this.planInsertSegment(plan.planIndex, 0, FlightPlanSegmentType.Departure);

        return 0;
      } else {
        const insertionIndex = this.getSegmentForDestinationDepartureInsertion(plan);

        this.planInsertSegment(plan.planIndex, insertionIndex, FlightPlanSegmentType.Departure);

        return insertionIndex;
      }
    }

    const numSegmentsToRemove = lastDepartureSegmentIndex - firstDepartureSegmentIndex;

    for (let i = 0; i < numSegmentsToRemove; i++) {
      this.planRemoveSegment(plan.planIndex, firstDepartureSegmentIndex + 1);
    }

    return firstDepartureSegmentIndex;
  }

  /**
   * Finds the segment index at which to insert a destination departure segment.
   * @param plan The flight plan in which to insert the segment.
   * @returns The segment index at which to insert a destination departure segment.
   */
  private getSegmentForDestinationDepartureInsertion(plan: FlightPlan): number {
    for (let i = 0; i < plan.segmentCount; i++) {
      const segment = plan.getSegment(i);

      if (segment.segmentType === FlightPlanSegmentType.Destination) {
        return i + 1;
      }
    }

    return -1;
  }

  /**
   * Builds a sequence of flight plan legs for a departure procedure.
   * @param facility The procedure's parent airport facility.
   * @param procedureIndex The index of the procedure in the parent airport facility's departure array.
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * include an enroute transition.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * include a runway transition.
   * @param departureRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * @param performLegRemap Whether to remap the built flight plan leg sequence to transform unsupported leg patterns
   * into the closest equivalent supported leg patterns.
   * @returns A sequence of flight plan legs for the specified departure procedure.
   */
  private buildDepartureLegs(
    facility: AirportFacility,
    procedureIndex: number,
    enrouteTransitionIndex: number,
    runwayTransitionIndex: number,
    departureRunway: OneWayRunway | undefined,
    performLegRemap: false
  ): InsertProcedureObject;
  /**
   * Builds a sequence of flight plan legs for a departure procedure.
   * @param facility The procedure's parent airport facility.
   * @param procedureIndex The index of the procedure in the parent airport facility's departure array.
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * include an enroute transition.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * include a runway transition.
   * @param departureRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * @param performLegRemap Whether to remap the built flight plan leg sequence to transform unsupported leg patterns
   * into the closest equivalent supported leg patterns.
   * @returns A Promise which will fulfill with a sequence of flight plan legs for the specified departure procedure.
   */
  private buildDepartureLegs(
    facility: AirportFacility,
    procedureIndex: number,
    enrouteTransitionIndex: number,
    runwayTransitionIndex: number,
    departureRunway: OneWayRunway | undefined,
    performLegRemap: true
  ): Promise<InsertProcedureObject>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  private buildDepartureLegs(
    facility: AirportFacility,
    procedureIndex: number,
    enrouteTransitionIndex: number,
    runwayTransitionIndex: number,
    departureRunway: OneWayRunway | undefined,
    performLegRemap: boolean
  ): InsertProcedureObject | Promise<InsertProcedureObject> {

    const departure = facility.departures[procedureIndex];
    const enRouteTransition = departure.enRouteTransitions[enrouteTransitionIndex];
    const runwayTransition = departure.runwayTransitions[runwayTransitionIndex];
    const insertProcedureObject: InsertProcedureObject = { procedureLegs: [] };

    if (runwayTransition !== undefined && runwayTransition.legs.length > 0) {
      for (const leg of runwayTransition.legs) {
        insertProcedureObject.procedureLegs.push(FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(leg)));
        if (this.shouldDiscontinuityFollowLeg(leg.type)) {
          insertProcedureObject.procedureLegs.push(FlightPlan.createLeg({ type: LegType.Discontinuity }));
        }
      }
    }

    // If the procedure did not start with a runway leg, we must insert an origin leg at the start of the procedure legs.
    if (insertProcedureObject.procedureLegs[0]?.fixIcaoStruct.type !== IcaoType.Runway) {
      if (departureRunway) {
        insertProcedureObject.procedureLegs.unshift(WTLineFmsUtils.buildRunwayLeg(facility, departureRunway, true));
      } else {
        insertProcedureObject.procedureLegs.unshift(FlightPlan.createLeg({
          lat: facility.lat,
          lon: facility.lon,
          type: LegType.IF,
          fixIcaoStruct: facility.icaoStruct,
        }));
      }
    }

    for (let i = 0; i < departure.commonLegs.length; i++) {
      const leg = FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(departure.commonLegs[i]));
      if (i == 0 && insertProcedureObject.procedureLegs.length > 0 &&
        this.isDuplicateIFLeg(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg)) {
        insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1] =
          this.mergeDuplicateLegData(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg);
        continue;
      }
      insertProcedureObject.procedureLegs.push(leg);
      if (this.shouldDiscontinuityFollowLeg(leg.type)) {
        insertProcedureObject.procedureLegs.push(FlightPlan.createLeg({ type: LegType.Discontinuity }));
      }
    }

    if (enRouteTransition) {
      for (let i = 0; i < enRouteTransition.legs.length; i++) {
        const leg = FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(enRouteTransition.legs[i]));
        if (i == 0 && insertProcedureObject.procedureLegs.length > 0 &&
          this.isDuplicateIFLeg(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg)) {
          insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1] =
            this.mergeDuplicateLegData(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg);
          continue;
        }
        insertProcedureObject.procedureLegs.push(enRouteTransition.legs[i]);
        if (this.shouldDiscontinuityFollowLeg(enRouteTransition.legs[i].type)) {
          insertProcedureObject.procedureLegs.push(FlightPlan.createLeg({ type: LegType.Discontinuity }));
        }
      }
    }

    if (performLegRemap) {
      return this.remapProcedureLegs(insertProcedureObject);
    } else {
      return insertProcedureObject;
    }
  }

  /**
   * Method to add or replace an arrival procedure in the flight plan.
   * @param facility is the facility that contains the procedure to add.
   * @param arrivalIndex is the index of the arrival procedure.
   * @param arrivalRunwayTransitionIndex is the index of the arrival runway transition.
   * @param enrouteTransitionIndex is the index of the enroute transition.
   * @param oneWayRunway is the one way runway to set as the destination leg.
   * @param planIndex is the index of the plan to target the edit to
   * @deprecated Please use `loadArrival()` instead.
   */
  public insertArrival(
    facility: AirportFacility,
    arrivalIndex: number,
    arrivalRunwayTransitionIndex: number,
    enrouteTransitionIndex: number,
    oneWayRunway?: OneWayRunway | undefined,
    planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active,
  ): void {
    const plan = this.getPlanToEdit(planIndex);

    const activeSegment = WTLineFmsUtils.getActiveSegment(plan);

    let arrivalSegment = plan.getSegment(this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.Arrival));

    const activeLegArray = this.getSegmentActiveLegsToDisplace(plan, arrivalSegment.segmentIndex);

    let arrivalActiveLegIcao: undefined | string;

    if (arrivalIndex > -1 && arrivalIndex === plan.procedureDetails.arrivalIndex && activeSegment !== undefined && activeLegArray !== undefined) {
      arrivalActiveLegIcao = plan.tryGetLeg(plan.activeLateralLeg)?.leg?.fixIcao;
    }

    plan.setArrival(facility.icaoStruct, arrivalIndex, enrouteTransitionIndex, arrivalRunwayTransitionIndex, oneWayRunway);
    WTLineFmsUtils.setFlightPlanProcedureIdents(
      plan,
      {
        ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
        arrivalIdent: facility.arrivals[arrivalIndex].name,
        arrivalEnrouteTransitionIdent: facility.arrivals[arrivalIndex].enRouteTransitions[enrouteTransitionIndex]?.name ?? null,
      },
    );

    if (arrivalSegment.legs.length > 0) {
      arrivalSegment = this.planClearSegment(plan.planIndex, arrivalSegment.segmentIndex, FlightPlanSegmentType.Arrival);
    }

    const insertProcedureObject = this.buildArrivalLegs(facility, arrivalIndex, enrouteTransitionIndex, arrivalRunwayTransitionIndex, false);

    let directTargetLeg: FlightPlanLeg | undefined;
    let handleDirectToDestination = false;
    const directToState = this.getDirectToState(planIndex);

    if (directToState === DirectToState.TOEXISTING) {
      directTargetLeg = this.getDirectToLeg(planIndex);

      if (directTargetLeg?.fixIcao === plan.destinationAirport &&
        directTargetLeg?.fixIcao === insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1].fixIcao) {
        handleDirectToDestination = true;
      }
    }

    if (!handleDirectToDestination) {
      this.tryMoveDestinationLeg(plan);
    }

    for (const procedureLeg of insertProcedureObject.procedureLegs) {
      this.planAddLeg(plan.planIndex, arrivalSegment.segmentIndex, procedureLeg, undefined, WT21LegDefinitionFlags.ProcedureLeg);
    }

    const prevLeg = plan.getPrevLeg(arrivalSegment.segmentIndex, 0);
    const firstArrLeg = arrivalSegment.legs[0];

    let deduplicatedEnrouteLeg: LegDefinition | null = null;

    if (prevLeg && firstArrLeg && this.isDuplicateLeg(prevLeg.leg, firstArrLeg.leg)) {
      deduplicatedEnrouteLeg = this.planRemoveDuplicateLeg(plan.planIndex, prevLeg, firstArrLeg);
    }

    const nextLeg = plan.getNextLeg(arrivalSegment.segmentIndex, Infinity);
    const lastArrLeg = arrivalSegment.legs[arrivalSegment.legs.length - 1];

    // this can remove flightplan segments, so
    if (nextLeg && lastArrLeg && this.isDuplicateLeg(lastArrLeg.leg, nextLeg.leg)) {
      this.planRemoveDuplicateLeg(plan.planIndex, lastArrLeg, nextLeg);
    }

    if (plan.tryGetSegment(arrivalSegment.segmentIndex) !== arrivalSegment) {
      console.error('Arrival segment got deleted in WT21Fms.insertArrival?!');
      return;
    }

    if (handleDirectToDestination) {
      this.moveDirectToDestinationLeg(plan, FlightPlanSegmentType.Arrival, arrivalSegment.segmentIndex);
      this.activateLeg(arrivalSegment.segmentIndex, arrivalSegment.legs.length - 1);
    }

    // If we didn't remove a duplicate, insert a discontinuity at the start of the arrival
    if (!deduplicatedEnrouteLeg && (!prevLeg || !WTLineFmsUtils.isVectorsLeg(prevLeg.leg.type))) {
      this.tryInsertDiscontinuity(plan, arrivalSegment.segmentIndex);
    }

    this.generateSegmentVerticalData(plan, arrivalSegment.segmentIndex);

    const matchingActiveProcedureLegIndex = WTLineFmsUtils.findIcaoInSegment(arrivalSegment, arrivalActiveLegIcao);

    if (activeLegArray && matchingActiveProcedureLegIndex === undefined) {
      this.displaceActiveLegsIntoSegment(plan, arrivalSegment.segmentIndex, activeLegArray);
    } else if (matchingActiveProcedureLegIndex !== undefined) {
      plan.setLateralLeg(arrivalSegment.offset + matchingActiveProcedureLegIndex);
    }

    this.cleanupLegsAfterApproach(plan);

    this.tryConnectProcedures(plan);

    plan.calculate(0);
  }

  private readonly loadArrivalOpIds: number[] = [];

  /**
   * Loads an arrival procedure into the primary flight plan.
   * @param facility The procedure's parent airport facility.
   * @param arrivalIndex The index of the procedure in the parent airport facility's arrival array.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * include a runway transition.
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * include an enroute transition.
   * @param oneWayRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * @param planIndex The index of the plan to target the edit to.
   * @returns A Promise which fulfills with whether the specified arrival procedure was successfully loaded.
   */
  public async loadArrival(
    facility: AirportFacility,
    arrivalIndex: number,
    runwayTransitionIndex: number,
    enrouteTransitionIndex: number,
    oneWayRunway?: OneWayRunway | undefined,
    planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active,
  ): Promise<boolean> {
    this.loadArrivalOpIds[planIndex] ??= 0;
    const opId = ++this.loadArrivalOpIds[planIndex];

    const insertProcedureObject = await this.buildArrivalLegs(facility, arrivalIndex, enrouteTransitionIndex, runwayTransitionIndex, true);

    if (opId !== this.loadArrivalOpIds[planIndex]) {
      return false;
    }

    const plan = this.getPlanToEdit(planIndex);

    const activeSegment = WTLineFmsUtils.getActiveSegment(plan);

    plan.procedureDetails.arrivalFacilityIcaoStruct = facility.icaoStruct;
    plan.setProcedureDetails(plan.procedureDetails);

    let arrivalSegment = plan.getSegment(this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.Arrival));

    const activeLegArray = this.getSegmentActiveLegsToDisplace(plan, arrivalSegment.segmentIndex);

    let arrivalActiveLegIcao: undefined | string;

    if (arrivalIndex > -1 && arrivalIndex === plan.procedureDetails.arrivalIndex && activeSegment !== undefined && activeLegArray !== undefined) {
      arrivalActiveLegIcao = plan.tryGetLeg(plan.activeLateralLeg)?.leg?.fixIcao;
    }

    WTLineFmsUtils.setFlightPlanProcedureIdents(
      plan,
      {
        ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
        arrivalIdent: facility.arrivals[arrivalIndex].name,
        arrivalEnrouteTransitionIdent: facility.arrivals[arrivalIndex].enRouteTransitions[enrouteTransitionIndex]?.name ?? null,
      },
    );
    // Change procedure details after setting idents to make sure consumers get the updated idents
    plan.setArrival(facility.icaoStruct, arrivalIndex, enrouteTransitionIndex, runwayTransitionIndex, oneWayRunway, false);
    plan.setProcedureDetails({ destinationRunway: oneWayRunway });

    if (arrivalSegment.legs.length > 0) {
      arrivalSegment = this.planClearSegment(plan.planIndex, arrivalSegment.segmentIndex, FlightPlanSegmentType.Arrival);
    }

    let directTargetLeg: FlightPlanLeg | undefined;
    let handleDirectToDestination = false;
    const directToState = this.getDirectToState(planIndex);

    if (directToState === DirectToState.TOEXISTING) {
      directTargetLeg = this.getDirectToLeg(planIndex);

      if (
        directTargetLeg
        && plan.destinationAirportIcao
        && ICAO.valueEquals(directTargetLeg.fixIcaoStruct, plan.destinationAirportIcao)
        && ICAO.valueEquals(directTargetLeg.fixIcaoStruct, insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1].fixIcaoStruct)
      ) {
        handleDirectToDestination = true;
      }
    }

    if (!handleDirectToDestination) {
      this.tryMoveDestinationLeg(plan);
    }

    for (const procedureLeg of insertProcedureObject.procedureLegs) {
      this.planAddLeg(plan.planIndex, arrivalSegment.segmentIndex, procedureLeg, undefined, WT21LegDefinitionFlags.ProcedureLeg);
    }

    const prevLeg = plan.getPrevLeg(arrivalSegment.segmentIndex, 0);
    const firstArrLeg = arrivalSegment.legs[0];

    let deduplicatedEnrouteLeg: LegDefinition | null = null;

    if (prevLeg && firstArrLeg && this.isDuplicateLeg(prevLeg.leg, firstArrLeg.leg)) {
      deduplicatedEnrouteLeg = this.planRemoveDuplicateLeg(plan.planIndex, prevLeg, firstArrLeg);
    }

    const nextLeg = plan.getNextLeg(arrivalSegment.segmentIndex, Infinity);
    const lastArrLeg = arrivalSegment.legs[arrivalSegment.legs.length - 1];

    // this can remove flightplan segments, so
    if (nextLeg && lastArrLeg && this.isDuplicateLeg(lastArrLeg.leg, nextLeg.leg)) {
      this.planRemoveDuplicateLeg(plan.planIndex, lastArrLeg, nextLeg);
    }

    if (plan.tryGetSegment(arrivalSegment.segmentIndex) !== arrivalSegment) {
      console.error('Arrival segment got deleted in WT21Fms.insertArrival?!');
      return false;
    }

    if (handleDirectToDestination) {
      this.moveDirectToDestinationLeg(plan, FlightPlanSegmentType.Arrival, arrivalSegment.segmentIndex);
      this.activateLeg(arrivalSegment.segmentIndex, arrivalSegment.legs.length - 1);
    }

    // If we didn't remove a duplicate, insert a discontinuity at the start of the arrival
    if (!deduplicatedEnrouteLeg && prevLeg) {
      this.tryInsertDiscontinuity(plan, arrivalSegment.segmentIndex);
    }

    this.checkDiscontinuityAtEndOfSegment(plan, arrivalSegment.segmentIndex);
    this.generateSegmentVerticalData(plan, arrivalSegment.segmentIndex);

    const matchingActiveProcedureLegIndex = WTLineFmsUtils.findIcaoInSegment(arrivalSegment, arrivalActiveLegIcao);

    if (activeLegArray && matchingActiveProcedureLegIndex === undefined) {
      this.displaceActiveLegsIntoSegment(plan, arrivalSegment.segmentIndex, activeLegArray);
    } else if (matchingActiveProcedureLegIndex !== undefined) {
      plan.setLateralLeg(arrivalSegment.offset + matchingActiveProcedureLegIndex);
    }

    this.cleanupLegsAfterApproach(plan);

    this.tryConnectProcedures(plan);

    await plan.calculate(0);

    return true;
  }

  /**
   * Tries to add a discontinuity when needed at the start of a procedure.
   * @param plan The Flight Plan
   * @param segmentIndex The procedure segment index.
   */
  private tryInsertDiscontinuity(plan: FlightPlan, segmentIndex: number): void {
    const segment = plan.getSegment(segmentIndex);

    if (segment.legs.length > 0) {
      switch (segment.segmentType) {
        case FlightPlanSegmentType.Arrival:
        case FlightPlanSegmentType.Approach:
          this.insertDiscontinuity(plan, segmentIndex, 0);
      }
    }
  }

  /**
   * Method to connect an arrival and approach when the approach begins at a leg that exists in the arrival.
   * @param plan The Lateral Flight Plan.
   */
  private tryConnectProcedures(plan: FlightPlan): void {
    if (plan.procedureDetails.approachIndex === -1 || plan.procedureDetails.arrivalIndex === -1) {
      return;
    }

    // find the first leg in the approach
    let firstApproachLeg: LegDefinition | undefined;
    let firstApproachSegmentLegIndex: number | undefined;
    let matchedArrivalLegSegmentLegIndex: number | undefined;

    const arrivalSegmentIndex = WTLineFmsUtils.getLastSegmentOfType(plan, FlightPlanSegmentType.Arrival);
    const approachSegmentIndex = WTLineFmsUtils.getFirstSegmentOfType(plan, FlightPlanSegmentType.Approach);

    if (approachSegmentIndex === -1 || arrivalSegmentIndex === -1) {
      return;
    }

    const approachSegment = plan.getSegment(approachSegmentIndex);
    const arrivalSegment = plan.getSegment(arrivalSegmentIndex);

    for (let l = 0; l < approachSegment.legs.length; l++) {
      const approachLeg = approachSegment.legs[l];

      if (!FlightPlanUtils.isDiscontinuityLeg(approachLeg.leg.type)) {
        firstApproachLeg = approachLeg;
        firstApproachSegmentLegIndex = l;
        break;
      }
    }

    if (firstApproachLeg === undefined || firstApproachSegmentLegIndex === undefined) {
      return;
    }

    for (let i = arrivalSegment.legs.length - 1; i > 0; i--) {
      const arrivalLeg = arrivalSegment.legs[i];

      if (
        FlightPlanUtils.isToFixLeg(arrivalLeg.leg.type) &&
        ICAO.valueEquals(arrivalLeg.leg.fixIcaoStruct, firstApproachLeg.leg.fixIcaoStruct)
      ) {
        matchedArrivalLegSegmentLegIndex = i;
        break;
      }
    }

    if (firstApproachSegmentLegIndex !== undefined && matchedArrivalLegSegmentLegIndex !== undefined) {
      while (arrivalSegment.legs.length > matchedArrivalLegSegmentLegIndex) {
        plan.removeLeg(arrivalSegmentIndex, matchedArrivalLegSegmentLegIndex);
      }

      for (let j = 0; j < firstApproachSegmentLegIndex; j++) {
        plan.removeLeg(approachSegmentIndex, j);
      }
    }
  }

  /**
   * Builds a sequence of flight plan legs for an arrival procedure.
   * @param facility The procedure's parent airport facility.
   * @param procedureIndex The index of the procedure in the parent airport facility's arrival array.
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * include an enroute transition.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * include a runway transition.
   * @param arrivalRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * @param performLegRemap Whether to remap the built flight plan leg sequence to transform unsupported leg patterns
   * into the closest equivalent supported leg patterns.
   * @returns A sequence of flight plan legs for the specified arrival procedure.
   */
  private buildArrivalLegs(
    facility: AirportFacility,
    procedureIndex: number,
    enrouteTransitionIndex: number,
    runwayTransitionIndex: number,
    performLegRemap: false
  ): InsertProcedureObject;
  /**
   * Builds a sequence of flight plan legs for an arrival procedure.
   * @param facility The procedure's parent airport facility.
   * @param procedureIndex The index of the procedure in the parent airport facility's arrival array.
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * include an enroute transition.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * include a runway transition.
   * @param arrivalRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * @param performLegRemap Whether to remap the built flight plan leg sequence to transform unsupported leg patterns
   * into the closest equivalent supported leg patterns.
   * @returns A Promise which will fulfill with a sequence of flight plan legs for the specified arrival procedure.
   */
  private buildArrivalLegs(
    facility: AirportFacility,
    procedureIndex: number,
    enrouteTransitionIndex: number,
    runwayTransitionIndex: number,
    performLegRemap: true
  ): Promise<InsertProcedureObject>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  private buildArrivalLegs(
    facility: AirportFacility,
    procedureIndex: number,
    enrouteTransitionIndex: number,
    runwayTransitionIndex: number,
    performLegRemap: boolean
  ): InsertProcedureObject | Promise<InsertProcedureObject> {

    const arrival = facility.arrivals[procedureIndex];
    const enRouteTransition = arrival.enRouteTransitions[enrouteTransitionIndex];
    const runwayTransition = arrival.runwayTransitions[runwayTransitionIndex];
    const insertProcedureObject: InsertProcedureObject = { procedureLegs: [] };

    if (enRouteTransition !== undefined && enRouteTransition.legs.length > 0) {
      enRouteTransition.legs.forEach((leg) => {
        insertProcedureObject.procedureLegs.push(FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(leg)));
        if (this.shouldDiscontinuityFollowLeg(leg.type)) {
          insertProcedureObject.procedureLegs.push(FlightPlan.createLeg({ type: LegType.Discontinuity }));
        }
      });
    }

    for (let i = 0; i < arrival.commonLegs.length; i++) {
      const leg = FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(arrival.commonLegs[i]));
      if (i == 0 && insertProcedureObject.procedureLegs.length > 0 &&
        this.isDuplicateIFLeg(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg)) {
        insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1] =
          this.mergeDuplicateLegData(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg);
        continue;
      }
      insertProcedureObject.procedureLegs.push(leg);
      if (this.shouldDiscontinuityFollowLeg(leg.type)) {
        insertProcedureObject.procedureLegs.push(FlightPlan.createLeg({ type: LegType.Discontinuity }));
      }
    }

    if (runwayTransition) {
      for (let i = 0; i < runwayTransition.legs.length; i++) {
        const leg = FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(runwayTransition.legs[i]));
        if (i == 0 && insertProcedureObject.procedureLegs.length > 0 &&
          this.isDuplicateIFLeg(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg)) {
          insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1] =
            this.mergeDuplicateLegData(insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1], leg);
          continue;
        }
        insertProcedureObject.procedureLegs.push(leg);
        if (this.shouldDiscontinuityFollowLeg(leg.type)) {
          insertProcedureObject.procedureLegs.push(FlightPlan.createLeg({ type: LegType.Discontinuity }));
        }
      }
    }

    this.tryInsertIFLeg(insertProcedureObject);

    if (performLegRemap) {
      return this.remapProcedureLegs(insertProcedureObject);
    } else {
      return insertProcedureObject;
    }
  }

  /**
   * Method to move a direct to destination to a specified target segment.
   * @param plan is the primary flight plan.
   * @param targetSegmentType is the target segment type.
   * @param arrivalSegmentIndex is the arrival segment index
   * @returns whether a direct to destination was moved.
   */
  private moveDirectToDestinationLeg(plan: FlightPlan, targetSegmentType: FlightPlanSegmentType, arrivalSegmentIndex?: number): boolean {
    const directTargetSegmentIndex = targetSegmentType === FlightPlanSegmentType.Arrival ? arrivalSegmentIndex : this.findLastEnrouteSegmentIndex(plan);

    if (directTargetSegmentIndex !== undefined && directTargetSegmentIndex > 0 && plan.getLeg(plan.activeLateralLeg).leg.fixIcao === plan.destinationAirport) {
      const destinationLeg = Object.assign({}, plan.getSegment(plan.directToData.segmentIndex).legs[plan.directToData.segmentLegIndex].leg);
      const directTargetLeg = Object.assign({}, plan.getLeg(plan.activeLateralLeg).leg);
      const directOriginLeg = Object.assign({}, plan.getLeg(plan.activeLateralLeg - 1).leg);
      const discoLeg = Object.assign({}, plan.getLeg(plan.activeLateralLeg - 2).leg);

      const newDirectLegIndex = plan.getSegment(directTargetSegmentIndex).legs.length;

      plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex);
      plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex);
      plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex);
      plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex);

      plan.setDirectToData(directTargetSegmentIndex, newDirectLegIndex);

      WTLineFmsUtils.removeFixTypeFlags([destinationLeg, directTargetLeg, directOriginLeg, discoLeg]);

      plan.addLeg(directTargetSegmentIndex, destinationLeg);
      plan.addLeg(directTargetSegmentIndex, discoLeg, undefined, WT21LegDefinitionFlags.DirectTo);
      plan.addLeg(directTargetSegmentIndex, directOriginLeg, undefined, WT21LegDefinitionFlags.DirectTo);
      const newActiveLeg = plan.addLeg(directTargetSegmentIndex, directTargetLeg, undefined, WT21LegDefinitionFlags.DirectTo | WT21LegDefinitionFlags.DirectToTarget);
      const newActiveLegIndex = plan.getLegIndexFromLeg(newActiveLeg);

      plan.setCalculatingLeg(newActiveLegIndex);
      plan.setLateralLeg(newActiveLegIndex);
      plan.planIndex !== WTLineFmsUtils.PRIMARY_ACT_PLAN_INDEX && plan.calculate(newActiveLegIndex);
      return true;
    }

    return false;
  }

  /**
   * Checks if the last leg in the last enroute segment is the destination airport and, if so, moves it into the approach segment.
   * @param plan The lateral flight plan.
   */
  private tryMoveDestinationLeg(plan: FlightPlan): void {
    const lastEnrouteSegmentIndex = this.findLastEnrouteSegmentIndex(plan);
    const lastEnrouteSegment = plan.getSegment(lastEnrouteSegmentIndex);

    if (lastEnrouteSegment !== undefined && lastEnrouteSegment.legs.length > 0 &&
      lastEnrouteSegment.legs[lastEnrouteSegment.legs.length - 1].leg.fixIcao === plan.destinationAirport) {
      const approachSegmentIndex = this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.Approach, true);
      const approachSegment = plan.getSegment(approachSegmentIndex);
      if (approachSegment.legs.length < 1) {
        const destinationLeg = Object.assign({}, lastEnrouteSegment.legs[lastEnrouteSegment.legs.length - 1].leg);
        plan.removeLeg(lastEnrouteSegmentIndex);
        plan.addLeg(approachSegmentIndex, destinationLeg);
      }
    }
  }

  /**
   * Method to find the last enroute segment of the supplied flight plan.
   * @param plan is the flight plan to find the last enroute segment in.
   * @returns a segment index.
   */
  public findLastEnrouteSegmentIndex(plan: FlightPlan): number {
    let enrouteSegmentFound = 0;
    for (let i = 1; i < plan.segmentCount; i++) {
      const segment = plan.getSegment(i);

      if (segment.segmentType === FlightPlanSegmentType.Destination) {
        break;
      }

      if (segment.segmentType === FlightPlanSegmentType.Enroute) {
        enrouteSegmentFound = i;
      }
    }

    return enrouteSegmentFound;
  }

  /**
   * Method to check whether an approach can load, or only activate.
   * @returns true if the approach can be loaded and not activated, otherwise the approach can only be immediatly activated.
   */
  public canApproachLoad(): boolean {
    const plan = this.getFlightPlan();
    if (plan.length > 0) {
      const activeSegment = plan.getSegment(plan.getSegmentIndex(plan.activeLateralLeg));
      if (activeSegment.segmentType !== FlightPlanSegmentType.Approach && plan.length > 1) {
        return true;
      }
    }
    return false;
  }

  private readonly insertApproachOpIds: number[] = [];

  /**
   * Method to add or replace an approach procedure in the flight plan.
   * @param facility is the facility that contains the procedure to add.
   * @param approachIndex is the index of the approach procedure.
   * @param approachTransitionIndex is the index of the approach transition.
   * @param visualRunwayNumber is the visual runway number, if any.
   * @param visualRunwayDesignator is the visual runway designator, if any.
   * @param transStartIndex is the starting leg index for the transition, if any.
   * @param skipCourseReversal Whether to skip the course reversal.
   * @param visualRunwayOffset The visual runway offset.
   * @param planIndex The plan index to target the edit to.
   * @returns A Promise which is fulfilled with whether the approach was inserted.
   */
  public async insertApproach(
    facility: AirportFacility,
    approachIndex: number,
    approachTransitionIndex: number,
    visualRunwayNumber?: number,
    visualRunwayDesignator?: RunwayDesignator,
    transStartIndex?: number,
    skipCourseReversal?: boolean,
    visualRunwayOffset?: number,
    planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active
  ): Promise<boolean> {
    this.insertApproachOpIds[planIndex] ??= 0;
    const opId = ++this.insertApproachOpIds[planIndex];

    const plan = this.getPlanToEdit(planIndex);

    let visualRunway: OneWayRunway | undefined;

    if (visualRunwayNumber !== undefined && visualRunwayDesignator !== undefined) {
      visualRunway = RunwayUtils.matchOneWayRunway(facility, visualRunwayNumber, visualRunwayDesignator);
      if (!visualRunway) {
        return false;
      }
    }

    const insertProcedureObject =
      await this.buildApproachLegs(facility, approachIndex, approachTransitionIndex, visualRunway, transStartIndex, skipCourseReversal, visualRunwayOffset);

    if (opId !== this.insertApproachOpIds[planIndex]) {
      return false;
    }

    if (plan.length > 0 && plan.procedureDetails.approachIndex < 0 && plan.procedureDetails.arrivalFacilityIcaoStruct) {
      const lastLeg = plan.tryGetLeg(plan.length - 1);
      if (lastLeg) {
        const lastLegSegment = plan.getSegmentFromLeg(lastLeg);
        if (
          lastLegSegment
          && lastLegSegment.segmentType !== FlightPlanSegmentType.Departure
          && ICAO.valueEquals(lastLeg.leg.fixIcaoStruct, plan.procedureDetails.arrivalFacilityIcaoStruct)
        ) {
          plan.removeLeg(plan.getSegmentIndex(plan.length - 1));
        }
      }
    }

    if (visualRunway) {
      plan.setUserData('visual_approach', `${visualRunway.designation}`);
    } else if (plan.getUserData('visual_approach')) {
      plan.deleteUserData('visual_approach');
    }

    WTLineFmsUtils.setFlightPlanProcedureIdents(
      plan,
      {
        ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
        approachIdent: visualRunway
          ? `VISUAL ${RunwayUtils.getRunwayNameString(visualRunway.direction, visualRunway.runwayDesignator)}`
          : WTLineFmsUtils.getApproachNameAsString(facility, approachIndex, approachTransitionIndex, false, false),
        paddedApproachIdent: visualRunway
          ? `VISUAL ${RunwayUtils.getRunwayNameString(visualRunway.direction, visualRunway.runwayDesignator)}`
          : WTLineFmsUtils.getApproachNameAsString(facility, approachIndex, approachTransitionIndex, false, true),
        approachTransitionIdent: visualRunway
          ? null
          : facility.approaches[approachIndex].transitions[approachTransitionIndex]?.name ?? null,
      },
    );
    // Change procedure details after setting idents to make sure consumers get the updated idents
    plan.setApproach(facility.icaoStruct, approachIndex, approachTransitionIndex, false);
    plan.setProcedureDetails({
      arrivalFacilityIcaoStruct: facility.icaoStruct,
      destinationRunway: insertProcedureObject.runway,
      arrivalRunway: insertProcedureObject.runway,
    });

    const directToState = this.getDirectToState(WTLineLegacyFlightPlans.Active);

    let skipDestinationLegCheck = false;
    if (directToState === DirectToState.TOEXISTING && plan.destinationAirportIcao !== undefined) {
      const directToLeg = this.getDirectToLeg(planIndex);

      if (directToLeg !== undefined && ICAO.valueEquals(directToLeg.fixIcaoStruct, plan.destinationAirportIcao)) {
        skipDestinationLegCheck = true;
      }
    }

    if (directToState === DirectToState.TOEXISTING && plan.procedureDetails.arrivalIndex < 0 && !skipDestinationLegCheck) {
      this.moveDirectToDestinationLeg(plan, FlightPlanSegmentType.Enroute);
    }

    const segmentIndex = this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.Approach);
    const missedApproachSegmentIndex = this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.MissedApproach);

    const activeLegArray = this.getSegmentActiveLegsToDisplace(plan, segmentIndex);

    let apprSegment = plan.getSegment(segmentIndex);

    if (apprSegment.legs.length > 0) {
      apprSegment = this.planClearSegment(plan.planIndex, segmentIndex, FlightPlanSegmentType.Approach);
    }

    const missedApprSegment = plan.getSegment(missedApproachSegmentIndex);

    if (missedApprSegment.legs.length > 0) {
      this.planClearSegment(plan.planIndex, missedApproachSegmentIndex, FlightPlanSegmentType.MissedApproach);
    }

    let mapIndex = -1;
    for (let i = 0; i < insertProcedureObject.procedureLegs.length; i++) {
      const leg = insertProcedureObject.procedureLegs[i];

      if (visualRunway !== undefined) {
        this.addVisualFacilityFromLeg(leg, visualRunway.designation);
      }

      let flags = leg.legDefinitionFlags ?? WT21LegDefinitionFlags.None;
      flags |= WT21LegDefinitionFlags.ProcedureLeg;

      this.planAddLeg(plan.planIndex, segmentIndex, leg, undefined, flags);

      if (leg.fixTypeFlags & FixTypeFlags.MAP) {
        mapIndex = i;
        break;
      }
    }

    const numMissedApproachLegs = insertProcedureObject.procedureLegs.length - (mapIndex + 1);

    if (mapIndex !== -1 && numMissedApproachLegs > 0) {
      for (let i = mapIndex + 1; i < insertProcedureObject.procedureLegs.length; i++) {
        const leg = insertProcedureObject.procedureLegs[i];

        let flags = leg.legDefinitionFlags ?? WT21LegDefinitionFlags.None;
        flags |= (WT21LegDefinitionFlags.ProcedureLeg | WT21LegDefinitionFlags.MissedApproach);

        this.planAddLeg(plan.planIndex, missedApproachSegmentIndex, leg, undefined, flags);
      }
    }

    const prevLeg = plan.getPrevLeg(segmentIndex, 0);
    const firstAppLeg = apprSegment.legs[0];

    let deduplicatedArrivalLeg: LegDefinition | null = null;

    if (prevLeg && firstAppLeg && this.isDuplicateLeg(prevLeg.leg, firstAppLeg.leg)) {
      deduplicatedArrivalLeg = this.planRemoveDuplicateLeg(plan.planIndex, prevLeg, firstAppLeg);
    }

    const approach = visualRunway ? undefined : facility.approaches[approachIndex] as ApproachProcedure | undefined;

    let approachType: ExtendedApproachType = AdditionalApproachType.APPROACH_TYPE_VISUAL;
    let approachRnavTypeFlags = RnavTypeFlags.None;
    let approachIsCircling = false;
    let approachReferenceFacility: VorFacility | null = null;
    if (approach) {
      approachType = approach.approachType;
      approachRnavTypeFlags = WTLineFmsUtils.getBestRnavType(approach.rnavTypeFlags);
      approachIsCircling = !approach.runway;

      if (WTLineFmsUtils.approachHasNavFrequency(approach)) {
        approachReferenceFacility = (await ApproachUtils.getReferenceFacility(approach, this.facLoader) as VorFacility | undefined) ?? null;
      }
    }

    this.setApproachDetails(true, approachType, approachRnavTypeFlags, false, approachIsCircling, approachReferenceFacility);

    // If we didn't remove a duplicate, insert a discontinuity at the start of the approach
    if (!deduplicatedArrivalLeg && prevLeg) {
      this.tryInsertDiscontinuity(plan, segmentIndex);
    }

    this.generateSegmentVerticalData(plan, segmentIndex);

    if (activeLegArray) {
      this.displaceActiveLegsIntoSegment(plan, segmentIndex, activeLegArray);
    }

    this.cleanupLegsAfterApproach(plan);

    this.tryConnectProcedures(plan);

    plan.calculate(0);

    return true;
  }

  /**
   * Method to insert the approach legs.
   * @param facility The facility to build legs from.
   * @param approachIndex The approach procedure index to build legs from.
   * @param approachTransitionIndex The transition index to build legs from.
   * @param visualRunway If this is a visual approach, the visual approach one way runway object.
   * @param transStartIndex The starting leg index for the transition, if any.
   * @param skipCourseReversal Whether to skip the course reversal.
   * @param visualRunwayOffset The visual runway offset in NM.
   * @returns A Promise which is fulfilled with an `InsertProcedureObject` containing the flight plan legs to insert
   * into the flight plan.
   */
  private async buildApproachLegs(
    facility: AirportFacility,
    approachIndex: number,
    approachTransitionIndex: number,
    visualRunway?: OneWayRunway,
    transStartIndex?: number,
    skipCourseReversal?: boolean,
    visualRunwayOffset?: number
  ): Promise<InsertProcedureObject> {
    const isVisual = !!visualRunway;
    const approach = isVisual ? WTLineFmsUtils.buildVisualApproach(this.facRepo, facility, visualRunway!, visualRunwayOffset ?? 5) : facility.approaches[approachIndex];
    const transition = approach.transitions[approachTransitionIndex];
    const insertProcedureObject: InsertProcedureObject = { procedureLegs: [] };

    if (transition !== undefined && transition.legs.length > 0) {
      const startIndex = transStartIndex !== undefined ? transStartIndex : 0;
      for (let t = startIndex; t < transition.legs.length; t++) {
        insertProcedureObject.procedureLegs.push(FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(transition.legs[t])));
      }
    }

    const lastTransitionLeg = insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1];

    const finalLegs = approach.finalLegs;

    // The transition is allowed to join to either the FACF (IF flag in MSFS) or FAF, and the FACF can be bypassed.
    let finalStartIndex = 0;
    if (lastTransitionLeg && WTLineFms.isXFLeg(lastTransitionLeg)) {
      for (let i = 0; i < finalLegs.length; i++) {
        const finalLeg = finalLegs[i];

        const isFafOrFacf = BitFlags.isAny(finalLeg.fixTypeFlags, FixTypeFlags.FAF | FixTypeFlags.IF);
        if (isFafOrFacf && WTLineFms.isXFLeg(finalLeg) && ICAO.valueEquals(lastTransitionLeg.fixIcaoStruct, finalLeg.fixIcaoStruct)) {
          finalStartIndex = i;
        }

        if (BitFlags.isAny(finalLeg.fixTypeFlags, FixTypeFlags.FAF)) {
          break;
        }
      }
    }

    for (let i = finalStartIndex; i < finalLegs.length; i++) {
      const leg = FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(finalLegs[i]));

      if (i === finalStartIndex && lastTransitionLeg && WTLineFms.isDuplicateXFLeg(lastTransitionLeg, leg)) {
        // Merge legs, preferring the final approach constraints, but keep the transition constraints if there are none on the FAF/FACF
        insertProcedureObject.procedureLegs[insertProcedureObject.procedureLegs.length - 1] = this.mergeDuplicateLegData(lastTransitionLeg, leg, true);
        continue;
      }

      if (!isVisual && leg.fixIcao[0] === 'R') {
        const approachRunway = RunwayUtils.matchOneWayRunway(facility, approach.runwayNumber, approach.runwayDesignator);
        if (approachRunway) {
          insertProcedureObject.runway = approachRunway;
          const runwayLeg = WTLineFmsUtils.buildRunwayLeg(facility, approachRunway, false);
          insertProcedureObject.procedureLegs.push(runwayLeg);
        }
      } else if (isVisual && i === finalLegs.length - 1) {
        insertProcedureObject.runway = visualRunway;
        insertProcedureObject.procedureLegs.push(leg);
        if (approach.missedLegs.length > 0) {
          insertProcedureObject.procedureLegs.push(approach.missedLegs[0]);
        }
      } else {
        insertProcedureObject.procedureLegs.push(leg);
      }
    }

    if (!isVisual) {
      this.tryInsertIFLeg(insertProcedureObject);
      this.tryReconcileIAFLeg(insertProcedureObject);
      this.manageFafAltitudeRestriction(insertProcedureObject);
      this.tryCleanupHold(insertProcedureObject);
      if (skipCourseReversal) {
        this.tryRemoveCourseReversal(insertProcedureObject);
      }
      this.tryInsertMap(insertProcedureObject);

      if (!insertProcedureObject.runway && approach.runway) {
        insertProcedureObject.runway = RunwayUtils.matchOneWayRunway(facility, approach.runwayNumber, approach.runwayDesignator);
      }

      // Adds missed approach legs
      if (insertProcedureObject.procedureLegs.length > 0) {
        const missedLegs = approach.missedLegs ?? [];
        if (missedLegs.length > 0) {
          let maphIndex = -1;
          for (let m = missedLegs.length - 1; m >= 0; m--) {
            switch (missedLegs[m].type) {
              case LegType.HA:
              case LegType.HF:
              case LegType.HM:
                maphIndex = m - 1;
                break;
            }
          }

          for (let n = 0; n < missedLegs.length; n++) {
            const newLeg = FlightPlanUtils.convertLegRunwayIcaosToSdkFormat(FlightPlan.createLeg(missedLegs[n])) as InsertProcedureObjectLeg;

            if (maphIndex >= 0 && n === maphIndex) {
              newLeg.fixTypeFlags |= FixTypeFlags.MAHP;
            }

            newLeg.legDefinitionFlags = WT21LegDefinitionFlags.MissedApproach | WT21LegDefinitionFlags.ProcedureLeg;

            insertProcedureObject.procedureLegs.push(newLeg);
          }
        }
      }
    }

    return this.remapProcedureLegs(insertProcedureObject);
  }

  /**
   * Checks for discontinuities at the end of a segment after procedure insertion and moves them if needed.
   * @param plan The Flight Plan.
   * @param segmentIndex The segment index to check.
   */
  private checkDiscontinuityAtEndOfSegment(plan: FlightPlan, segmentIndex: number): void {
    const segment = plan.getSegment(segmentIndex);

    if (segment.legs.length === 0) {
      return;
    }

    const lastSegmentLeg = segment.legs[segment.legs.length - 1];

    // If the last procedure leg is now a discontinuity...
    if (FlightPlanUtils.isDiscontinuityLeg(lastSegmentLeg.leg.type)) {
      this.planRemoveLeg(plan.planIndex, segmentIndex, segment.legs.length - 1);

      const nextLeg = plan.getNextLeg(segmentIndex, Infinity);
      const nextSegmentIndex = nextLeg ? plan.getSegmentFromLeg(nextLeg)?.segmentIndex : undefined;

      if (nextSegmentIndex !== undefined) {
        this.insertDiscontinuity(plan, nextSegmentIndex, 0);
      } else {
        // ...otherwise just remove it
        // TODO need to make sure that we re-add this later on
      }
    }
  }

  /**
   * Manages the altitude constraints in a segment when adding a procedure by creating a VerticalData object for each leg.
   * @param plan The Flight Plan.
   * @param segmentIndex The segment index for the inserted procedure.
   */
  private generateSegmentVerticalData(plan: FlightPlan, segmentIndex: number): void {
    const segment = plan.getSegment(segmentIndex);

    for (let l = 0; l < segment.legs.length; l++) {
      this.generateLegVerticalData(plan, segmentIndex, l);
    }
  }

  /**
   * Remaps unsupported leg patterns in a sequence of procedure flight plan legs into the closest equivalent supported
   * leg patterns.
   * @param insertProcedureObject The object containing the flight plan leg sequence to remap.
   * @returns A Promise which is fulfilled with the object containing the flight plan leg sequence to remap, after the
   * operation has been completed.
   */
  private async remapProcedureLegs(insertProcedureObject: InsertProcedureObject): Promise<InsertProcedureObject> {
    for (let i = 0; i < insertProcedureObject.procedureLegs.length; i++) {
      const leg = insertProcedureObject.procedureLegs[i];

      // Find sequences of CI/VI -> IF -> TF legs and remap them to CI/VI -> CF legs.
      if (
        (leg.type === LegType.CI || leg.type === LegType.VI)
        && insertProcedureObject.procedureLegs[i + 1]?.type === LegType.IF
        && insertProcedureObject.procedureLegs[i + 2]?.type === LegType.TF
      ) {
        const ifLeg = insertProcedureObject.procedureLegs[i + 1];
        const tfLeg = insertProcedureObject.procedureLegs[i + 2];
        if (ICAO.isValueFacility(ifLeg.fixIcaoStruct) && ICAO.isValueFacility(tfLeg.fixIcaoStruct)) {
          const [origin, terminator] = await this.facLoader.getFacilities([ifLeg.fixIcaoStruct, tfLeg.fixIcaoStruct], 0);
          if (origin && terminator) {
            const trueCourse = GeoPoint.finalBearing(origin.lat, origin.lon, terminator.lat, terminator.lon);
            if (isFinite(trueCourse)) {
              // Get the magnetic variation to use for the TF leg (to be converted to a CF leg). If the leg's reference
              // facility is a VOR, then use the reference facility's magvar. Otherwise, get the magvar from the
              // terminator facility.
              let magVar: number;
              if (ICAO.isValueFacility(tfLeg.originIcaoStruct, FacilityType.VOR)) {
                const referenceFacility = await this.facLoader.tryGetFacility(FacilityType.VOR, tfLeg.originIcaoStruct);
                if (referenceFacility) {
                  magVar = FacilityUtils.getMagVar(referenceFacility);
                }
              }
              magVar ??= FacilityUtils.getMagVar(terminator);

              const magCourse = MagVar.trueToMagnetic(trueCourse, magVar);

              // Remove IF leg.
              insertProcedureObject.procedureLegs.splice(i + 1, 1);

              // Convert TF leg to CF leg.
              tfLeg.type = LegType.CF;
              tfLeg.course = magCourse === 0 ? 360 : magCourse;
              tfLeg.trueDegrees = false;
              tfLeg.distance = UnitType.GA_RADIAN.convertTo(GeoPoint.distance(origin.lat, origin.lon, terminator.lat, terminator.lon), UnitType.METER);
              tfLeg.distanceMinutes = false;

              // Increment the index so that when we continue the iteration, we skip the converted CF (formerly TF) leg.
              ++i;

              continue;
            }
          } else {
            console.warn(`WTLineFms::remapProcedureLegs(): could not remap xI -> IF -> TF leg sequence because one or both of the origin (${ICAO.tryValueToStringV2(ifLeg.fixIcaoStruct)}) and terminator (${ICAO.tryValueToStringV2(tfLeg.fixIcaoStruct)}) facilities could not be found`);
          }
        } else {
          console.warn('WTLineFms::remapProcedureLegs(): could not remap xI -> IF -> TF leg sequence because one or both of the origin and terminator facilities were not defined');
        }

        // If we are here, then it means we could not remap the CI/VI -> IF -> TF leg sequence for some reason.
        // Increment the index so that when we continue the iteration, we skip over all the legs in the sequence.
        i += 2;

        continue;
      }
    }

    return insertProcedureObject;
  }

  /**
   * Manages the altitude constraints for a leg when adding a procedure by creating a VerticalData object for the leg.
   * @param plan The Flight Plan.
   * @param segmentIndex The segment index.
   * @param localLegIndex The local leg index.
   * @param forceVerticalFlightPhase The vertical flight phase to force on the vertical data. Otherwise, determined by the leg segment type.
   */
  private generateLegVerticalData(plan: FlightPlan, segmentIndex: number, localLegIndex: number, forceVerticalFlightPhase?: VerticalFlightPhase): void {
    const segment = plan.getSegment(segmentIndex);
    const leg = segment.legs[localLegIndex];

    const altitude1 = leg.leg.altitude1;
    const altitude2 = leg.leg.altitude2;
    const altDesc = (BitFlags.isAll(leg.leg.fixTypeFlags, FixTypeFlags.MAP) && altitude1 !== 0) ? AltitudeRestrictionType.At : leg.leg.altDesc;
    const speedRestriction = leg.leg.speedRestriction;

    const verticalData: Partial<VerticalData> = {
      phase: forceVerticalFlightPhase ?? (segment.segmentType === FlightPlanSegmentType.Departure || BitFlags.isAll(leg.flags, LegDefinitionFlags.MissedApproach)
        ? VerticalFlightPhase.Climb
        : VerticalFlightPhase.Descent),
      altDesc: altDesc,
      altitude1: altitude1,
      altitude2: altitude2,
      speed: speedRestriction <= 0 ? 0 : speedRestriction,
      speedDesc: speedRestriction <= 0 ? SpeedRestrictionType.Unused : SpeedRestrictionType.AtOrBelow,
      speedUnit: SpeedUnit.IAS
    };

    plan.setLegVerticalData(segmentIndex, localLegIndex, verticalData);
  }

  /**
   * Manages the altitude constraints for FAF legs where vertical angle info is also provided.
   * @param proc A procedure object.
   * @returns the procedure object, after it has been changed.
   */
  private manageFafAltitudeRestriction(proc: InsertProcedureObject): InsertProcedureObject {
    proc.procedureLegs.forEach(leg => {
      if (leg.fixTypeFlags === FixTypeFlags.FAF && leg.altitude2 > 0) {
        const alt = leg.altitude1 <= leg.altitude2 ? leg.altitude1 : leg.altitude2;
        leg.altDesc = AltitudeRestrictionType.At;
        leg.altitude1 = alt;
        leg.altitude2 = alt;
      } else if (leg.fixTypeFlags === FixTypeFlags.FAF) {
        leg.altDesc = AltitudeRestrictionType.At;
        leg.altitude2 = leg.altitude1;
      }
    });
    return proc;
  }


  /**
   * Inserts an IF leg at the beginning of a procedure if it begins with a leg type which defines a fixed origin.
   * @param proc A procedure object.
   * @returns the procedure object, after it has been changed.
   */
  private tryInsertIFLeg(proc: InsertProcedureObject): InsertProcedureObject {
    const firstLeg = proc.procedureLegs[0];
    let icao: IcaoValue | undefined;
    switch (firstLeg?.type) {
      case LegType.HA:
      case LegType.HF:
      case LegType.HM:
      case LegType.PI:
      case LegType.FD:
      case LegType.FC:
        icao = firstLeg.fixIcaoStruct;
        break;
      case LegType.FM:
      case LegType.VM:
        icao = firstLeg.originIcaoStruct;
        break;
    }

    if (icao && !ICAO.isValueEmpty(icao)) {
      proc.procedureLegs.unshift(FlightPlan.createLeg({
        type: LegType.IF,
        fixIcaoStruct: icao,
        fixTypeFlags: firstLeg.fixTypeFlags & (FixTypeFlags.IF | FixTypeFlags.IAF)
      }));

      if (firstLeg?.type === LegType.HF || firstLeg?.type === LegType.PI) {
        proc.procedureLegs[0].altDesc = firstLeg.altDesc;
        proc.procedureLegs[0].altitude1 = firstLeg.altitude1;
        proc.procedureLegs[0].altitude2 = firstLeg.altitude2;
      }

      // need to remove IF/IAF flags from the original first leg (now the second leg)
      const replacementLeg = FlightPlan.createLeg(proc.procedureLegs[1]);
      replacementLeg.fixTypeFlags = replacementLeg.fixTypeFlags & ~(FixTypeFlags.IF | FixTypeFlags.IAF);
      proc.procedureLegs[1] = replacementLeg;
    }

    return proc;
  }

  /**
   * Checks the approach legs for an IAF fix type flag, and if one exists, amend the approach to ensure that
   * the IAF is not on a hold/pt leg and that we do not add legs prior to the IAF except in cases where we needed to add
   * an IF leg type.
   * @param proc A procedure object.
   * @returns the procedure object, after it has been changed.
   */
  private tryReconcileIAFLeg(proc: InsertProcedureObject): InsertProcedureObject {
    let iafIndex = -1;
    for (let i = 0; i < proc.procedureLegs.length; i++) {
      const leg = proc.procedureLegs[i];
      if (leg.fixTypeFlags === FixTypeFlags.IAF) {
        iafIndex = i;
        switch (leg.type) {
          case LegType.HA:
          case LegType.HF:
          case LegType.HM:
          case LegType.PI:
          case LegType.FD:
          case LegType.FC:
            if (iafIndex > 0) {
              leg.fixTypeFlags &= ~FixTypeFlags.IAF;
              proc.procedureLegs[iafIndex - 1].fixTypeFlags |= FixTypeFlags.IAF;
              iafIndex--;
            }
        }
        break;
      }
    }
    return proc;
  }

  /**
   * Inserts a MAP fix type flag if none exists on the approach.
   * @param proc A procedure object.
   * @returns the procedure object, after it has been changed.
   */
  private tryInsertMap(proc: InsertProcedureObject): InsertProcedureObject {
    let addMap = true;
    let runwayIndex = -1;

    for (let i = 0; i < proc.procedureLegs.length; i++) {
      const leg = proc.procedureLegs[i];
      if (leg.fixTypeFlags === FixTypeFlags.MAP) {
        addMap = false;
        break;
      }
      if (leg.fixIcao.search('R') === 0) {
        runwayIndex = i;
        break;
      }
    }

    if (addMap && runwayIndex > -1) {
      proc.procedureLegs[runwayIndex].fixTypeFlags = FixTypeFlags.MAP;
    }

    return proc;
  }

  /**
   * Method to remove the duplicate leg after the hold leg.
   * @param proc A procedure object.
   * @returns the procedure object, after it has been changed.
   */
  private tryCleanupHold(proc: InsertProcedureObject): InsertProcedureObject {
    for (let i = 0; i < proc.procedureLegs.length; i++) {
      const leg = proc.procedureLegs[i];
      if (leg.type === LegType.HF) {
        const next = proc.procedureLegs[i + 1];
        if (leg.fixIcao === next.fixIcao && next.type === LegType.IF) {
          proc.procedureLegs.splice(i + 1, 1);
        }
      }
    }
    return proc;
  }

  /**
   * Method to remove a course reversal in an approach procedure.
   * @param proc A procedure object.
   * @returns the procedure object, after it has been changed.
   */
  private tryRemoveCourseReversal(proc: InsertProcedureObject): InsertProcedureObject {
    let canRemove = false;
    if (proc.procedureLegs.length > 2) {
      const leg = proc.procedureLegs[1];
      switch (leg.type) {
        case LegType.HA:
        case LegType.HF:
        case LegType.HM:
        case LegType.PI:
          canRemove = true;
      }
    }
    if (canRemove) {
      proc.procedureLegs.splice(1, 1);
    }
    return proc;
  }

  /**
   * Method to remove the departure from the flight plan.
   *
   * If a departure airport and runway were specified, this method will also add an origin runway leg.
   *
   * @param planIndex the index of the flight plan to target the edit to.
   * @param origin Whether to remove the origin departure (true) or destination airport departure (false).
   */
  public async removeDeparture(planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active, origin = true): Promise<void> {
    const plan = this.getPlanToEdit(planIndex);

    const segmentIndex = this.ensureOnlyOneDepartureSegment(plan, origin);

    if (origin) {
      plan.setDeparture();
      WTLineFmsUtils.setFlightPlanProcedureIdents(
        plan,
        {
          ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
          originDepartureIdent: null,
          originDepartureEnrouteTransitionIdent: null,
        },
      );
    } else {
      WTLineFmsUtils.setFlightPlanDestinationAirportDepartureProcedure(
        plan,
        {
          ...WTLineFmsUtils.getFlightPlanDestinationAirportDepartureProcedure(plan),
          departureIndex: -1,
          departureRunwayTransitionIndex: -1,
          departureEnrouteTransitionIndex: -1,
        }
      );
      WTLineFmsUtils.setFlightPlanProcedureIdents(
        plan,
        {
          ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
          destinationDepartureIdent: null,
          destinationDepartureEnrouteTransitionIdent: null,
        },
      );
    }

    this.planClearSegment(plan.planIndex, segmentIndex, FlightPlanSegmentType.Departure);

    if (origin) {
      // Remove constraints from first enroute leg
      this.clearFirstEnrouteLegVerticalData(plan);
    }

    const airportIcao = origin ? plan.originAirportIcao : plan.destinationAirportIcao;
    const departureData = WTLineFmsUtils.getFlightPlanDepartureData(plan, origin);

    if (airportIcao && !ICAO.isValueEmpty(airportIcao) && departureData.runway) {
      const airport = await this.facLoader.getFacility(FacilityType.Airport, airportIcao, AirportFacilityDataFlags.Minimal);

      this.planAddOriginDestinationLeg(plan.planIndex, true, segmentIndex, airport, departureData.runway);

      const leg = plan.getLeg(segmentIndex, 0);
      const prevLeg = plan.getPrevLeg(segmentIndex, 0);
      const nextLeg = plan.getNextLeg(segmentIndex, 0);

      if (prevLeg) {
        this.insertDiscontinuity(plan, segmentIndex, 0);
      }

      if (nextLeg) {
        if (this.isDuplicateLeg(leg.leg, nextLeg.leg)) {
          this.planRemoveDuplicateLeg(plan.planIndex, leg, nextLeg);
        } else {
          this.insertDiscontinuity(plan, segmentIndex + 1, 0);
        }
      }
    }

    plan.calculate(0);
  }

  /**
   * Method to remove the arrival from the flight plan.
   * @param planIndex The index of the plan to target for edit.
   */
  public async removeArrival(planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): Promise<void> {
    const plan = this.getPlanToEdit(planIndex);

    const segmentIndex = this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.Arrival);

    plan.setArrival();
    WTLineFmsUtils.setFlightPlanProcedureIdents(
      plan,
      {
        ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
        arrivalIdent: null,
        arrivalEnrouteTransitionIdent: null,
      },
    );

    const activeLegArray = this.getSegmentActiveLegsToDisplace(plan, segmentIndex);

    this.cleanupLegsAfterApproach(plan);

    this.planClearSegment(plan.planIndex, segmentIndex);

    // Remove constraints from last enroute leg
    this.clearLastEnrouteLegVerticalData(plan);

    const prevLeg = plan.getPrevLeg(segmentIndex, 0);
    const nextLeg = plan.getNextLeg(segmentIndex, -1);

    if (prevLeg && nextLeg && this.isDuplicateLeg(prevLeg.leg, nextLeg.leg)) {
      this.planRemoveDuplicateLeg(plan.planIndex, prevLeg, nextLeg);
    }

    if (activeLegArray) {
      this.displaceActiveLegsToEnroute(plan, activeLegArray);
    }

    plan.calculate(0);
  }

  /**
   * Method to remove the approach from the flight plan.
   * @param planIndex the index of the plan to target the edit to.
   */
  public async removeApproach(planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): Promise<void> {
    const plan = this.getPlanToEdit(planIndex);

    const firstApproachSegmentIndex = WTLineFmsUtils.getFirstSegmentOfType(plan, FlightPlanSegmentType.Approach);
    let lastApproachSegmentIndex = WTLineFmsUtils.getLastSegmentOfType(plan, FlightPlanSegmentType.MissedApproach);

    if (lastApproachSegmentIndex === -1) {
      lastApproachSegmentIndex = WTLineFmsUtils.getLastSegmentOfType(plan, FlightPlanSegmentType.Approach);
    }

    if (firstApproachSegmentIndex === -1 || lastApproachSegmentIndex === -1) {
      return;
    }

    if (plan.getUserData('visual_approach')) {
      plan.deleteUserData('visual_approach');
    }

    this.setApproachDetails(false, ApproachType.APPROACH_TYPE_UNKNOWN, RnavTypeFlags.None, false, false, null);

    let activeLegArray;

    // Go through each approach and missed approach segment to find active legs to displace
    for (let i = firstApproachSegmentIndex; i <= lastApproachSegmentIndex; i++) {
      const segmentActiveLegs = this.getSegmentActiveLegsToDisplace(plan, i);

      if (segmentActiveLegs) {
        activeLegArray = segmentActiveLegs;
        break;
      }
    }

    plan.procedureDetails.arrivalRunwayTransitionIndex = -1;
    plan.setDestinationRunway(undefined, false);
    plan.setApproach();
    WTLineFmsUtils.setFlightPlanProcedureIdents(
      plan,
      {
        ...WTLineFmsUtils.getFlightPlanProcedureIdents(plan),
        approachIdent: null,
        paddedApproachIdent: null,
        approachTransitionIdent: null,
      },
    );

    this.cleanupLegsAfterApproach(plan);

    // Remove all approach and missed approach segments, and anything in between
    const approachSegment = plan.getSegment(this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.Approach));

    if (approachSegment.legs.length > 0) {
      this.planClearSegment(planIndex, approachSegment.segmentIndex, FlightPlanSegmentType.Approach);
    }

    const missedApproachSegment = plan.getSegment(this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.MissedApproach));

    if (missedApproachSegment.legs.length > 0) {
      this.planClearSegment(planIndex, missedApproachSegment.segmentIndex, FlightPlanSegmentType.MissedApproach);
    }

    // Remove constraints from last enroute leg if there wasn't an arrival
    if (plan.procedureDetails.arrivalIndex === -1) {
      this.clearLastEnrouteLegVerticalData(plan);
    }

    const prevLeg = plan.getPrevLeg(firstApproachSegmentIndex, 0);
    const nextLeg = plan.getNextLeg(firstApproachSegmentIndex, -1);

    if (prevLeg && nextLeg && this.isDuplicateLeg(prevLeg.leg, nextLeg.leg)) {
      this.planRemoveDuplicateLeg(plan.planIndex, prevLeg, nextLeg);
    }

    if (activeLegArray) {
      this.displaceActiveLegsToEnroute(plan, activeLegArray);
    }

    plan.calculate(0);
  }

  /**
   * Method to remove the missed approach from the flight plan.
   * @param planIndex the index of the plan to target the edit to.
   */
  public removeMissedApproach(planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): void {
    const plan = this.getPlanToEdit(planIndex);

    const activeLegArray = this.getSegmentActiveLegsToDisplace(plan, this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.MissedApproach));

    const missedApproachSegmentIndex = this.ensureOnlyOneSegmentOfType(plan.planIndex, FlightPlanSegmentType.MissedApproach);

    this.planRemoveSegment(plan.planIndex, missedApproachSegmentIndex);

    if (activeLegArray) {
      this.displaceActiveLegsToEnroute(plan, activeLegArray);
    }

    plan.calculate(0);
  }

  /**
   * Clears the vertical data of the last enroute leg, if applicable
   *
   * @param plan the lateral flight plan
   */
  private clearFirstEnrouteLegVerticalData(plan: FlightPlan): void {
    let firstEnrouteSegment: FlightPlanSegment | undefined;
    for (let i = 0; i < plan.segmentCount; i++) {
      const segment = plan.getSegment(i);

      if (segment.segmentType === FlightPlanSegmentType.Enroute && segment.legs.length > 0) {
        firstEnrouteSegment = segment;
        break;
      }
    }

    if (firstEnrouteSegment) {
      plan.setLegVerticalData(firstEnrouteSegment.offset, { altDesc: AltitudeRestrictionType.Unused, speedDesc: SpeedRestrictionType.Unused });
    }
  }

  /**
   * Clears the vertical data of the last enroute leg, if applicable
   * @param plan the lateral flight plan
   */
  private clearLastEnrouteLegVerticalData(plan: FlightPlan): void {
    let lastEnrouteSegment: FlightPlanSegment | undefined;
    for (let i = plan.segmentCount - 1; i >= 0; i--) {
      const segment = plan.getSegment(i);

      if (segment.segmentType === FlightPlanSegmentType.Enroute && segment.legs.length > 0) {
        lastEnrouteSegment = segment;
        break;
      }
    }

    if (lastEnrouteSegment) {
      plan.setLegVerticalData(
        lastEnrouteSegment.offset + (lastEnrouteSegment.legs.length - 1),
        { altDesc: AltitudeRestrictionType.Unused, speedDesc: SpeedRestrictionType.Unused },
      );
    }
  }

  /**
   * Displaces a sequence of flight plan legs contained in a now-removed segment ending with the active leg into the
   * end of the last enroute flight plan segment. If the displaced active leg was a direct-to leg, then a new direct-to
   * will be created to the displaced target leg. Otherwise, the active leg is set to the displaced active leg.
   * @param plan The flight plan into which to displace the legs.
   * @param activeLegArray The sequence of flight plan legs to displace. The sequence should contain all of the legs
   * contained in the former active segment up to and including the active leg.
   */
  private displaceActiveLegsToEnroute(plan: FlightPlan, activeLegArray: LegDefinition[]): void {
    let segmentIndex = this.findLastEnrouteSegmentIndex(plan);

    const segment = plan.getSegment(segmentIndex);

    if (segment.legs.length > 0) {
      segmentIndex = this.planInsertSegment(plan.planIndex, segmentIndex + 1, FlightPlanSegmentType.Enroute).segmentIndex;
    }

    this.displaceActiveLegsIntoSegment(plan, segmentIndex, activeLegArray);
  }

  /**
   * Method to activate a leg in the flight plan.
   * @param segmentIndex is the index of the segment containing the leg to activate.
   * @param legIndex is the index of the leg in the selected segment activate.
   * @param removeExistingDTO Whether to check for and remove the existing direct to legs.
   */
  public activateLeg(segmentIndex: number, legIndex: number, removeExistingDTO = true): void {
    const modPlan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);
    const indexInFlightplan = modPlan.getSegment(segmentIndex).offset + legIndex;

    if (removeExistingDTO && this.getDirectToState(modPlan.planIndex) === DirectToState.TOEXISTING) {
      this.removeDirectToExisting(modPlan.planIndex, indexInFlightplan);
      // The call above handles setting the active leg
    } else {
      modPlan.setCalculatingLeg(indexInFlightplan);
      modPlan.setLateralLeg(indexInFlightplan);
      modPlan.calculate(Math.max(0, indexInFlightplan - 1));
    }

    this.legWasActivatedInModPlan = true;
  }

  /**
   * Method to check if there is a currently loaded missed approach to be activated.
   * @returns whether the approach can activate
   */
  public canMissedApproachActivate(): boolean {
    const plan = this.getFlightPlan();
    if (this.cdiSource.type === NavSourceType.Gps && plan && plan.activeLateralLeg < plan.length - 1 && plan.segmentCount > 0) {
      const segmentIndex = plan.getSegmentIndex(plan.activeLateralLeg);
      if (segmentIndex > 0) {
        const segment = plan.getSegment(segmentIndex);
        if (
          segment.segmentType === FlightPlanSegmentType.Approach
          && BitFlags.isAll(segment.legs[segment.legs.length - 1].flags, WT21LegDefinitionFlags.MissedApproach)
        ) {
          for (let i = 0; i < segment.legs.length; i++) {
            const leg = segment.legs[i];
            if (leg.leg.fixTypeFlags === FixTypeFlags.FAF) {
              if (plan.activeLateralLeg - segment.offset >= i) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Method to create a direct to in the plan. This method will also then call activateLeg.
   * A DTO consists of 4 legs:
   * 1. The original leg that was used to create the DTO.
   * a. We preserve this leg so that we will have a vlid FROM leg in case the DTO needs to be removed.
   * 2. A DISCO leg, because a DTO is not connected to any legs that came before it.
   * 3. The FROM leg, initializes to the present position (PPOS).
   * 4. The TO leg.
   * @param segmentIndex is the index of the segment containing the leg to activate as direct to.
   * If `undefined`, this creates a direct to random, at the end of the plan.
   * @param segmentLegIndex is the index of the leg in the specified segment to activate as direct to.
   * If `undefined`, this the last leg of the segment that will be used for the direct to is targeted.
   * @param isNewDTO whether to treat this as a new directo to or not.
   * @param course is the course for this direct to in degrees magnetic, if specified.
   * @param facility is the new facility to add to the plan and then create a direct to for, for the case of a direct to random.
   */
  public createDirectTo(segmentIndex?: number, segmentLegIndex?: number, isNewDTO = true, course?: number, facility?: Facility): void {
    let newLeg: FlightPlanLeg | undefined;

    if (isNewDTO) {
      this.dtoWasCreatedInModPlan = true;

      if (facility !== undefined) {
        newLeg = FlightPlan.createLeg({
          type: LegType.TF,
          fixIcaoStruct: facility.icaoStruct,
        });
      }
    }

    const plan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

    if (segmentIndex === undefined) {
      const lastSegment = plan.segmentCount > 0 ? plan.getSegment(plan.segmentCount - 1) : undefined;

      if (lastSegment) {
        segmentIndex = this.planInsertSegmentOfType(plan.planIndex, FlightPlanSegmentType.Enroute, lastSegment.segmentIndex + 1);
      } else {
        return;
      }
    }

    const segment = plan.getSegment(segmentIndex);

    if (segmentLegIndex === undefined) {
      segmentLegIndex = Math.max(0, segment.legs.length - 1);
    }

    let modLegVerticalData: VerticalData | undefined;

    if (!isNewDTO && this.dtoWasCreatedInModPlan) {
      const existingModDtoTargetLeg = segment.legs[segmentLegIndex + 3];
      if (existingModDtoTargetLeg !== undefined) {
        modLegVerticalData = existingModDtoTargetLeg.verticalData;
        if (existingModDtoTargetLeg.leg.type === LegType.CF) {
          if (existingModDtoTargetLeg.leg.trueDegrees) {
            // FIXME we give up if no magvar available from calculations
            course = MagVar.trueToMagnetic(existingModDtoTargetLeg.leg.course, existingModDtoTargetLeg.calculated?.courseMagVar ?? 0);
          } else {
            course = existingModDtoTargetLeg.leg.course;
          }
        }
      }
    }

    let legIndexDelta = 0;

    if (plan.directToData.segmentIndex > -1 && plan.directToData.segmentLegIndex > -1) {
      legIndexDelta -= plan.directToData.segmentIndex === segmentIndex && segmentLegIndex > plan.directToData.segmentLegIndex ? 3 : 0;

      if (this.getDirectToState(WTLineFmsUtils.PRIMARY_MOD_PLAN_INDEX) === DirectToState.TOEXISTING) {
        this.removeDirectToExisting(WTLineFmsUtils.PRIMARY_MOD_PLAN_INDEX, undefined, false);
      } else {
        plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex + 1);
        plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex + 1);
        plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex + 1);
      }
    }

    if (newLeg !== undefined) {
      this.planAddLeg(plan.planIndex, segmentIndex, newLeg, segmentLegIndex + legIndexDelta);
    }

    const leg = segment.legs[segmentLegIndex + legIndexDelta];

    plan.setDirectToData(segmentIndex, segmentLegIndex + legIndexDelta);

    if (segment && leg) {
      let originPos = this.ppos;
      if (course) {
        originPos = this.ppos.offset(NavMath.normalizeHeading(course + 180), UnitType.NMILE.convertTo(50, UnitType.GA_RADIAN), new GeoPoint(0, 0));
      }

      const discoLeg = FlightPlan.createLeg({ type: LegType.Discontinuity });
      const dtoOriginLeg = this.createDTOOriginLeg(originPos);
      const dtoTargetLeg = this.createDTODirectLeg(leg.leg.fixIcaoStruct, leg.leg, course);

      // We do a +1,2,3 here so that the original TO leg is preserved, in case the DTO gets removed
      plan.addLeg(segmentIndex, discoLeg, segmentLegIndex + legIndexDelta + 1,
        WT21LegDefinitionFlags.DirectTo);
      plan.addLeg(segmentIndex, dtoOriginLeg, segmentLegIndex + legIndexDelta + 2,
        WT21LegDefinitionFlags.DirectTo);
      const directToTargetLegDefinition = plan.addLeg(segmentIndex, dtoTargetLeg, segmentLegIndex + legIndexDelta + 3,
        (leg.flags & WT21LegDefinitionFlags.MissedApproach) | WT21LegDefinitionFlags.DirectTo | WT21LegDefinitionFlags.DirectToTarget);

      const newVerticalData = modLegVerticalData ?? leg.verticalData;

      plan.setLegVerticalData(segmentIndex, segmentLegIndex + legIndexDelta + 3, newVerticalData);

      if (isNewDTO) {
        if (directToTargetLegDefinition.verticalData.altDesc !== AltitudeRestrictionType.Unused) {
          const globalLegIndex = segment.offset + segmentLegIndex + legIndexDelta + 3;

          // We need to calculate the direct to leg before we can find out its length (we are in MOD at this point)
          plan.calculate(globalLegIndex - 2).then(() => {
            const finalAltitude = newVerticalData.altitude1;

            this.createVerticalDirectTo(plan, globalLegIndex, finalAltitude, true);
          });
        }
      }

      this.activateLeg(segmentIndex, segmentLegIndex + legIndexDelta + 3, false);
    }
  }

  /**
   * Method to create a direct to in the flight plan to an arbitrary airport.
   *
   * This:
   *
   * - empties out the flight plan;
   * - sets the destination as the provided airport facility;
   * - creates a direct-to sequence to that facility.
   *
   * @param airportFacility the airport facility to go direct to
   */
  public createDirectToAirport(airportFacility: AirportFacility): void {
    const plan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

    const segmentCount = plan.segmentCount;

    for (let i = segmentCount - 1; i >= 0; i--) {
      plan.removeSegment(i, true);
    }

    plan.addSegment(0, FlightPlanSegmentType.Departure, undefined, true);
    plan.addSegment(1, FlightPlanSegmentType.Enroute, undefined, true);

    WTLineFmsUtils.reconcileDirectToData(plan);

    this.setDestinationAirport(plan.planIndex, airportFacility.icaoStruct);
    this.createDirectTo(undefined, undefined, true, undefined, airportFacility);
  }

  /**
   * Method to create a direct to in the flight plan to an arbitrary airport+runway using a visual approach.
   *
   * This:
   *
   * - empties out the flight plan;
   * - sets the destination as the provided airport facility;
   * - inserts a visual approach to the provided runway;
   * - creates a direct-to sequence to the FAF of that approach.
   *
   * @param airportFacility the airport facility to go direct to
   * @param runway the one way runway to insert a visual approach for
   */
  public async createDirectToRunwayVisualApproach(airportFacility: AirportFacility, runway: OneWayRunway): Promise<void> {
    const plan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

    const segmentCount = plan.segmentCount;

    for (let i = segmentCount - 1; i >= 0; i--) {
      plan.removeSegment(i, true);
    }

    plan.addSegment(0, FlightPlanSegmentType.Departure, undefined, true);
    plan.addSegment(1, FlightPlanSegmentType.Enroute, undefined, true);

    WTLineFmsUtils.reconcileDirectToData(plan);

    await this.insertApproach(airportFacility, -1, -1, runway.direction, runway.runwayDesignator);

    const approachSegment: FlightPlanSegment = Array.from(plan.segmentsOfType(FlightPlanSegmentType.Approach))[0];

    if (approachSegment) {
      let activateIndex = -1;
      for (let i = 0; i < approachSegment.legs.length; i++) {
        activateIndex = i;

        const leg = approachSegment.legs[i];
        const isFaf = BitFlags.isAll(leg.leg.fixTypeFlags, FixTypeFlags.FAF);

        if (isFaf) {
          break;
        }
      }

      if (activateIndex !== -1) {
        this.createDirectTo(approachSegment.segmentIndex, activateIndex, true, undefined);
      }
    }
  }

  /**
   * Creates a Direct-To origin IF leg.
   * @param ppos The current plane position.
   * @returns a Direct-To origin IF leg.
   */
  private createDTOOriginLeg(ppos: GeoPointInterface): FlightPlanLeg {
    return FlightPlan.createLeg({
      type: LegType.IF,
      lat: ppos.lat,
      lon: ppos.lon
    });
  }

  /**
   * Creates a Direct-To target leg.
   * @param icao is the icao.
   * @param leg The FlightPlanLeg.
   * @param course The magnetic course for the Direct To.
   * @returns a Direct-To leg.
   */
  private createDTODirectLeg(icao: IcaoValue, leg?: FlightPlanLeg, course?: number): FlightPlanLeg {

    let legType: LegType;
    if (course === undefined) {
      legType = LegType.DF;
      const planeHeading = SimVar.GetSimVarValue('PLANE HEADING DEGREES MAGNETIC', 'degrees');
      course = planeHeading === 0 ? 360 : planeHeading;
    } else {
      legType = LegType.CF;
    }

    if (leg) {
      const directLeg = Object.assign({}, leg);
      directLeg.type = legType;
      directLeg.course = course as number;
      directLeg.trueDegrees = false;
      directLeg.turnDirection = LegTurnDirection.None;
      return directLeg;
    } else {
      return FlightPlan.createLeg({
        type: legType,
        fixIcaoStruct: icao,
        course,
        trueDegrees: false
      });
    }
  }

  /**
   * Updates the DTO Origin Leg Lat/Lon with the PPOS. Opens a {@link WTLineFlightPlanEditBatch.UpdateDTOOrigin} batch.
   * @param plan The Flight Plan.
   */
  private updateDtoOrigin(plan: FlightPlan): void {
    // We only want to update the DTO origin if the DTO was created in this current MOD plan
    if (!this.dtoWasCreatedInModPlan) {
      return;
    }

    const pposLeg = plan.tryGetLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex + 2);

    // Making sure that we are in a DTO
    if (!pposLeg) {
      return;
    }

    const batch = plan.openBatch(WTLineFlightPlanEditBatch.UpdateDTOOrigin);

    // We need to recreate the DTO so that the proper events get sent and legs get recreated and what not
    // We do not mark it as pending, because that is the decision of whatever created the original DTO
    this.createDirectTo(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex, false);

    plan.closeBatch(batch);
  }

  /**
   * Creates a vertical direct-to to a leg. This creates a manual constraint with an fpa that reaches
   * the desired altitude using a continuous descent from the present position and altitude.
   *
   * **NOTE:** This will not delete any constraints - it is the responsibility of the caller to do so.
   *
   * @param plan the plan to use
   * @param globalIndex the global leg index to apply the constraint to
   * @param finalAltitude the altitude to target, in metres.
   * @param isAutomatic whether this was an automatic VDTO (created with a lateral DTO)
   *
   * @returns whether the vdto was successfully created
   */
  public createVerticalDirectTo(
    plan: FlightPlan,
    globalIndex: number,
    finalAltitude: number,
    isAutomatic = false,
  ): boolean {
    const distanceToConstraint = isAutomatic
      ? plan.getLeg(globalIndex).calculated?.distanceWithTransitions
      : WTLineFmsUtils.getDistanceFromPposToLegEnd(plan, globalIndex, this.lnavLegDistanceRemaining.get());

    if (distanceToConstraint === undefined) {
      return false;
    }

    const currentAltitude = this.aircraftAltitude;

    if (currentAltitude === undefined) {
      return false;
    }

    const currentAltitudeMetres = UnitType.METER.convertFrom(currentAltitude, UnitType.FOOT);

    const fpa = VNavUtils.getFpa(distanceToConstraint, 75 + currentAltitudeMetres - finalAltitude);

    const isFpaValid = fpa > 1 && fpa <= 6;

    if (!isFpaValid) {
      return false;
    }

    plan.setLegVerticalData(globalIndex, {
      phase: VerticalFlightPhase.Descent,
      altDesc: AltitudeRestrictionType.At,
      altitude1: finalAltitude,
      altitude2: 0,
      fpa: isAutomatic ? Math.max(3, fpa) : fpa,
    });

    this.verticalPathCalculator.requestPathCompute(WTLineFmsUtils.PRIMARY_MOD_PLAN_INDEX);

    this.verticalDtoWasCreatedInModPlan = true;
    this.verticalDtoWasCreatedInModPlanWasAutomatic = isAutomatic;

    return true;
  }

  /**
   * Updates the vertical DTO origin with the current altitude and distance to constraint.
   * @param plan The Flight Plan.
   * @returns whether the vertical DTO is still valid
   */
  private updateVerticalDtoOrigin(plan: FlightPlan): boolean {
    const constraintIndex = VNavUtils.getConstraintIndexFromLegIndex(this.getVerticalPlanToDisplay(WTLineLegacyFlightPlans.Active), plan.activeLateralLeg);

    if (constraintIndex === -1) {
      return false;
    }

    const constraint = this.getVerticalPlanToDisplay(WTLineLegacyFlightPlans.Active).constraints[constraintIndex];

    return this.createVerticalDirectTo(plan, constraint.index, constraint.targetAltitude, this.verticalDtoWasCreatedInModPlanWasAutomatic);
  }

  /**
   * Creates a direct to existing to the next valid leg in the plan after the input global leg index.
   * @param globalLegIndex The global leg index.
   * @returns Whether a direct to existing was created.
   */
  public createDirectToExistingNextValidLeg(globalLegIndex: number): boolean {
    const modPlan = this.getPrimaryModFlightPlan();

    for (let l = globalLegIndex + 1; l < modPlan.length; l++) {
      const leg = modPlan.tryGetLeg(l);
      if (leg?.leg.type !== LegType.Discontinuity && leg?.leg.type !== LegType.ThruDiscontinuity) {
        const targetSegmentIndex = modPlan.getSegmentIndex(l);
        const targetSegment = modPlan.getSegment(targetSegmentIndex);
        const targetSegmentLegIndex = l - targetSegment.offset;
        this.createDirectTo(targetSegmentIndex, targetSegmentLegIndex, true);
        return true;
      }
    }
    return false;
  }

  /**
   * Updates an existing PPOS hold if it exists and is in the MOD flight plan
   *
   * @param plan the plan
   */
  private tryUpdatePposHoldPosition(plan: FlightPlan): void {
    const modPlan = this.getPrimaryModFlightPlan();
    const activePlan = this.getPrimaryFlightPlan();

    const modActiveLeg = modPlan.tryGetLeg(modPlan.activeLateralLeg);
    const activeActiveLeg = activePlan.tryGetLeg(activePlan.activeLateralLeg);

    // We don't wanna update any PPOS hold in the mod flight plan if that hold is already confirmed (in the active flight plan)
    const pposHoldInActive = activeActiveLeg && activeActiveLeg.leg.type === LegType.HM && activeActiveLeg.leg.fixIcao === ICAO.emptyIcao;
    const notPposHold = modActiveLeg && (modActiveLeg.leg.type !== LegType.HM || modActiveLeg.leg.fixIcao !== ICAO.emptyIcao);

    if (plan.planIndex !== WTLineFmsUtils.PRIMARY_MOD_PLAN_INDEX || pposHoldInActive || !modActiveLeg || notPposHold) {
      // Not in MOD or no PPOS hold at FROM leg
      return;
    }

    this.insertPposHold();
  }

  /**
   * Empties a main flight plan as part of an edit that resets the flight plan, creating a MOD plan
   * @param mainPlanIndex the index of the plan to target the edit to
   * @param notify whether to emit sync events
   */
  public emptyFlightPlanForEdit(mainPlanIndex: MainFlightPlanIndexType<T>, notify = true): void {
    const plan = this.getPlanToEdit(mainPlanIndex);

    WTLineFmsUtils.emptyFlightPlan(plan, notify);

    WTLineFmsUtils.setFlightPlanProcedureIdents(
      plan,
      {
        originDepartureIdent: null,
        originDepartureEnrouteTransitionIdent: null,
        arrivalIdent: null,
        arrivalEnrouteTransitionIdent: null,
        approachIdent: null,
        paddedApproachIdent: null,
        approachTransitionIdent: null,
        destinationDepartureIdent: null,
        destinationDepartureEnrouteTransitionIdent: null,
      },
    );
  }

  /**
   * Adds an airway and airway segment to the flight plan.
   * @param planIndex Is the index of the plan to target the edit to.
   * @param airway The airway object.
   * @param exit The exit intersection facility. If `undefined`, the airway segment is created containing only a discontinuity.
   * @param segmentIndex Is the segment index for the entry leg.
   * @returns The index of the airway segment that was added to the flight plan.
   */
  public async insertAirwayAtSegment(
    planIndex: FlightPlanIndexType<T>,
    airway: AirwayData,
    exit: IntersectionFacility | undefined,
    segmentIndex: number | undefined,
  ): Promise<number> {
    const plan = this.getPlanToEdit(planIndex);

    const airwaySegmentIndex = plan.insertSegment(
      segmentIndex ?? WTLineFmsUtils.getLastSegmentOfType(plan, FlightPlanSegmentType.Enroute) + 1,
      FlightPlanSegmentType.Enroute,
      airway.name,
    ).segmentIndex;

    // Add legs if exit is specified
    if (exit !== undefined) {
      await this.populateAirwaySegmentToExitFix(plan.planIndex, airwaySegmentIndex, airway, exit);
    } else {
      // Add a discontinuity
      this.insertDiscontinuity(plan, airwaySegmentIndex);
    }

    plan.calculate(0, true);

    return airwaySegmentIndex;
  }

  /**
   * Adds an airway and airway segment to the flight plan, originating from a fix at a given leg index.
   * @param planIndex Is the index of the plan to target the edit to.
   * @param airway The airway object.
   * @param exit The exit intersection facility. If `undefined`, the airway segment is created containing only a discontinuity.
   * @param segmentIndex Is the segment index for the entry leg.
   * @param localLegIndex Is the local leg index for the entry leg.
   * @returns The index of the airway segment that was added to the flight plan.
   */
  public async insertAirwayAtLeg(
    planIndex: FlightPlanIndexType<T>,
    airway: AirwayData,
    exit: IntersectionFacility | undefined,
    segmentIndex: number,
    localLegIndex: number,
  ): Promise<void> {
    const plan = this.getPlanToEdit(planIndex);
    const segment = plan.getSegment(segmentIndex);

    let airwaySegment;
    if (localLegIndex < segment.legs.length - 1) {
      // If the fix is not the last leg in the segment, split that segment in three
      airwaySegment = this.splitSegmentThreeWays(planIndex, segmentIndex, localLegIndex + 1, airway.name);
    } else {
      // Otherwise, insert the airway segment after
      airwaySegment = plan.insertSegment(segmentIndex + 1, FlightPlanSegmentType.Enroute, airway.name);
    }

    // Add legs if exit is specified
    if (exit !== undefined) {
      await this.populateAirwaySegmentToExitFix(plan.planIndex, airwaySegment.segmentIndex, airway, exit);
    } else {
      // Add a discontinuity
      this.insertDiscontinuity(plan, airwaySegment.segmentIndex);
    }
  }

  /**
   * Changes the airway present at an already existing segment, replacing its legs with the correct intermediary waypoints.
   * @param planIndex Is the index of the plan to target the edit to.
   * @param segmentIndex Is the segment index for the entry leg.
   * @param airway The airway object.
   * @returns whether the airway could correctly be inserted with the existing entry and exit fixes
   */
  public async changeAirwayAtSegment(planIndex: FlightPlanIndexType<T>, segmentIndex: number, airway: AirwayData): Promise<boolean> {
    let plan = this.getFlightPlan(planIndex);
    const segment = plan.getSegment(segmentIndex);

    if (segment.legs.length === 1 && FlightPlanUtils.isDiscontinuityLeg(segment.legs[0].leg.type)) {
      plan = this.flightPlanRepo.getPlanToEdit(plan.planIndex);

      // This is an empty airway segment, just change the airway if it's valid
      plan.removeSegment(segmentIndex);
      plan.insertSegment(segmentIndex, FlightPlanSegmentType.Enroute, airway.name);

      this.insertDiscontinuity(plan, segmentIndex);

      return true;
    }

    if (segment.segmentIndex === 0) {
      // Need to have an entry fix beforehand
      return false;
    }

    // This airway segment has fixes in it - only change the airway if the new airway is valid for the existing entry and exit
    const entryFix = plan.tryGetLeg(segment.offset - 1);

    if (!entryFix || !FlightPlanUtils.isToFixLeg(entryFix.leg.type)) {
      // Need an XF leg
      return false;
    }

    const exitFix = segment.legs[segment.legs.length - 1];

    if (!FlightPlanUtils.isToFixLeg(exitFix.leg.type)) {
      // Need an XF leg
      return false;
    }

    const entryFixOnAirway = airway.waypoints.some((it) => ICAO.valueEquals(it.icaoStruct, entryFix.leg.fixIcaoStruct));

    if (!entryFixOnAirway) {
      return false;
    }

    const exitFixOnAirway = airway.waypoints.some((it) => ICAO.valueEquals(it.icaoStruct, exitFix.leg.fixIcaoStruct));

    if (!exitFixOnAirway) {
      return false;
    }

    const exitFixFacility = await this.facLoader.getFacility(FacilityType.Intersection, exitFix.leg.fixIcaoStruct);

    await this.populateAirwaySegmentToExitFix(planIndex, segmentIndex, airway, exitFixFacility);

    return true;
  }

  /**
   * Ensures that a newly entered airway is not followed by a duplicated fix
   * @param plan the flight plan to edit
   * @param entrySegmentIndex the segment index for the newly entered airway
   * @private
   */
  private ensureNoDuplicatesAfterAirwayEntry(plan: FlightPlan, entrySegmentIndex: number): void {
    const airwaySegment = plan.getSegment(entrySegmentIndex);
    const lastLeg = airwaySegment.legs[airwaySegment.legs.length - 1];
    const nextLeg = plan.getNextLeg(entrySegmentIndex + 1, -1);

    if (lastLeg && nextLeg && this.isDuplicateLeg(lastLeg.leg, nextLeg.leg)) {
      const nextLegIndex = plan.getLegIndexFromLeg(nextLeg);
      const nextLegSegmentIndex = plan.getSegmentIndex(nextLegIndex);
      const nextLegSegment = plan.getSegment(nextLegSegmentIndex);

      if (this.getAirwayLegType(plan, nextLegSegmentIndex, nextLegIndex - nextLegSegment.offset) === AirwayLegType.ENTRY) {
        // the duplicated leg is an airway entry -> remove the segment containing it (the segment is guaranteed to
        // contain just the one leg)
        this.planRemoveSegment(plan.planIndex, nextLegSegmentIndex);
      } else {
        this.planRemoveDuplicateLeg(plan.planIndex, lastLeg, nextLeg);
      }
    }
  }

  /**
   * Adds an airway and airway segment to the flight plan.
   * @param airway The airway object.
   * @param entry The entry intersection facility.
   * @param exit The exit intersection facility.
   * @param segmentIndex Is the segment index for the entry leg.
   * @param legIndex Is the leg index of the entry leg in the segment.
   * @param planIndex Is the index of the plan to target the edit to.
   * @returns The index of the airway segment that was added to the flight plan.
   * @deprecated use {@link insertAirwayAtSegment} instead
   */
  public insertAirwaySegment(
    airway: AirwayData,
    entry: IntersectionFacility,
    exit: IntersectionFacility,
    segmentIndex: number,
    legIndex: number,
    planIndex: MainFlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active,
  ): number {
    const plan = this.getPlanToEdit(planIndex);

    const airwaySegmentIndex = this.prepareAirwaySegment(plan.planIndex, `${airway.name}`, segmentIndex, legIndex);
    const airwayLegObject = this.buildAirwayLegs(airway, entry, exit);
    const airwayLegs = airwayLegObject.procedureLegs;

    for (let i = 1; i < airwayLegs.length; i++) {
      this.planAddLeg(plan.planIndex, airwaySegmentIndex, airwayLegs[i]);
    }

    // handle duplicates
    const airwaySegment = plan.getSegment(airwaySegmentIndex);
    const lastLeg = airwaySegment.legs[airwaySegment.legs.length - 1];
    const nextLeg = plan.getNextLeg(airwaySegmentIndex + 1, -1);

    if (lastLeg && nextLeg && this.isDuplicateLeg(lastLeg.leg, nextLeg.leg)) {
      const nextLegIndex = plan.getLegIndexFromLeg(nextLeg);
      const nextLegSegmentIndex = plan.getSegmentIndex(nextLegIndex);
      const nextLegSegment = plan.getSegment(nextLegSegmentIndex);

      if (this.getAirwayLegType(plan, nextLegSegmentIndex, nextLegIndex - nextLegSegment.offset) === AirwayLegType.ENTRY) {
        // the duplicated leg is an airway entry -> remove the segment containing it (the segment is guaranteed to
        // contain just the one leg)
        this.planRemoveSegment(plan.planIndex, nextLegSegmentIndex);
      } else {
        this.planRemoveDuplicateLeg(plan.planIndex, lastLeg, nextLeg);
      }
    }

    plan.calculate(0, true);

    return airwaySegmentIndex;
  }

  /**
   * Prepares a new, empty airway segment in the primary flight plan which is ready to accept airway legs. Also
   * modifies the segment containing the entry leg, if necessary, either splitting it following the entry leg if it is
   * a non-airway enroute segment, or removing all legs following the entry leg if it is an airway segment. If the
   * entry leg is the last leg in its segment, a new non-airway enroute segment will be inserted after the entry leg
   * segment if the entry leg segment is the last segment in the flight plan or if the following segment is not an
   * enroute segment. If the entry leg is the entry for an existing airway segment, the existing airway segment will be
   * removed.
   * @param planIndex The index of the flight plan to edit.
   * @param airwayName The name of the airway.
   * @param entrySegmentIndex The index of the segment containing the airway entry leg.
   * @param entrySegmentLegIndex The index of the airway entry leg in its segment.
   * @returns The index of the new airway segment.
   */
  private prepareAirwaySegment(planIndex: FlightPlanIndexType<T>, airwayName: string, entrySegmentIndex: number | undefined, entrySegmentLegIndex: number): number {
    const plan = this.getFlightPlan(planIndex);

    if (entrySegmentIndex === undefined) {
      entrySegmentIndex = plan.insertSegment(plan.segmentCount, FlightPlanSegmentType.Enroute, airwayName).segmentIndex;
    }

    if (
      entrySegmentIndex < plan.directToData.segmentIndex
      || (entrySegmentIndex === plan.directToData.segmentIndex && entrySegmentLegIndex < plan.directToData.segmentLegIndex)
    ) {
      this.removeDirectToExisting();
    }

    const entrySegment = plan.getSegment(entrySegmentIndex);
    const nextSegment = entrySegmentIndex + 1 < plan.segmentCount ? plan.getSegment(entrySegmentIndex + 1) : undefined;
    let airwaySegmentIndex = entrySegmentIndex + 1;

    let removeLegsSegmentIndex = -1;
    let removeLegsFromIndex = -1;

    if (entrySegment.airway !== undefined) {
      // the entry leg is within an existing airway segment -> remove all legs in the same segment after the entry leg
      removeLegsSegmentIndex = entrySegmentIndex;
      removeLegsFromIndex = entrySegmentLegIndex + 1;
    } else if (entrySegmentLegIndex === entrySegment.legs.length - 1 && nextSegment?.airway !== undefined) {
      // the entry leg is the entry leg for an existing airway segment -> remove all legs from the existing airway segment
      removeLegsSegmentIndex = entrySegmentIndex + 1;
      removeLegsFromIndex = 0;
    }

    // remove legs as required
    if (removeLegsSegmentIndex >= 0) {
      const removeLegsSegment = plan.getSegment(removeLegsSegmentIndex);

      if (this.getAirwayLegType(plan, removeLegsSegmentIndex, removeLegsSegment.legs.length - 1) === AirwayLegType.EXIT_ENTRY) {
        // preserve the airway entry leg
        const lastLeg = removeLegsSegment.legs[removeLegsSegment.legs.length - 1];

        this.planInsertSegmentOfType(plan.planIndex, FlightPlanSegmentType.Enroute, removeLegsSegmentIndex + 1);
        this.planAddLeg(plan.planIndex, removeLegsSegmentIndex + 1, lastLeg.leg, 0);
      }

      if (removeLegsFromIndex > 0) {
        while (removeLegsSegment.legs.length > removeLegsFromIndex) {
          this.planRemoveLeg(plan.planIndex, removeLegsSegmentIndex, removeLegsSegment.legs.length - 1, true, true);
        }
      } else {
        this.planRemoveSegment(plan.planIndex, removeLegsSegmentIndex);
      }
    }

    if (entrySegment.legs.length - 1 > entrySegmentLegIndex) {
      // entry leg is not the last leg in its segment -> split the segment after the entry leg
      airwaySegmentIndex = this.splitSegment(plan, entrySegmentIndex, entrySegmentLegIndex);
    } else if (
      plan.getSegment(entrySegmentIndex).segmentType === FlightPlanSegmentType.Enroute
      && (nextSegment?.segmentType !== FlightPlanSegmentType.Enroute)
    ) {
      // entry leg is the last leg in its segment and the following segment doesn't exist or is not an enroute segment
      plan.insertSegment(airwaySegmentIndex, FlightPlanSegmentType.Enroute);
    }

    plan.insertSegment(airwaySegmentIndex, FlightPlanSegmentType.Enroute, airwayName);
    return airwaySegmentIndex;
  }

  /**
   * Splits a segment into two segments if type is enroute; if departure, remove legs after the legIndex, else do nothing.
   * @param plan is the flight plan to edit.
   * @param segmentIndex Is the segment index for the entry leg.
   * @param legIndex Is the leg index of the entry leg in the segment of the
   * @returns the segment number of the new airway segment if one was created, else the current segment or if no action was taken.
   */
  private splitSegment(plan: FlightPlan, segmentIndex: number, legIndex: number): number {
    const segment = plan.getSegment(segmentIndex);

    if (segment.segmentType === FlightPlanSegmentType.Enroute) {
      const nextSegmentIndex = this.planInsertSegmentOfType(plan.planIndex, FlightPlanSegmentType.Enroute, segmentIndex + 1);

      // Move legs after leg index to new segment
      // It's funky without the i++, but it works correctly because the length of the segment is changing
      for (let i = legIndex + 1; i < segment.legs.length;) {
        const leg = segment.legs[i].leg;

        this.planAddLeg(plan.planIndex, nextSegmentIndex, leg);
        this.planRemoveLeg(plan.planIndex, segmentIndex, i);
      }
      return nextSegmentIndex;
    } else if (segment.segmentType === FlightPlanSegmentType.Departure) {
      // Remove legs after leg index
      // It's funky without the i++, but it works correctly because the length of the segment is changing
      for (let i = legIndex + 1; i < segment.legs.length;) {
        this.planRemoveLeg(plan.planIndex, segmentIndex, i);
      }
    }
    return segmentIndex;
  }

  /**
   * Splits a segment into three around a given leg index. The resulting structure is as follows.
   * ```
   * Before:
   *                 v--- localLegIndex
   * | A B C | D E F G H I | J K L |
   *   Seg1       Seg2       Seg3
   *               ^--- segmentIndex
   * After:
   * | A B C | D E F | ... | G H I | J K L |
   *   Seg1    Seg2   Seg3   Seg4    Seg5
   * ```
   * @param planIndex the index of the flight plan to edit
   * @param segmentIndex the index of the segment to split
   * @param localLegIndex the index of the leg in the segment at which
   * to split the segment - this leg will be the first leg included in the newly formed third segment
   * @param middleSgmentAirway the airway ident to set on the new middle segment
   * @returns the newly created middle segment
   * @throws if {@link localLegIndex} does not satisfy `0 < localLegIndex < segment.legs.length`
   */
  private splitSegmentThreeWays(planIndex: FlightPlanIndexType<T>, segmentIndex: number, localLegIndex: number, middleSgmentAirway?: string): FlightPlanSegment {
    // FIXME this method needs to break up procedure/airway segments into one DIRECT segment
    //  per leg to more closely align with the IRL behavior

    let plan = this.flightPlanRepo.getFlightPlan(planIndex);
    let originalSegment = plan.getSegment(segmentIndex);

    if (localLegIndex === 0 || localLegIndex >= originalSegment.legs.length) {
      throw new Error('[WTLineFms](splitSegmentThreeWays) Should only be called with 0 < localLegIndex < segment.legs.length');
    }

    plan = this.flightPlanRepo.getPlanToEdit(planIndex);
    originalSegment = plan.getSegment(segmentIndex);

    const legsBefore = originalSegment.legs.slice(0, localLegIndex);
    const legsAfter = originalSegment.legs.slice(localLegIndex);

    // If we have more than one leg remaining in the last segment, and this was originally an airway,
    // we keep the new segment #3 as an airway
    const keepSegment3AsAirway = legsAfter.length > 1 && originalSegment.segmentType === FlightPlanSegmentType.Enroute && originalSegment.airway !== undefined;

    // Depending on what kind of segment we are splitting, we want to set the type of the new segments differently,
    // and remove some flags on legs we move
    let segment1Type = FlightPlanSegmentType.Enroute;
    let segment1FlagsToRemove = 0;
    let segment3Type = FlightPlanSegmentType.Enroute;
    const segment3FlagsToRemove = 0;
    switch (originalSegment.segmentType) {
      case FlightPlanSegmentType.Departure:
        segment1Type = FlightPlanSegmentType.Departure;
        segment3Type = FlightPlanSegmentType.Enroute;
        break;
      case FlightPlanSegmentType.Arrival:
        segment1Type = FlightPlanSegmentType.Enroute;
        segment3Type = FlightPlanSegmentType.Arrival;
        break;
      case FlightPlanSegmentType.Approach:
        segment1Type = FlightPlanSegmentType.Enroute;
        segment1FlagsToRemove = BitFlags.union(LegDefinitionFlags.MissedApproach, LegDefinitionFlags.VectorsToFinal, LegDefinitionFlags.VectorsToFinalFaf);
        segment3Type = FlightPlanSegmentType.Approach;
        break;
    }

    const newSegment3 = plan.insertSegment(segmentIndex, segment3Type, keepSegment3AsAirway ? originalSegment.airway : undefined);
    const newSegment1 = plan.insertSegment(segmentIndex, segment1Type, originalSegment.airway);
    const newSegment2 = plan.insertSegment(segmentIndex + 1, FlightPlanSegmentType.Enroute, middleSgmentAirway);

    // Insert before segment
    for (let i = 0; i < legsBefore.length; i++) {
      const legToInsert = legsBefore[i];

      this.cloneLegTo(plan.planIndex, legToInsert, newSegment1.segmentIndex, i, BitFlags.set(legToInsert.flags, 0, segment1FlagsToRemove));
    }

    if (keepSegment3AsAirway) {
      // If we keep the segment #3 as an airway, we need to also add a DIRECT segment only for its entry
      const newSegment3Entry = plan.insertSegment(newSegment3.segmentIndex, FlightPlanSegmentType.Enroute);

      // Add the entry leg to the new DIRECT segment
      this.cloneLegTo(plan.planIndex, legsAfter[0], newSegment3Entry.segmentIndex, 0, BitFlags.set(legsAfter[0].flags, 0, segment3FlagsToRemove));

      // Add the rest of the legs
      for (let i = 1; i < legsAfter.length; i++) {
        const legToInsert = legsAfter[i];

        this.cloneLegTo(plan.planIndex, legToInsert, newSegment3.segmentIndex, i, BitFlags.set(legToInsert.flags, 0, segment3FlagsToRemove));
      }
    } else {
      // Otherwise, we put everything in segment #3
      for (let i = 0; i < legsAfter.length; i++) {
        const legToInsert = legsAfter[i];

        this.cloneLegTo(plan.planIndex, legToInsert, newSegment3.segmentIndex, i, BitFlags.set(legToInsert.flags, 0, segment3FlagsToRemove));
      }
    }

    // Delete original segment
    plan.removeSegment(originalSegment.segmentIndex);

    return newSegment2;
  }

  /**
   * Clones an existing leg definition into a new location in the flight plan, copying its flags, vertical data and user data
   * @param planIndex the index of the flight plan to modify. `getPlanToEdit` is not called.
   * @param legToClone the leg definition to clone
   * @param segmentIndex the segment index in which to insert the cloned leg
   * @param localLedIndex the leg index in the segment at which to insert the cloned leg
   * @param flags the flags to apply to the cloned leg. Defaults to the flags of the original leg.
   * @param legData the leg data to use for creating the new leg. Defaults to the leg data of the original leg.
   */
  private cloneLegTo(
    planIndex: FlightPlanIndexType<T>,
    legToClone: LegDefinition,
    segmentIndex: number,
    localLedIndex: number,
    flags = legToClone.flags,
    legData = legToClone.leg,
  ): void {
    const plan = this.flightPlanRepo.getFlightPlan(planIndex);
    const segment = plan.getSegment(segmentIndex);

    plan.addLeg(segment.segmentIndex, legData, localLedIndex, flags);
    plan.setLegVerticalData(segment.offset + localLedIndex, legToClone.verticalData);

    for (const [key, value] of Object.entries(legToClone.userData)) {
      plan.setLegUserData(segment.segmentIndex, localLedIndex, key, value);
    }
  }

  /**
   * Builds a legs for an airway.
   * @param airway The airway object.
   * @param entry The entry intersection facility.
   * @param exit The exit intersection facility.
   * @returns the InsertProcedureObject.
   */
  private buildAirwayLegs(airway: AirwayData, entry: IntersectionFacility, exit: IntersectionFacility): InsertProcedureObject {
    const insertAirwayObject: InsertProcedureObject = { procedureLegs: [] };
    const waypoints = airway.waypoints;
    const entryIndex = waypoints.findIndex((w) => w.icao === entry.icao);
    const exitIndex = waypoints.findIndex((w) => w.icao === exit.icao);
    const ascending = exitIndex > entryIndex;
    if (ascending) {
      for (let i = entryIndex; i <= exitIndex; i++) {
        const leg = FlightPlan.createLeg({
          fixIcaoStruct: waypoints[i].icaoStruct,
          type: i === entryIndex ? LegType.IF : LegType.TF
        });
        insertAirwayObject.procedureLegs.push(leg);
      }
    } else {
      for (let i = entryIndex; i >= exitIndex; i--) {
        const leg = FlightPlan.createLeg({
          fixIcaoStruct: waypoints[i].icaoStruct,
          type: i === entryIndex ? LegType.IF : LegType.TF
        });
        insertAirwayObject.procedureLegs.push(leg);
      }
    }
    return insertAirwayObject;
  }

  /**
   * Populates an airway segment given an airway and an exit fix, using the leg before the segment as the entry fix
   * @param planIndex the index of the plan to modify
   * @param airwaySegmentIndex the index of the airway segment
   * @param segmentAirway the airway object to use
   * @param exitFix the exit fix to set
   */
  public async populateAirwaySegmentToExitFix(
    planIndex: FlightPlanIndexType<T>,
    airwaySegmentIndex: number,
    segmentAirway: AirwayData,
    exitFix: IntersectionFacility,
  ): Promise<void> {
    let plan = this.flightPlanRepo.getFlightPlan(planIndex);
    let segment = plan.getSegment(airwaySegmentIndex);

    const airwayEntryLeg = plan.tryGetLeg(segment.offset - 1);

    if (!airwayEntryLeg || !FlightPlanUtils.isToFixLeg(airwayEntryLeg.leg.type)) {
      throw new Error('[WTLineFms](populateAirwaySegmentToExitFix) Leg before airway segment is non-existent or not a TF leg. Invalid flight plan state!');
    }

    const entryFix = await this.facLoader.getFacility(FacilityType.Intersection, airwayEntryLeg.leg.fixIcaoStruct);
    const legs = this.buildAirwayLegs(segmentAirway, entryFix, exitFix);

    plan = this.flightPlanRepo.getPlanToEdit(plan.planIndex);
    segment = plan.getSegment(segment.segmentIndex);

    while (segment.legs.length !== 0) {
      plan.removeLeg(segment.segmentIndex, 0);
    }

    for (let i = 1; i < legs.procedureLegs.length; i++) {
      plan.addLeg(segment.segmentIndex, legs.procedureLegs[i]);
    }

    this.ensureNoDuplicatesAfterAirwayEntry(plan, airwaySegmentIndex);
  }

  /**
   * Method to remove an airway from the flight plan.
   * @param segmentIndex is the segment index of the airway to remove.
   * @param planIndex is the index of the plan to target the edit to.
   */
  public removeAirway(segmentIndex: number, planIndex: FlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): void {
    const plan = this.getPlanToEdit(planIndex);

    const segment = plan.getSegment(segmentIndex);
    const isActiveSegment = segmentIndex === WTLineFmsUtils.getActiveSegmentIndex(plan);

    if (segmentIndex <= 0) {
      return;
    }

    if (isActiveSegment) {
      // Remove the airway segment - planRemoveSegment ensures we then do a direct to the active leg
      this.planRemoveSegment(plan.planIndex, segmentIndex);
    } else {
      // Turn this into a DIRECT segment and only keep the last leg
      plan.setAirway(segmentIndex, undefined);

      while (segment.legs.length > 1) {
        plan.removeLeg(segmentIndex, 0);
      }

      plan.calculate();
    }
  }

  /**
   * Merges the legs of two consecutive segments into a single segment. All legs in the second segment are moved to the
   * first, and the second segment is removed from the flight plan.
   * @param plan The flight plan to modify.
   * @param segmentIndex The index of the first segment to merge.
   */
  private mergeSegments(plan: FlightPlan, segmentIndex: number): void {
    const segmentToGrow = plan.getSegment(segmentIndex);
    const segmentToRemove = plan.getSegment(segmentIndex + 1);

    const segmentToGrowOrigLength = segmentToGrow.legs.length;

    for (const leg of segmentToRemove.legs) {
      plan.addLeg(segmentIndex, leg.leg, undefined, leg.flags);
    }

    if (plan.directToData.segmentIndex === segmentIndex + 1) {
      plan.setDirectToData(segmentIndex, segmentToGrowOrigLength + plan.directToData.segmentLegIndex);
    }

    this.planRemoveSegment(plan.planIndex, segmentIndex + 1);
  }

  /**
   * Inserts a hold-at-waypoint leg to the primary flight plan. The hold leg will be inserted immediately after the
   * specified parent leg. The hold leg must have the same fix as the parent leg.
   * @param segmentIndex The index of the segment that contains the hold's parent leg.
   * @param legIndex The index of the hold's parent leg in its segment.
   * @param holdLeg The hold leg to add.
   * @param planIndex The index of the plan to target the edit to.
   * @returns Whether the hold-at-waypoint leg was successfully inserted.
   */
  public insertHold(segmentIndex: number, legIndex: number, holdLeg: FlightPlanLeg, planIndex: MainFlightPlanIndexType<T> = WTLineLegacyFlightPlans.Active): boolean {
    let plan = this.flightPlanRepo.getPlanToDisplay(planIndex);

    if (!plan) {
      return false;
    }

    const existingHoldCount = WTLineFmsUtils.getPlanHolds(plan).length;

    if (existingHoldCount >= 6) {
      return false;
    }

    plan = this.flightPlanRepo.getPlanToEdit(planIndex);

    const prevLeg = plan.getPrevLeg(segmentIndex, legIndex + 1);

    if (prevLeg?.leg.fixIcao !== holdLeg.fixIcao) {
      return false;
    }

    const nextLeg = plan.getNextLeg(segmentIndex, legIndex);

    // If we are editing a hold, delete the old leg.
    if (nextLeg && WTLineFmsUtils.isHoldAtLeg(nextLeg.leg.type) && nextLeg.leg.fixIcao === holdLeg.fixIcao) {
      const segment = plan.getSegmentFromLeg(nextLeg);

      segment && this.removeWaypoint(segment.segmentIndex, segment.legs.indexOf(nextLeg), false, false, false, planIndex);
    }

    this.planAddLeg(plan.planIndex, segmentIndex, holdLeg, legIndex + 1);
    return true;
  }

  /**
   * Inserts a PPOS hold as the active leg
   *
   * @param partial an object to modify the PPOS hold leg with, if applicable
   *
   * @returns whether the leg was inserted
   */
  public insertPposHold(partial?: Partial<FlightPlanLeg>): boolean {
    const activeLegIndex = this.getPlanToDisplay(WTLineLegacyFlightPlans.Active).activeLateralLeg;
    const activeLeg = this.getPlanToDisplay(WTLineLegacyFlightPlans.Active).getLeg(activeLegIndex);
    let activeSegmentIndex = this.getPlanToDisplay(WTLineLegacyFlightPlans.Active).getSegmentIndex(activeLegIndex);

    const plan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

    if (activeSegmentIndex === -1) {
      plan.addSegment(0, FlightPlanSegmentType.Enroute);
      activeSegmentIndex = 0;
    }

    const insertAfterActive = activeLegIndex === 0;

    const activeLegSegment = plan.getSegment(activeSegmentIndex);

    if (activeLeg.leg.type === LegType.HM && activeLeg.leg.fixIcao === ICAO.emptyIcao) {
      activeLegSegment && this.removeWaypoint(activeLegSegment.segmentIndex, activeLegIndex - activeLegSegment.offset);
    }

    const { lon, lat } = this.ppos;

    const magVar = Facilities.getMagVar(lat, lon);

    const pposHold = FlightPlan.createLeg({
      type: LegType.HM,
      turnDirection: LegTurnDirection.Right,
      distanceMinutes: true,
      distance: 1,
      course: this.aircraftTrack ? this.aircraftTrack - magVar : 100, // I think the leg path builder adds magvar
      lat: lat,
      lon: lon,
      ...partial ?? {},
    });

    try {
      // If the active leg is 0 (only airport or runway in the flight plan), we want to insert the hold after the active leg
      plan.addLeg(activeSegmentIndex, pposHold, activeLegIndex - activeLegSegment.offset + (insertAfterActive ? 1 : 0));
    } catch (e) {
      console.error(e);
      return false;
    }

    return true;
  }

  /**
   * Returns the index of the last element in the array where predicate is true, and -1
   * otherwise.
   * @param array The source array to search in
   * @param predicate find calls predicate once for each element of the array, in descending
   * order, until it finds one where predicate returns true. If such an element is found,
   * findLastIndex immediately returns that element index. Otherwise, findLastIndex returns -1.
   * @param defaultReturn is the default value
   * @returns either the index or the default if the predicate criteria is not met
   */
  private findLastSegmentIndex(array: Array<FlightPlanSegment>, predicate:
    (value: FlightPlanSegment, index: number, obj: FlightPlanSegment[]) => boolean, defaultReturn = -1): number {
    let l = array.length;
    while (l--) {
      if (predicate(array[l], l, array)) {
        return array[l].segmentIndex;
      }
    }
    return defaultReturn;
  }

  /**
   * Inserts a discontinuity before a leg if the previous leg type requires it.
   * @param plan the flight plan to modify
   * @param segmentIndex the segment index of the leg to insert the discontinuity before
   * @param segmentLegIndex the leg index of the leg to insert the discontinuity before
   */
  private insertDiscontinuityBeforeLegIfNeeded(plan: FlightPlan, segmentIndex: number, segmentLegIndex: number): void {
    const prevLeg = plan.getPrevLeg(segmentIndex, segmentLegIndex);

    if (!prevLeg) {
      return;
    }

    if (this.shouldDiscontinuityFollowLeg(prevLeg.leg.type)) {
      this.insertDiscontinuity(plan, segmentIndex, segmentLegIndex);
    }
  }

  /**
   * Method to insert a discontinuity in a provided plan at a specified position.
   * @param plan The FlightPlan to modify.
   * @param segmentIndex The segment index to insert the disco in.
   * @param segmentLegIndex The leg index to insert the disco at.
   * @param flags Leg definition flags to apply to the new leg. Defaults to `None` (0).
   */
  private insertDiscontinuity(plan: FlightPlan, segmentIndex: number, segmentLegIndex?: number, flags?: number): void {
    const segment = plan.getSegment(segmentIndex);

    if (segmentLegIndex === undefined) {
      segmentLegIndex = Math.max(0, segment.legs.length - 1);
    }

    const prevLeg = plan.getPrevLeg(segmentIndex, segmentLegIndex);
    const leg = plan.tryGetLeg(segmentIndex, segmentLegIndex);

    if ((prevLeg && FlightPlanUtils.isDiscontinuityLeg(prevLeg.leg.type)) || (leg && FlightPlanUtils.isDiscontinuityLeg(leg.leg.type))) {
      return;
    }

    this.planAddLeg(plan.planIndex, segmentIndex, FlightPlan.createLeg({ type: LegType.Discontinuity }), segmentLegIndex, flags);
  }

  /**
   * Adds a leg to the flight plan.
   * @param planIndex The index of the flight plan.
   * @param segmentIndex The segment to add the leg to.
   * @param leg The leg to add to the plan.
   * @param index The index of the leg in the segment to insert. Will add to the end of the segment if ommitted.
   * @param flags Leg definition flags to apply to the new leg. Defaults to `None` (0).
   * @param notify Whether or not to send notifications after the operation.
   */
  private planAddLeg(planIndex: FlightPlanIndexType<T>, segmentIndex: number, leg: FlightPlanLeg, index?: number, flags = 0, notify = true): void {
    const plan = this.getPlanToEdit(planIndex);

    const dtoLegIndex = plan.directToData.segmentLegIndex;
    const dtoSegmentIndex = plan.directToData.segmentIndex;

    if (
      dtoSegmentIndex >= 0
      && (segmentIndex === dtoSegmentIndex && index !== undefined && index <= dtoLegIndex)
    ) {
      this.removeDirectToExisting(plan.planIndex);
    }

    const segment = plan.getSegment(segmentIndex);
    const addIndex = index !== undefined ? index : Math.max(segment.legs.length - 1, 0);
    if (
      segment.segmentType === FlightPlanSegmentType.Approach
      && addIndex > 0
      && BitFlags.isAll(segment.legs[addIndex - 1].flags, WT21LegDefinitionFlags.MissedApproach)
    ) {
      flags |= WT21LegDefinitionFlags.MissedApproach;
    }

    plan.addLeg(segmentIndex, leg, index, flags, notify);
    plan.calculate(plan.activeLateralLeg - 1);
    const activeSegmentIndex = plan.getSegmentIndex(plan.activeLateralLeg);
    if (activeSegmentIndex !== -1) {
      const activeLegIndex = plan.activeLateralLeg - plan.getSegment(activeSegmentIndex).offset;
      if (segmentIndex < activeSegmentIndex || (index && segmentIndex == activeSegmentIndex && index < activeLegIndex)) {
        const newActiveLegIndex = plan.activeLateralLeg + 1;
        plan.setCalculatingLeg(newActiveLegIndex);
        plan.setLateralLeg(newActiveLegIndex);
      }
    } else {
      console.error('planAddLeg: activeSegmentIndex was -1');
    }
  }

  /**
   * Removes a leg from the flight plan.
   * @param planIndex The index of the flight plan.
   * @param segmentIndex The segment to add the leg to.
   * @param segmentLegIndex The index of the leg in the segment to remove.
   * @param notify Whether or not to send notifications after the operation. True by default.
   * @param skipDupCheck Whether to skip checking for duplicates. False by default.
   * @param skipCancelDirectTo Whether to skip canceling a direct to existing if the removed leg is equal to or is
   * located before the direct to target. False by default.
   * @returns whether a leg was removed.
   */
  private planRemoveLeg(
    planIndex: FlightPlanIndexType<T>,
    segmentIndex: number,
    segmentLegIndex: number,
    notify = true,
    skipDupCheck = false,
    skipCancelDirectTo = false,
  ): boolean {
    let plan = this.getPlanToDisplay(planIndex);

    if (segmentIndex < 0 || segmentIndex >= plan.segmentCount) {
      return false;
    }

    const toRemoveLeg = plan.getSegment(segmentIndex).legs[segmentLegIndex];
    if (!toRemoveLeg) {
      return false;
    }

    const removeLegGlobalIndex = plan.getSegment(segmentIndex).offset + segmentLegIndex;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isDirectToExistingActive = this.getDirectToState() === DirectToState.TOEXISTING;

    plan = this.getPlanToEdit(planIndex);

    let removed = false;
    const airwayLegType = this.getAirwayLegType(plan, segmentIndex, segmentLegIndex);

    if (airwayLegType !== AirwayLegType.NONE) {
      removed = this.removeLegAirwayHandler(plan, airwayLegType, segmentIndex, segmentLegIndex);
    } else {
      removed = plan.removeLeg(segmentIndex, segmentLegIndex, notify) !== null;

      if (!removed) {
        return false;
      }

      const dtoLegIndex = plan.directToData.segmentLegIndex;
      const dtoSegmentIndex = plan.directToData.segmentIndex;
      if (
        !skipCancelDirectTo
        && dtoSegmentIndex >= 0
        && (
          segmentIndex < dtoSegmentIndex
          || (segmentIndex === dtoSegmentIndex && segmentLegIndex <= dtoLegIndex)
        )
      ) {
        // Need to adjust direct to data to compensate for removed leg.
        if (segmentIndex === dtoSegmentIndex) {
          plan.directToData.segmentLegIndex--;
        }

        // if (isDirectToExistingActive && segmentIndex === dtoSegmentIndex && segmentLegIndex === dtoLegIndex) {
        // Create a DTO random to replace the canceled DTO existing if we are directly removing the target leg of the DTO existing.
        //   const directIcao = plan.getSegment(plan.directToData.segmentIndex).legs[plan.directToData.segmentLegIndex + 3].leg.fixIcao;
        //   this.createDirectToRandom(directIcao);
        // }

        this.removeDirectToExisting(plan.planIndex, plan.activeLateralLeg - 1);
      } else if (removeLegGlobalIndex < plan.activeLateralLeg || plan.activeLateralLeg >= plan.length) {
        const newActiveLegIndex = plan.activeLateralLeg - 1;
        plan.setCalculatingLeg(newActiveLegIndex);
        plan.setLateralLeg(newActiveLegIndex);
      }
    }

    const prevLeg = removeLegGlobalIndex - 1 >= 0 ? plan.getLeg(removeLegGlobalIndex - 1) : null;
    const nextLeg = removeLegGlobalIndex < plan.length ? plan.getLeg(removeLegGlobalIndex) : null;

    // Detect if we have created consecutive duplicate legs. If we have, we need to delete one of them.
    if (!skipDupCheck && prevLeg && nextLeg && this.isDuplicateLeg(prevLeg.leg, nextLeg.leg)) {
      this.planRemoveDuplicateLeg(plan.planIndex, prevLeg, nextLeg);
    }

    if (!skipDupCheck) {
      this.checkAndRemoveEmptySegment(plan, segmentIndex);
    }

    plan.calculate(plan.activeLateralLeg - 1);
    return true;
  }

  /**
   * Method to handle a remove leg request t.
   * @param plan is the flight plan.
   * @param airwayLegType is the airwayLegType returned from the checkIfAirwayLeg method.
   * @param segmentIndex The segment we are removing from.
   * @param segmentLegIndex is the leg index in the segment we are removing.
   * @returns whether this handler processed the remove request.
   */
  private removeLegAirwayHandler(plan: FlightPlan, airwayLegType: AirwayLegType, segmentIndex: number, segmentLegIndex: number): boolean {
    const removeLegGlobalIndex = plan.getSegment(segmentIndex).offset + segmentLegIndex;

    let removed = false;
    let needReconcileDto = plan.directToData.segmentIndex >= 0;

    if (
      segmentIndex < plan.directToData.segmentIndex
      || (segmentIndex === plan.directToData.segmentIndex && segmentLegIndex <= plan.directToData.segmentLegIndex)
    ) {

      this.removeDirectToExisting();

      needReconcileDto = false;
    }

    switch (airwayLegType) {
      case AirwayLegType.ONROUTE: {
        const segment = plan.getSegment(segmentIndex);
        plan.removeLeg(segmentIndex, segmentLegIndex);

        if (segmentLegIndex > 0) {
          // Need to rename the airway segment with the new exit (if we removed the first leg after the entry, the
          // airway segment will be deleted so no need to bother)

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          plan.setAirway(segmentIndex, segment.airway!.replace(/\..*/, `.${segment.legs[segmentLegIndex - 1].name}`));
        }

        // We need to move the leg immediately after the removed leg to the next enroute segment
        // (if the next enroute segment does not exist we will create one)

        if (plan.segmentCount <= segmentIndex + 1 || plan.getSegment(segmentIndex + 1).segmentType !== FlightPlanSegmentType.Enroute) {
          plan.insertSegment(segmentIndex + 1, FlightPlanSegmentType.Enroute);
        }

        const legAfterRemoved = segment.legs[segmentLegIndex].leg;
        plan.addLeg(segmentIndex + 1, legAfterRemoved, 0);
        plan.removeLeg(segmentIndex, segmentLegIndex);

        if (segmentLegIndex < segment.legs.length) {
          // There is at least one more leg in the original airway segment after the one we moved to the next enroute
          // segment -> move these remaining legs into a new airway segment

          const newEntrySegment = plan.getSegment(segmentIndex + 1);
          let newAirwaySegmentIndex = segmentIndex + 2;
          if (newEntrySegment.legs.length > 1) {
            // need to split the segment containing the entry leg of the new airway segment
            newAirwaySegmentIndex = this.splitSegment(plan, segmentIndex + 1, 0);
          }

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const airwayName = segment.airway!.replace(/\..*/, `.${segment.legs[segment.legs.length - 1].name}`);
          plan.insertSegment(newAirwaySegmentIndex, FlightPlanSegmentType.Enroute, airwayName);

          while (segment.legs.length > segmentLegIndex) {
            const leg = segment.legs[segmentLegIndex].leg;
            plan.removeLeg(segmentIndex, segmentLegIndex);
            plan.addLeg(newAirwaySegmentIndex, leg);
          }

          // If the newly added airway segment is the last enroute segment, we need to insert an empty enroute segment
          // after it to ensure that the last enroute segment in the plan is not an airway segment
          if (newAirwaySegmentIndex >= plan.segmentCount - 1 || plan.getSegment(newAirwaySegmentIndex + 1).segmentType !== FlightPlanSegmentType.Enroute) {
            plan.insertSegment(newAirwaySegmentIndex + 1, FlightPlanSegmentType.Enroute);
          }
        }

        removed = true;
        break;
      }
      case AirwayLegType.ENTRY: {
        if (plan.getSegment(segmentIndex).segmentType === FlightPlanSegmentType.Enroute) {
          // We need to remove the entry leg, then move the first leg in the airway segment out of the airway segment
          // and into the previous enroute segment to serve as the new entry leg.

          const segment = plan.getSegment(segmentIndex + 1);
          const leg = segment.legs[0].leg;
          plan.removeLeg(segmentIndex + 1, 0);
          this.checkAndRemoveEmptySegment(plan, segmentIndex + 1);

          this.planAddLeg(plan.planIndex, segmentIndex, leg);
        } else if (plan.getSegment(segmentIndex).segmentType === FlightPlanSegmentType.Departure) {
          // We need to remove the entry leg, then move the first leg in the airway segment out of the airway segment
          // and into a newly created enroute segment placed before the airway segment to serve as the new entry leg.

          this.planInsertSegmentOfType(plan.planIndex, FlightPlanSegmentType.Enroute, segmentIndex + 1);
          const segment = plan.getSegment(segmentIndex + 2);
          const leg = segment.legs[0].leg;
          plan.removeLeg(segmentIndex + 2, 0);
          this.checkAndRemoveEmptySegment(plan, segmentIndex + 2);

          this.planAddLeg(plan.planIndex, segmentIndex + 1, leg, 0);
        }
        removed = plan.removeLeg(segmentIndex, segmentLegIndex) !== null;
        break;
      }
      case AirwayLegType.EXIT: {
        if (segmentLegIndex < 1) {
          // We are removing the only leg in the airway segment, so just delete the segment.

          this.removeAirway(segmentIndex);
          return true;
        } else {
          // Remove the leg, then change the name of the airway segment to reflect the new exit waypoint.

          const segment = plan.getSegment(segmentIndex);
          const airway = segment.airway?.split('.');
          segment.airway = airway && airway[0] ? airway[0] + '.' + segment.legs[segmentLegIndex - 1].name : segment.airway;
          plan.setAirway(segmentIndex, segment.airway);
          removed = plan.removeLeg(segmentIndex, segmentLegIndex) !== null;
        }
        break;
      }
      case AirwayLegType.EXIT_ENTRY: {
        // We need to move the first leg in the next airway segment out of that segment and into an enroute segment
        // before the next airway segment.

        const segment = plan.getSegment(segmentIndex + 1);
        const leg = segment.legs[0].leg;
        plan.removeLeg(segmentIndex + 1, 0);
        if (segmentLegIndex < 1) {
          // We are removing the only leg in the first airway segment, so just remove the segment.
          plan.removeSegment(segmentIndex);

          let prevSegmentIndex = segmentIndex - 1;
          const prevSegment = plan.getSegment(prevSegmentIndex);
          if (prevSegment.segmentType !== FlightPlanSegmentType.Enroute || prevSegment.airway !== undefined) {
            plan.insertSegment(segmentIndex, FlightPlanSegmentType.Enroute);
            prevSegmentIndex = segmentIndex;
          }

          plan.addLeg(prevSegmentIndex, leg);
        } else {
          // Remove the leg from the first airway segment, then change the name of the airway segment to reflect the
          // new exit waypoint.

          plan.removeLeg(segmentIndex, segmentLegIndex);
          plan.insertSegment(segmentIndex + 1, FlightPlanSegmentType.Enroute);
          plan.addLeg(segmentIndex + 1, leg);

          const firstAirwaySegment = plan.getSegment(segmentIndex);
          const airway = firstAirwaySegment.airway?.split('.');
          firstAirwaySegment.airway = airway && airway[0] ? airway[0] + '.' + firstAirwaySegment.legs[segmentLegIndex - 1].name : firstAirwaySegment.airway;
          plan.setAirway(segmentIndex, firstAirwaySegment.airway);
        }
        removed = true;
      }
    }

    if (removed) {
      if (needReconcileDto) {
        WTLineFmsUtils.reconcileDirectToData(plan);
      }

      if (removeLegGlobalIndex <= plan.activeLateralLeg || plan.activeLateralLeg >= plan.length) {
        const newActiveLegIndex = plan.activeLateralLeg - 1;
        plan.setCalculatingLeg(newActiveLegIndex);
        plan.setLateralLeg(newActiveLegIndex);
      }
    }

    return removed;
  }

  /**
   * Checks if a flight plan segment is empty, and removes the segment if it is eligible to be removed. Only Enroute
   * segments that are followed by another Enroute segment are eligible to be removed if empty.
   *
   * If the segment only contained a discontinuity leg, the discontinuity is moved to the next eligible segment.
   *
   * @param plan A flight plan.
   * @param segmentIndex The index of the segment to check.
   * @returns Whether the segment was removed.
   */
  private checkAndRemoveEmptySegment(plan: FlightPlan, segmentIndex: number): boolean {
    const segment = plan.getSegment(segmentIndex);

    let segmentToInsertRemovedDiscontinuityAt = -1;
    let discontinuityFlags = 0;
    if (segment.legs.length === 1 && FlightPlanUtils.isDiscontinuityLeg(segment.legs[0].leg.type)) {
      const nextEligibleSegment = WTLineFmsUtils.getNextNonEmptySegmentIndex(plan, segmentIndex);

      if (nextEligibleSegment !== -1) {
        segmentToInsertRemovedDiscontinuityAt = nextEligibleSegment;
        discontinuityFlags = segment.legs[0].flags;
      }

      plan.removeLeg(segmentIndex, 0);
    }

    if (!this.shouldRemoveEmptySegment(plan, segmentIndex)) {
      return false;
    }

    this.planRemoveSegment(plan.planIndex, segmentIndex);

    if (segmentToInsertRemovedDiscontinuityAt !== -1) {
      this.insertDiscontinuity(plan, segmentToInsertRemovedDiscontinuityAt - 1, 0, discontinuityFlags);
    }

    // TODO remove this, only merge if consecutive airway segments
    const prevSegmentIndex = segmentIndex - 1;
    const nextSegmentIndex = segmentIndex;
    const prevSegment = prevSegmentIndex >= 0 ? plan.getSegment(prevSegmentIndex) : undefined;
    const nextSegment = nextSegmentIndex < plan.segmentCount ? plan.getSegment(nextSegmentIndex) : undefined;
    if (
      prevSegment?.segmentType === FlightPlanSegmentType.Enroute
      && prevSegment.airway === undefined
      && nextSegment?.segmentType === FlightPlanSegmentType.Enroute
      && nextSegment.airway === undefined
    ) {
      // We are left with two consecutive non-airway enroute segments -> merge the two
      this.mergeSegments(plan, prevSegmentIndex);
    }

    return true;
  }

  /**
   * Checks if a remove left an empty segment that also needs to be removed.
   * @param plan is the flight plan
   * @param segmentIndex The segment to add the leg to.
   * @returns whether to remove the segment.
   */
  private shouldRemoveEmptySegment(plan: FlightPlan, segmentIndex: number): boolean {
    const segment = plan.getSegment(segmentIndex);

    let nextSegment: FlightPlanSegment | undefined;
    if (segmentIndex < plan.segmentCount - 1) {
      nextSegment = plan.getSegment(segmentIndex + 1);
    }

    if (segment.legs.length >= 1) {
      return false;
    }

    switch (segment.segmentType) {
      case FlightPlanSegmentType.Enroute: {
        if (nextSegment && nextSegment.segmentType === FlightPlanSegmentType.Enroute) {
          return true;
        }
        const priorSegment = plan.getSegment(segmentIndex - 1);
        if (priorSegment.segmentType === FlightPlanSegmentType.Approach || priorSegment.segmentType === FlightPlanSegmentType.Arrival) {
          return true;
        }
      }
        break;
      //TODO: Add more cases as appropriate
    }

    return false;
  }


  /**
   * Adds an appropriate origin or destination leg (either an airport or runway fix) to the primary flight plan. Origin
   * legs are added to the beginning of the specified segment. Destination legs are added to the end of the specified
   * segment.
   * @param planIndex The index of the flight plan to edit.
   * @param isDeparture Whether the leg to add is part of a departure (true) or arrival (false).
   * @param segmentIndex The index of the segment to which to add the leg.
   * @param airport The origin airport.
   * @param runway The origin runway.
   */
  private planAddOriginDestinationLeg(planIndex: FlightPlanIndexType<T>, isDeparture: boolean, segmentIndex: number, airport: AirportFacility, runway?: OneWayRunway): void {
    let leg;
    if (runway) {
      leg = WTLineFmsUtils.buildRunwayLeg(airport, runway, isDeparture);
    } else {
      leg = FlightPlan.createLeg({
        lat: airport.lat,
        lon: airport.lon,
        type: isDeparture ? LegType.IF : LegType.TF,
        fixIcaoStruct: airport.icaoStruct,
        altitude1: airport.altitude + UnitType.FOOT.convertTo(50, UnitType.METER)
      });
    }

    this.planAddLeg(planIndex, segmentIndex, leg, isDeparture ? 0 : undefined);
  }

  /**
   * Method to add a segment to the flightplan.
   * @param targetMainPlan is the main flight plan to target the edit to.
   * @param segmentType is the FlightPlanSegmentType.
   * @param index is the optional segment index to insert the segment.
   * @returns the segment index of the inserted segment.
   */
  private planInsertSegmentOfType(targetMainPlan: MainFlightPlanIndexType<T>, segmentType: FlightPlanSegmentType, index?: number): number {
    const plan = this.getPlanToEdit(targetMainPlan);

    let segmentIndex = -1;

    if (index) {
      segmentIndex = index - 1;
    } else {
      const segments: FlightPlanSegment[] = [];
      for (const segment of plan.segments()) {
        segments.push(segment);
      }

      switch (segmentType) {
        case FlightPlanSegmentType.Origin:
          break;
        case FlightPlanSegmentType.Departure:
          segmentIndex = 0;
          break;
        case FlightPlanSegmentType.Enroute:
          segmentIndex = this.findLastSegmentIndex(segments, (v) => {
            return v.segmentType === FlightPlanSegmentType.Enroute;
          }, 1);
          break;
        case FlightPlanSegmentType.Arrival:
          segmentIndex = this.findLastSegmentIndex(segments, (v) => {
            return v.segmentType === FlightPlanSegmentType.Enroute;
          }, 2);
          break;
        case FlightPlanSegmentType.Approach:
          segmentIndex = this.findLastSegmentIndex(segments, (v) => {
            return v.segmentType === FlightPlanSegmentType.Enroute || v.segmentType === FlightPlanSegmentType.Arrival;
          }, 3);
          break;
        case FlightPlanSegmentType.Destination:
          segmentIndex = this.findLastSegmentIndex(segments, (v) => {
            return v.segmentType === FlightPlanSegmentType.Enroute || v.segmentType === FlightPlanSegmentType.Arrival
              || v.segmentType === FlightPlanSegmentType.Approach;
          }, 4);
          break;
        case FlightPlanSegmentType.MissedApproach:
          segmentIndex = this.findLastSegmentIndex(segments, (v) => {
            return v.segmentType === FlightPlanSegmentType.Approach;
          }, 5);
          break;
        default:
          segmentIndex = this.findLastSegmentIndex(segments, (v) => {
            return v.segmentType === FlightPlanSegmentType.Enroute || v.segmentType === FlightPlanSegmentType.Arrival
              || v.segmentType === FlightPlanSegmentType.Approach || v.segmentType === FlightPlanSegmentType.Destination;
          }, 1);
          segmentIndex--;
          break;
      }
    }

    return this.planInsertSegment(plan.planIndex, segmentIndex + 1, segmentType).segmentIndex;
  }

  /**
   * Method to remove all legs from a segment. The original segment is removed
   * and a new one is inserted in its place.
   * @param planIndex is the index of the plan to edit.
   * @param segmentIndex is the index of the segment to delete all legs from.
   * @param segmentType is the type if segment to delete all legs from, if known.
   * @returns The newly inserted empty segment.
   */
  private planClearSegment(planIndex: FlightPlanIndexType<T>, segmentIndex: number, segmentType?: FlightPlanSegmentType): FlightPlanSegment {
    this.planRemoveSegment(planIndex, segmentIndex);

    return this.planInsertSegment(planIndex, segmentIndex, segmentType);
  }

  /**
   * Inserts a segment into the flight plan at the specified index and
   * reflows the subsequent segments.
   * @param planIndex The index of the plan to edit.
   * @param segmentIndex The index to insert the flight plan segment.
   * @param segmentType The type of segment this will be.
   * @param airway The airway this segment is made up of, if any
   * @param notify Whether or not to send notifications after the operation.
   * @returns The new flight plan segment.
   */
  private planInsertSegment(
    planIndex: FlightPlanIndexType<T>,
    segmentIndex: number,
    segmentType: FlightPlanSegmentType = FlightPlanSegmentType.Enroute,
    airway?: string,
    notify = true,
  ): FlightPlanSegment {
    const plan = this.getPlanToEdit(planIndex);

    const segment = plan.insertSegment(segmentIndex, segmentType, airway, notify);
    plan.calculate(plan.activeLateralLeg - 1);

    if (plan.directToData.segmentIndex >= 0 && segmentIndex <= plan.directToData.segmentIndex) {
      plan.setDirectToData(plan.directToData.segmentIndex + 1, plan.directToData.segmentLegIndex);
    }

    return segment;
  }

  /**
   * Removes a segment from the flight plan and reflows the segments following
   * the removed segment, not leaving an empty segment at the specified index.
   * @param planIndex The index of the plan to edit.
   * @param segmentIndex The index of the segment to remove.
   * @param notify Whether or not to send notifications after the operation.
   */
  private planRemoveSegment(planIndex: FlightPlanIndexType<T>, segmentIndex: number, notify = true): void {
    const plan = this.getPlanToEdit(planIndex);

    const segment = plan.getSegment(segmentIndex);
    const activeSegmentIndex = plan.getSegmentIndex(plan.activeLateralLeg);

    if (plan.directToData.segmentIndex >= 0) {
      if (segmentIndex < plan.directToData.segmentIndex) {
        plan.setDirectToData(plan.directToData.segmentIndex - 1, plan.directToData.segmentLegIndex);
      } else if (segmentIndex === plan.directToData.segmentIndex) {
        plan.setDirectToData(-1);
      }
    }

    // If the segment we are trying to delete is the active one,
    // then we need to do something to preserve the active legs so they aren't deleted.
    // We only need to do this for the Enroute segment, because if other segments are getting deleted,
    // their functions are already handling this.
    // FIXME don't use SimPlane
    if (activeSegmentIndex === segmentIndex && !Simplane.getIsGrounded() && plan.length > 1 && segment.segmentType === FlightPlanSegmentType.Enroute) {
      // I think this block of code is only supposed to run when called from the cleanupLegsAfterApproach() function
      const currentToLeg = plan.getLeg(plan.activeLateralLeg);
      const currentFromLeg = plan.getLeg(plan.activeLateralLeg - 1);

      const newToLeg = Object.assign({}, currentToLeg.leg);
      const newFromLeg = Object.assign({}, currentFromLeg.leg);
      const lastEnrouteSegmentIndex = this.findLastEnrouteSegmentIndex(plan);

      if (BitFlags.isAll(currentToLeg.flags, WT21LegDefinitionFlags.DirectTo)) {
        const discoLeg = Object.assign({}, plan.getLeg(plan.activeLateralLeg - 2).leg);

        plan.addLeg(lastEnrouteSegmentIndex, discoLeg, undefined, WT21LegDefinitionFlags.DirectTo);
        plan.addLeg(lastEnrouteSegmentIndex, newFromLeg, undefined, WT21LegDefinitionFlags.DirectTo);
        plan.addLeg(lastEnrouteSegmentIndex, newToLeg, undefined, WT21LegDefinitionFlags.DirectTo | WT21LegDefinitionFlags.DirectToTarget);

      } else {
        plan.addLeg(lastEnrouteSegmentIndex, newFromLeg, undefined);
        plan.addLeg(lastEnrouteSegmentIndex, newToLeg, undefined);
      }

      const newSegment = plan.getSegment(lastEnrouteSegmentIndex);

      const newActiveLegIndex = newSegment.offset + newSegment.legs.length - 1;
      plan.setCalculatingLeg(newActiveLegIndex - 2);
      plan.setLateralLeg(newActiveLegIndex);
    } else {
      const newActiveLegIndex = plan.activeLateralLeg - Utils.Clamp(plan.activeLateralLeg - segment.offset, 0, segment.legs.length);
      plan.setCalculatingLeg(newActiveLegIndex);
      plan.setLateralLeg(newActiveLegIndex);
    }

    plan.removeSegment(segmentIndex, notify);
    plan.calculate(plan.activeLateralLeg - 1);
  }

  /**
   * Checks if a leg is an XF leg terminating at a fix.
   * @param leg The leg to check.
   * @returns Whether the leg terminates at a fix.
   */
  private static isXFLeg(leg: FlightPlanLeg): boolean {
    return leg.type === LegType.TF
      || leg.type === LegType.DF
      || leg.type === LegType.RF
      || leg.type === LegType.CF
      || leg.type === LegType.AF
      || leg.type === LegType.HF
      || leg.type === LegType.IF;
  }

  /**
   * Checks whether of two consecutive flight plan legs, the second is a duplicate of the first. The second leg is
   * considered a duplicate if and only if it is an IF, TF, or DF leg with the same terminator fix as the first leg,
   * which is also an IF, TF, or DF leg.
   * @param leg1 The first leg.
   * @param leg2 The second leg.
   * @returns whether the second leg is a duplicate of the first.
   */
  private isDuplicateLeg(leg1: FlightPlanLeg, leg2: FlightPlanLeg): boolean {
    if (leg1.type === LegType.Discontinuity && leg2.type === LegType.Discontinuity) {
      return true;
    }

    if (
      leg2.type !== LegType.IF
      && leg2.type !== LegType.DF
      && leg2.type !== LegType.TF
      && leg2.type !== LegType.CF
    ) {
      return false;
    }

    return (leg1.type === LegType.IF
      || leg1.type === LegType.TF
      || leg1.type === LegType.DF
      || leg1.type === LegType.CF)
      && leg1.fixIcaoStruct.region === leg2.fixIcaoStruct.region
      && leg1.fixIcaoStruct.ident === leg2.fixIcaoStruct.ident
      && leg1.fixIcaoStruct.type === leg2.fixIcaoStruct.type;
  }

  /**
   * Checks whether of two consecutive flight plan legs, the second is an IF leg and is a duplicate of the first. The
   * IF leg is considered a duplicate if and only if its fix is the same as the fix at which the first leg terminates.
   * @param leg1 The first leg.
   * @param leg2 The second leg.
   * @returns whether the second leg is an duplicate IF leg of the first.
   */
  private isDuplicateIFLeg(leg1: FlightPlanLeg, leg2: FlightPlanLeg): boolean {
    if (leg2.type !== LegType.IF) {
      return false;
    }
    if (
      leg1.type !== LegType.TF
      && leg1.type !== LegType.DF
      && leg1.type !== LegType.RF
      && leg1.type !== LegType.CF
      && leg1.type !== LegType.AF
      && leg1.type !== LegType.IF
    ) {
      return false;
    }

    return WTLineFms.isDuplicateXFLeg(leg1, leg2);
  }

  /**
   * Checks whether of two consecutive flight plan legs, the second is an XF leg and is a duplicate of the first. The
   * XF leg is considered a duplicate if and only if its fix is the same as the fix at which the first leg terminates.
   * @param leg1 The first leg.
   * @param leg2 The second leg.
   * @returns whether the second leg is an duplicate XF leg of the first.
   */
  private static isDuplicateXFLeg(leg1: FlightPlanLeg, leg2: FlightPlanLeg): boolean {
    if (!WTLineFms.isXFLeg(leg1) || !WTLineFms.isXFLeg(leg2)) {
      return false;
    }

    return leg1.fixIcaoStruct.region === leg2.fixIcaoStruct.region
      && leg1.fixIcaoStruct.ident === leg2.fixIcaoStruct.ident
      && leg1.fixIcaoStruct.type === leg2.fixIcaoStruct.type;
  }

  /**
   * Merges two duplicate legs such that the new merged leg contains the fix type and altitude data from the source leg
   * and all other data is derived from the target leg.
   * @param target The target leg.
   * @param source The source leg.
   * @param fallbackToTarget If true, and the source leg does not define constraints, the target leg constraints can be retained.
   * @returns the merged leg.
   */
  private mergeDuplicateLegData(target: FlightPlanLeg, source: FlightPlanLeg, fallbackToTarget = false): FlightPlanLeg {
    // FIXME this should prompt user with SELECT ALT dialog/page when this is not done as a result of modifying procedures

    const merged = FlightPlan.createLeg(target);
    merged.fixTypeFlags |= source.fixTypeFlags;
    if (source.altDesc !== AltitudeRestrictionType.Unused || !fallbackToTarget) {
      merged.altDesc = source.altDesc;
      merged.altitude1 = source.altitude1;
      merged.altitude2 = source.altitude2;
    }
    if (source.speedRestriction > 0 || !fallbackToTarget) {
      merged.speedRestriction = source.speedRestriction;
    }
    return merged;
  }

  /**
   * Deletes one of two consecutive duplicate legs. If one leg is in a procedure and the other is not, the leg that is
   * not in a procedure will be deleted. If the legs are in different procedures, the earlier leg will be deleted.
   * Otherwise, the later leg will be deleted. If the deleted leg is the target leg of a direct to, the legs in the
   * direct to sequence will be copied and moved to immediately follow the duplicate leg that was not deleted.
   * @param planIndex The index of the flight plan.
   * @param leg1 The first duplicate leg.
   * @param leg2 The second duplicate leg.
   * @returns the leg that was deleted, or null if neither leg was deleted.
   * @throws Error if direct to legs could not be updated.
   */
  private planRemoveDuplicateLeg(planIndex: FlightPlanIndexType<T>, leg1: LegDefinition, leg2: LegDefinition): LegDefinition | null {
    const plan = this.getPlanToEdit(planIndex);

    const leg1Segment = plan.getSegmentFromLeg(leg1);
    const leg1Index = plan.getLegIndexFromLeg(leg1);
    const leg2Segment = plan.getSegmentFromLeg(leg2);
    const leg2Index = plan.getLegIndexFromLeg(leg2);

    if (!leg1Segment || !leg2Segment) {
      return null;
    }

    const isLeg1DirectToLeg = BitFlags.isAll(leg1.flags, WT21LegDefinitionFlags.DirectTo);
    const isLeg2DirectToLeg = BitFlags.isAll(leg2.flags, WT21LegDefinitionFlags.DirectTo);
    const dupDirectToLeg = isLeg1DirectToLeg ? leg1
      : isLeg2DirectToLeg ? leg2
        : null;

    if (dupDirectToLeg) {
      if (dupDirectToLeg.leg.type === LegType.IF) {
        // Technically this should never happen.
        return null;
      } else {
        // If one of the duplicates is the second leg in a direct to sequence, then the true duplicated leg is the
        // target leg of the DTO. In this case, we call this method with the DTO target leg replacing the DTO leg.
        const dtoTargetLeg = plan.getSegment(plan.directToData.segmentIndex).legs[plan.directToData.segmentLegIndex];

        return isLeg1DirectToLeg ? this.planRemoveDuplicateLeg(plan.planIndex, dtoTargetLeg, leg2) : this.planRemoveDuplicateLeg(plan.planIndex, leg1, dtoTargetLeg);
      }
    }

    const isLeg1InProc = leg1Segment.segmentType !== FlightPlanSegmentType.Enroute;
    const isLeg2InProc = leg2Segment.segmentType !== FlightPlanSegmentType.Enroute;

    let toDeleteSegment;
    let toDeleteIndex;
    let toDeleteLeg;
    // If leg2 doesn't contain an actual path and leg1 does, we want to keep the path.
    if (isLeg1InProc && isLeg2InProc && leg2.leg.type === LegType.IF && leg1.leg.type !== LegType.IF) {
      toDeleteSegment = leg2Segment;
      toDeleteIndex = leg2Index - leg2Segment.offset;
      leg1.leg = this.mergeDuplicateLegData(leg1.leg, leg2.leg);
      toDeleteLeg = leg2;
    } else if (
      (!isLeg1InProc && isLeg2InProc)
      || (isLeg1InProc && isLeg2InProc && leg1Segment !== leg2Segment)
      || BitFlags.isAny(leg2.leg.fixTypeFlags, FixTypeFlags.FAF | FixTypeFlags.MAP)
    ) {
      toDeleteSegment = leg1Segment;
      toDeleteIndex = leg1Index - leg1Segment.offset;
      toDeleteLeg = leg1;
    } else {
      toDeleteSegment = leg2Segment;
      toDeleteIndex = leg2Index - leg2Segment.offset;
      // TODO Probably shouldn't modify the LegDefinition like this,
      // TODO because events won't fire and things won't know that it changed.
      leg1.leg = this.mergeDuplicateLegData(leg1.leg, leg2.leg);
      toDeleteLeg = leg2;
    }

    if (toDeleteIndex >= 0) {
      const dtoTargetLeg = plan.directToData.segmentIndex < 0 ? null : plan.getSegment(plan.directToData.segmentIndex).legs[plan.directToData.segmentLegIndex];
      const needMoveDtoLegs = toDeleteLeg === dtoTargetLeg;

      if (needMoveDtoLegs) {
        const isDtoExistingActive = this.getDirectToState() === DirectToState.TOEXISTING;

        // If the removed leg was the target leg of a DTO existing, we need to shift the DTO legs to target the leg
        // that was not removed.

        const oldDiscoLeg = plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex + 1);
        const oldDtoLeg1 = plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex + 1);
        const oldDtoLeg2 = plan.removeLeg(plan.directToData.segmentIndex, plan.directToData.segmentLegIndex + 1);

        if (!oldDtoLeg1 || !oldDtoLeg2 || !oldDiscoLeg) {
          throw new Error(`Fms: Could not remove direct to legs starting at segment index ${plan.directToData.segmentIndex}, leg index ${plan.directToData.segmentLegIndex} during duplicate leg resolution.`);
        }

        const preservedLeg = toDeleteLeg === leg1 ? leg2 : leg1;
        const preservedLegIndex = plan.getLegIndexFromLeg(preservedLeg);

        const newTargetSegmentIndex = plan.getSegmentIndex(preservedLegIndex);
        const newTargetSegmentLegIndex = preservedLegIndex - plan.getSegment(newTargetSegmentIndex).offset;

        plan.setDirectToData(newTargetSegmentIndex, newTargetSegmentLegIndex);

        plan.addLeg(newTargetSegmentIndex, FlightPlan.createLeg(oldDiscoLeg.leg), newTargetSegmentLegIndex + 1,
          WT21LegDefinitionFlags.DirectTo);
        plan.addLeg(newTargetSegmentIndex, FlightPlan.createLeg(oldDtoLeg1.leg), newTargetSegmentLegIndex + 2,
          WT21LegDefinitionFlags.DirectTo);
        plan.addLeg(newTargetSegmentIndex, FlightPlan.createLeg(oldDtoLeg2.leg), newTargetSegmentLegIndex + 3,
          WT21LegDefinitionFlags.DirectTo | WT21LegDefinitionFlags.DirectToTarget);

        if (isDtoExistingActive) {
          plan.setLateralLeg(preservedLegIndex + 3);
        }
      }

      const success = this.planRemoveLeg(plan.planIndex, toDeleteSegment.segmentIndex, toDeleteIndex, true, false, needMoveDtoLegs);
      if (success) {
        return toDeleteLeg;
      }
    }

    return null;
  }

  /**
   * Sets the approach details for the loaded approach and sends an event across the bus.
   * @param approachLoaded Whether an approach is loaded.
   * @param approachType The approach type.
   * @param approachRnavType The approach RNAV type.
   * @param approachIsActive Whether the approach is active.
   * @param approachIsCircling Whether the approach is a circling approach.
   * @param referenceFacility The reference navaid for the approach.
   */
  private setApproachDetails(
    approachLoaded?: boolean,
    approachType?: ExtendedApproachType,
    approachRnavType?: RnavTypeFlags,
    approachIsActive?: boolean,
    approachIsCircling?: boolean,
    referenceFacility?: VorFacility | null,
  ): void {
    const approachDetails: ApproachDetails = {
      approachLoaded: approachLoaded !== undefined ? approachLoaded : this.approachDetails.approachLoaded,
      approachType: approachType !== undefined ? approachType : this.approachDetails.approachType,
      approachRnavType: approachRnavType !== undefined ? approachRnavType : this.approachDetails.approachRnavType,
      approachIsActive: approachIsActive !== undefined ? approachIsActive : this.approachDetails.approachIsActive,
      approachIsCircling: approachIsCircling !== undefined ? approachIsCircling : this.approachDetails.approachIsCircling,
      referenceFacility: referenceFacility !== undefined ? referenceFacility : this.approachDetails.referenceFacility,
    };
    if (approachDetails.approachIsActive && !approachDetails.approachLoaded) {
      this.checkApproachState();
      return;
    }

    this.approachDetails = approachDetails;
    this.bus.getPublisher<WTLineControlEvents>().pub('approach_details_set', this.approachDetails, true);
    this.bus.getPublisher<ControlEvents>().pub('approach_available', approachDetails.approachIsActive && approachDetails.approachLoaded, true);
    this.bus.getPublisher<WT21VNavDataEvents>().pub('approach_supports_gp', this.doesApproachSupportGp(), true);
  }

  /**
   * Clears the approach details
   */
  protected clearApproachDetails(): void {
    this.setApproachDetails(false, ApproachType.APPROACH_TYPE_UNKNOWN, RnavTypeFlags.None, false, false, null);
  }

  /**
   * Checks whether the approach details indicate that vertical guidance (GP) can be supported.
   * @returns whether or not vertical guidance is supported.
   */
  private doesApproachSupportGp(): boolean {
    if (this.approachDetails.approachLoaded && this.approachDetails.approachIsActive && !this.approachDetails.approachIsCircling) {
      switch (this.approachDetails.approachType) {
        case ApproachType.APPROACH_TYPE_GPS:
        case ApproachType.APPROACH_TYPE_RNAV:
        case AdditionalApproachType.APPROACH_TYPE_VISUAL:
          return true;
      }
    }
    return false;
  }

  /**
   * Checks if an RNAV approach can be activated in the AP.
   * @param cdiScaling The current CDI Scaling Label
   * @returns Whether approach can activate.
   */
  private canApproachActivate(cdiScaling = this.cdiScaleLabel.get()): boolean {
    const apprModeAvailable = cdiScaling === CDIScaleLabel.Terminal || cdiScaling === CDIScaleLabel.TerminalArrival || cdiScaling === CDIScaleLabel.Approach;
    return this.approachDetails.approachLoaded && apprModeAvailable;
  }

  /**
   * Sets the approach details when an approach_details_set event is received from the bus.
   * @param approachDetails The approachDetails received from the bus.
   */
  private onApproachDetailsSet = (approachDetails: ApproachDetails): void => {
    if (approachDetails !== this.approachDetails) {
      this.approachDetails = approachDetails;
    }
    const canApproachActivate = this.canApproachActivate();
    if (canApproachActivate !== this.approachDetails.approachIsActive) {
      this.setApproachDetails(undefined, undefined, undefined, canApproachActivate);
    }
  };

  /**
   * Checks if a given leg type should be follow by a discontinuity when stringing a procedure.
   * @param legType The leg type to check.
   * @returns true if a discontinuity should be inserted after the leg.
   */
  private shouldDiscontinuityFollowLeg(legType: LegType): boolean {
    return legType === LegType.FM || legType === LegType.VM;
  }
}

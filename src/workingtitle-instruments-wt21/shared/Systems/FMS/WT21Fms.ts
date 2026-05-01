import {
  AirportFacility, EventBus, FacilityLoader, FacilityType, FlightPlan, FlightPlanCopiedEvent, FlightPlanIndicationEvent,
  FlightPlanLeg, FlightPlanner, FlightPlannerEvents, FlightPlanSegmentType, GNSSEvents, IcaoValue, LegType,
  OneWayRunway, SmoothingPathCalculator, Subject, UserFacility, VerticalFlightPlan,
} from '@microsoft/msfs-sdk';

import {
  BasePerformanceDataManager, FlightPlanIndexType, PerformancePlan, PerformancePlanProxy, PerformancePlanRepository,
  WTLineFixInfoManager, WTLineFms, WTLineFmsUtils, WTLineLegacyDefaultFlightPlanRepository, WTLineLegacyFlightPlanIndexTypes,
  WTLineLegacyFlightPlans,
} from '@microsoft/msfs-wtlinesdk';

import { MessageService } from '../../MessageSystem';
import { FmsPos } from '../../Navigation';

/**
 * @deprecated unused
 */
export enum ProcedureType {
  DEPARTURE,
  ARRIVAL,
  APPROACH,
  VISUALAPPROACH
}


/** Interface for inverting the plan */
interface LegList {
  /** the leg icao */
  icao: IcaoValue;
  /** the airway to this leg, if any */
  airway?: string;
}

/**
 * {@link WTLineFms} with legacy functionality for the WT21, for backwards compatibility
 */
export class WT21Fms extends WTLineFms<WTLineLegacyFlightPlanIndexTypes> {
  private readonly performancePlanRepository = new PerformancePlanRepository(this.flightPlanner, this.bus);

  /**
   * Proxy to the currently relevant performance plan. This allows subbing to subscribables that always point to the right value,
   * whether we are in ACT or MOD, without worrying about switching around subscriptions.
   */
  public readonly performancePlanProxy: PerformancePlanProxy = new PerformancePlanProxy(
    this.performancePlanRepository.defaultValuesPlan(),
    (property) => {
      if (!property.editInPlace) {
        // Create a MOD flight plan
        this.getPlanToEdit(WTLineLegacyFlightPlans.Active);
      }
    },
    (property, newValue) => {
      if (property.editInPlace) {
        // We edit both plans, since we do not want to involve an EXEC to confirm a value.
        // This makes sure that if a value is modified while a MOD plan exists, we modify it, making a copy
        // from ACT -> MOD not reset the value.
        this.performancePlanRepository.triggerSync(WTLineFmsUtils.PRIMARY_ACT_PLAN_INDEX);

        const modPerfPlan = this.performancePlanRepository.getModPlan();

        if (modPerfPlan) {
          (modPerfPlan[property.key] as Subject<any>).set(newValue);

          this.performancePlanRepository.triggerSync(WTLineFmsUtils.PRIMARY_MOD_PLAN_INDEX);
        }

      }
    },
  );

  /**
   * Returns the active performance plan
   *
   * @returns the performance plan for the active flight plan index
   */
  public get activePerformancePlan(): PerformancePlan {
    return this.performancePlanRepository.getActivePlan();
  }

  public readonly basePerformanceManager = new BasePerformanceDataManager(this.performancePlanProxy, this.bus);

  private wt21OnPlanLoaded = (): void => {
    this.switchPerformanceProxyToRenderPlan();
  };

  private wt21OnPlanCopied = (ev: FlightPlanCopiedEvent): void => {
    this.applyCopyToPerformancePlans(ev);
  };

  private wt21OnPlanCreated = (ev: FlightPlanIndicationEvent): void => {
    this.applyCreationToPerformancePlans(ev);
  };

  /**
   * Applies flight plan copy events to the performance plan repository
   *
   * @param ev plan copied event
   */
  private applyCopyToPerformancePlans(ev: FlightPlanCopiedEvent): void {
    if (!this.performancePlanRepository.has(ev.planIndex)) {
      this.performancePlanRepository.create(ev.planIndex);
    }

    this.performancePlanRepository.copy(ev.planIndex, ev.targetPlanIndex);
  }

  /**
   * Applies flight plan copy events to the performance plan repository
   *
   * @param ev plan copied event
   */
  private applyCreationToPerformancePlans(ev: FlightPlanIndicationEvent): void {
    if (!this.performancePlanRepository.hasAnyPlan()) {
      this.performancePlanRepository.forFlightPlanIndex(ev.planIndex);
    }
  }

  /**
   * Initialize an instance of the FMS for the WT21.
   * @param bus is the event bus
   * @param facLoader The facility loader.
   * @param flightPlanner is the flight planner
   * @param fmsPos is the FMS position system
   * @param verticalPathCalculator is the VNAV Path Calculator.
   * @param messageService is the message service.
   * @param fixInfo The fix info manager.
   */
  constructor(
    bus: EventBus,
    facLoader: FacilityLoader,
    flightPlanner: FlightPlanner,
    /** @deprecated get the FMS position from outside this class */
    public readonly fmsPos: FmsPos,
    verticalPathCalculator: SmoothingPathCalculator,
    /** @deprecated get the message service from outside this class */
    public readonly messageService: MessageService,
    fixInfo: WTLineFixInfoManager,
  ) {
    super(bus, facLoader, flightPlanner, verticalPathCalculator, fixInfo, new WTLineLegacyDefaultFlightPlanRepository(flightPlanner));

    // Update PPOS from GPS while we have no real FMS position
    this.bus.getSubscriber<GNSSEvents>().on('gps-position').atFrequency(1).handle(pos => this.ppos.set(pos.lat, pos.long));

    this.performancePlanProxy.switchToPlan(this.activePerformancePlan, true);

    this.planInMod.sub(() => {
      this.switchPerformanceProxyToRenderPlan();
    });

    const planEvents = this.bus.getSubscriber<FlightPlannerEvents>();
    planEvents.on('fplLoaded').handle(this.wt21OnPlanLoaded);
    planEvents.on('fplCopied').handle(this.wt21OnPlanCopied);
    planEvents.on('fplCreated').handle(this.wt21OnPlanCreated);
  }

  /**
   * Obtain the performance plan for FMC render
   * @returns the plan
   */
  private getPerformancePlanForFmcRender(): PerformancePlan {
    return this.performancePlanRepository.forFlightPlanIndex(this.getPlanIndexToDisplay(WTLineLegacyFlightPlans.Active));
  }

  /**
   * Gets the performance plan for the ACT flight plan.
   * @returns the performance plan
   */
  public getActivePerformancePlan(): PerformancePlan {
    return this.performancePlanRepository.forFlightPlanIndex(WTLineFmsUtils.PRIMARY_ACT_PLAN_INDEX);
  }

  /**
   * Switches the performance proxy to use the FMC render plan
   */
  public switchPerformanceProxyToRenderPlan(): void {
    this.performancePlanProxy.switchToPlan(this.getPerformancePlanForFmcRender());
  }


  /**
   * Handles when a modification is being made to the plan to ensure the plan is in MOD mode
   *
   * @returns The Flight Plan to modify
   *
   * @deprecated use {@link getPlanToEdit} instead
   */
  public getModFlightPlan(): FlightPlan {
    return this.flightPlanRepo.getPlanToEdit(WTLineLegacyFlightPlans.Active);
  }

  /**
   * Gets the plan index FMC pages should use to monitor events.
   * @returns A Flight Plan Index
   * @deprecated use {@link getPlanIndexToDisplay} instead
   */
  public getPlanIndexForFmcPage(): number {
    return this.flightPlanRepo.getPlanIndexToDisplay(WTLineLegacyFlightPlans.Active);
  }

  /**
   * Gets the current lateral flight plan for the FMC pages based on whether the plan is in MOD or ACT.
   * @returns A Lateral Flight Plan
   * @deprecated use {@link getPlanToDisplay} instead
   */
  public getPlanForFmcRender(): FlightPlan {
    return this.flightPlanRepo.getPlanToDisplay(WTLineLegacyFlightPlans.Active);
  }

  /**
   * Gets the current vertical flight plan for the FMC pages based on whether the plan is in MOD or ACT.
   * @returns A Vertical Flight Plan
   * @deprecated use {@link getVerticalPlanToDisplay} instead
   */
  public getVerticalPlanForFmcRender(): VerticalFlightPlan {
    return this.getVerticalPlanToDisplay(WTLineLegacyFlightPlans.Active);
  }

  /**
   * Initializes the primary flight plan. Does nothing if the primary flight plan already exists.
   *
   * @deprecated use {@link initFlightPlans} instead
   */
  public async initPrimaryFlightPlan(): Promise<void> {
    if (this.flightPlanner.hasFlightPlan(WTLineLegacyFlightPlans.Active)) {
      this.setFacilityInfo();
      return;
    }

    this.flightPlanner.createFlightPlan(WTLineLegacyFlightPlans.Active);
    WTLineFmsUtils.setFlightPlanProcedureIdents(
      this.flightPlanner.getFlightPlan(WTLineLegacyFlightPlans.Active),
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

    this.flightPlanner.createFlightPlan(WTLineLegacyFlightPlans.Mod);
    WTLineFmsUtils.setFlightPlanProcedureIdents(
      this.flightPlanner.getFlightPlan(WTLineLegacyFlightPlans.Mod),
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

    await this.emptyPrimaryFlightPlan();
  }

  /**
   * Empties the primary flight plan.
   *
   * @deprecated use {@link emptyFlightPlan} instead
   */
  public async emptyPrimaryFlightPlan(): Promise<void> {
    WTLineFmsUtils.emptyFlightPlan(this.getPrimaryFlightPlan());

    this.clearApproachDetails();
  }

  /**
   * Empties the mod flight plan.
   *
   * @param notify whether to emit sync events
   *
   * @deprecated use {@link emptyFlightPlanForEdit} instead
   */
  public emptyModFlightPlan(notify = false): void {
    const plan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

    WTLineFmsUtils.emptyFlightPlan(plan, notify);
  }

  /**
   * Method to add a new origin airport and runway to the flight plan.
   * @param airport is the facility of the origin airport.
   * @param runway is the new runway
   * @param planIndex is the index of the plan to target the edit to
   * @deprecated use {@link setOriginAirport} and {@link loadDeparture} instead
   */
  public setOrigin(airport: AirportFacility | undefined, runway?: OneWayRunway, planIndex: WTLineLegacyFlightPlans = WTLineLegacyFlightPlans.Active): void {
    const plan = this.getPlanToEdit(planIndex);

    this.setOriginAirport(plan.planIndex, airport?.icaoStruct);
    plan.setOriginRunway(runway);

    this.removeDeparture(plan.planIndex, true);

    this.facilityInfo.originFacility = airport;

    plan.calculate(0);
  }

  /**
   * Method to add a new destination airport and runway to the flight plan.
   * @param airport is the facility of the destination airport.
   * @param runway is the selected runway at the destination facility.
   * @param planIndex is the plan index to target the edit to
   * @deprecated use {@link setDestinationAirport} and {@link insertApproach} instead
   */
  public setDestination(airport: AirportFacility | undefined, runway?: OneWayRunway, planIndex: WTLineLegacyFlightPlans = WTLineLegacyFlightPlans.Active): void {
    const plan = this.getPlanToEdit(planIndex);

    this.setDestinationAirport(planIndex, airport?.icaoStruct);
    plan.setDestinationRunway(runway);

    this.removeApproach(plan.planIndex);
    this.removeArrival(plan.planIndex);

    this.facilityInfo.destinationFacility = airport;

    plan.calculate(0);
  }

  /**
   * Loads a departure procedure into a flight plan.
   * @param facility The procedure's parent airport facility.
   * @param departureIndex The index of the procedure in the parent airport facility's departure array.
   * @param runwayTransitionIndex The index of the procedure's runway transition, or `-1` if the procedure does not
   * include a runway transition.
   * @param enrouteTransitionIndex The index of the procedure's enroute transition, or `-1` if the procedure does not
   * include an enroute transition.
   * @param oneWayRunway The runway associated with the procedure, or `undefined` if there is no associated runway.
   * @param planIndex The index of the plan to target the edit to.
   * @returns A Promise which fulfills with whether the specified departure procedure was successfully loaded.
   *
   * @deprecated use {@link loadOriginDeparture} or {@link loadDestinationDeparture} instead
   */
  public async loadDeparture(
    facility: AirportFacility,
    departureIndex: number,
    runwayTransitionIndex: number,
    enrouteTransitionIndex: number,
    oneWayRunway?: OneWayRunway | undefined,
    planIndex: WTLineLegacyFlightPlans = WTLineLegacyFlightPlans.Active,
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
   * Method to invert the flightplan.
   *
   * @deprecated unused, not applicable
   */
  public invertFlightplan(): void {
    const plan = this.getPlanToEdit(WTLineLegacyFlightPlans.Active);

    if (plan.directToData.segmentIndex >= 0 && plan.directToData.segmentLegIndex >= 0) {
      WTLineFmsUtils.removeDirectToExisting(plan);
    }

    const newOriginIcao = plan.destinationAirport;
    const newDestinationIcao = plan.originAirport;
    const lastEnrouteSegmentIndex = this.findLastEnrouteSegmentIndex(plan);

    if (lastEnrouteSegmentIndex === 1 && plan.getSegment(1).legs.length > 0) {
      //case for when there is only 1 enroute segment and it has at least 1 waypoint, a simple reversal is all that's required.
      const segment = Object.assign({}, plan.getSegment(1));
      this.emptyPrimaryFlightPlan();
      for (let l = segment.legs.length - 1; l >= 0; l--) {
        plan.addLeg(1, segment.legs[l].leg);
      }
    } else if (lastEnrouteSegmentIndex > 1) {
      //case for when there is more than 1 enroute segment we know we have to deal with airways
      const legs: LegList[] = [];
      for (let i = 1; i <= lastEnrouteSegmentIndex; i++) {
        //create a temporary list of legs that looks like what a flight plan import looks like with ICAO and the airway
        //we fly FROM the leg on.
        const oldSegment = plan.getSegment(i);
        const airway = oldSegment.airway ? oldSegment.airway?.split('.')[0] : undefined;
        for (const leg of oldSegment.legs) {
          const legListItem: LegList = { icao: leg.leg.fixIcaoStruct, airway: airway };
          legs.push(legListItem);
        }
      }
      //after the array of legs is complete, we just reverse it
      legs.reverse();
      this.emptyPrimaryFlightPlan();

      let currentSegment = 1;
      let lastLegWasAirway = false;

      //last we go through each leg and use the same logic we use for the flight plan import to go through each leg and create airway
      //segments as appropriate for these legs.
      for (let i = 0; i < legs.length; i++) {
        const wpt = legs[i];
        const segment = plan.getSegment(currentSegment);
        if (wpt.airway) {
          const leg = FlightPlan.createLeg({
            type: LegType.TF,
            fixIcaoStruct: wpt.icao
          });
          plan.addLeg(currentSegment, leg);
          if (!lastLegWasAirway) {
            plan.insertSegment(currentSegment + 1, FlightPlanSegmentType.Enroute, wpt.airway);
            currentSegment += 1;
          }
          for (let j = i + 1; j < legs.length; j++) {
            i++;
            const airwayLeg = FlightPlan.createLeg({
              type: LegType.TF,
              fixIcaoStruct: legs[j].icao
            });
            plan.addLeg(currentSegment, airwayLeg);

            if (legs[j].airway !== wpt.airway) {
              lastLegWasAirway = legs[j].airway ? true : false;
              break;
            }
          }

          plan.setAirway(currentSegment, wpt.airway + '.' + legs[i].icao.ident);

          currentSegment += 1;
          plan.insertSegment(currentSegment, FlightPlanSegmentType.Enroute, lastLegWasAirway ? legs[i].airway : undefined);

        } else {
          let leg: FlightPlanLeg | undefined = undefined;
          leg = FlightPlan.createLeg({
            type: LegType.TF,
            fixIcaoStruct: wpt.icao
          });
          if (leg) {
            plan.addLeg(currentSegment, leg);
            if (lastLegWasAirway) {
              plan.setAirway(currentSegment, segment.airway + '.' + wpt.icao.ident);
              currentSegment += 1;
              plan.insertSegment(currentSegment, FlightPlanSegmentType.Enroute);
            }
            lastLegWasAirway = false;
          }
        }
      }

      if (plan.getSegment(currentSegment).airway) {
        currentSegment += 1;
        plan.insertSegment(currentSegment, FlightPlanSegmentType.Enroute);
      }
    } else {
      this.emptyPrimaryFlightPlan();
    }

    if (newOriginIcao) {
      this.facLoader.getFacility(FacilityType.Airport, newOriginIcao).then((facility) => {
        this.setOrigin(facility as AirportFacility);
      });
    }

    if (newDestinationIcao) {
      this.facLoader.getFacility(FacilityType.Airport, newDestinationIcao).then((facility) => {
        this.setDestination(facility as AirportFacility);
      });
    }

    this.clearApproachDetails();
    plan.calculate(0);
  }

  /**
   * Activates an approach. Activating an approach activates a Direct To to the first approach waypoint of the primary
   * flight plan, and attempts to load the primary approach frequency (if one exists) to the nav radios. If the primary
   * flight plan does not have an approach loaded, this method has no effect.
   *
   * @deprecated unused, not applicable
   */
  public activateApproach(): void {
    // noop
  }

  /**
   * Checks whether vectors-to-final can be activated. VTF can be activated if and only if the primary flight plan has
   * an approach loaded.
   * @returns Whether vectors-to-final can be activated.
   *
   * @deprecated unused, not applicable
   */
  public canActivateVtf(): boolean {
    // noop
    return false;
  }

  /**
   * Checks whether an approach can be activated. An approach can be activated if and only if the primary flight plan
   * has a non-vectors-to-final approach loaded.
   * @returns Whether an approach can be activated.
   *
   * @deprecated unused, not applicable
   */
  public canActivateApproach(): boolean {
    // noop
    return false;
  }

  /**
   * Activates vectors-to-final. Activating vectors-to-final activates the primary flight plan's vectors-to-final leg,
   * and attempts to load the primary approach frequency (if one exists) to the nav radios. If the primary flight plan
   * has a non-VTF approach loaded, it will be replaced by its VTF counterpart. If the primary flight plan has no
   * approach loaded, this method has no effect.
   *
   * @deprecated unused, not applicable
   */
  public async activateVtf(): Promise<void> {
    // noop
  }

  /**
   * Method to check if the approach is VTF.
   * @returns whether the approach is VTF.
   *
   * @deprecated unused, not applicable
   */
  public isApproachVtf(): boolean {
    // noop
    return false;
  }

  /** @inheritDoc */
  public execModFlightPlan(): void {
    super.execModFlightPlan();

    // sync ACT performance plan
    this.performancePlanRepository.triggerSync(WTLineFmsUtils.PRIMARY_ACT_PLAN_INDEX);
  }

  /**
   * Gets all user facilities.
   *
   * @returns an array of user facilities
   *
   * @deprecated use {@link getPilotDefinedWaypointsArray} instead
   */
  public getUserFacilities(): UserFacility[] {
    return this.userFacilities.getArray().map(it => it.facility.get());
  }

  /**
   * Gets the ALTN airport of a flight plan
   *
   * @param planIndex the flight plan index
   *
   * @returns the ALTN airport FS ICAO, or undefined
   *
   * @deprecated use {@link WTLineFmsUtils.getFlightPlanAlternate} instead
   */
  public getFlightPlanAlternate(planIndex?: FlightPlanIndexType<WTLineLegacyFlightPlanIndexTypes>): string | undefined {
    const plan = this.getFlightPlan(planIndex);

    return plan.getUserData(WTLineFmsUtils.USER_DATA_KEY_ALTN);
  }

  /**
   * Sets the ALTN airport of a flight plan
   *
   * @param facility the ALTN airport facility, or undefined
   * @param planIndex the flight plan index
   *
   * @deprecated use {@link WTLineFmsUtils.setFlightPlanAlternate} instead
   */
  public setFlightPlanAlternate(facility: AirportFacility | undefined, planIndex = WTLineLegacyFlightPlans.Active): void {
    const plan = this.getPlanToEdit(planIndex);

    plan.setUserData(WTLineFmsUtils.USER_DATA_KEY_ALTN, facility?.icao ?? undefined);
  }
}

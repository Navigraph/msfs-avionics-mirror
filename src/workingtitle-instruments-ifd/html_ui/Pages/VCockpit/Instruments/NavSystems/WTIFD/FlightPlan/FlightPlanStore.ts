/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  ActiveLegType, AdcEvents, AirportFacility, AltitudeRestrictionType, APEvents, ApproachProcedure, ApproachTransition, BasicNavAngleSubject, BasicNavAngleUnit,
  ChartMetadata, ChartServiceErrorCode, ClockEvents, ConsumerSubject, ConsumerValue, DirectToData, EnrouteTransition, EventBus, FacilityType, FlightPlan,
  FlightPlanActiveLegEvent, FlightPlanCalculatedEvent, FlightPlanDirectToDataEvent, FlightPlanIndicationEvent, FlightPlanLegEvent, FlightPlanLegUserDataEvent,
  FlightPlanOriginDestEvent, FlightPlanPredictorUtils, FlightPlanProcedureDetailsEvent, FlightPlanSegment, FlightPlanSegmentEvent, FlightPlanSegmentType,
  FlightPlanUserDataEvent, FlightPlanUtils, GeoPoint, GNSSEvents, ICAO, LatLongInterface, LegDefinition, LegEventType, LegType, LNavUtils, MagVar,
  MappedSubject, MathUtils, NavAngleUnit, NavAngleUnitFamily, NumberUnitInterface, NumberUnitSubject, OneWayRunway, OriginDestChangeType, Procedure,
  ReadonlySubEvent, RunwayTransition, SegmentEventType, SimpleUnit, SimVarValueType, StringUtils, SubEvent, Subject, Subscribable, UnitFamily, UnitType,
  VerticalFlightPhase, VNavEvents, VNavLeg, VNavPathCalculator, VNavUtils
} from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../Charts/IfdChartsManager';
import { ApproachListItem, ArrivalListItem, DepartureListItem, DirectToState, Fms, FmsFplUserDataKey, FmsUtils } from '../Fms';
import { IfdOptions } from '../IfdOptions';
import { LNavDataEvents } from '../Navigation/LNavDataEvents';
import { IfdVnavManager } from '../Navigation/Vnav/IfdVnavManager';
import { FmsUserSettings } from '../Settings/FmsUserSettings';
import { UnitsUserSettings } from '../Settings/UnitsUserSettings';
import { FmsPositionSystemEvents } from '../Systems/FmsPositionSystem';
import { IfdFuelComputerEvents } from '../Systems/FuelComputer/IfdFuelComputerEvents';
import { FlightPlanLegData } from './FlightPlanLegListData';
import { FlightPlanSegmentData } from './FlightPlanSegmentListData';

const UNUSABLE_FUEL_QUANTITY_GALLONS = SimVar.GetSimVarValue('UNUSABLE FUEL TOTAL QUANTITY', SimVarValueType.GAL) as number;

/** Listens for flight plan events, and stores data as subjects to be used by the gtc flight plan page. */
export class FlightPlanStore {
  private static readonly DISTANCE_QUANTUM_DEG = 0.1;
  private static readonly DISTANCE_QUANTUM_GA = UnitType.GA_RADIAN.convertFrom(0.01, UnitType.NMILE);
  public static readonly DISTANCE_QUANTUM_METER = UnitType.METER.convertFrom(0.01, UnitType.NMILE);

  /** Minimum ground speed in knots to calculate fuel and time predictions. */
  private static readonly MINIMUM_PREDICTION_GROUND_SPEED = 30;

  private static readonly geoPointCache = new GeoPoint(NaN, NaN);

  public readonly flightPlannerId = this.fms.flightPlanner.id;

  // public readonly flightPlanListManager: FlightPlanListManager;

  public readonly aircraftPosition = ConsumerSubject.create<LatLongInterface>(this.bus.getSubscriber<FmsPositionSystemEvents>().on('fms_pos_position_1').atFrequency(1), { lat: NaN, long: NaN });

  public readonly aircraftNavAngleTrueUnit = BasicNavAngleUnit.create(false);
  public readonly aircraftNavAngleMagneticUnit = BasicNavAngleUnit.create(true);

  private readonly _isActivated = Subject.create(false);
  /** Whether the flight plan has been activated. */
  public readonly isActivated: Subscribable<boolean> = this._isActivated;
  public readonly _canActivate = Subject.create(false);
  /** Whether the flight plan can be activated (not activated and has at least 1 leg excluding origin). */
  public readonly canActivate: Subscribable<boolean> = this._canActivate;
  private readonly fmsSettings = FmsUserSettings.getManager(this.bus);

  public readonly miniFplFormat = this.fmsSettings.getSetting('miniFlightPlanFormat');
  /** The view mode of the flight plan on the FPL tab. */
  public readonly viewMode = Subject.create<'compact' | 'expanded'>('expanded');

  private readonly _segmentMap = new Map<FlightPlanSegment, FlightPlanSegmentData>();
  /** Unordered map of FlightPlanSegments to segment list data items.
   * Segments are added/removed to/from this map to match the flight plan. */
  public readonly segmentMap = this._segmentMap as ReadonlyMap<FlightPlanSegment, FlightPlanSegmentData>;

  private readonly _legMap = new Map<LegDefinition, FlightPlanLegData>();
  /** Unordered map of leg definitions to leg list data items.
   * Legs are added/removed to/from this map to match the flight plan. */
  public readonly legMap = this._legMap as ReadonlyMap<LegDefinition, FlightPlanLegData>;

  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.bus);

  private readonly _activePlanIndex = Subject.create<undefined | number>(undefined);
  public readonly activePlanIndex = this._activePlanIndex as Subscribable<undefined | number>;

  private readonly _flightPlanName = Subject.create<string | undefined>(undefined);
  public readonly flightPlanName = this._flightPlanName as Subscribable<string | undefined>;

  // Events
  private readonly _flightPlanLegsChanged = new SubEvent<void, FlightPlan>();
  /** An event which fires when legs are added to or removed from this store's flight plan. */
  public readonly flightPlanLegsChanged = this._flightPlanLegsChanged as ReadonlySubEvent<void, FlightPlan>;

  // Origin
  private readonly _originIdent = Subject.create<string | undefined>(undefined);
  public readonly originIdent = this._originIdent as Subscribable<string | undefined>;
  private readonly _originFacility = Subject.create<AirportFacility | undefined>(undefined);
  public readonly originFacility = this._originFacility as Subscribable<AirportFacility | undefined>;
  private readonly _originRunway = Subject.create<OneWayRunway | undefined>(undefined);
  public readonly originRunway = this._originRunway as Subscribable<OneWayRunway | undefined>;
  public readonly originRunwayName = this._originRunway.map(x => x?.designation);
  private readonly _originDistance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  public readonly originDistance: Subscribable<NumberUnitInterface<UnitFamily.Distance, SimpleUnit<UnitFamily.Distance>>> = this._originDistance;
  private readonly _originBearing = BasicNavAngleSubject.create(this.aircraftNavAngleTrueUnit.createNumber(NaN));
  public readonly originBearing: Subscribable<NumberUnitInterface<NavAngleUnitFamily, NavAngleUnit>> = this._originBearing;
  public readonly originDepartures: Subscribable<DepartureListItem[]> = this.originFacility.map((fac) => FmsUtils.getDepartures(fac, this.ifdOptions.enableRfLegs));
  private readonly _originChart = Subject.create<ChartMetadata | undefined>(undefined);
  public readonly originChart: Subscribable<ChartMetadata | undefined> = this._originChart;

  // Departure
  private readonly _departureIndex = Subject.create(-1);
  public readonly departureIndex = this._departureIndex as Subscribable<number>;
  private readonly _departureProcedure = Subject.create<Procedure | undefined>(undefined);
  public readonly departureProcedure = this._departureProcedure as Subscribable<Procedure | undefined>;
  private readonly _departureTransition = Subject.create<EnrouteTransition | undefined>(undefined);
  public readonly departureTransition = this._departureTransition as Subscribable<EnrouteTransition | undefined>;
  public readonly departureTransitionName = this._departureTransition.map(x => x?.name ?? '');
  private readonly _departureTransitionIndex = Subject.create(-1);
  public readonly departureTransitionIndex = this._departureTransitionIndex as Subscribable<number>;
  private readonly _departureRunwayTransitionIndex = Subject.create(-1);
  public readonly departureRunwayTransitionIndex = this._departureRunwayTransitionIndex as Subscribable<number>;
  public readonly departureString = this._departureProcedure.map((v) => v?.name ?? '');
  public readonly departureNameWithTransition = MappedSubject.create(([departureString, departureTransitionName]) => {
    return `${departureString}${departureTransitionName ? '.' : ''}${departureTransitionName}`.trim();
  }, this.departureString, this.departureTransitionName);

  // Destination
  private readonly _destinationIdent = Subject.create<string | undefined>(undefined);
  public readonly destinationIdent = this._destinationIdent as Subscribable<string | undefined>;
  private readonly _destinationFacility = Subject.create<AirportFacility | undefined>(undefined);
  public readonly destinationFacility = this._destinationFacility as Subscribable<AirportFacility | undefined>;
  private readonly _destinationRunway = Subject.create<OneWayRunway | undefined>(undefined);
  public readonly destinationRunway = this._destinationRunway as Subscribable<OneWayRunway | undefined>;
  public readonly destinationRunwayName = this._destinationRunway.map(x => x?.designation);
  public readonly destinationString = MappedSubject.create(([destination, runway]) => {
    if (!destination) {
      return '';
    } else if (!runway) {
      return StringUtils.useZeroSlash(`Destination – ${destination}`);
    } else {
      return StringUtils.useZeroSlash(`Destination – ${destination} – RW${runway}`);
    }
  }, this.destinationIdent, this.destinationRunwayName);
  private readonly _destinationDistance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  public readonly destinationDistance: Subscribable<NumberUnitInterface<UnitFamily.Distance, SimpleUnit<UnitFamily.Distance>>> = this._destinationDistance;
  private readonly _destinationBearing = BasicNavAngleSubject.create(this.aircraftNavAngleTrueUnit.createNumber(NaN));
  public readonly destinationBearing: Subscribable<NumberUnitInterface<NavAngleUnitFamily, NavAngleUnit>> = this._destinationBearing;
  public readonly destinationApproaches: Subscribable<ApproachListItem[]> = this.destinationFacility.map((fac) => FmsUtils.getApproaches(fac, this.ifdOptions.enableRfLegs));
  public readonly destinationArrivals: Subscribable<ArrivalListItem[]> = this.destinationFacility.map((fac) => FmsUtils.getArrivals(fac, this.ifdOptions.enableRfLegs));
  private readonly _destinationChart = Subject.create<ChartMetadata | undefined>(undefined);
  public readonly destinationChart: Subscribable<ChartMetadata | undefined> = this._destinationChart;

  // Arrival
  private readonly _arrivalIndex = Subject.create(-1);
  public readonly arrivalIndex = this._arrivalIndex as Subscribable<number>;
  private readonly _arrivalProcedure = Subject.create<Procedure | undefined>(undefined);
  public readonly arrivalProcedure = this._arrivalProcedure as Subscribable<Procedure | undefined>;
  private readonly _arrivalTransition = Subject.create<EnrouteTransition | undefined>(undefined);
  public readonly arrivalTransition = this._arrivalTransition as Subscribable<EnrouteTransition | undefined>;
  private readonly _arrivalTransitionIndex = Subject.create(-1);
  public readonly arrivalTransitionIndex = this._arrivalTransitionIndex as Subscribable<number>;
  public readonly arrivalTransitionName = this._arrivalTransition.map(x => x?.name ?? '');
  private readonly _arrivalRunwayTransition = Subject.create<RunwayTransition | undefined>(undefined);
  public readonly arrivalRunwayTransition = this._arrivalRunwayTransition as Subscribable<RunwayTransition | undefined>;
  private readonly _arrivalRunway = Subject.create<OneWayRunway | undefined>(undefined);
  public readonly arrivalRunway = this._arrivalRunway as Subscribable<OneWayRunway | undefined>;
  private readonly _arrivalFacilityIcao = Subject.create<string | undefined>(undefined);
  public readonly arrivalFacilityIcao = this._arrivalFacilityIcao as Subscribable<string | undefined>;
  private readonly _arrivalFacility = Subject.create<AirportFacility | undefined>(undefined);
  public readonly arrivalFacility = this._arrivalFacility as Subscribable<AirportFacility | undefined>;
  private readonly _arrivalRunwayTransitionIndex = Subject.create(-1);
  public readonly arrivalRunwayTransitionIndex = this._arrivalRunwayTransitionIndex as Subscribable<number>;
  public readonly arrivalString = this._arrivalProcedure.map((v) => v?.name ?? '');
  public readonly arrivalNameWithTransition = MappedSubject.create(([arrivalTransitionName, arrivalString]) => {
    return `${arrivalTransitionName}${arrivalTransitionName ? '.' : ''}${arrivalString}`.trim();
  }, this.arrivalTransitionName, this.arrivalString);

  // Approach
  private readonly _visualApproachOneWayRunwayDesignation = Subject.create<string | undefined>(undefined);
  public readonly visualApproachOneWayRunwayDesignation = this._visualApproachOneWayRunwayDesignation as Subscribable<string | undefined>;
  private readonly _skipCourseReversal = Subject.create<boolean | undefined>(undefined);
  public readonly skipCourseReversal = this._skipCourseReversal as Subscribable<boolean | undefined>;
  private readonly _isApproachLoaded = Subject.create(false);
  public readonly isApproachLoaded = this._isApproachLoaded as Subscribable<boolean>;
  private readonly _approachProcedure = Subject.create<ApproachProcedure | undefined>(undefined);
  public readonly approachProcedure = this._approachProcedure as Subscribable<ApproachProcedure | undefined>;
  private readonly _approachIndex = Subject.create(-1);
  public readonly approachIndex = this._approachIndex as Subscribable<number>;
  public readonly approachName = this._approachProcedure.map(x => x?.name ?? '');
  private readonly _approachTransition = Subject.create<ApproachTransition | undefined>(undefined);
  public readonly approachTransition = this._approachTransition as Subscribable<ApproachTransition | undefined>;
  public readonly approachTransitionName = this._approachTransition.map(x => x?.name ?? '');
  private readonly _approachTransitionIndex = Subject.create(-1);
  public readonly approachTransitionIndex = this._approachTransitionIndex as Subscribable<number>;
  public readonly approachNameWithTransition = MappedSubject.create(([approachTransitionName, approachName]) => {
    return `${approachTransitionName}${approachTransitionName ? '.' : ''}${approachName ?? ''}`.trim();
  }, this.approachTransitionName, this.approachName);

  // Other
  private readonly _isThereAtLeastOneLeg = Subject.create(false);
  public readonly isThereAtLeastOneLeg = this._isThereAtLeastOneLeg as Subscribable<boolean>;

  // Active leg data
  private readonly _activeLegGlobalIndex = Subject.create<number | undefined>(undefined);
  public readonly activeLegGlobalIndex = this._activeLegGlobalIndex as Subscribable<number | undefined>;
  private readonly _activeLegDtkMag = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));
  public readonly activeLegDtkMag = this._activeLegDtkMag as Subscribable<NumberUnitInterface<NavAngleUnitFamily, NavAngleUnit>>;
  private readonly _activeLegDtkTrue = BasicNavAngleSubject.create(BasicNavAngleUnit.create(false).createNumber(NaN));
  public readonly activeLegDtkTrue = this._activeLegDtkTrue as Subscribable<NumberUnitInterface<NavAngleUnitFamily, NavAngleUnit>>;
  private readonly _activeLegDistance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  public readonly activeLegDistance = this._activeLegDistance as Subscribable<NumberUnitInterface<UnitFamily.Distance, SimpleUnit<UnitFamily.Distance>>>;
  private readonly _activeLeg = Subject.create<LegDefinition | undefined>(undefined);
  public readonly activeLeg = this._activeLeg as Subscribable<LegDefinition | undefined>;
  private readonly _activeLegData = Subject.create<FlightPlanLegData | undefined>(undefined);
  public readonly activeLegData = this._activeLegData as Subscribable<FlightPlanLegData | undefined>;
  private readonly _activeLegSegmentIndex = Subject.create<number | undefined>(undefined);
  public readonly activeLegSegmentIndex = this._activeLegSegmentIndex as Subscribable<number | undefined>;
  private readonly _activeLegSegmentType = Subject.create<FlightPlanSegmentType | undefined>(undefined);
  public readonly activeLegSegmentType: Subscribable<FlightPlanSegmentType | undefined> = this._activeLegSegmentType;
  private readonly _destinationWaypointLegData = Subject.create<FlightPlanLegData | undefined>(undefined);
  public readonly destinationWaypointLegData: Subscribable<FlightPlanLegData | undefined> = this._destinationWaypointLegData;

  // Next leg data
  private readonly _nextLegData = Subject.create<FlightPlanLegData | undefined>(undefined);
  public readonly nextLegData = this._nextLegData as Subscribable<FlightPlanLegData | undefined>;
  private readonly _nextLegDtkMag = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));
  public readonly nextLegDtkMag = this._nextLegDtkMag as Subscribable<NumberUnitInterface<NavAngleUnitFamily, NavAngleUnit>>;


  // Direct to
  private readonly _directToData = Subject.create<DirectToData>({ segmentIndex: -1, segmentLegIndex: -1 });
  public readonly directToData = this._directToData as Subscribable<DirectToData>;
  public readonly directToState = MappedSubject.create(() => this.fms.getDirectToState(), this.activePlanIndex, this.directToData, this.activeLeg);
  public readonly isDirectToExistingActive = this.directToState.map(x => x === DirectToState.TOEXISTING);

  private readonly _directToRandomLegData = Subject.create<FlightPlanLegData | undefined>(undefined);
  public readonly directToRandomLegData = this._directToRandomLegData as Subscribable<FlightPlanLegData | undefined>;

  private readonly _directToRandomHoldLegData = Subject.create<FlightPlanLegData | undefined>(undefined);
  public readonly directToRandomHoldLegData = this._directToRandomHoldLegData as Subscribable<FlightPlanLegData | undefined>;

  public readonly directToExistingLeg = MappedSubject.create(([directToData, directToState]) => {
    if (directToState !== DirectToState.TOEXISTING || directToData.segmentIndex === -1 || directToData.segmentLegIndex === -1) { return undefined; }
    const plan = this.fms.getFlightPlan(this.planIndex);
    return plan.tryGetLeg(directToData.segmentIndex, directToData.segmentLegIndex) ?? undefined;
  }, this.directToData, this.directToState) as Subscribable<LegDefinition | undefined>;

  private readonly isDtoUser = Subject.create(false);
  /**
   * The direct to existing leg if it is user-initiated from the direct to dialog.
   * A special icon is shown on this leg.
   */
  public readonly directToExistingUserLeg = MappedSubject.create(
    ([leg, isUser]) => isUser ? leg : undefined,
    this.directToExistingLeg,
    this.isDtoUser,
  ) as Subscribable<LegDefinition | undefined>;

  // From leg
  private readonly _fromLeg = Subject.create<LegDefinition | undefined>(undefined);
  public readonly fromLeg = this._fromLeg as Subscribable<LegDefinition | undefined>;
  public readonly fromLegSegment = this.fromLeg.map(fromLeg => {
    if (fromLeg === undefined) { return undefined; }

    const plan = this.fms.getFlightPlan(this.planIndex);
    return plan.getSegmentFromLeg(fromLeg);
  });

  // To leg
  public readonly toLeg = MappedSubject.create(([activeLeg, directToExistingLeg]) => {
    const toLeg = directToExistingLeg ?? activeLeg;

    if (!toLeg) { return undefined; }

    const plan = this.fms.getFlightPlan(this.planIndex);
    const indexes = FmsUtils.getLegIndexes(plan, toLeg);

    if (!indexes) { return undefined; }

    const segment = plan.getSegment(indexes.segmentIndex);

    return this.legMap.get(segment.legs[indexes.segmentLegIndex]);
  }, this.activeLeg, this.directToExistingLeg);
  public readonly toLegSegment = this.toLeg.map(toLeg => toLeg?.segment);

  // Destination Waypoint
  private readonly destinationWaypointLocation = new GeoPoint(NaN, NaN);
  private destinationWaypointGlobalLegIndex: number | undefined;
  private readonly _destinationWaypointIdent = Subject.create<string | undefined>(undefined);
  /** The ident of the destination waypoint. Destination waypoint is either the destination airport, or the last waypoint in the plan if no destination. */
  public readonly destinationWaypointIdent: Subscribable<string | undefined> = this._destinationWaypointIdent;
  private readonly _destinationWaypointDirectBearing = BasicNavAngleSubject.create(BasicNavAngleUnit.create(false).createNumber(NaN));
  /**
   * The bearing directly from ppos to the destination waypoint. Destination waypoint is either the destination airport, or the last waypoint in the plan if no destination.
   * Use `asUnit` and {@link aircraftNavAngleMagneticUnit} or {@link aircraftNavAngleTrueUnit} to convert to magnetic or true as required.
   */
  public readonly destinationWaypointDirectBearing: Subscribable<NumberUnitInterface<NavAngleUnitFamily, NavAngleUnit>> = this._destinationWaypointDirectBearing;
  private readonly _destinationWaypointDirectDistance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  /** The distance directly from ppos to the destination waypoint. Destination waypoint is either the destination airport, or the last waypoint in the plan if no destination. */
  public readonly destinationWaypointDirectDistance: Subscribable<NumberUnitInterface<UnitFamily.Distance, SimpleUnit<UnitFamily.Distance>>> = this._destinationWaypointDirectDistance;
  private readonly _destinationWaypointAlongTrackDistance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  /** The distance along the flight plan track to the destination waypoint. Destination waypoint is either the destination airport, or the last waypoint in the plan if no destination. */
  public readonly destinationWaypointAlongTrackDistance: Subscribable<NumberUnitInterface<UnitFamily.Distance, SimpleUnit<UnitFamily.Distance>>> = this._destinationWaypointAlongTrackDistance;

  // VNAV
  private readonly todDistanceMetres = ConsumerSubject.create(this.bus.getSubscriber<VNavEvents>().on('vnav_tod_distance'), 0);
  private readonly todGlobalLegIndex = ConsumerSubject.create(this.bus.getSubscriber<VNavEvents>().on('vnav_tod_global_leg_index'), 0);
  private readonly _todTimeToGo = NumberUnitSubject.create(UnitType.SECOND.createNumber(NaN));
  public readonly todTimeToGo: Subscribable<NumberUnitInterface<UnitFamily.Duration, SimpleUnit<UnitFamily.Duration>>> = this._todTimeToGo;

  // Predictions
  private readonly fuelTotalGal = ConsumerValue.create(this.bus.getSubscriber<IfdFuelComputerEvents>().on('ifd_fuel_remaining_gal').atFrequency(1 / 3), NaN);
  private readonly fuelFlowTotalGph = ConsumerSubject.create(this.bus.getSubscriber<IfdFuelComputerEvents>().on('ifd_fuel_flow_total_gph').atFrequency(1 / 3), NaN);
  private readonly groundSpeedKnots = ConsumerSubject.create(this.bus.getSubscriber<GNSSEvents>().on('ground_speed'), 0);
  private readonly unixSimTime = ConsumerSubject.create(this.bus.getSubscriber<ClockEvents>().on('simTime'), 0);

  // Events
  public readonly beforeFlightPlanLoaded = new SubEvent<void, FlightPlan>();
  public readonly segmentAdded = new SubEvent<void, FlightPlanSegmentData>();
  public readonly segmentInserted = new SubEvent<void, FlightPlanSegmentData>();
  public readonly segmentRemoved = new SubEvent<void, [FlightPlanSegmentData, number]>();
  public readonly segmentChanged = new SubEvent<void, [FlightPlanSegmentData, number]>();
  public readonly legAdded = new SubEvent<void, [FlightPlanLegData, number, number]>();
  public readonly legRemoved = new SubEvent<void, FlightPlanLegData>();

  private currentAltitude = 0;
  private selectedAltitude = 0;

  private lastProcDetailsEvent?: FlightPlanProcedureDetailsEvent;

  private isInitialized = false;

  /**
   * Creates a new FlightPlanStore.
   * @param bus The EventBus.
   * @param fms The Fms.
   * @param planIndex Which flight plan index to listen to.
   * @param vnavManager The VNAV manager to use.
   * @param chartsManager The charts manager to use.
   * @param ifdOptions The IFD configuration to use.
   */
  public constructor(
    public readonly bus: EventBus,
    public readonly fms: Fms,
    public readonly planIndex: number,
    private readonly vnavManager: IfdVnavManager,
    private readonly chartsManager: IfdChartsManager,
    private readonly ifdOptions: IfdOptions,
  ) { }

  /**
   * Tells the store to subscribe to the event bus.
   * @throws Error if already initialized.
   */
  public init(): void {
    if (this.isInitialized) {
      throw new Error('flight plan store is already initialized.');
    } else {
      this.isInitialized = true;
    }

    this.fms.flightPlanner.onEvent('fplSegmentChange').handle(this.handleSegmentChange);
    this.fms.flightPlanner.onEvent('fplLegChange').handle(this.handleLegChange);
    this.fms.flightPlanner.onEvent('fplActiveLegChange').handle(this.handleActiveLegChange);
    this.fms.flightPlanner.onEvent('fplOriginDestChanged').handle(this.handleOriginDestChanged);
    this.fms.flightPlanner.onEvent('fplProcDetailsChanged').handle(this.handleProcDetailsChanged);
    this.fms.flightPlanner.onEvent('fplLoaded').handle(e => {
      if (e.planIndex === this.planIndex) {
        this.handleFlightPlanLoaded();
      }
    });
    this.fms.flightPlanner.onEvent('fplCopied').handle(e => {
      if (e.targetPlanIndex === this.planIndex) {
        this.handleFlightPlanLoaded();
      }
    });
    this.fms.flightPlanner.onEvent('fplUserDataSet').handle(this.handleUserDataSet);
    this.fms.flightPlanner.onEvent('fplUserDataDelete').handle(this.handleUserDataDelete);
    this.fms.flightPlanner.onEvent('fplCalculated').handle(this.handleFlightPlanCalculated);
    this.fms.flightPlanner.onEvent('fplIndexChanged').handle(this.handleFlightPlannerActiveIndexChanged);
    this.fms.flightPlanner.onEvent('fplDirectToDataChanged').handle(this.handleDirectToDataChanged);
    this.fms.flightPlanner.onEvent('fplLegUserDataSet').handle(this.handleLegUserDataChange);
    this.fms.flightPlanner.onEvent('fplLegUserDataDelete').handle(this.handleLegUserDataChange);

    // We do this in case fplProcDetailsChanged is received before the facloader has returned our origin/dest facilities
    this._originFacility.sub(() => this.handleProcDetailsChanged());
    this._destinationFacility.sub(() => this.handleProcDetailsChanged());

    const lnav = this.bus.getSubscriber<LNavDataEvents>();

    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex);

    lnav.on(`lnavdata_dtk_mag${lnavSuffix}`).handle(x => this._activeLegDtkMag.set(x));
    lnav.on(`lnavdata_dtk_true${lnavSuffix}`).handle(x => this._activeLegDtkTrue.set(x));
    lnav.on(`lnavdata_waypoint_distance${lnavSuffix}`).handle(x => this._activeLegDistance.set(x));
    lnav.on(`lnavdata_next_dtk_mag${lnavSuffix}`).handle(x => this._nextLegDtkMag.set(x));

    // We are using the same indicated_alt event that the vnav manager is using
    this.bus.getSubscriber<AdcEvents>().on('indicated_alt').atFrequency(1).handle(alt => this.currentAltitude = alt);

    this.bus.getSubscriber<APEvents>().on('ap_altitude_selected').withPrecision(0).handle(sAlt => this.selectedAltitude = sAlt);

    this.directToState.sub(() => this.updateFromLeg());

    this.activeLegGlobalIndex.sub(() => {
      this.updateActiveLeg();
      this.updateActiveLegListItems();
      this.updateFromLeg();
    });

    this.fms.isPlanActivated.pipe(this._isActivated);
    this._isActivated.sub(this.updateFlightPlanActivation.bind(this), true);

    this.aircraftPosition.sub(this.updateOriginDestDistance.bind(this));
    this.destinationFacility.sub(this.updateOriginDestDistance.bind(this));
    this._activeLegDistance.sub(this.updateDestinationWaypointAlongTrackDistance.bind(this));

    MappedSubject.create(
      this.todDistanceMetres,
      this.todGlobalLegIndex,
      this.groundSpeedKnots,
    ).sub(([todDistanceMetres, todGlobalLegIndex, groundSpeedKnots]) => {
      if (groundSpeedKnots >= FlightPlanStore.MINIMUM_PREDICTION_GROUND_SPEED && todGlobalLegIndex > 0) {
        this._todTimeToGo.set(todDistanceMetres / UnitType.MPS.convertFrom(groundSpeedKnots, UnitType.KNOT), UnitType.SECOND);
      } else {
        this._todTimeToGo.set(NaN);
      }
    });

    this._originFacility.sub(this.onOriginFacilityChanged.bind(this), true);
    this._destinationFacility.sub(this.onDestinationFacilityChanged.bind(this), true);

    this.fuelFlowTotalGph.sub(() => {
      this.updateFuelRemaining();
    });
  }

  /**
   * Handles the leg user data change events
   * @param event The FlightPlanLegUserDataEvent
   */
  private readonly handleLegUserDataChange = (event: FlightPlanLegUserDataEvent): void => {
    if (event.planIndex !== this.planIndex) {
      return;
    }

    const leg = this.legMap.get(event.leg);
    if (!leg) {
      return;
    }
    leg.userDataChanged.notify(undefined, event.key);
  };

  /**
   * Gets the current altitude.
   * @returns The current altitude.
   */
  public getCurrentAltitude(): number {
    return this.currentAltitude;
  }

  /**
   * Gets the selected altitude.
   * @returns The selected altitude.
   */
  public getSelectedAltitude(): number {
    return this.selectedAltitude;
  }

  /**
   * Gets the leg list data items in forward order.
   * @param startIndex The global leg index of the leg with which to start. Defaults to 0.
   * @yields The leg list data items in forward order.
   */
  public *legItems(startIndex?: number): Generator<FlightPlanLegData, void> {
    const plan = this.fms.getFlightPlan(this.planIndex);
    const legs = plan.legs(false, startIndex);

    let next = legs.next();

    while (!next.done) {
      const legItem = this.legMap.get(next.value);
      if (legItem) {
        yield legItem;
      }
      next = legs.next();
    }
  }

  /**
   * A callback fired when a new plan is loaded.
   */
  private handleFlightPlanLoaded(): void {
    for (const [segment, segItem] of this.segmentMap) {
      this.removeSegmentData(segItem, segment.segmentIndex);
    }
    this._segmentMap.clear();

    for (const [, legData] of this.legMap) {
      this.removeLegData(legData);
    }
    this._legMap.clear();

    const plan = this.fms.flightPlanner.getFlightPlan(this.planIndex);

    this.beforeFlightPlanLoaded.notify(undefined, plan);

    this._flightPlanName.set(plan.getUserData('name'));

    if (plan.originAirport !== undefined) {
      this.handleOriginDestChanged({ planIndex: this.planIndex, airportIcao: plan.originAirportIcao, type: OriginDestChangeType.OriginAdded });
    }

    for (let i = 0; i < plan.segmentCount; i++) {
      const segment = plan.getSegment(i);
      this.handleSegmentChange({ planIndex: this.planIndex, segmentIndex: i, segment: segment, type: SegmentEventType.Added }, true);
      for (let l = 0; l < segment.legs.length; l++) {
        this.handleLegChange({
          planIndex: this.planIndex,
          segmentIndex: i, legIndex: l, leg: segment.legs[l], type: LegEventType.Added,
        }, true);
      }
    }

    this.doUpdates();

    this.handleProcDetailsChanged({ planIndex: this.planIndex, details: plan.procedureDetails });

    if (plan.destinationAirport !== undefined) {
      this.handleOriginDestChanged({ planIndex: this.planIndex, airportIcao: plan.destinationAirportIcao, type: OriginDestChangeType.DestinationAdded });
    }

    this.handleActiveLegChange({
      index: plan.activeLateralLeg,
      legIndex: plan.getSegmentLegIndex(plan.activeLateralLeg),
      planIndex: this.planIndex,
      previousLegIndex: -1,
      previousSegmentIndex: -1,
      segmentIndex: plan.getSegmentIndex(plan.activeLateralLeg),
      type: ActiveLegType.Lateral,
    });
  }

  /**
   * Handles the fplUserDataSet event.
   * @param event The FlightPlanUserDataEvent.
   */
  private readonly handleUserDataSet = (event: FlightPlanUserDataEvent): void => {
    if (event.planIndex !== this.planIndex) { return; }

    if (event.key === 'name') {
      this._flightPlanName.set(event.data);
    }
    if (event.key === 'visual_approach') {
      this._visualApproachOneWayRunwayDesignation.set(event.data);
    }
    if (event.key === 'skipCourseReversal') {
      this._skipCourseReversal.set(event.data);
    }
    if (event.key === FmsFplUserDataKey.DtoExistingIsUser) {
      this.isDtoUser.set(!!event.data);
    }
  };

  /**
   * Handles the fplUserDataDelete event.
   * @param event The FlightPlanUserDataEvent.
   */
  private readonly handleUserDataDelete = (event: FlightPlanUserDataEvent): void => {
    if (event.planIndex !== this.planIndex) { return; }

    if (event.key === 'name') {
      this._flightPlanName.set(undefined);
    }
    if (event.key === 'visual_approach') {
      this._visualApproachOneWayRunwayDesignation.set(undefined);
    }
    if (event.key === 'skipCourseReversal') {
      this._skipCourseReversal.set(undefined);
    }
    if (event.key === FmsFplUserDataKey.DtoExistingIsUser) {
      this.isDtoUser.set(false);
    }
  };

  private readonly handleOriginDestChanged = async (event: FlightPlanOriginDestEvent): Promise<void> => {
    if (event.planIndex !== this.planIndex) { return; }

    switch (event.type) {
      case OriginDestChangeType.OriginAdded: {
        this._originIdent.set(event.airportIcao?.ident);
        const fac = event.airportIcao ? await this.fms.facLoader.getFacility(FacilityType.Airport, event.airportIcao) : undefined;
        this._originFacility.set(fac);
        break;
      }
      case OriginDestChangeType.OriginRemoved:
        this._originIdent.set(undefined);
        this._originFacility.set(undefined);
        break;
      case OriginDestChangeType.DestinationAdded: {
        this._destinationIdent.set(event.airportIcao?.ident);
        const fac = event.airportIcao ? await this.fms.facLoader.getFacility(FacilityType.Airport, event.airportIcao) : undefined;
        this._destinationFacility.set(fac);
        break;
      }
      case OriginDestChangeType.DestinationRemoved:
        this._destinationIdent.set(undefined);
        this._destinationFacility.set(undefined);
        break;
    }
  };

  private readonly handleProcDetailsChanged = (event?: FlightPlanProcedureDetailsEvent): void => {
    if (!event) {
      event = this.lastProcDetailsEvent;
    }
    if (!event) { return; }
    if (event.planIndex !== this.planIndex) { return; }
    this.lastProcDetailsEvent = event;

    const plan = this.fms.flightPlanner.getFlightPlan(event.planIndex);

    this._originRunway.set(event.details.originRunway);

    const originFac = this.originFacility.get();

    const departureProcedure = originFac?.departures[event.details.departureIndex] as Procedure | undefined;
    this._departureIndex.set(event.details.departureIndex);
    this._departureProcedure.set(departureProcedure);
    this._departureTransitionIndex.set(event.details.departureTransitionIndex);
    this._departureTransition.set(departureProcedure?.enRouteTransitions[event.details.departureTransitionIndex]);
    this._departureRunwayTransitionIndex.set(event.details.departureRunwayIndex);

    this._destinationRunway.set(event.details.destinationRunway);

    this._arrivalIndex.set(event.details.arrivalIndex);
    this._arrivalTransitionIndex.set(event.details.arrivalTransitionIndex);
    this._arrivalRunwayTransitionIndex.set(event.details.arrivalRunwayTransitionIndex);
    this._arrivalRunway.set(event.details.arrivalRunway);
    this._arrivalFacilityIcao.set(event.details.arrivalFacilityIcao);

    if (event.details.arrivalFacilityIcao) {
      this.fms.facLoader.getFacility(FacilityType.Airport, event.details.arrivalFacilityIcao)
        .then(arrivalFacility => {
          this._arrivalFacility.set(arrivalFacility);
          const arrivalProcedure = arrivalFacility?.arrivals[this._arrivalIndex.get()] as Procedure | undefined;
          this._arrivalProcedure.set(arrivalProcedure);
          this._arrivalTransition.set(arrivalProcedure?.enRouteTransitions[this._arrivalTransitionIndex.get()]);
          this._arrivalRunwayTransition.set(arrivalProcedure?.runwayTransitions[this._arrivalRunwayTransitionIndex.get()]);
        });
    } else {
      this._arrivalFacility.set(undefined);
      this._arrivalProcedure.set(undefined);
      this._arrivalTransition.set(undefined);
      this._arrivalRunwayTransition.set(undefined);
    }

    const destinationFac = this.destinationFacility.get();

    let approachProcedure = undefined;
    if (destinationFac && destinationFac.icao === event.details.approachFacilityIcao) {
      if (event.details.approachIndex >= 0) {
        approachProcedure = destinationFac.approaches[event.details.approachIndex];
      } else if (event.details.destinationRunway) {
        approachProcedure = FmsUtils.buildEmptyVisualApproach(event.details.destinationRunway);
      }
    }

    this._approachProcedure.set(approachProcedure);
    this._approachIndex.set(event.details.approachIndex);
    this._approachTransition.set(approachProcedure?.transitions[this._approachTransitionIndex.get()]);
    this._approachTransitionIndex.set(event.details.approachTransitionIndex);
    this._isApproachLoaded.set(FmsUtils.isApproachLoaded(plan));
  };

  /**
   * Handles the segment event.
   * @param segEvent The segment event.
   * @param noUpdates When true, it will not call the extra update functions.
   * @throws Error when received an unexpected event.
   */
  private readonly handleSegmentChange = (segEvent: FlightPlanSegmentEvent, noUpdates = false): void => {
    if (segEvent.planIndex !== this.planIndex) { return; }

    switch (segEvent.type) {
      case SegmentEventType.Added: this.handleSegmentAdded(segEvent); break;
      case SegmentEventType.Inserted: this.handleSegmentInserted(segEvent); break;
      case SegmentEventType.Removed: this.handleSegmentRemoved(segEvent); break;
      case SegmentEventType.Changed: this.handleSegmentChanged(segEvent); break;
    }

    this.updateSegmentIndexes();

    if (noUpdates) { return; }

    this.doUpdates();
  };

  /**
   * Handles the segment added event.
   * @param segEvent The segment event.
   * @throws Error when the segment being added already exists.
   */
  private handleSegmentAdded(segEvent: FlightPlanSegmentEvent): void {
    if (segEvent.planIndex !== this.planIndex) { return; }

    // In theory, added means append to end of flight plan
    // Is only used when intializing the flight plan, or recreating it after deleting it

    const segment = segEvent.segment!;

    const newSegListItem = new FlightPlanSegmentData(segment, this.planIndex, this, this.fms.getFlightPlan(this.planIndex));

    this._segmentMap.set(segment, newSegListItem);

    this.segmentAdded.notify(undefined, newSegListItem);
  }

  /**
   * Handles the segment inserted event.
   * @param segEvent The segment event.
   */
  private handleSegmentInserted(segEvent: FlightPlanSegmentEvent): void {
    if (segEvent.planIndex !== this.planIndex) { return; }

    const segment = segEvent.segment!;

    const newSegListItem = new FlightPlanSegmentData(segment, this.planIndex, this, this.fms.getFlightPlan(this.planIndex));

    this._segmentMap.set(segment, newSegListItem);

    this.segmentInserted.notify(undefined, newSegListItem);
  }

  /**
   * Handles the segment removed event.
   * @param segEvent The segment event.
   * @throws Error when the segment being removed does not exist.
   */
  private handleSegmentRemoved(segEvent: FlightPlanSegmentEvent): void {
    if (segEvent.planIndex !== this.planIndex) { return; }

    const segmentListItem = this.segmentMap.get(segEvent.segment!)!;
    this.removeSegmentData(segmentListItem, segEvent.segmentIndex);
  }

  /**
   * Removes a segment data and destroys it.
   * @param segmentData The segment data.
   * @param segmentIndex The index of the segment begin removed.
   */
  private removeSegmentData(segmentData: FlightPlanSegmentData, segmentIndex: number): void {
    this._segmentMap.delete(segmentData.segment);

    this.segmentRemoved.notify(undefined, [segmentData, segmentIndex]);

    segmentData.destroy();
  }

  /**
   * Handles the segment changed event.
   * @param segEvent The segment event.
   * @throws Error when the segment being changed does not exist.
   */
  private handleSegmentChanged(segEvent: FlightPlanSegmentEvent): void {
    if (segEvent.planIndex !== this.planIndex) { return; }

    const segmentData = this.segmentMap.get(segEvent.segment!)!;
    segmentData.onAirwayChanged(segEvent.segment?.airway);

    this.segmentChanged.notify(undefined, [segmentData, segEvent.segmentIndex]);
  }

  /** Iterates through the segments and updates their segment indexes. */
  private updateSegmentIndexes(): void {
    for (const [segment, segmentListData] of this.segmentMap) {
      segmentListData.updateSegmentIndex(segment.segmentIndex);
    }
  }

  /**
   * Handles the leg event.
   * @param legEvent The leg event.
   * @param noUpdates When true, it will not call the extra update functions.
   * @throws Error when received an unexpected event.
   */
  private readonly handleLegChange = (legEvent: FlightPlanLegEvent, noUpdates = false): void => {
    if (legEvent.planIndex !== this.planIndex) { return; }

    switch (legEvent.type) {
      case LegEventType.Added: this.handleLegAdded(legEvent); break;
      case LegEventType.Removed: this.handleLegRemoved(legEvent); break;
      case LegEventType.Changed: this.handleLegChanged(legEvent); break;
    }

    if (noUpdates) { return; }

    this.doUpdates();
  };

  /**
   * Handles the leg added event.
   * @param legEvent The leg event.
   */
  private handleLegAdded(legEvent: FlightPlanLegEvent): void {
    if (legEvent.planIndex !== this.planIndex) { return; }

    const { leg, segmentIndex, legIndex } = legEvent;

    const plan = this.fms.getFlightPlan(this.planIndex);
    const globalLegIndex = FmsUtils.getGlobalLegIndex(plan, segmentIndex, legIndex);
    const segment = plan.getSegment(segmentIndex);
    const segmentListData = this.segmentMap.get(segment)!;

    // We want to ensure the actual DIR TO leg for a direct to random is always shown.
    const isDirectToRandom = segment.segmentType === FlightPlanSegmentType.RandomDirectTo && (leg.leg.type === LegType.DF || leg.leg.type === LegType.CF);

    const newLegData = new FlightPlanLegData(this.bus, this.vnavManager, leg, segment, segmentListData, this.planIndex, this, plan, globalLegIndex, isDirectToRandom);

    this._legMap.set(leg, newLegData);

    this.legAdded.notify(undefined, [newLegData, segmentIndex, legIndex]);
  }

  /**
   * Handles the leg removed event.
   * @param legEvent The leg event.
   */
  private handleLegRemoved(legEvent: FlightPlanLegEvent): void {
    if (legEvent.planIndex !== this.planIndex) { return; }

    const legListItem = this.legMap.get(legEvent.leg)!;

    this.removeLegData(legListItem);
  }

  /**
   * Removes a leg data and destroys it.
   * @param legData The leg data.
   */
  private removeLegData(legData: FlightPlanLegData): void {
    this._legMap.delete(legData.leg);

    this.legRemoved.notify(undefined, legData);

    legData.destroy();
  }

  /**
   * Handles the leg changed event. Effectively when the vertical data object on the leg was modified.
   * @param legEvent The leg event.
   */
  private handleLegChanged(legEvent: FlightPlanLegEvent): void {
    if (legEvent.planIndex !== this.planIndex) { return; }

    const legListData = this.legMap.get(legEvent.leg)!;

    legListData.handleLegChanged(legEvent.leg!);
  }

  /**
   * Handles the active leg event.
   * @param activeLegEvent The event.
   */
  private readonly handleActiveLegChange = (activeLegEvent: FlightPlanActiveLegEvent): void => {
    if (activeLegEvent.planIndex !== this.planIndex) { return; }
    if (activeLegEvent.type !== ActiveLegType.Lateral) { return; }

    // We can't use the segment and leg index because the can become out of date
    // TODO Fix active leg change event to send update if seg or leg index changes when global index doesn't
    this._activeLegGlobalIndex.set(activeLegEvent.legIndex < 0 || !this._isActivated.get() ? undefined : activeLegEvent.index);

    this.updateFuelRemaining();
  };

  private readonly updateLegCount = (): void => {
    for (const leg of this.fms.getFlightPlan(this.planIndex).legs()) {
      if (leg) {
        this._isThereAtLeastOneLeg.set(true);
        return;
      }
    }
    this._isThereAtLeastOneLeg.set(false);
  };

  /** Updates flight plan things when segments or legs change. */
  private doUpdates(): void {
    this.updateActiveLeg();
    this.updateActiveLegListItems();
    this.updateLegs();
    this.updateLegCount();
    this.updateFromLeg();
    this.updateFlightPlanActivation();
    this.updateDestinationWaypoint();
    this.updateFuelRemaining();

    this._flightPlanLegsChanged.notify(undefined, this.fms.getFlightPlan(this.planIndex));
  }

  /** Updates the current from leg. */
  private updateFromLeg(): void {
    const plan = this.fms.getFlightPlan(this.planIndex);
    const activeLegGlobalIndex = this.activeLegGlobalIndex.get();

    if (activeLegGlobalIndex === undefined || this.directToState.get() !== DirectToState.NONE) {
      this._fromLeg.set(undefined);
      return;
    }

    const fromLeg = FmsUtils.getFromLegForArrowDisplay(plan, activeLegGlobalIndex);

    // Only set it if we are tracking the leg in our legMap
    // If we don't have it, it's probably during a fpl loaded event and it will get added eventually
    if (fromLeg && this.legMap.has(fromLeg)) {
      this._fromLeg.set(fromLeg);
    } else {
      this._fromLeg.set(undefined);
    }

    this.updateNextLeg();
  }

  /** Updates the leg after the active leg. */
  private updateNextLeg(): void {
    const plan = this.fms.getFlightPlan(this.planIndex);
    const activeLegGlobalIndex = this.activeLegGlobalIndex.get();

    if (activeLegGlobalIndex === undefined) {
      this._nextLegData.set(undefined);
      return;
    }

    const nextLeg = plan.tryGetLeg(activeLegGlobalIndex + 1);

    this._nextLegData.set(nextLeg ? this.legMap.get(nextLeg) : undefined);
  }

  /**
   * Handles the flight plan calculated event.
   * @param event The event.
   */
  private readonly handleFlightPlanCalculated = (event: FlightPlanCalculatedEvent): void => {
    if (event.planIndex !== this.planIndex) { return; }

    let currentSegmentData: FlightPlanSegmentData | undefined;
    let segmentDistanceMeters = 0;
    const usableFuelGal = this.fuelTotalGal.get() - UNUSABLE_FUEL_QUANTITY_GALLONS;
    const fuelFlowTotalGph = this.fuelFlowTotalGph.get();
    const currentGsKnots = this.groundSpeedKnots.get() < FlightPlanStore.MINIMUM_PREDICTION_GROUND_SPEED ? NaN : this.groundSpeedKnots.get();
    const unixSimTimeMs = this.unixSimTime.get();
    const unixSimTimeSeconds = UnitType.MILLISECOND.convertTo(unixSimTimeMs, UnitType.SECOND);
    const utcSeconds = unixSimTimeSeconds % (3600 * 24);
    const toLeg = this.toLeg.get();

    let fuelRemainingGal = usableFuelGal;
    let lastEtaUtcSeconds = utcSeconds;
    let foundActiveLeg = false;
    let cumulativeDistanceMeters = 0;
    let cumulativeTimeEnrouteSeconds = 0;

    // When handling the flight plan calculated event,
    // it's important to not iterate on the plan segments/legs,
    // but to instead keep track of leg reference and just grab from leg.calculated.
    // This is because in rare cases, when getting the calc event,
    // the plan might not match what legs we are tracking.
    for (const item of this.legItems()) {
      if (item.segmentData !== currentSegmentData) {
        if (currentSegmentData) {
          currentSegmentData.distance.set(segmentDistanceMeters, UnitType.METER);
          const segmentEte = FlightPlanPredictorUtils.predictTime(currentGsKnots, UnitType.METER.convertTo(segmentDistanceMeters, UnitType.NMILE));
          currentSegmentData.estimatedTimeEnroute.set(segmentEte, UnitType.SECOND);
          segmentDistanceMeters = 0;
        }
        currentSegmentData = item.segmentData;
      }

      const leg = item.leg;
      const isActiveLeg = item === toLeg;
      if (isActiveLeg) {
        foundActiveLeg = true;
      }

      // Initial DTK
      if (leg.calculated?.startLat !== undefined && leg.calculated?.startLon !== undefined) {
        item.initialDtk.set(leg.calculated.initialDtk ?? NaN, MagVar.get(leg.calculated.startLat, leg.calculated.startLon));
      } else {
        item.initialDtk.set(NaN);
      }

      if (leg.calculated) {
        item.courseMagVar.set(leg.calculated.courseMagVar);
      }

      // Distance
      // If behind active leg, set to NaN, which will cause ete, eta, and fuel to be NaN, which is what we want
      const legDistanceMeters = isActiveLeg
        ? this.activeLegDistance.get().asUnit(UnitType.METER)
        : !foundActiveLeg
          ? NaN
          : leg.calculated?.distance ?? NaN;
      const legDistanceNm = UnitType.METER.convertTo(legDistanceMeters, UnitType.NMILE);
      item.distance.set(legDistanceMeters);

      const cumulativeDistanceLegMeters = cumulativeDistanceMeters + legDistanceMeters;
      if (!isNaN(legDistanceMeters)) {
        cumulativeDistanceMeters += legDistanceMeters;
      }
      item.distanceCumulative.set(UnitType.METER.createNumber(cumulativeDistanceLegMeters));

      // ETE
      const estimatedTimeEnrouteSeconds = FlightPlanPredictorUtils.predictTime(currentGsKnots, legDistanceNm);
      item.estimatedTimeEnroute.set(UnitType.SECOND.createNumber(estimatedTimeEnrouteSeconds));

      const cumulativeTimeLegSeconds = cumulativeTimeEnrouteSeconds + estimatedTimeEnrouteSeconds;
      if (!isNaN(estimatedTimeEnrouteSeconds)) {
        cumulativeTimeEnrouteSeconds += estimatedTimeEnrouteSeconds;
      }
      item.estimatedTimeEnrouteCumulative.set(UnitType.SECOND.createNumber(cumulativeTimeLegSeconds));

      // ETA
      const timeToDistanceSeconds = FlightPlanPredictorUtils.predictTime(currentGsKnots, legDistanceNm);
      const etaSeconds = lastEtaUtcSeconds + timeToDistanceSeconds;
      if (!isNaN(etaSeconds)) {
        lastEtaUtcSeconds = etaSeconds;
      }
      const estimatedTimeOfArrival = UnitType.SECOND.convertTo(etaSeconds, UnitType.MILLISECOND);
      item.estimatedTimeOfArrival.set(estimatedTimeOfArrival);

      // Fuel REM
      if (!isNaN(fuelFlowTotalGph) && !isNaN(fuelRemainingGal) && fuelRemainingGal > 0 && fuelFlowTotalGph > 0) {
        const fuelUsedForLeg = fuelFlowTotalGph * (estimatedTimeEnrouteSeconds / 60 / 60);
        const newFuelRemainingGal = fuelRemainingGal - fuelUsedForLeg;
        if (!isNaN(newFuelRemainingGal)) {
          fuelRemainingGal = newFuelRemainingGal;
        }
        item.fuelRemaining.set(UnitType.GALLON_FUEL.createNumber(newFuelRemainingGal));
      }

      segmentDistanceMeters += leg.calculated?.distance ?? 0;
    }

    // Set the segment distance for the last segment
    currentSegmentData?.distance.set(segmentDistanceMeters, UnitType.METER);
    const segmentEte = FlightPlanPredictorUtils.predictTime(currentGsKnots, UnitType.METER.convertTo(segmentDistanceMeters, UnitType.NMILE));
    currentSegmentData?.estimatedTimeEnroute.set(segmentEte, UnitType.SECOND);

    this.updateDestinationWaypointAlongTrackDistance();
  };

  /**
   * Handles the vnav path calculated event.
   * @param verticalPathCalculator VNavPathCalculator.
   * @param verticalPlanIndex The vertical plan index.
   */
  private readonly handleVnavPathCalculated = (verticalPathCalculator: VNavPathCalculator, verticalPlanIndex: number): void => {
    if (verticalPlanIndex !== this.planIndex) { return; }

    const lateralPlan = this.fms.getFlightPlan(this.planIndex);
    const verticalPlan = verticalPathCalculator.getVerticalFlightPlan(this.planIndex);
    const verticalSegments = VNavUtils.getVerticalSegmentsFromPlan(verticalPlan);

    let maxAltitudeMeters = UnitType.FOOT.convertTo(Math.max(this.getSelectedAltitude(), Math.round(this.getCurrentAltitude() / 100) * 100), UnitType.METER);
    let minAltitudeMeters = verticalPathCalculator.getFirstDescentConstraintAltitude(this.planIndex);

    for (const item of this.legItems()) {
      const indexes = FmsUtils.getLegIndexes(lateralPlan, item.leg);
      if (!indexes) { return; }

      const vnavLeg = verticalSegments[indexes.segmentIndex].legs[indexes.segmentLegIndex];

      if (item.leg === this.directToExistingLeg.get()) {
        const hiddenDirectToVnavLeg = VNavUtils.getVerticalLegFromPlan(verticalPlan, lateralPlan.activeLateralLeg);
        this.updateLegVnavData(item, vnavLeg, minAltitudeMeters, maxAltitudeMeters, hiddenDirectToVnavLeg);
      } else {
        this.updateLegVnavData(item, vnavLeg, minAltitudeMeters, maxAltitudeMeters);
      }

      if (!vnavLeg.isAdvisory) {
        maxAltitudeMeters = vnavLeg.altitude;
        minAltitudeMeters = 0;
      }
    }
  };

  /**
   * Updates leg list item vnav related fields.
   * @param item The leg list item.
   * @param vnavLeg The vnav leg.
   * @param minAltitude The min altitude.
   * @param maxAltitude The max altitude.
   * @param directToVnavLeg The direct to vnav leg, if applicable.
   */
  private updateLegVnavData(
    item: FlightPlanLegData,
    vnavLeg: VNavLeg,
    minAltitude: number | undefined,
    maxAltitude: number,
    directToVnavLeg?: VNavLeg,
  ): void {
    // Default advisory altitude to the vnav leg altitude
    let advisoryAltitude = directToVnavLeg?.altitude ?? vnavLeg.altitude;
    const isAdvisory = directToVnavLeg?.isAdvisory ?? vnavLeg.isAdvisory;

    // If advisory, applies the min and max altitudes
    if (advisoryAltitude !== 0 && isAdvisory && advisoryAltitude > maxAltitude) {
      advisoryAltitude = minAltitude !== undefined ? Math.max(minAltitude, maxAltitude) : maxAltitude;
    }

    const hasPublishedConstraint = item.leg.leg.altDesc !== AltitudeRestrictionType.Unused;

    // Advisory altitude
    if (!hasPublishedConstraint && isAdvisory && advisoryAltitude > 0 && item.vnavPhase.get() === VerticalFlightPhase.Descent) {
      item.altDesc.set(AltitudeRestrictionType.Unused);
      item.altitude1.set(advisoryAltitude, UnitType.METER);
      item.altitude2.set(NaN, UnitType.METER);
      item.displayAltitude1AsFlightLevel.set(FmsUtils.displayAltitudeAsFlightLevel(this.bus, advisoryAltitude, item.vnavPhase.get()));
      item.displayAltitude2AsFlightLevel.set(false);
      item.isAltitudeEdited.set(false);
    } else {
      item.updateLegListDataAltitudeStuffFromVerticalData();
    }

    // FPA
    if (hasPublishedConstraint && item.leg.verticalData.fpa === undefined) {
      item.fpa.set(directToVnavLeg?.fpa ?? vnavLeg.fpa);
    }

    // Altitude constraint invalid
    // We don't care about the directToVnavLeg here because invalid only applies to designated constraints
    item.isAltitudeInvalid.set(vnavLeg.invalidConstraintAltitude !== undefined);
  }

  /**
   * Handles the fplIndexChanged event.
   * @param event FlightPlanIndicationEvent.
   */
  private readonly handleFlightPlannerActiveIndexChanged = (event: FlightPlanIndicationEvent): void => {
    if (event.planIndex !== Fms.PRIMARY_PLAN_INDEX) {
      console.error('This should probably never happen for the IFD.');
    }
    this._activePlanIndex.set(event.planIndex);
  };

  /**
   * Handles the fplDirectToDataChanged event.
   * @param event FlightPlanDirectToDataEvent.
   */
  private readonly handleDirectToDataChanged = (event: FlightPlanDirectToDataEvent): void => {
    if (event.planIndex !== this.planIndex) { return; }

    this._directToData.set({ ...event.directToData });
  };

  /** Updates the active leg subject. */
  private updateActiveLeg(): void {
    const activeLegGlobalIndex = this.activeLegGlobalIndex.get();

    if (activeLegGlobalIndex === undefined || activeLegGlobalIndex < 0) {
      this._activeLeg.set(undefined);
      this._activeLegData.set(undefined);
      this._activeLegSegmentIndex.set(undefined);
      this._activeLegSegmentType.set(undefined);
      return;
    }

    const plan = this.fms.getFlightPlan(this.planIndex);
    const activeLeg = plan.tryGetLeg(activeLegGlobalIndex);

    this._activeLeg.set(activeLeg ?? undefined);
    this._activeLegData.set(activeLeg ? this.legMap.get(activeLeg) : undefined);
    this._activeLegSegmentIndex.set(activeLeg ? plan.getSegmentIndex(activeLegGlobalIndex) : undefined);
    this._activeLegSegmentType.set(activeLeg ? plan.getSegmentFromLeg(activeLeg)?.segmentType : undefined);
  }

  /**
   * Iterates through the legs in the list, updating their active leg subjects.
   * @throws Error when segment or leg cannot be found, or if something else went wrong.
   */
  private updateActiveLegListItems(): void {
    if (!this.fms.hasFlightPlan(this.planIndex)) {
      return;
    }

    const toLeg = this.toLeg.get()?.leg;
    const plan = this.fms.getFlightPlan(this.planIndex);
    const indexes = toLeg && FmsUtils.getLegIndexes(plan, toLeg);

    if (toLeg === undefined || indexes === undefined) {
      for (const item of this.legItems()) {
        item.isActiveLeg.set(false);
        item.isBehindActiveLeg.set(false);
      }
      return;
    }

    const activeLegSegmentIndex = indexes.segmentIndex;
    const activeLegSegmentLegIndex = indexes.segmentLegIndex;

    for (const item of this.legItems()) {
      // We don't care about legs that will never be visible
      if (item.isVisibleLegType === false) { continue; }

      const isActiveLeg = item.leg === toLeg;
      item.isActiveLeg.set(isActiveLeg);

      const segmentIndex = item.segment.segmentIndex;
      const segmentLegIndex = item.segment.legs.indexOf(item.leg);

      const isBehindActiveLeg = segmentIndex < activeLegSegmentIndex
        ? true
        : segmentIndex === activeLegSegmentIndex
          ? segmentLegIndex < activeLegSegmentLegIndex
            ? true
            : false
          : false;

      item.isBehindActiveLeg.set(!isActiveLeg && isBehindActiveLeg);
    }
  }

  /** Updates leg data. */
  private updateLegs(): void {
    const plan = this.fms.getFlightPlan(this.planIndex);

    for (const item of this.legItems()) {
      const globalLegIndex = plan.getLegIndexFromLeg(item.leg);
      item.updateLegPosition(globalLegIndex);
    }
  }

  /**
   * Updates when the flight plan activation state changes.
   */
  private updateFlightPlanActivation(): void {
    this._canActivate.set(this.fms.canActivatePrimaryFlightPlan());

    let activeLegIndex: number | undefined;
    if (this.fms.hasFlightPlan(this.planIndex) && this._isActivated.get()) {
      const plan = this.fms.getFlightPlan(this.planIndex);
      activeLegIndex = plan.activeLateralLeg;
    }
    this._activeLegGlobalIndex.set(activeLegIndex);
  }

  /** Updates the origin and destination bearings and distances. */
  private updateOriginDestDistance(): void {
    const rawPos = this.aircraftPosition.get();
    const position = FlightPlanStore.geoPointCache.set(rawPos.lat, rawPos.long);
    const isPositionValid = isFinite(position.lat) && isFinite(position.lon);

    if (isPositionValid) {
      this.aircraftNavAngleMagneticUnit.setMagVarFromLocation(position);
      this.aircraftNavAngleTrueUnit.setMagVarFromLocation(position);
    }

    const originFacility = this.originFacility.get();
    if (isPositionValid && originFacility !== undefined) {
      this._originBearing.set(MathUtils.round(position.bearingTo(originFacility), FlightPlanStore.DISTANCE_QUANTUM_DEG), this.aircraftNavAngleTrueUnit);
      this._originDistance.set(MathUtils.round(position.distance(originFacility), FlightPlanStore.DISTANCE_QUANTUM_GA), UnitType.GA_RADIAN);
    } else {
      this._originBearing.set(NaN);
      this._originDistance.set(NaN);
    }

    const destinationFacility = this.destinationFacility.get();
    if (isPositionValid && destinationFacility !== undefined) {
      this._destinationBearing.set(MathUtils.round(position.bearingTo(destinationFacility), FlightPlanStore.DISTANCE_QUANTUM_DEG), this.aircraftNavAngleTrueUnit);
      this._destinationDistance.set(MathUtils.round(position.distance(destinationFacility), FlightPlanStore.DISTANCE_QUANTUM_GA), UnitType.GA_RADIAN);
    } else {
      this._destinationBearing.set(NaN);
      this._destinationDistance.set(NaN);
    }

    if (isPositionValid && this.destinationWaypointLocation.isValid()) {
      this._destinationWaypointDirectBearing.set(MathUtils.round(position.bearingTo(this.destinationWaypointLocation), FlightPlanStore.DISTANCE_QUANTUM_DEG), this.aircraftNavAngleTrueUnit);
      this._destinationWaypointDirectDistance.set(MathUtils.round(position.distance(this.destinationWaypointLocation), FlightPlanStore.DISTANCE_QUANTUM_GA), UnitType.GA_RADIAN);
    } else {
      this._destinationWaypointDirectBearing.set(NaN);
      this._destinationWaypointDirectDistance.set(NaN);
    }
  }

  /**
   * Updates the remaining fuel along the flight plan.
   */
  private updateFuelRemaining(): void {
    const fuelTotalGal = this.fuelTotalGal.get() - UNUSABLE_FUEL_QUANTITY_GALLONS;
    const fuelFlowTotalGph = this.fuelFlowTotalGph.get();

    let remainingFuelGal = fuelTotalGal;

    const activeLegIndex = this.activeLegGlobalIndex.get() ?? 0;
    let index = 0;

    for (const item of this.legItems()) {
      if (index < activeLegIndex) {
        index++;
        continue;
      }

      const estimatedTimeEnrouteSeconds = item.estimatedTimeEnroute.get().asUnit(UnitType.SECOND);
      if (isNaN(estimatedTimeEnrouteSeconds)) {
        continue;
      }
      const fuelUsedForLeg = fuelFlowTotalGph * (estimatedTimeEnrouteSeconds / 60 / 60);
      remainingFuelGal -= fuelUsedForLeg;
      item.fuelRemaining.set(UnitType.GALLON_FUEL.createNumber(remainingFuelGal));
      index++;
    }
  }

  /**
   * Finds the destination waypoint in the plan.
   * @param plan The flight plan to use.
   * @returns The global leg index of the destination waypoint, or undefined if there is none.
   */
  private findDestinationWaypoint(plan: FlightPlan): number | undefined {
    const destinationFacility = this.destinationFacility.get();
    if (destinationFacility) {
      for (let globalLegIndex = plan.length - 1; globalLegIndex >= 0; globalLegIndex--) {
        if (ICAO.valueEquals(destinationFacility.icaoStruct, plan.getLeg(globalLegIndex).leg.fixIcaoStruct)) {
          return globalLegIndex;
        }
      }
    }

    for (let globalLegIndex = plan.length - 1; globalLegIndex >= 0; globalLegIndex--) {
      const planLeg = plan.getLeg(globalLegIndex);
      if (FlightPlanUtils.isToFixLeg(planLeg.leg.type) && ICAO.isValueFacility(planLeg.leg.fixIcaoStruct) && plan.getSegmentFromLeg(planLeg)?.segmentType !== FlightPlanSegmentType.Origin) {
        return globalLegIndex;
      }
    }
  }

  /**
   * Updates the destination waypoint.
   */
  private async updateDestinationWaypoint(): Promise<void> {
    const plan = this.fms.getFlightPlan(this.planIndex);

    const globalLegIndex = this.findDestinationWaypoint(plan);
    if (globalLegIndex !== undefined) {
      const planLeg = plan.getLeg(globalLegIndex);
      const destinationFacility = await this.fms.facLoader.getFacility(ICAO.getFacilityTypeFromValue(planLeg.leg.fixIcaoStruct), planLeg.leg.fixIcaoStruct, 0);

      this._destinationWaypointLegData.set(this._legMap.get(planLeg));

      this.destinationWaypointGlobalLegIndex = globalLegIndex;
      this.destinationWaypointLocation.set(destinationFacility);
      this._destinationWaypointIdent.set(destinationFacility.icaoStruct.type === 'R' ? destinationFacility.icaoStruct.airport : destinationFacility.icaoStruct.ident);
    } else {
      this.destinationWaypointGlobalLegIndex = undefined;
      this.destinationWaypointLocation.set(NaN, NaN);
      this._destinationWaypointIdent.set(undefined);
      this._destinationWaypointLegData.set(undefined);
    }

    this.updateDestinationWaypointAlongTrackDistance();
    this.updateOriginDestDistance();
  }

  /**
   * Updates the along track distance to the destination waypoint.
   */
  private updateDestinationWaypointAlongTrackDistance(): void {
    if (this.destinationWaypointGlobalLegIndex === undefined || !this._isActivated.get()) {
      this._destinationWaypointAlongTrackDistance.set(NaN);
      return;
    }

    const plan = this.fms.getFlightPlan(this.planIndex);

    if (this.destinationWaypointGlobalLegIndex < plan.activeLateralLeg) {
      this._destinationWaypointAlongTrackDistance.set(NaN);
      return;
    }

    if (this.destinationWaypointGlobalLegIndex === plan.activeLateralLeg) {
      this._destinationWaypointAlongTrackDistance.set(this._activeLegDistance.get());
      return;
    }

    const destLeg = this.destinationWaypointGlobalLegIndex !== undefined ? plan.tryGetLeg(this.destinationWaypointGlobalLegIndex) : null;
    const activeLeg = plan.tryGetLeg(plan.activeLateralLeg);
    if (destLeg === null || destLeg.calculated === undefined || activeLeg === null || activeLeg.calculated === undefined) {
      this._destinationWaypointAlongTrackDistance.set(NaN);
      return;
    }

    this._destinationWaypointAlongTrackDistance.set(MathUtils.round(
      destLeg.calculated.cumulativeDistance - activeLeg.calculated.cumulativeDistance + this._activeLegDistance.get().asUnit(UnitType.METER),
      FlightPlanStore.DISTANCE_QUANTUM_METER
    ), UnitType.METER);
  }

  private originChartOpId = 0;

  /**
   * Handles changes in the origin airport.
   * @param facility The origin facility, or undefined if none.
   */
  private async onOriginFacilityChanged(facility: AirportFacility | undefined): Promise<void> {
    this.updateOriginDestDistance();

    this._originChart.set(undefined);

    if (facility) {
      const opId = ++this.originChartOpId;
      try {
        const airportCharts = await this.chartsManager.getChartsForAirport(facility.icaoStruct);
        if (this.originChartOpId === opId) {
          this._originChart.set(this.chartsManager.getPrimaryAirportChart(airportCharts));
        }
      } catch (e: any) {
        console.warn('[FlightPlanStore::onOriginFacilityChanged] Failed to get airport charts', ChartServiceErrorCode[e] ?? e);
      }
    }
  }

  private destinationChartOpId = 0;

  /**
   * Handles changes in the destination airport.
   * @param facility The destination facility, or undefined if none.
   */
  private async onDestinationFacilityChanged(facility: AirportFacility | undefined): Promise<void> {
    this.updateOriginDestDistance();

    this._destinationChart.set(undefined);

    if (facility) {
      const opId = ++this.destinationChartOpId;
      try {
        const airportCharts = await this.chartsManager.getChartsForAirport(facility.icaoStruct);
        if (this.destinationChartOpId === opId) {
          this._destinationChart.set(this.chartsManager.getPrimaryAirportChart(airportCharts));
        }
      } catch (e: any) {
        console.warn('[FlightPlanStore::onDestinationFacilityChanged] Failed to get airport charts', ChartServiceErrorCode[e] ?? e);
      }
    }
  }
}

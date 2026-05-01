/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  AltitudeRestrictionType, BasicNavAngleSubject, BasicNavAngleUnit, BitFlags, EventBus, FacilityType, FlightPlan, FlightPlanSegment, FlightPlanSegmentType,
  FlightPlanUtils, FSComponent, ICAO, LegDefinition, LegDefinitionFlags, LegType, MagVar, MappedSubject, NavMath, NumberUnitSubject, SpeedRestrictionType,
  SpeedUnit, SubEvent, Subject, Subscribable, SubscribableUtils, Subscription, UnitType, VerticalFlightPhase
} from '@microsoft/msfs-sdk';

import { FmsUtils } from '../Fms';
import { IfdVnavManager } from '../Navigation/Vnav/IfdVnavManager';
import { IfdVNavUtils } from '../Navigation/Vnav/IfdVNavUtils';
import { FplCursor } from '../Pages/FmsPage/FplTab/Components/FplCursor';
import { FmsUserSettings } from '../Settings/FmsUserSettings';
import { UnitsUserSettingManager } from '../Settings/UnitsUserSettings';
import { FlightPlanBaseData, FlightPlanBaseListData } from './FlightPlanDataTypes';
import { FlightPlanSegmentData, FlightPlanSegmentListData } from './FlightPlanSegmentListData';
import { FlightPlanStore } from './FlightPlanStore';

export enum LegBlockHeight {
  Origin = 106,
  Destination = 101,
  Discontinuity = 32,
  Hold = 88,
  Default = 76,
  Mini = 43
}

/**
 * Represents a flight plan leg in a list.
 * Wraps a {@link FlightPlanLegData} object.
 * Contains fields specific to flight plan lists.
 */
export class FlightPlanLegListData implements FlightPlanBaseListData {
  /** @inheritdoc */
  public readonly type = 'leg';

  /** A reference to the cursor item after this block, if it exists (make sure to use getOrDefault rather than instance when acessing it) */
  public readonly cursorAfterRef = FSComponent.createRef<FplCursor>();

  private readonly _isVisible = Subject.create(true);
  public readonly isVisible = this._isVisible as Subscribable<boolean>;

  public readonly isAltitudeFieldSelected = Subject.create(false);

  public readonly isAirport = ICAO.isValueFacility(this.legData.leg.leg.fixIcaoStruct, FacilityType.Airport);
  public readonly isRunway = ICAO.isValueFacility(this.legData.leg.leg.fixIcaoStruct, FacilityType.RWY);
  public readonly isOriginLeg = this.legData.segment.segmentType === FlightPlanSegmentType.Origin && (this.isAirport || this.isRunway);
  public readonly isDestinationLeg = this.legData.segment.segmentType === FlightPlanSegmentType.Destination && (this.isAirport || this.isRunway);
  public readonly isHoldLeg = FlightPlanUtils.isHoldLeg(this.legData.leg.leg.type);

  private readonly fmsSettings = FmsUserSettings.getManager(this.bus);
  private readonly miniFplFormat = this.fmsSettings.getSetting('miniFlightPlanFormat');

  /** Is meant to be controlled by the display component. */
  public readonly isSelected = Subject.create(false);

  /** These are the full heights of the different type of leg blocks. */
  public readonly initialHeight = this.isOriginLeg
    ? LegBlockHeight.Origin
    : this.isDestinationLeg
      ? LegBlockHeight.Destination
      : this.legData.isDiscontinuity
        ? LegBlockHeight.Discontinuity
        : this.isHoldLeg
          ? LegBlockHeight.Hold
          : LegBlockHeight.Default;

  private readonly _heightPx = MappedSubject.create(([isMini, isVisibleCollapsedLeg, isSelected]) => {
    return isMini && !isSelected
      ? LegBlockHeight.Mini
      : isVisibleCollapsedLeg && this.isHoldLeg
        ? LegBlockHeight.Default
        : this.initialHeight;
  }, this.miniFplFormat, this.legData.isVisibleCollapsedLeg, this.isSelected);
  /** The blocks initial height */
  public heightPx = this._heightPx as Subscribable<number>;

  /** Whether this leg is the first visible leg in a segment. */
  public readonly isFirstVisibleLegInSegment = Subject.create(false);

  /** The leg DTK for displaying in certain places like the flight plan page.
   * Changes when this is the active leg and stuff like that. */
  public readonly displayDtk = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));
  private readonly displayDtkSubs = [] as Subscription[];


  /** The leg distance, but meant for display in a list. Can change when active leg, and more. */
  public readonly displayDistance = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));
  private readonly displayDistanceSubs = [] as Subscription[];

  /** Estimated time Enroute of the leg, in seconds duration. How long it will take to fly the leg/ */
  public readonly displayEte = NumberUnitSubject.create(UnitType.SECOND.createNumber(NaN));
  private readonly eteSubs = [] as Subscription[];

  private readonly subs = [] as Subscription[];

  /**
   * FlightPlanLegListData constructor.
   * @param legData The flight plan leg data to wrap.
   * @param segmentListData The segment list data that this leg belongs to.
   * @param store The flight plan store this belongs to.
   * @param unitsSettingManager The units setting manager.
   * @param bus The EventBus
   */
  public constructor(
    public readonly legData: FlightPlanLegData,
    public readonly segmentListData: FlightPlanSegmentListData,
    private readonly store: FlightPlanStore,
    private readonly unitsSettingManager: UnitsUserSettingManager,
    private readonly bus: EventBus
  ) {
    this.subs.push(this.legData.isActiveLeg.sub(() => this.updateVisibility()));
    this.subs.push(this.store.fromLeg.sub(() => this.updateVisibility()));
    this.subs.push(this.store.activeLeg.sub(() => this.updateVisibility()));
    this.subs.push(this.legData.globalLegIndex.sub(() => this.updateVisibility()));
    this.subs.push(this.store.activeLegGlobalIndex.sub(() => this.updateVisibility()));
    this.subs.push(this.legData.isLastLegInSegment.sub(() => this.updateVisibility()));
    this.subs.push(this.store.viewMode.sub(() => this.updateVisibility()));
    this.subs.push(this.legData.isInActiveSegment.sub(() => this.updateVisibility()));
    this.updateVisibility();

    this.subs.push(this.unitsSettingManager.navAngleUnits.sub(this.updateDisplayDtkSubs.bind(this)));
    this.subs.push(legData.isActiveLeg.sub(this.updateDisplayDtkSubs.bind(this)));
    this.subs.push(legData.isBehindActiveLeg.sub(this.updateDisplayDtkSubs.bind(this)));
    this.updateDisplayDtkSubs();

    this.subs.push(legData.isActiveLeg.sub(this.updateDistanceSubs));
    this.subs.push(legData.isBehindActiveLeg.sub(this.updateDistanceSubs));
    this.updateDistanceSubs();

    this.updateEteSubs();
  }

  /** Updates the leg's visibility. */
  private updateVisibility(): void {
    this._isVisible.set(this.getVisibility());
  }

  /**
   * Updates the leg's visibility.
   * @returns Whether the leg should be visible or not. */
  private getVisibility(): boolean {
    // If this is false, the leg should never be visible
    if (this.legData.isVisibleLegType === false) {
      return false;
    }

    if (this.store.viewMode.get() === 'compact') {
      if (this.isOriginLeg || this.isDestinationLeg || this.legData.isDiscontinuity) {
        return true;
      }
      if (this.legData.isLastLegInSegment.get()) {
        return true;
      }
      if (this.legData.isInActiveSegment.get()) {
        return true;
      }
      if (this.segmentListData.segmentData.segment.segmentType === FlightPlanSegmentType.Enroute) {
        if (this.segmentListData.segmentData.isAirway.get() === false) {
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /** Updates the data source for the display dtk. */
  private updateDisplayDtkSubs(): void {
    const { legData } = this;

    this.displayDtkSubs.forEach(sub => sub.destroy());

    const isActiveLeg = legData.isActiveLeg.get();
    const isBehindActiveLeg = legData.isBehindActiveLeg.get();
    const navAngleUnits = this.unitsSettingManager.navAngleUnits.get();

    if (isBehindActiveLeg) {
      this.displayDtk.set(NaN);
    } else if (legData.isHeadingLeg) {
      this.displayDtk.set(NaN);
    } else if (isActiveLeg) {
      if (navAngleUnits.isMagnetic()) {
        this.displayDtkSubs.push(this.store.activeLegDtkMag.sub(x => this.displayDtk.set(x.number, legData.initialDtk.get().unit.magVar), true));
        this.displayDtkSubs.push(legData.initialDtk.sub(x => this.displayDtk.set(this.displayDtk.get().number, x.unit.magVar), true));
      } else {
        this.displayDtkSubs.push(this.store.activeLegDtkTrue.sub(x => this.displayDtk.set(x), true));
      }
    } else {
      this.displayDtkSubs.push(legData.initialDtk.pipe(this.displayDtk));
    }
  }

  private readonly updateDistanceSubs = (): void => {
    const { legData } = this;

    this.displayDistanceSubs.forEach(sub => sub.destroy());

    const isActiveLeg = legData.isActiveLeg.get();
    const isBehindActiveLeg = legData.isBehindActiveLeg.get();

    if (isBehindActiveLeg) {
      this.displayDistance.set(NaN);
    } else if (legData.isHoldLeg) {
      this.displayDistance.set(NaN);
    } else if (isActiveLeg) {
      this.displayDistanceSubs.push(this.store.activeLegDistance.pipe(this.displayDistance));
    } else {
      this.displayDistanceSubs.push(legData.distance.pipe(this.displayDistance));
    }
  };

  private readonly updateEteSubs = (): void => {
    const { legData } = this;

    this.eteSubs.forEach(sub => sub.destroy());

    this.eteSubs.push(legData.estimatedTimeEnroute.pipe(this.displayEte));
  };

  /** Call when this leg is removed from the list. */
  public destroy(): void {
    this.subs.forEach(x => x.destroy());
    this.displayDtkSubs.forEach(sub => sub.destroy());
    this.displayDistanceSubs.forEach(sub => sub.destroy());
    this.eteSubs.forEach(sub => sub.destroy());
    this._heightPx.destroy();
  }
}

/**
 * Represents a flight plan leg data object.
 * It stores lots of useful info about the leg in handy dandy subscribables.
 */
export class FlightPlanLegData implements FlightPlanBaseData {
  /** @inheritdoc */
  public readonly type = 'leg';

  /** Whether this leg's flags and leg type allow for the leg to be visible. */
  public readonly isVisibleLegType = this.isDirectToRandom
    ? true
    : BitFlags.isAny(this.leg.flags, LegDefinitionFlags.DirectTo) ?
      false
      : FlightPlanUtils.isDiscontinuityLeg(this.leg.leg.type)
        ? true
        : BitFlags.isAny(this.leg.flags, LegDefinitionFlags.VectorsToFinal)
          ? false
          : true;

  /** The global index of this leg. */
  public readonly globalLegIndex = Subject.create(-1);

  /** The index of this leg in its segment. */
  public readonly segmentLegIndex = Subject.create(-1);

  /** Whether this leg is the first leg in its segment. */
  public readonly isFirstLegInSegment = this.segmentLegIndex.map(x => x === 0);

  private readonly _isLastLegInSegment = Subject.create(false);
  /** Whether this leg is the first leg in its segment. */
  public readonly isLastLegInSegment = this._isLastLegInSegment as Subscribable<boolean>;

  /** Whether this leg is in the same segment as the plan's active leg. */
  public readonly isInActiveSegment = this.segmentData.isActiveSegment;

  /** Whether this leg is in the departure segment. */
  public readonly isInDepartureSegment = this.segment.segmentType === FlightPlanSegmentType.Departure;

  /** Whether this leg is in the arrival segment. */
  public readonly isInArrivalSegment = this.segment.segmentType === FlightPlanSegmentType.Arrival;

  /** Whether this leg is in the approach segment. */
  public readonly isInApproachSegment = this.segment.segmentType === FlightPlanSegmentType.Approach;

  /** Whether this leg is in the missed approach. */
  public readonly isInMissedApproach = this.segment.segmentType === FlightPlanSegmentType.MissedApproach;

  /** Whether this leg is in a procedure segment. */
  public readonly isInProcedureSegment = this.isInDepartureSegment
    || this.isInArrivalSegment || this.isInApproachSegment || this.isInMissedApproach;

  /** Whether this leg is a runway. */
  public readonly isRunway = ICAO.isFacility(this.leg.leg.fixIcao, FacilityType.RWY);

  /** Whether this leg is a runway in the approach segment. */
  public readonly isApproachRunwayLeg = this.isInApproachSegment && this.isRunway;

  /** Whether this leg is in an airway segment. */
  public readonly isInAirwaySegment = this.segmentData?.isAirway ?? Subject.create(false) as Subscribable<boolean>;

  /** Whether this is currently the first leg in the plan. */
  public readonly isFirstLegInPlan = Subject.create(false);

  /** Whether this is the active leg in the flight plan. */
  public readonly isActiveLeg = Subject.create(false);

  /** Whether this leg is before the active leg. */
  public readonly isBehindActiveLeg = Subject.create(false);

  /** Whether this is a direct to leg. */
  public readonly isDtoLeg = this.store.directToExistingLeg.map(x => x === this.leg);

  /**
   * Whether this leg is the target of a user-initiated dto from the direct to dialog.
   * A special icon is shown on this leg.
   */
  public readonly isUserDtoLeg = this.isDirectToRandom ? Subject.create(true) : this.store.directToExistingUserLeg.map((x) => x === this.leg);

  /** Whether this is a discontinuity leg. */
  public readonly isDiscontinuity = FlightPlanUtils.isDiscontinuityLeg(this.leg.leg.type);

  /**
   * Whether this leg is eligible for a vertical direct to.
   * Does not include the following conditions:
   * - An altitude field is selected in the leg block.
   */
  public readonly isVerticalDirectToEligible = Subject.create(false);

  private readonly _isVisibleCollapsedLeg = MappedSubject.create(([viewMode, isLastLegInSegment, isInActiveSegment, isInAirwaySegment]) => {
    return viewMode == 'compact' && !isInActiveSegment && isLastLegInSegment && (this.isInProcedureSegment || isInAirwaySegment);
  }, this.store.viewMode, this.isLastLegInSegment, this.isInActiveSegment, this.isInAirwaySegment);
  /** Is true when this leg is visible as a collapsed leg in compact view mode. */
  public readonly isVisibleCollapsedLeg = this._isVisibleCollapsedLeg as Subscribable<boolean>;

  // Leg type info

  public readonly isHoldLeg = FlightPlanUtils.isHoldLeg(this.leg.leg.type);

  public readonly isHoldInLieuOfProcedureTurn = this.leg.leg.type === LegType.HF;

  public readonly isHeadingLeg = FlightPlanUtils.isHeadingToLeg(this.leg.leg.type);

  // Altitude constraint

  /** The altitude restriction type to use for the altitude constraint. */
  public readonly altDesc = Subject.create(AltitudeRestrictionType.Unused);

  /** The altitude 1 to use for the altitude constraint. */
  public readonly altitude1 = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  /** The altitude 2 to use for the altitude constraint. */
  public readonly altitude2 = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  /** Whether the altitude 1 should be displayed as a flight level. */
  public readonly displayAltitude1AsFlightLevel = Subject.create(false);

  /** Whether the altitude 2 should be displayed as a flight level. */
  public readonly displayAltitude2AsFlightLevel = Subject.create(false);

  /** Whether this leg's altitude constraint is different from the published constraint. */
  public readonly isAltitudeEdited = Subject.create(false);

  /** Whether this leg's altitude constraint is invalid or not. */
  public readonly isAltitudeInvalid = Subject.create(false);

  /** Whether this leg's altitude constraint is editable. */
  public readonly isAltitudeEditable = Subject.create(false);

  /** Whether this leg's altitude constraint is visible. */
  public readonly isAltitudeVisible = Subject.create(false);

  /** The altitude 1 to use for the altitude constraint, but for display in a list. */
  public readonly altitude1Display = Subject.create('');

  /** The altitude 2 to use for the altitude constraint, but for display in a list. */
  public readonly altitude2Display = Subject.create('');

  // Speed constraint

  /** This leg's speed constraint speed. */
  public readonly speed = Subject.create(NaN, SubscribableUtils.NUMERIC_NAN_EQUALITY);

  /** This leg's speed constraint units. */
  public readonly speedUnit = Subject.create(SpeedUnit.IAS);

  /** This leg's speed constraint type. */
  public readonly speedDesc = Subject.create(SpeedRestrictionType.Unused);

  /** Whether this leg's speed constraint is different from the published speed. */
  public readonly isSpeedEdited = Subject.create(false);

  /** Whether this leg's speed constraint is invalid or not. */
  public readonly isSpeedInvalid = Subject.create(false);

  // Flight path angle

  /**
   * This leg's flight path angle, in degrees, or `NaN` if there is no defined flight path angle. Positive values
   * indicate a descending path.
   */
  public readonly fpa = Subject.create(NaN, SubscribableUtils.NUMERIC_NAN_EQUALITY);

  /** Whether this leg's fpa has been set by the user. */
  public readonly isFpaEdited = Subject.create(false);

  /** Whether this leg's fpa and speed constraint are editable. */
  public readonly isFpaSpeedEditable = Subject.create(this.isApproachRunwayLeg === false);

  // Other

  /** The vertical flight phase. */
  public readonly vnavPhase = Subject.create(VerticalFlightPhase.Descent);

  /** The initial DTK of the leg. Magnetic. */
  public readonly initialDtk = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));

  /** The magvar for this leg in degrees. Available only after the leg has been calculated at least once. */
  public readonly courseMagVar = Subject.create(0);

  /** The magnetic leg course in degrees, rounded, in the range [1, 360]. */
  public readonly magneticCourseRounded: Subscribable<number> = this.leg.leg.trueDegrees ? this.courseMagVar.map((magVar) =>
    FlightPlanLegData.roundCourse(MagVar.trueToMagnetic(this.leg.leg.course, magVar))
  ) : Subject.create(FlightPlanLegData.roundCourse(this.leg.leg.course));

  /** The leg's total distance, not cut short by ingress/egress turn radii. Changes when active leg. */
  public readonly distance = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  /** The cumulative distance up to the end of this leg. */
  public readonly distanceCumulative = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  /** The estimated fuel remaining at the end of the leg. */
  public readonly fuelRemaining = NumberUnitSubject.create(UnitType.GALLON_FUEL.createNumber(NaN));

  /** Estimated time Enroute of the leg, in seconds duration. How long it will take to fly the leg. */
  public readonly estimatedTimeEnroute = NumberUnitSubject.create(UnitType.SECOND.createNumber(NaN));

  /** Cumulative ETE. How long it would take from the current position to the end of this leg. */
  public readonly estimatedTimeEnrouteCumulative = NumberUnitSubject.create(UnitType.SECOND.createNumber(NaN));

  /** Estimated Time of Arrival of the leg, in UTC milliseconds from midnight. */
  public readonly estimatedTimeOfArrival = Subject.create(NaN);

  /** An event that fires when the leg's data changes. The string arg is the user data key that changed. */
  public readonly userDataChanged = new SubEvent<void, string>();

  private readonly subs = [] as Subscription[];

  /**
   * Creates a new leg data object.
   * @param bus The event bus.
   * @param vnavManager The VNAV manager to use.
   * @param leg The leg definition.
   * @param segment The containing segment.
   * @param segmentData The containing segment data.
   * @param planIndex The index of the flight plan that this leg belongs to.
   * @param store The flight plan store.
   * @param plan The flight plan that this leg exists in.
   * @param globalLegIndex The global leg index.
   * @param isDirectToRandom Whether this leg is for a direct to random.
   */
  public constructor(
    private readonly bus: EventBus,
    private readonly vnavManager: IfdVnavManager,
    public readonly leg: LegDefinition,
    public readonly segment: FlightPlanSegment,
    public readonly segmentData: FlightPlanSegmentData,
    public readonly planIndex: number,
    private readonly store: FlightPlanStore,
    public readonly plan: FlightPlan,
    globalLegIndex: number,
    public readonly isDirectToRandom = false,
  ) {
    this.subs.push(this.isDtoLeg.sub(() => this.updateAltitudeVisibility()));

    this.updateLegPosition(globalLegIndex);
    this.handleLegChanged(this.leg);

    this.subs.push(this.displayAltitude1AsFlightLevel.sub(this.updateAltitudes));
    this.subs.push(this.displayAltitude2AsFlightLevel.sub(this.updateAltitudes));
    this.subs.push(this.altDesc.sub(this.updateAltitudes));
    this.subs.push(this.altitude1.sub(this.updateAltitudes));
    this.subs.push(this.altitude2.sub(this.updateAltitudes, true));

    if (this.vnavManager.isEnabled.get()) {
      const isVerticalDirectEligible = MappedSubject.create(
        ([acAlt, vnavHealthy, verticalDirectIndex, legIndex]) =>
          vnavHealthy && verticalDirectIndex !== legIndex && IfdVNavUtils.isLegVNavDirectToEligible(this.plan, legIndex, acAlt),
        this.vnavManager.aircraftBaroAltitudeMeters,
        this.vnavManager.isWithinLateralLimits,
        this.vnavManager.verticalDirectIndex,
        this.globalLegIndex,
      );
      this.subs.push(isVerticalDirectEligible);
      this.subs.push(isVerticalDirectEligible.pipe(this.isVerticalDirectToEligible));
    }
  }

  /**
   * Update leg based on it's global leg index.
   * We avoid storing indexes to avoid stale indexes.
   * @param globalLegIndex The global leg index of the leg.
   */
  public updateLegPosition(globalLegIndex: number): void {
    this.globalLegIndex.set(globalLegIndex);
    this.segmentLegIndex.set(this.segment.legs.indexOf(this.leg));
    this.isFirstLegInPlan.set(globalLegIndex === 0);
    this.updateAltitudeVisibility(globalLegIndex);
    this._isLastLegInSegment.set(this.segmentLegIndex.get() === this.segment.legs.length - 1);
  }

  /**
   * Updates the altitude visibility and editability.
   * @param globalLegIndex The global leg index of the leg.
   */
  private updateAltitudeVisibility(globalLegIndex?: number): void {
    globalLegIndex ??= this.plan.getLegIndexFromLeg(this.leg);

    if (globalLegIndex < 0) {
      return;
    }

    this.isAltitudeEditable.set(FmsUtils.isAltitudeEditable(this.plan, this.leg));
    this.isAltitudeVisible.set(FmsUtils.isAltitudeVisible(this.plan, this.leg, this.isAltitudeEditable.get()));
  }

  /** Updates the altitude display subjects. */
  private readonly updateAltitudes = (): void => {
    if (this.altDesc.get() !== AltitudeRestrictionType.Unused) {
      const alt1Feet = this.altitude1.get().asUnit(UnitType.FOOT);
      this.altitude1Display.set(this.displayAltitude1AsFlightLevel.get() ? `FL${(alt1Feet / 100).toFixed(0).padStart(3, '0')}` : `${alt1Feet.toFixed(0)}FT`);
    } else {
      this.altitude1Display.set('');
    }

    if (this.altDesc.get() === AltitudeRestrictionType.Between) {
      const alt2Feet = this.altitude2.get().asUnit(UnitType.FOOT);
      this.altitude2Display.set(this.displayAltitude2AsFlightLevel.get() ? `FL${(alt2Feet / 100).toFixed(0).padStart(3, '0')}` : `${alt2Feet.toFixed(0)}FT`);
    } else {
      this.altitude2Display.set('');
    }
  };

  /**
   * Handles the leg changed event. Effectively when the vertical data object on the leg was modified.
   * @param leg The leg definition.
   */
  public handleLegChanged(leg: LegDefinition): void {
    this.vnavPhase.set(leg.verticalData.phase);

    // Altitude constraint
    this.updateLegListDataAltitudeStuffFromVerticalData();

    // Speed constraint
    const publishedSpeedUnit = SpeedUnit.IAS;
    const publishedSpeed = leg.leg.speedRestriction;
    const publishedSpeedDesc = leg.leg.speedRestrictionDesc;
    const isSpeedEdited = leg.verticalData.speedUnit !== publishedSpeedUnit
      || leg.verticalData.speedDesc !== publishedSpeedDesc
      || leg.verticalData.speed !== publishedSpeed;

    this.speedDesc.set(leg.verticalData.speedDesc);
    this.speed.set(leg.verticalData.speed <= 0 ? NaN : leg.verticalData.speed);
    this.speedUnit.set(leg.verticalData.speedUnit);
    this.isSpeedEdited.set(leg.verticalData.speedDesc !== SpeedRestrictionType.Unused && isSpeedEdited);

    // FPA
    this.fpa.set(leg.verticalData.fpa ?? NaN);
    this.isFpaEdited.set(leg.verticalData.fpa !== undefined);
  }

  /**
   * Updates a leg list data item's altitude info from the leg's vertical data object.
   */
  public updateLegListDataAltitudeStuffFromVerticalData(): void {
    const leg = this.leg;

    // Altitude constraint
    const hasConstraint = leg.verticalData.altDesc !== AltitudeRestrictionType.Unused;

    if (hasConstraint) {
      this.altDesc.set(leg.verticalData.altDesc);
      this.altitude1.set(leg.verticalData.altitude1, UnitType.METER);
      this.altitude2.set(leg.verticalData.altitude2, UnitType.METER);
      this.displayAltitude1AsFlightLevel.set(FmsUtils.displayAltitudeAsFlightLevel(this.bus, leg.verticalData.altitude1, leg.verticalData.phase));
      this.displayAltitude2AsFlightLevel.set(FmsUtils.displayAltitudeAsFlightLevel(this.bus, leg.verticalData.altitude2, leg.verticalData.phase));
      this.isAltitudeEdited.set(this.isAltitudeConstraintEdited());
    } else {
      this.altDesc.set(AltitudeRestrictionType.Unused);
      this.altitude1.set(NaN, UnitType.METER);
      this.altitude2.set(NaN, UnitType.METER);
      this.displayAltitude1AsFlightLevel.set(false);
      this.displayAltitude2AsFlightLevel.set(false);
      this.isAltitudeEdited.set(false);
    }
  }

  /**
   * Determines if the altitude constraint should be considered edited.
   * @returns Whether the constraint should be considered edited.
   */
  private isAltitudeConstraintEdited(): boolean {
    const leg = this.leg;
    const publishedAltDesc = leg.leg.altDesc;
    const constraintAltDesc = leg.verticalData.altDesc;
    const altitude1Feet = Math.round(UnitType.METER.convertTo(leg.verticalData.altitude1, UnitType.FOOT));
    const altitude2Feet = Math.round(UnitType.METER.convertTo(leg.verticalData.altitude2, UnitType.FOOT));
    const altitude1FeetPublished = Math.round(UnitType.METER.convertTo(leg.leg.altitude1, UnitType.FOOT));
    const altitude2FeetPublished = Math.round(UnitType.METER.convertTo(leg.leg.altitude2, UnitType.FOOT));

    return constraintAltDesc !== publishedAltDesc
      || altitude1Feet !== altitude1FeetPublished
      || altitude2Feet !== altitude2FeetPublished;
  }

  /**
   * Rounds a course and normalises it into the range [1, 360].
   * @param course The course.
   * @returns a course in the range [1, 360].
   */
  private static roundCourse(course: number): number {
    const rounded = Math.round(NavMath.normalizeHeading(course));
    return rounded === 0 ? 360 : rounded;
  }

  /** Call when this leg is removed from the plan. */
  public destroy(): void {
    this.isDtoLeg.destroy();
    this.isFirstLegInSegment.destroy();
    this.subs.forEach(x => x.destroy());
    this._isVisibleCollapsedLeg.destroy();
  }
}

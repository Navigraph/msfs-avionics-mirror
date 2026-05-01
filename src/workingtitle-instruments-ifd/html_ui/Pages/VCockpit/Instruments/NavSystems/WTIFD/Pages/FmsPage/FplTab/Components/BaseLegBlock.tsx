import {
  AltitudeRestrictionType, BitFlags, EventBus, FixTypeFlags, FlightPlanLeg, FlightPlanUtils, LegTurnDirection, LegType, MappedSubject, Subject, Subscribable,
  UnitFamily, UnitType, VerticalFlightPhase
} from '@microsoft/msfs-sdk';

import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { FlightPlanLegData } from '../../../../FlightPlan';
import { Fms, FmsUtils } from '../../../../Fms';
import { FmsUserSettings } from '../../../../Settings/FmsUserSettings';
import { UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { FormatUtils } from '../../../../Utilities/FormatUtils';
import { FplSelectionMenuController } from '../FplSelectionMenu/FplSelectionMenuController';
import { BaseEditableBlock, BaseEditableBlockProps } from './BaseEditableBlock';

/** The properties for the {@link LegBlock} component. */
export interface BaseLegBlockProps extends BaseEditableBlockProps {
  /** Controller for showing context/selection menus */
  readonly menuController: FplSelectionMenuController;
  /** The Flight Management System to use */
  readonly fms: Fms;
  /** Instance of event bus */
  readonly bus: EventBus;
  /** Whether this component is in sidebar mode. */
  readonly isInSidebarMode: Subscribable<boolean>;
}

/** Base class for leg blocks. */
export abstract class BaseLegBlock<T extends BaseLegBlockProps> extends BaseEditableBlock<T> {
  protected static readonly airportFlagColor = '00f502';

  protected readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.bus);

  public readonly viaDisplayShort = MappedSubject.create(
    ([isInSidebarMode, miniFplFormat, isSelected]) => {
      return isInSidebarMode || (miniFplFormat && !isSelected);
    },
    this.props.isInSidebarMode,
    this.props.store.miniFplFormat,
    this.isSelected,
  ).withLifecycle(this.defaultLifecycle);

  protected readonly legData = this.props.data.legData;

  /** The leg terminus (to) for this leg in the flight plan list. */
  protected readonly legTerminus = this.getLegTerminus();

  /** Will display the terminus normally, or the procedure if collapsed in compact and mini formats. */
  protected readonly legNameDisplay = MappedSubject.create(
    ([isSelected, isVisibleCollapsedLeg, procedureName, legTerminus, originRunwayName, airway, isMiniFplFormat]) => {
      if (!isSelected && isVisibleCollapsedLeg && isMiniFplFormat) {
        if (this.legData.isInDepartureSegment && originRunwayName) {
          return `RW${originRunwayName}.${procedureName}`;
        }
        if (airway) {
          return `${procedureName}.${legTerminus}`;
        }
        return procedureName;
      }
      return legTerminus;
    },
    this.isSelected,
    this.legData.isVisibleCollapsedLeg,
    this.legData.segmentData.procedureNameLong,
    this.legTerminus,
    this.props.store.originRunwayName,
    this.legData.segmentData.airway,
    this.props.store.miniFplFormat,
  ).withLifecycle(this.defaultLifecycle);

  /** The crossing instruction for altitude constraints on this leg in the flight plan list. */
  protected readonly crossingInstruction = BaseLegBlock.getCrossingInstruction(this.legData.leg.leg);

  protected readonly viaInstruction = this.getViaInstructionFromLeg(this.legData, this.viaDisplayShort);
  protected readonly verticalInstruction = this.getVerticalInstructionFromLeg(this.legData);

  protected readonly fixType = this.getFixTypeFromLeg(this.legData.leg.leg);

  protected readonly altitudeConstraintType = this.legData.altDesc;
  public readonly altitudeConstraintTypeText = MappedSubject.create(
    ([label]) => {
      switch (label) {
        case AltitudeRestrictionType.At: return 'at';
        case AltitudeRestrictionType.AtOrAbove: return 'at or above';
        case AltitudeRestrictionType.AtOrBelow: return 'at or below';
        case AltitudeRestrictionType.Between: return 'between';
        case AltitudeRestrictionType.Unused: return '';
      }
    },
    this.altitudeConstraintType
  );
  protected readonly altitude1 = this.legData.altitude1;
  protected readonly altitude2 = this.legData.altitude2;

  protected readonly hideCrossAltitude = MappedSubject.create(
    ([isInEditMode, altDesc, short, isVisibleCollapsedLeg]) =>
      FmsUtils.isAltitudeLeg(this.legData.leg.leg.type)
      || (isInEditMode && !short)
      || altDesc === AltitudeRestrictionType.Unused
      || isVisibleCollapsedLeg,
    this.isInEditMode,
    this.legData.altDesc,
    this.props.isInSidebarMode,
    this.legData.isVisibleCollapsedLeg,
  ).withLifecycle(this.defaultLifecycle);

  // FIXME implement based on airport and METAR availability
  protected readonly hideAirportFlag = Subject.create(true);
  protected readonly airportFlag = Subject.create('----');

  protected readonly eteMs = MappedSubject.create(
    ([legEte, segmentEte, isVisibleCollapsedLeg]) => {
      const ete = isVisibleCollapsedLeg ? segmentEte : legEte;
      return ete.asUnit(UnitType.MILLISECOND);
    },
    this.legData.estimatedTimeEnroute,
    this.legData.segmentData.estimatedTimeEnroute,
    this.legData.isVisibleCollapsedLeg,
  ).withLifecycle(this.defaultLifecycle);

  private readonly TEN_MINUTES_MS = UnitType.MILLISECOND.convertFrom(10, UnitType.MINUTE);

  // M:S when under 10 minutes, otherwise H:M
  protected readonly eteString = this.eteMs.map(
    (eteMs) => isNaN(eteMs)
      ? '--:--'
      : (eteMs < this.TEN_MINUTES_MS ? FormatUtils.eteFormatter(eteMs) : FormatUtils.eteHoursFormatter(eteMs))
  ).withLifecycle(this.defaultLifecycle);

  protected readonly eteUnits = this.eteMs.map(eteMs => {
    if (isNaN(eteMs)) {
      return 'M:S';
    }
    if (eteMs < this.TEN_MINUTES_MS) {
      return 'M:S';
    } else {
      return 'H:M';
    }
  }).withLifecycle(this.defaultLifecycle);

  protected readonly eta = MappedSubject.create(
    ([etaMs]) => isNaN(etaMs) ? '--:--' : FormatUtils.timeOfDay24HFormatter(etaMs),
    this.legData.estimatedTimeOfArrival
  ).withLifecycle(this.defaultLifecycle);

  protected readonly fuelQty = MappedSubject.create(
    ([fuel, displayUnit]) => {
      if (isNaN(fuel.number)) {
        return '---';
      }
      const converted = displayUnit.convertFrom(fuel.number, UnitType.GPH_FUEL);
      return converted.toFixed((converted >= 100 || converted <= -100) ? 0 : 1);
    },
    this.legData.fuelRemaining,
    this.unitsSettingManager.fuelFlowUnits,
  ).withLifecycle(this.defaultLifecycle);

  protected readonly fuelUnitDisplay = this.unitsSettingManager.fuelUnits.map((units) => {
    return FormatUtils.getFuelUnitString(units);
  }).withLifecycle(this.defaultLifecycle);

  /** FIXME we can't do local times yet, as timezone info is not available! */
  // protected readonly am_pm = MappedSubject.create(
  //   ([etaMs]) => isNaN(etaMs) ? 'AM' : FormatUtils.localTimeSuffixFormatter(etaMs).toLocaleUpperCase(),
  //   this.legData.estimatedTimeOfArrival
  // );
  protected readonly am_pm = Subject.create('Z');

  /**
   * Gets the leg terminus for this leg in the flight plan list.
   * @returns The leg terminus as a subscribable string.
   */
  private getLegTerminus(): Subscribable<string> {
    if (FmsUtils.isAltitudeLeg(this.legData.leg.leg.type)) {
      return MappedSubject.create(
        ([alt, short]) => short ? alt : `Climb to ${alt}`,
        this.legData.altitude1Display,
        this.props.isInSidebarMode,
      ).withLifecycle(this.defaultLifecycle);
    } else if (FlightPlanUtils.isToFixLeg(this.legData.leg.leg.type) || FlightPlanUtils.isHoldLeg(this.legData.leg.leg.type)) {
      return Subject.create(this.legData.leg.leg.fixIcaoStruct.ident);
    } else if (this.legData.leg.leg.type === LegType.CD || this.legData.leg.leg.type === LegType.FD || this.legData.leg.leg.type === LegType.VD) {
      return this.props.isInSidebarMode.map(
        (short) => `${this.legData.leg.leg.originIcaoStruct.ident}${short ?
          `/${UnitType.NMILE.convertFrom(this.legData.leg.leg.distance, UnitType.METER).toFixed(1)}` :
          ` ${UnitType.NMILE.convertFrom(this.legData.leg.leg.distance, UnitType.METER).toFixed(1)} DME`
          }`
      ).withLifecycle(this.defaultLifecycle);
    } else if (this.legData.leg.leg.type === LegType.FC) {
      return MappedSubject.create(([short, unit]) => {
        const convertedDist = UnitType.METER.convertTo(this.legData.leg.leg.rho, unit).toFixed(1);
        return `${convertedDist}${UnitFormatter.unitLabel<UnitFamily.Distance>(unit)}${short ? '' : ` from ${this.legData.leg.leg.originIcaoStruct.ident}`}`;
      },
        this.props.isInSidebarMode,
        this.unitsSettingManager.distanceUnitsLarge,
      ).withLifecycle(this.defaultLifecycle);
    } else if (this.legData.leg.leg.type === LegType.CR) {
      return this.props.isInSidebarMode.map(
        (short) => `${this.legData.leg.leg.originIcaoStruct.ident}${short ? `/${FormatUtils.formatCourse(this.legData.leg.leg.theta)}°` : ` ${FormatUtils.formatCourse(this.legData.leg.leg.theta)} Radial`}`
      ).withLifecycle(this.defaultLifecycle);
    } else if (this.legData.leg.leg.type === LegType.PI) {
      return this.props.isInSidebarMode.map((short) => short ? 'ProcTurn' : 'Intercept final').withLifecycle(this.defaultLifecycle);
    } else if (FlightPlanUtils.isInterceptLeg(this.legData.leg.leg.type)) {
      return this.props.isInSidebarMode.map((short) => short ? 'Next leg' : 'Intercept next leg').withLifecycle(this.defaultLifecycle);
    } else if (FlightPlanUtils.isManualDiscontinuityLeg(this.legData.leg.leg.type)) {
      return this.props.isInSidebarMode.map((short) => short ? 'Vectors' : 'Manual termination').withLifecycle(this.defaultLifecycle);
    } else {
      return Subject.create(this.legData.leg.leg.fixIcaoStruct.ident);
    }
  }

  /**
   * Gets the crossing instruction for altitude constraints on this leg in the flight plan list.
   * @param leg The flight plan leg.
   * @returns The instruction.
   */
  private static getCrossingInstruction(leg: Readonly<FlightPlanLeg>): string {
    if (FmsUtils.isAltitudeLeg(leg.type)) {
      return '';
    } else if (leg.type === LegType.HF) {
      return 'Intercept';
    } else if (FlightPlanUtils.isToFixLeg(leg.type) || FlightPlanUtils.isHoldLeg(leg.type)) {
      return `Cross ${leg.fixIcaoStruct.ident}`;
    } else if (leg.type === LegType.CD || leg.type === LegType.FD || leg.type === LegType.VD) {
      const dmePart = `${UnitType.NMILE.convertFrom(leg.distance, UnitType.METER).toFixed(1)} DME`;
      return `Cross ${dmePart}`;
    } else if (leg.type === LegType.FC) {
      const dmePart = `${UnitType.NMILE.convertFrom(leg.rho, UnitType.METER).toFixed(1)}`;
      return `Cross ${leg.originIcaoStruct.ident}/${dmePart}`;
    } else if (leg.type === LegType.CR) {
      return `Cross ${leg.originIcaoStruct.ident}/${FormatUtils.formatCourse(leg.theta)}`;
    } else if (FlightPlanUtils.isInterceptLeg(leg.type)) {
      return 'Intercept';
    } else if (FlightPlanUtils.isManualDiscontinuityLeg(leg.type)) {
      return leg.fixIcaoStruct.ident;
    } else {
      return `Cross ${leg.fixIcaoStruct.ident}`;
    }
  }

  /**
   * Get the via instruction (lateral path to be flown) for a leg.
   * CAUTION: this creates subscribables each time it is called.
   * @param legData The leg data for the leg.
   * @param isShort Whether to return the short version of the instruction (for use in the sidebar).
   * @returns The via instruction for display in the plan.
   */
  protected getViaInstructionFromLeg(legData: Readonly<FlightPlanLegData>, isShort: Subscribable<boolean>): Subscribable<string> {
    const leg = legData.leg.leg;
    switch (leg.type) {
      case LegType.RF:
        // FIXME radius!
        return this.props.isInSidebarMode.map((short) => short ?
          `${leg.turnDirection === LegTurnDirection.Right ? 'R' : 'L'} arc` :
          `${leg.turnDirection === LegTurnDirection.Right ? 'right' : 'left'} arc`
        ).withLifecycle(this.defaultLifecycle);
      // fallthrough
      default:
      case LegType.IF:
        return Subject.create('___°');
      case LegType.AF:
        return this.props.isInSidebarMode.map((short) => short ?
          `${UnitType.NMILE.convertFrom(leg.rho, UnitType.METER).toFixed(0)}DME ${leg.turnDirection === LegTurnDirection.Right ? 'R' : 'L'} arc` :
          `${leg.originIcaoStruct.ident} ${UnitType.NMILE.convertFrom(leg.rho, UnitType.METER).toFixed(0)} DME ${leg.turnDirection === LegTurnDirection.Right ? 'right' : 'left'} arc`
        ).withLifecycle(this.defaultLifecycle);
      case LegType.CA:
      case LegType.CD:
      case LegType.CF:
      case LegType.CI:
      case LegType.CR:
        return MappedSubject.create(
          ([course, short]) => `${short ? '' : 'Fly Course '}${FormatUtils.formatCourse(course)}°`,
          legData.magneticCourseRounded,
          isShort,
        ).withLifecycle(this.defaultLifecycle);
      case LegType.DF:
      case LegType.TF:
        return MappedSubject.create(
          ([dtk, isUserDto, short]) => `${short ? '' : (isUserDto ? '(' : 'Fly Direct (')}${dtk.isNaN() ? '---' : FormatUtils.formatCourse(dtk.number)}°${short ? '' : ')'}`,
          legData.initialDtk,
          legData.isUserDtoLeg,
          isShort,
        ).withLifecycle(this.defaultLifecycle);
      case LegType.FA:
      case LegType.FC:
      case LegType.FD:
      case LegType.FM:
        return MappedSubject.create(
          ([course, short]) => short ?
            `${leg.fixIcaoStruct.ident}/${FormatUtils.formatCourse(course)}°` :
            `Course ${FormatUtils.formatCourse(course)}° from ${leg.fixIcaoStruct.ident}`,
          legData.magneticCourseRounded,
          isShort,
        ).withLifecycle(this.defaultLifecycle);
      case LegType.PI:
        return MappedSubject.create(
          ([course, short]) => short ?
            `${leg.fixIcaoStruct.ident}/${FormatUtils.formatCourse(course)}°` :
            `Remain within ${UnitType.NMILE.convertFrom(leg.rho, UnitType.METER).toFixed(0)}NM of ${leg.originIcaoStruct.ident}`,
          legData.magneticCourseRounded,
          isShort,
        ).withLifecycle(this.defaultLifecycle);
      case LegType.HA:
      case LegType.HM:
        return MappedSubject.create(
          ([course, short]) => `Hold ${BaseLegBlock.getHoldCardinalDirection(course, short)}${short ? '' : ' of'}`,
          legData.magneticCourseRounded,
          isShort,
        ).withLifecycle(this.defaultLifecycle);
      case LegType.HF:
        return this.props.isInSidebarMode.map((short) => short ? 'Hold (crs rev)' : 'Hold (course reversal)').withLifecycle(this.defaultLifecycle);
      case LegType.VA:
      case LegType.VD:
      case LegType.VI:
      case LegType.VM:
      case LegType.VR:
        return MappedSubject.create(
          ([course, short]) => `${short ? '' : 'Fly Heading '}${FormatUtils.formatCourse(course)}°`,
          legData.magneticCourseRounded,
          isShort,
        ).withLifecycle(this.defaultLifecycle);
    }
  }

  private static readonly HOLD_CARDINAL_DIRECTIONS_LONG = [
    'South', // [338, 22]
    'Southwest', // [23, 67]
    'West', // [68, 112]
    'Northwest', // [113, 157]
    'North', // [158, 202]
    'Northeast', // [203, 247]
    'East', // [248, 292]
    'Southeast', // [293, 337]
  ];

  private static readonly HOLD_CARDINAL_DIRECTIONS_SHORT = [
    'South', // [338, 22]
    'SW', // [23, 67]
    'West', // [68, 112]
    'NW', // [113, 157]
    'North', // [158, 202]
    'NE', // [203, 247]
    'East', // [248, 292]
    'SE', // [293, 337]
  ];

  /**
   * Gets the cardinal direction for a given hold course.
   * @param course The inbound course in degrees.
   * @param short Whether to return the short texts for sidebar mode.
   * @returns The cardinal direction to display.
   */
  private static getHoldCardinalDirection(course: number, short: boolean): string {
    const index = Math.trunc((course + 22) / 45) % BaseLegBlock.HOLD_CARDINAL_DIRECTIONS_LONG.length;
    return short ? BaseLegBlock.HOLD_CARDINAL_DIRECTIONS_SHORT[index] : BaseLegBlock.HOLD_CARDINAL_DIRECTIONS_LONG[index];
  }

  /** @inheritdoc */
  protected override updateEditMode(): void {
    if (!this.isSelected.get() || !this.isEditableItem()) {
      this.isInEditMode.set(false);
      this.isInEntryMode.set(false);
      return;
    }
    this.isInEditMode.set(true);
  }

  /** @inheritdoc */
  protected override isEditableItem(): boolean {
    return !FlightPlanUtils.isAltitudeLeg(this.legData.leg.leg.type);
  }

  /**
   * Get the vertical (altitude constraint) instruction for a leg.
   * @param legData The leg data for the leg.
   * @returns The vertical instruction for display in the plan.
   */
  private getVerticalInstructionFromLeg(legData: Readonly<FlightPlanLegData>): string | Subscribable<string> {
    return MappedSubject.create(
      ([altDesc, altitude1, altitude2]) => {
        switch (altDesc) {
          case AltitudeRestrictionType.AtOrAbove:
            return `${this.crossingInstruction} at or above ${altitude1}`;
          case AltitudeRestrictionType.AtOrBelow:
            return `${this.crossingInstruction} at or below ${altitude1}`;
          case AltitudeRestrictionType.Between:
            return `${this.crossingInstruction} between ${altitude2} and ${altitude1}`;
          case AltitudeRestrictionType.At:
            return `${this.crossingInstruction} at ${altitude1}`;
          default:
            return '';
        }
      },
      legData.altDesc,
      legData.altitude1Display,
      legData.altitude2Display,
    ).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the fix type annotation to display next to a leg in the plan.
   * @param leg The leg to check.
   * @returns An annotation including parentheses, or empty string.
   */
  private getFixTypeFromLeg(leg: Readonly<FlightPlanLeg>): string {
    if (BitFlags.isAny(leg.fixTypeFlags, FixTypeFlags.MAP)) {
      return '(MAP)';
    }
    if (BitFlags.isAny(leg.fixTypeFlags, FixTypeFlags.FAF)) {
      return '(FAF)';
    }
    if (BitFlags.isAny(leg.fixTypeFlags, FixTypeFlags.IAF)) {
      return '(IAF)';
    }
    return '';
  }


  private static readonly constraintMenuItems: [AltitudeRestrictionType, string][] = [
    [AltitudeRestrictionType.AtOrBelow, 'at or below'],
    [AltitudeRestrictionType.At, 'at'],
    [AltitudeRestrictionType.AtOrAbove, 'at or above'],
    [AltitudeRestrictionType.Between, 'between'],
  ];

  /**
   * Opens the context menu for choosing the constraint type
   */
  protected openConstraintTypeMenu(): void {
    const pos = { xCoord: 175, yCoord: 100 };

    this.props.menuController.clearMenu();
    this.props.menuController.addGroup(undefined, BaseLegBlock.constraintMenuItems.map((item) => ({
      name: item[1],
      confirmHandler: () => this.setConstraint(item[0]),
    })));
    const selectedType = this.altitudeConstraintType.get();
    const selectedItemIndex = BaseLegBlock.constraintMenuItems.findIndex((item) => item[0] === selectedType);
    if (selectedItemIndex >= 0) {
      this.props.menuController.setSelectedOption(selectedItemIndex);
    }
    this.props.menuController.showAt(pos);
  }

  /**
   * Sets the constraint on the leg
   * @param constraintType Optionally a new constraint type to set.
   */
  protected setConstraint(constraintType?: AltitudeRestrictionType): void {
    if (constraintType !== undefined) {
      this.altitudeConstraintType.set(constraintType);
    }

    let altitude1Meters = this.altitude1.get().asUnit(UnitType.METER);
    let altitude2Meters = this.altitude2.get().number > 0 ? this.altitude2.get().asUnit(UnitType.METER) : undefined;

    if (isNaN(altitude1Meters)) {
      altitude1Meters = 0;
    }
    if (altitude2Meters !== undefined && isNaN(altitude2Meters)) {
      altitude2Meters = undefined;
    }

    const fmsSettingManager = FmsUserSettings.getManager(this.props.bus);
    const transMetres = UnitType.METER.convertFrom(fmsSettingManager.getSetting(this.legData.leg.verticalData.phase === VerticalFlightPhase.Climb ? 'transitionAltitude' : 'transitionLevel').get(), UnitType.FOOT);

    this.props.fms.setUserConstraintAdvanced(
      this.legData.segment.segmentIndex,
      this.legData.segmentLegIndex.get(),
      this.legData.leg.verticalData.phase,
      this.altitudeConstraintType.get(),
      altitude1Meters,
      altitude1Meters >= transMetres,
      altitude2Meters,
      altitude2Meters === undefined ? undefined : altitude2Meters >= transMetres,
    );
    this.props.menuController.hide();
  }
}

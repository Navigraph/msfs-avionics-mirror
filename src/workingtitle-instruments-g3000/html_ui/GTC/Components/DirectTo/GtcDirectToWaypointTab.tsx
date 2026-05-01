import {
  AltitudeRestrictionType, BasicNavAngleSubject, BasicNavAngleUnit, ComponentProps, DisplayComponent,
  FacilitySearchType, FacilityWaypoint, FSComponent, MagVar, MappedSubject, MutableSubscribable, NavMath, NumberFormatter,
  NumberUnitSubject, StatefulBasicLifecycle, StringUtils, Subject, Subscribable, SubscribableUtils, Subscription,
  UnitType, VNode
} from '@microsoft/msfs-sdk';

import {
  BearingDisplay, Fms, GarminFacilityWaypointCache, NumberUnitDisplay, UnitsUserSettingManager, WaypointInfoStore
} from '@microsoft/msfs-garminsdk';

import { AltitudeConstraintDisplay, FlightPlanStore } from '@microsoft/msfs-wtg3000-common';
import { GtcBearingArrow } from '../../Components/BearingArrow/GtcBearingArrow';
import { GtcTouchButton } from '../../Components/TouchButton/GtcTouchButton';
import { GtcValueTouchButton } from '../../Components/TouchButton/GtcValueTouchButton';
import { GtcWaypointSelectButton } from '../../Components/TouchButton/GtcWaypointSelectButton';
import { GtcCourseDialog } from '../../Dialog/GtcCourseDialog';
import { GtcDialogs } from '../../Dialog/GtcDialogs';
import { DirectToController } from '../../FlightPlan/DirectToController';
import { DirectToStore } from '../../FlightPlan/DirectToStore';
import { GtcService } from '../../GtcService/GtcService';
import { GtcViewKeys } from '../../GtcService/GtcViewKeys';
import { GtcPositionHeadingDataProvider } from '../../Navigation/GtcPositionHeadingDataProvider';
import { GtcHoldPage } from '../../Pages/HoldPage/GtcHoldPage';
import { HoldCourseDirection } from '../../Pages/HoldPage/HoldStore';
import { GtcWaypointButton } from '../TouchButton/GtcWaypointButton';

import './GtcDirectToWaypointTab.css';

/**
 * Component props for {@link GtcDirectToWaypointTab}.
 */
export interface GtcDirectToWaypointTabProps extends ComponentProps {
  /** The GTC service. */
  gtcService: GtcService;

  /** The FMS instance. */
  fms: Fms;

  /** A provider for position and heading data. */
  posHeadingDataProvider: GtcPositionHeadingDataProvider;

  /** Whether to allow the user to select the Direct To waypoint using the tab's selection button. */
  allowWaypointSelection: boolean;

  /**
   * The selected waypoint for the Direct To. If waypoint selection is allowed, then this should be a mutable
   * subscribable.
   */
  selectedWaypoint: Subscribable<FacilityWaypoint | null> | MutableSubscribable<FacilityWaypoint | null>;

  /** The waypoint cache. */
  waypointCache: GarminFacilityWaypointCache;

  /** The waypoint info store. */
  selectedWaypointInfo: WaypointInfoStore;

  /** The direct to controller. */
  controller: DirectToController;

  /** The flight plan store. */
  flightPlanStore: FlightPlanStore;

  /** The direct to store. */
  directToStore: DirectToStore;

  /** A manager for display units user settings. */
  unitsSettingManager: UnitsUserSettingManager;
}

/**
 * A GTC Direct To waypoint tab.
 */
export class GtcDirectToWaypointTab extends DisplayComponent<GtcDirectToWaypointTabProps> {
  private thisNode?: VNode;

  private readonly defaultLifecycle = new StatefulBasicLifecycle(true);

  private readonly selectedWaypointIdent = this.props.selectedWaypointInfo.facility.map(x => x ? x.icaoStruct.ident : '______').withLifecycle(this.defaultLifecycle);
  private readonly selectedWaypointCity = this.props.selectedWaypointInfo.city.map(x => x ?? '').withLifecycle(this.defaultLifecycle);
  private readonly selectedWaypointRegion = this.props.selectedWaypointInfo.region.map(x => x ?? '').withLifecycle(this.defaultLifecycle);

  private readonly courseButtonValue = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));
  private courseButtonAutoValuePipe?: Subscription;

  private readonly holdButtonValue = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));

  private readonly relativeBearing = MappedSubject.create(
    ([bearing, planeHeading]) => bearing.number - planeHeading,
    SubscribableUtils.NUMERIC_NAN_EQUALITY,
    this.props.selectedWaypointInfo.bearing,
    this.props.posHeadingDataProvider.headingTrue
  ).withLifecycle(this.defaultLifecycle);

  private readonly activeDirectToIdent = MappedSubject.create(
    ([directToExistingLeg, directToRandomLegListData]) => {
      return directToRandomLegListData?.leg.name ?? directToExistingLeg?.name ?? '_____';
    },
    this.props.flightPlanStore.directToExistingLeg,
    this.props.flightPlanStore.directToRandomLegData
  ).withLifecycle(this.defaultLifecycle);

  private readonly canCancel = MappedSubject.create(
    ([isDirectToExistingActive, isDirectToRandomActive]) => {
      return isDirectToExistingActive || isDirectToRandomActive;
    },
    this.props.flightPlanStore.isDirectToExistingActive,
    this.props.flightPlanStore.isDirectToRandomActive
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;

    this.props.directToStore.userCourseMagnetic.sub(this.updateCourse.bind(this)).withLifecycle(this.defaultLifecycle);
    this.props.directToStore.autoCourseValue.sub(this.updateCourse.bind(this)).withLifecycle(this.defaultLifecycle);
    this.props.directToStore.holdInfo.sub(this.updateHoldCourse.bind(this)).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Responds to when this tab is resumed.
   */
  public onResume(): void {
    this.defaultLifecycle.resume();
  }

  /**
   * Responds to when this tab is paused.
   */
  public onPause(): void {
    this.defaultLifecycle.pause();
  }

  /**
   * Updates the value for the course button.
   */
  private updateCourse(): void {
    const userCourseMagnetic = this.props.directToStore.userCourseMagnetic.get();

    if (userCourseMagnetic !== undefined) {
      this.courseButtonAutoValuePipe?.destroy();
      this.courseButtonAutoValuePipe = undefined;

      this.courseButtonValue.set(userCourseMagnetic, this.props.directToStore.autoCourseValue.get().unit.magVar);
    } else if (this.courseButtonAutoValuePipe === undefined) {
      this.courseButtonAutoValuePipe = this.props.directToStore.autoCourseValue.pipe(this.courseButtonValue);
    }
  }

  /** Updates the data source for the hold button value. */
  private updateHoldCourse(): void {
    const holdInfo = this.props.directToStore.holdInfo.get();
    if (holdInfo) {
      if (holdInfo.holdCourseDirection === HoldCourseDirection.Outbound) {
        this.holdButtonValue.set(NavMath.normalizeHeading(holdInfo.course.number + 180), holdInfo.course.unit.magVar);
      } else {
        this.holdButtonValue.set(holdInfo.course);
      }
    } else {
      this.holdButtonValue.set(NaN);
    }
  }

  /**
   * Responds to when this tab's course button is pressed.
   */
  private async onCourseButtonPressed(): Promise<void> {
    const initialValue = Math.round(this.courseButtonValue.get().asUnit(this.props.unitsSettingManager.navAngleUnits.get())) % 360;

    const result = await this.props.gtcService.openPopup<GtcCourseDialog>(GtcViewKeys.CourseDialog, 'normal', 'darken')
      .ref.request({
        title: 'Course',
        initialValue: initialValue === 0 ? 360 : initialValue
      });

    if (!result.wasCancelled) {
      const value = this.props.unitsSettingManager.navAngleUnits.get().isMagnetic()
        ? result.payload
        : MagVar.trueToMagnetic(result.payload, this.props.directToStore.autoCourseValue.get().unit.magVar);

      this.props.directToStore.userCourseMagnetic.set(value);
    }
  }

  /**
   * Responds to when this tab's hold button is pressed.
   */
  private async onHoldButtonPressed(): Promise<void> {
    const facility = this.props.selectedWaypoint.get()?.facility.get();

    if (!facility) { return; }

    const holdInfo = this.props.directToStore.holdInfo.get();

    const result = await this.props.gtcService.changePageTo<GtcHoldPage>(GtcViewKeys.Hold).ref.request({
      planIndex: this.props.directToStore.directToExistingData.get() === null ? Fms.DTO_RANDOM_PLAN_INDEX : Fms.PRIMARY_PLAN_INDEX,
      courseMagnetic: this.courseButtonValue.get().number,
      legName: this.selectedWaypointIdent.get(),
      facility,
      existingHoldLeg: holdInfo?.existingHoldLeg,
      holdInfo,
      forceAllowEdit: true,
      title: 'Direct To Hold',
    });

    if (result.wasCancelled) { return; }

    if (result.payload === 'cancel-hold') {
      this.props.directToStore.holdInfo.set(undefined);
    } else {
      this.props.directToStore.holdInfo.set(result.payload);
    }
  }

  /**
   * Responds to when this tab's cancel direct-to button is pressed.
   */
  private async onCancelButtonPressed(): Promise<void> {
    const directToRandomLegData = this.props.flightPlanStore.directToRandomLegData.get();
    const directToExistingLeg = this.props.flightPlanStore.directToExistingLeg.get();
    if (directToRandomLegData) {
      const accepted = await GtcDialogs.openMessageDialog(this.props.gtcService, `Cancel ${StringUtils.DIRECT_TO} ${directToRandomLegData.leg.name}?`);
      if (accepted && this.props.fms.cancelDirectTo()) {
        this.props.gtcService.goBack();
      }
    } else if (directToExistingLeg) {
      const accepted = await GtcDialogs.openMessageDialog(this.props.gtcService, `Cancel ${StringUtils.DIRECT_TO} ${directToExistingLeg.name}?`);
      if (accepted && this.props.fms.cancelDirectTo()) {
        this.props.gtcService.goBack();
      }
    }
  }

  /**
   * Responds to when this tab's activate and insert in flight plan button is pressed.
   */
  private async onInsertInFlightPlanButtonPressed(): Promise<void> {
    // TODO
  }

  /**
   * Responds to when this tab's activate direct-to button is pressed.
   */
  private onActivateButtonPressed(): void {
    this.props.controller.activateSelected();
    this.props.gtcService.goBack();
  }

  /** @inheritDoc */
  public render(): VNode {
    // TODO:
    //  * enable "activate and insert to fp" only when fp loaded
    return (
      <div class='gtc-dto-wpt-tab'>
        {
          this.props.allowWaypointSelection
            ? (
              <GtcWaypointSelectButton
                gtcService={this.props.gtcService}
                type={FacilitySearchType.AllExceptVisual}
                waypoint={this.props.selectedWaypoint}
                waypointCache={this.props.waypointCache}
                nullLabel='Select Waypoint'
                class='gtc-dto-wpt-tab-select-waypoint-button'
              />
            ) : (
              // NOTE: this is not a mistake. In the trainer, when waypoint selection is disabled, the button is still
              // enabled - you can still press it and it will even show the animation for pressing a button - but
              // pressing the button has no effect.
              <GtcWaypointButton
                waypoint={this.props.selectedWaypoint}
                nullLabel='No Waypoint Selected'
                class='gtc-dto-wpt-tab-select-waypoint-button'
              />
            )
        }
        
        <div class='gtc-dto-wpt-tab-data'>
          <div class='gtc-dto-wpt-tab-data-location'>{this.selectedWaypointCity}<br />{this.selectedWaypointRegion}</div>
          <div class='gtc-dto-wpt-tab-data-bearing'>
            <div>BRG</div>
            <div class='gtc-dto-wpt-tab-data-bearing-bottom'>
              <BearingDisplay
                value={this.props.selectedWaypointInfo.bearing}
                formatter={NumberFormatter.create({ precision: 1, pad: 3, nanString: '___' })}
                displayUnit={this.props.unitsSettingManager.navAngleUnits}
                class='gtc-dto-wpt-tab-data-bearing-display'
              />
              <GtcBearingArrow
                relativeBearing={this.relativeBearing}
              />
            </div>
          </div>
          <div class='gtc-dto-wpt-tab-data-distance'>
            <div>DIS</div>
            <NumberUnitDisplay
              value={this.props.selectedWaypointInfo.distance}
              formatter={NumberFormatter.create({ precision: 0.1, maxDigits: 3, nanString: '__._' })}
              displayUnit={this.props.unitsSettingManager.distanceUnitsLarge}
            />
          </div>
        </div>

        <div class='gtc-dto-wpt-tab-options'>
          <GtcTouchButton
            isEnabled={false}
            label='VNAV Altitude'
            class='touch-button-value gtc-dto-wpt-tab-options-vnav-alt-button'
          >
            <AltitudeConstraintDisplay
              altDesc={Subject.create(AltitudeRestrictionType.Unused)}
              altitude1={NumberUnitSubject.create(UnitType.FOOT.createNumber(NaN))}
              displayAltitude1AsFlightLevel={Subject.create(false)}
              isEdited={Subject.create(false)}
              isCyan={true}
            />
          </GtcTouchButton>
          <GtcValueTouchButton
            state={NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN))}
            isEnabled={false}
            label='VNAV Offset'
            renderValue={(
              <NumberUnitDisplay
                class="touch-button-value-value"
                value={UnitType.NMILE.createNumber(NaN)}
                displayUnit={this.props.unitsSettingManager.distanceUnitsLarge}
                formatter={NumberFormatter.create({ precision: 1, pad: 1, nanString: '___' })}
              />
            )}
            class='gtc-dto-wpt-tab-options-vnav-offset-button'
          />
          <GtcValueTouchButton
            state={this.courseButtonValue}
            isEnabled={this.props.controller.canActivate}
            label='Course'
            renderValue={(
              <BearingDisplay
                value={this.courseButtonValue}
                displayUnit={this.props.unitsSettingManager.navAngleUnits}
                formatter={NumberFormatter.create({ precision: 1, pad: 3, nanString: '–––' })}
                hideDegreeSymbolWhenNan={true}
              />
            )}
            onPressed={this.onCourseButtonPressed.bind(this)}
            class='gtc-dto-wpt-tab-options-course-button'
          />
          <GtcValueTouchButton
            state={this.holdButtonValue}
            isEnabled={this.props.controller.canActivate}
            label='Hold'
            renderValue={(
              <BearingDisplay
                value={this.holdButtonValue}
                displayUnit={this.props.unitsSettingManager.navAngleUnits}
                formatter={NumberFormatter.create({ precision: 1, pad: 3, nanString: '–––' })}
                hideDegreeSymbolWhenNan={true}
              />
            )}
            onPressed={this.onHoldButtonPressed.bind(this)}
            class='gtc-dto-wpt-tab-options-hold-button'
          />
        </div>

        <div class='gtc-dto-wpt-tab-separator'/>

        <div class='gtc-dto-wpt-tab-bottom-row'>
          <GtcValueTouchButton
            state={this.activeDirectToIdent}
            isEnabled={this.canCancel}
            label='Cancel Ð'
            onPressed={this.onCancelButtonPressed.bind(this)}
            class='gtc-dto-wpt-tab-cancel-button'
          />
          <GtcTouchButton
            isEnabled={false}
            // isEnabled={this.props.controller.canActivate}
            label='Activate and<br/>Insert in<br/>Flight Plan'
            onPressed={this.onInsertInFlightPlanButtonPressed.bind(this)}
            class='gtc-dto-wpt-tab-insert-fpl-button'
          />
          <GtcValueTouchButton
            state={this.selectedWaypointIdent}
            isEnabled={this.props.controller.canActivate}
            label='Activate Ð'
            onPressed={this.onActivateButtonPressed.bind(this)}
            class='touch-button-special gtc-dto-wpt-tab-activate-button'
          />
        </div>
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.thisNode && FSComponent.shallowDestroy(this.thisNode);

    this.defaultLifecycle.destroy();

    super.destroy();
  }
}

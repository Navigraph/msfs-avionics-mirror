import {
  FacilitySearchType, FacilityType, FacilityWaypoint, FSComponent, ICAO, IcaoValue, MutableSubscribable, NodeReference,
  SubscribableArray, SubscribableArrayEventType, Subscription, UserFacility, VNode
} from '@microsoft/msfs-sdk';

import { ControllableDisplayPaneIndex } from '@microsoft/msfs-wtg3000-common';

import { GtcUserWaypointInfo } from '../../Components/WaypointInfo/GtcUserWaypointInfo';
import { GtcWaypointInfo } from '../../Components/WaypointInfo/GtcWaypointInfo';
import { GtcControlMode, GtcService } from '../../GtcService/GtcService';
import { GtcUserWaypointEditController } from '../../Navigation/GtcUserWaypointEditController';
import { GtcUserWaypointInfoOptionsPopup } from './GtcUserWaypointInfoOptionsPopup';
import { GtcWaypointInfoPage2, GtcWaypointInfoPage2Props } from './GtcWaypointInfoPage2';

import './GtcUserWaypointInfoPage2.css';

/**
 * Component props for {@link GtcUserWaypointInfoPage2}.
 */
export interface GtcUserWaypointInfoPage2Props extends GtcWaypointInfoPage2Props {
  /** A controller for editing user waypoints. */
  controller: GtcUserWaypointEditController;

  /** An array of all existing user waypoints. */
  userWaypoints: SubscribableArray<FacilityWaypoint<UserFacility>>;

  /** A mutable subscribable from and to which to sync the page's selected user waypoint. */
  selectedUserWaypoint: MutableSubscribable<FacilityWaypoint<UserFacility> | null>;
}

/**
 * GTC view keys for popups owned by airport information pages.
 */
enum GtcUserWaypointInfoPagePopupKeys {
  Options = 'UserWaypointInfoOptions'
}

/**
 * A GTC user waypoint information page.
 */
export class GtcUserWaypointInfoPage2 extends GtcWaypointInfoPage2<FacilitySearchType.User, GtcUserWaypointInfoPage2Props> {
  protected readonly waypointSelectType = FacilitySearchType.User;
  protected readonly optionsPopupKey = GtcUserWaypointInfoPagePopupKeys.Options;

  private initSelectionOpId = 0;

  private userWaypointArraySub?: Subscription;
  private selectedWaypointPipeOut?: Subscription;

  /** @inheritDoc */
  public onAfterRender(): void {
    super.onAfterRender();

    this.userWaypointArraySub = this.props.userWaypoints.sub((index, type) => {
      if (type === SubscribableArrayEventType.Removed) {
        this.onWaypointRemoved(index);
      }
    });

    this.selectedWaypointPipeOut = this.selectedWaypoint.pipe(this.props.selectedUserWaypoint);

    this.infoRef.instance.selectedFacility.pipe(this.showOnMapData, facility => {
      return { icao: facility?.icaoStruct ?? ICAO.emptyValue(), runwayIndex: -1 };
    });
  }

  /**
   * Responds to when a user waypoint is removed from the existing user waypoints array.
   * @param index The index of the removed waypoint.
   */
  private onWaypointRemoved(index: number): void {
    const selectedFacility = this.infoRef.instance.selectedFacility.get();

    if (selectedFacility === null) {
      return;
    }

    const userWaypointsArray = this.props.userWaypoints.getArray();

    // If the selected user waypoint was removed, attempt to select the previous waypoint in the array, or if that
    // does not exist, the next waypoint in the array. If neither exists, then set the selection to null.
    if (userWaypointsArray.findIndex(waypoint => waypoint.facility.get().icao === selectedFacility.icao) < 0) {
      const newSelectionIndex = Math.max(index - 1, 0);
      const newSelection = userWaypointsArray[newSelectionIndex];

      this.selectedWaypoint.set(newSelection ?? null);
    }
  }

  /**
   * Initializes this page's user waypoint selection. If the initial selected waypoint does not exist anymore, then
   * the selection will be set to the oldest existing user waypoint. If there are no existing user waypoints, the
   * selection will be set to `null`.
   * @param facility The user waypoint facility to select, or its ICAO. If not defined, the selection will be
   * initialized to the most recently selected user waypoint.
   */
  public async initSelection(facility?: UserFacility | IcaoValue): Promise<void> {
    const opId = ++this.initSelectionOpId;

    let selection: FacilityWaypoint<UserFacility> | null = null;

    if (facility === undefined) {
      selection = this.props.selectedUserWaypoint.get();
    } else {
      if (ICAO.isValue(facility)) {
        if (ICAO.isValueFacility(facility, FacilityType.USR)) {
          const userFacility = await this.props.facLoader.tryGetFacility(FacilityType.USR, facility);
          if (userFacility) {
            selection = this.facWaypointCache.get(userFacility);
          }
        }
      } else {
        selection = this.facWaypointCache.get(facility);
      }
    }

    if (opId !== this.initSelectionOpId) {
      return;
    }

    // We need to make sure that the initial selected waypoint still exists. If it doesn't attempt to select the
    // first waypoint in the existing user waypoints array. If the array is empty, initialize the selection to null.
    if (selection !== null && !this.props.controller.doesUserWaypointExist(selection.facility.get().icaoStruct)) {
      selection = this.props.userWaypoints.tryGet(0) ?? null;
    }

    this.selectedWaypoint.set(selection);
  }

  /** @inheritDoc */
  public onOpen(): void {
    super.onOpen();

    this.userWaypointArraySub?.resume();
    this.selectedWaypointPipeOut?.resume();
  }

  /** @inheritDoc */
  public onClose(): void {
    super.onClose();

    this.userWaypointArraySub?.pause();
    this.selectedWaypointPipeOut?.pause();
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'user-info-page2';
  }

  /** @inheritDoc */
  protected renderContent(infoRef: NodeReference<GtcWaypointInfo<FacilitySearchType.User>>): VNode {
    return (
      <GtcUserWaypointInfo
        ref={infoRef}
        gtcService={this.props.gtcService}
        waypointCache={this.facWaypointCache}
        posHeadingDataProvider={this.props.posHeadingDataProvider}
        allowWaypointSelection={true}
        selectedWaypoint={this.selectedWaypoint}
        onOptionsPressed={() => { this.props.gtcService.openPopup(this.optionsPopupKey, 'slideout-right'); }}
        unitsSettingManager={this.unitsSettingManager}
        facLoader={this.props.facLoader}
        userWaypoints={this.props.userWaypoints}
        sidebarState={this._sidebarState}
      />
    );
  }

  /** @inheritDoc */
  protected renderOptionsPopup(gtcService: GtcService, controlMode: GtcControlMode, displayPaneIndex?: ControllableDisplayPaneIndex): VNode {
    return (
      <GtcUserWaypointInfoOptionsPopup
        gtcService={gtcService}
        controlMode={controlMode}
        displayPaneIndex={displayPaneIndex}
        controller={this.props.controller}
        selectedWaypoint={this.selectedWaypoint}
        initSelection={this.initSelection.bind(this)}
        showOnMap={this.showOnMap}
      />
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.infoRef.getOrDefault()?.destroy();

    this.userWaypointArraySub?.destroy();
    this.selectedWaypointPipeOut?.destroy();

    super.destroy();
  }
}

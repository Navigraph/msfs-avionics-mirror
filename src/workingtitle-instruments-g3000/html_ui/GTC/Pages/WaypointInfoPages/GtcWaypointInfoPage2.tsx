import {
  ClassProp, FacilityLoader, FSComponent, ICAO, IcaoValue, NodeReference, SearchTypeMap, Subject, Subscription,
  UserSettingManager, VNode
} from '@microsoft/msfs-sdk';

import { GarminFacilityWaypointCache, UnitsUserSettings } from '@microsoft/msfs-garminsdk';

import {
  ControllableDisplayPaneIndex, DisplayPaneControlEvents, DisplayPaneSettings, DisplayPanesUserSettings,
  DisplayPaneViewKeys, WaypointInfoPaneSelectionData, WaypointInfoPaneViewEventTypes
} from '@microsoft/msfs-wtg3000-common';

import { WaypointSelectType, WaypointSelectTypeMap } from '../../Components/TouchButton/GtcWaypointSelectButton';
import { GtcWaypointInfo } from '../../Components/WaypointInfo/GtcWaypointInfo';
import { GtcControlMode, GtcService, GtcViewLifecyclePolicy } from '../../GtcService/GtcService';
import { GtcView, GtcViewProps } from '../../GtcService/GtcView';
import { GtcPositionHeadingDataProvider } from '../../Navigation/GtcPositionHeadingDataProvider';
import { GtcWaypointInfoOptionsPopup } from './GtcWaypointInfoOptionsPopup';

import './GtcWaypointInfoPage2.css';

/**
 * Component props for {@link GtcWaypointInfoPage2}.
 */
export interface GtcWaypointInfoPage2Props extends GtcViewProps {
  /** The facility loader to use. */
  facLoader: FacilityLoader;

  /** A provider of airplane position and heading data. */
  posHeadingDataProvider: GtcPositionHeadingDataProvider;
}

/**
 * A GTC waypoint information page.
 */
export abstract class GtcWaypointInfoPage2<T extends WaypointSelectType, P extends GtcWaypointInfoPage2Props = GtcWaypointInfoPage2Props> extends GtcView<P> {
  /** The type of waypoint displayed by this page. */
  protected abstract readonly waypointSelectType: T;

  /** The view key for this page's options popup. */
  protected abstract readonly optionsPopupKey: string;

  protected readonly publisher = this.bus.getPublisher<DisplayPaneControlEvents<WaypointInfoPaneViewEventTypes>>();

  protected readonly displayPaneIndex: ControllableDisplayPaneIndex;
  protected readonly displayPaneSettingManager: UserSettingManager<DisplayPaneSettings>;

  protected readonly facWaypointCache = GarminFacilityWaypointCache.getCache(this.bus);

  protected readonly unitsSettingManager = UnitsUserSettings.getManager(this.bus);

  protected readonly rootCssClass = FSComponent.mergeCssClasses('wpt-info-page', this.getCssClass());
  protected readonly infoRef = FSComponent.createRef<GtcWaypointInfo<T>>();

  /** The selected waypoint, or `null` if there is no selected waypoint. */
  protected readonly selectedWaypoint = Subject.create<WaypointSelectTypeMap[T] | null>(null);

  /** Whether the currently selected waypoint can be shown on the map. */
  protected readonly canShowOnMap = this.selectedWaypoint.map(waypoint => waypoint !== null);

  protected readonly showOnMap = Subject.create(false);
  protected readonly showOnMapData = Subject.create<Omit<WaypointInfoPaneSelectionData, 'resetRange'>>(
    { icao: ICAO.emptyValue(), runwayIndex: -1 },
    (a, b) => {
      if (a === null && b === null) {
        return true;
      }

      if (a === null || b === null) {
        return false;
      }

      return ICAO.valueEquals(a.icao, b.icao) && a.runwayIndex === b.runwayIndex;
    }
  );
  protected resetMapRange = false;

  protected showOnMapSub?: Subscription;

  /**
   * Creates a new instance of GtcWaypointInfoPage2.
   * @param props This component's props.
   * @throws Error if a display pane index is not defined for this view.
   */
  public constructor(props: P) {
    super(props);

    if (this.props.displayPaneIndex === undefined) {
      throw new Error('GtcWaypointInfoPage2: display pane index was not defined');
    }

    this.displayPaneIndex = this.props.displayPaneIndex;
    this.displayPaneSettingManager = DisplayPanesUserSettings.getDisplayPaneManager(this.bus, this.displayPaneIndex);
  }

  /** @inheritDoc */
  public onAfterRender(): void {
    this._activeComponent.set(this.infoRef.instance);

    this.infoRef.instance.title.pipe(this._title);

    this.props.gtcService.registerView(
      GtcViewLifecyclePolicy.Transient,
      this.optionsPopupKey,
      this.props.controlMode,
      this.renderOptionsPopup.bind(this),
      this.props.displayPaneIndex
    );

    const showOnMapDataSub = this.showOnMapData.sub(data => {
      this.sendSelectionData({ ...data, resetRange: this.resetMapRange });
      this.resetMapRange = false;
    }, false, true);

    const canShowOnMapSub = this.canShowOnMap.sub(canShow => {
      if (canShow) {
        showOnMapDataSub.resume(true);
      } else {
        showOnMapDataSub.pause();
        this.showOnMap.set(false);
      }
    }, false, true);

    this.showOnMapSub = this.showOnMap.sub(show => {
      const viewSetting = this.displayPaneSettingManager.getSetting('displayPaneView');

      if (show) {
        this.resetMapRange = true;
        viewSetting.value = DisplayPaneViewKeys.WaypointInfo;
        canShowOnMapSub.resume(true);
      } else {
        canShowOnMapSub.pause();
        showOnMapDataSub.pause();
        viewSetting.value = this.displayPaneSettingManager.getSetting('displayPaneDesignatedView').value;
      }
    }, false, true);
  }

  /**
   * Initializes this page's waypoint selection.
   * @param facility The facility to select, or its ICAO.
   */
  public abstract initSelection(facility?: SearchTypeMap[T] | IcaoValue): Promise<void>;

  /** @inheritDoc */
  public onInUse(): void {
    this.infoRef.instance.onInUse();
  }

  /** @inheritDoc */
  public onOutOfUse(): void {
    this.infoRef.instance.onOutOfUse();
  }

  /** @inheritDoc */
  public onOpen(): void {
    this.infoRef.instance.onOpen();

    this.showOnMapSub?.resume(true);
  }

  /** @inheritDoc */
  public onClose(): void {
    this.infoRef.instance.onClose();

    this.showOnMap.set(false);
    this.showOnMapSub?.pause();
  }

  /** @inheritDoc */
  public onResume(): void {
    super.onResume();

    this.infoRef.instance.onResume();
  }

  /** @inheritDoc */
  public onPause(): void {
    super.onPause();

    this.infoRef.instance.onPause();
  }

  /**
   * Sends waypoint selection data to the display pane controlled by this page.
   * @param data The data to send.
   */
  protected sendSelectionData(data: WaypointInfoPaneSelectionData): void {
    this.publisher.pub('display_pane_view_event', {
      displayPaneIndex: this.displayPaneIndex,
      eventType: 'display_pane_waypoint_info_set',
      eventData: data
    }, true, false);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={this.rootCssClass}>
        {this.renderContent(this.infoRef)}
      </div>
    );
  }

  /**
   * Gets CSS classes to apply to this page's root element.
   * @returns CSS classes to apply to this page's root element.
   */
  protected abstract getCssClass(): ClassProp;

  /**
   * Renders this page's contents.
   * @returns This page's contents, rendered as a VNode.
   */
  protected abstract renderContent(infoRef: NodeReference<GtcWaypointInfo<T>>): VNode;

  /**
   * Renders this page's options popup.
   * @param gtcService The GTC service.
   * @param controlMode The control mode to which the popup belongs.
   * @param displayPaneIndex The index of the display pane associated with the popup.
   * @returns This page's options popup, as a VNode.
   */
  protected renderOptionsPopup(gtcService: GtcService, controlMode: GtcControlMode, displayPaneIndex?: ControllableDisplayPaneIndex): VNode {
    return (
      <GtcWaypointInfoOptionsPopup
        gtcService={gtcService}
        controlMode={controlMode}
        displayPaneIndex={displayPaneIndex}
        title={this._title}
        selectedWaypoint={this.selectedWaypoint}
        showOnMap={this.showOnMap}
      />
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.rootCssClass.destroy();

    this.showOnMapSub?.destroy();

    super.destroy();
  }
}

import {
  FacilitySearchType, FacilityWaypoint, FSComponent, GeoPoint, GeoPointSubject, Subject, SubscribableUtils,
  Subscription, VNode
} from '@microsoft/msfs-sdk';

import {
  Fms, GarminFacilityWaypointCache, UnitsUserSettings, WaypointInfoStore
} from '@microsoft/msfs-garminsdk';

import { FlightPlanStore } from '@microsoft/msfs-wtg3000-common';

import { GtcDirectToWaypointTab } from '../../Components/DirectTo/GtcDirectToWaypointTab';
import { GtcNearestTab } from '../../Components/Nearest/GtcNearestTab';
import { TabbedContainer, TabConfiguration } from '../../Components/Tabs/TabbedContainer';
import { TabbedContent } from '../../Components/Tabs/TabbedContent';
import { DirectToController, DirectToInputData } from '../../FlightPlan/DirectToController';
import { DirectToStore } from '../../FlightPlan/DirectToStore';
import { GtcView, GtcViewProps } from '../../GtcService/GtcView';
import { GtcPositionHeadingDataProvider } from '../../Navigation/GtcPositionHeadingDataProvider';

import './GtcDirectToPage.css';

/** Props for the direct to page. */
export interface GtcDirectToPageProps extends GtcViewProps {
  /** An FMS controller */
  fms: Fms;

  /** A provider of position and heading data for the page's main tab. */
  posHeadingDataProvider: GtcPositionHeadingDataProvider;

  /** The flight plan store. */
  flightPlanStore: FlightPlanStore;
}

/**
 * A GTC Direct-To page.
 */
export class GtcDirectToPage extends GtcView<GtcDirectToPageProps> {
  private readonly tabsRef = FSComponent.createRef<TabbedContainer>();
  private readonly nearestTabRef = FSComponent.createRef<GtcNearestTab>();
  private readonly waypointCache = GarminFacilityWaypointCache.getCache(this.bus);

  private readonly ppos = GeoPointSubject.create(new GeoPoint(NaN, NaN));
  private readonly planeHeadingTrue = Subject.create(NaN, SubscribableUtils.NUMERIC_NAN_EQUALITY);

  private readonly selectedWaypointInfo = new WaypointInfoStore(null, this.ppos);
  private readonly store = new DirectToStore(this.ppos, this.selectedWaypointInfo);

  private readonly controller = new DirectToController(this.store, this.props.fms, this.waypointCache);

  private pposPipe?: Subscription;
  private headingPipe?: Subscription;

  /** @inheritDoc */
  public onAfterRender(): void {
    this._title.set('Direct To');

    this.pposPipe = this.props.posHeadingDataProvider.pposWithFailure.pipe(this.ppos, true);
    this.headingPipe = this.props.posHeadingDataProvider.headingTrueWithFailure.pipe(this.planeHeadingTrue, true);
  }

  /** @inheritDoc */
  public override onOpen(): void {
    this.tabsRef.instance.selectTab(1);
    this.nearestTabRef.instance.resetNearestWaypointFilter();
  }

  /** @inheritDoc */
  public override onResume(): void {
    super.onResume();
    this.tabsRef.instance.resume();
    this.pposPipe?.resume(true);
    this.headingPipe?.resume(true);
  }

  /** @inheritDoc */
  public override onPause(): void {
    super.onPause();
    this.tabsRef.instance.pause();
    this.pposPipe?.pause();
    this.headingPipe?.pause();
  }

  /**
   * Sets the target waypoint to be displayed on this page.
   * @param input Data describing the target waypoint. If the data does not define a target, then one will
   * automatically be selected.
   * @returns A Promise which is fulfilled when the target waypoint has been set.
   */
  public setWaypoint(input: DirectToInputData): Promise<void> {
    return this.controller.initializeTarget(input);
  }

  /**
   * Responds to when a waypoint is selected.
   * @param waypoint The selected waypoint.
   */
  private onWaypointSelected(waypoint: FacilityWaypoint): void {
    this.tabsRef.instance.selectTab(1);
    this.selectedWaypointInfo.waypoint.set(waypoint);
  }

  /** @inheritDoc */
  public render(): VNode {
    const waypointTab = FSComponent.createRef<GtcDirectToWaypointTab>();

    return (
      <div class='gtc-direct-to'>
        <TabbedContainer
          ref={this.tabsRef}
          initiallySelectedTabPosition={1}
          configuration={TabConfiguration.Left5}
        >

          <TabbedContent
            position={1}
            label='Waypoint'
            onPause={() => { waypointTab.instance.onPause(); }}
            onResume={() => { waypointTab.instance.onResume(); }}
          >
            <GtcDirectToWaypointTab
              ref={waypointTab}
              gtcService={this.props.gtcService}
              fms={this.props.fms}
              posHeadingDataProvider={this.props.posHeadingDataProvider}
              allowWaypointSelection={true}
              selectedWaypoint={this.selectedWaypointInfo.waypoint as Subject<FacilityWaypoint | null>}
              waypointCache={this.waypointCache}
              selectedWaypointInfo={this.selectedWaypointInfo}
              controller={this.controller}
              flightPlanStore={this.props.flightPlanStore}
              directToStore={this.store}
              unitsSettingManager={UnitsUserSettings.getManager(this.props.gtcService.bus)}
            />
          </TabbedContent>

          <TabbedContent position={2} label="Flight<br/>Plan" disabled={true} />

          <TabbedContent
            position={3}
            label='Nearest'
            onPause={() => this.nearestTabRef.instance?.onPause()}
            onResume={() => this.nearestTabRef.instance?.onResume()}
          >
            <GtcNearestTab
              ref={this.nearestTabRef}
              bus={this.bus}
              activeComponent={this._activeComponent}
              sidebarState={this._sidebarState}
              gtcService={this.props.gtcService}
              controlMode={this.props.controlMode}
              posHeadingDataProvider={this.props.posHeadingDataProvider}
              onSelected={this.onWaypointSelected.bind(this)}
              facilitySearchType={FacilitySearchType.AllExceptVisual}
            />
          </TabbedContent>

          <TabbedContent position={4} label="Recent" disabled={true} />

        </TabbedContainer>
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.tabsRef.getOrDefault()?.destroy();

    this.selectedWaypointInfo.destroy();

    this.pposPipe?.destroy();
    this.headingPipe?.destroy();

    super.destroy();
  }
}

/**
 * Component props for {@link GtcDirectToPageWaypointTab}.
 * @deprecated
 */
export interface GtcDirectToPageWaypointTabProps extends GtcViewProps {
  /** An FMS state manager. */
  fms: Fms;
  /** A provider for position and heading data. */
  posHeadingDataProvider: GtcPositionHeadingDataProvider;
  /** The selected waypoint for the direct to page. */
  selectedWaypoint: Subject<FacilityWaypoint | null>;
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
}

/**
 * A direct to page waypoint tab.
 * @deprecated
 */
export class GtcDirectToPageWaypointTab extends GtcView<GtcDirectToPageWaypointTabProps> {
  private readonly rootRef = FSComponent.createRef<GtcDirectToWaypointTab>();

  /** @inheritdoc */
  public render(): VNode {
    return (
      <GtcDirectToWaypointTab
        ref={this.rootRef}
        gtcService={this.props.gtcService}
        fms={this.props.fms}
        posHeadingDataProvider={this.props.posHeadingDataProvider}
        allowWaypointSelection={true}
        selectedWaypoint={this.props.selectedWaypoint}
        waypointCache={this.props.waypointCache}
        selectedWaypointInfo={this.props.selectedWaypointInfo}
        controller={this.props.controller}
        flightPlanStore={this.props.flightPlanStore}
        directToStore={this.props.directToStore}
        unitsSettingManager={UnitsUserSettings.getManager(this.props.gtcService.bus)}
      />
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.rootRef.getOrDefault()?.destroy();

    super.destroy();
  }
}

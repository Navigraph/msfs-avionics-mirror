import {
  FacilityWaypoint, FSComponent, GeoPoint, GeoPointSubject, Subject, SubscribableUtils, Subscription, VNode
} from '@microsoft/msfs-sdk';

import {
  Fms, GarminFacilityWaypointCache, UnitsUserSettings, WaypointInfoStore
} from '@microsoft/msfs-garminsdk';

import { FlightPlanStore } from '@microsoft/msfs-wtg3000-common';

import { GtcDirectToWaypointTab } from '../../Components/DirectTo/GtcDirectToWaypointTab';
import { TabbedContainer, TabConfiguration } from '../../Components/Tabs/TabbedContainer';
import { TabbedContent } from '../../Components/Tabs/TabbedContent';
import { DirectToController, DirectToInputData } from '../../FlightPlan/DirectToController';
import { DirectToStore } from '../../FlightPlan/DirectToStore';
import { GtcView, GtcViewProps } from '../../GtcService/GtcView';
import { GtcPositionHeadingDataProvider } from '../../Navigation/GtcPositionHeadingDataProvider';

import './GtcDirectToPopup.css';

/**
 * Component props for {@link GtcDirectToPopup}.
 */
export interface GtcDirectToPopupProps extends GtcViewProps {
  /** An FMS controller */
  fms: Fms;

  /** A provider of position and heading data for the page's main tab. */
  posHeadingDataProvider: GtcPositionHeadingDataProvider;

  /** The flight plan store. */
  flightPlanStore: FlightPlanStore;
}

/**
 * A GTC Direct-To popup.
 */
export class GtcDirectToPopup extends GtcView<GtcDirectToPopupProps> {
  private readonly tabsRef = FSComponent.createRef<TabbedContainer>();

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
  public onResume(): void {
    this.tabsRef.instance.resume();
    this.pposPipe?.resume(true);
    this.headingPipe?.resume(true);
  }

  /** @inheritDoc */
  public onPause(): void {
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

  /** @inheritDoc */
  public render(): VNode {
    const waypointTab = FSComponent.createRef<GtcDirectToWaypointTab>();

    return (
      <div class='gtc-direct-to-popup gtc-popup-panel'>
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
              allowWaypointSelection={false}
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

          <TabbedContent position={3} label='Nearest' disabled={true} />

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

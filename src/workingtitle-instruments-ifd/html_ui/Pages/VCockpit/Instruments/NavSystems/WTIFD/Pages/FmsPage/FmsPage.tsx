import { Facility, FacilityLoader, FlightPlanner, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../Charts/IfdChartsManager';
import { DirectToDialog } from '../../Components/DirectTo/DirectToDialog';
import { TabContentContainer } from '../../Components/Tabs/TabContentContainer';
import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { FlightPlanListManager, FlightPlanStore } from '../../FlightPlan';
import { Fms } from '../../Fms';
import { IfdOptions } from '../../IfdOptions';
import { FmsHooksManager } from '../../Navigation/FmsHooksManager';
import { IfdNearestContext } from '../../Navigation/IfdNearestContext';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { FullPageSidebarMode } from '../../Sidebar';
import { TrafficSystem } from '../../Systems/Traffic/TrafficSystem';
import { IfdViewService } from '../../ViewService';
import { IfdPage, IfdPageProps } from '../IfdPage';
import { FplSelectionMenu } from './FplTab/FplSelectionMenu/FplSelectionMenu';
import { FplSelectionMenuController } from './FplTab/FplSelectionMenu/FplSelectionMenuController';
import { FplTab } from './FplTab/FplTab';
import { InfoTab } from './InfoTab/InfoTab';
import { NrstTab } from './NrstTab/NrstTab';
import { WptTab } from './WptTab/WptTab';

import './FmsPage.css';

/** Props for the FmsPage component. */
export interface FmsPageProps extends IfdPageProps {
  /** The fms instance */
  readonly fms: Fms;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** The flight plan list to use. */
  readonly listManager: FlightPlanListManager;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** An instance of the view service. */
  readonly viewService: IfdViewService;
  /** The IFD config options. */
  readonly ifdOptions: IfdOptions;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** The FMS hooks manager. */
  readonly fmsHooks: FmsHooksManager;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** A instance of the traffic system */
  readonly trafficSystem?: TrafficSystem;
  /** The IFD charts manager */
  readonly chartManager: IfdChartsManager;
  /** Nearest context */
  readonly nearestContext: IfdNearestContext;
}

/**
 * The Flight Management System (FMS) page is where flight
 * plans are created, modified, stored, and deleted.
 */
export class FmsPage extends IfdPage<FmsPageProps> {
  private readonly infoFacility = Subject.create<Facility | undefined>(this.props.store.originFacility.get());
  private readonly fplTabRef = FSComponent.createRef<FplTab>();
  public readonly nrstTabRef = FSComponent.createRef<NrstTab>();
  public override readonly tabContentContainerRef = FSComponent.createRef<TabContentContainer>();

  private readonly menuController = new FplSelectionMenuController(this.props.store, this.props.fms, this.props.viewService);

  /**
   * Sets the current FPL tab sidebar mode.
   * @param mode The mode to set.
   */
  public setFplSideBarMode(mode: FullPageSidebarMode): void {
    this.fplTabRef.getOrDefault()?.setSideBarMode(mode);
  }

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.menuController.onInteractionEvent(event)) {
      return true;
    }

    return false;
  }

  /**
   * Sets the info facility.
   * This is used to display the info tab with the correct facility.
   * If the facility is undefined, the info tab will be cleared.
   * @param facility The facility to set.
   */
  public setInfoFacility(facility: Facility | undefined): void {
    this.infoFacility.set(facility);
  }

  /** @inheritdoc */
  public render(): VNode | null {
    return <div class="fms-page ifd-page">
      <TabContentContainer
        ref={this.tabContentContainerRef}
        bus={this.bus}
        activeTab={this.props.pageRef.activeTab}
        viewService={this.viewService}
      >
        <FplTab
          ref={this.fplTabRef}
          bus={this.bus}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'FPL')!}
          fms={this.props.fms}
          store={this.props.store}
          listManager={this.props.listManager}
          facLoader={this.props.facLoader}
          ifdOptions={this.props.ifdOptions}
          mapDataProvider={this.props.mapDataProvider}
          fmsHooks={this.props.fmsHooks}
          flightPlanner={this.props.flightPlanner}
          trafficSystem={this.props.trafficSystem}
          fplSelectionMenuController={this.menuController}
          chartManager={this.props.chartManager}
          nearestContext={this.props.nearestContext}
        />
        <InfoTab
          infoFacility={this.infoFacility}
          bus={this.bus}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'INFO')!}
          ifdOptions={this.props.ifdOptions}
          facLoader={this.props.facLoader}
          fms={this.props.fms}
          chartManager={this.props.chartManager}
          fplSelectionMenuController={this.menuController}
          trafficSystem={this.props.trafficSystem}
          flightPlanner={this.props.flightPlanner}
          mapDataProvider={this.props.mapDataProvider}
          store={this.props.store}
          nearestContext={this.props.nearestContext}
        />
        {/* <RouteTab
          bus={this.bus}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'ROUTE')!}
        /> */}
        <WptTab
          bus={this.bus}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'WPT')!}
          fms={this.props.fms}
          ifdOptions={this.props.ifdOptions}
        />
        <NrstTab
          bus={this.bus}
          viewService={this.viewService}
          facLoader={this.props.facLoader}
          tuningControlsManager={this.props.tuningControlsManager}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'NRST')!}
          mapDataProvider={this.props.mapDataProvider}
          ref={this.nrstTabRef}
          flightPlanner={this.props.flightPlanner}
          trafficSystem={this.props.trafficSystem}
          ifdOptions={this.props.ifdOptions}
          chartsManager={this.props.chartManager}
          fms={this.props.fms}
          store={this.props.store}
        />
      </TabContentContainer>
      <DirectToDialog
        ref={this.viewService.directToDialog}
        bus={this.props.bus}
        facLoader={this.props.facLoader}
        fms={this.props.fms}
        ifdOptions={this.props.ifdOptions}
        menuController={this.menuController}
        viewService={this.viewService}
      />
      <FplSelectionMenu
        menuController={this.menuController}
        selectionMenuRef={this.menuController.selectionMenuRef}
        bus={this.props.bus}
      />
    </div>;
  }
}

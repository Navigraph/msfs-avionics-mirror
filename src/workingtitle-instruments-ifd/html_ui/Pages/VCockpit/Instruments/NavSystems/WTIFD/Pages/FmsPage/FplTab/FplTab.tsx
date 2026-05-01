import { EventBus, FacilityLoader, FlightPlanner, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../Charts/IfdChartsManager';
import { TabContent, TabContentProps } from '../../../Components/Tabs';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { FlightPlanListManager, FlightPlanStore } from '../../../FlightPlan';
import { Fms } from '../../../Fms';
import { IfdOptions } from '../../../IfdOptions';
import { MapContainer } from '../../../Map/MapContainer';
import { FmsHooksManager } from '../../../Navigation/FmsHooksManager';
import { IfdNearestContext } from '../../../Navigation/IfdNearestContext';
import { MapDataProvider } from '../../../Providers/Map/MapDataProvider';
import { FullPageSidebar, FullPageSidebarMode } from '../../../Sidebar';
import { TrafficSystem } from '../../../Systems/Traffic/TrafficSystem';
import { FplContainer } from './FplContainer/FplContainer';
import { FplSelectionMenuController } from './FplSelectionMenu/FplSelectionMenuController';

import './FplTab.css';

/** The properties for the {@link FplTab} component. */
interface FplTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The fms instance */
  readonly fms: Fms;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** The flight plan list to use. */
  readonly listManager: FlightPlanListManager;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The IFD config options to use. */
  readonly ifdOptions: IfdOptions;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** The FMS hooks manager. */
  readonly fmsHooks: FmsHooksManager;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** A instance of the traffic system */
  readonly trafficSystem?: TrafficSystem;
  /** The FPL selection menu controller to use. */
  readonly fplSelectionMenuController: FplSelectionMenuController;
  /** The IFD charts manager */
  readonly chartManager: IfdChartsManager;
  /** Nearest context */
  readonly nearestContext: IfdNearestContext;
}

/** The FplTab component. */
export class FplTab extends TabContent<FplTabProps> {
  public readonly title: string = 'FPL';

  private readonly flightPlanContainerRef = FSComponent.createRef<FplContainer>();

  private readonly sidebarRef = FSComponent.createRef<FullPageSidebar>();
  private readonly isInSidebarMode = Subject.create(false);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  /** @inheritdoc */
  public override resume(): void {
    super.resume();
    // FPL is always shown with the right sidebar (narrow map area).
    this.props.mapDataProvider.isSidebarVisible.set(true);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.FMSHeldLeft:
      case IfdInteractionEvent.FMSHeldRight:
        this.setSideBarMode(!this.isInSidebarMode.get() ? FullPageSidebarMode.Sidebar : FullPageSidebarMode.Full);
        return true;
    }

    return this.flightPlanContainerRef.instance.onInteractionEvent(event);
  }

  /**
   * Handles the PROC btn when this tab is active.
   * Forwards the event to the inner {@link FplContainer}.
   */
  public handleProcBtn(): void {
    this.flightPlanContainerRef.instance?.handleProcBtn();
  }

  /**
   * Sets the current sidebar mode.
   * @param mode The mode to set.
   */
  public setSideBarMode(mode: FullPageSidebarMode): void {
    this.sidebarRef.getOrDefault()?.setSideBarMode(mode);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="fpl-tab">
        <div class={{ 'ifd-narrow-container': true, 'ifd-narrow-page': true }}>
          <MapContainer
            bus={this.props.bus}
            trafficSystem={this.props.trafficSystem}
            facLoader={this.props.facLoader}
            viewService={this.viewService}
            flightPlanner={this.props.flightPlanner}
            mapDataProvider={this.props.mapDataProvider}
            ifdOptions={this.props.ifdOptions}
            fms={this.props.fms}
            class="fpl-tab-map-container"
          />
        </div>

        <FullPageSidebar
          ref={this.sidebarRef}
          isInSidebarMode={this.isInSidebarMode}
          sidebarTabLabel="FPL"
          fullStateTabLabel="MAP"
        >
          <FplContainer
            ref={this.flightPlanContainerRef}
            bus={this.props.bus}
            fms={this.props.fms}
            knobState={this._knobState}
            listManager={this.props.listManager}
            planIndex={Fms.PRIMARY_PLAN_INDEX}
            store={this.props.store}
            facLoader={this.props.facLoader}
            ifdOptions={this.props.ifdOptions}
            lskState={this._lskState}
            viewService={this.viewService}
            fmsHooks={this.props.fmsHooks}
            isInSidebarMode={this.isInSidebarMode}
            fplSelectionMenuController={this.props.fplSelectionMenuController}
            chartManager={this.props.chartManager}
            nearestContext={this.props.nearestContext}
          />
        </FullPageSidebar>
      </div>
    );
  }
}

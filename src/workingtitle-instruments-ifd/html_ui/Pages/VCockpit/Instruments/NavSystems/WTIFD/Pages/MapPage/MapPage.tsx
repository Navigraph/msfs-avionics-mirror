/* eslint-disable max-len */
import { FacilityLoader, FlightPlanner, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../Charts/IfdChartsManager';
import { TabContentContainer } from '../../Components/Tabs';
import { DatablockService } from '../../Datablocks/DatablocksService';
import { FlightPlanStore } from '../../FlightPlan';
import { Fms } from '../../Fms';
import { IfdOptions } from '../../IfdOptions';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { TrafficSystem } from '../../Systems/Traffic/TrafficSystem';
import { IfdPage, IfdPageProps } from '../IfdPage';
import { ChartTab } from './ChartTab/ChartTab';
import { MapTab } from './MapTab/MapTab';
import { RadarTab } from './RadarTab/RadarTab';

import './MapPage.css';

/** Props for the MapPage component. */
export type MapPageProps = IfdPageProps & {
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** An instance of the fms. */
  readonly fms: Fms;
  /** An instance of the flight plan store. */
  readonly flightPlanStore: FlightPlanStore;
  /** An instance of the tcas */
  readonly trafficSystem?: TrafficSystem;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** The instrument configuration. */
  readonly ifdOptions: IfdOptions;
  /** The datablock service instance. */
  readonly datablockService: DatablockService;
  /** The IFD charts manager */
  readonly chartsManager: IfdChartsManager;
};

/**
 * The Map page is where the pilot can view the map.
 */
export class MapPage extends IfdPage<MapPageProps> {
  public override readonly tabContentContainerRef = FSComponent.createRef<TabContentContainer>();

  /** @inheritdoc */
  public render(): VNode | null {
    return <div class="map-page ifd-page">
      <TabContentContainer
        ref={this.tabContentContainerRef}
        bus={this.bus}
        activeTab={this.props.pageRef.activeTab}
        viewService={this.viewService}
      >
        {/* <TawsTab bus={this.bus} viewService={this.viewService} tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'TAWS')!} /> */}
        <MapTab
          mapDataProvider={this.props.mapDataProvider}
          trafficSystem={this.props.trafficSystem}
          flightPlanner={this.props.flightPlanner}
          bus={this.bus}
          ifdOptions={this.props.ifdOptions}
          flightPlanStore={this.props.flightPlanStore}
          fms={this.props.fms}
          viewService={this.viewService}
          facLoader={this.props.facLoader}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'MAP')!}
          datablockService={this.props.datablockService}
        />
        <ChartTab
          ifdOptions={this.props.ifdOptions}
          chartsManager={this.props.chartsManager}
          flightPlanStore={this.props.flightPlanStore}
          facLoader={this.props.facLoader}
          bus={this.bus}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'CHART')!}
        />
        {this.props.ifdOptions.enableWxRadar && <RadarTab
          bus={this.bus}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'RADAR')!}
          instrumentIndex={this.props.ifdOptions.instrumentIndex}
        />}
      </TabContentContainer>
    </div>;
  }
}

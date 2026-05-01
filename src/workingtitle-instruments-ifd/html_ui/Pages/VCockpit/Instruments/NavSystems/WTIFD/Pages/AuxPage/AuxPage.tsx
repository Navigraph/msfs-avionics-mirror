import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../Charts/IfdChartsManager';
import { IfdMapPresetService } from '../../Components/Map/IfdMapPresetService';
import { TabContentContainer } from '../../Components/Tabs/TabContentContainer';
import { DatablockService } from '../../Datablocks/DatablocksService';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { FlightPlanStore } from '../../FlightPlan';
import { IfdOptions } from '../../IfdOptions';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { IfdCasAlertManager } from '../../Systems/Cas/IfdCasAlertManager';
import { TimerManager } from '../../Systems/Timer/TimerManager';
import { IfdPage, IfdPageProps } from '../IfdPage';
import { AlertTab } from './AlertTab/AlertTab';
import { AudioTab } from './AudioTab/AudioTab';
import { SetupTab } from './SetupTab/SetupTab';
import { SysTab } from './SysTab/SysTab';
import { UtilTab } from './UtilTab/UtilTab';

import './AuxPage.css';

/** Props for the AuxPage component. */
export interface AuxPageProps extends IfdPageProps {
  /** The CAS alert manager. */
  casAlertManager: IfdCasAlertManager;
  /** The flight plan store to use */
  flightPlanStore: FlightPlanStore,
  /** An instance of the datablock service. */
  datablockService: DatablockService;
  /** The timer manager to use. */
  readonly timerManager: TimerManager;
  /** The map preset service. */
  readonly mapPresetService: IfdMapPresetService;
  /** The IfdOptions */
  readonly ifdOptions: IfdOptions;
  /** The charts manager */
  readonly chartsManager: IfdChartsManager;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the tuning controls manager. */
  readonly tuningControlsManager: IfdTuningControlsManager;
}

/**
 * The Auxiliary page contains miscelaneaous tabs.
 */
export class AuxPage extends IfdPage<AuxPageProps> {
  public override readonly tabContentContainerRef = FSComponent.createRef<TabContentContainer>();

  /** @inheritdoc */
  public render(): VNode | null {
    return <div class="aux-page ifd-page">
      <TabContentContainer
        ref={this.tabContentContainerRef}
        bus={this.bus}
        activeTab={this.props.pageRef.activeTab}
        viewService={this.viewService}
      >
        <AudioTab
          bus={this.bus}
          viewService={this.viewService}
          ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'AUDIO')!}
          tuningControlsManager={this.props.tuningControlsManager}
        />
        <UtilTab
          bus={this.bus}
          ifdOptions={this.props.ifdOptions}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'UTIL')!}
          timerManager={this.props.timerManager}
        />
        <SetupTab
          bus={this.bus}
          viewService={this.viewService}
          datablockService={this.props.datablockService}
          ifdOptions={this.props.ifdOptions}
          ifdViewService={this.props.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'SETUP')!}
          chartsManager={this.props.chartsManager}
          mapPresetService={this.props.mapPresetService}
          mapDataProvider={this.props.mapDataProvider}
        />
        <SysTab
          bus={this.bus}
          ifdOptions={this.props.ifdOptions}
          flightPlanStore={this.props.flightPlanStore}
          viewService={this.viewService}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'SYS')!}
        />
        <AlertTab
          bus={this.bus}
          viewService={this.viewService}
          casAlertManager={this.props.casAlertManager}
          tabInfo={this.props.pageRef.tabs!.find(tab => tab.title === 'ALERT')!}
        />
      </TabContentContainer>
    </div>;
  }
}

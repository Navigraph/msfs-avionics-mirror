import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { TouchTabGroup, TouchTabInfo } from '../../Components/Tabs';
import { TabContentContainer } from '../../Components/Tabs/TabContentContainer';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { FlightPlanStore } from '../../FlightPlan';
import { IfdNearestContext } from '../../Navigation/IfdNearestContext';
import { IfdCasAlertManager } from '../../Systems/Cas/IfdCasAlertManager';
import { IfdPage, IfdPageProps } from '../IfdPage';
import { IfdPageRegistration } from '../IfdPageRegistration';
import { AirportTab } from './AirportTab/AirportTab';
import { EnrouteTab } from './EnrouteTab/EnrouteTab';
import { RecentTab } from './RecentTab/RecentTab';

import './FreqPage.css';

/** Props for the FreqPage component. */
export interface FreqPageProps extends IfdPageProps {
  /** The CAS alert manager. */
  casAlertManager: IfdCasAlertManager;
  /** The flight plan store to use */
  flightPlanStore: FlightPlanStore;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
  /** Nearest context */
  readonly nearestContext: IfdNearestContext;
}

/**
 * The Frequency page
 */
export class FreqPage extends IfdPage<FreqPageProps> {
  public override readonly tabContentContainerRef = FSComponent.createRef<TabContentContainer>();
  private readonly exitButtonRef = FSComponent.createRef<HTMLDivElement>();

  private readonly topTabs: TouchTabInfo[] = [
    { title: 'Airport', isDefault: true },
    { title: 'Enroute' },
    { title: 'Recent' }
  ];

  private readonly activeTab = Subject.create(this.topTabs.find(tab => tab.isDefault) || this.topTabs[0]);

  public lastPage: IfdPageRegistration | undefined = undefined;
  public lastTab: TouchTabInfo | undefined = undefined;

  /**
   * Called when the FREQ button is pressed.
   */
  public onPageButtonPress(): void {
    const currentTabIndex = this.topTabs.indexOf(this.activeTab.get());
    const newTabIndex = currentTabIndex !== this.topTabs.length - 1 ? currentTabIndex + 1 : 0;

    this.activeTab.set(this.topTabs[newTabIndex]);
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.exitButtonRef.instance.addEventListener('mousedown', () => {
      if (this.lastPage) {
        this.viewService.openPage(this.lastPage.name);
        this.lastTab && this.lastPage.activeTab.set(this.lastTab);
      }
    });
  }

  /** @inheritdoc */
  public render(): VNode | null {
    return <div class="freq-page ifd-page">
      <div>
        <TouchTabGroup tabs={this.topTabs} activeTab={this.activeTab} />
        <div class='freq-page-exit' ref={this.exitButtonRef}>X</div>
      </div>
      <TabContentContainer
        ref={this.tabContentContainerRef}
        bus={this.bus}
        activeTab={this.activeTab}
        viewService={this.viewService}
      >
        <AirportTab bus={this.bus} viewService={this.viewService} tuningControlsManager={this.props.tuningControlsManager} tabInfo={this.topTabs.find(tab => tab.title === 'Airport')!} origin={this.props.flightPlanStore.originFacility} dest={this.props.flightPlanStore.destinationFacility} />
        <EnrouteTab bus={this.bus} viewService={this.viewService} tuningControlsManager={this.props.tuningControlsManager} tabInfo={this.topTabs.find(tab => tab.title === 'Enroute')!} enrouteAirports={this.props.nearestContext.airportsWithin40Nm} />
        <RecentTab bus={this.bus} viewService={this.viewService} tuningControlsManager={this.props.tuningControlsManager} tabInfo={this.topTabs.find(tab => tab.title === 'Recent')!} />
      </TabContentContainer>
    </div>;
  }
}

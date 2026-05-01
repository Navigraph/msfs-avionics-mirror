import { EventBus, FacilityLoader, FlightPlanner, FSComponent, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import { HeadingBox } from '../../../Components/Map/HeadingBox/HeadingBox';
import { TabContent, TabContentProps } from '../../../Components/Tabs';
import { DatablockService } from '../../../Datablocks/DatablocksService';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { FlightPlanStore } from '../../../FlightPlan';
import { Fms } from '../../../Fms';
import { IfdOptions } from '../../../IfdOptions';
import { DetailRampIcon } from '../../../LineSelectKeyButtons/DetailRampIcon';
import { MapBezelController } from '../../../Map/Controllers/MapBezelController';
import { MapContainer } from '../../../Map/MapContainer';
import { MapDataProvider } from '../../../Providers/Map/MapDataProvider';
import { DataSidebar } from '../../../Sidebar/DataSidebar';
import { TrafficSystem } from '../../../Systems/Traffic/TrafficSystem';

import './MapTab.css';

/** The properties for the {@link MapTab} component. */
interface MapTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** An instance of the fms. */
  readonly fms: Fms;
  /** An instance of the flight plan store. */
  readonly flightPlanStore: FlightPlanStore;
  /** A instance of the traffic system */
  readonly trafficSystem?: TrafficSystem;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** The instrument configuration. */
  readonly ifdOptions: IfdOptions;
  /** The datablock service instance. */
  readonly datablockService: DatablockService;
}

/** The MapTab component. */
export class MapTab extends TabContent<MapTabProps> {
  public readonly title: string = 'MAP';

  private readonly outerContainerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly mapContainerRef = FSComponent.createRef<MapContainer>();

  private readonly bezelController = new MapBezelController(this.bus, this.props.mapDataProvider);

  private readonly sidebarRef = FSComponent.createRef<DataSidebar>();
  private readonly isSidebarVisible = Subject.create(false);
  private readonly isSidebarVisibleDelayed = Subject.create(false);

  private sidebarPipe?: Subscription;

  /** @inheritdoc */
  public override resume(): void {
    super.resume();
    this.sidebarPipe = this.isSidebarVisibleDelayed.pipe(this.props.mapDataProvider.isSidebarVisible);
  }

  /** @inheritdoc */
  public override pause(): void {
    super.pause();
    this.sidebarPipe?.destroy();
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this._knobState.leftText.set('Zoom');
    this._knobState.rightText.set('View');

    this._lskState.lsk2.label.set(() =>
      <>Land<br /><DetailRampIcon level={this.props.mapDataProvider.landDetailLevel} /></>
    );
    this._lskState.lsk2.onClick.set(() => {
      this.props.mapDataProvider.landDetailLevel.set((this.props.mapDataProvider.landDetailLevel.get() - 1 + 4) % 4);
    });
    this._lskState.lsk2.isVisible.set(true);
    this._lskState.lsk3.label.set(() =>
      <>Nav<br /><DetailRampIcon level={this.props.mapDataProvider.navDetailLevel} /></>
    );
    this._lskState.lsk3.onClick.set(() => {
      this.props.mapDataProvider.navDetailLevel.set((this.props.mapDataProvider.navDetailLevel.get() - 1 + 4) % 4);
    });
    this._lskState.lsk3.isVisible.set(true);
    this._lskState.lsk4.label.set('Wx Overlay');
    this._lskState.lsk4.isVisible.set(true);
    this._lskState.lsk4.onClick.set(() => {
      const currentState = this.props.mapDataProvider.settings.getSetting('terrWxState').get();
      this.props.mapDataProvider.settings.getSetting('terrWxState').set(
        currentState === 'WX' ? 'OFF' : 'WX'
      );
    });

    this.sidebarRef.instance.isSidebarVisibleDelayed.pipe(this.isSidebarVisibleDelayed);

    this.outerContainerRef.instance.addEventListener('dblclick', this.onDoubleClick);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.MAPHeldLeft:
      case IfdInteractionEvent.MAPHeldRight:
        this.isSidebarVisible.set(!this.isSidebarVisible.get());
        return true;
    }

    return this.bezelController.onInteractionEvent(event);
  }

  private onDoubleClick = (): void => {
    this.mapContainerRef.getOrDefault()?.reCenter();
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'ifd-map-map-tab': true,
        }}
      >
        <div
          ref={this.outerContainerRef}
          class={{
            'ifd-narrow-container': true,
            'ifd-narrow-page': this.isSidebarVisibleDelayed
          }}
        >
          <HeadingBox mapDataProvider={this.props.mapDataProvider} />
          <MapContainer
            ref={this.mapContainerRef}
            bus={this.props.bus}
            trafficSystem={this.props.trafficSystem}
            facLoader={this.props.facLoader}
            viewService={this.props.viewService}
            flightPlanner={this.props.flightPlanner}
            mapDataProvider={this.props.mapDataProvider}
            ifdOptions={this.props.ifdOptions}
            fms={this.props.fms}
            class="map-tab-map-container"
          />
        </div>
        <DataSidebar
          ref={this.sidebarRef}
          viewService={this.viewService}
          bus={this.props.bus}
          datablockService={this.props.datablockService}
          isSidebarVisible={this.isSidebarVisible}
        />
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.outerContainerRef.instance.removeEventListener('dblclick', this.onDoubleClick);

    super.destroy();
  }
}

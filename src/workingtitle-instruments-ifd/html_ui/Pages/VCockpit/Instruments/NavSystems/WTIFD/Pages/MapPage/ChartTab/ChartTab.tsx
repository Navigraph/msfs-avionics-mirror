import { EventBus, FacilityLoader, FlightPlanSegmentType, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../Charts/IfdChartsManager';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { FlightPlanStore } from '../../../FlightPlan';
import { IfdOptions } from '../../../IfdOptions';
import { LineSelectKeyButtonType } from '../../../LineSelectKeyButtons';
import { ChartSelectionPage } from './ChartSelectionPage';
import { ChartViewer } from './Components/ChartViewer';

import './ChartTab.css';

/** The properties for the {@link ChartTab} component. */
interface ChartTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The IFD charts manager */
  readonly chartsManager: IfdChartsManager;
  /** An instance of the flight plan store. */
  readonly flightPlanStore: FlightPlanStore;
  /** The instrument configuration for the IFD. */
  readonly ifdOptions: IfdOptions;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
}

/** The ChartTab component. */
export class ChartTab extends TabContent<ChartTabProps> {
  private readonly selectionPageRef = FSComponent.createRef<ChartSelectionPage>();
  private readonly viewerRef = FSComponent.createRef<ChartViewer>();
  public readonly title: string = 'CHART';

  private readonly isChartSelectionOpen = Subject.create(false);
  private readonly isChartViewerHidden = MappedSubject.create(
    ([chartSelectionOpen, chartSelected]) => chartSelectionOpen === true || chartSelected === undefined,
    this.isChartSelectionOpen, this.props.chartsManager.selectedChart
  ).withLifecycle(this.defaultLifecycle);
  private readonly isNoChartTextHidden = MappedSubject.create(
    ([chartSelectionOpen, chartSelected]) => chartSelectionOpen === true || chartSelected !== undefined,
    this.isChartSelectionOpen, this.props.chartsManager.selectedChart
  ).withLifecycle(this.defaultLifecycle);

  private readonly chartPageLskText = Subject.create('');
  private readonly chartZoomText = Subject.create('');
  private readonly chartAirportName = this.props.chartsManager.selectedAirport.map((v) => v?.ident ?? 'NO AIRPORT').withLifecycle(this.defaultLifecycle);
  private readonly chartName = this.props.chartsManager.selectedChart.map(
    (v) => v ? `${this.props.chartsManager.preferredSource.get()?.isProcedureChart(v.type) ? 'PROCEDURE' : 'AIRPORT'}, ${this.props.chartsManager.getChartName(v)}` : 'NO CHART'
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    if (this.props.chartsManager.selectedAirport.get() === undefined) {
      switch (this.props.flightPlanStore.toLegSegment.get()?.segmentType) {
        case FlightPlanSegmentType.Departure:
        case FlightPlanSegmentType.Destination:
          this.props.chartsManager.selectedAirport.set(this.props.flightPlanStore.originFacility.get()?.icaoStruct);
          break;
        default:
          this.props.chartsManager.selectedAirport.set(this.props.flightPlanStore.destinationFacility.get()?.icaoStruct);
          break;
      }
    }

    this.selectionPageRef.instance.isHidden.sub((v) => {
      this.isChartSelectionOpen.set(!v);
      this.setLsks();
    }, true).withLifecycle(this.defaultLifecycle);

    const viewerRef = this.viewerRef.instance;
    MappedSubject.create(
      ([pageIndex, pages]) => pages.length > 0 ? `${pageIndex + 1} of ${pages.length}` : '',
      viewerRef.pageIndex, viewerRef.pages
    ).pipe(this.chartPageLskText).withLifecycle(this.defaultLifecycle);
    viewerRef.chartScale.sub((v) => this.chartZoomText.set(`${v.toFixed(1)}x`), true);
    this.chartPageLskText.sub((v) => this.isChartSelectionOpen.get() === false && this._lskState.lsk3.value.set(v), true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Sets the LSKs for the primary view of the chart tab
   */
  private setLsks(): void {
    this._lskState.lsk2.isVisible.set(false);
    this._lskState.lsk3.isVisible.set(this.chartPageLskText.get() !== '');
    this._lskState.lsk4.isVisible.set(true);
    this._lskState.lsk3.label.set('Page');
    this._lskState.lsk3.value.set(this.chartPageLskText.get());
    this._lskState.lsk3.type.set(LineSelectKeyButtonType.State);
    this._lskState.lsk3.onClick.set(() => { this.viewerRef.getOrDefault()?.nextPageWithWrap(); });
    this._lskState.lsk4.label.set('Select Chart');
    this._lskState.lsk4.type.set(LineSelectKeyButtonType.Action);
    this._lskState.lsk4.onClick.set(() => this.selectionPageRef.instance.open());

    this._knobState.leftText.set('Zoom');
    this._knobState.rightText.set('Page');
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.isChartSelectionOpen.get() !== false) {
      return this.selectionPageRef.getOrDefault()?.onInteractionEvent(event) ?? false;
    } else {
      const viewerRef = this.viewerRef.getOrDefault();

      switch (event) {
        case IfdInteractionEvent.RightKnobPush:
          break;
        case IfdInteractionEvent.RightKnobOuterDec:
          viewerRef?.decreaseZoom();
          break;
        case IfdInteractionEvent.RightKnobOuterInc:
          viewerRef?.increaseZoom();
          break;
        case IfdInteractionEvent.RightKnobInnerDec:
          viewerRef?.prevPage();
          break;
        case IfdInteractionEvent.RightKnobInnerInc:
          viewerRef?.nextPage();
          break;
      }
    }

    return this.selectionPageRef.getOrDefault()?.onInteractionEvent(event) ?? false;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="ifd-map-chart-tab">
        <div class={{ 'chart-viewer-container': true, 'hidden': this.isChartViewerHidden }}>
          <div class='chart-view-topbar'>
            <p class='chart-airport'>{this.chartAirportName}</p>
            <p class='chart-name'>{this.chartName}</p>
          </div>
          <div class='chart-viewer-bottom-bar'>
            <p class='chart-viewer-page'>{this.chartPageLskText}</p>
            <p class='chart-viewer-zoom'>{this.chartZoomText}</p>
          </div>
          <ChartViewer
            ref={this.viewerRef}
            bus={this.props.bus}
            chartManager={this.props.chartsManager}
            isHidden={this.isChartViewerHidden}
          />
        </div>
        <div class={{ 'chart-page-no-chart': true, 'hidden': this.isNoChartTextHidden }}>
          <p>No Chart Selected</p>
        </div>
        <ChartSelectionPage
          ref={this.selectionPageRef}
          chartsManager={this.props.chartsManager}
          bus={this.props.bus}
          flightPlanStore={this.props.flightPlanStore}
          facLoader={this.props.facLoader}
          ifdOptions={this.props.ifdOptions}
          lskState={this._lskState}
        />
      </div>
    );
  }
}

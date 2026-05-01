import {
  AhrsEvents, ChartPage, ChartsClient, ChartView, ChartViewLambertConformalConicProjection, ComponentProps, CssTransformBuilder, CssTransformSubject,
  DisplayComponent, EventBus, FSComponent, GeoPoint, GeoPointSubject, GeoReferencedChartArea, GNSSEvents, MappedSubject, NavMath, Subject, Subscribable, VNode,
  Wait
} from '@microsoft/msfs-sdk';

import { IfdChartImageSupplier } from '../../../../Charts/IfdChartImageSupplier';
import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';

import './ChartViewer.css';

/** The properties for the {@link ChartsViewer} component. */
export interface ChartsViewerProps extends ComponentProps {
  /** Event bus */
  bus: EventBus
  /** The IFD chart manager */
  chartManager: IfdChartsManager;
  /** Is this view hidden? */
  isHidden: Subscribable<boolean>;
}

/** A viewer of charts */
export class ChartViewer extends DisplayComponent<ChartsViewerProps> {
  private static readonly CHART_VIEW_WIDTH_PX = 494;
  private static readonly CHART_VIEW_HEIGHT_PX = 402;

  private readonly chartWrapperRef = FSComponent.createRef<HTMLDivElement>();
  private readonly chartImageRef = FSComponent.createRef<HTMLImageElement>();
  private readonly chartContainerRef = FSComponent.createRef<HTMLDivElement>();

  private readonly chartsImageSupplier = new IfdChartImageSupplier();

  private readonly isFollowingOwnship = Subject.create(true);
  private readonly isPanning = Subject.create(false);
  private chartPanStartX = 0;
  private chartPanStartY = 0;
  private chartPanAmountX = 0;
  private chartPanAmountY = 0;

  private readonly chartPanOffsetX = Subject.create(0);
  private readonly chartPanOffsetY = Subject.create(0);

  private readonly chartTransformOriginX = Subject.create(0);
  private readonly chartTransformOriginY = Subject.create(0);
  private readonly chartTranslateTransform = CssTransformBuilder.translate('px');
  private readonly chartScaleTransform = CssTransformBuilder.scale();
  public readonly chartScale = Subject.create(1);
  private readonly chartTransform = CssTransformSubject.create(
    CssTransformBuilder.concat(this.chartTranslateTransform, this.chartScaleTransform)
  );

  public readonly pages = Subject.create<ChartPage[]>([]);
  public readonly pageIndex = Subject.create(0);
  private readonly currentPage = MappedSubject.create(
    ([pages, pageIndex]) => pages[pageIndex] ?? null,
    this.pages,
    this.pageIndex
  );

  private readonly planePpos = GeoPointSubject.create(new GeoPoint(0, 0));
  private readonly planeTrueHeading = Subject.create(0);
  public readonly ownshipVisible = Subject.create(false);
  private readonly ownshipX = Subject.create(0);
  private readonly ownshipY = Subject.create(0);
  private readonly ownshipRotation = Subject.create(0);

  private chartView = new ChartView();
  private currentPageGeoreferencedArea: GeoReferencedChartArea | null = null;
  private readonly lccProjection = new ChartViewLambertConformalConicProjection();

  /**
   * Increases the chart zoom, wrapping around to 1x after 3x zoom is chosen
   */
  public increaseZoom(): void {
    this.chartScale.set(Math.min(this.chartScale.get() + 0.2, 5));
  }

  /**
   * Decreases the chart zoom, wrapping around to 1x after 3x zoom is chosen
   */
  public decreaseZoom(): void {
    this.chartScale.set(Math.max(this.chartScale.get() - 0.2, 1));
  }

  /**
   * Views the next chart page, wrapping around to the first page if the last available page is selected
   */
  public nextPageWithWrap(): void {
    const currentPage = this.pageIndex.get();
    const nextPage = currentPage === this.pages.get().length - 1 ? 0 : currentPage + 1;

    this.pageIndex.set(nextPage);
  }

  /**
   * Views the next chart page, wrapping around to the first page if the last available page is selected
   */
  public nextPage(): void {
    this.pageIndex.set(Math.min(this.pageIndex.get() + 1, this.pages.get().length - 1));
  }

  /**
   * Views the previous chart page, wrapping around to the first page if the last available page is selected
   */
  public prevPage(): void {
    this.pageIndex.set(Math.max(this.pageIndex.get() - 1, 0));
  }

  /**
   * Centers the chart to the aircraft ownship icon
   */
  public centerAircraft(): void {
    this.isFollowingOwnship.set(true);

    const chartViewCenterX = ChartViewer.CHART_VIEW_WIDTH_PX / 2;
    const chartViewCenterY = ChartViewer.CHART_VIEW_HEIGHT_PX / 2;

    const ownshipX = this.ownshipX.get();
    const ownshipY = this.ownshipY.get();

    const offsetX = chartViewCenterX - ownshipX;
    const offsetY = chartViewCenterY - ownshipY;

    this.chartPanOffsetX.set(offsetX);
    this.chartPanOffsetY.set(offsetY);

    this.chartTransformOriginX.set(ownshipX);
    this.chartTransformOriginY.set(ownshipY);
  }

  /**
   * Fits the chart to the viewing area
   */
  public fitToViewArea(): void {
    const page = this.currentPage.get();

    this.chartScale.set(1);

    this.isFollowingOwnship.set(false);
    this.fitChartToContainer(page);
  }

  /**
   * Centers the chart to the middle of the viewing area
   */
  public centerChart(): void {
    this.isFollowingOwnship.set(false);

    const chartRect = this.chartImageRef.instance.getBoundingClientRect();
    const chartScale = this.chartScale.get();
    const chartWidth = chartRect.width / chartScale;
    const chartHeight = chartRect.height / chartScale;

    const widthDiff = ChartViewer.CHART_VIEW_WIDTH_PX - chartWidth;
    const heightDiff = ChartViewer.CHART_VIEW_HEIGHT_PX - chartHeight;

    this.chartPanOffsetX.set(widthDiff / 2);
    this.chartPanOffsetY.set(heightDiff / 2);
  }

  private handleChartImageLoad = (): void => {
    const currentPage = this.currentPage.get();

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!currentPage) {
      return;
    }

    // We need to wait for the image to actually load otherwise we get botched calculations
    Wait.awaitCondition(() => {
      const chartRect = this.chartImageRef.instance.getBoundingClientRect();
      return chartRect.height > 0 && chartRect.width > 0;
    }, 20).then(() => {
      this.chartScale.set(1);

      this.fitChartToContainer(currentPage);
      this.centerChart();

      if (currentPage.geoReferenced) {
        const geoReferencedArea = currentPage.areas.find((it) => it.geoReferenced) as
          | GeoReferencedChartArea
          | undefined;

        if (!geoReferencedArea) {
          this.currentPageGeoreferencedArea = null;

          throw new Error(
            '[ChartViewerPage] Chart page claims to be georeferenced but has no georeferenced areas'
          );
        }

        this.lccProjection.setParametersFromChartAreaProjection(geoReferencedArea.projection);
        this.currentPageGeoreferencedArea = geoReferencedArea;
      } else {
        this.lccProjection.reset();
        this.currentPageGeoreferencedArea = null;
      }

      this.adjustChartTransformOrigin();
      this.updateOwnship();
    });
  };

  private handleChartMouseDown = ({ screenX, screenY }: MouseEvent): void => {
    if (!this.isPanning.get()) {
      this.isPanning.set(true);
      this.isFollowingOwnship.set(false);

      this.chartPanAmountX = 0;
      this.chartPanAmountY = 0;

      this.chartPanStartX = screenX;
      this.chartPanStartY = screenY;
    }
  };

  private handleChartMouseUp = (): void => {
    if (this.isPanning.get()) {
      this.isPanning.set(false);

      this.adjustChartTransformOrigin();
    }
  };

  private handleChartMouseMove = ({ screenX, screenY }: MouseEvent): void => {
    if (!this.isPanning.get()) {
      return;
    }

    const dx = screenX - this.chartPanStartX;
    const dy = screenY - this.chartPanStartY;

    this.chartPanStartX = screenX;
    this.chartPanStartY = screenY;

    this.chartPanAmountX += dx;
    this.chartPanAmountY += dy;

    this.chartPanOffsetX.set(this.chartPanOffsetX.get() + dx);
    this.chartPanOffsetY.set(this.chartPanOffsetY.get() + dy);
  };

  /**
   * Updates the displayed chart image from the currently selected page, and chart manager data.
   */
  private tryUpdateDisplayedChart = (): void => {
    const page = this.currentPage.get();
    if (page) {
      const url = this.props.chartManager.getUrl(page);
      if (url) {
        this.chartsImageSupplier.showChartImage(url.url);
      }
    }
  };

  /** @inheritdoc */
  public onAfterRender(): void {
    this.props.chartManager.preferredSource.sub((v) => {
      if (v) {
        this.chartsImageSupplier.setChartsSource(v);
      }
    }, true);

    // Update the displayed chart if the day/night mode settings changed.
    this.props.chartManager.chartDisplayMode.sub(this.tryUpdateDisplayedChart);
    this.currentPage.sub(this.tryUpdateDisplayedChart, true);

    const planeEvents = this.props.bus.getSubscriber<GNSSEvents & AhrsEvents>();
    planeEvents.on('gps-position').handle((({ lat, long }) => this.planePpos.set(lat, long)));
    planeEvents.on('actual_hdg_deg_true').withPrecision(0).handle((track) => this.planeTrueHeading.set(track));

    this.props.chartManager.selectedChart.sub(async (chart) => {
      if (!chart || this.chartView === null) {
        return;
      }

      const pages = await ChartsClient.getChartPages(chart.guid);

      this.pages.set(pages.pages);
      this.pageIndex.set(0);
    }, true);

    MappedSubject.create(
      ([x, y]) => {
        this.chartTranslateTransform.set(x, y);

        this.chartTransform.resolve();
      },
      this.chartPanOffsetX,
      this.chartPanOffsetY
    );

    this.chartScale.sub((scale) => {
      this.chartScaleTransform.set(scale, scale);

      this.chartTransform.resolve();
    }, true);
    MappedSubject.create(() => this.updateOwnship(), this.planePpos, this.planeTrueHeading);

    this.chartImageRef.instance.addEventListener('load', this.handleChartImageLoad);
    this.chartImageRef.instance.addEventListener('mousedown', this.handleChartMouseDown);
    this.chartImageRef.instance.addEventListener('mouseup', this.handleChartMouseUp);
    this.chartImageRef.instance.addEventListener('mousemove', this.handleChartMouseMove);
  }

  /** Sets the chart transform origin based on the amount of panning */
  private adjustChartTransformOrigin(): void {
    const chartRect = this.chartImageRef.instance.getBoundingClientRect();
    const containerRect = this.chartContainerRef.instance.getBoundingClientRect();

    const chartScale = this.chartScale.get();

    const chartPosAtCenterX =
      (containerRect.x + containerRect.width / 2 - chartRect.x) / chartScale;
    const chartPosAtCenterY =
      (containerRect.y + containerRect.height / 2 - chartRect.y) / chartScale;

    this.chartTransformOriginX.set(chartPosAtCenterX);
    this.chartTransformOriginY.set(chartPosAtCenterY);

    const transformX = this.chartPanOffsetX.get() - this.chartPanAmountX + this.chartPanAmountX / chartScale;
    const transformY = this.chartPanOffsetY.get() - this.chartPanAmountY + this.chartPanAmountY / chartScale;

    this.chartPanOffsetX.set(transformX);
    this.chartPanOffsetY.set(transformY);
  }

  /**
   * Resizes the specified rendered chart page to fit inside the viewer container
   * @param page The specified chart page
   */
  private fitChartToContainer(page: ChartPage): void {
    this.chartPanOffsetX.set(0);
    this.chartPanOffsetY.set(0);

    const chartAspectRatio = page.width / page.height;

    if (chartAspectRatio > 1) {
      // Landscape
      this.chartImageRef.instance.style.width = `${ChartViewer.CHART_VIEW_WIDTH_PX}px`;
      this.chartImageRef.instance.style.height = 'auto';
      this.chartWrapperRef.instance.style.width = `${ChartViewer.CHART_VIEW_WIDTH_PX}px`;
      this.chartWrapperRef.instance.style.height = 'auto';
    } else {
      this.chartImageRef.instance.style.width = 'auto';
      this.chartImageRef.instance.style.height = `${ChartViewer.CHART_VIEW_WIDTH_PX}px`;
      this.chartWrapperRef.instance.style.width = 'auto';
      this.chartWrapperRef.instance.style.height = `${ChartViewer.CHART_VIEW_WIDTH_PX}px`;
    }
  }

  /**
   * Updates the aircraft ownship
   */
  private updateOwnship(): void {
    const { lat, lon } = this.planePpos.get();
    const planeTrack = this.planeTrueHeading.get();
    const projectionValid = this.lccProjection.valid.get();
    const currentPage = this.currentPage.get();
    const geoReferencedArea = this.currentPageGeoreferencedArea;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!currentPage || !projectionValid || !geoReferencedArea) {
      this.ownshipVisible.set(false);
      return;
    }

    this.ownshipVisible.set(true);

    const topLeft = new Float64Array(2);
    const bottomRight = new Float64Array(2);
    const ownship = new Float64Array(2);

    this.lccProjection.project(
      geoReferencedArea.worldRectangle.upperLeft[1],
      geoReferencedArea.worldRectangle.upperLeft[0],
      topLeft
    );
    this.lccProjection.project(
      geoReferencedArea.worldRectangle.lowerRight[1],
      geoReferencedArea.worldRectangle.lowerRight[0],
      bottomRight
    );

    const pxExtentX =
      geoReferencedArea.chartRectangle.lowerRight[0] - geoReferencedArea.chartRectangle.upperLeft[0];
    const pxExtentY =
      geoReferencedArea.chartRectangle.lowerRight[1] - geoReferencedArea.chartRectangle.upperLeft[1];
    const lccExtentX = Math.abs(bottomRight[0] - topLeft[0]);
    const lccExtentY = Math.abs(bottomRight[1] - topLeft[1]);
    const lccTheta = Math.atan2(lccExtentY, lccExtentX);
    const lccHypot = Math.sqrt(lccExtentX ** 2 + lccExtentY ** 2);
    const lccExtentXAdjusted =
      Math.cos(lccTheta - geoReferencedArea.worldRectangle.orientation * (Math.PI / 180)) * lccHypot;
    const lccExtentYAdjusted =
      Math.sin(lccTheta - geoReferencedArea.worldRectangle.orientation * (Math.PI / 180)) * lccHypot;

    this.lccProjection.project(lat, lon, ownship);
    const ownshipAdjacent = Math.abs(ownship[0] - topLeft[0]);
    const ownshipOpposite = Math.abs(ownship[1] - topLeft[1]);
    const ownshipTheta = Math.atan2(ownshipOpposite, ownshipAdjacent);
    const ownshipPxHypot = Math.sqrt(ownshipAdjacent ** 2 + ownshipOpposite ** 2);
    const ownshipLccXRotated =
      Math.cos(ownshipTheta - geoReferencedArea.worldRectangle.orientation * (Math.PI / 180)) * ownshipPxHypot;
    const ownshipLccYRotated =
      Math.sin(ownshipTheta - geoReferencedArea.worldRectangle.orientation * (Math.PI / 180)) * ownshipPxHypot;

    const ownshipPxX = (Math.abs(ownshipLccXRotated) / lccExtentXAdjusted) * pxExtentX;
    const ownshipPxY = (Math.abs(ownshipLccYRotated) / lccExtentYAdjusted) * pxExtentY;

    const chartImageRect = this.chartImageRef.instance.getBoundingClientRect();
    const documentPxToImagePx = chartImageRect.width / this.chartScale.get() / currentPage.width;

    this.ownshipX.set(
      geoReferencedArea.chartRectangle.upperLeft[0] * documentPxToImagePx + ownshipPxX * documentPxToImagePx
    );
    this.ownshipY.set(
      geoReferencedArea.chartRectangle.upperLeft[1] * documentPxToImagePx + ownshipPxY * documentPxToImagePx
    );
    this.ownshipRotation.set(
      NavMath.normalizeHeading(planeTrack - geoReferencedArea.worldRectangle.orientation)
    );

    if (this.isFollowingOwnship.get() === true) {
      this.centerAircraft();
    }
  }

  /** @inheritdoc*/
  public render(): VNode {
    return (
      <div class={{ 'chart-viewer': true, 'hidden': this.props.isHidden }}>
        <div ref={this.chartContainerRef}>
          <div
            ref={this.chartWrapperRef}
            class='chart-view-wrapper'
            style={{
              'transform-origin-x': this.chartTransformOriginX.map((it) => `${it}px`),
              'transform-origin-y': this.chartTransformOriginY.map((it) => `${it}px`),
              transform: this.chartTransform,
            }}
          >
            <img ref={this.chartImageRef} src={this.chartsImageSupplier.image.map(image => image.imageUrl)} />
            <img
              src={'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/ifd-airplane-map.png'}
              class={'ownship-icon'}
              style={{
                visibility: this.ownshipVisible.map((it) => (it ? 'visible' : 'hidden')),
                left: this.ownshipX.map((it) => `${it}px`),
                top: this.ownshipY.map((it) => `${it}px`),
                transform: this.ownshipRotation.map(
                  (rotation) => `translate(-50%, -50%) rotate(${rotation}deg)`
                ),
              }}
            ></img>
          </div>
        </div>
      </div>
    );
  }
}

import {
  ArrayUtils, BuiltInChartProvider, ChartArea, ChartImageSupplier, ChartMetadata, ChartPage, ChartsClient, ChartService, ChartUrl, ChartView, FaaChartType,
  GeoReferencedChartArea, IcaoValue, SimChartService, Subject, Subscribable
} from '@microsoft/msfs-sdk';

import { IfdBuiltInChartsSourceIds } from './IfdBuiltInChartsSourceIds';
import { IfdChartsSource, IfdChartsSourcePageSectionDefinition, IfdChartsSourceStatus } from './IfdChartsSource';
import { IfdChartsPageData } from './IfdChartsTypes';

/**
 * A source of FAA electronic chart data.
 */
export class FaaChartsSource implements IfdChartsSource {
  private static readonly INFO_CHART_TYPE_PRIORITY: Partial<Record<string, number>> = {
    [FaaChartType.Apd]: 0,
    [FaaChartType.Hot]: 1,
    [FaaChartType.Dau]: 2,
    [FaaChartType.Odp]: 3,
    [FaaChartType.Lah]: 4,
    [FaaChartType.Min]: 5,
  };

  /** @inheritDoc */
  public readonly uid = IfdBuiltInChartsSourceIds.Faa;

  /** @inheritDoc */
  public readonly name = 'FAA';

  /** @inheritDoc */
  public readonly provider = BuiltInChartProvider.Faa;

  /** @inheritDoc */
  public readonly status = Subject.create(IfdChartsSourceStatus.Ready) as Subscribable<IfdChartsSourceStatus>;

  /** @inheritDoc */
  public readonly pageSectionDefinitions: readonly IfdChartsSourcePageSectionDefinition[] = [];

  private readonly chartService = new SimChartService();

  /** @inheritDoc */
  public getChartService(): ChartService {
    return this.chartService;
  }

  /** @inheritDoc */
  public createChartImageSupplier(): ChartImageSupplier {
    const view = new ChartView();
    ChartsClient.initializeChartView(view);
    return view;
  }

  /** @inheritdoc */
  public async getChartsForAirport(airport: IcaoValue): Promise<ChartMetadata[]> {
    const chartIndex = await this.getChartService().getIndexForAirport(this.provider, airport);

    return ArrayUtils.flatMap(chartIndex.charts, (v) => v.charts).sort(this.sortCharts.bind(this));
  }

  /** @inheritDoc */
  public getPrimaryAirportChart(charts: readonly ChartMetadata[]): ChartMetadata | undefined {
    // We select the APD chart with the lowest name length (to avoid selecting an A380 chart by default for example)
    // Otherwise we select no charts
    if (charts) {
      const agcCharts = charts.filter((chart) => chart.type === FaaChartType.Apd);
      if (agcCharts.length > 0) {
        return agcCharts.sort((a, b) => a.name.length - b.name.length)[0];
      }
    }

    return undefined;
  }

  /** @inheritdoc */
  public getChartName(metadata: ChartMetadata): string {
    return metadata.name;
  }

  /** @inheritDoc */
  public getDayUrl(pageData: ChartPage): ChartUrl | undefined {
    return pageData.urls.find(url => url.name === 'light_png');
  }

  /** @inheritDoc */
  public getNightUrl(pageData: ChartPage): ChartUrl | undefined {
    return this.getDayUrl(pageData);
  }

  /** @inheritDoc */
  public getGeoReferencedArea(pageData: IfdChartsPageData, area: ChartArea | null): GeoReferencedChartArea | undefined {
    if (!area || area.layer === 'Low') {
      return pageData.page.areas.find(query => query.geoReferenced && query.layer === 'Low') as GeoReferencedChartArea | undefined;
    } else {
      return undefined;
    }
  }

  /**
   * Sorts airport information charts.
   * @param a The first chart.
   * @param b The second chart.
   * @returns A negative number if the first chart is to be sorted before the second chart, a positive number if the
   * first chart is to be sorted after the second chart, or zero if the two charts have the same sorting order.
   */
  private sortCharts(a: ChartMetadata<string>, b: ChartMetadata<string>): number {
    if (this.isProcedureChart(a.type) || this.isProcedureChart(b.type)) {
      if (a.type === b.type) {
        if (a.type === FaaChartType.Apd) {
          const isAAirportDiagram = a.name === 'AIRPORT DIAGRAM';
          const isBAirportDiagram = b.name === 'AIRPORT DIAGRAM';
          if (isAAirportDiagram && !isBAirportDiagram) {
            return -1;
          } else if (!isAAirportDiagram && isBAirportDiagram) {
            return 1;
          }
        }

        return a.name.length - b.name.length;
      } else {
        return (FaaChartsSource.INFO_CHART_TYPE_PRIORITY[a.type] ?? Number.MAX_SAFE_INTEGER)
          - (FaaChartsSource.INFO_CHART_TYPE_PRIORITY[b.type] ?? Number.MAX_SAFE_INTEGER);
      }
    } else {
      return a.name.localeCompare(b.name);
    }
  }

  /**
   * Checks whether this is a procedure chart.
   * @param type The chart type
   * @returns True if this is a procedure chart, otherwise false for an airport chart.
   */
  public isProcedureChart(type: string): boolean {
    switch (type) {
      case FaaChartType.Iap:
      case FaaChartType.Min:
      case FaaChartType.Dp:
      case FaaChartType.Star:
      case FaaChartType.Odp:
      case FaaChartType.Lah:
      case FaaChartType.Dau:
        return true;
      default:
        return false;
    }
  }
}

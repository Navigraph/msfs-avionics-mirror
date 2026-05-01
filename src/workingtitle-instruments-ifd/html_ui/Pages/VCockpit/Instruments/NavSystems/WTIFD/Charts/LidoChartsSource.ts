import {
  ArrayUtils, BuiltInChartProvider, ChartArea, ChartImageSupplier, ChartMetadata, ChartPage, ChartsClient, ChartService, ChartUrl, ChartView,
  GeoReferencedChartArea, IcaoValue, LidoChartType, SimChartService, Subject, Subscribable
} from '@microsoft/msfs-sdk';

import { IfdBuiltInChartsSourceIds } from './IfdBuiltInChartsSourceIds';
import { IfdChartsSource, IfdChartsSourcePageSectionDefinition, IfdChartsSourceStatus } from './IfdChartsSource';
import { IfdChartsPageData } from './IfdChartsTypes';

/**
 * A source of LIDO electronic chart data.
 */
export class LidoChartsSource implements IfdChartsSource {
  private static readonly INFO_CHART_TYPE_PRIORITY: Partial<Record<string, number>> = {
    [LidoChartType.Agc]: 0,
    [LidoChartType.Apc]: 1,
    [LidoChartType.Afc]: 2,
    [LidoChartType.Aoi]: 3,
    [LidoChartType.Lvc]: 4,
  };

  /** @inheritDoc */
  public readonly uid = IfdBuiltInChartsSourceIds.Lido;

  /** @inheritDoc */
  public readonly name = 'LIDO';

  /** @inheritDoc */
  public readonly provider = BuiltInChartProvider.Lido;

  /** @inheritDoc */
  public readonly status = Subject.create(IfdChartsSourceStatus.Ready) as Subscribable<IfdChartsSourceStatus>;

  /** @inheritDoc */
  public readonly pageSectionDefinitions: readonly IfdChartsSourcePageSectionDefinition[] = [
    {
      uid: 'LIDO.Plan',
      name: 'Plan',

      /** @inheritDoc */
      getArea(pageData) {
        return pageData.page.areas.find(area => area.layer === 'Low');
      },
    },
  ];

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

  /** @inheritDoc */
  public async getChartsForAirport(airport: IcaoValue): Promise<ChartMetadata[]> {
    const chartIndex = await this.getChartService().getIndexForAirport(this.provider, airport);

    return ArrayUtils.flatMap(chartIndex.charts, (v) => v.charts).sort(this.sortCharts.bind(this));
  }

  /** @inheritDoc */
  public getPrimaryAirportChart(charts: readonly ChartMetadata[]): ChartMetadata | undefined {
    // We prioritise AGC charts, with the lowest name length (to avoid selecting an A380 chart by default for example)
    // If no AGC charts, we will select an APC chart
    // Otherwise we select no charts
    const agcCharts = charts.filter((chart) => chart.type === LidoChartType.Agc);
    if (agcCharts.length > 0) {
      return agcCharts.sort((a, b) => a.name.length - b.name.length)[0];
    } else {
      const apcCharts = charts.filter((chart) => chart.type === LidoChartType.Apc);
      if (apcCharts.length > 0) {
        return apcCharts.sort((a, b) => a.name.length - b.name.length)[0];
      }
    }

    return undefined;
  }

  /** @inheritdoc */
  public getChartName(metadata: ChartMetadata): string {
    switch (metadata.type) {
      case LidoChartType.Agc:
        return metadata.name.replace('AGC', 'Airport Diagram');
      case LidoChartType.Afc:
        return metadata.name.replace('AFC', 'Airport Facilities');
      case LidoChartType.Apc:
        return metadata.name.replace('APC', 'Airport Parking');
      case LidoChartType.Aoi:
        return metadata.name.replace('AOI', 'Airport Operational Info');
      case LidoChartType.Lvc:
        return metadata.name.replace('LVC', 'Low Visibility Chart');
      case LidoChartType.Mrc:
        return metadata.name.replace('MRC', 'Minimum Radar Vectoring Chart');
      default:
        return metadata.name;
    }
  }

  /** @inheritDoc */
  public getDayUrl(pageData: ChartPage): ChartUrl | undefined {
    return pageData.urls.find(url => url.name === 'light_png');
  }

  /** @inheritDoc */
  public getNightUrl(pageData: ChartPage): ChartUrl | undefined {
    return pageData.urls.find(url => url.name === 'dark_png');
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
   * Checks whether this is a procedure chart.
   * @param type The chart type
   * @returns True if this is a procedure chart, otherwise false for an airport chart.
   */
  public isProcedureChart(type: string): boolean {
    switch (type) {
      case LidoChartType.Sid:
      case LidoChartType.SidPt:
      case LidoChartType.SidInitialClimb:
      case LidoChartType.ObstDep:
      case LidoChartType.Iac:
      case LidoChartType.Vac:
      case LidoChartType.Star:
        return true;
      default:
        return false;
    }
  }

  /**
   * Sorts charts.
   * @param a The first chart.
   * @param b The second chart.
   * @returns A negative number if the first chart is to be sorted before the second chart, a positive number if the
   * first chart is to be sorted after the second chart, or zero if the two charts have the same sorting order.
   */
  private sortCharts(a: ChartMetadata<string>, b: ChartMetadata<string>): number {
    if (this.isProcedureChart(a.type) || this.isProcedureChart(b.type)) {
      if (a.type === b.type) {
        if (a.type === LidoChartType.Agc) {
          const isAAgc = a.name === 'AGC';
          const isBAgc = b.name === 'AGC';
          if (isAAgc && !isBAgc) {
            return -1;
          } else if (!isAAgc && isBAgc) {
            return 1;
          }
        }

        return a.name.length - b.name.length;
      } else {
        return (LidoChartsSource.INFO_CHART_TYPE_PRIORITY[a.type] ?? Number.MAX_SAFE_INTEGER)
          - (LidoChartsSource.INFO_CHART_TYPE_PRIORITY[b.type] ?? Number.MAX_SAFE_INTEGER);
      }
    } else {
      return a.name.localeCompare(b.name);
    }
  }
}

import {
  ChartMetadata, ChartPage, ChartUrl, ConsumerSubject, EventBus, IcaoValue, MappedSubject, PluginSystem, Subject, Subscribable
} from '@microsoft/msfs-sdk';

import { IfdIlluminationEvents, IfdIlluminationMode } from '../Events/IfdIlluminationEvents';
import { IfdPlugin, IfdPluginBinder } from '../IfdPlugin';
import { ChartsAutoDisplayMode, ChartsDisplayMode, ChartsUserSettings } from '../Settings/ChartsUserSettings';
import { IfdBuiltInChartsSourceIds } from './IfdBuiltInChartsSourceIds';
import { IfdBuiltInChartsSourceProvider } from './IfdBuiltInChartsSources';
import { IfdChartsSource, IfdChartsSourceFactory } from './IfdChartsSource';

/** Manager for handling IFD charts */
export class IfdChartsManager {

  public readonly sources = new Map<string, IfdChartsSource>();

  private readonly chartSettings = ChartsUserSettings.getManager(this.bus);

  public readonly preferredSourceUid = this.chartSettings.getSetting('chartSourceUid');
  public readonly preferredSource = Subject.create<IfdChartsSource | undefined>(undefined);

  public readonly selectedAirport = Subject.create<IcaoValue | undefined>(undefined);
  public readonly selectedChart = Subject.create<ChartMetadata | undefined>(undefined);

  private readonly illuminationModePhotocell = ConsumerSubject.create(this.bus.getSubscriber<IfdIlluminationEvents>().on('ifd_illumination_mode_photocell'), IfdIlluminationMode.Day);
  private readonly illuminationModeDimBus = ConsumerSubject.create(this.bus.getSubscriber<IfdIlluminationEvents>().on('ifd_illumination_mode_dimbus'), IfdIlluminationMode.Day);

  private readonly _chartDisplayMode = MappedSubject.create(
    ([modeSetting, autoSource, photocellMode, dimBusMode]): ChartsDisplayMode.Day | ChartsDisplayMode.Night => {
      switch (modeSetting) {
        case ChartsDisplayMode.Day:
          return ChartsDisplayMode.Day;
        case ChartsDisplayMode.Night:
          return ChartsDisplayMode.Night;
        default:
          if (autoSource === ChartsAutoDisplayMode.DimmingBus) {
            return dimBusMode === IfdIlluminationMode.Night ? ChartsDisplayMode.Night : ChartsDisplayMode.Day;
          }
          return photocellMode === IfdIlluminationMode.Night ? ChartsDisplayMode.Night : ChartsDisplayMode.Day;
      }
    },
    this.chartSettings.getSetting('displayMode'),
    this.chartSettings.getSetting('autoDisplayMode'),
    this.illuminationModePhotocell,
    this.illuminationModeDimBus,
  );
  public chartDisplayMode: Subscribable<ChartsDisplayMode.Day | ChartsDisplayMode.Night> = this._chartDisplayMode;

  /** @inheritdoc */
  constructor(private readonly bus: EventBus) { }

  /**
   * Initializes this instrument's electronic charts sources.
   * @param pluginSystem This instrument's plugin system.
   * @throws Error if a charts source factory produces a source with an improper ID.
   */
  public initChartSources(pluginSystem: PluginSystem<IfdPlugin, IfdPluginBinder>): void {
    const sourceFactories = new IfdBuiltInChartsSourceProvider().getSources();

    const pluginSourceFactories = [] as IfdChartsSourceFactory[];

    pluginSystem.callPlugins(plugin => {
      const factories = plugin.getChartsSources?.();
      if (factories) {
        pluginSourceFactories.push(...factories);
      }
    });

    for (const pluginSourceFactory of pluginSourceFactories) {
      if (pluginSourceFactory.uid === '') {
        console.warn('IfdChartsManager: electronic charts source factory with ID equal to the empty string was found and will be ignored');
        continue;
      }

      const existingSourceIndex = sourceFactories.findIndex(factory => factory.uid === pluginSourceFactory.uid);
      if (existingSourceIndex < 0) {
        sourceFactories.push(pluginSourceFactory);
      } else {
        sourceFactories[existingSourceIndex] = pluginSourceFactory;
      }
    }

    for (const factory of sourceFactories) {
      const source = factory.createSource();

      if (source.uid !== factory.uid) {
        throw new Error(`IfdChartsManager: electronic charts source factory with ID "${factory.uid}" produced a source with a different ID "${source.uid}"!`);
      }

      this.sources.set(factory.uid, source);
    }
  }

  /**
   * Initializes the charts manager.
   */
  public init(): void {
    this.preferredSourceUid.sub((sourceUid) => {
      const source = this.sources.get(sourceUid);
      if (source) {
        this.preferredSource.set(source);
      } else {
        this.preferredSourceUid.set(IfdBuiltInChartsSourceIds.Lido);
      }
      this.selectedChart.set(undefined);
    }, true);

    this.selectedAirport.sub(async (airport) => {
      const source = this.preferredSource.get();

      if (source && airport) {
        const airportCharts = await source.getChartsForAirport(airport);

        if (airportCharts) {
          const primaryChart = await source.getPrimaryAirportChart(airportCharts);
          this.selectedChart.set(primaryChart);
        }
      }
    }, true);
  }

  /**
   * Gets an array of charts for an airport
   * @param airport The airport ICAO value
   * @returns An array of chart metadata
   */
  public async getChartsForAirport(airport: IcaoValue): Promise<ChartMetadata[]> {
    const source = this.preferredSource.get();

    if (source) {
      return source.getChartsForAirport(airport);
    } else {
      return [];
    }
  }

  /**
   * Gets the chart name
   * @param chart The chart metadata
   * @returns The chart name
   */
  public getChartName(chart: ChartMetadata): string {
    const source = this.preferredSource.get();

    if (source) {
      return source.getChartName(chart);
    } else {
      return '';
    }
  }

  /**
   * Gets the primary airport chart from a list of charts
   * @param charts List of charts
   * @returns The primary airport chart, or none.
   */
  public getPrimaryAirportChart(charts: readonly ChartMetadata[]): ChartMetadata | undefined {
    const source = this.preferredSource.get();

    if (source) {
      return source.getPrimaryAirportChart(charts);
    } else {
      return undefined;
    }
  }

  /**
   * Gets the URL for a chart page
   * @param pageData The page data
   * @returns The URL for a chart, or undefined.
   */
  public getUrl(pageData: ChartPage): ChartUrl | undefined {
    const source = this.preferredSource.get();

    if (source) {
      return this._chartDisplayMode.get() === ChartsDisplayMode.Night ? source.getNightUrl(pageData) : source.getDayUrl(pageData);
    }
  }
}

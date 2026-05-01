import {
  ChartArea, ChartImageSupplier, ChartMetadata, ChartPage, ChartService, ChartUrl, GeoReferencedChartArea, IcaoValue, Subscribable
} from '@microsoft/msfs-sdk';

import { IfdChartsPageData } from './IfdChartsTypes';

/**
 * Ifd electronic charts source statuses.
 */
export enum IfdChartsSourceStatus {
  Ready = 'Ready',
  Expired = 'Expired',
  Unavailable = 'Unavailable',
  Failed = 'Failed',
  Unknown = 'Unknown',
}

/**
 * A definition describing a display-able section of a chart page that can be selected by the user.
 */
export interface IfdChartsSourcePageSectionDefinition {
  /** The ID that unique identifies this section definition. Cannot be the empty string. */
  readonly uid: string;

  /** The name of this section definition. */
  readonly name: string;

  /**
   * Gets the area of a chart page associated with this section definition.
   * @param pageData The chart page for which to get the area.
   * @returns The area of the specified chart page associated with this section definition, or `undefined`, if there is
   * no such area.
   */
  getArea(pageData: IfdChartsPageData): ChartArea | undefined;
}

/**
 * A source of electronic chart data for the Ifd.
 */
export interface IfdChartsSource {
  /** The ID that uniquely identifies this source. Cannot be the empty string. */
  readonly uid: string;

  /** The name of this source. */
  readonly name: string;

  /** The chart provider from which this source's chart data can be retrieved. */
  readonly provider: string;

  /** This source's status. */
  readonly status: Subscribable<IfdChartsSourceStatus>;

  /** An array of section definitions supported by this source. */
  readonly pageSectionDefinitions: readonly IfdChartsSourcePageSectionDefinition[];

  /**
   * Gets a chart service from which to retrieve this source's chart data.
   * @returns A chart service from which to retrieve this source's chart data.
   */
  getChartService(): ChartService;

  /**
   * Gets an array of charts for an airport
   * @param airport The airport ICAO value
   */
  getChartsForAirport(airport: IcaoValue): Promise<ChartMetadata[]>;

  /**
   * Creates a new instance of a chart image supplier that can supply images for this source's charts.
   * @returns A new instance of a chart image supplier that can supply images for this source's charts.
   */
  createChartImageSupplier(): ChartImageSupplier;

  /**
   * Gets the primary airport diagram chart page from among an array of pages.
   * @param pages The chart pages from which to choose.
   * @returns The primary airport diagram chart page from the specified array, or `undefined` if no such page could be
   * found.
   */
  getPrimaryAirportChart(pages: readonly ChartMetadata[]): ChartMetadata | undefined;

  /**
   * Gets the display name of a chart.
   * @param metadata The chart metadata for which to get the display name.
   * @returns The display name of the specified chart page.
   */
  getChartName(metadata: ChartMetadata): string;

  /**
   * Gets the URL for the day mode version of a chart page.
   * @param pageData The chart page for which to get the URL.
   * @returns The URL for the day mode version of a chart page, or `undefined` if no such URL exists.
   */
  getDayUrl(pageData: ChartPage): ChartUrl | undefined;

  /**
   * Gets the URL for the night mode version of a chart page. If night mode is unsupported then provide a day URL.
   * @param pageData The chart page for which to get the URL.
   * @returns The URL for the night mode version of a chart page, or `undefined` if no such URL exists.
   */
  getNightUrl(pageData: ChartPage): ChartUrl | undefined;

  /**
   * Gets the geo-referenced area for a chart page or a specific area within a chart page.
   * @param pageData The chart page.
   * @param area The chart area within the page for which to get the geo-referenced area, or `null` to get the
   * geo-referenced area for the entire page.
   * @returns The geo-referenced area for the specified page, or `undefined` if geo-referencing is not available.
   */
  getGeoReferencedArea(pageData: IfdChartsPageData, area: ChartArea | null): GeoReferencedChartArea | undefined;

  /**
   * Checks whether this is a procedure chart.
   * @param type The chart type
   * @returns True if this is a procedure chart, otherwise false for an airport chart.
   */
  isProcedureChart(type: string): boolean;
}

/**
 * A factory that creates an electronic charts source.
 */
export interface IfdChartsSourceFactory {
  /** The ID of the source created by this factory. */
  readonly uid: string;

  /**
   * Creates a new electronic charts source.
   * @returns A new electronic charts source.
   */
  createSource(): IfdChartsSource;
}

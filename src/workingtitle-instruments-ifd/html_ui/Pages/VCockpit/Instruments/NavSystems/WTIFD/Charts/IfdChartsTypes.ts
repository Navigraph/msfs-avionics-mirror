import { ChartMetadata, ChartPage, IcaoValue } from '@microsoft/msfs-sdk';

/**
 * Data describing an electronic chart page.
 */
export interface IfdChartsPageData {
  /** The metadata associated with the page's parent chart. */
  readonly metadata: ChartMetadata;

  /** The chart page. */
  readonly page: ChartPage;

  /** The index of the page in its parent chart. */
  readonly pageIndex: number;

  /** The total number of pages contained in the page's parent chart. */
  readonly pageCount: number;
}

/**
 * Data describing the electronic charts available for a selected airport.
 */
export interface IfdChartsAirportSelectionData {
  /** The ICAO of the selected airport. */
  readonly icao: IcaoValue;

  /**
   * The ID of the charts source that provided the charts for the selected airport, or `null` if no charts source
   * was used.
   */
  readonly source: string | null;

  /** All airport chart pages for the selected airport. */
  readonly airportPages: readonly IfdChartsPageData[];

  /** All procedure chart pages for the selected airport. */
  readonly procedurePages: readonly IfdChartsPageData[];
}

/**
 * Data describing a selected electronic charts page.
 */
export interface IfdChartsPageSelectionData {
  /** The ID of the charts source that provided the page. */
  readonly source: string;

  /** Data describing the selected page. */
  readonly pageData: IfdChartsPageData;
}

/**
 * Light modes with which to display electronic charts.
 */
export enum IfdChartsDisplayLightMode {
  Day = 'Day',
  Night = 'Night',
}

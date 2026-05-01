import { ChartMetadata, ChartService, Wait } from '@microsoft/msfs-sdk';

import { IfdChartsPageData, IfdChartsPageSelectionData } from './IfdChartsTypes';

/**
 * A utility class for working with Ifd electronic charts.
 */
export class IfdChartsUtils {
  /**
   * Checks whether two page selections are equal. Page selections are equal if and only if they have the same source,
   * the same chart metadata (by GUID), and the same page index.
   * @param a The first page selection.
   * @param b The second page selection.
   * @returns Whether the two page selections are equal.
   */
  public static pageSelectionEquals(a: IfdChartsPageSelectionData, b: IfdChartsPageSelectionData): boolean {
    return a.source === b.source
      && a.pageData.metadata.guid === b.pageData.metadata.guid
      && a.pageData.pageIndex === b.pageData.pageIndex;
  }

  /**
   * Gets an array of Ifd chart page data from an array of chart metadata. The page data is ordered according to the
   * order of their associated metadata in the metadata array. If a chart has multiple pages, then the data for each
   * page is placed consecutively in the returned array in ascending page order (page 1, page 2, ..., page n). Page
   * data for charts that could not be retrieved are omitted from the returned array.
   * @param chartService The chart service from which to get page data.
   * @param metadataArray The chart metadata array for which to get page data.
   * @returns A Promise which will be fulfilled with the Ifd chart page data corresponding to the specified chart
   * metadata.
   */
  public static async getPageDataFromMetadata(
    chartService: ChartService,
    metadataArray: readonly ChartMetadata[]
  ): Promise<IfdChartsPageData[]> {
    // Protect against waiting forever by using a timeout.
    const timeout = Wait.awaitDelay(10000);

    const metadataPages = await Promise.all(metadataArray.map(metadata => {
      return Promise.race([
        chartService.getChartPages(metadata.guid).catch(() => undefined),
        timeout
      ]);
    }));

    const pageDataArray: IfdChartsPageData[] = [];

    for (let metadataIndex = 0; metadataIndex < metadataArray.length; metadataIndex++) {
      const metadata = metadataArray[metadataIndex];
      const pages = metadataPages[metadataIndex];
      if (pages) {
        const pageCount = pages.pages.length;
        for (let i = 0; i < pageCount; i++) {
          pageDataArray.push({
            metadata,
            page: pages.pages[i],
            pageIndex: i,
            pageCount
          });
        }
      }
    }

    return pageDataArray;
  }
}

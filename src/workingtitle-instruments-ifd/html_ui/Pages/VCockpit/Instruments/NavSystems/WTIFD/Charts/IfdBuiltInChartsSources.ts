import { FaaChartsSource } from './FaaChartsSource';
import { IfdBuiltInChartsSourceIds } from './IfdBuiltInChartsSourceIds';
import { IfdChartsSourceFactory } from './IfdChartsSource';
import { LidoChartsSource } from './LidoChartsSource';

/**
 * A provider of built-in Ifd electronic charts sources.
 */
export class IfdBuiltInChartsSourceProvider {
  /**
   * Gets an array of factories for all built-in Ifd electronic charts sources.
   * @returns An array of factories for all built-in Ifd electronic charts sources.
   */
  public getSources(): IfdChartsSourceFactory[] {
    return [
      {
        uid: IfdBuiltInChartsSourceIds.Lido,
        createSource: () => new LidoChartsSource(),
      },
      {
        uid: IfdBuiltInChartsSourceIds.Faa,
        createSource: () => new FaaChartsSource(),
      },
    ];
  }
}

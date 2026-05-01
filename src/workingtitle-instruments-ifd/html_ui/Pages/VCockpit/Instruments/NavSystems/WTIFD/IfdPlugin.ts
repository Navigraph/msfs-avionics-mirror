import { AvionicsPlugin, EventBus, InstrumentBackplane } from '@microsoft/msfs-sdk';

import { IfdChartsSourceFactory } from './Charts/IfdChartsSource';
import { IfdOptions } from './IfdOptions';

/** A plugin binder for Epic2 plugins. */
export interface IfdPluginBinder {
  /** The system-wide event bus. */
  bus: EventBus;

  /** The backplane instance. */
  backplane: InstrumentBackplane;

  /** The avionics configuration. */
  options: IfdOptions;
}

/**
 * An avionics plugin for the Epic2.
 */
export abstract class IfdPlugin<B extends IfdPluginBinder = IfdPluginBinder> extends AvionicsPlugin<B> {
  /**
   * Gets factories for additional electronic charts sources.
   * @returns Factories for additional electronic charts sources, or `undefined` if there are no additional sources.
   */
  getChartsSources?(): Iterable<IfdChartsSourceFactory> | undefined;
}

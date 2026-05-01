import { ChartImage, ChartImageSupplier, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';

import { IfdChartsSource } from './IfdChartsSource';

/**
 * An entry describing a chart image supplier defined by a charts source used by {@link ChartsPaneViewChartImageSupplier}.
 */
type ChartsPaneViewChartViewSourceEntry = {
  /** The source chart image supplier instance. */
  supplier: ChartImageSupplier;

  /** A pipe from the source chart image supplier's image subscribable to the outer supplier's image subject. */
  imagePipe: Subscription;
};


/**
 * A chart image supplier for the IFD
 */
export class IfdChartImageSupplier implements ChartImageSupplier {
  private readonly _image = Subject.create<ChartImage>({ imageUrl: '', chartUrl: '', errorCode: 0 });
  public readonly image = this._image as Subscribable<ChartImage>;

  private readonly sourceEntries = new Map<string, ChartsPaneViewChartViewSourceEntry>();

  private activeEntry: ChartsPaneViewChartViewSourceEntry | undefined = undefined;

  /**
   * Sets this supplier's active charts source. This view delegates chart image requests to the chart image supplier
   * defined by the active charts source.
   * @param source The charts source to set.
   */
  public setChartsSource(source: IfdChartsSource): void {
    let entry = this.sourceEntries.get(source.uid);
    if (!entry) {
      const view = source.createChartImageSupplier();
      entry = {
        supplier: view,
        imagePipe: view.image.pipe(this._image, true),
      };
      this.sourceEntries.set(source.uid, entry);
    }

    if (this.activeEntry !== entry) {
      if (this.activeEntry) {
        this.activeEntry.imagePipe.pause();
        this.activeEntry.supplier.showChartImage('');
      }

      this.activeEntry = entry;
      this.activeEntry.imagePipe.resume(true);
    }
  }

  /** @inheritDoc */
  public showChartImage(chartUrl: string): void {
    this.activeEntry?.supplier.showChartImage(chartUrl);
  }

  /** @inheritDoc */
  public destroy(): void {
    for (const entry of this.sourceEntries.values()) {
      entry.supplier.destroy();
    }
  }
}

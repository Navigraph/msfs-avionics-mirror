import { BitFlags } from '../../../math/BitFlags';
import { ReadonlyFloat64Array } from '../../../math/VecMath';
import { MapProjection, MapProjectionChangeType } from '../MapProjection';
import { MapCanvasLayer, MapCanvasLayerProps } from './MapCanvasLayer';

/**
 * Component props for {@link MapSyncedCanvasLayer}.
 */
export interface MapSyncedCanvasLayerProps<M> extends MapCanvasLayerProps<M> {
  /**
   * Whether the layer should automatically collapse its canvas elements (the display canvas and the buffer canvas, if
   * it exists) to zero size (0px by 0px) when the map is asleep. Collapsing the canvas elements will free memory used
   * by the canvas textures. It will also clear everything drawn to the canvases and reset their context states.
   * Defaults to `false`.
   */
  collapseOnSleep?: boolean;
}

/**
 * A canvas map layer whose size and position is synced with the map projection window.
 */
export class MapSyncedCanvasLayer<P extends MapSyncedCanvasLayerProps<any> = MapSyncedCanvasLayerProps<any>> extends MapCanvasLayer<P> {
  protected readonly collapseOnSleep = !!this.props.collapseOnSleep;

  protected isAwake = true;

  /** @inheritDoc */
  public onAttached(): void {
    super.onAttached();

    this.updateFromProjectedSize(this.props.mapProjection.getProjectedSize());
  }

  /** @inheritDoc */
  public onWake(): void {
    this.isAwake = true;

    if (this.collapseOnSleep) {
      this.updateFromProjectedSize(this.props.mapProjection.getProjectedSize());
    }
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.isAwake = false;

    if (this.collapseOnSleep) {
      this.setSize(0, 0);
    }
  }

  /** @inheritDoc */
  public onMapProjectionChanged(mapProjection: MapProjection, changeFlags: number): void {
    if ((!this.collapseOnSleep || this.isAwake) && BitFlags.isAll(changeFlags, MapProjectionChangeType.ProjectedSize)) {
      this.updateFromProjectedSize(mapProjection.getProjectedSize());
    }
  }

  /**
   * Updates this layer according to the current size of the projected map window.
   * @param projectedSize The size of the projected map window.
   */
  protected updateFromProjectedSize(projectedSize: ReadonlyFloat64Array): void {
    this.setSize(projectedSize[0], projectedSize[1]);

    const displayCanvas = this.display.canvas;
    displayCanvas.style.left = '0px';
    displayCanvas.style.top = '0px';
  }
}

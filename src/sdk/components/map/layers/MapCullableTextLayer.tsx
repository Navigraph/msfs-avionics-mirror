import { MapCullableTextLabelManager } from '../MapCullableTextLabel';
import { MapLayerProps } from '../MapLayer';
import { MapCanvasLayerCanvasInstance } from './MapCanvasLayer';
import { MapSyncedCanvasLayer, MapSyncedCanvasLayerProps } from './MapSyncedCanvasLayer';

/**
 * Component props for {@link MapCullableTextLayer}.
 */
export interface MapCullableTextLayerProps extends MapLayerProps<any> {
  /** The text manager to use. */
  manager: MapCullableTextLabelManager;
}

// For backwards compatibility.
/**
 * Component props for {@link MapCullableTextLayer}.
 * @deprecated Please use {@link MapCullableTextLayerProps} instead.
 */
export type MapTextLayerProps = MapCullableTextLayerProps;

/**
 * A layer which displays text which can be culled to avoid overlap.
 */
export class MapCullableTextLayer extends MapSyncedCanvasLayer<MapCullableTextLayerProps> {
  /**
   * Creates a new instance of MapCullableTextLayer.
   * @param props The properties of the component.
   */
  public constructor(props: MapCullableTextLayerProps) {
    const propsToUse: MapCullableTextLayerProps & MapSyncedCanvasLayerProps<any> = {
      ...props,
      collapseOnSleep: true,
    };

    super(propsToUse);
  }

  /** @inheritDoc */
  public onUpdated(time: number, elapsed: number): void {
    super.onUpdated(time, elapsed);

    this.props.manager.update(this.props.mapProjection);
    this.redrawLabels();
  }

  /**
   * Clears this layer's canvas and redraws the currently visible labels registered to this layer's text manager.
   */
  private redrawLabels(): void {
    const labels = this.props.manager.visibleLabels;
    const display = (this.display as MapCanvasLayerCanvasInstance);
    display.clear();
    for (let i = labels.length - 1; i >= 0; i--) {
      labels[i].draw(display.context, this.props.mapProjection);
    }
  }
}

import { BitFlags } from '../../../math/BitFlags';
import { ComponentProps, DisplayComponent, FSComponent, VNode } from '../../FSComponent';
import { MapLayer, MapLayerProps } from '../MapLayer';
import { MapModel } from '../MapModel';
import { MapProjection, MapProjectionChangeType } from '../MapProjection';
import { MapCanvasLayerCanvasInstance } from './MapCanvasLayer';
import { MapSyncedCanvasLayer } from './MapSyncedCanvasLayer';

/**
 * An instance of a shared canvas used by {@link MapSharedCanvasLayer}.
 */
export interface MapSharedCanvasInstance {
  /** This instance's canvas element. */
  readonly canvas: HTMLCanvasElement;

  /** This instance's canvas 2D rendering context. */
  readonly context: CanvasRenderingContext2D;

  /** Whether this canvas has been invalidated. */
  readonly isInvalidated: boolean;
}

/**
 * Component props for {@link MapSharedCanvasLayer}.
 */
export interface MapSharedCanvasLayerProps<M> extends MapLayerProps<M> {
  /**
   * Whether the layer should automatically collapse its shared canvas element to zero size (0px by 0px) when the map
   * is asleep. Collapsing the canvas element will free memory used by the canvas texture. It will also clear
   * everything drawn to the canvas, reset its context state, and invalidate it. Defaults to `false`.
   */
  collapseOnSleep?: boolean;
}

/**
 * A map layer containing a single canvas synced to the map's projected size that can be shared amongst multiple
 * sublayers for rendering.
 *
 * All of the layer's children are rendered on top of the shared canvas element. All children that extend
 * {@link MapSharedCanvasSubLayer} are treated as sublayers and can render to the shared canvas element.
 */
export class MapSharedCanvasLayer extends MapLayer<MapSharedCanvasLayerProps<any>> {
  private thisNode?: VNode;

  private readonly collapseOnSleep = !!this.props.collapseOnSleep;

  private readonly canvasLayerRef = FSComponent.createRef<MapSyncedCanvasLayer>();

  private readonly sublayers: MapSharedCanvasSubLayer<any>[] = [];

  private sharedCanvasInstance?: MapSharedCanvasInstanceClass;

  private isInit = false;

  /** @inheritDoc */
  public onVisibilityChanged(isVisible: boolean): void {
    if (!this.isInit) {
      return;
    }

    this.canvasLayerRef.instance.setVisible(isVisible);

    for (let i = 0; i < this.sublayers.length; i++) {
      this.sublayers[i].setVisible(isVisible);
    }
  }

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;

    // Enumerate sublayers
    FSComponent.visitNodes(thisNode, node => {
      if (node !== thisNode && node.instance instanceof DisplayComponent) {
        if (node.instance instanceof MapSharedCanvasSubLayer) {
          this.sublayers.push(node.instance);
        }

        return true;
      }

      return false;
    });
  }

  /** @inheritDoc */
  public onAttached(): void {
    super.onAttached();

    this.canvasLayerRef.instance.onAttached();

    this.sharedCanvasInstance = new MapSharedCanvasInstanceClass(this.canvasLayerRef.instance.display);

    this.isInit = true;

    if (!this.isVisible()) {
      this.onVisibilityChanged(false);
    }

    for (let i = 0; i < this.sublayers.length; i++) {
      this.sublayers[i].attach(this.props.mapProjection, this.sharedCanvasInstance);
    }
  }

  /** @inheritDoc */
  public onWake(): void {
    this.canvasLayerRef.instance.onWake();

    if (this.collapseOnSleep) {
      this.sharedCanvasInstance!.invalidate();
    }

    for (let i = 0; i < this.sublayers.length; i++) {
      this.sublayers[i].onWake();
    }
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.canvasLayerRef.instance.onSleep();

    for (let i = 0; i < this.sublayers.length; i++) {
      this.sublayers[i].onSleep();
    }
  }

  /** @inheritDoc */
  public onMapProjectionChanged(projection: MapProjection, changeFlags: number): void {
    this.canvasLayerRef.instance.onMapProjectionChanged(projection, changeFlags);

    if (BitFlags.isAll(changeFlags, MapProjectionChangeType.ProjectedSize)) {
      this.sharedCanvasInstance!.invalidate();
    }

    for (let i = 0; i < this.sublayers.length; i++) {
      this.sublayers[i].onMapProjectionChanged(projection, changeFlags);
    }
  }

  /** @inheritDoc */
  public onUpdated(time: number, elapsed: number): void {
    let invalidate = this.sharedCanvasInstance!.isInvalidated;
    for (let i = 0; !invalidate && i < this.sublayers.length; i++) {
      invalidate = this.sublayers[i].shouldInvalidate(time, elapsed);
    }

    if (invalidate) {
      this.sharedCanvasInstance!.invalidate();
    }

    for (let i = 0; i < this.sublayers.length; i++) {
      this.sublayers[i].onUpdated(time, elapsed);
    }

    this.sharedCanvasInstance!.revalidate();
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <>
        <MapSyncedCanvasLayer
          ref={this.canvasLayerRef}
          model={this.props.model}
          mapProjection={this.props.mapProjection}
          collapseOnSleep={this.collapseOnSleep}
          class={this.props.class}
        />
        {this.props.children}
      </>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.thisNode && FSComponent.shallowDestroy(this.thisNode);

    super.destroy();
  }
}

/**
 * Component props for MapSharedCanvasSubLayer.
 */
export interface MapSharedCanvasSubLayerProps<M> extends ComponentProps {
  /** A map model. */
  model: MapModel<M>;
}

/**
 * A sublayer of {@link MapSharedCanvasLayer}.
 */
export class MapSharedCanvasSubLayer<P extends MapSharedCanvasSubLayerProps<any>> extends DisplayComponent<P> {
  private _isAttached = false;
  private _isVisible = true;

  private _projection?: MapProjection;
  private _display?: MapSharedCanvasInstance;

  // eslint-disable-next-line jsdoc/require-returns
  /**
   * This sublayer's map projection.
   * @throws Error if this sublayer is not attached.
   */
  protected get projection(): MapProjection {
    if (this._projection) {
      return this._projection;
    }

    throw new Error('MapSharedCanvasSubLayer: attempted to access projection before sublayer was attached');
  }

  // eslint-disable-next-line jsdoc/require-returns
  /**
   * This sublayer's shared canvas instance.
   * @throws Error if this sublayer is not attached.
   */
  protected get display(): MapSharedCanvasInstance {
    if (this._display) {
      return this._display;
    }

    throw new Error('MapSharedCanvasSubLayer: attempted to access display canvas before sublayer was attached');
  }

  /**
   * Checks whether this sublayer is attached to a parent layer.
   * @returns Whether this sublayer is attached to a parent layer.
   */
  protected isAttached(): boolean {
    return this._isAttached;
  }

  /**
   * Checks whether this sublayer is visible.
   * @returns Whether this sublayer is visible.
   */
  protected isVisible(): boolean {
    return this._isVisible;
  }

  /**
   * Attaches this sublayer to a parent layer.
   * @param projection The map projection used by this sublayer.
   * @param display The canvas instance shared by this sublayer.
   */
  public attach(projection: MapProjection, display: MapSharedCanvasInstance): void {
    this._projection = projection;
    this._display = display;

    this._isAttached = true;
    if (!this._isVisible) {
      this.onVisibilityChanged(this._isVisible);
    }
    this.onAttached();
  }

  /**
   * Sets this sublayer's visibility.
   * @param val Whether this sublayer should be visible.
   */
  public setVisible(val: boolean): void {
    if (this._isVisible === val) {
      return;
    }

    this._isVisible = val;
    if (this._isAttached) {
      this.onVisibilityChanged(val);
    }
  }

  /**
   * This method is called when this layer's visibility changes.
   * @param isVisible Whether the layer is now visible.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onVisibilityChanged(isVisible: boolean): void {
    // noop
  }

  /**
   * This method is called when this sublayer is attached to its parent layer.
   */
  public onAttached(): void {
    // noop
  }

  /**
   * This method is called when this sublayer's parent layer is awakened.
   */
  public onWake(): void {
    // noop
  }

  /**
   * This method is called when this sublayer's parent layer is put to sleep.
   */
  public onSleep(): void {
    // noop
  }

  /**
   * This method is called when this sublayer's map projection changes.
   * @param projection This sublayer's map projection.
   * @param changeFlags The types of changes made to the projection.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onMapProjectionChanged(projection: MapProjection, changeFlags: number): void {
    // noop
  }

  /**
   * This method is called at the beginning of every update cycle to check whether this sublayer's shared canvas
   * instance should be invalidated. If the canvas is already invalidated, then this method will not be called.
   * @param time The current time as a UNIX timestamp in milliseconds.
   * @param elapsed The elapsed time, in milliseconds, since the last update.
   * @returns Whether this sublayer's shared canvas instance should be invalidated.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public shouldInvalidate(time: number, elapsed: number): boolean {
    return false;
  }

  /**
   * This method is called once every update cycle after this sublayer's shared canvas instance has had a chance to be
   * invalidated.
   * @param time The current time as a UNIX timestamp in milliseconds.
   * @param elapsed The elapsed time, in milliseconds, since the last update.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onUpdated(time: number, elapsed: number): void {
    // noop
  }

  /** @inheritDoc */
  public render(): VNode | null {
    return null;
  }
}

/**
 * An implementation of {@link MapSharedCanvasInstance} which is backed by a
 * {@link MapCanvasLayerCanvasInstance}.
 */
class MapSharedCanvasInstanceClass implements MapSharedCanvasInstance {
  /** @inheritDoc */
  public readonly canvas = this.instance.canvas;

  /** @inheritDoc */
  readonly context = this.instance.context;

  /** Whether this canvas has been invalidated. */
  public readonly isInvalidated = false;

  /**
   * Creates a new instance of MapSharedCanvasInstanceClass.
   * @param instance This instance's backing canvas instance.
   */
  public constructor(private readonly instance: MapCanvasLayerCanvasInstance) {
  }

  /**
   * Invalidates and clears this canvas.
   */
  public invalidate(): void {
    (this.isInvalidated as boolean) = true;
    this.instance.clear();
  }

  /** @inheritDoc */
  public revalidate(): void {
    (this.isInvalidated as boolean) = false;
  }
}

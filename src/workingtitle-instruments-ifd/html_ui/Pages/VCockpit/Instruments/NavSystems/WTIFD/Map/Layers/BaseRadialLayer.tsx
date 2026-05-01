import {
  FSComponent, GeoCircle, GeoCircleLineRenderer, GeoCircleResampler, GeoPoint, GeoPointInterface, GeoProjectionPathStreamStack, MapCachedCanvasLayer, MapLayer,
  MapLayerProps, MapProjection, NullPathStream, UnitType, VNode
} from '@microsoft/msfs-sdk';

/**
 * A layer that displays radials about a point.
 */
export abstract class BaseRadialLayer<T extends MapLayerProps<any>> extends MapLayer<T> {
  private static readonly geoPointCache = [new GeoPoint(0, 0)];
  private static readonly geoCircleCache = [new GeoCircle(new Float64Array(3), 0)];

  private readonly lineRenderer = new GeoCircleLineRenderer();
  private readonly resampler = new GeoCircleResampler(Math.PI / 12, 0.25, 8);
  private readonly streamStack = new GeoProjectionPathStreamStack(NullPathStream.INSTANCE, this.props.mapProjection.getGeoProjection(), this.resampler);
  protected readonly canvasLayer = FSComponent.createRef<MapCachedCanvasLayer>();

  protected needsRender = false;

  /** @inheritdoc */
  public onAttached(): void {
    this.canvasLayer.instance.onAttached();
    this.streamStack.setConsumer(this.canvasLayer.instance.display.context);
  }

  /** @inheritdoc */
  public onUpdated(time: number, elapsed: number): void {
    super.onUpdated(time, elapsed);

    this.canvasLayer.instance.onUpdated(time, elapsed);
  }

  /**
   * Begins drawing on the canvas if needed.
   * @returns the context if ready to draw, else undefined.
   */
  protected tryBeginDraw(): CanvasRenderingContext2D | undefined {
    const display = this.canvasLayer.instance.tryGetDisplay();

    if (display !== undefined && (display.isInvalid || this.needsRender)) {
      display.clear();
      display.invalidate();

      display.syncWithMapProjection(this.props.mapProjection);
      this.streamStack.setProjection(this.canvasLayer.instance.display.geoProjection);

      return display.context;
    }

    return undefined;
  }

  /**
   * Draws one or a pair of radials inbound or outbound from a point.
   * @param context The canvas context to draw on.
   * @param point The point the radials eminate from/to.
   * @param courseTrue The true course of the outbound radial in degrees.
   * @param inboundStyle The style of the inbound radial, or undefined to not draw it.
   * @param outboundStyle The style of the outbound radial, or undefined to not draw it.
   */
  protected drawRadials(context: CanvasRenderingContext2D, point: GeoPointInterface, courseTrue: number, inboundStyle?: string, outboundStyle?: string): void {
    const obsPath = BaseRadialLayer.geoCircleCache[0].setAsGreatCircle(point, courseTrue);

    const start = obsPath.offsetDistanceAlong(point, UnitType.NMILE.convertTo(-50, UnitType.GA_RADIAN), BaseRadialLayer.geoPointCache[0]);
    const startLat = start.lat;
    const startLon = start.lon;

    const end = obsPath.offsetDistanceAlong(point, UnitType.NMILE.convertTo(50, UnitType.GA_RADIAN), BaseRadialLayer.geoPointCache[0]);
    const endLat = end.lat;
    const endLon = end.lon;

    if (inboundStyle !== undefined) {
      this.lineRenderer.render(obsPath, startLat, startLon, point.lat, point.lon, context, this.streamStack, 3, inboundStyle);
    }
    if (outboundStyle !== undefined) {
      this.lineRenderer.render(obsPath, point.lat, point.lon, endLat, endLon, context, this.streamStack, 3, outboundStyle);
    }
  }

  /** @inheritdoc */
  public onMapProjectionChanged(mapProjection: MapProjection, changeFlags: number): void {
    super.onMapProjectionChanged(mapProjection, changeFlags);
    this.canvasLayer.instance.onMapProjectionChanged(mapProjection, changeFlags);
    this.needsRender = true;
  }

  /** @inheritdoc */
  public onVisibilityChanged(isVisible: boolean): void {
    this.canvasLayer.instance.onVisibilityChanged(isVisible);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <MapCachedCanvasLayer useBuffer={true} overdrawFactor={Math.SQRT2} model={this.props.model} mapProjection={this.props.mapProjection} ref={this.canvasLayer} />
    );
  }
}

import {
  BoundaryType, LodBoundary, MapAirspaceRenderer, MapMultiLineAirspaceRenderer, MapMultiLineAirspaceShape, NullAirspaceRenderer, PathStream
} from '@microsoft/msfs-sdk';
import {Colors} from '../Misc/Colors';

const EMPTY_DASH: number[] = [];

enum AirspaceRenderType {
  BlueSingle,
  RedSingle,
  MagentaSingle,
  BlueDashed,
  Null
}

/**
 * Renders airspace boundaries as a single line with an associated outline.
 */
class OutlinedAirspaceRenderer extends MapMultiLineAirspaceRenderer {
  /**
   * Constructor.
   * @param width The stroke width of the rendered airspace line, in pixels.
   * @param color The color of the rendered airspace line.
   * @param dash The dash array of the rendered airspace line.
   * @param outlineWidth The width of the rendered airspace outline, in pixels.
   * @param outlineColor The color of the rendered airspace outline.
   * @param outlineDash The dash array of the rendered airspace outline.
   */
  constructor(
    private readonly width: number,
    private readonly color: string,
    private readonly dash: number[],
    private readonly outlineWidth: number,
    private readonly outlineColor: string,
    private readonly outlineDash: number[]
  ) {
    super();
  }

  /** @inheritdoc */
  protected renderLines(
    shape: MapMultiLineAirspaceShape,
    context: CanvasRenderingContext2D,
    stream?: PathStream
  ): void {
    // render outline line
    shape.renderLine(context, 0, this.width + this.outlineWidth * 2, this.outlineColor, this.outlineDash, stream);

    // render stroke line
    shape.renderLine(context, 0, this.width, this.color, this.dash, stream);
  }
}

/**
 * Utility class containing functions defining the rendering behavior of airspaces
 */
export class MapAirspaceRendering {
  private static readonly RENDERERS = {
    [AirspaceRenderType.RedSingle]: new OutlinedAirspaceRenderer(0.5, Colors.red1, EMPTY_DASH, 0.5, Colors.red2, EMPTY_DASH),
    [AirspaceRenderType.BlueSingle]: new OutlinedAirspaceRenderer(2, Colors.blue1, EMPTY_DASH, 1, Colors.blue2, EMPTY_DASH),
    [AirspaceRenderType.MagentaSingle]: new OutlinedAirspaceRenderer(2, Colors.darkMagenta1, EMPTY_DASH, 1, Colors.darkMagenta2, EMPTY_DASH),
    [AirspaceRenderType.BlueDashed]: new OutlinedAirspaceRenderer(2, Colors.blue1, [5, 5], 1, Colors.blue2, [5, 5]),
    [AirspaceRenderType.Null]: new NullAirspaceRenderer(),
  };

  /**
   * Determines the rendering order of airspaces
   * @returns The relative rendering order of two airspaces
   */
  public static renderOrder(): number {
    return 0;
  }

  /**
   * Selects airspace renderers
   * @param airspace The airspace to render.
   * @returns The renderer to use to render the specified airspace.
   */
  public static selectRenderer(airspace: LodBoundary): MapAirspaceRenderer {
    switch (airspace.facility.type) {
      case BoundaryType.ClassA:
        return MapAirspaceRendering.RENDERERS[AirspaceRenderType.RedSingle];
      case BoundaryType.ClassB:
        return MapAirspaceRendering.RENDERERS[AirspaceRenderType.BlueSingle];
      case BoundaryType.ClassC:
        return MapAirspaceRendering.RENDERERS[AirspaceRenderType.MagentaSingle];
      case BoundaryType.ClassD:
        return MapAirspaceRendering.RENDERERS[AirspaceRenderType.BlueDashed];
      default:
        return MapAirspaceRendering.RENDERERS[AirspaceRenderType.Null];
    }
  }
}

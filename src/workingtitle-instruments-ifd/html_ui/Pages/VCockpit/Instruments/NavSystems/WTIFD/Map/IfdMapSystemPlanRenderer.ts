import {
  FlightPathLegRenderPart,
  FlightPathRenderStyle,
  FlightPathVectorStyle,
  FlightPlan,
  GeoProjectionPathStreamStack,
  LegDefinition,
  MapSystemPlanRenderer,
} from '@microsoft/msfs-sdk';

/**
 * A handler that takes flight plan leg data and returns one or more render styles.
 * Supports single style, multiple layered styles, or vector styles.
 * @param plan The flight plan containing the leg.
 * @param leg The definition of the leg to render.
 * @param activeLeg The currently active leg, if any.
 * @param legIndex The zero-based index of this leg in the plan.
 * @param activeLegIndex The zero-based index of the active leg in the plan.
 * @returns A single FlightPathRenderStyle, an array of FlightPathRenderStyle, or a FlightPathVectorStyle.
 */
export type IfdLegStyleHandler = (
  plan: FlightPlan,
  leg: LegDefinition,
  activeLeg: LegDefinition | undefined,
  legIndex: number,
  activeLegIndex: number
) => FlightPathRenderStyle | readonly FlightPathRenderStyle[] | FlightPathVectorStyle;

/**
 * An IFD-specific map plan renderer that extends the default MapSystemPlanRenderer
 * to support multiple layered leg styles.
 */
export class IfdMapSystemPlanRenderer extends MapSystemPlanRenderer {
   /**
    * Renders a single leg, with support for multiple style layers.
    * @param leg The leg definition to render.
    * @param plan The flight plan containing the leg.
    * @param activeLeg The currently active leg, if any.
    * @param legIndex The zero-based index of this leg in the plan.
    * @param activeLegIndex The zero-based index of the active leg in the plan.
    * @param context The canvas 2D rendering context.
    * @param streamStack The projection path stream stack for drawing.
    */
  protected override renderLeg(
    leg: LegDefinition,
    plan: FlightPlan,
    activeLeg: LegDefinition | undefined,
    legIndex: number,
    activeLegIndex: number,
    context: CanvasRenderingContext2D,
    streamStack: GeoProjectionPathStreamStack
  ): void {
    const handler = this.legStyleHandlers.get(plan.planIndex) as IfdLegStyleHandler;
    if (!handler) {
      super.renderLeg(leg, plan, activeLeg, legIndex, activeLegIndex, context, streamStack);
      return;
    }

    const result = handler(plan, leg, activeLeg, legIndex, activeLegIndex) ;
    if (isStyleArray(result)) {
      for (const style of result) {
        this.renderSingleStyle(leg, context, streamStack, style);
      }
    } else {
      this.renderSingleStyle(leg, context, streamStack, result);
    }
  }

  /**
   * Helper to apply a single style and render the leg.
   * @param leg The leg definition to render.
   * @param context The canvas 2D rendering context.
   * @param streamStack The projection path stream stack for drawing.
   * @param style The style (or vector style) to apply.
   */
  private renderSingleStyle(
    leg: LegDefinition,
    context: CanvasRenderingContext2D,
    streamStack: GeoProjectionPathStreamStack,
    style: FlightPathRenderStyle | FlightPathVectorStyle
  ): void {
    this.legRenderer.currentRenderStyle = style;

    const defaultParts =
      FlightPathLegRenderPart.Base |
      (this.renderIngress.get() ? FlightPathLegRenderPart.Ingress : 0) |
      (this.renderEgress.get() ? FlightPathLegRenderPart.Egress : 0);

    const parts = (style as FlightPathRenderStyle).partsToRender ?? defaultParts;

    this.legRenderer.render(leg, context, streamStack, parts);
  }
}

/**
 * Type guard to detect an array of FlightPathRenderStyle.
 * @param style The result from an IfdLegStyleHandler.
 * @returns True if the style is an array of FlightPathRenderStyle.
 */
function isStyleArray(
  style: FlightPathRenderStyle | readonly FlightPathRenderStyle[] | FlightPathVectorStyle
): style is readonly FlightPathRenderStyle[] {
  return Array.isArray(style);
}

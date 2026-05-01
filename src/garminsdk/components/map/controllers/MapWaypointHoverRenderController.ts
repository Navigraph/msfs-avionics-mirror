import { MapSystemContext, MapSystemController, MapSystemKeys, Subscription, Waypoint } from '@microsoft/msfs-sdk';

import { GarminMapKeys } from '../GarminMapKeys';
import { MapWaypointRenderer, MapWaypointRenderRole } from '../MapWaypointRenderer';
import { MapWaypointHoverModule } from '../modules/MapWaypointHoverModule';

/**
 * Modules required for {@link MapWaypointHoverRenderController}.
 */
export interface MapWaypointHoverRenderControllerModules {
  /** Waypoint hover module. */
  [GarminMapKeys.WaypointHover]: MapWaypointHoverModule;
}

/**
 * Context properties required for {@link MapWaypointHoverRenderController}.
 */
export interface MapWaypointHoverRenderControllerContext {
  /** The waypoint renderer. */
  [MapSystemKeys.WaypointRenderer]: MapWaypointRenderer;
}

/**
 * Configuration options for {@link MapWaypointHoverRenderController}.
 */
export type MapWaypointHoverRenderControllerOptions = {
  /** The source to use when registering the hovered waypoint with the waypoint renderer. Defaults to `'waypoint-hover'`. */
  source?: string;
};

/**
 * Controls the registration of the hovered waypoint with the waypoint renderer.
 */
export class MapWaypointHoverRenderController extends MapSystemController<MapWaypointHoverRenderControllerModules, any, any, MapWaypointHoverRenderControllerContext> {
  private static readonly DEFAULT_SOURCE = 'waypoint-hover';

  private readonly source: string;

  private registeredWaypoint: Waypoint | null = null;

  private waypointSub?: Subscription;

  /**
   * Creates a new instance of MapWaypointHoverRenderController.
   * @param context This controller's map context.
   * @param options Options with which to configure the controller.
   */
  public constructor(
    context: MapSystemContext<MapWaypointHoverRenderControllerModules, any, any, MapWaypointHoverRenderControllerContext>,
    options?: Readonly<MapWaypointHoverRenderControllerOptions>
  ) {
    super(context);

    this.source = options?.source ?? MapWaypointHoverRenderController.DEFAULT_SOURCE;
  }

  /** @inheritDoc */
  public onAfterMapRender(): void {
    this.waypointSub = this.context.model.getModule(GarminMapKeys.WaypointHover).waypoint.sub(this.onWaypointChanged.bind(this), true);
  }

  /**
   * Responds to when the hovered waypoint changes.
   * @param waypoint The new hovered waypoint.
   */
  private onWaypointChanged(waypoint: Waypoint | null): void {
    if (this.registeredWaypoint) {
      this.context[MapSystemKeys.WaypointRenderer].deregister(this.registeredWaypoint, MapWaypointRenderRole.Hover, this.source);
    }

    if (waypoint) {
      this.context[MapSystemKeys.WaypointRenderer].register(waypoint, MapWaypointRenderRole.Hover, this.source);
    }

    this.registeredWaypoint = waypoint;
  }

  /** @inheritDoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritDoc */
  public destroy(): void {
    this.waypointSub?.destroy();

    if (this.registeredWaypoint) {
      this.context[MapSystemKeys.WaypointRenderer].deregister(this.registeredWaypoint, MapWaypointRenderRole.Hover, this.source);
    }

    super.destroy();
  }
}

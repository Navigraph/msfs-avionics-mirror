import { MapSystemContext, MapSystemController, MapSystemKeys, Subscription, Waypoint } from '@microsoft/msfs-sdk';

import { GarminMapKeys } from '../GarminMapKeys';
import { MapWaypointRenderer, MapWaypointRenderRole } from '../MapWaypointRenderer';
import { MapWaypointHighlightModule } from '../modules/MapWaypointHighlightModule';

/**
 * Modules required for {@link MapWaypointHighlightRenderController}.
 */
export interface MapWaypointHighlightRenderControllerModules {
  /** Waypoint highlight module. */
  [GarminMapKeys.WaypointHighlight]: MapWaypointHighlightModule;
}

/**
 * Context properties required for {@link MapWaypointHighlightRenderController}.
 */
export interface MapWaypointHighlightRenderControllerContext {
  /** The waypoint renderer. */
  [MapSystemKeys.WaypointRenderer]: MapWaypointRenderer;
}

/**
 * Configuration options for {@link MapWaypointHighlightRenderController}.
 */
export type MapWaypointHighlightRenderControllerOptions = {
  /** The source to use when registering the highlighted waypoint with the waypoint renderer. Defaults to `'waypoint-highlight'`. */
  source?: string;
};

/**
 * Controls the registration of the highlighted waypoint with the waypoint renderer.
 */
export class MapWaypointHighlightRenderController extends MapSystemController<MapWaypointHighlightRenderControllerModules, any, any, MapWaypointHighlightRenderControllerContext> {
  private static readonly DEFAULT_SOURCE = 'waypoint-highlight';

  private readonly source: string;

  private registeredWaypoint: Waypoint | null = null;

  private waypointSub?: Subscription;

  /**
   * Creates a new instance of MapWaypointHighlightRenderController.
   * @param context This controller's map context.
   * @param options Options with which to configure the controller.
   */
  public constructor(
    context: MapSystemContext<MapWaypointHighlightRenderControllerModules, any, any, MapWaypointHighlightRenderControllerContext>,
    options?: Readonly<MapWaypointHighlightRenderControllerOptions>
  ) {
    super(context);

    this.source = options?.source ?? MapWaypointHighlightRenderController.DEFAULT_SOURCE;
  }

  /** @inheritDoc */
  public onAfterMapRender(): void {
    this.waypointSub = this.context.model.getModule(GarminMapKeys.WaypointHighlight).waypoint.sub(this.onWaypointChanged.bind(this), true);
  }

  /**
   * Responds to when the highlighted waypoint changes.
   * @param waypoint The new highlighted waypoint.
   */
  private onWaypointChanged(waypoint: Waypoint | null): void {
    if (this.registeredWaypoint) {
      this.context[MapSystemKeys.WaypointRenderer].deregister(this.registeredWaypoint, MapWaypointRenderRole.Highlight, this.source);
    }

    if (waypoint) {
      this.context[MapSystemKeys.WaypointRenderer].register(waypoint, MapWaypointRenderRole.Highlight, this.source);
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
      this.context[MapSystemKeys.WaypointRenderer].deregister(this.registeredWaypoint, MapWaypointRenderRole.Highlight, this.source);
    }

    super.destroy();
  }
}

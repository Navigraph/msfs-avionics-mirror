import {
  MapColliderCollection, MapSystemContext, MapSystemController, MapSystemKeys,
  MapWaypointIcon, MapWaypointIconRenderEvent,
  MapWaypointRenderEventType, Subscription,
  Waypoint
} from '@microsoft/msfs-sdk';

import { MapWaypointCollider } from '../colliders/MapWaypointCollider';
import { MapWaypointIconColliderFactory } from '../colliders/MapWaypointIconColliderFactory';
import { MapWaypointRenderer } from '../MapWaypointRenderer';

/**
 * Context properties required for {@link MapWaypointColliderController}.
 */
export interface MapWaypointColliderControllerContext {
  /** The waypoint renderer. */
  [MapSystemKeys.WaypointRenderer]: MapWaypointRenderer;

  /** The map collider collection. */
  [MapSystemKeys.MapColliderCollection]: MapColliderCollection;
}

/**
 * Controls the registration of map colliders for rendered waypoints.
 */
export class MapWaypointColliderController extends MapSystemController<any, any, any, MapWaypointColliderControllerContext> {
  private readonly colliders = new Map<Waypoint, MapWaypointCollider>();

  private iconRenderSub?: Subscription;

  private _isResumed = false;

  /**
   * Creates a new instance of MapWaypointColliderController. The controller is initialized to a paused state.
   * @param context This controller's map context.
   * @param colliderFactory The factory used by this controller to create and manage colliders for rendered waypoints.
   */
  public constructor(
    context: MapSystemContext<any, any, any, MapWaypointColliderControllerContext>,
    private readonly colliderFactory: MapWaypointIconColliderFactory
  ) {
    super(context);
  }

  /** @inheritDoc */
  public onAfterMapRender(): void {
    this.iconRenderSub = this.context[MapSystemKeys.WaypointRenderer].onIconRenderEvent.on(this.onIconRenderEvent.bind(this), true);

    if (this._isResumed) {
      this.refreshColliders();
      this.iconRenderSub.resume();
    }
  }

  /**
   * Checks whether this controller is resumed.
   * @returns Whether this controller is resumed.
   */
  public isResumed(): boolean {
    return this._isResumed;
  }

  /**
   * Resumes this controller. When resumed, the controller immediately registers colliders for all currently rendered
   * waypoints and will automatically register and deregister colliders as waypoints are rendered and unrendered.
   */
  public resume(): void {
    if (this._isResumed) {
      return;
    }

    this._isResumed = true;

    if (this.iconRenderSub) {
      this.refreshColliders();
      this.iconRenderSub.resume();
    }
  }

  /**
   * Pauses this controller. When paused, the controller immediately deregisters all colliders for any currently rendered
   * waypoints and will not automatically register colliders as waypoints are rendered.
   */
  public pause(): void {
    if (!this._isResumed) {
      return;
    }

    this._isResumed = false;

    const collection = this.context[MapSystemKeys.MapColliderCollection];
    for (const collider of this.colliders.values()) {
      collection.deregister(collider);
      this.colliderFactory.cleanupCollider(collider);
    }

    this.colliders.clear();
  }

  /**
   * Attempts to register colliders for all currently rendered waypoints.
   */
  private refreshColliders(): void {
    for (const rendered of this.context[MapSystemKeys.WaypointRenderer].renderedIcons()) {
      this.tryAddCollider(rendered.waypoint, rendered.renderedRole, rendered.icon);
    }
  }

  /**
   * Responds to a waypoint icon render event.
   * @param source The source of the event.
   * @param event The event data.
   */
  private onIconRenderEvent(source: MapWaypointRenderer, event: MapWaypointIconRenderEvent<Waypoint>): void {
    const { type, waypoint, renderedRole, icon } = event;

    switch (type) {
      case MapWaypointRenderEventType.Added:
        this.tryAddCollider(waypoint, renderedRole, icon);
        break;
      case MapWaypointRenderEventType.Removed: {
        const collider = this.colliders.get(event.waypoint);
        if (collider) {
          this.context[MapSystemKeys.MapColliderCollection].deregister(collider);
          this.colliders.delete(waypoint);
          this.colliderFactory.cleanupCollider(collider);
        }
        break;
      }
      case MapWaypointRenderEventType.Modified:
        this.tryUpdateCollider(waypoint, renderedRole, icon);
        break;
    }
  }

  /**
   * Attempts to register a collider for a newly rendered waypoint icon.
   * @param waypoint The icon's waypoint.
   * @param renderRole The render role under which the icon was rendered.
   * @param icon The rendered icon.
   */
  private tryAddCollider(waypoint: Waypoint, renderRole: number, icon: MapWaypointIcon<Waypoint>): void {
    const oldCollider = this.colliders.get(waypoint) ?? null;
    const newCollider = this.colliderFactory.createCollider(waypoint, renderRole, icon);

    if (newCollider === oldCollider) {
      return;
    }

    if (oldCollider) {
      this.context[MapSystemKeys.MapColliderCollection].deregister(oldCollider);
      this.colliderFactory.cleanupCollider(oldCollider);
    }

    if (newCollider) {
      this.colliders.set(waypoint, newCollider);
      this.context[MapSystemKeys.MapColliderCollection].register(newCollider);
    } else {
      this.colliders.delete(waypoint);
    }
  }

  /**
   * Attempts to update a collider for a rendered waypoint icon.
   * @param waypoint The icon's waypoint.
   * @param renderRole The render role under which the icon was rendered.
   * @param icon The rendered icon.
   */
  private tryUpdateCollider(waypoint: Waypoint, renderRole: number, icon: MapWaypointIcon<Waypoint>): void {
    const oldCollider = this.colliders.get(waypoint) ?? null;

    const newCollider = this.colliderFactory.updateCollider(waypoint, renderRole, icon, oldCollider);

    if (newCollider === oldCollider) {
      return;
    }

    if (oldCollider) {
      this.context[MapSystemKeys.MapColliderCollection].deregister(oldCollider);
      this.colliderFactory.cleanupCollider(oldCollider);
    }

    if (newCollider) {
      this.colliders.set(waypoint, newCollider);
      this.context[MapSystemKeys.MapColliderCollection].register(newCollider);
    } else {
      this.colliders.delete(waypoint);
    }
  }

  /** @inheritDoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritDoc */
  public destroy(): void {
    this.iconRenderSub?.destroy();

    const collection = this.context[MapSystemKeys.MapColliderCollection];
    for (const collider of this.colliders.values()) {
      collection.deregister(collider);
    }

    this.colliders.clear();

    super.destroy();
  }
}

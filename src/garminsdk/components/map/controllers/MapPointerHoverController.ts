import { MapCollider, MapColliderCollection, MapSystemController, MapSystemKeys, Waypoint } from '@microsoft/msfs-sdk';

import { GarminMapKeys } from '../GarminMapKeys';
import { MapPointerModule } from '../modules/MapPointerModule';
import { MapWaypointHoverModule } from '../modules/MapWaypointHoverModule';
import { MapWaypointCollider } from '../colliders/MapWaypointCollider';

/**
 * Modules required for {@link MapPointerHoverController}.
 */
export interface MapPointerHoverControllerModules {
  /** Pointer module. */
  [GarminMapKeys.Pointer]: MapPointerModule;

  /** Waypoint hover module. */
  [GarminMapKeys.WaypointHover]?: MapWaypointHoverModule;
}

/**
 * Context properties required for {@link MapPointerHoverController}.
 */
export interface MapPointerHoverControllerContext {
  /** The map collider collection. */
  [MapSystemKeys.MapColliderCollection]?: MapColliderCollection;
}

/**
 * Controls the identity of hovered map elements based on the position of the map pointer.
 */
export class MapPointerHoverController extends MapSystemController<MapPointerHoverControllerModules, any, any, MapPointerHoverControllerContext> {
  private readonly pointerModule = this.context.model.getModule(GarminMapKeys.Pointer);
  private readonly waypointHoverModule = this.context.model.getModule(GarminMapKeys.WaypointHover);

  private readonly colliderCollection = this.context[MapSystemKeys.MapColliderCollection];

  private readonly isEnabled = !!this.colliderCollection && !!this.waypointHoverModule;

  private readonly intersections: MapCollider[] = [];

  /** @inheritDoc */
  public onAfterUpdated(): void {
    if (!this.isEnabled) {
      return;
    }

    this.updateHover();
  }

  /**
   * Updates the hovered map elements.
   */
  private updateHover(): void {
    let hoveredWaypoint: Waypoint | null = null;

    if (this.pointerModule.isActive.get()) {
      const pointerPos = this.pointerModule.position.get();

      const intersections = this.colliderCollection!.intersectCircle(pointerPos[0], pointerPos[1], 0, this.context.projection, this.intersections);

      for (const collider of intersections) {
        if (this.waypointHoverModule && (collider as any).isWaypointCollider === true) {
          hoveredWaypoint = (collider as MapWaypointCollider).waypoint;
          break;
        }
      }
    }

    this.waypointHoverModule?.waypoint.set(hoveredWaypoint);
  }

  /** @inheritDoc */
  public onMapDestroyed(): void {
    this.destroy();
  }
}

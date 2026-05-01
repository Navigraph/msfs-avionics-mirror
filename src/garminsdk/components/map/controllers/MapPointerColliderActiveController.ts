import { MapSystemController, Subscription } from '@microsoft/msfs-sdk';

import { GarminMapKeys } from '../GarminMapKeys';
import { MapPointerModule } from '../modules/MapPointerModule';
import { MapWaypointColliderController } from './MapWaypointColliderController';

/**
 * Modules required for {@link MapPointerColliderActiveController}.
 */
export interface MapPointerColliderActiveControllerModules {
  /** Pointer module. */
  [GarminMapKeys.Pointer]: MapPointerModule;
}

/**
 * Controllers required for {@link MapPointerColliderActiveController}.
 */
export interface MapPointerColliderActiveControllerControllers {
  /** Waypoint hover module. */
  [GarminMapKeys.WaypointCollider]?: MapWaypointColliderController;
}

/**
 * Controls whether collision of map elements is enabled based on the active state of the map pointer. Collision is
 * enabled if and only if the map pointer is active.
 */
export class MapPointerColliderActiveController extends MapSystemController<MapPointerColliderActiveControllerModules, any, MapPointerColliderActiveControllerControllers> {
  private pointerActiveSub?: Subscription;

  /** @inheritDoc */
  public onAfterMapRender(): void {
    this.pointerActiveSub = this.context.model.getModule(GarminMapKeys.Pointer).isActive.sub(this.onPointerActiveChanged.bind(this), true);
  }

  /**
   * Responds to when whether the pointer is active changes.
   * @param isActive Whether the pointer is active.
   */
  private onPointerActiveChanged(isActive: boolean): void {
    if (isActive) {
      this.context.getController(GarminMapKeys.WaypointCollider)?.resume();
    } else {
      this.context.getController(GarminMapKeys.WaypointCollider)?.pause();
    }
  }

  /** @inheritDoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritDoc */
  public destroy(): void {
    this.pointerActiveSub?.destroy();

    super.destroy();
  }
}

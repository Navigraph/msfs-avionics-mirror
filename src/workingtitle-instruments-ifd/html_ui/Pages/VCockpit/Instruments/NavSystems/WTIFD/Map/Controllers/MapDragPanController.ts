import { GeoPoint, MapOwnAirplanePropsModule, MapSystemController, Vec2Math } from '@microsoft/msfs-sdk';

import { MapKeys } from '../MapKeys';
import { MapDragPanModule } from '../Modules/MapDragPanModule';

/**
 * Modules required for MapDragPanController.
 */
export interface MapDragPanControllerModules {
  /** Pointer module. */
  [MapKeys.DragPan]: MapDragPanModule;
  /** Onwship Module **/
  [MapKeys.OwnAirplaneProps]: MapOwnAirplanePropsModule;
}

/**
 * Controls the pointer of a map.
 */
export class MapDragPanController extends MapSystemController<MapDragPanControllerModules> {
  private readonly dragPanModule = this.context.model.getModule(MapKeys.DragPan);
  private recenterTimeout?: number;
  private readonly RECENTER_DELAY = 20000;

  /**
   * Schedules the map to be re-centered on the position of the plane
   */
  private scheduleRecenter(): void {
    if (this.recenterTimeout !== undefined) {
      clearTimeout(this.recenterTimeout);
    }

    this.recenterTimeout = window.setTimeout(() => {
      this.recenterOnOwnship();
    }, this.RECENTER_DELAY);
  }

  /**
   * Re-center the map on ownship
   */
  public recenterOnOwnship(): void {
    const planePos = this.context.model.getModule('ownAirplaneProps').position.get();
    this.dragPanModule.target.set(this.dragGeoPointCache.set(planePos.lat, planePos.lon));
    this.setDragPanActive(false); // stop panning mode
  }

  /**
   * Activates or deactivates the map pointer.
   * @param isActive Whether to activate the map pointer.
   */
  public setDragPanActive(isActive: boolean): void {
    if (isActive === this.dragPanModule.isActive.get()) {
      return;
    }

    if (isActive) {
      this.dragPanModule.target.set(this.context.projection.getTarget());
    }
    this.dragPanModule.isActive.set(isActive);
  }

  /**
   * Toggles activation of the map pointer.
   * @returns Whether the map pointer is active after the toggle operation.
   */
  public toggleDragPanActive(): boolean {
    this.setDragPanActive(!this.dragPanModule.isActive.get());
    return this.dragPanModule.isActive.get();
  }

  private readonly dragVec2Cache = Vec2Math.create();
  private readonly dragGeoPointCache = new GeoPoint(0, 0);

  /**
   * Executes a drag action.
   * @param dx The horizontal displacement of the drag motion, in pixels.
   * @param dy The vertical dispacement of the drag motion, in pixels.
   */
  public drag(dx: number, dy: number): void {
    const targetPos = this.context.projection.project(this.dragPanModule.target.get(), this.dragVec2Cache);
    Vec2Math.set(targetPos[0] - dx, targetPos[1] - dy, targetPos);

    if (!Vec2Math.isFinite(targetPos)) {
      return;
    }

    const newTarget = this.context.projection.invert(targetPos, this.dragGeoPointCache);

    if (!isFinite(newTarget.lat) || !isFinite(newTarget.lon)) {
      return;
    }

    /**
     * Map panning is limited to +/- 45 degrees of longitude and +/- 30 degrees of latitude from present position.
     */
    const planePos = this.context.model.getModule('ownAirplaneProps').position.get();
    const minLon = planePos.lon - 45;
    const maxLon = planePos.lon + 45;
    const minLat = planePos.lat - 30;
    const maxLat = planePos.lat + 30;

    const clampedLon = Math.min(Math.max(newTarget.lon, minLon), maxLon);
    const clampedLat = Math.min(Math.max(newTarget.lat, minLat), maxLat);

    this.dragPanModule.target.set(this.dragGeoPointCache.set(clampedLat, clampedLon));
    this.scheduleRecenter();
  }
}

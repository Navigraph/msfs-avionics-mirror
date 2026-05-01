import { MapSystemController, Subscription } from '@microsoft/msfs-sdk';

import { MapKeys } from '../MapKeys';
import { MapDragPanModule } from '../Modules/MapDragPanModule';
import { MapPanningModule } from '../Modules/MapPanningModule';

/**
 * Modules required for MapDragPanRTRController.
 */
export interface MapDragPanRTRControllerModules {
  /** Drag-to-pan module. */
  [MapKeys.DragPan]: MapDragPanModule;

  /** Panning module. */
  [MapKeys.Panning]: MapPanningModule;
}

/**
 * Controls the target, orientation, and range of a map while drag-to-pan is active.
 */
export class MapDragPanRTRController extends MapSystemController<MapDragPanRTRControllerModules> {
  private readonly dragPanModule = this.context.model.getModule(MapKeys.DragPan);
  private readonly panningModule = this.context.model.getModule(MapKeys.Panning);

  private targetPipe?: Subscription;

  private dragPanActiveSub?: Subscription;

  /** @inheritdoc */
  public onAfterMapRender(): void {
    this.targetPipe = this.dragPanModule.target.pipe(this.panningModule.target, true);
    this.dragPanActiveSub = this.dragPanModule.isActive.sub(this.onDragPanActiveChanged.bind(this), true);
    this.dragPanModule.isActive.set.bind(this.dragPanModule.isActive, false);
  }

  /**
   * Responds to map pointer activation changes.
   * @param isActive Whether the map pointer is active.
   */
  protected onDragPanActiveChanged(isActive: boolean): void {
    if (isActive) {
      this.onDragPanActivated();
    } else {
      this.onPointerDeactivated();
    }
  }

  /**
   * Responds to map pointer activation.
   */
  protected onDragPanActivated(): void {
    this.targetPipe?.resume(true);

    this.panningModule.isActive.set(true);
  }

  /**
   * Responds to map pointer deactivation.
   */
  protected onPointerDeactivated(): void {
    this.targetPipe?.pause();

    this.panningModule.isActive.set(false);
  }

  /** @inheritdoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritdoc */
  public destroy(): void {
    if (this.dragPanModule.isActive.get()) {
      this.panningModule.isActive.set(false);
    }

    this.targetPipe?.destroy();
    this.dragPanActiveSub?.destroy();

    super.destroy();
  }
}

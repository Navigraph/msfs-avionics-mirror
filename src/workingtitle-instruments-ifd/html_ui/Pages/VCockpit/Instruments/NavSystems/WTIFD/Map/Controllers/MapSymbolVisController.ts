import {
  MappedSubject, MappedSubscribable, MapSystemContext, MapSystemController, MutableSubscribable, Subject, Subscribable,
  Subscription
} from '@microsoft/msfs-sdk';

import { MapDeclutterMode, MapDeclutterModule } from '../Modules/MapDeclutterModule';
import {MapKeys} from '../MapKeys';

/**
 * Modules required by MapSymbolVisController.
 */
export interface MapSymbolVisControllerModules {

  /** Declutter module. */
  [MapKeys.Declutter]?: MapDeclutterModule;
}
/**
 * Controls the visibility of a specific type of map symbol whose visibility is dependent on its own show and maximum
 * range index settings as well as the global map declutter setting.
 */
export class MapSymbolVisController extends MapSystemController<MapSymbolVisControllerModules> {
  private readonly declutterModule = this.context.model.getModule(MapKeys.Declutter);
  private isSymbolVisible?: MappedSubscribable<boolean>;
  private isSymbolVisiblePipe?: Subscription;

  /**
   * Constructor.
   * @param context This controller's map context.
   * @param nominalRangeIndex the current range index
   * @param showSetting A subscribable which provides the show setting of this controller's symbol.
   * @param rangeIndexSetting A subscribable which provides the maximum range index setting of this controller's
   * symbol.
   * @param maxDeclutterMode The highest global declutter mode, inclusive, at which this controller's symbol remains
   * visible.
   * @param symbolVisibility The mutable subscribable which controls the visibility of this controller's symbol.
   */
  constructor(
    context: MapSystemContext<MapSymbolVisControllerModules, any, any, any>,
    private readonly nominalRangeIndex: Subscribable<number>,
    private readonly showSetting: Subscribable<boolean>,
    private readonly rangeIndexSetting: Subscribable<number>,
    private readonly maxDeclutterMode: MapDeclutterMode,
    private readonly symbolVisibility: MutableSubscribable<boolean>
  ) {
    super(context);
  }

  /** @inheritdoc */
  public onAfterMapRender(): void {
    this.isSymbolVisible = MappedSubject.create(
      ([showSetting, rangeIndexSetting, rangeIndex, declutterMode]): boolean => {
        return showSetting && (declutterMode <= this.maxDeclutterMode) && (rangeIndex <= rangeIndexSetting);
      },
      this.showSetting,
      this.rangeIndexSetting,
      this.nominalRangeIndex,
      this.declutterModule?.mode ?? Subject.create(0)
    );

    this.isSymbolVisiblePipe = this.isSymbolVisible.pipe(this.symbolVisibility);
  }

  /** @inheritdoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.isSymbolVisible?.destroy();
    this.isSymbolVisiblePipe?.destroy();
  }
}

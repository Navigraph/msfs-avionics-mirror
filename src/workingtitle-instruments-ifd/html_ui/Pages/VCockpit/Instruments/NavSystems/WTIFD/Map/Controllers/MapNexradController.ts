import {
  MapIndexedRangeModule, MappedSubject, MappedSubscribable, MapSystemContext, MapSystemController, Subject, Subscribable, UserSettingManager
} from '@microsoft/msfs-sdk';
import {MapKeys} from '../MapKeys';
import {MapNexradModule} from '../Modules/MapNexradModule';
import {MapDeclutterMode, MapDeclutterModule} from '../Modules/MapDeclutterModule';
import {MapUserSettingTypes} from '../../Settings/MapUserSettings';

/**
 * User settings controlling the display of NEXRAD.
 */
export type MapNexradUserSettings = Pick<MapUserSettingTypes, 'mapNexradShow' | 'mapNexradRangeIndex'>;

/**
 * Modules required by {@link MapNexradController}.
 */
export interface MapNexradControllerModules {
  /** Range module. */
  [MapKeys.Range]: MapIndexedRangeModule;

  /** Range module. */
  [MapKeys.Nexrad]: MapNexradModule;

  /** Declutter module. */
  [MapKeys.Declutter]?: MapDeclutterModule;
}

/**
 * Controls the display of NEXRAD based on user settings.
 */
export class MapNexradController extends MapSystemController<MapNexradControllerModules> {
  private readonly nexradModule = this.context.model.getModule(MapKeys.Nexrad);

  private readonly rangeIndex = this.context.model.getModule(MapKeys.Range).nominalRangeIndex;
  private readonly declutterMode = this.context.model.getModule(MapKeys.Declutter)?.mode ?? Subject.create(MapDeclutterMode.All);

  private readonly showSetting?: Subscribable<boolean>;
  private readonly rangeIndexSetting: Subscribable<number>;

  private show?: MappedSubscribable<boolean>;

  /**
   * Creates a new instance of MapNexradController.
   * @param context This controller's map context.
   * @param minRangeIndex The minimum range index, inclusive, at which NEXRAD is visible.
   * @param settingManager A setting manager containing the user settings controlling the display of NEXRAD. If not
   * defined, the display of NEXRAD will not be bound to user settings.
   * @param maxDeclutterMode The highest global declutter mode, inclusive, at which NEXRAD is visible. Defaults to
   * `MapDeclutterMode.All`. Ignored if `settingManager` is not defined.
   */
  constructor(
    context: MapSystemContext<MapNexradControllerModules, any, any, any>,
    private readonly minRangeIndex: number,
    settingManager?: UserSettingManager<Partial<MapNexradUserSettings>>,
    private readonly maxDeclutterMode = MapDeclutterMode.All
  ) {
    super(context);

    this.showSetting = settingManager?.tryGetSetting('mapNexradShow');
    this.rangeIndexSetting = settingManager?.tryGetSetting('mapNexradRangeIndex') ?? Subject.create(Number.MAX_SAFE_INTEGER);
  }

  /** @inheritdoc */
  public onAfterMapRender(): void {
    if (this.showSetting) {
      this.show = MappedSubject.create(
        ([showSetting, rangeIndexSetting, declutterMode, rangeIndex]): boolean => {
          return showSetting && declutterMode <= this.maxDeclutterMode && rangeIndex >= this.minRangeIndex && rangeIndex <= rangeIndexSetting;
        },
        this.showSetting,
        this.rangeIndexSetting,
        this.declutterMode,
        this.rangeIndex,
      );

      this.show.pipe(this.nexradModule.showNexrad);
    }
  }

  /** @inheritdoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.show?.destroy();
  }
}

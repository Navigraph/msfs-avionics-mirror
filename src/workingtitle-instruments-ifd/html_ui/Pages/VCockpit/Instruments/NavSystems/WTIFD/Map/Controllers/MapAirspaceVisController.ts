import { MapAirspaceModule, MapSystemContext, MapSystemController, MapSystemKeys, Subject, UserSettingManager } from '@microsoft/msfs-sdk';

import { MapUserSettingTypes } from '../../Settings/MapUserSettings';
import { MapKeys } from '../MapKeys';
import { AirspaceShowType, AirspaceShowTypes } from '../Modules/MapAirspaceShowTypes';
import { MapDeclutterMode, MapDeclutterModule } from '../Modules/MapDeclutterModule';
import { MapSymbolVisController } from './MapSymbolVisController';

/**
 * Modules required for MapAirspaceVisController.
 */
export interface MapAirspaceVisControllerModules {

  /** Airspace module. */
  [MapSystemKeys.Airspace]: MapAirspaceModule<AirspaceShowTypes>;

  /** Declutter module. */
  [MapKeys.Declutter]?: MapDeclutterModule;
}

/**
 * Controls the visibility of map airspace boundaries.
 */
export class MapAirspaceVisController extends MapSystemController<MapAirspaceVisControllerModules> {
  private readonly airspaceModule = this.context.model.getModule(MapSystemKeys.Airspace);

  private readonly controllers: MapSymbolVisController[] = [];

  /**
   * Constructor.
   * @param context This controller's map context.
   * @param settingManager A setting manager containing the user settings controlling airspace visibility.
   */
  constructor(
    context: MapSystemContext<MapAirspaceVisControllerModules, any, any, any>,
    settingManager: UserSettingManager<Partial<MapUserSettingTypes>>
  ) {
    super(context);

    const classMultiShow = settingManager.tryGetSetting('mapClassABCAirspace');
    const range = settingManager.getSetting('mapRange');
    const classMultiRangeIndex = settingManager.tryGetSetting('mapClassABCAirspaceRange') ?? Subject.create(Number.MAX_SAFE_INTEGER);

    if (classMultiShow) {
      this.controllers.push(new MapSymbolVisController(
        context,
        range,
        classMultiShow,
        classMultiRangeIndex,
        MapDeclutterMode.Level3,
        this.airspaceModule.show[AirspaceShowType.ClassA]
      ));
      this.controllers.push(new MapSymbolVisController(
        context,
        range,
        classMultiShow,
        classMultiRangeIndex,
        MapDeclutterMode.Level3,
        this.airspaceModule.show[AirspaceShowType.ClassB]
      ));
      this.controllers.push(new MapSymbolVisController(
        context,
        range,
        classMultiShow,
        classMultiRangeIndex,
        MapDeclutterMode.Level3,
        this.airspaceModule.show[AirspaceShowType.ClassC]
      ));
    }

    const classDShow = settingManager.tryGetSetting('mapClassDAirspace');
    const classDRangeIndex = settingManager.tryGetSetting('mapClassDAirspaceRange') ?? Subject.create(Number.MAX_SAFE_INTEGER);
    if (classDShow) {
      this.controllers.push(new MapSymbolVisController(
        context,
        range,
        classDShow,
        classDRangeIndex,
        MapDeclutterMode.Level3,
        this.airspaceModule.show[AirspaceShowType.ClassD]
      ));
    }
  }

  /** @inheritdoc */
  public onAfterMapRender(): void {
    this.controllers.forEach(controller => { controller.onAfterMapRender(); });
  }

  /** @inheritdoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.controllers.forEach(controller => { controller.destroy(); });
  }
}

import {
  MapSystemContext, MapSystemController, Subject, Subscribable, Subscription, UnitType, UserSettingManager
} from '@microsoft/msfs-sdk';

import { MapUserSettingTypes } from '../../Settings/MapUserSettings';
import { TrafficAltitudeModeSetting, TrafficMotionVectorModeSetting, TrafficUserSettingTypes } from '../../Settings/TrafficUserSettings';
import { MapTrafficAlertLevelSettingMode } from '../MapCommon';
import { MapKeys } from '../MapKeys';
import { MapDeclutterMode } from '../Modules/MapDeclutterModule';
import { MapIfdTrafficModule, MapTrafficAlertLevelMode, MapTrafficAltitudeRestrictionMode, MapTrafficMotionVectorMode } from '../Modules/MapIfdTrafficModule';
import { MapSymbolVisController } from './MapSymbolVisController';
import { IfdMapIndexedRangeModule } from '../Modules/IfdMapIndexedRangeModule';

/**
 * User settings controlling the visibility of map airspaces.
 */
export type MapTrafficUserSettings = Pick<
  MapUserSettingTypes,
  'mapTrafficShow'
  | 'mapTrafficRangeIndex'
>;

/**
 * Modules required for MapIfdTrafficController.
 */
export interface MapIfdTrafficControllerModules {
  /** Range module. */
  [MapKeys.Range]?: IfdMapIndexedRangeModule;

  /** IFD traffic module. */
  [MapKeys.Traffic]: MapIfdTrafficModule;
}

/**
 * Controls the display of traffic on a map based on user settings.
 */
export class MapIfdTrafficController extends MapSystemController<MapIfdTrafficControllerModules> {
  private static readonly ALT_MODE_MAP = {
    [TrafficAltitudeModeSetting.Above]: MapTrafficAltitudeRestrictionMode.Above,
    [TrafficAltitudeModeSetting.Below]: MapTrafficAltitudeRestrictionMode.Below,
    [TrafficAltitudeModeSetting.Normal]: MapTrafficAltitudeRestrictionMode.Normal,
    [TrafficAltitudeModeSetting.Unrestricted]: MapTrafficAltitudeRestrictionMode.Unrestricted
  };
  private static readonly MOTION_VECTOR_MODE_MAP = {
    [TrafficMotionVectorModeSetting.Off]: MapTrafficMotionVectorMode.Off,
    [TrafficMotionVectorModeSetting.Absolute]: MapTrafficMotionVectorMode.Absolute,
    [TrafficMotionVectorModeSetting.Relative]: MapTrafficMotionVectorMode.Relative
  };
  private static readonly ALERT_LEVEL_MODE_MAP = {
    [MapTrafficAlertLevelSettingMode.All]: MapTrafficAlertLevelMode.All,
    [MapTrafficAlertLevelSettingMode.Advisories]: MapTrafficAlertLevelMode.Advisories,
    [MapTrafficAlertLevelSettingMode.TA_RA]: MapTrafficAlertLevelMode.TA_RA,
    [MapTrafficAlertLevelSettingMode.RA]: MapTrafficAlertLevelMode.RA
  };

  private readonly ifdTrafficModule = this.context.model.getModule(MapKeys.Traffic);

  private readonly altitudeModeSetting: Subscribable<TrafficAltitudeModeSetting>;
  private readonly altitudeRelativeSetting: Subscribable<boolean>;
  private readonly motionVectorModeSetting: Subscribable<TrafficMotionVectorModeSetting>;
  private readonly motionVectorLookaheadSetting: Subscribable<number>;

  private readonly alertLevelModeSetting: Subscribable<MapTrafficAlertLevelSettingMode> | undefined;

  private altitudeModeSettingPipe?: Subscription;
  private altitudeRelativeSettingPipe?: Subscription;
  private motionVectorModeSettingPipe?: Subscription;
  private motionVectorLookaheadSettingSub?: Subscription;

  private iconVisController?: MapSymbolVisController;
  private labelVisController?: MapSymbolVisController;
  private alertLevelModePipe?: Subscription;

  /**
   * Constructor.
   * @param context This controller's map context.
   * @param trafficSettingManager A user settings manager containing traffic settings.
   * @param mapSettingManager A user settings manager containing map traffic settings. If not defined, the display of
   * traffic will not be bound to map traffic user settings.
   */
  constructor(
    context: MapSystemContext<MapIfdTrafficControllerModules, any, any, any>,
    trafficSettingManager: UserSettingManager<Partial<TrafficUserSettingTypes>>,
    mapSettingManager: UserSettingManager<MapUserSettingTypes> | undefined
  ) {
    super(context);

    this.altitudeModeSetting = trafficSettingManager.tryGetSetting('trafficAltitudeMode')
      ?? Subject.create(TrafficAltitudeModeSetting.Normal);

    this.altitudeRelativeSetting = trafficSettingManager.tryGetSetting('trafficAltitudeRelative')
      ?? Subject.create(true);

    this.motionVectorModeSetting = trafficSettingManager.tryGetSetting('trafficMotionVectorMode')
      ?? Subject.create(TrafficMotionVectorModeSetting.Off);

    this.motionVectorLookaheadSetting = trafficSettingManager.tryGetSetting('trafficMotionVectorLookahead')
      ?? Subject.create(60);


    if (mapSettingManager) {
      const range = mapSettingManager.tryGetSetting('mapRange') ?? Subject.create(20);
      const iconShowSetting = mapSettingManager.tryGetSetting('mapTrafficShow') as Subscribable<boolean> | undefined;
      const iconRangeIndexSetting = mapSettingManager.tryGetSetting('mapTrafficRangeIndex') as Subscribable<number> | undefined;

      if (iconShowSetting !== undefined) {
        this.iconVisController = new MapSymbolVisController(
          context as any,
          range,
          iconShowSetting,
          iconRangeIndexSetting ?? Subject.create(Number.MAX_SAFE_INTEGER),
          MapDeclutterMode.All,
          this.ifdTrafficModule.show
        );
      }

      const labelShowSetting = trafficSettingManager.tryGetSetting('mapTrafficLabelShow') as Subscribable<boolean> | undefined;
      const labelRangeIndexSetting = trafficSettingManager.tryGetSetting('mapTrafficLabelRangeIndex') as Subscribable<number> | undefined;

      if (labelShowSetting !== undefined) {
        this.labelVisController = new MapSymbolVisController(
          context as any,
          range,
          labelShowSetting,
          labelRangeIndexSetting ?? Subject.create(Number.MAX_SAFE_INTEGER),
          MapDeclutterMode.All,
          this.ifdTrafficModule.showIntruderLabel
        );
      }

      this.alertLevelModeSetting = mapSettingManager.tryGetSetting('mapTrafficAlertLevelMode') as Subscribable<MapTrafficAlertLevelSettingMode> | undefined;
    }
  }

  /** @inheritdoc */
  public onAfterMapRender(): void {
    this.altitudeModeSettingPipe = this.altitudeModeSetting.pipe(
      this.ifdTrafficModule.altitudeRestrictionMode,
      setting => MapIfdTrafficController.ALT_MODE_MAP[setting] ?? MapTrafficAltitudeRestrictionMode.Unrestricted
    );

    this.altitudeRelativeSettingPipe = this.altitudeRelativeSetting.pipe(this.ifdTrafficModule.isAltitudeRelative);

    this.motionVectorModeSettingPipe = this.motionVectorModeSetting.pipe(
      this.ifdTrafficModule.motionVectorMode,
      setting => MapIfdTrafficController.MOTION_VECTOR_MODE_MAP[setting] ?? MapTrafficMotionVectorMode.Off
    );

    this.motionVectorLookaheadSettingSub = this.motionVectorLookaheadSetting.sub(setting => {
      this.ifdTrafficModule.motionVectorLookahead.set(setting, UnitType.SECOND);
    });

    this.iconVisController?.onAfterMapRender();
    this.labelVisController?.onAfterMapRender();

    this.alertLevelModePipe = this.alertLevelModeSetting?.pipe(
      this.ifdTrafficModule.alertLevelMode,
      setting => MapIfdTrafficController.ALERT_LEVEL_MODE_MAP[setting] ?? MapTrafficAlertLevelMode.All
    );
  }

  /** @inheritdoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.altitudeModeSettingPipe?.destroy();
    this.altitudeRelativeSettingPipe?.destroy();
    this.motionVectorModeSettingPipe?.destroy();
    this.motionVectorLookaheadSettingSub?.destroy();

    this.iconVisController?.destroy();
    this.labelVisController?.destroy();

    this.alertLevelModePipe?.destroy();
  }
}

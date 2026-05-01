import { EventBus, UserSettingManager, UserSettingSaveManager } from '@microsoft/msfs-sdk';

import { AlertUserSettingTypes } from './AlertUserSettings';
import { ChartsUserSettingTypes } from './ChartsUserSettings';
import { ComRadioUserSettings, ComRadioUserSettingTypes } from './ComRadioUserSettings';
import { DatablockUserSettingTypes } from './DatablockUserSettings';
import { DisplayUserSettingTypes } from './DisplayUserSettings';
import { FmsUserSettings, FmsUserSettingTypes } from './FmsUserSettings';
import { IlluminationUserSettingTypes } from './IlluminationUserSettings';
import { NavigationUserSettingTypes } from './NavigationUserSettings';
import { SvsUserSettings, SvsUserSettingTypes } from './SvsUserSettings';
import { TerrainUserSettingTypes } from './TerrainUserSettings';
import { TimerUserSettingTypes } from './TimerUserSettings';
import { TimeUserSettings, TimeUserSettingTypes } from './TimeUserSettings';
import { TrafficUserSettingTypes } from './TrafficUserSettings';
import { UnitsUserSettingTypes } from './UnitsUserSettings';
import { VnavUserSettingTypes } from './VnavUserSettings';

/**
 * Sources of settings to be managed by {@link IfdUserSettingSaveManager}.
 */
export type IfdUserSettingSaveManagerSources = {
  /** A manager for alert user settings. */
  alertSettingManager: UserSettingManager<AlertUserSettingTypes>;
  /** A manager for chart user settings. */
  chartsSettingManager: UserSettingManager<ChartsUserSettingTypes>;
  /** A manager for COM radio user settings. */
  comRadioSettingManager: UserSettingManager<ComRadioUserSettingTypes>;
  /** A manager for datablock user settings. */
  datablockSettingManager: UserSettingManager<DatablockUserSettingTypes>;
  /** A manager for display user settings. */
  displayUserSettingManager: UserSettingManager<DisplayUserSettingTypes>;
  /** A manager for FMS user settings. */
  fmsSettingManager: UserSettingManager<FmsUserSettingTypes>;
  /** A manager for illumination user settings. */
  illuminationSettingManager: UserSettingManager<IlluminationUserSettingTypes>;
  /** A manager for navigation user settings. */
  navigationSettingManager: UserSettingManager<NavigationUserSettingTypes>;
  /** A manager for SVS user settings. */
  svsSettingManager: UserSettingManager<SvsUserSettingTypes>;
  /** A manager for terrain user settings. */
  terrainSettingManager: UserSettingManager<TerrainUserSettingTypes>;
  /** A manager for time user settings. */
  timeSettingManager: UserSettingManager<TimeUserSettingTypes>;
  /** A manager for timer user settings. */
  timerSettingManager: UserSettingManager<TimerUserSettingTypes>;
  /** A manager for traffic user settings. */
  trafficSettingManager: UserSettingManager<TrafficUserSettingTypes>;
  /** A manager for units user settings. */
  unitsSettingManager: UserSettingManager<UnitsUserSettingTypes>;
  /** A manager for VNAV user settings. */
  vnavSettingManager: UserSettingManager<VnavUserSettingTypes>;
}

/**
 * A manager for saving IFD user settings.
 */
export class IfdUserSettingSaveManager extends UserSettingSaveManager {
  /**
   * Creates an instance of IfdUserSettingSaveManager.
   * @param bus The event bus.
   * @param inputs Sources of settings to be managed by this manager.
   */
  public constructor(
    bus: EventBus,
    inputs: Readonly<IfdUserSettingSaveManagerSources>,
  ) {
    super(
      [
        ...inputs.alertSettingManager.getAllSettings(),
        ...inputs.chartsSettingManager.getAllSettings(),
        ...inputs.comRadioSettingManager.getAllSettings().filter((s) => !ComRadioUserSettings.UNSAVED_SETTINGS.some((unsaved) => s.definition.name.startsWith(unsaved))),
        ...inputs.datablockSettingManager.getAllSettings(),
        ...inputs.displayUserSettingManager.getAllSettings(),
        ...inputs.fmsSettingManager.getAllSettings().filter((s) => !FmsUserSettings.UNSAVED_SETTINGS.some((unsaved) => s.definition.name.startsWith(unsaved))),
        ...inputs.illuminationSettingManager.getAllSettings(),
        ...inputs.navigationSettingManager.getAllSettings(),
        ...inputs.svsSettingManager.getAllSettings().filter((s) => !SvsUserSettings.UNSAVED_SETTINGS.some((unsaved) => s.definition.name.startsWith(unsaved))),
        ...inputs.terrainSettingManager.getAllSettings(),
        ...inputs.timeSettingManager.getAllSettings().filter(s => !TimeUserSettings.UNSAVED_SETTINGS.some(unsaved => s.definition.name.startsWith(unsaved))),
        ...inputs.timerSettingManager.getAllSettings(),
        ...inputs.trafficSettingManager.getAllSettings(),
        ...inputs.unitsSettingManager.getAllSettings(),
        ...inputs.vnavSettingManager.getAllSettings()
      ],
      bus,
    );
  }
}

import { DefaultUserSettingManager, EventBus, UserSettingManager } from '@microsoft/msfs-sdk';

import { IfdBuiltInChartsSourceIds } from '../Charts/IfdBuiltInChartsSourceIds';

export enum ChartsDisplayMode {
  Day = 'day',
  Night = 'night',
  Auto = 'auto',
}

export enum ChartsAutoDisplayMode {
  Photocell,
  DimmingBus,
}

/**
 * Charts user settings.
 */
export type ChartsUserSettingTypes = {
  /** The charts display mode. Defaults to day. */
  displayMode: ChartsDisplayMode;
  /** The charts auto display mode. Defaults to photocell. */
  autoDisplayMode: ChartsAutoDisplayMode;
  /** The chart source to use. If the chart source is no longer available then LIDO will be defaulted to. */
  chartSourceUid: string;
}

/**
 * Utility class for retrieving Charts user setting managers.
 */
export class ChartsUserSettings {
  private static INSTANCE: UserSettingManager<ChartsUserSettingTypes> | undefined;

  /**
   * Gets an instance of the CHARTS user settings manager.
   * @param bus The event bus.
   * @returns An instance of the traffic user settings manager.
   */
  public static getManager(bus: EventBus): UserSettingManager<ChartsUserSettingTypes> {
    return ChartsUserSettings.INSTANCE ??= new DefaultUserSettingManager(bus, [
      {
        name: 'displayMode',
        defaultValue: ChartsDisplayMode.Auto,
      },
      {
        name: 'autoDisplayMode',
        defaultValue: ChartsAutoDisplayMode.Photocell,
      },
      {
        name: 'chartSourceUid',
        defaultValue: IfdBuiltInChartsSourceIds.Lido,
      }
    ], false);
  }
}

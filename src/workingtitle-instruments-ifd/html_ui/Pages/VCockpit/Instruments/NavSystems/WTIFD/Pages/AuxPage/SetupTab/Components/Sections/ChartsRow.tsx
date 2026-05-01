import { UserSettingManager } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../../../Charts/IfdChartsManager';
import { ChartsAutoDisplayMode, ChartsDisplayMode, ChartsUserSettingTypes } from '../../../../../Settings/ChartsUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The alerts settings of the setup page */
export class ChartsRow {
  /**
   * Gets the rows to display for this section
   * @param chartSettings The chart settings
   * @param chartsManager The IFD charts manager
   * @returns Section
   */
  public static getRows(
    chartSettings: UserSettingManager<ChartsUserSettingTypes>,
    chartsManager: IfdChartsManager
  ): SetupMenuRowListItems[] {
    const sourceUids = Array.from(chartsManager.sources.keys());

    return [
      {
        type: 'title',
        label: 'Charts',
        items: [
          {
            type: 'state',
            label: 'Chart Day/Night Mode',
            states: ['Day', 'Night', 'Auto'],
            currentStateIndex: chartSettings.getSetting('displayMode').map((v) => v === ChartsDisplayMode.Day ? 0 : v === ChartsDisplayMode.Night ? 1 : 2),
            onStateConfirmed: (stateIndex) => chartSettings.getSetting('displayMode').set(stateIndex === 0 ? ChartsDisplayMode.Day : stateIndex === 1 ? ChartsDisplayMode.Night : ChartsDisplayMode.Auto),
          },
          {
            type: 'state',
            label: 'Chart Auto Mode',
            states: ['Photocell', 'Dimming Bus'],
            currentStateIndex: chartSettings.getSetting('autoDisplayMode').map((v) => v === ChartsAutoDisplayMode.Photocell ? 0 : 1),
            onStateConfirmed: (stateIndex) => chartSettings.getSetting('autoDisplayMode').set(stateIndex === 0 ? ChartsAutoDisplayMode.Photocell : ChartsAutoDisplayMode.DimmingBus),
          },
          {
            type: 'state',
            label: 'Chart Source',
            states: sourceUids,
            currentStateIndex: chartSettings.getSetting('chartSourceUid').map((sourceUid) => sourceUids.findIndex((searchedSourceUid) => sourceUid === searchedSourceUid)),
            onStateConfirmed: (_index, stateName) => chartSettings.getSetting('chartSourceUid').set(stateName),
          }
        ]
      }
    ];
  }
}

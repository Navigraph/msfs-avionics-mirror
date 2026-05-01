import { UserSettingManager } from '@microsoft/msfs-sdk';

import { AdiHdiSettings, SvsUserSettingTypes } from '../../../../../Settings/SvsUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The SVS settings of the setup page */
export class SvsRow {
  /**
   * Gets the rows to display for this section
   * @param svsSettings The SVS settings
   * @returns The row section
   */
  public static getRows(
    svsSettings: UserSettingManager<SvsUserSettingTypes>,
  ): SetupMenuRowListItems[] {
    return [
      {
        type: 'title',
        label: 'SVS',
        items: [
          {
            type: 'state',
            label: 'Horizon Heading Marks',
            states: ['On', 'Off'],
            currentStateIndex: svsSettings.getSetting('showHorizonHeadingLabels').map((v) => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => svsSettings.getSetting('showHorizonHeadingLabels').set(stateIndex === 0)
          },
          {
            type: 'state',
            label: 'ADI HDI Display',
            states: [AdiHdiSettings.Auto, AdiHdiSettings.AlwaysOn],
            currentStateIndex: svsSettings.getSetting('showAdiHdi').map((v) => v === AdiHdiSettings.Auto ? 0 : 1),
            onStateConfirmed: (_, state) => svsSettings.getSetting('showAdiHdi').set(state as AdiHdiSettings),
          },
        ]
      }
    ];
  }
}

import { ComSpacing, UserSettingManager } from '@microsoft/msfs-sdk';

import { NavigationUserSettingTypes } from '../../../../../Settings/NavigationUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';
import { ComRadioUserSettingTypes } from '../../../../../Settings/ComRadioUserSettings';

/** The radio settings of the setup page */
export class RadioRow {
  /**
   * Gets the rows to display for this section
   * @param navigationSettings The navigation settings
   * @param comSettings The com radio settings
   * @returns The row section
   */
  public static getRows(
    navigationSettings: UserSettingManager<NavigationUserSettingTypes>,
    comSettings: UserSettingManager<ComRadioUserSettingTypes>,
  ): SetupMenuRowListItems[] {
    return [
      {
        type: 'title',
        label: 'Radio',
        items: [
          {
            type: 'state',
            label: 'Com Frequency Spacing',
            states: ['25 KHz', '8.33 KHz'],
            currentStateIndex: comSettings.getSetting('comSpacing'),
            onStateConfirmed: (stateIndex) => comSettings.getSetting('comSpacing').set(stateIndex === 0 ? ComSpacing.Spacing25Khz : ComSpacing.Spacing833Khz),
            // If an IFD version that does not have a built-in radio is developed (e.g. IFD545),
            // add an isVisible property to hide this row based on the instrument type.
          },
          {
            type: 'state',
            label: 'Auto-VLOC Tuning',
            states: ['On', 'Off'],
            currentStateIndex: navigationSettings.getSetting('autoVLocTuning').map((v) => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => navigationSettings.getSetting('autoVLocTuning').set(stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Auto GPS->VLOC Capture',
            states: ['On', 'Off'],
            currentStateIndex: navigationSettings.getSetting('autoVLocCapture').map((v) => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => navigationSettings.getSetting('autoVLocCapture').set(stateIndex === 0),
          }
        ]
      }
    ];
  }
}

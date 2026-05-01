import { UserSettingManager } from '@microsoft/msfs-sdk';

import { DisplayUserSettingTypes } from '../../../../../Settings/DisplayUserSettings';
import { IlluminationUserSettingTypes } from '../../../../../Settings/IlluminationUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The display settings of the setup page */
export class DisplayRow {
  /**
   * Gets the rows to display for this section
   * @param displaySettings The display settings
   * @param illuminationSettings The illumination settings
   * @returns Section
   */
  public static getRows(
    displaySettings: UserSettingManager<DisplayUserSettingTypes>,
    illuminationSettings: UserSettingManager<IlluminationUserSettingTypes>,
  ): SetupMenuRowListItems[] {
    return [
      {
        type: 'title',
        label: 'Display',
        items: [
          // {
          //   type: 'state',
          //   label: 'Touch Screen',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'Zoom Mode',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          {
            type: 'brightness',
            label: 'Bezel Brightness',
            states: ['Photocell', 'Dimming Bus', 'Manual'],
            currentStateIndex: illuminationSettings.getSetting('bezelDimmingSource'),
            currentManualBrightness: illuminationSettings.getSetting('bezelManualBrightness'),
          },
          {
            type: 'brightness',
            label: 'Display Brightness',
            states: ['Photocell', 'Dimming Bus', 'Manual'],
            currentStateIndex: illuminationSettings.getSetting('displayDimmingSource'),
            currentManualBrightness: illuminationSettings.getSetting('displayManualBrightness'),
          },
          {
            type: 'state',
            label: 'Hide Page Tabs',
            states: ['Never', 'After 2s', 'After 5s', 'After 10s', 'After 15s'],
            currentStateIndex: displaySettings.getSetting('hidePageTabs'),
          },

        ]
      }
    ];
  }
}

import { Subject } from '@microsoft/msfs-sdk';

import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The user profile settings of the setup page */
export class UserProfileRow {
  /**
   * Gets the rows to display for this section
   * @returns The row section
   */
  public static getRows(): SetupMenuRowListItems[] {
    return [
      {
        type: 'title',
        label: 'User Profile',
        isEnabled: false,
        items: [
          {
            type: 'textEdit',
            label: 'User Name 1',
            value: Subject.create('User-1'),
            format: (v) => String(v),
            parse: (v) => v,
            isEnabled: false
          },
        ]
      }
    ];
  }
}

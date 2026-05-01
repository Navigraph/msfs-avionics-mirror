
import { EventBus } from '@microsoft/msfs-sdk';

import { IfdOptions } from '../../../../../IfdOptions';
import { TerrainUserSettings } from '../../../../../Settings/TerrainUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The terrain settings of the setup page */
export class TerrainRow {
  /**
   * Gets the rows to display for this section
   * @param bus The event bus to use.
   * @param ifdOptions The IFD configuration to use.
   * @returns The row section
   */
  public static getRows(bus: EventBus, ifdOptions: IfdOptions): SetupMenuRowListItems[] {
    const settings = TerrainUserSettings.getManager(bus);

    return [
      {
        type: 'title',
        label: 'Terrain',
        items: ([
          ifdOptions.enableFlta && {
            type: 'state',
            label: 'FLTA',
            states: ['On', 'Off'],
            currentStateIndex: settings.getSetting('fltaEnabled').map(enabled => enabled ? 0 : 1),
            onStateConfirmed: (stateIndex) => settings.getSetting('fltaEnabled').set(stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Terrain Awareness (TA)',
            states: ['On', 'Off'],
            currentStateIndex: settings.getSetting('terrainAwarenessEnabled').map(enabled => enabled ? 0 : 1),
            onStateConfirmed: (stateIndex) => settings.getSetting('terrainAwarenessEnabled').set(stateIndex === 0),
          },
          ifdOptions.enableFlta && ifdOptions.audio.cautionTerrainEvent && ifdOptions.audio.terrainAheadEvent && {
            type: 'state',
            label: 'Terrain Caution Aural',
            states: ['Caution Terrain', 'Terrain Ahead'],
            currentStateIndex: settings.getSetting('terrainCautionAlternateAural').map(enabled => enabled ? 1 : 0),
            onStateConfirmed: (stateIndex) => settings.getSetting('terrainCautionAlternateAural').set(stateIndex === 1),
          } || false,
          ifdOptions.enableFlta && ifdOptions.audio.terrainPullUpEvent && ifdOptions.audio.terrainTerrainEvent && {
            type: 'state',
            label: 'Terrain Warning Aural',
            states: ['Terrain Pull Up', 'Terrain Terrain'],
            currentStateIndex: settings.getSetting('terrainWarningAlternateAural').map(enabled => enabled ? 1 : 0),
            onStateConfirmed: (stateIndex) => settings.getSetting('terrainWarningAlternateAural').set(stateIndex === 1),
          } || false,
          ifdOptions.enableFlta && {
            type: 'state',
            label: 'FLTA Exclusion Areas',
            states: ['On', 'Off'],
            currentStateIndex: settings.getSetting('fltaExclusionAreas').map(enabled => enabled ? 0 : 1),
            onStateConfirmed: (stateIndex) => settings.getSetting('fltaExclusionAreas').set(stateIndex === 0),
            isVisible: settings.getSetting('fltaEnabled'),
          },
        ] satisfies (SetupMenuRowListItems | false)[]).filter((item) => !!item),
      }
    ];
  }
}

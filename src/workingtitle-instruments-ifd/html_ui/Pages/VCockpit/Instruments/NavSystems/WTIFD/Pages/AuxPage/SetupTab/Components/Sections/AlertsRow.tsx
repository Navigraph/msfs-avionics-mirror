import { EventBus } from '@microsoft/msfs-sdk';

import { IfdOptions } from '../../../../../IfdOptions';
import { AlertUserSettings } from '../../../../../Settings/AlertUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The alerts settings of the setup page */
export class AlertsRow {
  private static readonly switchTanksTimes = [0, 15, 30, 45, 60] as const;

  /**
   * Gets the rows to display related to alerts
   * @param bus The event bus
   * @param options The IFD configuration.
   * @returns Alert rows
   */
  public static getRows(bus: EventBus, options: IfdOptions): SetupMenuRowListItems[] {
    const alertSettingsManager = AlertUserSettings.getManager(bus);

    return [
      {
        type: 'title',
        label: 'Alerts',
        items: ([
          {
            type: 'state',
            label: 'Controlled Airspace Alerts',
            states: ['On', 'Off'],
            currentStateIndex: alertSettingsManager.getSetting('controlledAirspaceAlerts').map((v) => v ? 0 : 1),
            onStateConfirmed: (idx) => alertSettingsManager.getSetting('controlledAirspaceAlerts').set(idx === 0),
          },
          // {
          //   type: 'state',
          //   label: 'TFR Alerts',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'SUA Alerts',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          {
            type: 'state',
            label: 'Transition Altitude/Level Alerts',
            states: ['On', 'Off'],
            currentStateIndex: alertSettingsManager.getSetting('transitionAltitudeLevelAlerts').map((v) => v ? 0 : 1),
            onStateConfirmed: (idx) => alertSettingsManager.getSetting('transitionAltitudeLevelAlerts').set(idx === 0),
          },
          {
            type: 'state',
            label: 'Switch Tanks Alert',
            states: ['Never', '15 min', '30 min', '45 min', '60 min'],
            currentStateIndex: alertSettingsManager.getSetting('switchTanksAlert').map((v) => Math.max(0, AlertsRow.switchTanksTimes.indexOf(v as any))),
            onStateConfirmed: (idx) => alertSettingsManager.getSetting('switchTanksAlert').set(AlertsRow.switchTanksTimes[idx]),
          },
          options.audio.topOfDescentEvent !== undefined && {
            type: 'state',
            label: 'Top Of Descent (TOD) Aural',
            states: ['On', 'Off'],
            currentStateIndex: alertSettingsManager.getSetting('topOfDescentChime').map((v) => v ? 0 : 1),
            onStateConfirmed: (idx) => alertSettingsManager.getSetting('topOfDescentChime').set(idx === 0),
          },
          options.audio.airspaceAheadEvent !== undefined && {
            type: 'state',
            label: 'Airspace Aural',
            states: ['On', 'Off'],
            currentStateIndex: alertSettingsManager.getSetting('airspaceAural').map((v) => v ? 0 : 1),
            onStateConfirmed: (idx) => alertSettingsManager.getSetting('airspaceAural').set(idx === 0),
          },
          options.audio.finalApproachEvent !== undefined && options.audio.missedApproachEvent !== undefined && options.audio.waypointEvent !== undefined && {
            type: 'state',
            label: 'Waypoint Aural',
            states: ['On', 'Off'],
            currentStateIndex: alertSettingsManager.getSetting('waypointAurals').map((v) => v ? 0 : 1),
            onStateConfirmed: (idx) => alertSettingsManager.getSetting('waypointAurals').set(idx === 0),
          },
          (options.audio.altitude1000Event !== undefined || options.audio.altitude500Event !== undefined || options.audio.altitude400Event !== undefined ||
            options.audio.altitude300Event !== undefined || options.audio.altitude200Event !== undefined || options.audio.altitude100Event !== undefined) && {
            type: 'state',
            label: 'Altitude Callouts',
            states: ['On', 'Off'],
            currentStateIndex: alertSettingsManager.getSetting('altitudeCallouts').map((v) => v ? 0 : 1),
            onStateConfirmed: (idx) => alertSettingsManager.getSetting('altitudeCallouts').set(idx === 0),
          },
        ] satisfies (SetupMenuRowListItems | false)[]).filter((r) => r) as SetupMenuRowListItems[]
      }
    ];
  }
}

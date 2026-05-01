import { UserSettingManager } from '@microsoft/msfs-sdk';

import {
  UnitsAltitudeSettingMode, UnitsDistanceSettingMode, UnitsFuelSettingMode, UnitsNavAngleSettingMode, UnitsPressureSettingMode, UnitsTemperatureSettingMode,
  UnitsUserSettingTypes
} from '../../../../../Settings/UnitsUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The units settings of the setup page */
export class UnitsRow {
  private static bearingRefMap = [
    UnitsNavAngleSettingMode.Magnetic,
    UnitsNavAngleSettingMode.True,
  ];

  private static distanceSpeedMap = [
    UnitsDistanceSettingMode.Nautical,
    UnitsDistanceSettingMode.Metric,
    UnitsDistanceSettingMode.Statute,
  ];

  private static altitudeVsMap = [
    UnitsAltitudeSettingMode.Feet,
    UnitsAltitudeSettingMode.Meters,
    UnitsAltitudeSettingMode.MetersMps,
  ];

  private static pressureMap = [
    UnitsPressureSettingMode.InHg,
    UnitsPressureSettingMode.Millibars,
    UnitsPressureSettingMode.hPa,
  ];

  private static temperatureMap = [
    UnitsTemperatureSettingMode.Fahrenheit,
    UnitsTemperatureSettingMode.Celsius,
  ];

  private static fuelMap = [
    UnitsFuelSettingMode.Gallons,
    UnitsFuelSettingMode.ImpGal,
    UnitsFuelSettingMode.Liters,
    UnitsFuelSettingMode.Pounds,
    UnitsFuelSettingMode.Kilograms,
  ];

  /**
   * Gets the rows to display for this section
   * @param unitsSettings The SVS settings
   * @returns The row section
   */
  public static getRows(
    unitsSettings: UserSettingManager<UnitsUserSettingTypes>,
  ): SetupMenuRowListItems[] {
    return [
      {
        type: 'title',
        label: 'Units',
        items: [
          {
            type: 'state',
            label: 'Bearing Reference',
            states: ['Magnetic', 'True'],
            currentStateIndex: unitsSettings.getSetting('unitsNavAngle').map(mode => this.bearingRefMap.indexOf(mode)),
            onStateConfirmed: (index) => unitsSettings.getSetting('unitsNavAngle').set(this.bearingRefMap[index]),
          },
          {
            type: 'state',
            label: 'Distance/Speed Units',
            states: ['NM/Kts', 'KM/KPH', 'MI/MPH'],
            currentStateIndex: unitsSettings.getSetting('unitsDistance').map(mode => this.distanceSpeedMap.indexOf(mode)),
            onStateConfirmed: (index) => unitsSettings.getSetting('unitsDistance').set(this.distanceSpeedMap[index]),
          },
          {
            type: 'state',
            label: 'Altitude/VS Units',
            states: ['Ft/FPM', 'M/MPM', 'M/MPS'],
            currentStateIndex: unitsSettings.getSetting('unitsAltitude').map(mode => this.altitudeVsMap.indexOf(mode)),
            onStateConfirmed: (index) => unitsSettings.getSetting('unitsAltitude').set(this.altitudeVsMap[index]),
          },
          {
            type: 'state',
            label: 'Pressure Units',
            states: ['InHg', 'Millibars', 'hPa'],
            currentStateIndex: unitsSettings.getSetting('unitsPressure').map(mode => this.pressureMap.indexOf(mode)),
            onStateConfirmed: (index) => unitsSettings.getSetting('unitsPressure').set(this.pressureMap[index]),
          },
          {
            type: 'state',
            label: 'Temperature Units',
            states: ['Fahrenheit', 'Celsius'],
            currentStateIndex: unitsSettings.getSetting('unitsTemperature').map(mode => this.temperatureMap.indexOf(mode)),
            onStateConfirmed: (index) => unitsSettings.getSetting('unitsTemperature').set(this.temperatureMap[index]),
          },
          {
            type: 'state',
            label: 'Fuel Units',
            states: ['Gallons', 'Imperial Gallons', 'Liters', 'Pounds', 'Kilograms'],
            currentStateIndex: unitsSettings.getSetting('unitsFuel').map(mode => this.fuelMap.indexOf(mode)),
            onStateConfirmed: (index) => unitsSettings.getSetting('unitsFuel').set(this.fuelMap[index]),
          },
          {
            type: 'state',
            label: 'Position Units',
            states: ['ddd°mm.ss\'\'', 'UTM', 'MGRS'],
            isEnabled: false,
          },
        ]
      }
    ];
  }
}

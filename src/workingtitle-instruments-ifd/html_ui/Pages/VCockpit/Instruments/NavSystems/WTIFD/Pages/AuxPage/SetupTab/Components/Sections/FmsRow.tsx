import { EventBus, Lifecycle, MappedSubject, MathUtils, Subscribable, Unit, UnitFamily, UnitType, UserSettingManager } from '@microsoft/msfs-sdk';

import { UnitFormatter } from '../../../../../Components/NumberDisplays';
import { KeyboardInputType, VirtualKeyboardType } from '../../../../../Keyboard/KeyboardTypes';
import { FmsUserSettingTypes } from '../../../../../Settings/FmsUserSettings';
import { UnitsUserSettings } from '../../../../../Settings/UnitsUserSettings';
import { VnavPathBasis, VnavUserSettingTypes } from '../../../../../Settings/VnavUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/** The FMS settings of the setup page */
export class FmsRow {
  private static readonly GREEN = 'var(--wtdyne-color-green)';
  private static readonly WHITE = 'var(--wtdyne-color-white)';

  private static readonly intParser = (v: string): number => parseInt(v);
  private static readonly intFormatter = (v: number): string => v.toFixed(0);
  private static readonly floatParser = (v: string): number => parseFloat(v);
  private static readonly floatFormatter1Dp = (v: number): string => v.toFixed(1);

  private static readonly transAltParser = (v: string): number => {
    const value = parseFloat(v);
    return Number.isNaN(value) || value <= 0 ? -1 : MathUtils.clamp(Math.trunc(value), 1000, 60000);
  };
  /**
   * Parse that allows either 2/3 digit FL entry, or altitude in feet.
   * @param v The value to parse.
   * @returns An altitude in feet.
   */
  private static readonly transLevelParser = (v: string): number => {
    const value = parseFloat(v);
    if (Number.isNaN(value) || value <= 0) {
      return -1;
    }
    return MathUtils.clamp(v.length < 4 ? Math.trunc(value) * 100 : MathUtils.round(value, 100), 1000, 60000);
  };
  private static descentRateParser = (verticalSpeedUnits: Subscribable<Unit<UnitFamily.Speed>>) =>
    (descentRate: string): number => UnitType.FPM.convertFrom(FmsRow.intParser(descentRate), verticalSpeedUnits.get());

  /**
   * Gets the rows to display for this section
   * @param bus The Event Bus
   * @param lifecycle The lifecycle to use
   * @param vnavSettings The VNAV settings
   * @param fmsSettings The FMS settings
   * @returns Section
   */
  public static getRows(
    bus: EventBus,
    lifecycle: Lifecycle,
    vnavSettings: UserSettingManager<VnavUserSettingTypes>,
    fmsSettings: UserSettingManager<FmsUserSettingTypes>,
  ): SetupMenuRowListItems[] {
    const { verticalSpeedUnits } = UnitsUserSettings.getManager(bus);

    return [
      {
        type: 'title',
        label: 'FMS',
        items: [
          {
            type: 'title',
            label: 'VNAV',
            items: [
              {
                type: 'state',
                label: 'Path Basis',
                states: ['Descent Angle', 'Descent Rate'],
                currentStateIndex: vnavSettings.getSetting('vnavPathBasis'),
                onStateConfirmed: (index) => vnavSettings.getSetting('vnavPathBasis').set(index),
              },
              {
                type: 'textEdit',
                label: 'Descent Angle',
                value: vnavSettings.getSetting('vnavDescentAngle'),
                parse: FmsRow.floatParser,
                format: FmsRow.floatFormatter1Dp,
                postfixUnit: '°',
                keyboardDisableModeSwitch: true,
                keyboardInitialShowNumpad: true,
                keyboardInputType: KeyboardInputType.DescentAngle,
                keyboardType: VirtualKeyboardType.Alphanumeric,
                onValueConfirmed: (v) => vnavSettings.getSetting('vnavDescentAngle').set(v),
                isVisible: vnavSettings.getSetting('vnavPathBasis').map((v) => v === VnavPathBasis.DescentAngle).withLifecycle(lifecycle),
              },
              {
                type: 'textEdit',
                label: 'Descent Rate',
                value: MappedSubject.create(
                  ([rate, unit]) => UnitType.FPM.convertTo(rate, unit),
                  vnavSettings.getSetting('vnavDescentRate'),
                  verticalSpeedUnits,
                ).withLifecycle(lifecycle),
                parse: FmsRow.descentRateParser(verticalSpeedUnits),
                format: FmsRow.intFormatter,
                postfixUnit: verticalSpeedUnits
                  .map(UnitFormatter.unitLabel<UnitFamily.Speed>)
                  .withLifecycle(lifecycle),
                keyboardDisableModeSwitch: true,
                keyboardInitialShowNumpad: true,
                onValueConfirmed: (v) => vnavSettings.getSetting('vnavDescentRate').set(v),
                isVisible: vnavSettings.getSetting('vnavPathBasis').map((v) => v === VnavPathBasis.DescentRate).withLifecycle(lifecycle),
              }
            ]
          },
          {
            type: 'textEdit',
            label: 'Transition Altitude',
            color: fmsSettings.getSetting('manualTransitionAltitude').map((v) => v >= 0 ? FmsRow.WHITE : FmsRow.GREEN).withLifecycle(lifecycle),
            value: fmsSettings.getSetting('transitionAltitude'),
            onValueConfirmed: (v) => fmsSettings.getSetting('manualTransitionAltitude').set(v),
            onValueCleared: () => fmsSettings.getSetting('manualTransitionAltitude').set(-1),
            format: FmsRow.intFormatter,
            parse: FmsRow.transAltParser,
            postfixUnit: 'FT',
            keyboardType: VirtualKeyboardType.Alphanumeric,
            keyboardInputType: KeyboardInputType.Altitude,
            keyboardDisableModeSwitch: true,
            keyboardInitialShowNumpad: true,
          },
          {
            type: 'textEdit',
            label: 'Transition Level',
            color: fmsSettings.getSetting('manualTransitionLevel').map((v) => v >= 0 ? FmsRow.WHITE : FmsRow.GREEN).withLifecycle(lifecycle),
            value: fmsSettings.getSetting('transitionLevel'),
            onValueConfirmed: (v) => fmsSettings.getSetting('manualTransitionLevel').set(v),
            onValueCleared: () => fmsSettings.getSetting('manualTransitionLevel').set(-1),
            parse: FmsRow.transLevelParser,
            format: (v: number): string => (v / 100).toFixed(0).padStart(3, '0'),
            prefixUnit: 'FL',
            keyboardType: VirtualKeyboardType.Alphanumeric,
            keyboardInputType: KeyboardInputType.FlightLevel,
            keyboardDisableModeSwitch: true,
            keyboardInitialShowNumpad: true,
          },
          // {
          //   type: 'state',
          //   label: 'High Altitude Airways',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'Low Altitude Airways',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'Arrivals',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'Departures',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'Approaches',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'Visual Approaches',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'title',
          //   label: 'Visual Approach Settings',
          //   isEnabled: false,
          //   items: [
          //     {
          //       type: 'textEdit',
          //       label: 'Final Length',
          //       value: Subject.create(1.0),
          //       parse: FmsRow.floatParser,
          //       format: FmsRow.floatFormatter1Dp,
          //       postfixUnit: 'NM',
          //       keyboardInputType: KeyboardInputType.NM,
          //       keyboardDisableModeSwitch: true,
          //       keyboardInitialShowNumpad: true,
          //       isEnabled: false,
          //     },
          //     {
          //       type: 'textEdit',
          //       label: 'Pattern Width',
          //       value: Subject.create(1.2),
          //       parse: this.floatParser,
          //       format: this.floatFormatter1Dp,
          //       postfixUnit: 'NM',
          //       keyboardInputType: KeyboardInputType.NM,
          //       keyboardDisableModeSwitch: true,
          //       keyboardInitialShowNumpad: true,
          //       isEnabled: false
          //     },
          //     {
          //       type: 'textEdit',
          //       label: 'Glideslope',
          //       value: Subject.create(4.0),
          //       parse: this.floatParser,
          //       format: this.floatFormatter1Dp,
          //       postfixUnit: '°',
          //       keyboardInputType: KeyboardInputType.Angle,
          //       keyboardDisableModeSwitch: true,
          //       keyboardInitialShowNumpad: true,
          //       isEnabled: false,
          //     },
          //   ]
          // },
          // {
          //   type: 'state',
          //   label: 'Patterns',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'SBAS Channel Numbers',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          {
            type: 'state',
            label: 'Mini Flight Plan Format',
            states: ['On', 'Off'],
            currentStateIndex: fmsSettings.getSetting('miniFlightPlanFormat').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => fmsSettings.getSetting('miniFlightPlanFormat').set(stateIndex === 0),
          },
          // {
          //   type: 'state',
          //   label: 'Advisory Glideslope',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
          // {
          //   type: 'state',
          //   label: 'Auto Enable Missed',
          //   states: ['On', 'Off'],
          //   isEnabled: false,
          // },
        ]
      }
    ];
  }
}

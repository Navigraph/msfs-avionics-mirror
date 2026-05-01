import {
  ComponentProps, FSComponent, LifecycleComponent, MappedSubject, NumberUnit, NumberUnitSubject, Subject, Subscribable, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { KeyboardInputType } from '../../../../Keyboard/KeyboardTypes';
import { UnitsUserSettingManager } from '../../../../Settings/UnitsUserSettings';
import { AdcMath } from '../../../../Utilities/AdcMath';

import './DensityAltCalc.css';

/** The properties for the {@link DensityAltCalc} component. */
export interface DensityAltCalcProps extends ComponentProps {
  /** Whether the item is hidden. */
  hidden: Subject<boolean>;
  /** Opens the keyboard. */
  readonly openKeyboard: (
    smartPrefill: string,
    onAccept: (value: string) => void,
    anchorEl?: HTMLElement,
    onValueChanged?: (value: string) => void,
    onClose?: () => void,
    inputType?: KeyboardInputType,
  ) => void;
  /** The elevation of the field in feet */
  elevationFt: Subscribable<number>;
  /** The unitSettingManager to use. */
  unitSettingManager: UnitsUserSettingManager;

}

/** Cursor Field indexes for {@link DensityAltCalc} */
enum CalculatorFieldIndex {
  Temperature,
  Altimeter,
  DewPoint
}

/** The general info of the info tab */
export class DensityAltCalc extends LifecycleComponent<DensityAltCalcProps> {
  private readonly overlayRef = FSComponent.createRef<HTMLDivElement>();
  private readonly calcRef = FSComponent.createRef<HTMLDivElement>();
  private readonly tempRef = FSComponent.createRef<HTMLDivElement>();
  private readonly altimeterRef = FSComponent.createRef<HTMLDivElement>();
  private readonly dewPointRef = FSComponent.createRef<HTMLDivElement>();
  private readonly selectedField = Subject.create<CalculatorFieldIndex>(CalculatorFieldIndex.Temperature);

  private readonly tempValue = NumberUnitSubject.create(new NumberUnit(75, UnitType.FAHRENHEIT));
  private readonly altimeterValue = NumberUnitSubject.create(new NumberUnit(30, UnitType.IN_HG));
  private readonly dewPointValue = NumberUnitSubject.create(new NumberUnit(70, UnitType.FAHRENHEIT));

  private readonly tempDisplay = MappedSubject.create(
    ([temp, tempUnits]) => temp.asUnit(tempUnits).toFixed(0),
    this.tempValue,
    this.props.unitSettingManager.temperatureUnits
  ).withLifecycle(this.defaultLifecycle);

  private readonly dewPointDisplay = MappedSubject.create(
    ([dewPointTemp, tempUnits]) => dewPointTemp.asUnit(tempUnits).toFixed(0),
    this.dewPointValue,
    this.props.unitSettingManager.temperatureUnits
  ).withLifecycle(this.defaultLifecycle);

  private readonly altimeterDisplay = MappedSubject.create(
    ([pressure, pressureUnits]) => pressureUnits === UnitType.IN_HG ? pressure.asUnit(pressureUnits).toFixed(2) : pressure.asUnit(pressureUnits).toFixed(0),
    this.altimeterValue,
    this.props.unitSettingManager.pressureUnits
  ).withLifecycle(this.defaultLifecycle);

  private readonly tempDisplayUnit = this.props.unitSettingManager.temperatureUnits.map((unit) => unit === UnitType.FAHRENHEIT ? '°F' : '°C').withLifecycle(this.defaultLifecycle);
  private readonly altitudeDisplayUnit = this.props.unitSettingManager.altitudeUnits.map((unit) => unit === UnitType.FOOT ? 'Ft' : 'm').withLifecycle(this.defaultLifecycle);

  private readonly baroPressureDisplayUnit = this.props.unitSettingManager.pressureUnits.map(
    (pressureUnit) => {
      switch (pressureUnit) {
        case UnitType.IN_HG:
          return 'inHg';
        case UnitType.HPA:
          return 'hPa';
        default:
          return 'mb';
      }
    }
  ).withLifecycle(this.defaultLifecycle);

  private readonly densityAltitude = MappedSubject.create(
    ([elevation, airTemp, baroSetting, dewPoint, altitudeUnit]) => {
      const altFt = AdcMath.calcDensityAltitude(elevation, baroSetting.asUnit(UnitType.IN_HG), airTemp.asUnit(UnitType.FAHRENHEIT), dewPoint.asUnit(UnitType.FAHRENHEIT));
      return altitudeUnit.convertFrom(altFt, UnitType.FOOT).toFixed(0);
    },
    this.props.elevationFt,
    this.tempValue,
    this.altimeterValue,
    this.dewPointValue,
    this.props.unitSettingManager.altitudeUnits
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.overlayRef.getOrDefault()?.addEventListener('click', this.hideDensityAltCal);
    this.calcRef.getOrDefault()?.addEventListener('click', this.stopPropagation);
    this.tempRef.getOrDefault()?.addEventListener('click', this.onTempSelected);
    this.altimeterRef.getOrDefault()?.addEventListener('click', this.onAltSelected);
    this.dewPointRef.getOrDefault()?.addEventListener('click', this.onDewPointSelected);

    // When opened, default selection to the first field.
    this.props.hidden.sub((hidden) => {
      if (!hidden) {
        this.selectedField.set(CalculatorFieldIndex.Temperature);
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  private hideDensityAltCal = (): void => {
    this.props.hidden.set(true);
  };

  private stopPropagation = (e: MouseEvent): void => {
    e.stopPropagation();
  };

  /**
   * Gets whether the calculator is currently visible.
   * @returns True when the overlay is shown.
   */
  public isVisible(): boolean {
    return this.props.hidden.get() === false;
  }

  /**
   * Hides the calculator (same behavior as clicking the overlay / CLR).
   */
  public hide(): void {
    this.props.hidden.set(true);
  }

  /**
   * Moves the selected field by delta (+1 / -1).
   * @param delta The delta to move by.
   */
  public moveSelectionBy(delta: number): void {
    const direction = delta > 0 ? 1 : -1;

    const current = this.selectedField.get();
    const next = this.clampFieldIndex(current + direction);

    if (next !== current) {
      this.selectedField.set(next);
    }
  }

  /**
   * Activates the currently selected field (same behavior as mouse click on that field).
   * This will either select the field (if not selected) or open the keyboard (if already selected).
   */
  public activateSelection(): void {
    const selected = this.selectedField.get();

    switch (selected) {
      case CalculatorFieldIndex.Temperature: {
        this.onTempSelected();
        break;
      }
      case CalculatorFieldIndex.Altimeter: {
        this.onAltSelected();
        break;
      }
      case CalculatorFieldIndex.DewPoint: {
        this.onDewPointSelected();
        break;
      }
    }
  }

  /**
   * Clamps a raw field index into [Temperature..DewPoint].
   * @param value Raw index.
   * @returns Clamped index.
   */
  private clampFieldIndex(value: number): CalculatorFieldIndex {
    const min = CalculatorFieldIndex.Temperature;
    const max = CalculatorFieldIndex.DewPoint;

    const clamped = Math.max(min, Math.min(max, value));

    return clamped as CalculatorFieldIndex;
  }

  /**
   * Handles selection of the Altimeter field.
   * Opens the numeric keyboard and notifies the parent on accept.
   */
  private readonly onAltSelected = (): void => {
    if (this.selectedField.get() !== CalculatorFieldIndex.Altimeter) {
      this.selectedField.set(CalculatorFieldIndex.Altimeter);
      return;
    }

    const prefill = this.altimeterValue.get().number.toFixed(2);
    const pressureUnit = this.props.unitSettingManager.pressureUnits.get();
    this.props.openKeyboard(
      prefill,
      (value) => {
        if (Number(value) > 0) {
          this.altimeterValue.set(pressureUnit.createNumber(Number(value)));
        }
      },
      this.altimeterRef.instance,
      undefined,
      undefined,
      KeyboardInputType.Pressure

    );

  };

  /**
   * Handles selection of the DewPoint field.
   * Opens the numeric keyboard and notifies the parent on accept.
   */
  private readonly onDewPointSelected = (): void => {
    if (this.selectedField.get() !== CalculatorFieldIndex.DewPoint) {
      this.selectedField.set(CalculatorFieldIndex.DewPoint);
      return;
    }

    const prefill = this.dewPointValue.get().number.toFixed(0);
    const tempUnit = this.props.unitSettingManager.temperatureUnits.get();

    this.props.openKeyboard(
      prefill,
      (value) => {
        const trimmed = Number(value.trim());
        if (trimmed > 0) {
          const temp = this.tempValue.asUnit(tempUnit).get();
          // DewPoint cannot exceed air temperature
          const newDewPoint = Math.min(Number(value), temp);
          this.dewPointValue.set(tempUnit.createNumber(newDewPoint));
        }
      },
      this.dewPointRef.instance,
      undefined,
      undefined,
      KeyboardInputType.Temperature
    );
  };

  /**
   * Handles selection of the Temperature field.
   * Opens the numeric keyboard and notifies the parent on accept.
   */
  private readonly onTempSelected = (): void => {
    if (this.selectedField.get() !== CalculatorFieldIndex.Temperature) {
      this.selectedField.set(CalculatorFieldIndex.Temperature);
      return;
    }

    const prefill = this.tempValue.get().number.toFixed(0);
    const tempUnit = this.props.unitSettingManager.temperatureUnits.get();

    this.props.openKeyboard(
      prefill,
      (value) => {
        const trimmed = Number(value.trim());
        if (trimmed > 0) {
          // Air temperature cannot be lower than DewPoint
          const newTemp = Math.max(trimmed, this.dewPointValue.asUnit(tempUnit).get());
          this.tempValue.set(tempUnit.createNumber(newTemp));
        }
      },
      this.tempRef.instance,
      undefined,
      undefined,
      KeyboardInputType.Temperature
    );
  };

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={{ 'density-alt-calc-overlay': true, hidden: this.props.hidden ?? false }} ref={this.overlayRef}>
        <div class='density-alt-calc' ref={this.calcRef}>
          <div class='density-alt-wrapper'>
            <div class='density-alt-title'>Density Altitude Calculator</div>
            <div class='density-alt-row'>
              <div class='density-alt-property'>Temperature:</div>
              <div
                class={{
                  'density-alt-value': true,
                  selected: this.selectedField.map(v => v === CalculatorFieldIndex.Temperature).withLifecycle(this.defaultLifecycle)
                }}
                ref={this.tempRef}
              >
                {this.tempDisplay}
              </div>
              <div class='density-alt-unit'>{this.tempDisplayUnit}</div>
            </div>
            <div class='density-alt-row'>
              <div class='density-alt-property'>Altimeter:</div>
              <div
                class={{
                  'density-alt-value': true,
                  selected: this.selectedField.map(v => v === CalculatorFieldIndex.Altimeter).withLifecycle(this.defaultLifecycle)
                }}
                ref={this.altimeterRef}
              >
                {this.altimeterDisplay}
              </div>
              <div class='density-alt-unit'>{this.baroPressureDisplayUnit}</div>
            </div>
            <div class='density-alt-row'>
              <div class='density-alt-property'>Dew Point:</div>
              <div
                class={{
                  'density-alt-value': true,
                  selected: this.selectedField.map(v => v === CalculatorFieldIndex.DewPoint).withLifecycle(this.defaultLifecycle)
                }}
                ref={this.dewPointRef}
              >
                {this.dewPointDisplay}
              </div>
              <div class='density-alt-unit'>{this.tempDisplayUnit}</div>
            </div>
            <div class='density-alt-row density-alt-result'>
              <div class='density-alt-property'>Density Altitude:</div>
              <div class='density-alt-value'>{this.densityAltitude}{this.altitudeDisplayUnit}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.overlayRef.getOrDefault()?.removeEventListener('click', this.hideDensityAltCal);
    this.calcRef.getOrDefault()?.removeEventListener('click', this.stopPropagation);
    this.tempRef.getOrDefault()?.removeEventListener('click', this.onTempSelected);
    this.altimeterRef.getOrDefault()?.removeEventListener('click', this.onAltSelected);
    this.dewPointRef.getOrDefault()?.removeEventListener('click', this.onDewPointSelected);
    super.destroy();
  }
}

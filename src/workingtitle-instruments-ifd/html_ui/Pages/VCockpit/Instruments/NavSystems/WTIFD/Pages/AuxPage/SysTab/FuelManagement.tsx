import {
  ClassProp, ComponentProps, CompoundUnit, ConsumerSubject, DurationFormatter, EventBus, FSComponent, LifecycleComponent, MappedSubject, NumberFormatter,
  SimpleUnit, Subject, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { TouchButton } from '../../../Components/TouchButton/TouchButton';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdOptions } from '../../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../Keyboard/KeyboardTypes';
import { IfdInteractionEventHandler } from '../../../RightKnob';
import { UnitsDistanceSettingMode, UnitsFuelSettingMode, UnitsUserSettings } from '../../../Settings/UnitsUserSettings';
import { IfdFuelComputerControlEvents, IfdFuelComputerEvents } from '../../../Systems/FuelComputer/IfdFuelComputerEvents';
import { FormatUtils } from '../../../Utilities/FormatUtils';

import './FuelManagement.css';

/** The properties for the {@link FuelManagement} component. */
interface FuelManagementProps extends ComponentProps {
  /** The event bus. */
  readonly bus: EventBus;
  /** The IFD configuration options. */
  readonly ifdOptions: IfdOptions;
  /** CSS classes to apply. */
  readonly class?: ClassProp,
}

enum FuelManagementCursorItems {
  FuelAdded,
  FuelTotal,
}

/** The FuelManagement component. */
export class FuelManagement extends LifecycleComponent<FuelManagementProps> implements IfdInteractionEventHandler {
  private static readonly FUEL_FORMATTER = NumberFormatter.create({
    precision: 0.1,
    nanString: '--.-',
  });
  private static readonly DURATION_FORMATTER = DurationFormatter.create('{hh}:{mm}', UnitType.HOUR, 0.01, '--:--');

  private readonly fuelSub = this.props.bus.getSubscriber<IfdFuelComputerEvents>();
  private readonly fuelUnits = UnitsUserSettings.getManager(this.props.bus).getSetting('unitsFuel');
  private readonly distanceUnits = UnitsUserSettings.getManager(this.props.bus).getSetting('unitsDistance');

  private readonly fuelFlow1 = ConsumerSubject.create<number>(null, NaN).withLifecycle(this.defaultLifecycle);
  private readonly fuelFlow2 = ConsumerSubject.create<number>(null, NaN).withLifecycle(this.defaultLifecycle);
  private readonly fuelUsed1 = ConsumerSubject.create<number>(null, NaN).withLifecycle(this.defaultLifecycle);
  private readonly fuelUsed2 = ConsumerSubject.create<number>(null, NaN).withLifecycle(this.defaultLifecycle);
  private readonly fuelTotal = ConsumerSubject.create<number>(null, NaN).withLifecycle(this.defaultLifecycle);
  private readonly fuelEndurance = ConsumerSubject.create<number>(null, NaN).withLifecycle(this.defaultLifecycle);
  private readonly fuelEconomy = ConsumerSubject.create<number>(null, NaN).withLifecycle(this.defaultLifecycle);

  private readonly fuelFlow1Display = MappedSubject.create(
    ([ff, units]) => {
      if (isNaN(ff) || ff == 0) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      return FuelManagement.FUEL_FORMATTER(UnitType.GPH_FUEL.convertTo(ff, this.getFuelFlowUnitType(units)));
    },
    this.fuelFlow1,
    this.fuelUnits,
  ).withLifecycle(this.defaultLifecycle);
  private readonly fuelFlow2Display = MappedSubject.create(
    ([ff, units]) => {
      if (isNaN(ff) || ff == 0) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      return FuelManagement.FUEL_FORMATTER(UnitType.GPH_FUEL.convertTo(ff, this.getFuelFlowUnitType(units)));
    },
    this.fuelFlow2,
    this.fuelUnits,
  ).withLifecycle(this.defaultLifecycle);
  private readonly fuelUsed1Display = MappedSubject.create(
    ([f, units]) => {
      if (isNaN(f)) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      return FuelManagement.FUEL_FORMATTER(UnitType.GALLON_FUEL.convertTo(f, this.getFuelUnitType(units)));
    },
    this.fuelUsed1,
    this.fuelUnits,
  ).withLifecycle(this.defaultLifecycle);
  private readonly fuelUsed2Display = MappedSubject.create(
    ([f, units]) => {
      if (isNaN(f)) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      return FuelManagement.FUEL_FORMATTER(UnitType.GALLON_FUEL.convertTo(f, this.getFuelUnitType(units)));
    },
    this.fuelUsed2,
    this.fuelUnits,
  ).withLifecycle(this.defaultLifecycle);
  private readonly fuelTotalDisplay = MappedSubject.create(
    ([f, units]) => {
      if (isNaN(f)) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      return FuelManagement.FUEL_FORMATTER(UnitType.GALLON_FUEL.convertTo(f, this.getFuelUnitType(units)));
    },
    this.fuelTotal,
    this.fuelUnits,
  ).withLifecycle(this.defaultLifecycle);
  private readonly fuelEconomyDisplay = MappedSubject.create(
    ([economyNMPG, fuelUnits, distanceUnits]) => {
      if (isNaN(economyNMPG) || economyNMPG <= 0) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      const distanceCoefficient = UnitType.NMILE.convertTo(1, this.getDistanceUnitType(distanceUnits));
      const fuelCoefficient = UnitType.GALLON_FUEL.convertTo(1, this.getFuelUnitType(fuelUnits));
      return FuelManagement.FUEL_FORMATTER((economyNMPG * distanceCoefficient) / fuelCoefficient);
    },
    this.fuelEconomy,
    this.fuelUnits,
    this.distanceUnits,
  ).withLifecycle(this.defaultLifecycle);

  private readonly fuelAddedInputValueGal = Subject.create(0);
  private readonly fuelTotalInputValueGal = Subject.create(0);

  private readonly fuelAddedInputDisplay = MappedSubject.create(
    ([f, units]) => {
      if (isNaN(f)) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      return FuelManagement.FUEL_FORMATTER(UnitType.GALLON_FUEL.convertTo(f, this.getFuelUnitType(units)));
    },
    this.fuelAddedInputValueGal,
    this.fuelUnits,
  ).withLifecycle(this.defaultLifecycle);
  private readonly fuelTotalInputDisplay = MappedSubject.create(
    ([f, units]) => {
      if (isNaN(f)) {
        return FuelManagement.FUEL_FORMATTER(NaN);
      }
      return FuelManagement.FUEL_FORMATTER(UnitType.GALLON_FUEL.convertTo(f, this.getFuelUnitType(units)));
    },
    this.fuelTotalInputValueGal,
    this.fuelUnits,
  ).withLifecycle(this.defaultLifecycle);

  private readonly fuelFlowUnitDisplay = this.fuelUnits.map((units) => {
    return this.getFuelFlowString(units);
  }).withLifecycle(this.defaultLifecycle);
  private readonly fuelUnitDisplay = this.fuelUnits.map((units) => {
    return FormatUtils.getFuelUnitSettingString(units);
  }).withLifecycle(this.defaultLifecycle);
  private readonly fuelEconomyUnitDisplay = MappedSubject.create(
    ([fuelUnits, distanceUnits]) => {
      return this.getFuelEconomyUnitString(fuelUnits, distanceUnits);
    },
    this.fuelUnits,
    this.distanceUnits,
  );

  private readonly internalCursorPosition = Subject.create(this.props.ifdOptions.fuelFlow?.hasTotalizer ? FuelManagementCursorItems.FuelAdded : undefined);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    if (this.props.ifdOptions.fuelFlow) {
      if (this.props.ifdOptions.fuelFlow.sensors.length > 1) {
        this.fuelFlow1.setConsumer(this.fuelSub.on('ifd_fuel_flow_gph_1'));
        this.fuelFlow2.setConsumer(this.fuelSub.on('ifd_fuel_flow_gph_2'));
        this.fuelUsed1.setConsumer(this.fuelSub.on('ifd_fuel_burned_gal_1'));
        this.fuelUsed2.setConsumer(this.fuelSub.on('ifd_fuel_burned_gal_2'));
      } else {
        this.fuelFlow1.setConsumer(this.fuelSub.on('ifd_fuel_flow_total_gph'));
        this.fuelUsed1.setConsumer(this.fuelSub.on('ifd_fuel_burned_total_gal'));
      }
      this.fuelTotal.setConsumer(this.fuelSub.on('ifd_fuel_remaining_gal'));
      this.fuelEndurance.setConsumer(this.fuelSub.on('ifd_fuel_endurance_hr'));
      this.fuelEconomy.setConsumer(this.fuelSub.on('ifd_fuel_economy_nmpg'));
    }
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const cursorPosition = this.internalCursorPosition.get();

    switch (event) {
      case IfdInteractionEvent.RightKnobOuterDec:
      case IfdInteractionEvent.RightKnobInnerDec:
        if (cursorPosition !== FuelManagementCursorItems.FuelAdded) {
          this.internalCursorPosition.set(FuelManagementCursorItems.FuelAdded);
        }
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
      case IfdInteractionEvent.RightKnobInnerInc:
        if (cursorPosition === undefined) {
          this.internalCursorPosition.set(FuelManagementCursorItems.FuelAdded);
        } else {
          this.internalCursorPosition.set(FuelManagementCursorItems.FuelTotal);
        }
        return true;
      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        if (cursorPosition === FuelManagementCursorItems.FuelAdded) {
          this.onFuelAddedPressed();
        } else if (cursorPosition === FuelManagementCursorItems.FuelTotal) {
          this.openFuelTotalKeyboard();
        }
        return true;
      default:
        return false;
    }
  }

  /**
   * Render the data rows depending on the fuel flow config
   * @returns the rendered data rows
   */
  private renderDataRows(): VNode[] {
    const rows: VNode[] = [];

    if (!this.props.ifdOptions.fuelFlow) {
      return [];
    }

    if (this.props.ifdOptions.fuelFlow.sensors.length > 1) {
      rows.push(
        <div class="fuel-data-row dual">
          <div class="fuel-data-row-label">Flow</div>
          <div class="fuel-data-row-value">{this.fuelFlow1Display}</div>
          <div class="fuel-data-row-value">{this.fuelFlow2Display}</div>
          <div class="fuel-data-row-unit">{this.fuelFlowUnitDisplay}</div>
        </div>,
      );
      rows.push(
        <div class="fuel-data-row dual">
          <div class="fuel-data-row-label">Used</div>
          <div class="fuel-data-row-value">{this.fuelUsed1Display}</div>
          <div class="fuel-data-row-value">{this.fuelUsed2Display}</div>
          <div class="fuel-data-row-unit">{this.fuelUnitDisplay}</div>
        </div>,
      );
    } else {
      rows.push(
        <div class="fuel-data-row single">
          <div class="fuel-data-row-label">Flow</div>
          <div class="fuel-data-row-value">{this.fuelFlow1Display}</div>
          <div class="fuel-data-row-unit">{this.fuelFlowUnitDisplay}</div>
        </div>,
      );
      rows.push(
        <div class="fuel-data-row single">
          <div class="fuel-data-row-label">Used</div>
          <div class="fuel-data-row-value">{this.fuelUsed1Display}</div>
          <div class="fuel-data-row-unit">{this.fuelUnitDisplay}</div>
        </div>,
      );
    }

    rows.push(
      <div class="fuel-data-row single">
        <div class="fuel-data-row-label">Rmng</div>
        <div class="fuel-data-row-value">{this.fuelTotalDisplay}</div>
        <div class="fuel-data-row-unit">{this.fuelUnitDisplay}</div>
      </div>,
    );

    rows.push(
      <div class="fuel-data-row single">
        <div class="fuel-data-row-label">Time</div>
        <div class="fuel-data-row-value">{this.fuelEndurance.map(FuelManagement.DURATION_FORMATTER).withLifecycle(this.defaultLifecycle)}</div>
        <div class="fuel-data-row-unit">H:M</div>
      </div>,
    );

    rows.push(
      <div class="fuel-data-row single">
        <div class="fuel-data-row-label">Econ</div>
        <div class="fuel-data-row-value">{this.fuelEconomyDisplay}</div>
        <div class="fuel-data-row-unit">{this.fuelEconomyUnitDisplay}</div>
      </div>,
    );

    return rows;
  }

  /**
   * Handles the fuel added input value change from the keyboard.
   * @param value The new value.
   */
  private onFuelAdded(value: string): void {
    const parsed = Number.parseFloat(value);
    if (isNaN(parsed) || parsed < 0) {
      return;
    }
    const gallons = this.getFuelUnitType(this.fuelUnits.get()).convertTo(parsed, UnitType.GALLON_FUEL);

    this.fuelAddedInputValueGal.set(gallons);

    const currentTotalGal = this.fuelTotal.get();
    const newTotal = (isNaN(currentTotalGal) ? 0 : currentTotalGal) + gallons;

    this.fuelTotalInputValueGal.set(newTotal);

    this.props.bus.getPublisher<IfdFuelComputerControlEvents>().pub('ifd_fuel_set_total', newTotal, true);
  }

  /**
   * Handles the fuel total input value change from the keyboard.
   * @param value The new value.
   */
  private onTotalFuelChanged(value: string): void {
    const parsed = Number.parseFloat(value);
    if (isNaN(parsed)) {
      return;
    }
    const newGallons = this.getFuelUnitType(this.fuelUnits.get()).convertTo(parsed, UnitType.GALLON_FUEL);

    const currentTotalGal = this.fuelTotal.get();

    this.fuelTotalInputValueGal.set(newGallons);

    const fuelAdded = Math.max(0, newGallons - (isNaN(currentTotalGal) ? 0 : currentTotalGal));

    this.fuelAddedInputValueGal.set(fuelAdded);

    this.props.bus.getPublisher<IfdFuelComputerControlEvents>().pub('ifd_fuel_set_total', newGallons, true);
  }

  /**
   * Handles the fuel added button press.
   */
  private onFuelAddedPressed(): void {
    if (this.props.ifdOptions.fuelFlow?.hasTotalizer) {
      return;
    }
    if (this.internalCursorPosition.get() === FuelManagementCursorItems.FuelAdded) {
      this.openFuelKeyboard(this.fuelAddedInputDisplay.get(), (v) => this.onFuelAdded(v));
    } else {
      this.internalCursorPosition.set(FuelManagementCursorItems.FuelAdded);
    }
  }

  /**
   * Handles the fuel total button press.
   */
  private openFuelTotalKeyboard(): void {
    if (this.props.ifdOptions.fuelFlow?.hasTotalizer) {
      return;
    }
    if (this.internalCursorPosition.get() === FuelManagementCursorItems.FuelTotal) {
      this.openFuelKeyboard(this.fuelTotalInputDisplay.get(), (v) => this.onTotalFuelChanged(v));
    } else {
      this.internalCursorPosition.set(FuelManagementCursorItems.FuelTotal);
    }
  }

  /**
   * Opens a keyboard for editing the given value.
   * @param initialValue The initial value to display in the keyboard.
   * @param onEnter The callback to invoke when the keyboard ENTR/Enter key is pressed.
   */
  private openFuelKeyboard(
    initialValue: string,
    onEnter: (value: string) => void,
  ): void {
    const publisher = this.props.bus.getPublisher<IfdKeyboardControlEvents>();

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: KeyboardInputType.FreeText,
      disableModeSwitch: true,
      disableFacilitySearch: true,
      initialShowNumpad: true,
      initialValue: initialValue,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      maxLength: 5,
      allowedCharacters: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      onEnter: (value) => onEnter(value),
      rowRef: null,
    };

    publisher.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /**
   * Gets the fuel unit type based on the selected units setting.
   * @param unit The fuel units setting.
   * @returns The fuel unit type.
   */
  private getFuelUnitType(unit: UnitsFuelSettingMode): SimpleUnit<UnitFamily.Weight> {
    switch (unit) {
      case UnitsFuelSettingMode.Liters:
        return UnitType.LITER_FUEL;
      case UnitsFuelSettingMode.Pounds:
        return UnitType.POUND;
      case UnitsFuelSettingMode.Kilograms:
        return UnitType.KILOGRAM;
      case UnitsFuelSettingMode.ImpGal:
        return UnitType.IMP_GALLON_FUEL;
      case UnitsFuelSettingMode.Gallons:
      default:
        return UnitType.GALLON_FUEL;
    }
  }

  /**
   * Gets the fuel flow unit type based on the selected units setting.
   * @param unit The fuel units setting.
   * @returns The fuel flow unit type.
   */
  private getFuelFlowUnitType(unit: UnitsFuelSettingMode): CompoundUnit<UnitFamily.WeightFlux> {
    switch (unit) {
      case UnitsFuelSettingMode.Liters:
        return UnitType.LPH_FUEL;
      case UnitsFuelSettingMode.Pounds:
        return UnitType.PPH;
      case UnitsFuelSettingMode.Kilograms:
        return UnitType.KGH;
      case UnitsFuelSettingMode.ImpGal:
        return UnitType.IGPH_FUEL;
      case UnitsFuelSettingMode.Gallons:
      default:
        return UnitType.GPH_FUEL;
    }
  }

  /**
   * Gets the distance unit type based on the selected units setting.
   * @param unit The distance units setting.
   * @returns The distance unit type.
   */
  private getDistanceUnitType(unit: UnitsDistanceSettingMode): SimpleUnit<UnitFamily.Distance> {
    switch (unit) {
      case UnitsDistanceSettingMode.Metric:
        return UnitType.KILOMETER;
      case UnitsDistanceSettingMode.Statute:
        return UnitType.MILE;
      case UnitsDistanceSettingMode.Nautical:
      default:
        return UnitType.NMILE;
    }
  }

  /**
   * Gets the fuel flow unit string.
   * @param unit The fuel unit setting.
   * @returns The fuel flow string.
   */
  private getFuelFlowString(unit: UnitsFuelSettingMode): string {
    return `${FormatUtils.getFuelUnitSettingString(unit)}/Hr`;
  }

  /**
   * Gets the fuel economy unit string based on the selected units setting.
   * @param fuelUnit The fuel unit setting
   * @param distanceUnit The distance unit setting
   * @returns The fuel economy unit string.
   */
  private getFuelEconomyUnitString(fuelUnit: UnitsFuelSettingMode, distanceUnit: UnitsDistanceSettingMode): string {
    let distanceUnitString: string;
    switch (distanceUnit) {
      case UnitsDistanceSettingMode.Metric:
        distanceUnitString = 'KM';
        break;
      case UnitsDistanceSettingMode.Statute:
        distanceUnitString = 'Mi';
        break;
      case UnitsDistanceSettingMode.Nautical:
      default:
        distanceUnitString = 'NM';
        break;
    }
    return `${distanceUnitString}/${FormatUtils.getFuelUnitSettingString(fuelUnit)}`;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={FSComponent.mergeCssClasses('sys-tab', 'sys-tab-fuel', this.props.class)}>
        <div class="fuel-data-container">
          <div class="fuel-data-title">Fuel</div>
          {this.renderDataRows()}
        </div>
        {!this.props.ifdOptions.fuelFlow?.hasTotalizer && (
          <div class="fuel-controls-container">
            <div class="fuel-control">
              <div class="fuel-control-label small">{'Fuel\nAdded'}</div>
              <TouchButton
                class="fuel-control-button"
                onPressed={this.onFuelAddedPressed.bind(this)}
                isHighlighted={this.internalCursorPosition.map((v) => v === FuelManagementCursorItems.FuelAdded).withLifecycle(this.defaultLifecycle)}
              >
                <div class="fuel-control-value">
                  {this.fuelAddedInputDisplay}
                </div>
                <div class="fuel-control-unit">{this.fuelUnitDisplay}</div>
              </TouchButton>
            </div>
            <div class="fuel-control">
              <div class="fuel-control-label">Total</div>
              <TouchButton
                class="fuel-control-button"
                onPressed={this.openFuelTotalKeyboard.bind(this)}
                isHighlighted={this.internalCursorPosition.map((v) => v === FuelManagementCursorItems.FuelTotal).withLifecycle(this.defaultLifecycle)}
              >
                <div class="fuel-control-value">
                  {this.fuelTotalInputDisplay}
                </div>
                <div class="fuel-control-unit">{this.fuelUnitDisplay}</div>
              </TouchButton>
            </div>
          </div>
        )}
      </div>
    );
  }
}

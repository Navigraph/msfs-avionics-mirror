import {
  ComponentProps,
  EventBus,
  FSComponent,
  LifecycleComponent,
  Subject,
  Unit,
  UnitFamily,
  UnitType,
  VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { UnitsUserSettings } from '../../../../../Settings/UnitsUserSettings';

/**
 * Props for Altitude Field
 */
interface AltitudeProps extends ComponentProps {
  /** Event bus for the component */
  bus: EventBus;
}

/**
 * Integer-only temperature field.
 */
export class TemperatureField extends LifecycleComponent<AltitudeProps> {
  /** Min temperature in °F (base unit). */
  private static readonly MIN_F = 0;

  /** Max temperature in °F (base unit). */
  private static readonly MAX_F = 140;

  /** Min temperature in °C. */
  private static readonly MIN_C = -15;

  /** Max temperature in °C. */
  private static readonly MAX_C = 55;

  /** Current min value in the active temperature unit (rounded integer). */
  private minValue = TemperatureField.MIN_F;

  /** Current max value in the active temperature unit (rounded integer). */
  private maxValue = TemperatureField.MAX_F;

  private readonly tempUnit = UnitsUserSettings.getManager(this.props.bus).temperatureUnits;

  private readonly tempDisplayUnit = this.tempUnit.map(
    (tempUnit) => {
      switch (tempUnit) {
        case UnitType.FAHRENHEIT:
          return '°F';
        default:
          return '°C';
      }
    }
  ).withLifecycle(this.defaultLifecycle);

  /** Holds the numeric value (integer in the currently displayed unit). */
  public readonly temperatureValue = Subject.create<number>(0);

  private readonly keyboardState = VirtualKeyboardState.getInstance();

  private touched = false;

  /**
   * Updates min and max temperature values to match the current temperature unit.
   * Base limits are defined in °F.
   * @param unit The active temperature unit.
   */
  private updateMinMaxForUnit(unit: Unit<UnitFamily.Temperature>): void {
    if (unit === UnitType.FAHRENHEIT) {
      this.minValue = TemperatureField.MIN_F;
      this.maxValue = TemperatureField.MAX_F;
    } else {
      // Treat any non-°F unit as °C for range purposes.
      this.minValue = TemperatureField.MIN_C;
      this.maxValue = TemperatureField.MAX_C;
    }

    // Also sanitize the current value after unit change.
    const current = this.temperatureValue.get();
    this.temperatureValue.set(this.sanitizeValue(current));
  }

  /**
   * Rounds and clamps a value to the current integer bounds.
   * This removes floating point artifacts like 19.999999999.
   * @param value The value to sanitize.
   * @returns A rounded and clamped integer.
   */
  private sanitizeValue(value: number): number {
    let rounded = Math.round(value);

    if (rounded < this.minValue) {
      rounded = this.minValue;
    }

    if (rounded > this.maxValue) {
      rounded = this.maxValue;
    }

    return rounded;
  }

  /**
   * Activates editing state.
   */
  public activateEditing = (): void => {
    this.keyboardState.setEditingActive(true);
    this.touched = false;
  };

  /**
   * Appends a digit to the current absolute value, preserving sign, and clamps to bounds.
   * @param value The pressed key, expected '0'..'9'.
   */
  public onKeyPressed(value: string): void {
    const digit = value.charCodeAt(0) - 48;

    // Ignore anything that isn't a digit.
    if (digit < 0 || digit > 9) {
      return;
    }

    const current = this.temperatureValue.get();
    const sign = current < 0 ? -1 : 1;
    let nextAbs: number;

    if (!this.touched) {
      this.touched = true;
      nextAbs = digit;
    } else {
      const absNow = Math.abs(current);

      // Cap abs at 3 digits to avoid runaway values (e.g., 999).
      nextAbs = Math.min(999, absNow * 10 + digit);
    }

    const nextRaw = sign * nextAbs;
    const next = this.sanitizeValue(nextRaw);

    this.temperatureValue.set(next);
  }

  /**
   * Optional handler for a dedicated "minus" key to toggle sign.
   * Clamps after toggling.
   */
  public onMinusPressed(): void {
    const current = this.temperatureValue.get();
    const toggledRaw = -current;
    const toggled = this.sanitizeValue(toggledRaw);

    this.temperatureValue.set(toggled);
    this.touched = true;
  }

  /**
   * Handle backspace: remove last digit of the absolute value, preserving sign.
   * If result is 0, clears touched flag.
   */
  public onBackspacePressed(): void {
    const current = this.temperatureValue.get();
    const sign = current < 0 ? -1 : 1;
    const absNow = Math.abs(current);
    let absNext = Math.trunc(absNow / 10);

    if (absNext < 0) {
      absNext = 0;
    }

    const nextRaw = sign * absNext;
    const next = this.sanitizeValue(nextRaw);

    this.temperatureValue.set(next);

    if (absNext === 0) {
      this.touched = false;
    }
  }

  /**
   * Increments the current value by the specified amount (integer), clamped to bounds.
   * @param increment The increment step (can be negative).
   */
  private incrementValue(increment: number): void {
    const current = this.temperatureValue.get();
    const nextRaw = current + increment;
    const next = this.sanitizeValue(nextRaw);

    this.temperatureValue.set(next);
    this.touched = true;
  }

  /** @inheritDoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (event === IfdInteractionEvent.RightKnobInnerInc) {
      this.incrementValue(1);
      return true;
    }

    if (event === IfdInteractionEvent.RightKnobInnerDec) {
      this.incrementValue(-1);
      return true;
    }

    if (event === IfdInteractionEvent.RightKnobOuterInc) {
      this.incrementValue(10);
      return true;
    }

    if (event === IfdInteractionEvent.RightKnobOuterDec) {
      this.incrementValue(-10);
      return true;
    }

    return false;
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // Keep min/max aligned with the selected temperature unit.
    this.tempUnit
      .sub((unit) => this.updateMinMaxForUnit(unit), true)
      .withLifecycle(this.defaultLifecycle);
  }

  /**
   * Handle enter press.
   * @returns string
   */
  public onEnterPressed(): string {
    return this.temperatureValue.get().toString();
  }

  /**
   * Gets the current value.
   * @returns string - the current value
   */
  protected getValue(): string {
    return this.getDisplayValue();
  }

  /**
   * Get current display value.
   * @returns string
   */
  private getDisplayValue(): string {
    return this.temperatureValue.get().toString();
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='duration-field'>
        <div class="vkb-input vkb-input-flex">
          {this.temperatureValue.map(() => this.getDisplayValue())}
          <div class='numberunit-unit-small'>{this.tempDisplayUnit}</div>
        </div>
      </div>
    );
  }
}

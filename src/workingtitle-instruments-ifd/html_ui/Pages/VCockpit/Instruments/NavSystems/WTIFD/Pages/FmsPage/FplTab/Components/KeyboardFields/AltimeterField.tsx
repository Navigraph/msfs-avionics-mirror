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
 * A field which allows the user to enter altimeter values.
 *
 * Format enforced: **xx.xx** (two decimal places).
 */
export class AltimeterField extends LifecycleComponent<AltitudeProps> {
  /** Min baro value in inHg (base unit). */
  private static readonly MIN_INHG = 27;

  /** Max baro value in inHg (base unit). */
  private static readonly MAX_INHG = 32;

  /** Current min value in the active baro unit. */
  private minValue = AltimeterField.MIN_INHG;

  /** Current max value in the active baro unit. */
  private maxValue = AltimeterField.MAX_INHG;

  public readonly value = Subject.create<string>('0.');

  private readonly keyboardState = VirtualKeyboardState.getInstance();

  private touched = false;

  private inDecimalMode = false;

  private readonly baroPressureUnit = UnitsUserSettings.getManager(this.props.bus).pressureUnits;

  private readonly baroPressureDisplayUnit = this.baroPressureUnit.map(
    (baroPressureUnit) => {
      switch (baroPressureUnit) {
        case UnitType.IN_HG:
          return 'inHg';
        case UnitType.HPA:
          return 'hPa';
        default:
          // mb == hPa numerically, so we treat it as such
          return 'mb';
      }
    }
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Updates min and max baro values to match the current baro unit.
   * Base limits are defined in inHg.
   * @param unit The active barometric pressure unit.
   */
  private updateMinMaxForUnit(unit: Unit<UnitFamily.Pressure>): void {
    if (unit === UnitType.IN_HG) {
      this.minValue = AltimeterField.MIN_INHG;
      this.maxValue = AltimeterField.MAX_INHG;
    } else {
      // Treat any non-inHg unit as hPa/mb for range purposes.
      const minHpa = UnitType.IN_HG.convertTo(AltimeterField.MIN_INHG, UnitType.HPA);
      const maxHpa = UnitType.IN_HG.convertTo(AltimeterField.MAX_INHG, UnitType.HPA);

      this.minValue = minHpa;
      this.maxValue = maxHpa;
    }
  }

  /**
   * Activates editing mode for this field.
   * Initializes keyboard state and resets decimal mode if needed.
   */
  public activateEditing(): void {
    this.keyboardState.setEditingActive(true);
    this.touched = false;
    this.inDecimalMode = false;

    const current = this.value.get();
    if (!current.includes('.')) {
      this.value.set('0.');
    }
  }

  /**
   * Handles numeric or decimal key presses from the virtual keyboard.
   * @param value - The value of the key pressed (e.g., `"1"`, `"2"`, or `"."`).
   */
  public onKeyPressed(value: string): void {
    if (value === '.') {
      const currentValue = this.value.get();
      if (!currentValue.includes('.')) {
        this.value.set(currentValue + '.');
      }
      this.inDecimalMode = true;
      this.touched = true;
      return;
    }

    const digit = value.replace(/\D/g, '');
    if (digit.length !== 1) {
      return;
    }

    let current = this.value.get();
    if (!current.includes('.')) {
      current = current + '.';
    }

    const [wholeRaw, decRaw] = current.split('.');
    const whole = wholeRaw ?? '';
    const dec = decRaw ?? '';

    if (!this.touched) {
      this.touched = true;
      this.inDecimalMode = false;
      const candidateWhole = digit;
      // Only check max while typing; allow values below min to build the number.
      if (this.isWithinRange(candidateWhole + '.00')) {
        this.value.set(candidateWhole + '.');
      }
      return;
    }

    if (!this.inDecimalMode && dec.length === 0) {
      if (whole.length < 2) {
        const newWhole = whole + digit;
        const candidate = newWhole + '.00';
        if (this.isWithinRange(candidate)) {
          this.value.set(newWhole + '.');
        }
      } else {
        this.inDecimalMode = true;
        this.appendDecimalDigit(whole, dec, digit);
      }
    } else {
      this.appendDecimalDigit(whole, dec, digit);
    }
  }

  /**
   * Appends a decimal digit to the current input.
   * @param whole - The whole number portion of the input.
   * @param dec - The decimal portion of the input.
   * @param digit - The new digit to append.
   */
  private appendDecimalDigit(whole: string, dec: string, digit: string): void {
    if (dec.length >= 2) {
      return;
    }

    const newDec = dec + digit;
    const candidate = `${whole}.${newDec}${'0'.repeat(Math.max(0, 2 - newDec.length))}`;

    if (this.isWithinRange(candidate)) {
      this.value.set(`${whole}.${newDec}`);
      this.inDecimalMode = true;
    }
  }

  /**
   * Checks whether a candidate value is within the allowed range.
   * While typing, we only enforce the upper bound so that the user can
   * build up numbers that eventually end up above minValue.
   *
   * @param candidateDisplay - The candidate value string (e.g., `"30.12"`).
   * @returns `true` if the value is within range, otherwise `false`.
   */
  private isWithinRange(candidateDisplay: string): boolean {
    const val = parseFloat(candidateDisplay);

    if (isNaN(val)) {
      return false;
    }

    // Do NOT check min here – otherwise the first digit can never pass when min > 9.
    return val <= this.maxValue;
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // Keep min/max aligned with the selected baro unit.
    this.baroPressureUnit
      .sub((unit) => this.updateMinMaxForUnit(unit), true)
      .withLifecycle(this.defaultLifecycle);
  }

  /**
   * Handles a backspace press, deleting digits appropriately.
   */
  public onBackspacePressed(): void {
    let current = this.value.get();

    if (!current.includes('.')) {
      current = current + '.';
    }

    const [wholePart, decPartRaw] = current.split('.');
    const decPart = decPartRaw ?? '';

    if (decPart.length > 0) {
      const newDec = decPart.slice(0, -1);
      this.value.set(`${wholePart}.${newDec}`);
      this.inDecimalMode = newDec.length > 0;
      return;
    }

    if (wholePart.length > 1) {
      const newWhole = wholePart.slice(0, -1);
      this.value.set(`${newWhole}.`);
      this.inDecimalMode = false;
    } else {
      this.value.set('0.');
      this.touched = false;
      this.inDecimalMode = false;
    }
  }

  /**
   * Increments or decrements the current altimeter value by a specified amount.
   * @param increment - The amount to adjust the value by (can be negative).
   */
  private incrementValue(increment: number): void {
    this.touched = false;

    const currentStr = this.getDisplayValue();
    const currentValue = parseFloat(currentStr);

    if (isNaN(currentValue)) {
      return;
    }

    const newValue = Math.max(
      this.minValue,
      Math.min(currentValue + increment, this.maxValue)
    );

    this.value.set(newValue.toFixed(2));
    this.inDecimalMode = false;
  }

  /**
   * Handles interaction events from knobs (increments/decrements).
   * @param event - The triggered interaction event.
   * @returns `true` if the event was handled, otherwise `false`.
   */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const incrementSmall = this.baroPressureUnit.get() === UnitType.IN_HG;

    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
        this.incrementValue(incrementSmall ? 0.1 : 10);
        return true;

      case IfdInteractionEvent.RightKnobInnerDec:
        this.incrementValue(incrementSmall ? -0.1 : -10);
        return true;

      case IfdInteractionEvent.RightKnobOuterInc:
        this.incrementValue(incrementSmall ? 0.01 : 1);
        return true;

      case IfdInteractionEvent.RightKnobOuterDec:
        this.incrementValue(incrementSmall ? -0.01 : -1);
        return true;

      default:
        return false;
    }
  }

  /**
   * Handles the Enter key press, confirming the current value.
   * @returns The confirmed altimeter value in `xx.xx` format.
   */
  public onEnterPressed(): string {
    // If you want to enforce min here as well, you can clamp:
    const parsed = parseFloat(this.getDisplayValue());

    if (!isNaN(parsed)) {
      const clamped = Math.max(
        this.minValue,
        Math.min(parsed, this.maxValue)
      );
      this.value.set(clamped.toFixed(2));
    }

    return this.getDisplayValue();
  }

  /**
   * Gets the current numeric string value.
   * @returns The current field value formatted as `xx.xx`.
   */
  protected getValue(): string {
    return this.getDisplayValue();
  }

  /**
   * Retrieves the display-friendly current value with enforced two-decimal format.
   * @returns The current value formatted as `xx.xx`.
   */
  private getDisplayValue(): string {
    let currentValue = this.value.get() || '0.';

    if (!currentValue.includes('.')) {
      currentValue = currentValue + '.';
    }

    const [whole, decRaw = ''] = currentValue.split('.');

    if (decRaw.length === 0) {
      return `${whole}.00`;
    }

    if (decRaw.length === 1) {
      return `${whole}.${decRaw}0`;
    }

    if (decRaw.length >= 2) {
      return `${whole}.${decRaw.slice(0, 2)}`;
    }

    return `${whole}.00`;
  }

  /**
   * Renders the field display with the current value and units.
   * @returns The rendered JSX Virtual DOM node.
   */
  public render(): VNode {
    return (
      <div class='duration-field'>
        <div class="vkb-input vkb-input-flex">
          {this.value.map(() => this.getDisplayValue())}
          <div class='numberunit-unit-small'>{this.baroPressureDisplayUnit}</div>
        </div>
      </div>
    );
  }
}

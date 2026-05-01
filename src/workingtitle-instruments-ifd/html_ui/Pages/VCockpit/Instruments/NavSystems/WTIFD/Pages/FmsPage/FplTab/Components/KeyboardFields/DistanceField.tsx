import { FSComponent, Subject, Unit, UnitFamily, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { NumberFieldInput } from './AbstractNumberField';

/**
 * A request input for {@link DistanceField}.
 */
export interface DistanceInput extends NumberFieldInput {
  /**
   * The initial distance unit. If not defined, the initial unit will default to a value based on the units mode.
   */
  initialUnit?: Unit<UnitFamily.Distance>;

  /** The minimum valid numeric value allowed by the field's input. */
  minimumValue: number;

  /** The maximum valid numeric value allowed by the field's input. */
  maximumValue: number;

  /** The initial value */
  initialValue: number;
}


/**
 * A field which allows the user to enter distance in NM
 */
export class DistanceField {
  private minValue = 0;
  private maxValue = 20;
  public readonly distanceValue = Subject.create<string>('');
  private keyboardState = VirtualKeyboardState.getInstance();
  private touched = false;
  private inDecimalMode = false;

  public activateEditing = (): void => {
    this.keyboardState.setEditingActive(true);
    this.touched = false;
    this.inDecimalMode = false;
  };

  /**
   * Responds to when one of keyboard number buttons is pressed.
   * @param value The value of the button that was pressed.
   */
  public onKeyPressed(value: string): void {
    if (value === '.') {
      this.inDecimalMode = true;
      return;
    }

    const currentValue = this.distanceValue.get();
    const decimalIndex = currentValue.indexOf('.');
    const wholePart = currentValue.substring(0, decimalIndex);
    const decimalPart = currentValue.substring(decimalIndex + 1);

    if (!this.touched) {
      this.touched = true;
      this.inDecimalMode = false;
      this.distanceValue.set(value + '.');
      return;
    }

    if (!this.inDecimalMode && decimalPart.length === 0) {
      if (wholePart.length < 2) {
        const newWhole = wholePart + value;
        const newValue = parseFloat(newWhole + '.0');

        if (newValue <= this.maxValue) {
          this.distanceValue.set(newWhole + '.');
        }
      }
    } else if (this.inDecimalMode && decimalPart.length === 0) {
      this.distanceValue.set(wholePart + '.' + value);
    }
  }

  /** @inheritdoc */
  public onRequest(input: DistanceInput): void {
    this.minValue = input.minimumValue;
    this.maxValue = input.maximumValue;

    const initialValue = Math.max(
      this.minValue,
      Math.min(input.initialValue, this.maxValue)
    );
    const valueStr = initialValue.toFixed(1);
    const decimalPart = valueStr.substring(valueStr.indexOf('.') + 1);
    if (decimalPart === '0') {
      this.distanceValue.set(Math.trunc(initialValue) + '.');
    } else {
      this.distanceValue.set(valueStr);
    }
    this.touched = false;
    this.inDecimalMode = false;
  }

  /**
   * Handle backspace
   */
  public onBackspacePressed(): void {
    const current = this.distanceValue.get();

    if (current === '0.') {
      this.touched = false;
      this.inDecimalMode = false;
      return;
    }

    const decimalIndex = current.indexOf('.');
    const wholePart = current.substring(0, decimalIndex);
    const decimalPart = current.substring(decimalIndex + 1);

    if (decimalPart.length > 0) {
      this.distanceValue.set(wholePart + '.');
    } else {
      this.inDecimalMode = false;
      if (wholePart.length > 1) {
        const newWholePart = wholePart.slice(0, -1);
        this.distanceValue.set(newWholePart + '.');
      } else {
        this.distanceValue.set('0.');
        this.touched = false;
        this.inDecimalMode = false;
      }
    }
  }

  /**
   * Increments the current value by the specified amount
   * @param increment The increment (can be negative for decrement)
   */
  private incrementValue(increment: number): void {
    this.touched = false;
    const currentStr = this.distanceValue.get();
    const currentValue = currentStr === '' ? 0 : parseFloat(currentStr);

    if (isNaN(currentValue)) {
      return;
    }

    const newValue = Math.max(
      this.minValue,
      Math.min(currentValue + increment, this.maxValue)
    );
    this.distanceValue.set(newValue.toFixed(1));
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
        this.incrementValue(1);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        this.incrementValue(-1);
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        this.incrementValue(0.1);
        return true;
      case IfdInteractionEvent.RightKnobOuterDec:
        this.incrementValue(-0.1);
        return true;
      default:
        return false;
    }
  }

  /**
   * Handle enter press
   * @returns string
   */
  public onEnterPressed(): string {
    const value = this.distanceValue.get();
    return value;
  }

  /**
   * Gets the current value
   * @returns string - the current value
   */
  protected getValue(): string {
    return this.getDisplayValue();
  }

  /**
   * Get current display value
   * @returns string
   */
  private getDisplayValue(): string {
    const value = this.distanceValue.get() || '0.0';
    if (value.endsWith('.')) {
      return value + '0';
    }
    return value;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class='duration-field'>
        <div class="vkb-input vkb-input-flex">
          {this.distanceValue.map(() => this.getDisplayValue())}
          <div class='numberunit-unit-small'>NM</div>
        </div>
      </div>
    );
  }
}

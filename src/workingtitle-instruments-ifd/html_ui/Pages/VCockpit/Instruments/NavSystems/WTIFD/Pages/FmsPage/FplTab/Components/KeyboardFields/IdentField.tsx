import { ComponentProps, EventBus, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { AbstractNumberField, NumberFieldInput, NumberInputDefinition } from './AbstractNumberField';

/**
 * A request input for {@link IdentField}.
 */
export interface IdentInput extends NumberFieldInput {
  /** The fields operating unit. */
  unitsMode: 'number';

  /** The minimum valid numeric value allowed by the field's input. */
  minimumValue: number;

  /** The maximum valid numeric value allowed by the field's input. */
  maximumValue: number;

  /** The initial value */
  initialValue: number;

  /** Callback for when enter is pressed */
  onEnterCallback?: (value: string) => void;
}

/**
 *
 */
interface IdentProps extends ComponentProps {
  /** Event bus for the component */
  bus: EventBus;
}

/**
 * A field which allows the user to enter a transponder Ident (0000-7777)
 */
export class IdentField extends AbstractNumberField<IdentInput, NumberInputDefinition, IdentProps> {
  private minValue = 0;
  private maxValue = 7777;
  private onEnterCallback: (value: string) => void = (): void => { };
  public readonly identValue = Subject.create<string>('');
  private keyboardState = VirtualKeyboardState.getInstance();

  public activateEditing = (): void => {
    this.keyboardState.setEditingActive(true);
    this.identValue.set('');
  };

  /**
   * Responds to when one of keyboard buttons is pressed.
   * @param value The value of the button that was pressed.
   */
  public onKeyPressed(value: string): void {
    const digit = parseInt(value);
    // Ensure value is 0-7 for octal
    if (digit < 0 || digit > 7) {
      return;
    }

    const currentValue = this.identValue.get();

    // Don't accept input if already at 4 digits
    if (currentValue.length >= 4) {
      return;
    }

    const newValue = currentValue + value;
    this.identValue.set(newValue);

    // Auto-submit when 4 digits entered
    if (newValue.length === 4) {
      this.onEnterPressed();
    }
  }

  /** @inheritdoc */
  public onRequest(input: IdentInput): void {
    this.minValue = input.minimumValue;
    this.maxValue = input.maximumValue;
    if (input.onEnterCallback) {
      this.onEnterCallback = input.onEnterCallback;
    }

    this.resetActiveInput(input.unitsMode);
    this.identValue.set('');
  }

  /** @inheritdoc */
  protected getInvalidValueMessage(): string | VNode {
    return `Invalid Entry\nValue must be between\n${this.minValue} and ${this.maxValue}`;
  }

  /** @inheritdoc */
  protected isValueValid(value: number): boolean {
    return value >= this.minValue && value <= this.maxValue;
  }

  /** @inheritdoc */
  protected getRootCssClassName(): string {
    return 'ident-field';
  }

  /**
   * Handle backspace
   */
  public onBackspacePressed(): void {
    const current = this.identValue.get();
    this.identValue.set(current.slice(0, -1));
  }

  /** @inheritdoc */
  public onInteractionEvent(): boolean {
    return false;
  }

  /** @inheritdoc */
  public onEnterPressed(): string {
    const value = this.identValue.get();
    if (value.length > 0) {
      const numValue = parseInt(value, 10);
      if (this.isValueValid(numValue)) {
        this.onEnterCallback(value);
      }
    }
    return value;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={this.getRootCssClassName()}>
        <div class="vkb-input">
          {this.identValue.map(value => value.split('').join(''))}
        </div>
      </div>
    );
  }
}

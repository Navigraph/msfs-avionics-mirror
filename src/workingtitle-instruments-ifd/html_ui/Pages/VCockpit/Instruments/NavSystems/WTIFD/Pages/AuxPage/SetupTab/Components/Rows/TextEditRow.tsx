import { EventBus, FSComponent, MappedSubject, MutableSubscribable, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { IfdKeyboardControlEvents, KeyboardInputType, VirtualKeyboardType } from '../../../../../Keyboard/KeyboardTypes';
import { SetupRowBase, SetupRowBaseProps } from './SetupRowBase';

/** Props for all text edit rows. */
interface BaseTextEditRowProps extends SetupRowBaseProps {
  /** The event bus */
  readonly bus: EventBus;
  /** The instrument index */
  readonly instrumentIndex: number;

  /** The type of keyboard to display */
  keyboardType?: VirtualKeyboardType;
  /** Keyboard Input type */
  keyboardInputType: KeyboardInputType;
  /** Whether to disable the keyboard mode switch (e.g. for numpad-only) */
  keyboardDisableModeSwitch?: boolean;
  /** Whether to initially show numpad (true) or alpha keyboard (false) */
  keyboardInitialShowNumpad?: boolean;
  /** The unit to show after this value. */
  readonly prefixUnit?: string;
  /** The unit to show after this value. */
  readonly postfixUnit?: string | Subscribable<string>;
  /** Maximum length of the text */
  readonly maxLength?: number;
  /** Custom text color (when not selected) */
  readonly color?: string | Subscribable<string>;
  /** Callback when the CLR key is pressed while the field is selected but not in editing mode. */
  readonly onValueCleared?: () => void;
}

/** Props for text row components with non-string values. */
interface TypedTextEditRowProps<T> extends BaseTextEditRowProps {
  /** The current value. */
  readonly value: Subscribable<T> | MutableSubscribable<T>;
  /** Function to format the display value. */
  readonly format: (value: T) => string;
  /** Function to parse the input value. */
  readonly parse: (input: string) => T;
  /** Callback when the value is changed. */
  readonly onValueConfirmed?: (value: T) => void;
}

/** Props for text row components with a string value. */
interface StringTextEditRowProps<T extends string> extends BaseTextEditRowProps {
  /** The current text value. */
  readonly value: Subscribable<T> | MutableSubscribable<T>;
  /** Optional function to format the display value. */
  readonly format?: (value: T) => string;
  /** Optional function to parse the input value. */
  readonly parse?: (input: string) => T;
  /** Callback when the text value is changed. */
  readonly onValueConfirmed?: (value: T) => void;
}

/**
 * Props for the TextRow component.
 */
export type TextEditRowProps<T> = T extends string ? StringTextEditRowProps<T> : TypedTextEditRowProps<T>;

/**
 * A setup row for text input (opens alpha keyboard).
 */
export class TextEditRow<T> extends SetupRowBase<TextEditRowProps<T>> {
  private static readonly NON_SPACED_UNITS = ['°', 'FL'];

  private readonly isEditing = Subject.create<boolean>(false);
  private readonly isFocusedNotEditing = MappedSubject.create(
    ([isSelected, isEditing]) => isSelected && !isEditing,
    this.isSelected,
    this.isEditing
  );

  private readonly pendingValue = Subject.create(this.props.value.get());
  private readonly valuePipe = this.props.value.pipe(this.pendingValue).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isSelected.sub((isSelected) => !isSelected && this.isEditing.set(false)).withLifecycle(this.defaultLifecycle);

    this.isEditing.sub((isEditing) => {
      if (isEditing) {
        this.valuePipe.pause();
      } else {
        this.valuePipe.resume(true);
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Opens an alpha keyboard for text input.
   */
  private openKeyboard(): void {
    this.isEditing.set(true);

    const currentValue = this.props.value.get();

    // Publish an event to open the keyboard
    this.props.bus.getPublisher<IfdKeyboardControlEvents>().pub('text_edit_row_keyboard_open', {
      initialValue: String(currentValue),
      onValueChanged: this.handleKeyboardInput.bind(this),
      onEnter: this.handleKeyboardEnter.bind(this),
      onClose: this.handleKeyboardClose.bind(this),
      rowRef: this.rowRef,
      keyboardInputType: this.props.keyboardInputType,
      type: this.props.keyboardType,
      disableModeSwitch: this.props.keyboardDisableModeSwitch,
      initialShowNumpad: this.props.keyboardInitialShowNumpad,
      instrumentIndex: this.props.instrumentIndex,
    });
  }

  /** Closes the keyboard. */
  private closeKeyboard(): void {
    if (this.isEditing.get()) {
      this.props.bus.getPublisher<IfdKeyboardControlEvents>().pub('keyboard_close', undefined);
    }
  }

  /**
   * Handles input from the virtual keyboard
   * @param value The current value from the keyboard
   */
  private handleKeyboardInput(value: string): void {
    this.updateValue(value);
  }

  /**
   * Handles when the keyboard is closed
   */
  private handleKeyboardClose(): void {
    this.isEditing.set(false);
  }

  /**
   * Handles when the keyboard is closed via enter key
   */
  private handleKeyboardEnter(): void {
    this.onEnter();
    this.isEditing.set(false);
  }

  /**
   * Updates the current text value.
   * @param value The new value.
   */
  private updateValue(value: string): void {
    const props = this.props as TextEditRowProps<T>;

    // Apply max length constraint if specified
    let constrainedValue = value;
    if (props.maxLength !== undefined && constrainedValue.length > props.maxLength) {
      constrainedValue = constrainedValue.substring(0, props.maxLength);
    }

    // parse is required for non-string values, so we can somewhat safely cast
    const parsedValue = this.props.parse?.(constrainedValue) ?? (constrainedValue as T);

    this.pendingValue.set(parsedValue);
  }

  /** @inheritdoc */
  protected onEnter(): void {
    if (this.isEditing.get()) {
      if (SubscribableUtils.isMutableSubscribable(this.props.value)) {
        this.props.value.set(this.pendingValue.get());
      }

      if (this.props.onValueConfirmed) {
        this.props.onValueConfirmed(this.pendingValue.get());
      }

      this.closeKeyboard();
    } else {
      this.openKeyboard();
    }
  }

  /** @inheritdoc */
  protected onClear(): void {
    if (!this.isEditing.get()) {
      this.props.onValueCleared?.();
    }
  }

  /** @inheritdoc */
  public override onFocus(event?: IfdInteractionEvent | 'click'): void {
    if (this.props.isEnabled !== false) {
      if (this._isSelected.get()) {
        this.openKeyboard();
      }
    }

    super.onFocus(event);
  }

  /** @inheritdoc */
  protected renderContent(): VNode {
    const props = this.props;
    return (
      <div
        class="settings-row-content"
        style={props.color ? {
          color: props.color,
        } : {}}
      >
        <div class={{
          'settings-state-row-value': true,
          'settings-state-row-focused': this.isFocusedNotEditing,
          'settings-state-row-editing': this.isEditing
        }}>
          {props.prefixUnit &&
            <span
              class={{
                'settings-state-row-unit': true,
                'settings-state-row-unit-pre-spaced': !TextEditRow.NON_SPACED_UNITS.includes(props.prefixUnit)
              }}
            >{props.prefixUnit}</span>}
          {props.format ? this.pendingValue.map(props.format).withLifecycle(this.defaultLifecycle) : this.pendingValue}
          {props.postfixUnit &&
            <span
              class={{
                'settings-state-row-unit': true,
                'settings-state-row-unit-post-spaced': SubscribableUtils.toSubscribable(props.postfixUnit, true)
                  .map(unit => !TextEditRow.NON_SPACED_UNITS.includes(unit))
                  .withLifecycle(this.defaultLifecycle),
              }}
            >{props.postfixUnit}</span>}
        </div>
      </div>
    );
  }
}

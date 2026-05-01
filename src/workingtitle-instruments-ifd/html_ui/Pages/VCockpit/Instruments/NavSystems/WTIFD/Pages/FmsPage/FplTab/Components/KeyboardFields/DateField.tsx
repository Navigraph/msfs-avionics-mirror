import { ClassProp, ComponentProps, FSComponent, MutableSubscribable, SetSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { FormatUtils } from '../../../../../Utilities/FormatUtils';
import { CursorInput } from '../CursorInput';
import { DigitInputSlot } from '../NumberInput';
import { OptionInputSlot } from '../OptionInput/OptionInputSlot';
import { AbstractField } from './AbstractField';

/** The properties for the {@link DateField} component. */
interface DateFieldProps extends ComponentProps {
  /** CSS classes to be added on the root element. */
  readonly class?: ClassProp;
  /** Callback when invalid input is entered. */
  onInvalidEntry: (message: string) => void;
  /** Is the keyboard numpad shown. */
  showNumpad: MutableSubscribable<boolean>;
}

/**
 * A field for editing time of day in the format HH:MM.
 */
export class DateField extends AbstractField<string, DateFieldProps> {
  private readonly class = SetSubject.create(['vkb-input']);

  private readonly inputBaseValue = Subject.create('');

  private readonly inputRef = FSComponent.createRef<CursorInput<MutableSubscribable<string>>>();

  private readonly keyboardState = VirtualKeyboardState.getInstance();

  /** @inheritdoc */
  public onKeyPressed(value: string): void {
    const input = this.inputRef.instance;
    if (!input.setSlotCharacterValue(value)) {
      this.props.onInvalidEntry('Please enter a valid identifier or value.');
    }
  }

  /** @inheritdoc */
  public onBackspacePressed(): void {
    this.inputRef.instance.backspace();
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (!this.keyboardState.isEditingActive.get()) {
      return false;
    }

    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        this.inputRef.instance.activateEditing(true);
        return true;

      case IfdInteractionEvent.RightKnobOuterInc:
        this.inputRef.instance.moveCursor(1, true);
        return true;

      case IfdInteractionEvent.RightKnobOuterDec:
        this.inputRef.instance.moveCursor(-1, true);
        return true;

      case IfdInteractionEvent.RightKnobInnerDec:
        this.inputRef.instance.changeSlotValue(-1);
        return true;

      case IfdInteractionEvent.RightKnobInnerInc:
        this.inputRef.instance.changeSlotValue(1);
        return true;

      default:
        return false;
    }
  }

  /** @inheritdoc */
  public activateEditing(): void {
    this.keyboardState.setEditingActive(true);

    this.inputRef.instance.activateEditing(true);
    // Start at position 0
    this.inputRef.instance.placeCursor(0, false);
  }

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    FSComponent.bindSetToCssClasses(this.class, ['vkb-input'], this.props.class);

    this.inputRef.instance.cursorPosition.sub((pos) => {
      this.keyboardState.setCaret(pos);
      this.props.showNumpad.set(pos < 2 || pos > 4);
    }).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public getValue(): string {
    return this.inputBaseValue.get();
  }

  /** @inheritdoc */
  public onEnterPressed(): string {
    return this.getValue();
  }

  /** @inheritdoc */
  public onRequest(input: string): void {
    this.inputRef.instance.setValue(input);

    this.activateEditing();
  }

  /**
   * Parses slot values to an output.
   * @param slotValues The slot values.
   * @returns The output string.
   */
  private parseValue(slotValues: readonly any[]): string {
    return `${slotValues[0].toFixed(0)?.padStart(2, '0') ?? '01'} ${slotValues[1] ?? 'JAN'} ${slotValues[2].toFixed(0) ?? 2000}`;
  }

  /**
   * Digitizes an input value.
   * @param value The value.
   * @param setSlotValues A method to set each slot.
   */
  private digitizeValue(value: string, setSlotValues: readonly ((slotValue: any) => void)[]): void {
    const [day, month, year] = value.trim().split(' ');

    setSlotValues[0](parseInt(day) || null);
    setSlotValues[1](month ?? null);
    setSlotValues[2](parseInt(year) || null);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={this.class}
      >
        <CursorInput<MutableSubscribable<string>>
          ref={this.inputRef}
          value={this.inputBaseValue}
          parseValue={this.parseValue.bind(this)}
          digitizeValue={this.digitizeValue.bind(this)}
          allowBackFill={false}
          initialEditIndex={0}
          class='wpt-textfield-input'
        >
          <DigitInputSlot
            characterCount={2}
            minValue={1}
            maxValue={32}
            increment={1}
            wrap={true}
            scale={1}
            defaultCharValues={[0, 1]}
            digitizeValue={(value, setCharacters) => {
              if (isNaN(value) || value === null) {
                for (let i = 0; i < setCharacters.length; i++) {
                  setCharacters[i](null);
                }
              } else {
                const valueStr = value.toFixed(0).padStart(setCharacters.length, '0');

                for (let i = 0; i < setCharacters.length; i++) {
                  setCharacters[setCharacters.length - i - 1](valueStr.charAt(valueStr.length - i - 1));
                }
              }
            }}
          />
          <div class="cursor-input-slot-character">&nbsp</div>
          <OptionInputSlot
            wrap={true}
            options={FormatUtils.MONTHS}
            defaultOptionValue={'JAN'}
          />
          <div class="cursor-input-slot-character">&nbsp</div>
          <DigitInputSlot
            characterCount={4}
            minValue={2000}
            maxValue={2051}
            increment={1}
            wrap={true}
            scale={1}
            defaultCharValues={[2, 0, 0, 0]}
          />
        </CursorInput >
      </div>
    );
  }
}

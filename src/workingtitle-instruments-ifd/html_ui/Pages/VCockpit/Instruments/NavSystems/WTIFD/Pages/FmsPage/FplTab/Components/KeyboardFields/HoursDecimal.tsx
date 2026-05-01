import { ClassProp, ComponentProps, FSComponent, SetSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { DigitInputSlot, NumberInput } from '../NumberInput';
import { AbstractField } from './AbstractField';

/** The properties for the {@link HoursDecimalField} component. */
interface HoursDecimalFieldProps extends ComponentProps {
  /** CSS classes to be added on the root element. */
  readonly class?: ClassProp;
  /** Callback when invalid input is entered. */
  onInvalidEntry: (message: string) => void;
}

/**
 * A field for editing arbitrary hours:minutes:seconds durations.
 */
export class HoursDecimalField extends AbstractField<string, HoursDecimalFieldProps> {
  private static readonly formatter = (v: number): string => v.toFixed(1);

  private readonly class = SetSubject.create(['vkb-input']);

  private readonly timeValue = Subject.create(0);

  private readonly inputRef = FSComponent.createRef<NumberInput>();

  private readonly keyboardState = VirtualKeyboardState.getInstance();

  /** @inheritdoc */
  public onKeyPressed(value: string): void {
    const input = this.inputRef.instance;

    // if decimal is entered skip to the decimal part
    if (value === '.' && this.inputRef.instance.cursorPosition.get() < 3) {
      this.inputRef.instance.placeCursor(3, false);
      return;
    }

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
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    FSComponent.bindSetToCssClasses(this.class, ['vkb-input'], this.props.class);

    this.inputRef.instance.cursorPosition.sub((pos) => {
      this.keyboardState.setCaret(pos);
    }).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public getValue(): string {
    return HoursDecimalField.formatter(this.timeValue.get());
  }

  /** @inheritdoc */
  public onEnterPressed(): string {
    return this.getValue();
  }

  /** @inheritdoc */
  public onRequest(input: string): void {
    this.inputRef.instance.setValue(parseInt(input) || 0);

    this.activateEditing();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={this.class}>
        <NumberInput
          ref={this.inputRef}
          value={this.timeValue}
          digitizeValue={(value, setSignValues, setDigitValues): void => {
            setDigitValues[0](Math.trunc(value), true);
            setDigitValues[1](Math.trunc(value * 10) % 10, true);
          }}
          allowBackFill={true}
          class='wpt-textfield-input'
        >
          <DigitInputSlot
            characterCount={3}
            minValue={0}
            maxValue={1000}
            increment={1}
            wrap={true}
            scale={1}
            defaultCharValues={[0, 0, 0]}
          />
          <div class="cursor-input-slot-character">.</div>
          <DigitInputSlot
            characterCount={1}
            minValue={0}
            maxValue={10}
            increment={1}
            wrap={true}
            scale={0.1}
            defaultCharValues={[0]}
          />
        </NumberInput>
      </div>
    );
  }
}

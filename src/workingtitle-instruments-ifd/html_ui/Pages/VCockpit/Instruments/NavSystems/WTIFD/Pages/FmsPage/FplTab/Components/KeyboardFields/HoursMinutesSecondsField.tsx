import { ClassProp, ComponentProps, DateTimeFormatter, FSComponent, SetSubject, Subject, UnitType, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { DigitInputSlot, NumberInput } from '../NumberInput';
import { AbstractField } from './AbstractField';

/** The properties for the {@link HoursMinutesSecondsField} component. */
interface HoursMinutesSecondsFieldProps extends ComponentProps {
  /** CSS classes to be added on the root element. */
  readonly class?: ClassProp;
  /** Callback when invalid input is entered. */
  onInvalidEntry: (message: string) => void;
}

/**
 * A field for editing arbitrary hours:minutes:seconds durations.
 */
export class HoursMinutesSecondsField extends AbstractField<string, HoursMinutesSecondsFieldProps> {
  private static readonly timeFormatter = DateTimeFormatter.create('{HH}:{mm}:{ss}');

  private static readonly HR_TO_MS = UnitType.HOUR.convertTo(1, UnitType.MILLISECOND);
  private static readonly MIN_TO_MS = UnitType.MINUTE.convertTo(1, UnitType.MILLISECOND);
  private static readonly SEC_TO_MS = UnitType.SECOND.convertTo(1, UnitType.MILLISECOND);

  private readonly class = SetSubject.create(['vkb-input']);

  private readonly timeValue = Subject.create(0);

  private readonly inputRef = FSComponent.createRef<NumberInput>();

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
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    FSComponent.bindSetToCssClasses(this.class, ['vkb-input'], this.props.class);

    this.inputRef.instance.cursorPosition.sub((pos) => {
      this.keyboardState.setCaret(pos);
    }).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public getValue(): string {
    return HoursMinutesSecondsField.timeFormatter(this.timeValue.get());
  }

  /** @inheritdoc */
  public onEnterPressed(): string {
    return this.getValue();
  }

  /** @inheritdoc */
  public onRequest(input: string): void {
    const [hours, minutes, seconds] = input.split(':').map((v) => parseInt(v) || 0);

    this.inputRef.instance.setValue(hours * HoursMinutesSecondsField.HR_TO_MS + minutes * HoursMinutesSecondsField.MIN_TO_MS + seconds * HoursMinutesSecondsField.SEC_TO_MS);

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

            const hrs = Math.min(23, Math.floor(value / HoursMinutesSecondsField.HR_TO_MS));
            const mins = Math.min(59, Math.floor((value - hrs * HoursMinutesSecondsField.HR_TO_MS) / HoursMinutesSecondsField.MIN_TO_MS));
            const secs = Math.min(59, Math.floor(
              (value - hrs * HoursMinutesSecondsField.HR_TO_MS - mins * HoursMinutesSecondsField.MIN_TO_MS) / HoursMinutesSecondsField.SEC_TO_MS)
            );

            setDigitValues[0](hrs, true);
            setDigitValues[1](mins, true);
            setDigitValues[2](secs, true);
          }}
          allowBackFill={true}
          class='wpt-textfield-input'
        >
          <DigitInputSlot
            characterCount={2}
            minValue={0}
            maxValue={100}
            increment={1}
            wrap={true}
            scale={HoursMinutesSecondsField.HR_TO_MS}
            defaultCharValues={[0, 0]}
          />
          <div class="cursor-input-slot-character">:</div>
          <DigitInputSlot
            characterCount={2}
            minValue={0}
            maxValue={60}
            increment={1}
            wrap={true}
            scale={HoursMinutesSecondsField.MIN_TO_MS}
            defaultCharValues={[0, 0]}
          />
          <div class="cursor-input-slot-character">:</div>
          <DigitInputSlot
            characterCount={2}
            minValue={0}
            maxValue={60}
            increment={1}
            wrap={true}
            scale={HoursMinutesSecondsField.SEC_TO_MS}
            defaultCharValues={[0, 0]}
          />
        </NumberInput>
      </div>
    );
  }
}

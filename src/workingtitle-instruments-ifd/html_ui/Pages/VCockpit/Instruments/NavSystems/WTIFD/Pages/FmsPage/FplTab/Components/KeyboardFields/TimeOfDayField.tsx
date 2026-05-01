import { ClassProp, ComponentProps, EventBus, FSComponent, MutableSubscribable, SetSubject, Subject, UnitType, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { TimeFormat, TimeUserSettings } from '../../../../../Settings/TimeUserSettings';
import { FormatUtils } from '../../../../../Utilities/FormatUtils';
import { DigitInputSlot, NumberInput } from '../NumberInput';
import { AbstractField } from './AbstractField';

/** The properties for the {@link TimeOfDayField} component. */
interface TimeOfDayFieldProps extends ComponentProps {
  /** The event bus to use. */
  readonly bus: EventBus;
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
export class TimeOfDayField extends AbstractField<string, TimeOfDayFieldProps> {
  private static readonly HR_TO_MS = UnitType.HOUR.convertTo(1, UnitType.MILLISECOND);
  private static readonly MIN_TO_MS = UnitType.MINUTE.convertTo(1, UnitType.MILLISECOND);

  private readonly timeFormat = TimeUserSettings.getManager(this.props.bus).getSetting('timeFormat');
  private readonly isH12Format = this.timeFormat.get() === TimeFormat.H12;

  private readonly isPm = Subject.create(false);

  private readonly class = SetSubject.create(['vkb-input']);

  private readonly timeValue = Subject.create(0);

  private readonly inputText = this.timeValue.map((v) => this.isH12Format ? FormatUtils.timeOfDay12HWithSuffixFormatter(v) : FormatUtils.timeOfDay24HFormatter(v));

  private readonly inputRef = FSComponent.createRef<NumberInput>();
  private readonly amPmSlotRef = FSComponent.createRef<DigitInputSlot>();

  private readonly keyboardState = VirtualKeyboardState.getInstance();

  /** @inheritdoc */
  public onKeyPressed(value: string): void {
    const input = this.inputRef.instance;
    if (input.cursorPosition.get() === 4) {
      // We do a little hack to accept P or M from the keyboard for entry in the AM/PM slot, while the underlying field is a numeric one
      if (value === 'P') {
        input.setSlotCharacterValue('1');
      } else if (value === 'A') {
        input.setSlotCharacterValue('0');
      } else {
        this.props.onInvalidEntry('Please enter a valid identifier or value.');
      }
    } else if (!input.setSlotCharacterValue(value)) {
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

    this.amPmSlotRef.getOrDefault()?.value.pipe(this.isPm, (v) => v > 0);

    FSComponent.bindSetToCssClasses(this.class, ['vkb-input'], this.props.class);

    this.inputRef.instance.cursorPosition.sub((pos) => {
      this.keyboardState.setCaret(pos);
      this.props.showNumpad.set(pos < 4);
    }).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public getValue(): string {
    return this.inputText.get();
  }

  /** @inheritdoc */
  public onEnterPressed(): string {
    return this.inputText.get();
  }

  /** @inheritdoc */
  public onRequest(input: string): void {
    const am = input.endsWith('AM');
    const pm = input.endsWith('PM');
    const isH12 = am || pm;

    const [hours, minutes] = input.split(':').map((v) => parseInt(v) || 0);

    if (isH12) {
      const h12 = hours === 12 ? 0 : hours + (pm ? 12 : 0);
      this.inputRef.instance.setValue(h12 * TimeOfDayField.HR_TO_MS + minutes * TimeOfDayField.MIN_TO_MS);
    } else {
      this.inputRef.instance.setValue(hours * TimeOfDayField.HR_TO_MS + minutes * TimeOfDayField.MIN_TO_MS);
    }

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
            const abs = Math.abs(value);

            const hrs = Math.min(23, Math.floor(abs / TimeOfDayField.HR_TO_MS));
            const min = Math.min(59, Math.floor((abs - hrs * TimeOfDayField.HR_TO_MS) / TimeOfDayField.MIN_TO_MS));
            const isPm = this.isH12Format && hrs >= 12;

            setDigitValues[0](isPm ? hrs - 12 : hrs, true);
            setDigitValues[1](min, true);
            if (this.isH12Format) {
              setDigitValues[2](isPm ? 1 : 0, true);
            }
          }}
          allowBackFill={true}
          class='wpt-textfield-input'
        >
          <DigitInputSlot
            characterCount={2}
            minValue={this.isH12Format ? 1 : 0}
            maxValue={this.isH12Format ? 13 : 24}
            increment={1}
            wrap={true}
            scale={TimeOfDayField.HR_TO_MS}
            defaultCharValues={this.isH12Format ? [1, 2] : [0, 0]}
            parseValue={(chars) => { // returns ms
              let hours = parseInt((chars[0] ?? '0') + (chars[1] ?? '0'));

              if (this.isH12Format) {
                if (hours === 12) {
                  hours = 0;
                }
              }

              return hours * TimeOfDayField.HR_TO_MS;
            }}
            digitizeValue={(valueMs, setChars) => {
              const hours = Math.round(valueMs / TimeOfDayField.HR_TO_MS);
              if (this.isH12Format) {
                if (hours === 0) {
                  setChars[0]('1');
                  setChars[1]('2');
                } else {
                  const chars = (hours > 12 ? hours - 12 : hours).toFixed(0).padStart(2, '0');
                  setChars[0](chars[0]);
                  setChars[1](chars[1]);
                }
              } else {
                const chars = hours.toFixed(0).padStart(2, '0');
                setChars[0](chars[0]);
                setChars[1](chars[1]);
              }
            }}
          />
          <div class="cursor-input-slot-character">:</div>
          <DigitInputSlot
            characterCount={2}
            minValue={0}
            maxValue={60}
            increment={1}
            wrap={true}
            scale={TimeOfDayField.MIN_TO_MS}
            defaultCharValues={[0, 0]}
          />
          {this.isH12Format && <DigitInputSlot
            ref={this.amPmSlotRef}
            characterCount={1}
            minValue={0}
            maxValue={2}
            increment={1}
            wrap={true}
            scale={12 * TimeOfDayField.HR_TO_MS}
            defaultCharValues={[0]}
            renderChar={(c) => c === '1' ? 'PM' : 'AM'}
          />}
        </NumberInput>
      </div>
    );
  }
}

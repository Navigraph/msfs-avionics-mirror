import {
  ComponentProps, FSComponent, MappedSubject, MathUtils, MutableSubscribable, NodeReference, SetSubject, Subject, Subscribable, Unit, UnitFamily, UnitType,
  VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { DigitInputSlot, NumberInput } from '../NumberInput';
import { AbstractNumberField, NumberFieldInput, NumberInputDefinition } from './AbstractNumberField';

/**
 * A request input for {@link AngleField}.
 */
export interface AngleInput extends NumberFieldInput {
  /**
   * The initial angle unit. If not defined, the initial unit will default to a value based on the units mode.
   */
  initialUnit?: Unit<UnitFamily.Angle>;

  /** The fields operating unit. */
  unitsMode: 'degree';

  /** The minimum valid numeric value allowed by the field's input. */
  minimumValue: number;

  /** The maximum valid numeric value allowed by the field's input. */
  maximumValue: number;

  /** The initial value */
  initialValue: number;

  /** Whether the input has a decimal value. */
  hasDecimal: boolean;

  /** Whether to wrap back to min value on exceeding max. If false the value will be clamped. */
  hasWrap: boolean;
}

/**
 * A definition for a {@link NumberInput} used in a {@link AngleField}.
 */
interface AngleInputDefinition extends NumberInputDefinition {
  /** The unit type associated with this definition's input. */
  readonly unit: Unit<UnitFamily.Angle>;
}

/** Props for the field component. */
export interface AngleFieldProps extends ComponentProps {
  /** Callback when invalid input is entered. */
  onInvalidEntry: (message: string) => void;
}

/**
 * A field which allows the user to enter an angle in degrees
 */
export class AngleField extends AbstractNumberField<AngleInput, AngleInputDefinition, AngleFieldProps> {
  private minValue = 0;
  private maxValue = 360;
  public readonly inputText = Subject.create<string>('');
  public readonly inputRef = FSComponent.createRef<NumberInput>();
  private keyboardState = VirtualKeyboardState.getInstance();
  private lastEventKeyboard = Subject.create(true);
  private readonly touched = Subject.create(false);

  private readonly hasDecimal = Subject.create(false);
  private hasWrap = true;

  /** @inheritdoc */
  public constructor(props: AngleFieldProps) {
    super(props);

    const isDegreeInputVisible = Subject.create(false);
    this.registerInputDefinition('degree', {
      ref: this.inputRef,
      value: Subject.create(0),
      render: (ref, value) => this.renderDegreeInput(ref, value, isDegreeInputVisible),
      isVisible: isDegreeInputVisible,
      unit: UnitType.DEGREE
    });
  }

  public activateEditing = (): void => {
    this.keyboardState.setEditingActive(true);

    this.inputRef.instance.activateEditing(true);
    this.touched.set(false);
  };

  /** @inheritdoc */
  public onKeyPressed(char: string): void {
    let newValue: number;

    if (char === '.') {
      // skip past the decimal point
      this.inputRef.instance.placeCursor(2, true);

      // old entry, so wait for next char
      if (this.lastEventKeyboard.get()) {
        return;
      }

      // this is a new entry, so start with 0
      newValue = 0;
    } else if (this.lastEventKeyboard.get() && this.touched.get()) {
      if (this.hasDecimal.get() && this.inputRef.instance.cursorPosition.get() === 2) {
        newValue = Math.max(0, Math.trunc(this.inputRef.instance.value.get()) + 0.1 * parseInt(char));
      } else {
        newValue = Math.max(0, this.inputRef.instance.value.get() * 10 + parseInt(char));
      }
    } else {
      // new entry
      newValue = parseInt(char);
      if ((this.hasDecimal.get() && this.maxValue < 10) || this.maxValue < 100) {
        this.inputRef.instance.placeCursor(1, true);
      } else {
        this.inputRef.instance.placeCursor(0, true);
      }
    }

    if (newValue <= this.maxValue) {
      this.inputRef.instance.setValue(Math.max(0, newValue));

      if (char != '.') {
        this.inputRef.instance.moveCursor(1, true);
      }
      this.touched.set(true);
    } else {
      this.props.onInvalidEntry('Please enter a valid identifier or value.');
    }

    this.lastEventKeyboard.set(true);
  }

  /** @inheritdoc */
  public onRequest(input: AngleInput): void {

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const initialInputDef = this.inputDefinitions.get(input.unitsMode)!;
    const initialUnit = input.initialUnit ?? initialInputDef.unit;

    const initialValue = MathUtils.clamp(initialUnit.convertTo(input.initialValue, initialInputDef.unit), input.minimumValue, input.maximumValue);

    this.minValue = input.minimumValue;
    this.maxValue = input.maximumValue;

    this.hasDecimal.set(input.hasDecimal);
    this.hasWrap = input.hasWrap;

    this.resetActiveInput(input.unitsMode, Math.round(initialValue), true);
    this.inputRef.instance.setValue(Number(initialValue));
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
    return 'angle-field';
  }

  /**
   * Increments the current value by the specified amount in degrees
   * @param increment The increment in degrees (can be negative for decrement)
   */
  private incrementValue(increment: number): void {
    if (!this.activeInputDef) {
      return;
    }

    const currentValue = this.activeInputDef.ref.instance.value.get();
    let newValue = currentValue + increment;

    // Wrap around at boundaries if enabled
    if (this.hasWrap) {
      if (newValue > this.maxValue) {
        newValue = this.minValue;
      } else if (newValue < 0) {
        newValue = this.maxValue;
      }
    } else {
      newValue = MathUtils.clamp(newValue, this.minValue, this.maxValue);
    }

    this.activeInputDef.ref.instance.setValue(newValue);
  }

  /**
   * Handle backspace
   */
  public onBackspacePressed(): void {
    this.inputRef.instance.setValue(Math.floor(this.inputRef.instance.value.get() / 10));
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
        this.lastEventKeyboard.set(false);
        this.incrementValue(this.hasDecimal.get() ? 0.1 : 1);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        this.lastEventKeyboard.set(false);
        this.incrementValue(this.hasDecimal.get() ? -0.1 : -1);
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        this.lastEventKeyboard.set(false);
        this.incrementValue(this.hasDecimal.get() ? 1 : 10);
        return true;
      case IfdInteractionEvent.RightKnobOuterDec:
        this.lastEventKeyboard.set(false);
        this.incrementValue(this.hasDecimal.get() ? -1 : -10);
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
    this.validateValueAndClose();
    return Math.max(this.minValue, this.inputRef.instance.value.get()).toFixed(this.hasDecimal.get() ? 1 : 0);
  }


  /**
   * Renders degree value input.
   * @param ref The reference to which to assign the rendered input.
   * @param value The value to bind to the rendered input.
   * @param isVisible A subscribable to which to bind the visibility of the rendered input.
   * @returns degree value input, as a VNode.
   */
  private renderDegreeInput(ref: NodeReference<NumberInput>, value: MutableSubscribable<number>, isVisible: Subscribable<boolean>): VNode {
    const cssClass = SetSubject.create(['field-input-degree']);

    const displayValue = MappedSubject.create(
      ([currentValue, hasDecimal]) => currentValue.toFixed(hasDecimal ? 1 : 0),
      value,
      this.hasDecimal,
    ).withLifecycle(this.defaultLifecycle);

    // Refresh the digits when has decimal changes.
    this.hasDecimal.sub(() => ref.getOrDefault()?.populateCharsFromValue()).withLifecycle(this.defaultLifecycle);

    isVisible.sub(val => { cssClass.toggle('hidden', !val); }, true).withLifecycle(this.defaultLifecycle);

    return (
      <NumberInput
        ref={ref}
        value={value}
        digitizeValue={(currentValue, setSignValues, setDigitValues): void => {
          let clamped = MathUtils.clamp(currentValue, 0, this.maxValue);
          if (this.hasDecimal.get()) {
            clamped *= 10;
          }

          setDigitValues[0](Math.trunc(clamped / 100), true);
          setDigitValues[1](Math.trunc((clamped % 100) / 10), true);
          setDigitValues[2](clamped % 10, true);
        }}
        allowBackFill={false}
        class={cssClass}
      >
        {displayValue}
        {/** Slots are hidden as cursor is never shown */}
        <div class="hidden">
          <DigitInputSlot
            characterCount={1}
            minValue={0}
            maxValue={10}
            increment={1}
            wrap={true}
            scale={this.hasDecimal.map((v) => v ? 1e1 : 1e2).withLifecycle(this.defaultLifecycle)}
            defaultCharValues={[0]}
          />
          <DigitInputSlot
            characterCount={1}
            minValue={0}
            maxValue={10}
            increment={1}
            wrap={true}
            scale={this.hasDecimal.map((v) => v ? 1 : 1e1).withLifecycle(this.defaultLifecycle)}
            defaultCharValues={[0]}
          />
          <DigitInputSlot
            characterCount={1}
            minValue={0}
            maxValue={10}
            increment={1}
            wrap={true}
            scale={this.hasDecimal.map((v) => v ? 0.1 : 1).withLifecycle(this.defaultLifecycle)}
            defaultCharValues={[0]}
          />
        </div>
        <div class='numberunit-unit-small'>°</div>
      </NumberInput>
    );
  }
}

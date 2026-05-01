import {
  ComponentProps, FSComponent, MathUtils, MutableSubscribable, NodeReference, SetSubject, Subject, Subscribable, Unit, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { DigitInputSlot, NumberInput } from '../NumberInput';
import { AbstractNumberField, NumberFieldInput, NumberInputDefinition } from './AbstractNumberField';

/**
 * A request input for {@link DescentRateField}.
 */
export interface DescentRateInput extends NumberFieldInput {
  /**
   * The initial descent rate unit. If not defined, the initial unit will default to a value based on the units mode.
   */
  initialUnit?: Unit<UnitFamily.Speed>;

  /** The fields operating unit. */
  unitsMode: 'fpm';

  /** The minimum valid numeric value allowed by the field's input. */
  minimumValue: number;

  /** The maximum valid numeric value allowed by the field's input. */
  maximumValue: number;

  /** The initial value */
  initialValue: number;

  /** Whether to wrap back to min value on exceeding max. If false the value will be clamped. */
  hasWrap: boolean;
}

/**
 * A definition for a {@link NumberInput} used in a {@link DescentRateField}.
 */
interface DescentRateInputDefinition extends NumberInputDefinition {
  /** The unit type associated with this definition's input. */
  readonly unit: Unit<UnitFamily.Speed>;
}

/** Props for the field component. */
export interface DescentRateFieldProps extends ComponentProps {
  /** Callback when invalid input is entered. */
  onInvalidEntry: (message: string) => void;
}

/**
 * A field which allows the user to enter a descent rate.
 */
export class DescentRateField extends AbstractNumberField<DescentRateInput, DescentRateInputDefinition, DescentRateFieldProps> {
  private minValue = 0;
  private maxValue = 360;
  public readonly inputText = Subject.create<string>('');
  public readonly inputRef = FSComponent.createRef<NumberInput>();
  private keyboardState = VirtualKeyboardState.getInstance();
  private lastEventKeyboard = Subject.create(true);
  private readonly touched = Subject.create(false);

  private hasWrap = true;

  /** @inheritdoc */
  public constructor(props: DescentRateFieldProps) {
    super(props);

    const isDegreeInputVisible = Subject.create(false);
    this.registerInputDefinition('fpm', {
      ref: this.inputRef,
      value: Subject.create(0),
      render: (ref, value) => this.renderFpmInput(ref, value, isDegreeInputVisible),
      isVisible: isDegreeInputVisible,
      unit: UnitType.FPM,
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

    if (this.lastEventKeyboard.get() && this.touched.get()) {
      newValue = Math.max(0, this.inputRef.instance.value.get() * 10 + parseInt(char));
    } else {
      // new entry
      newValue = parseInt(char);
      if (this.maxValue < 100) {
        this.inputRef.instance.placeCursor(2, true);
      } else if (this.maxValue < 1000) {
        this.inputRef.instance.placeCursor(1, true);
      } else {
        this.inputRef.instance.placeCursor(0, true);
      }
    }

    if (newValue <= this.maxValue) {
      this.inputRef.instance.setValue(Math.max(0, newValue));
      this.inputRef.instance.moveCursor(1, true);
      this.touched.set(true);
    } else {
      this.props.onInvalidEntry('Please enter a valid identifier or value.');
    }

    this.lastEventKeyboard.set(true);
  }

  /** @inheritdoc */
  public onRequest(input: DescentRateInput): void {

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const initialInputDef = this.inputDefinitions.get(input.unitsMode)!;
    const initialUnit = input.initialUnit ?? initialInputDef.unit;

    const initialValue = MathUtils.clamp(initialUnit.convertTo(input.initialValue, initialInputDef.unit), input.minimumValue, input.maximumValue);

    this.minValue = input.minimumValue;
    this.maxValue = input.maximumValue;

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
        this.incrementValue(50);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        this.lastEventKeyboard.set(false);
        this.incrementValue(-50);
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        this.lastEventKeyboard.set(false);
        this.incrementValue(100);
        return true;
      case IfdInteractionEvent.RightKnobOuterDec:
        this.lastEventKeyboard.set(false);
        this.incrementValue(-100);
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
    return Math.max(this.minValue, this.inputRef.instance.value.get()).toString();
  }


  /**
   * Renders degree value input.
   * @param ref The reference to which to assign the rendered input.
   * @param value The value to bind to the rendered input.
   * @param isVisible A subscribable to which to bind the visibility of the rendered input.
   * @returns degree value input, as a VNode.
   */
  private renderFpmInput(ref: NodeReference<NumberInput>, value: MutableSubscribable<number>, isVisible: Subscribable<boolean>): VNode {
    const cssClass = SetSubject.create(['field-input-degree']);

    const displayValue = value.map((v) => v.toFixed(0)).withLifecycle(this.defaultLifecycle);

    isVisible.sub(val => { cssClass.toggle('hidden', !val); }, true).withLifecycle(this.defaultLifecycle);

    return (
      <NumberInput
        ref={ref}
        value={value}
        digitizeValue={(currentValue, setSignValues, setDigitValues): void => {
          const clamped = MathUtils.clamp(currentValue, 0, this.maxValue);

          setDigitValues[0](Math.trunc(clamped / 1000), true);
          setDigitValues[1](Math.trunc((clamped % 1000) / 100), true);
          setDigitValues[2](Math.trunc((clamped % 100) / 10), true);
          setDigitValues[3](clamped % 10, true);
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
            scale={1e3}
            defaultCharValues={[0]}
          />
          <DigitInputSlot
            characterCount={1}
            minValue={0}
            maxValue={10}
            increment={1}
            wrap={true}
            scale={1e2}
            defaultCharValues={[0]}
          />
          <DigitInputSlot
            characterCount={1}
            minValue={0}
            maxValue={10}
            increment={1}
            wrap={true}
            scale={1e1}
            defaultCharValues={[0]}
          />
          <DigitInputSlot
            characterCount={1}
            minValue={0}
            maxValue={10}
            increment={1}
            wrap={true}
            scale={1}
            defaultCharValues={[0]}
          />
        </div>
        <div class='numberunit-unit-small'>FPM</div>
      </NumberInput>
    );
  }
}

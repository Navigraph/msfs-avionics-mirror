import {
  ComponentProps, EventBus, FSComponent, MappedSubject, MathUtils, MutableSubscribable, NodeReference, SetSubject, Subject, Subscribable, Subscription, Unit,
  UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { Fms } from '../../../../../Fms';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { KeyboardInputType } from '../../../../../Keyboard/KeyboardTypes';
import { FmsUserSettings } from '../../../../../Settings/FmsUserSettings';
import { DigitInputSlot, NumberInput } from '../NumberInput';
import { AbstractNumberField, NumberFieldInput, NumberInputDefinition } from './AbstractNumberField';

/** All of the possible altitude input types. */
export type AltitudeInputType = KeyboardInputType.Altitude | KeyboardInputType.ClimbAltitudeOrFlightLevel |
  KeyboardInputType.DescentAltitudeOrFlightLevel | KeyboardInputType.FlightLevel;


/**
 * A request input for {@link AltitudeField}.
 */
export interface AltitudeInput extends NumberFieldInput {
  /**
   * The initial altitude unit. If not defined, the initial unit will default to a value based on the units mode.
   */
  initialUnit?: Unit<UnitFamily.Distance>;

  /** The fields operating unit. */
  unitsMode: 'feet';

  /** The minimum valid numeric value allowed by the field's input. */
  minimumValue: number;

  /** The maximum valid numeric value allowed by the field's input. */
  maximumValue: number;

  /** The initial value */
  initialValue: number;

  /** The type of altitude input. */
  inputType: AltitudeInputType;
}

/**
 * A definition for a {@link NumberInput} used in a {@link AltitudeField}.
 */
interface AltitudeInputDefinition extends NumberInputDefinition {
  /** The unit type associated with this definition's input. */
  readonly unit: Unit<UnitFamily.Distance>;
}

/**
 *
 */
interface AltitudeProps extends ComponentProps {
  /** Event bus for the component */
  bus: EventBus;
  /** The FMS to use. */
  readonly fms: Fms;
}

/**
 * A field which allows the user to enter an altitude in feet or meters.
 */
export class AltitudeField extends AbstractNumberField<AltitudeInput, AltitudeInputDefinition, AltitudeProps> {
  private minValue = 0;
  private maxValue = 60000;
  public readonly inputText = Subject.create<string>('');
  public readonly inputRef = FSComponent.createRef<NumberInput>();
  private keyboardState = VirtualKeyboardState.getInstance();
  private lastEventKeyboard = Subject.create(true);
  private readonly transAltOrLevelFeet = Subject.create(18000);
  private readonly touched = Subject.create(false);

  private readonly inputType = Subject.create(KeyboardInputType.ClimbAltitudeOrFlightLevel);

  private transAltPipe?: Subscription;

  /** @inheritdoc */
  public constructor(props: AltitudeProps) {
    super(props);

    const isFeetInputVisible = Subject.create(false);
    this.registerInputDefinition('feet', {
      ref: this.inputRef,
      value: Subject.create(0),
      render: (ref, value) => this.renderFeetInput(ref, value, isFeetInputVisible),
      isVisible: isFeetInputVisible,
      unit: UnitType.FOOT
    });
  }

  /**
   * Activate editing
   */
  public activateEditing = (): void => {
    this.keyboardState.setEditingActive(true);

    this.inputRef.instance.activateEditing(true);
    this.touched.set(false);
  };

  /** @inheritdoc */
  public onKeyPressed(char: string): void {
    const value = parseInt(char);
    const oldValue = this.inputRef.instance.value.get();

    let newValue: number;
    if (this.lastEventKeyboard.get() && this.touched.get()) {
      newValue = this.isAltitudeFlightLevel(oldValue) ? oldValue * 10 + value * 100 : oldValue * 10 + value;
    } else {
      this.touched.set(true);
      this.inputRef.instance.placeCursor(0, true);
      newValue = this.isAltitudeFlightLevel(0) ? value * 100 : value;
    }

    if (newValue <= this.maxValue) {
      this.inputRef.instance.setValue(Math.max(this.minValue, newValue));
    }

    this.lastEventKeyboard.set(true);
  }

  /** @inheritdoc */
  public onRequest(input: AltitudeInput): void {

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const initialInputDef = this.inputDefinitions.get(input.unitsMode)!;
    const initialUnit = input.initialUnit ?? initialInputDef.unit;

    const initialValue = MathUtils.clamp(initialUnit.convertTo(input.initialValue, initialInputDef.unit), input.minimumValue, input.maximumValue);

    this.minValue = input.minimumValue;
    this.maxValue = input.maximumValue;

    this.inputType.set(input.inputType);

    this.transAltPipe?.destroy();
    this.transAltPipe = undefined;

    if (input.inputType === KeyboardInputType.ClimbAltitudeOrFlightLevel) {
      this.transAltPipe = FmsUserSettings.getManager(this.props.bus).getSetting('transitionAltitude').pipe(this.transAltOrLevelFeet);
    } else if (input.inputType === KeyboardInputType.DescentAltitudeOrFlightLevel) {
      this.transAltPipe = FmsUserSettings.getManager(this.props.bus).getSetting('transitionLevel').pipe(this.transAltOrLevelFeet);
    }

    this.resetActiveInput(input.unitsMode, Math.round(initialValue), true);
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
    return 'altitude-field';
  }

  /**
   * Increments the current value by the specified amount in feet
   * @param increment The increment in feet (can be negative for decrement)
   */
  private incrementValue(increment: number): void {
    if (!this.activeInputDef) { return; }

    const currentValue = this.activeInputDef.ref.instance.value.get();
    const newValue = Math.max(0, Math.min(this.maxValue, currentValue + increment));

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
    this.lastEventKeyboard.set(false);
    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
        this.incrementValue(100);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        this.incrementValue(-100);
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        this.incrementValue(1000);
        return true;
      case IfdInteractionEvent.RightKnobOuterDec:
        this.incrementValue(-1000);
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
    return this.inputRef.instance.value.get().toString();
  }

  /**
   * Checks if a value in feet is a flight level based on the current input type and transition alt/level.
   * @param value The altitude in feet.
   * @returns true if it should be displayed as a flight level.
   */
  private isAltitudeFlightLevel(value: number): boolean {
    const inputType = this.inputType.get();
    return inputType === KeyboardInputType.FlightLevel ||
      (inputType !== KeyboardInputType.Altitude && value >= this.transAltOrLevelFeet.get());
  }

  /**
   * Renders feet value input.
   * @param ref The reference to which to assign the rendered input.
   * @param value The value to bind to the rendered input.
   * @param isVisible A subscribable to which to bind the visibility of the rendered input.
   * @returns feet value input, as a VNode.
   */
  private renderFeetInput(ref: NodeReference<NumberInput>, value: MutableSubscribable<number>, isVisible: Subscribable<boolean>): VNode {
    const cssClass = SetSubject.create(['altitude-field-input-feet']);

    const isFlightLevel = MappedSubject.create(
      ([currentValue]) => this.isAltitudeFlightLevel(currentValue),
      value,
      this.inputType,
    ).withLifecycle(this.defaultLifecycle);

    const displayValue = MappedSubject.create(
      ([currentValue, isValueFlightLevel]) => {
        if (isValueFlightLevel) {
          const flightLevel = Math.round(currentValue / 100);
          return flightLevel.toString().padStart(3, '0');
        }
        return currentValue.toFixed(0);
      },
      value,
      isFlightLevel,
    ).withLifecycle(this.defaultLifecycle);

    isVisible.sub(val => { cssClass.toggle('hidden', !val); }, true).withLifecycle(this.defaultLifecycle);

    // ensure digitise runs after changing inputType or trans alt
    this.inputType.sub(() => ref.getOrDefault()?.populateCharsFromValue()).withLifecycle(this.defaultLifecycle);
    this.transAltOrLevelFeet.sub(() => ref.getOrDefault()?.populateCharsFromValue()).withLifecycle(this.defaultLifecycle);

    return (
      <NumberInput
        ref={ref}
        value={value}
        digitizeValue={(currentValue, setSignValues, setDigitValues): void => {
          if (this.isAltitudeFlightLevel(currentValue)) {
            // Display as flight level (3 digits: FL000 to FL170)
            const flightLevel = Math.round(currentValue / 100);
            const clamped = MathUtils.clamp(flightLevel, 0, this.maxValue / 100);

            setDigitValues[0](Math.trunc(clamped / 100), true);
            setDigitValues[1](Math.trunc((clamped % 100) / 10), true);
            setDigitValues[2](clamped % 10, true);
          } else {
            // Display as feet
            const clamped = MathUtils.clamp(Math.round(currentValue), 0, this.maxValue);

            setDigitValues[0](Math.trunc(clamped / 1e4), true);
            setDigitValues[1](Math.trunc((clamped % 1e4) / 1e3), true);
            setDigitValues[2](Math.trunc((clamped % 1e3) / 1e2), true);
            setDigitValues[3](Math.trunc((clamped % 1e2) / 1e1), true);
            setDigitValues[4](clamped % 1e1, true);
          }
        }}
        allowBackFill={false}
        class={cssClass}
      >
        <div class='numberunit-unit-small'>{isFlightLevel.map((v) => v ? 'FL' : '').withLifecycle(this.defaultLifecycle)}</div>
        {displayValue}
        {/** Slots are hidden as cursor is never shown */}
        <div class="hidden"><DigitInputSlot
          characterCount={1}
          minValue={0}
          maxValue={10}
          increment={1}
          wrap={true}
          scale={1e4}
          defaultCharValues={[0]}
        />
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
          /></div>
        <div class='numberunit-unit-small'>{isFlightLevel.map((v) => v ? '' : 'FT').withLifecycle(this.defaultLifecycle)}</div>
      </NumberInput>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.transAltPipe?.destroy();
    super.destroy();
  }
}

import {
  ComponentProps, EventBus, FSComponent, LifecycleComponent, MappedSubject, NodeReference, NumberUnitSubject, Subject, Subscribable, Unit, UnitFamily, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';

/** The properties for the {@link HoldField} component. */
interface HoldFieldProps<F extends UnitFamily> extends ComponentProps {
  /** The subject value */
  value: NumberUnitSubject<F, Unit<F>>;
  /** Label to append **/
  unit?: string;
  /** Whether this field is currently selected */
  isSelected: Subscribable<boolean>;
  /** Instance of event bus */
  bus: EventBus;
  /** If the user is editing the field */
  isInEntryMode: Subject<boolean>;
  /** Div Ref */
  divRef: NodeReference<HTMLDivElement>;
  /** Callback when entry mode is committed **/
  onCommit: (value: string) => void;
  /** Edit mode active? **/
  isInEditMode: Subject<boolean>;
  /** Minimum allowed value */
  minValue?: number;
  /** Maximum allowed value */
  maxValue?: number;
  /** Inner knob increment amount */
  innerIncrement?: number;
  /** Outer knob increment amount */
  outerIncrement?: number;
  /** Number of decimal places to display */
  decimalPlaces?: number;
  /** Whether to wrap from max to min and vice versa */
  wrap?: boolean;
}

/** The HoldField component. */
export class HoldField<F extends UnitFamily> extends LifecycleComponent<HoldFieldProps<F>> {
  private readonly workingValue: NumberUnitSubject<F, Unit<F>>;
  private readonly display: MappedSubject<any, string>;
  private readonly isEntered: MappedSubject<any, boolean>;

  /**
   * @inheritDoc
   */
  constructor(props: HoldFieldProps<F>) {
    super(props);

    this.workingValue = NumberUnitSubject.create(
      this.props.value.get().unit.createNumber(this.props.value.get().number)
    ) as NumberUnitSubject<F, Unit<F>>;

    this.display = MappedSubject.create(
      ([value, isEntryMode]) => {
        const currentValue = isEntryMode ? this.workingValue.get() : value;
        const decimals = this.props.decimalPlaces ?? 1;

        // Special formatting for angles - pad to 3 digits
        if (this.props.value.get().unit.family === UnitFamily.Angle && decimals === 0) {
          return Math.round(currentValue.number).toString().padStart(3, '0');
        }

        return currentValue.number.toFixed(decimals);
      },
      this.props.value,
      this.props.isInEntryMode,
      this.workingValue
    );

    this.isEntered = MappedSubject.create(
      ([isEntryMode, isSelected]): boolean => {
        return isEntryMode && isSelected;
      },
      this.props.isInEntryMode,
      this.props.isSelected
    );
  }

  /**
   * Handle knob events
   * @param event IfdInteractionEvent
   * @returns boolean
   */
  public onInteractionEvent = (event: IfdInteractionEvent): boolean => {
    if (!this.props.isSelected.get()) {
      return false;
    }

    if (this.props.isInEntryMode.get()) {
      return this.handleEntryModeEvent(event);
    } else {
      return this.handleNormalModeEvent(event);
    }
  };

  /**
   * Increment value
   * @param event {@IfdInteractionEvent}
   */
  private incrementValue(event: IfdInteractionEvent): void {
    const current = this.workingValue.get().number;
    let next: number;

    // Use props or defaults
    const innerInc = this.props.innerIncrement ?? 1.0;
    const outerInc = this.props.outerIncrement ?? 0.1;
    const maxVal = this.props.maxValue ?? 99.9;
    const minVal = this.props.minValue ?? 0.1;

    const increment = event === IfdInteractionEvent.RightKnobInnerInc ? innerInc : outerInc;
    next = current + increment;

    if (this.props.wrap) {
      // Wrap around from max to min
      if (next > maxVal) {
        next = minVal;
      }
    } else {
      // Clamp to max
      next = Math.min(next, maxVal);
    }

    this.workingValue.set(this.workingValue.get().unit.createNumber(next));
  }

  /**
   * Decrement value
   * @param event {@IfdInteractionEvent}
   */
  private decrementValue(event: IfdInteractionEvent): void {
    const current = this.workingValue.get().number;
    let next: number;

    // Use props or defaults
    const innerInc = this.props.innerIncrement ?? 1.0;
    const outerInc = this.props.outerIncrement ?? 0.1;
    const minVal = this.props.minValue ?? 0.1;
    const maxVal = this.props.maxValue ?? 99.9;

    const increment = event === IfdInteractionEvent.RightKnobInnerDec ? innerInc : outerInc;
    next = current - increment;

    if (this.props.wrap) {
      // Wrap around from min to max
      if (next < minVal) {
        next = maxVal;
      }
    } else {
      // Clamp to min
      next = Math.max(next, minVal);
    }

    this.workingValue.set(this.workingValue.get().unit.createNumber(next));
  }

  /**
   * Commit value
   */
  private commitValue(): void {
    this.props.value.set(this.workingValue.get());
    this.props.onCommit(this.workingValue.get().number.toString());
  }

  /**
   * Handles events when in entry mode
   * @param event IfdInteractionEvent
   * @returns whether the event was handled.
   */
  private handleEntryModeEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobOuterInc:
      case IfdInteractionEvent.RightKnobInnerInc:
        this.incrementValue(event);
        return true;

      case IfdInteractionEvent.RightKnobOuterDec:
      case IfdInteractionEvent.RightKnobInnerDec:
        this.decrementValue(event);
        return true;

      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        this.props.isInEntryMode.set(false);
        this.commitValue();
        return true;
      default:
        break;
    }

    return false;
  }

  /**
   * Handles events when the field is not in entry mode
   * @param event IfdInteractionEvent
   * @returns whether the event was handled.
   */
  private handleNormalModeEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        this.props.isInEntryMode.set(true);
        return true;
      default:
        break;
    }
    return false;
  }

  /**
   * @inheritDoc
   */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.workingValue.set(this.props.value.get());

    this.props.value.sub((newValue) => {
      if (!this.props.isInEntryMode.get()) {
        this.workingValue.set(newValue);
      }
    });
  }

  /**
   * @inheritDoc
   */
  public render(): VNode {
    return (
      <div
        ref={this.props.divRef}
        class={{
          'leg-block-input-field': true,
          'leg-block-black-field': this.props.isInEditMode,
          'leg-block-cyan-field': this.props.isSelected,
          'leg-block-white-field': this.isEntered
        }}
      >
        {this.display}{this.props.unit}
      </div>
    );
  }
}

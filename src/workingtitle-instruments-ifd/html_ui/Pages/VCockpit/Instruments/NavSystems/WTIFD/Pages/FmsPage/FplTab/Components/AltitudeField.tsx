import {
  ComponentProps, EventBus, FSComponent, LifecycleComponent, MappedSubject, MappedSubscribable, MathUtils, MutableSubscribable, NodeReference,
  NumberUnitInterface, NumberUnitSubject, StyleRecord, Subject, Subscribable, Unit, UnitFamily, UnitType, VerticalFlightPhase, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler } from '../../../../RightKnob';
import { FmsUserSettings } from '../../../../Settings/FmsUserSettings';

/** The properties for the {@link AltitudeField} component. */
interface AltitudeFieldProps extends ComponentProps {
  /** The subject value */
  value: Subscribable<NumberUnitInterface<UnitFamily.Distance, Unit<UnitFamily.Distance>>>;
  /** Label to append **/
  unit?: string;
  /** Whether this field is currently selected */
  isSelected: Subscribable<boolean>;
  /** Instance of event bus */
  bus: EventBus;
  /** If the user is editing the field */
  isInEntryMode: MutableSubscribable<boolean>;
  /** Node Ref */
  rootRef: NodeReference<HTMLElement>;
  /** Style object */
  style: StyleRecord;
  /** Callback when entry mode is committed **/
  onCommit: (value: NumberUnitInterface<UnitFamily.Distance, Unit<UnitFamily.Distance>>) => void;
  /** If the field is hidden **/
  hidden?: MappedSubscribable<boolean>;
  /** The vertical flight phase for this block. */
  verticalPhase: Subscribable<VerticalFlightPhase>;
}

/** The AltitudeField component. */
export class AltitudeField extends LifecycleComponent<AltitudeFieldProps> implements IfdInteractionEventHandler {
  private static readonly MIN_ALTITUDE = 200;
  private static readonly MAX_ALTITUDE = 60000;

  private readonly workingValue = NumberUnitSubject.create(
    this.props.value.get().unit.createNumber(this.props.value.get().number)
  );
  private readonly fmsSettings = FmsUserSettings.getManager(this.props.bus);

  private readonly transAltOrLevelFeet = Subject.create(18000);
  private readonly transAltPipe = this.fmsSettings.getSetting('transitionAltitude').pipe(this.transAltOrLevelFeet, true);
  private readonly transLevelPipe = this.fmsSettings.getSetting('transitionLevel').pipe(this.transAltOrLevelFeet, true);

  private readonly showFL = MappedSubject.create(
    ([fplValue, workingValue, inEntryMode, trans]) => (inEntryMode ? workingValue : fplValue).asUnit(UnitType.FOOT) >= trans,
    this.props.value,
    this.workingValue,
    this.props.isInEntryMode,
    this.transAltOrLevelFeet,
  ).withLifecycle(this.defaultLifecycle);

  private readonly display = MappedSubject.create(
    ([value, isEntryMode, showFL]) => {
      const currentValue = isEntryMode ? this.workingValue.get() : value;

      if (currentValue.isNaN()) {
        return '';
      }

      const valueFeet = currentValue?.asUnit(UnitType.FOOT);

      if (showFL) {
        const flightLevel = Math.round(valueFeet / 100);
        return flightLevel.toString().padStart(3, '0');
      } else {
        return valueFeet.toFixed(0);
      }
    },
    this.props.value,
    this.props.isInEntryMode,
    this.showFL,
    this.workingValue
  ).withLifecycle(this.defaultLifecycle);

  private readonly isEntered = MappedSubject.create(
    ([isEntryMode, isSelected]): boolean => {
      return isEntryMode && isSelected;
    },
    this.props.isInEntryMode,
    this.props.isSelected
  );

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (!this.props.isSelected.get()) {
      return false;
    }

    if (this.props.isInEntryMode.get()) {
      return this.handleEntryModeEvent(event);
    } else {
      return this.handleNormalModeEvent(event);
    }
  }

  /**
   * Increment value
   * @param increment The increment in feet.
   */
  private incrementValue(increment: number): void {
    const current = this.workingValue.get().asUnit(UnitType.FOOT);
    this.workingValue.set(MathUtils.round(MathUtils.clamp(current + increment, AltitudeField.MIN_ALTITUDE, AltitudeField.MAX_ALTITUDE), 100), UnitType.FOOT);
  }

  /**
   * Sets the input value from the keyboard.
   * @param value The keyboard entry value.
   */
  public setKeyboardInputValue(value: string): void {
    const feet = MathUtils.round(parseFloat(value), 100);
    if (!isFinite(feet)) {
      return;
    }

    this.workingValue.set(MathUtils.clamp(feet, AltitudeField.MIN_ALTITUDE, AltitudeField.MAX_ALTITUDE), UnitType.FOOT);
    this.commitValue();
  }

  /**
   * Commit value
   */
  private commitValue(): void {
    this.props.onCommit(this.workingValue.get());
  }

  /**
   * Handles events when in entry mode
   * @param event IfdInteractionEvent
   * @returns true if the event was handled.
   */
  private handleEntryModeEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobOuterInc:
        this.incrementValue(1000);
        return true;
      case IfdInteractionEvent.RightKnobInnerInc:
        this.incrementValue(100);
        return true;

      case IfdInteractionEvent.RightKnobOuterDec:
        this.incrementValue(-1000);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        this.incrementValue(-100);
        return true;

      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        this.commitValue();
        this.props.isInEntryMode.set(false);
        return true;
    }
    return false;
  }

  /**
   * Handles events when the field is not in entry mode
   * @param event IfdInteractionEvent
   * @returns true if the event was handled.
   */
  private handleNormalModeEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        this.props.isInEntryMode.set(true);
        return true;
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

    this.props.isInEntryMode.sub(() => {
      if (!this.props.isInEntryMode.get()) {
        this.workingValue.set(this.props.value.get());
      }
    });

    this.props.verticalPhase.sub((v) => {
      if (v === VerticalFlightPhase.Climb) {
        this.transLevelPipe.pause();
        this.transAltPipe.resume(true);
      } else {
        this.transAltPipe.pause();
        this.transLevelPipe.resume(true);
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * @inheritDoc
   */
  public render(): VNode {
    return (
      <div
        ref={this.props.rootRef}
        class={{
          'leg-block-input-field': true,
          'leg-block-black-field': true,
          'leg-block-cyan-field': this.props.isSelected,
          'leg-block-white-field': this.isEntered,
          'hidden': this.props.hidden ?? Subject.create(false)
        }}
        style={this.props.style}
      >
        <span class="leg-block-unit-text">{this.showFL.map((v) => v ? 'FL' : '').withLifecycle(this.defaultLifecycle)}</span>
        {this.display}
        <span class="leg-block-unit-text">{this.showFL.map((v) => v ? '' : 'FT').withLifecycle(this.defaultLifecycle)}</span>
      </div>
    );
  }
}

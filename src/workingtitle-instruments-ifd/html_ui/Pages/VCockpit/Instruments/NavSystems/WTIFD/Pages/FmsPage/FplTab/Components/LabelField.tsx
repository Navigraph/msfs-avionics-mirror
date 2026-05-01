import { EventBus, FSComponent, LifecycleComponent, ComponentProps, MappedSubject, NodeReference, Subject, Subscribable, VNode, MutableSubscribable } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';

/** The properties for the {@link LabelField} component. */
interface LabelFieldProps extends ComponentProps {
  /** The subject value */
  value: MutableSubscribable<string>;
  /** Array of possible label values to cycle through */
  options: string[];
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
}

/** The LabelField component. */
export class LabelField extends LifecycleComponent<LabelFieldProps> {
  private readonly workingValue = Subject.create<string>(this.props.value.get());

  private readonly display = MappedSubject.create(
    ([value, isEntryMode]) => {
      return isEntryMode ? this.workingValue.get() : value;
    },
    this.props.value,
    this.props.isInEntryMode,
    this.workingValue
  );

  private readonly isEntered = MappedSubject.create(
    ([isEntryMode, isSelected]): boolean => {
      return isEntryMode && isSelected;
    },
    this.props.isInEntryMode,
    this.props.isSelected
  );

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
   * Commit value
   */
  private commitValue(): void {
    this.props.value.set(this.workingValue.get());
    this.props.onCommit(this.workingValue.get());
  }

  /**
   * Toggle value
   */
  private toggle(): void {
    const currentValue = this.workingValue.get();
    const currentIndex = this.props.options.indexOf(currentValue);
    const nextIndex = (currentIndex + 1) % this.props.options.length;
    const nextValue = this.props.options[nextIndex];

    this.workingValue.set(nextValue);
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
      case IfdInteractionEvent.RightKnobOuterDec:
      case IfdInteractionEvent.RightKnobInnerDec:
        this.toggle();
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
          'leg-block-white-field': this.isEntered,
        }}
      >
        {this.display}
      </div>
    );
  }
}

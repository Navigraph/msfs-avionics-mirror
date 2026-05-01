import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TouchButton } from '../../../../Components/TouchButton/TouchButton';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { EventTimerMode } from '../../../../Systems/Timer/EventTimer';
import { TimerBlock, TimerBlockProps } from './TimerBlock';
import { EventTimerListItemData } from './TimerListItem';

/** Props for the generic timer component. */
export interface EventTimerBlockProps extends TimerBlockProps {
  /** The timer to use. */
  readonly data: EventTimerListItemData;
}

enum EventTimerField {
  FromPowerOn,
  FromTakeoff,
  Reset,
}

/** The generic timer component. */
export class EventTimerBlock extends TimerBlock<EventTimerBlockProps> {
  private readonly timer = this.props.data.timer;

  private readonly valueText = this.timer.value.map((v) => TimerBlock.timeFormatter(v)).withLifecycle(this.defaultLifecycle);

  protected readonly minFieldIndex = EventTimerField.FromPowerOn;
  protected readonly maxFieldIndex = EventTimerField.Reset;


  /** @inheritdoc */
  protected renderTypeButtons(): VNode {
    return <>
      <TouchButton
        label="Pwr-On"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === EventTimerField.FromPowerOn).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(EventTimerField.FromPowerOn)}
        focusOnDrag={true}
        isHighlighted={this.timer.mode.map((v) => v === EventTimerMode.PowerOn).withLifecycle(this.defaultLifecycle)}
      />
      <TouchButton
        label="TakeOff"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === EventTimerField.FromTakeoff).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(EventTimerField.FromTakeoff)}
        focusOnDrag={true}
        isHighlighted={this.timer.mode.map((v) => v === EventTimerMode.Takeoff).withLifecycle(this.defaultLifecycle)}
      />
    </>;
  }

  /** @inheritdoc */
  protected renderState(): VNode {
    // TODO proper zulu or local time formatting
    return <>
      <div class='timer-value'>{this.valueText}</div>
      <TouchButton
        label="Reset"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === EventTimerField.Reset).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={this.onResetPressed.bind(this)}
        focusOnDrag={true}
      />
    </>;
  }

  /** @inheritdoc */
  protected onFieldAction(fieldIndex: number, action: IfdInteractionEvent.ENTR | IfdInteractionEvent.RightKnobPush | IfdInteractionEvent.CLR): boolean {
    switch (fieldIndex) {
      case EventTimerField.FromPowerOn:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onModePressed(EventTimerField.FromPowerOn);
          return true;
        }
        break;
      case EventTimerField.FromTakeoff:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onModePressed(EventTimerField.FromTakeoff);
          return true;
        }
        break;
      case EventTimerField.Reset:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onResetPressed();
          return true;
        }
    }

    return false;
  }

  /**
   * Handles presses on one of the mode buttons.
   * @param fieldIndex The field that triggered the event.
   */
  private onModePressed(fieldIndex: EventTimerField): void {
    this.selectedFieldIndex.set(fieldIndex);

    if (this.isSelected.get()) {
      this.timer.setMode(fieldIndex === EventTimerField.FromTakeoff ? EventTimerMode.Takeoff : EventTimerMode.PowerOn);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles presses on the reset button.
   */
  private onResetPressed(): void {
    this.selectedFieldIndex.set(EventTimerField.Reset);

    if (this.isSelected.get()) {
      this.timer.reset();
    } else {
      this.props.focus();
    }
  }
}

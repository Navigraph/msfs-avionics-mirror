import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TouchButton } from '../../../../Components/TouchButton/TouchButton';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { TripTimerMode } from '../../../../Systems/Timer/TripTimer';
import { TimerBlock, TimerBlockProps } from './TimerBlock';
import { TripTimerListItemData } from './TimerListItem';

/** Props for the generic timer component. */
export interface TripTimerBlockProps extends TimerBlockProps {
  /** The timer to use. */
  readonly data: TripTimerListItemData;
}

enum TripTimerField {
  FromPowerOn,
  FromTakeoff,
  Reset,
}

/** The generic timer component. */
export class TripTimerBlock extends TimerBlock<TripTimerBlockProps> {
  private readonly timer = this.props.data.timer;

  private readonly valueText = this.timer.value.map((v) => TimerBlock.timeFormatter(v)).withLifecycle(this.defaultLifecycle);

  protected readonly minFieldIndex = TripTimerField.FromPowerOn;
  protected readonly maxFieldIndex = TripTimerField.Reset;


  /** @inheritdoc */
  protected renderTypeButtons(): VNode {
    return <>
      <TouchButton
        label="From Pwr-On"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === TripTimerField.FromPowerOn).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(TripTimerField.FromPowerOn)}
        focusOnDrag={true}
        isHighlighted={this.timer.mode.map((v) => v === TripTimerMode.FromPowerOn).withLifecycle(this.defaultLifecycle)}
      />
      <TouchButton
        label="From TakeOff"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === TripTimerField.FromTakeoff).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(TripTimerField.FromTakeoff)}
        focusOnDrag={true}
        isHighlighted={this.timer.mode.map((v) => v === TripTimerMode.FromTakeoff).withLifecycle(this.defaultLifecycle)}
      />
    </>;
  }

  /** @inheritdoc */
  protected renderState(): VNode {
    return <>
      <div class='timer-value'>{this.valueText}</div>
      <TouchButton
        label="Reset"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === TripTimerField.Reset).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={this.onResetPressed.bind(this)}
        focusOnDrag={true}
      />
    </>;
  }

  /** @inheritdoc */
  protected onFieldAction(fieldIndex: number, action: IfdInteractionEvent.ENTR | IfdInteractionEvent.RightKnobPush | IfdInteractionEvent.CLR): boolean {
    switch (fieldIndex) {
      case TripTimerField.FromPowerOn:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onModePressed(TripTimerField.FromPowerOn);
          return true;
        }
        break;
      case TripTimerField.FromTakeoff:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onModePressed(TripTimerField.FromTakeoff);
          return true;
        }
        break;
      case TripTimerField.Reset:
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
  private onModePressed(fieldIndex: TripTimerField): void {
    this.selectedFieldIndex.set(fieldIndex);

    if (this.isSelected.get()) {
      this.timer.setMode(fieldIndex === TripTimerField.FromTakeoff ? TripTimerMode.FromTakeoff : TripTimerMode.FromPowerOn);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles presses on the reset button.
   */
  private onResetPressed(): void {
    this.selectedFieldIndex.set(TripTimerField.Reset);

    if (this.isSelected.get()) {
      this.timer.reset();
    } else {
      this.props.focus();
    }
  }
}

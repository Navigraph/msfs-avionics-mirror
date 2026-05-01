import { FlightTimerMode, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TouchButton } from '../../../../Components/TouchButton/TouchButton';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { KeyboardInputType } from '../../../../Keyboard/KeyboardTypes';
import { ParserUtils } from '../../../../Utilities/ParserUtils';
import { TimerBlock, TimerBlockProps } from './TimerBlock';
import { GenericTimerListItemData } from './TimerListItem';

/** Props for the generic timer component. */
export interface GenericTimerBlockProps extends TimerBlockProps {
  /** The timer to use. */
  readonly data: GenericTimerListItemData;
}

enum GenericTimerField {
  Up,
  Down,
  StartStop,
  Value,
  Reset,
}

/** The generic timer component. */
export class GenericTimerBlock extends TimerBlock<GenericTimerBlockProps> {
  private readonly timer = this.props.data.timer;

  private readonly valueText = this.timer.value.map((v) => TimerBlock.timeFormatter(v)).withLifecycle(this.defaultLifecycle);

  protected readonly minFieldIndex = GenericTimerField.Up;
  protected readonly maxFieldIndex = GenericTimerField.Reset;

  private isKeyboardOpen = false;

  /** @inheritdoc */
  protected renderTypeButtons(): VNode {
    return <>
      <TouchButton
        label="Up"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === GenericTimerField.Up).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(GenericTimerField.Up)}
        focusOnDrag={true}
        isHighlighted={this.timer.mode.map((v) => v === FlightTimerMode.CountingUp).withLifecycle(this.defaultLifecycle)}
      />
      <TouchButton
        label="Down"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === GenericTimerField.Down).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(GenericTimerField.Down)}
        focusOnDrag={true}
        isHighlighted={this.timer.mode.map((v) => v === FlightTimerMode.CountingDown).withLifecycle(this.defaultLifecycle)}
      />
    </>;
  }

  /** @inheritdoc */
  protected renderState(): VNode {
    return <>
      <TouchButton
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === GenericTimerField.StartStop).withLifecycle(this.defaultLifecycle),
        }}
        label={this.timer.isRunning.map((v) => v ? 'Stop' : 'Start').withLifecycle(this.defaultLifecycle)}
        onPressed={this.onStartStopPressed.bind(this)}
        focusOnDrag={true}
      />
      <TouchButton
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === GenericTimerField.Value).withLifecycle(this.defaultLifecycle),
          'timer-value': true,
        }}
        label={this.valueText}
        onPressed={this.onValuePressed.bind(this)}
        focusOnDrag={true}
        isVisible={this.timer.mode.map((v) => v === FlightTimerMode.CountingDown).withLifecycle(this.defaultLifecycle)}
      />
      <div class={{ 'timer-value': true, 'hidden': this.timer.mode.map((v) => v === FlightTimerMode.CountingDown).withLifecycle(this.defaultLifecycle) }}>{this.valueText}</div>
      <TouchButton
        label="Reset"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === GenericTimerField.Reset).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={this.onResetPressed.bind(this)}
        focusOnDrag={true}
      />
    </>;
  }

  /** @inheritdoc */
  protected override getNextSelectableField(direction: 1 | -1): number | undefined {
    let nextFieldIndex = super.getNextSelectableField(direction);

    // skip over the value field if it's not editable
    if (nextFieldIndex === GenericTimerField.Value && this.timer.mode.get() !== FlightTimerMode.CountingDown) {
      nextFieldIndex += direction;
    }

    return nextFieldIndex;
  }

  /** @inheritdoc */
  protected onFieldAction(fieldIndex: number, action: IfdInteractionEvent.ENTR | IfdInteractionEvent.RightKnobPush | IfdInteractionEvent.CLR): boolean {
    switch (fieldIndex) {
      case GenericTimerField.Up:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onModePressed(GenericTimerField.Up);
          return true;
        }
        break;
      case GenericTimerField.Down:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onModePressed(GenericTimerField.Down);
          return true;
        }
        break;
      case GenericTimerField.StartStop:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onStartStopPressed();
          return true;
        }
        break;
      case GenericTimerField.Value:
        if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
          this.onValuePressed();
        } else if (action === IfdInteractionEvent.CLR) {
          if (this.isKeyboardOpen) {
            this.props.closeKeyboard();
          }
        }
        return true;
      case GenericTimerField.Reset:
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
  private onModePressed(fieldIndex: GenericTimerField): void {
    this.selectedFieldIndex.set(fieldIndex);

    if (this.isSelected.get()) {
      this.timer.setMode(fieldIndex === GenericTimerField.Down ? FlightTimerMode.CountingDown : FlightTimerMode.CountingUp);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles presses on the start/stop button.
   */
  private onStartStopPressed(): void {
    this.selectedFieldIndex.set(GenericTimerField.StartStop);

    if (this.isSelected.get()) {
      this.timer.toggle();
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles presses on the count down timer value field.
   */
  private onValuePressed(): void {
    this.selectedFieldIndex.set(GenericTimerField.Value);

    if (this.isSelected.get()) {
      this.isKeyboardOpen = true;
      this.props.openKeyboard(this.valueText.get(), KeyboardInputType.HoursMinutesSeconds, this.onValueEntered, this.onKeyboardClosed);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles confirmed input from the keyboard.
   * @param value The keyboard entry.
   */
  private onValueEntered = (value: string): void => {
    const millis = ParserUtils.parseHoursMinutesSecondsToMillis(value);
    if (millis !== null) {
      this.props.data.timer.setValue(millis);
    }
  };

  /**
   * Handles presses on the reset button.
   */
  private onResetPressed(): void {
    this.selectedFieldIndex.set(GenericTimerField.Reset);

    if (this.isSelected.get()) {
      this.timer.reset();
    } else {
      this.props.focus();
    }
  }

  /** Handles closing of the keyboard. */
  private onKeyboardClosed = (): void => {
    this.isKeyboardOpen = false;
  };
}

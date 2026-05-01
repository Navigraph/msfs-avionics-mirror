import { EventBus, FSComponent, MathUtils, SubscribableMapFunctions, UnitType, VNode } from '@microsoft/msfs-sdk';

import { TouchButton, TouchButtonOnTouchedAction } from '../../../../Components/TouchButton/TouchButton';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { KeyboardInputType } from '../../../../Keyboard/KeyboardTypes';
import { TimeFormat, TimeUserSettings } from '../../../../Settings/TimeUserSettings';
import { CustomTimerMode } from '../../../../Systems/Timer/CustomTimer';
import { FormatUtils } from '../../../../Utilities/FormatUtils';
import { ParserUtils } from '../../../../Utilities/ParserUtils';
import { TimerBlock, TimerBlockProps } from './TimerBlock';
import { CustomTimerListItemData } from './TimerListItem';

import './CustomTimerBlock.css';

/** Props for the generic timer component. */
export interface CustomTimerBlockProps extends TimerBlockProps {
  /** The event bus to use. */
  readonly bus: EventBus;
  /** The timer to use. */
  readonly data: CustomTimerListItemData;
  /** A method that removes an item from the list. */
  readonly remove: (item: CustomTimerListItemData) => void;
}

enum CustomTimerField {
  Name,
  Event,
  OneTime,
  Periodic,
  TimePeriod,
  Date,
  Overdue,
}

/** The generic timer component. */
export class CustomTimerBlock extends TimerBlock<CustomTimerBlockProps> {
  private static readonly MIN_TO_MS = UnitType.MINUTE.convertTo(1, UnitType.MILLISECOND);
  private static readonly HR_TO_MS = UnitType.HOUR.convertTo(1, UnitType.MILLISECOND);
  private static readonly DAY_TO_MS = UnitType.HOUR.convertTo(24, UnitType.MILLISECOND);

  private static readonly dateCache = new Date();

  private readonly isNotOverdue = this.props.data.timer.isExpired.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle);

  private readonly timer = this.props.data.timer;

  private readonly dateText = FormatUtils.createDayMonthSubscribable(this.props.bus, this.timer.time).withLifecycle(this.defaultLifecycle);
  private readonly yearText = FormatUtils.createYearSubscribable(this.props.bus, this.timer.time).withLifecycle(this.defaultLifecycle);

  protected readonly minFieldIndex = CustomTimerField.Name;
  protected readonly maxFieldIndex = CustomTimerField.Overdue;

  private readonly timeValueText = FormatUtils.createTimeValueSubscribable(this.props.bus, this.timer.time).withLifecycle(this.defaultLifecycle);
  private readonly timeUnitText = FormatUtils.createTimeSuffixSubscribable(this.props.bus).withLifecycle(this.defaultLifecycle);

  /** In hours with 1 decimal. */
  private readonly periodValueText = this.timer.period.map((v) => (v / 3600_000).toFixed(1)).withLifecycle(this.defaultLifecycle);

  private readonly remainingValueText = this.timer.value.map((v) => (v / 3600_000).toFixed(1)).withLifecycle(this.defaultLifecycle);

  private readonly isEventMode = this.timer.mode.map((v) => v === CustomTimerMode.Event);
  private readonly isNotEventMode = this.timer.mode.map((v) => v !== CustomTimerMode.Event);

  private readonly timeFormat = TimeUserSettings.getManager(this.props.bus).getSetting('timeFormat');
  private readonly localOffset = TimeUserSettings.getManager(this.props.bus).getSetting('localTimeOffset');

  private isKeyboardOpen = false;

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.selectedFieldIndex.sub((v) => {
      if (v === CustomTimerField.Overdue && this.isNotOverdue.get()) {
        this.selectedFieldIndex.set(CustomTimerField.Overdue + 1);
      }
    });

    this.isNotOverdue.sub((v) => {
      if (!v && this.isSelected.get()) {
        this.selectedFieldIndex.set(CustomTimerField.Overdue);
      }
      if (!v && this.isKeyboardOpen) {
        this.props.closeKeyboard();
      }
    }, true);
  }

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (event === IfdInteractionEvent.CLR && this.isWholeBlockSelected.get()) {
      this.props.remove(this.props.data);
      return true;
    }

    return super.onInteractionEvent(event);
  }

  /** @inheritdoc */
  protected renderTypeButtons(): VNode {
    return <>
      <TouchButton
        label="Event"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.Event).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(CustomTimerField.Event)}
        focusOnDrag={true}
        isEnabled={this.isNotOverdue}
        isHighlighted={this.timer.mode.map((v) => v === CustomTimerMode.Event).withLifecycle(this.defaultLifecycle)}
      />
      <TouchButton
        label="One Time"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.OneTime).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(CustomTimerField.OneTime)}
        focusOnDrag={true}
        isEnabled={this.isNotOverdue}
        isHighlighted={this.timer.mode.map((v) => v === CustomTimerMode.OneTime).withLifecycle(this.defaultLifecycle)}
      />
      <TouchButton
        label="Periodic"
        class={{
          'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.Periodic).withLifecycle(this.defaultLifecycle),
        }}
        onPressed={() => this.onModePressed(CustomTimerField.Periodic)}
        focusOnDrag={true}
        isEnabled={this.isNotOverdue}
        isHighlighted={this.timer.mode.map((v) => v === CustomTimerMode.Periodic).withLifecycle(this.defaultLifecycle)}
      />
    </>;
  }

  /** @inheritdoc */
  protected override renderName(): VNode {
    return <TouchButton
      class={{
        'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.Name).withLifecycle(this.defaultLifecycle),
      }}
      label={this.props.data.timer.name}
      onPressed={this.onNamePressed.bind(this)}
      focusOnDrag={true}
      isEnabled={this.isNotOverdue}
    />;
  }

  /** @inheritdoc */
  protected renderState(): VNode {
    return <>
      <div class="custom-timer-state">
        <div class="label">Time</div>
        <div>
          <TouchButton
            class={{
              'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.TimePeriod).withLifecycle(this.defaultLifecycle),
              'timer-value': true,
            }}
            label={<span style='white-space: nowrap;'><span class="time-value">{this.timeValueText}</span>&nbsp;<span class="time-unit label">{this.timeUnitText}</span></span>}
            onPressed={this.onTimePressed.bind(this)}
            focusOnDrag={true}
            isEnabled={this.isNotOverdue}
            isVisible={this.isEventMode}
          />
          <TouchButton
            class={{
              'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.TimePeriod).withLifecycle(this.defaultLifecycle),
              'timer-value': true,
            }}
            label={<span style='white-space: nowrap;'><span class="time-value">{this.periodValueText}</span>&nbsp;<span class="time-unit label">Flt-Hrs</span></span>}
            onPressed={this.onPeriodPressed.bind(this)}
            focusOnDrag={true}
            isEnabled={this.isNotOverdue}
            isVisible={this.isNotEventMode}
          />
        </div>
        <div class={{ 'label': true, 'hidden': this.isNotEventMode }}>Date</div>
        <TouchButton
          class={{
            'disabled': this.isNotOverdue,
            'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.Date).withLifecycle(this.defaultLifecycle),
            'timer-value': true,
          }}
          label={<span style='white-space: nowrap;'><span>{this.dateText}</span>&nbsp;<span class="small">{this.yearText}</span></span>}
          onPressed={this.onDatePressed.bind(this)}
          focusOnDrag={true}
          isEnabled={this.isNotOverdue}
          isVisible={this.isEventMode}
        />
        <div class={{ 'label': true, 'hidden': this.isEventMode }}>Rem</div>
        <div class={{ 'timer-value': true, 'hidden': this.isEventMode }}>
          <span style='white-space: nowrap;'>
            <span class="time-value">{this.remainingValueText}</span>
            <span class="time-unit label">Hours</span>
          </span>
        </div>
      </div>
      <TouchButton
        class={{
          'custom-timer-overdue-button': true,
          'selected': this.selectedFieldIndex.map((v) => v === CustomTimerField.Overdue).withLifecycle(this.defaultLifecycle),
        }}
        label={'Overdue'}
        onTouched={() => {
          this.selectedFieldIndex.set(CustomTimerField.Overdue);
          return TouchButtonOnTouchedAction.Prime;
        }}
        onPressed={() => this.props.data.timer.resetExpiry()}
        focusOnDrag={true}
        isVisible={this.props.data.timer.isExpired}
      />
    </>;
  }

  /** @inheritdoc */
  protected override getNextSelectableField(direction: 1 | -1): number | undefined {
    let nextFieldIndex = super.getNextSelectableField(direction);

    if (this.isNotOverdue.get()) {
      // skip over the date field if it's not editable
      if (nextFieldIndex === CustomTimerField.Date && this.timer.mode.get() !== CustomTimerMode.Event) {
        nextFieldIndex = direction === 1 ? undefined : nextFieldIndex - 1;
      }

      if (nextFieldIndex === CustomTimerField.Overdue) {
        nextFieldIndex = direction === 1 ? undefined : nextFieldIndex - (this.timer.mode.get() !== CustomTimerMode.Event ? 2 : 1);
      }
    } else if (nextFieldIndex !== CustomTimerField.Overdue && nextFieldIndex !== undefined) {
      if (direction < 0) {
        nextFieldIndex = undefined;
      } else {
        nextFieldIndex = CustomTimerField.Overdue;
      }
    }

    return nextFieldIndex;
  }

  /** @inheritdoc */
  protected onFieldAction(fieldIndex: number, action: IfdInteractionEvent.ENTR | IfdInteractionEvent.RightKnobPush | IfdInteractionEvent.CLR): boolean {
    if (action === IfdInteractionEvent.CLR && this.isKeyboardOpen) {
      this.props.closeKeyboard();
      return true;
    }

    if (this.isNotOverdue.get()) {
      switch (fieldIndex) {
        case CustomTimerField.Name:
          if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
            this.onNamePressed();
          }
          return true;
        case CustomTimerField.Event:
          if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
            this.onModePressed(CustomTimerField.Event);
            return true;
          }
          break;
        case CustomTimerField.OneTime:
          if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
            this.onModePressed(CustomTimerField.OneTime);
            return true;
          }
          break;
        case CustomTimerField.Periodic:
          if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
            this.onModePressed(CustomTimerField.Periodic);
            return true;
          }
          break;
        case CustomTimerField.TimePeriod:
          if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
            this.onTimePressed();
          }
          return true;
        case CustomTimerField.Date:
          if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
            this.onDatePressed();
          }
          return true;
      }
    } else if (action === IfdInteractionEvent.ENTR || action === IfdInteractionEvent.RightKnobPush) {
      this.timer.resetExpiry();
    }

    return false;
  }

  /**
   * Handles presses on the time field.
   */
  private onNamePressed(): void {
    this.selectedFieldIndex.set(CustomTimerField.Name);

    if (this.isSelected.get()) {
      this.props.openKeyboard(this.timer.name.get(), KeyboardInputType.FreeText, this.onNameEntered, this.onKeyboardClosed);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles confirmed input from the keyboard.
   * @param value The keyboard entry.
   */
  private onNameEntered = (value: string): void => {
    this.props.data.timer.setName(value);
  };

  /**
   * Handles presses on one of the mode buttons.
   * @param fieldIndex The field that triggered the event.
   */
  private onModePressed(fieldIndex: CustomTimerField): void {
    this.selectedFieldIndex.set(fieldIndex);

    if (this.isSelected.get()) {
      switch (fieldIndex) {
        case CustomTimerField.Event:
          this.timer.setMode(CustomTimerMode.Event);
          break;
        case CustomTimerField.OneTime:
          this.timer.setMode(CustomTimerMode.OneTime);
          break;
        case CustomTimerField.Periodic:
          this.timer.setMode(CustomTimerMode.Periodic);
          break;
      }
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles presses on the time field.
   */
  private onTimePressed(): void {
    this.selectedFieldIndex.set(CustomTimerField.TimePeriod);

    if (this.isSelected.get()) {
      this.isKeyboardOpen = true;
      this.props.openKeyboard(this.timeValueText.get(), KeyboardInputType.TimeOfDay, this.onTimeEntered, this.onKeyboardClosed);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles confirmed input from the keyboard.
   * @param value The keyboard entry.
   */
  private onTimeEntered = (value: string): void => {
    const timeFormat = this.timeFormat.get();
    const timeOfDayMillis = timeFormat === TimeFormat.H12 ? ParserUtils.parseH12ToMillis(value) : ParserUtils.parseH24ToMillis(value);
    const offset = timeFormat === TimeFormat.UTC ? 0 : this.localOffset.get() * CustomTimerBlock.MIN_TO_MS;

    if (timeOfDayMillis !== null) {
      const startOfLocalDayUtc = Math.trunc((this.timer.time.get() + offset) / CustomTimerBlock.DAY_TO_MS) * CustomTimerBlock.DAY_TO_MS - offset;
      const utcTimestamp = startOfLocalDayUtc + timeOfDayMillis;
      this.props.data.timer.setTime(utcTimestamp);
    }
  };

  /**
   * Handles presses on the event timer date field.
   */
  private onDatePressed(): void {
    this.selectedFieldIndex.set(CustomTimerField.Date);

    if (this.isSelected.get()) {
      this.props.openKeyboard(`${this.dateText.get()} ${this.yearText.get()}`, KeyboardInputType.Date, this.onDateEntered, this.onKeyboardClosed);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles confirmed input from the keyboard.
   * @param value The keyboard entry.
   */
  private onDateEntered = (value: string): void => {
    const [day, month, year] = value.split(' ');

    const timeFormat = this.timeFormat.get();
    const offset = timeFormat === TimeFormat.UTC ? 0 : this.localOffset.get() * CustomTimerBlock.MIN_TO_MS;

    const startOfLocalDayUtc = Math.trunc((this.timer.time.get() + offset) / CustomTimerBlock.DAY_TO_MS) * CustomTimerBlock.DAY_TO_MS - offset;
    const timeOfDayMillis = this.timer.time.get() - startOfLocalDayUtc;

    CustomTimerBlock.dateCache.setUTCHours(0, 0, 0, 0);
    const timestamp = CustomTimerBlock.dateCache.setUTCFullYear(parseInt(year), FormatUtils.MONTHS.indexOf(month), parseInt(day)) - offset + timeOfDayMillis;

    this.props.data.timer.setTime(timestamp);
  };

  /**
   * Handles presses on the period field.
   */
  private onPeriodPressed(): void {
    this.selectedFieldIndex.set(CustomTimerField.TimePeriod);

    if (this.isSelected.get()) {
      this.props.openKeyboard(this.periodValueText.get(), KeyboardInputType.HoursDecimal, this.onPeriodEntered, this.onKeyboardClosed);
    } else {
      this.props.focus();
    }
  }

  /**
   * Handles confirmed input from the keyboard.
   * @param value The keyboard entry.
   */
  private onPeriodEntered = (value: string): void => {
    const ms = MathUtils.round(parseFloat(value) || 0, 0.1) * CustomTimerBlock.HR_TO_MS;
    this.props.data.timer.setPeriod(ms);
  };

  /** Handles closing of the keyboard. */
  private onKeyboardClosed = (): void => {
    this.isKeyboardOpen = false;
  };
}

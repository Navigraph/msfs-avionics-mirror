import { ArraySubject, ComponentProps, EventBus, FSComponent, LifecycleComponent, ResourceHeap, VNode, Wait } from '@microsoft/msfs-sdk';

import { IfdList } from '../../../../Components/List';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdOptions } from '../../../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../../Keyboard/KeyboardTypes';
import { IfdInteractionEventHandler, RightKnobState } from '../../../../RightKnob';
import { TimerManager } from '../../../../Systems/Timer/TimerManager';
import { CustomTimerBlock } from './CustomTimerBlock';
import { EventTimerBlock } from './EventTimerBlock';
import { GenericTimerBlock } from './GenericTimerBlock';
import { TimerListCursor } from './TimerListCursor';
import { CustomTimerListItemData, IfdAuxTimerType, TimerListItemData } from './TimerListItem';
import { TripTimerBlock } from './TripTimerBlock';

import './IfdAuxTimers.css';

/** The properties for the {@link IfdAuxTimers} component. */
interface IfdAuxTimersProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The timer manager to use. */
  readonly timerManager: TimerManager;
  /** The IfdInstrumentConfig */
  readonly ifdOptions: IfdOptions;
  /** The right knob state. */
  readonly knobState: RightKnobState;
}

/** The IfdAuxTimers component. */
export class IfdAuxTimers extends LifecycleComponent<IfdAuxTimersProps> implements IfdInteractionEventHandler {
  public readonly title: string = 'UTIL';

  private readonly listItemSpacingPx = 5; // pixels

  private readonly ref = FSComponent.createRef<HTMLDivElement>();
  private readonly listRef = FSComponent.createRef<IfdList<TimerListItemData>>();

  private readonly keyboardPublisher = this.props.bus.getPublisher<IfdKeyboardControlEvents>();

  private readonly timerBlockList = ArraySubject.create<TimerListItemData>([
    {
      type: IfdAuxTimerType.Generic,
      label: 'Generic\nTimer',
      heightPx: 130,
      timer: this.props.timerManager.genericTimer,
    },
    {
      type: IfdAuxTimerType.Trip,
      label: 'Trip\nTimer',
      heightPx: 130,
      timer: this.props.timerManager.tripTimer,
    },
    {
      type: IfdAuxTimerType.Event,
      label: 'Event\nTimes',
      heightPx: 130,
      timer: this.props.timerManager.eventTimer,
    },
  ]);

  private readonly fixedTimerCount = this.timerBlockList.length;
  private readonly customTimerCount = 10;
  private readonly maxTimers = this.fixedTimerCount + this.customTimerCount;

  private customTimerIndex = 0;
  private readonly customTimers = new ResourceHeap<CustomTimerListItemData>(
    () => ({
      type: IfdAuxTimerType.Custom,
      label: 'Custom',
      heightPx: 130,
      timer: this.props.timerManager.customTimers[this.customTimerIndex++],
    }),
    () => { },
    undefined,
    (item) => item.timer.clear(),
  );

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const list = this.listRef.getOrDefault();
    if (!list) {
      return false;
    }

    if (list.spaceAfterItemSelected.get()) {
      if (event === IfdInteractionEvent.ENTR) {
        this.addCustomTimer();
        return true;
      } else if (event === IfdInteractionEvent.CLR) {
        return true; // throw away CLR
      }
    }

    return list.onInteractionEvent(event) ?? false;
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // restore saved timers from previous session
    for (let i = 0; i < this.customTimerCount; i++) {
      const item = this.customTimers.allocate();

      if (item.timer.isEnabled.get()) {
        this.timerBlockList.insert(item);
      } else {
        this.customTimers.free(item);
      }
    }
  }

  /**
   * Opens the shared IFD text keyboard.
   * Uses the existing "text_edit_row_keyboard_open" event. We buffer value in
   * onValueChanged and commit on close (Enter).
   *
   * @param smartPrefill Initial value.
   * @param keyboardInputType The input type to be accepted.
   * @param onEnter Called with final value after Enter.
   * @param onClose Called when the keyboard is closed.
   * @param anchorEl - Optional element for anchor purposes (passed through as rowRef).
   */
  private openKeyboard = (
    smartPrefill: string,
    keyboardInputType: KeyboardInputType,
    onEnter: (value: string) => void,
    onClose: () => void,
    anchorEl?: HTMLElement
  ): void => {
    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType,
      disableModeSwitch: true,
      initialShowNumpad: keyboardInputType !== KeyboardInputType.FreeText,
      initialValue: smartPrefill,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      disableFacilitySearch: true,
      onEnter,
      onClose,
      rowRef: anchorEl ?? null
    };

    this.keyboardPublisher.pub('text_edit_row_keyboard_open', payload, false, false);
  };

  private closeKeyboard = (): void => {
    this.keyboardPublisher.pub('keyboard_close', undefined, false, false);
  };

  /**
   * Renders a timer item.
   * @param item The timer item to render.
   * @param index The timer item index
   * @param focus A function which focuses the timer item.
   * @returns The rendered timer item.
   */
  private readonly renderItem = (item: TimerListItemData, index: number, focus: () => void): VNode => {
    switch (item.type) {
      case IfdAuxTimerType.Generic:
        return (
          <GenericTimerBlock
            data={item}
            focus={focus}
            openKeyboard={this.openKeyboard}
            closeKeyboard={this.closeKeyboard}
          />
        );
      case IfdAuxTimerType.Trip:
        return (
          <TripTimerBlock
            data={item}
            focus={focus}
            openKeyboard={this.openKeyboard}
            closeKeyboard={this.closeKeyboard}
          />
        );
      case IfdAuxTimerType.Event:
        return (
          <EventTimerBlock
            data={item}
            focus={focus}
            openKeyboard={this.openKeyboard}
            closeKeyboard={this.closeKeyboard}
          />
        );
      case IfdAuxTimerType.Custom:
        return (
          <CustomTimerBlock
            bus={this.props.bus}
            data={item}
            focus={focus}
            remove={this.removeCustomTimer}
            openKeyboard={this.openKeyboard}
            closeKeyboard={this.closeKeyboard}
          />
        );
    }
  };

  /**
   * Handles clicks on the cursor at the end of the list.
   * @param data The item associated with the cursor that was pressed.
   */
  private onCursorPressed(data: TimerListItemData): void {
    if (this.listRef.instance.activeItem.get() === data && this.listRef.instance.spaceAfterItemSelected.get()) {
      this.addCustomTimer();
    } else {
      this.listRef.instance.focusItem(data, undefined, true);
    }
  }

  /** Adds a new custom timer. */
  private addCustomTimer(): void {
    if (this.timerBlockList.length < this.maxTimers) {
      const item = this.customTimers.allocate();
      item.timer.setDefault();
      this.timerBlockList.insert(item);
      Wait.awaitFrames(0).then(() => {
        this.listRef.getOrDefault()?.scrollToItem(item, 'top', false, true);
        this.listRef.getOrDefault()?.focusItem(item);
      });
    }
  }

  /**
   * Removes a custom timer.
   * @param item The timer to remove.
   */
  private removeCustomTimer = (item: CustomTimerListItemData): void => {
    this.timerBlockList.removeItem(item);
    this.customTimers.free(item);
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="wt-ifd-aux-timers-container" ref={this.ref}>
        <IfdList
          ref={this.listRef}
          class="wt-ifd-aux-timer-list"
          bus={this.props.bus}
          knobState={this.props.knobState}
          heightPx={405}
          maxOverscrollPx={5}
          listItemSpacingPx={this.listItemSpacingPx}
          keepSpaceBeforeFirstItem={true}
          keepSpaceAfterLastItem={true}
          maxRenderedItemCount={this.maxTimers}
          data={this.timerBlockList}
          renderItem={this.renderItem}
          canSelectSpace={(a, b) => a !== undefined && b === undefined && this.timerBlockList.length < this.maxTimers}
          renderSpace={(data, cursor) => <TimerListCursor onPressed={this.onCursorPressed.bind(this)} data={data} cursor={cursor} listItems={this.timerBlockList} />}
        />
      </div>
    );
  }
}

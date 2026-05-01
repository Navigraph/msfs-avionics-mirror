import {
  ComponentProps, EventBus, FSComponent, NodeReference, Subject, Subscribable, SubscribableSet, Subscription, ToggleableClassNameRecord, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { TimeUserSettings } from '../../../../../Settings/TimeUserSettings';
import { CharInput, CharInputSlot } from '../CharInput';
import { AbstractField } from './AbstractField';

/** The properties for the {@link LocalTimeOffsetField} component. */
interface LocalTimeOffsetFieldProps extends ComponentProps {
  /** Instance of event bus */
  readonly bus: EventBus;
  /** CSS classes to be added on the root element. */
  readonly class?: string | Subscribable<string> | SubscribableSet<string> | ToggleableClassNameRecord;
}

/**
 * An entry for a single character input slot.
 */
type CharInputSlotEntry = {
  /** A reference to the input slot. */
  ref: NodeReference<CharInputSlot>;

  /** The input slot's default character value. */
  defaultCharValue: Subject<string>;

  /** The character array for this slot. */
  charArray: string[];
};

/**
 * A field for editing local time offset values in the format "+ HH:MM" or "- HH:MM"
 */
export class LocalTimeOffsetField extends AbstractField<string, LocalTimeOffsetFieldProps> {
  /** @inheritdoc */
  public readonly inputText = Subject.create<string>('');

  /** @inheritdoc */
  public readonly value = Subject.create<string>('');

  /** @inheritdoc */
  public readonly inputRef = FSComponent.createRef<CharInput>();

  private readonly divRef = FSComponent.createRef<HTMLDivElement>();
  private keyboardState = VirtualKeyboardState.getInstance();
  private temporaryValueMinutes = 0;
  private readonly settingManager = TimeUserSettings.getManager(this.props.bus);
  private readonly subscriptions: Subscription[] = [];

  private readonly inputSlotEntries: CharInputSlotEntry[] = [
    // Slot 0: +/- sign
    {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create(''),
      charArray: ['+', '-']
    },
    // Slot 1: Space (static)
    {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create(' '),
      charArray: [' ']
    },
    // Slot 2: First hour digit (0-2)
    {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create(''),
      charArray: ['0', '1']
    },
    // Slot 3: Second hour digit (0-9)
    {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create(''),
      charArray: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    },
    // Slot 4: Colon (static)
    {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create(':'),
      charArray: [':']
    },
    // Slot 5: First minute digit (0-5)
    {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create(''),
      charArray: ['0', '1', '2', '3', '4', '5']
    },
    // Slot 6: Second minute digit (0-9)
    {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create(''),
      charArray: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    }
  ];

  /**
   * Parses string to minutes offset
   * @param str The string like "+ 00:00" or "- 12:30"
   * @returns The offset in minutes
   */
  private parseStringToMinutes(str: string): number {
    if (str.length < 7) {
      return 0;
    }
    const sign = str[0] === '-' ? -1 : 1;
    const timeStr = str.substring(2); // Skip sign and space
    const [hours, minutes] = timeStr.split(':').map(s => parseInt(s) || 0);
    return sign * (hours * 60 + minutes);
  }

  /** @inheritdoc */
  public onKeyPressed(value: string): void {
    this.setCharacterAtCursor(value);
  }

  /** @inheritdoc */
  public onBackspacePressed(): void {
    this.inputRef.instance.backspace();
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (!this.keyboardState.isEditingActive.get()) {
      return false;
    }

    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        this.inputRef.instance.activateEditing(true);
        return true;

      case IfdInteractionEvent.RightKnobOuterInc:
        this.moveCursorSkippingStatic(1);
        return true;

      case IfdInteractionEvent.RightKnobOuterDec:
        this.moveCursorSkippingStatic(-1);
        return true;

      case IfdInteractionEvent.RightKnobInnerDec:
        this.inputRef.instance.changeSlotValue(-1, false);
        return true;

      case IfdInteractionEvent.RightKnobInnerInc:
        this.inputRef.instance.changeSlotValue(1, false);
        return true;

      default:
        return false;
    }
  }

  /**
   * Moves the cursor in the specified direction, skipping over static slots
   * @param direction The direction to move (1 = right, -1 = left)
   */
  private moveCursorSkippingStatic(direction: 1 | -1): void {
    const currentPos = this.inputRef.instance.cursorPosition.get();
    let nextPos = currentPos + direction;

    // Skip static slots (1 = space, 4 = colon)
    while (nextPos >= 0 && nextPos < this.inputSlotEntries.length &&
      (nextPos === 1 || nextPos === 4)) {
      nextPos += direction;
    }

    // Clamp to valid range
    if (nextPos >= 0 && nextPos < this.inputSlotEntries.length) {
      this.inputRef.instance.placeCursor(nextPos, true);
      this.syncCursorToKeyboardState();
    }
  }

  /**
   * Syncs the cursor position to keyboard state
   */
  private syncCursorToKeyboardState(): void {
    const cursorPos = this.inputRef.instance.cursorPosition.get();
    this.keyboardState.setCaret(cursorPos);
  }

  /** @inheritdoc */
  public activateEditing(): void {
    this.keyboardState.setEditingActive(true);

    const currentValue = this.inputText.get() ?? '';
    this.inputRef.instance.setValue(currentValue);

    this.inputRef.instance.activateEditing(true);
    // Start at position 0 (the +/- sign)
    this.inputRef.instance.placeCursor(0, false);
  }

  /** @inheritdoc */
  public setCharacterAtCursor(char: string): void {
    if (!this.inputRef.instance.getIsEditingActive().get()) {
      this.inputRef.instance.activateEditing(false);
      this.inputRef.instance.placeCursor(0, false);
    }

    const cursorPos = this.inputRef.instance.cursorPosition.get();

    // Don't allow setting characters on static slots
    if (cursorPos === 1 || cursorPos === 4) {
      return;
    }

    // Validate the character is allowed for this slot
    const slotEntry = this.inputSlotEntries[cursorPos];
    if (slotEntry && !slotEntry.charArray.includes(char)) {
      // Invalid character for this slot
      return;
    }

    this.inputRef.instance.setSlotCharacterValue(char);

    // After setting a character, move to the next non-static slot
    const newCursorPos = this.inputRef.instance.cursorPosition.get();

    // If we're now on a static slot, skip it
    if (newCursorPos === 1 || newCursorPos === 4) {
      this.moveCursorSkippingStatic(1);
    }

    const newValue = this.inputText.get();
    if (newValue.length >= 7) {
      this.temporaryValueMinutes = this.parseStringToMinutes(newValue);
    }

    this.keyboardState.setInputDirect(newValue);
    const finalCursor = this.inputRef.instance.cursorPosition.get();
    this.keyboardState.setCaret(finalCursor);
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subscriptions.push(
      this.inputText.sub((value) => {
        // Update temporary value as user types
        if (value.length >= 7) {
          this.temporaryValueMinutes = this.parseStringToMinutes(value);
        }
      })
    );

    this.subscriptions.push(
      this.inputRef.instance.cursorPosition.sub((pos) => {
        this.keyboardState.setCaret(pos);
      })
    );
  }

  /** @inheritdoc */
  public getValue(): string {
    return this.inputText.get();
  }

  /** @inheritdoc */
  public onEnterPressed(): string {
    const currentValue = this.inputText.get();

    if (isFinite(this.temporaryValueMinutes) && this.settingManager) {
      this.settingManager.getSetting('localTimeOffset').set(this.temporaryValueMinutes);
    }

    return currentValue;
  }

  /** @inheritdoc */
  public onRequest(input: string): void {
    // Input is a string in format "+ 01:00" or "- 05:30"
    this.inputText.set(input);
    this.inputRef.instance.setValue(input);
    this.inputRef.instance.populateCharsFromValue();
    if (input.length >= 7) {
      this.temporaryValueMinutes = this.parseStringToMinutes(input);
    }

    this.activateEditing();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={this.props.class}
        ref={this.divRef}
      >
        <CharInput
          ref={this.inputRef}
          value={this.inputText}
          class='wpt-textfield-input'
        >
          {this.inputSlotEntries.map((entry, index) => {
            return (
              <CharInputSlot
                ref={entry.ref}
                defaultCharValue={entry.defaultCharValue}
                charArray={entry.charArray}
                wrap
                class={{
                  'wpt-textfield-input-slot-static': index === 1 || index === 4,
                }}
              />
            );
          })}
        </CharInput>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.subscriptions.forEach(sub => sub.destroy());

    super.destroy();
  }
}

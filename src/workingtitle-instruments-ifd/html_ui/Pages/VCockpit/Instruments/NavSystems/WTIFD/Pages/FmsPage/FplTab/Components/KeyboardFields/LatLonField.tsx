import { ComponentProps, EventBus, FSComponent, NodeReference, Subject, VNode } from '@microsoft/msfs-sdk';

import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { CharInput, CharInputSlot } from '../CharInput';
import { AbstractField } from './AbstractField';

/**
 * Props for LatLonField
 */
interface LatLonFieldProps extends ComponentProps {
  /** Event bus for the component */
  bus: EventBus;
}

/**
 * A lat/lon keyboard field implementation which drives the virtual keyboard scratchpad.
 */
export class LatLonField extends AbstractField<string, LatLonFieldProps> {
  public readonly inputText = Subject.create<string>('');
  public readonly inputRef: NodeReference<CharInput> = FSComponent.createRef<CharInput>();
  public readonly value = Subject.create<string>('');

  /** Full template with all characters including static symbols. */
  private static readonly FULL_TEMPLATE = 'N00°00\'00" W000°00\'00"';

  /** Just the editable characters in order: N/S, lat digits, E/W, lon digits. */
  private static readonly EDITABLE_TEMPLATE = 'N000000W0000000';

  private readonly keyboardState = VirtualKeyboardState.getInstance();

  /** Current caret position within the editable string (0-14). */
  private editableCaret = 0;

  /** Guards against feedback loops when mirroring keyboardState.input. */
  private isUpdatingFromKeyboardState = false;

  /**
   * Converts an editable string (15 chars) to the full template format (22 chars).
   * @param editable The editable string (e.g., "N480721W0163201")
   * @returns The full formatted string (e.g., "N48°07'21\" W016°32'01\"")
   */
  private editableToFull(editable: string): string {
    if (editable.length !== 15) {
      editable = LatLonField.EDITABLE_TEMPLATE;
    }

    const padded = editable.split('').map((char, idx) => {
      // Skip positions 0 and 7 (N/S and E/W)
      if (idx === 0 || idx === 7) {
        return char;
      }
      return char >= '0' && char <= '9' ? char : '0';
    }).join('');

    return (
      padded[0] +              // N/S
      padded.slice(1, 3) +     // lat degrees (2 digits)
      '°' +
      padded.slice(3, 5) +     // lat minutes (2 digits)
      '\'' +
      padded.slice(5, 7) +     // lat seconds (2 digits)
      '" ' +
      padded[7] +              // E/W
      padded.slice(8, 11) +    // lon degrees (3 digits)
      '°' +
      padded.slice(11, 13) +   // lon minutes (2 digits)
      '\'' +
      padded.slice(13, 15) +   // lon seconds (2 digits)
      '"'
    );
  }

  /**
   * Converts a full template format string (22 chars) to editable format (15 chars).
   * @param full The full formatted string
   * @returns The editable string with only editable characters
   */
  private fullToEditable(full: string): string {
    if (full.length !== 22) {
      return LatLonField.EDITABLE_TEMPLATE;
    }

    // Extract only the editable characters from the full format
    // Full format: N48°07'21" W016°32'01"
    // Editable:    N480721W0163201 (15 chars)

    return (
      full[0] +            // N/S (pos 0)
      full.slice(1, 3) +   // lat degrees (pos 1-2)
      full.slice(4, 6) +   // lat minutes (pos 4-5)
      full.slice(7, 9) +   // lat seconds (pos 7-8)
      full[11] +           // E/W (pos 11)
      full.slice(12, 15) + // lon degrees (pos 12-14)
      full.slice(16, 18) + // lon minutes (pos 16-17)
      full.slice(19, 21)   // lon seconds (pos 19-20)
    );
  }

  /**
   * Returns the current editable string from keyboard state or inputText.
   * @returns The current editable string (15 chars)
   */
  private getCurrentEditableValue(): string {
    const raw = this.inputText.get() || '';
    return raw.length === 15 ? raw : LatLonField.EDITABLE_TEMPLATE;
  }

  /**
   * Commit a new editable string and caret to keyboard state and local subjects.
   * @param newEditableValue The new editable string (15 chars)
   * @param newCaret The new caret position (0-14)
   */
  private commitValue(newEditableValue: string, newCaret: number): void {
    const clampedValue =
      newEditableValue.length === 15
        ? newEditableValue
        : LatLonField.EDITABLE_TEMPLATE;

    this.editableCaret = Math.max(0, Math.min(newCaret, 14));

    const fullValue = this.editableToFull(clampedValue);

    const charInput = this.inputRef.getOrDefault();
    if (charInput) {
      charInput.setValue(clampedValue);
    }

    this.isUpdatingFromKeyboardState = true;
    this.keyboardState.setInput(fullValue);
    this.isUpdatingFromKeyboardState = false;

    this.value.set(fullValue);
    this.inputText.set(clampedValue);

    this.keyboardState.setCaret(this.editableCaret);
  }

  /** @inheritdoc */
  public onBackspacePressed(): void {
    const chars = this.getCurrentEditableValue().split('');

    // Move one position backward.
    if (this.editableCaret > 0) {
      this.editableCaret--;
    }

    // Reset this position to template's character.
    chars[this.editableCaret] = LatLonField.EDITABLE_TEMPLATE[this.editableCaret];

    const formatted = chars.join('');
    this.commitValue(formatted, this.editableCaret);
  }

  /** @inheritdoc */
  public onEnterPressed(): string {
    return this.value.get();
  }

  /** @inheritdoc */
  public getValue(): string {
    return this.value.get();
  }

  /**
   * Initial request hook; host provides initial full formatted string (or empty).
   * @param input The initial full formatted string (or empty)
   */
  public onRequest(input: string): void {
    let initial = input;

    if (!initial || initial.length !== 22) {
      initial = LatLonField.FULL_TEMPLATE;
    }

    const editableInitial = this.fullToEditable(initial);

    this.editableCaret = 0;

    this.value.set(initial);
    this.inputText.set(editableInitial);
    this.keyboardState.setInput(initial);
    this.inputRef.getOrDefault()?.setValue(editableInitial);
  }

  /** @inheritdoc */
  public activateEditing(): void {
    this.keyboardState.setEditingActive(true);

    const currentEditable = this.inputText.get() || LatLonField.EDITABLE_TEMPLATE;
    const currentFull = this.value.get() || LatLonField.FULL_TEMPLATE;

    this.isUpdatingFromKeyboardState = true;
    this.keyboardState.setInput(currentFull);
    this.isUpdatingFromKeyboardState = false;

    const charInput = this.inputRef.getOrDefault();
    if (charInput) {
      charInput.setValue(currentEditable);
      charInput.activateEditing(true);
    }

    this.editableCaret = 0;
    this.keyboardState.setCaret(this.editableCaret);
  }

  /** @inheritdoc */
  public onKeyPressed(value: string): void {
    if (!value || value.length === 0) {
      return;
    }

    const ch = value[value.length - 1];
    const chars = this.getCurrentEditableValue().split('');

    const clamped = this.clampCharForCurrentPosition(ch, chars);
    if (clamped === null) {
      return;
    }

    chars[this.editableCaret] = clamped;

    let nextCaret = this.editableCaret;
    if (nextCaret < 14) {
      nextCaret++;
    }

    const formatted = chars.join('');
    this.commitValue(formatted, nextCaret);
  }

  /** @inheritdoc */
  public onInteractionEvent(): boolean {
    // No knob behavior directly here; host (WaypointDialog) handles knob events.
    return false;
  }

  /**
   * Per-position validation with DMS (degrees-minutes-seconds) constraints
   * @param ch The character to validate
   * @param currentChars The current editable characters
   * @returns The clamped character, or null if invalid
   */
  private clampCharForCurrentPosition(ch: string, currentChars: string[]): string | null {
    const up = ch.toUpperCase();
    const pos = this.editableCaret;

    // N/S position
    if (pos === 0) {
      return (up === 'N' || up === 'S') ? up : null;
    }

    // E/W position
    if (pos === 7) {
      return (up === 'E' || up === 'W') ? up : null;
    }

    // All other positions must be digits
    if (up < '0' || up > '9') {
      return null;
    }

    // Latitude degrees (00-90)
    if (pos === 1) {
      // First digit can be 0-9
      return up;
    }
    if (pos === 2) {
      // Second digit: if first is 9, only 0 allowed; otherwise 0-9
      const firstDigit = currentChars[1];
      if (firstDigit === '9') {
        return up === '0' ? up : null;
      }
      return up;
    }

    // Latitude minutes (00-59)
    if (pos === 3) {
      // First digit can be 0-5
      return (up >= '0' && up <= '5') ? up : null;
    }
    if (pos === 4) {
      // Second digit can be 0-9
      return up;
    }

    // Latitude seconds (00-59)
    if (pos === 5) {
      // First digit can be 0-5
      return (up >= '0' && up <= '5') ? up : null;
    }
    if (pos === 6) {
      // Second digit can be 0-9
      return up;
    }

    // Longitude degrees (000-180)
    if (pos === 8) {
      // First digit can be 0-1
      return (up === '0' || up === '1') ? up : null;
    }
    if (pos === 9) {
      // Second digit: if first is 1, only 0-8 allowed; otherwise 0-9
      const firstDigit = currentChars[8];
      if (firstDigit === '1') {
        return (up >= '0' && up <= '8') ? up : null;
      }
      return up;
    }
    if (pos === 10) {
      // Third digit: if first two are "18", only 0 allowed; otherwise 0-9
      const firstDigit = currentChars[8];
      const secondDigit = currentChars[9];
      if (firstDigit === '1' && secondDigit === '8') {
        return up === '0' ? up : null;
      }
      return up;
    }

    // Longitude minutes (00-59)
    if (pos === 11) {
      // First digit can be 0-5
      return (up >= '0' && up <= '5') ? up : null;
    }
    if (pos === 12) {
      // Second digit can be 0-9
      return up;
    }

    // Longitude seconds (00-59)
    if (pos === 13) {
      // First digit can be 0-5
      return (up >= '0' && up <= '5') ? up : null;
    }
    if (pos === 14) {
      // Second digit can be 0-9
      return up;
    }

    return null;
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const charInput = this.inputRef.getOrDefault();
    if (!charInput) {
      return;
    }

    this.keyboardState.input.sub(fullValue => {
      if (this.isUpdatingFromKeyboardState) {
        return;
      }

      const safeFull =
        fullValue && fullValue.length === 22
          ? fullValue
          : LatLonField.FULL_TEMPLATE;

      const editableValue = this.fullToEditable(safeFull);

      charInput.setValue(editableValue);
      this.inputText.set(editableValue);
      this.value.set(safeFull);
    });

    this.keyboardState.caret.sub(pos => {
      if (charInput.getIsEditingActive().get() && pos > -1) {
        const clamped = Math.min(pos, 14);
        charInput.placeCursor(clamped, false);
        this.editableCaret = clamped;
      }
    });

    charInput.cursorPosition.sub(pos => {
      this.keyboardState.setCaret(pos);
    });
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="vkb-input vkb-input-flex">
        <CharInput
          ref={this.inputRef}
          value={this.inputText}
          class="wpt-textfield-input"
          renderInactiveValue={(v) => this.editableToFull(v)}
        >
          {/* N/S */}
          <CharInputSlot defaultCharValue={Subject.create('')} charArray={['N', 'S']} wrap />
          {/* Lat degrees (2 digits) */}
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <span class="lat-lon-static">°</span>
          {/* Lat minutes (2 digits) */}
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <span class="lat-lon-static">'</span>
          {/* Lat seconds (2 digits) */}
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <span class="lat-lon-static">" </span>
          {/* E/W */}
          <CharInputSlot defaultCharValue={Subject.create('')} charArray={['E', 'W']} wrap />
          {/* Lon degrees (3 digits) */}
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <span class="lat-lon-static">°</span>
          {/* Lon minutes (2 digits) */}
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <span class="lat-lon-static">'</span>
          {/* Lon seconds (2 digits) */}
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <CharInputSlot defaultCharValue={Subject.create('')} wrap />
          <span class="lat-lon-static">"</span>
        </CharInput>
      </div>
    );
  }
}

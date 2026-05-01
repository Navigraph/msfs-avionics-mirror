import { Accessible, ArraySubject, Subject, SubscribableArray } from '@microsoft/msfs-sdk';
import { CharInputSlot } from '../Pages/FmsPage/FplTab/Components/CharInput';
import { KeyboardInputType, VirtualKeyboardType } from './KeyboardTypes';

/**
 * Manages the state of the virtual keyboard using singleton pattern
 */
export class VirtualKeyboardState {
  private static instance: VirtualKeyboardState;

  // Virtual Keyboard state
  private readonly virtualKeyboardVisible = Subject.create<boolean>(false);
  private readonly virtualKeyboardType = Subject.create<VirtualKeyboardType>(VirtualKeyboardType.Alphanumeric);
  private readonly virtualKeyboardInputType = Subject.create<KeyboardInputType>(KeyboardInputType.FreeText);
  private readonly currentInput = Subject.create<string>('');
  private readonly currentCaret = Subject.create<number>(0);
  private readonly disableKeyboardModeSwitch = Subject.create<boolean>(false);
  private readonly initialShowNumpad = Subject.create<boolean>(false);
  private readonly editingActive = Subject.create<boolean>(false);
  private readonly invalidInputMessage = Subject.create<string>('');
  private readonly _disableFacilitySearch = Subject.create<boolean>(false);
  public readonly disableFacilitySearch: Accessible<boolean> = this._disableFacilitySearch;
  private readonly _maxLength = Subject.create<number | null>(6);
  public readonly maxLength: Accessible<number | null> = this._maxLength;

  private readonly _allowedChars = ArraySubject.create<string>();
  public readonly allowedChars: SubscribableArray<string> = this._allowedChars;

  private currentValueCallback: ((value: string) => void) | null = null;
  private currentCloseCallback: (() => void) | null = null;
  private currentEnterCallback: ((value: string) => void) | null = null;
  private currentCaretCallback: ((position: number) => void) | null = null;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() { }

  /**
   * Gets the singleton instance of VirtualKeyboardState
   * @returns The singleton VirtualKeyboardState instance
   */
  public static getInstance(): VirtualKeyboardState {
    if (!VirtualKeyboardState.instance) {
      VirtualKeyboardState.instance = new VirtualKeyboardState();
    }
    return VirtualKeyboardState.instance;
  }

  /**
   * Gets the keyboard visibility state
   * @returns Subject containing the keyboard visibility boolean
   */
  public get keyboardVisible(): Subject<boolean> {
    return this.virtualKeyboardVisible;
  }

  /**
   * Gets the current keyboard type
   * @returns Subject containing the current VirtualKeyboardType
   */
  public get keyboardType(): Subject<VirtualKeyboardType> {
    return this.virtualKeyboardType;
  }

  /**
   * Gets the current keyboard input type
   * @returns Subject containing the current KeyboardInputType
   */
  public get keyboardInputType(): Subject<KeyboardInputType> {
    return this.virtualKeyboardInputType;
  }

  /**
   * Gets the current input text
   * @returns Subject containing the current input string
   */
  public get input(): Subject<string> {
    return this.currentInput;
  }

  /**
   * Gets the current caret position
   * @returns Subject containing the current caret position number
   */
  public get caret(): Subject<number> {
    return this.currentCaret;
  }

  /**
   * Gets the current invalid entry message
   * @returns Subject containing the current invalid entry message
   */
  public get invalidEntryMessage(): Subject<string> {
    return this.invalidInputMessage;
  }

  /**
   * Gets whether keyboard mode switching is disabled
   * @returns Subject containing the disabled state boolean
   */
  public get keyboardModeSwitchDisabled(): Subject<boolean> {
    return this.disableKeyboardModeSwitch;
  }

  /**
   * Gets whether to show numpad initially
   * @returns Subject containing the initial numpad visibility boolean
   */
  public get showNumpadInitially(): Subject<boolean> {
    return this.initialShowNumpad;
  }

  /**
   * Gets the editing active state
   * @returns Subject containing the editing active boolean
   */
  public get isEditingActive(): Subject<boolean> {
    return this.editingActive;
  }

  /**
   * Gets the current value change callback
   * @returns The value change callback function or null
   */
  public get valueCallback(): ((value: string) => void) | null {
    return this.currentValueCallback;
  }

  /**
   * Gets the current close callback
   * @returns The close callback function or null
   */
  public get closeCallback(): (() => void) | null {
    return this.currentCloseCallback;
  }

  /**
   * Gets the current enter callback
   * @returns The enter callback function or null
   */
  public get enterCallback(): ((value: string) => void) | null {
    return this.currentEnterCallback;
  }

  /**
   * Gets the current caret position callback.
   * @returns The callback, or null if there isn't one.
   */
  public get caretCallback(): ((position: number) => void) | null {
    return this.currentCaretCallback;
  }

  /**
   * Sets the disable facility search state
   * @param disable Whether to disable facility search
   */
  public setDisableFacilitySearch(disable: boolean): void {
    this._disableFacilitySearch.set(disable);
  }

  /**
   * Sets the keyboard visibility
   * @param visible Whether the keyboard should be visible
   */
  public setKeyboardVisible(visible: boolean): void {
    this.virtualKeyboardVisible.set(visible);
  }

  /**
   * Sets the keyboard type
   * @param type The type of keyboard to display
   */
  public setKeyboardType(type: VirtualKeyboardType): void {
    this.virtualKeyboardType.set(type);
  }

  /**
   * Sets the keyboard input type
   * @param type The type of keyboard to display
   */
  public setKeyboardInputType(type: KeyboardInputType): void {
    this.keyboardInputType.set(type);
  }

  /**
   * Sets the input text and triggers value callback
   * @param input The input text to set
   */
  public setInput(input: string): void {
    this.currentInput.set(input);
    this.currentValueCallback?.(input);
  }

  /**
   * Sets the input text directly without triggering callback
   * @param input The input text to set
   */
  public setInputDirect(input: string): void {
    this.currentInput.set(input);
  }

  /**
   * Sets the caret position
   * @param position The position to set the caret to
   */
  public setCaret(position: number): void {
    this.currentCaret.set(position);
  }

  /**
   * Sets the invalid entry message
   * @param message The message to set
   */
  public setInvalidMessageEntry(message: string): void {
    this.invalidEntryMessage.set(message);
  }

  /**
   * Sets whether keyboard mode switching is disabled
   * @param disabled Whether to disable keyboard mode switching
   */
  public setKeyboardModeSwitchDisabled(disabled: boolean): void {
    this.disableKeyboardModeSwitch.set(disabled);
  }

  /**
   * Sets whether to show numpad initially
   * @param show Whether to show numpad on initial display
   */
  public setInitialShowNumpad(show: boolean): void {
    this.initialShowNumpad.set(show);
  }

  /**
   * Sets the maximum length of the input text.
   * @param maxLength The maximum length of the input text, or null for no maximum or not applicable.
   */
  public setMaximumLength(maxLength: number | null): void {
    this._maxLength.set(maxLength);
  }

  /**
   * Sets the editing active state
   * @param active Whether editing is active
   */
  public setEditingActive(active: boolean): void {
    this.editingActive.set(active);
  }

  // Callback management
  /**
   * Sets the callback for value changes
   * @param callback Callback function to call when value changes
   */
  public setValueCallback(callback: ((value: string) => void) | null): void {
    this.currentValueCallback = callback;
  }

  /**
   * Sets the callback for keyboard close event
   * @param callback Callback function to call when keyboard closes
   */
  public setCloseCallback(callback: (() => void) | null): void {
    this.currentCloseCallback = callback;
  }

  /**
   * Sets the callback for keyboard enter event
   * @param callback Callback function to call when keyboard closes
   */
  public setEnterCallback(callback: ((value: string) => void) | null): void {
    this.currentEnterCallback = callback;
  }

  /**
   * Sets the callback for caret position changes.
   * @param callback Callback function to call when the caret position changes.
   */
  public setCaretCallback(callback: ((position: number) => void) | null): void {
    this.currentCaretCallback = callback;
  }

  /**
   * Sets the allowed characters for entries.
   * @param chars The allowable characters, or null to set the default character set.
   */
  public setAllowedChars(chars: string[] | null): void {
    this._allowedChars.set(chars ?? CharInputSlot.DEFAULT_CHAR_ARRAY);
  }

  /**
   * Closes the keyboard and triggers close callback
   */
  public closeKeyboard(): void {
    this.setKeyboardVisible(false);
    this.currentCloseCallback?.();
  }
}

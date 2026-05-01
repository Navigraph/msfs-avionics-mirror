import {
  ComponentProps, DisplayComponent, FSComponent, MutableSubscribable, SetSubject, Subscribable, SubscribableSet, SubscribableUtils, Subscription,
  ToggleableClassNameRecord, VNode
} from '@microsoft/msfs-sdk';

import { GenericCursorInputSlot } from '../CursorInput/CursorInputSlot';

/**
 * Component props for OptionInputSlot.
 */
export interface OptionInputSlotProps extends ComponentProps {
  /**
   * An array of valid options for the slot. The order of options in the array determines the order in
   * which the slot will cycle through options when incrementing/decrementing its value.
   */
  options: readonly string[];

  /**
   * Whether the slot should wrap from the last valid character to the first valid character and vice-versa when
   * incrementing/decrementing its value.
   */
  wrap: boolean | Subscribable<boolean>;

  /** The default option value for the slot when the character value is `null`. */
  defaultOptionValue: string | Subscribable<string>;

  /** CSS class(es) to apply to the slot's root element. */
  class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
}

/**
 * A cursor input slot which allows the user to select a single arbitrary character.
 */
export class OptionInputSlot extends DisplayComponent<OptionInputSlotProps> {
  private static readonly RESERVED_CSS_CLASSES = ['char-input-slot'];

  private readonly slotRef = FSComponent.createRef<GenericCursorInputSlot<string>>();

  private readonly defaultOptionValue = SubscribableUtils.toSubscribable(this.props.defaultOptionValue, true);

  public readonly characterCount = this.props.options.reduce((maxLen, opt) => Math.max(maxLen, opt.length), 0);

  private readonly parseValue = (characters: readonly (string | null)[]): string => {
    return characters.filter((v) => v !== null).join('');
  };

  private readonly digitizeValue = (value: string, setCharacters: readonly ((char: string | null) => void)[]): void => {
    const optionIndex = this.props.options.indexOf(value);
    for (let i = 0; i < setCharacters.length; i++) {
      if (optionIndex < 0 || i >= value.length) {
        setCharacters[i](null);
      } else {
        setCharacters[i](value[i]);
      }
    }
  };

  private readonly renderChar = (
    (character: string | null, index: number): string => {
      const characterToRender = character === null ? (this.defaultOptionValue.get()[index] ?? ' ') : character;
      return characterToRender;
    }
  );

  private readonly wrap = SubscribableUtils.toSubscribable(this.props.wrap, true);

  // eslint-disable-next-line jsdoc/require-returns
  /** The value bound to this slot. */
  public get value(): Subscribable<string> {
    return this.slotRef.instance.value;
  }

  private readonly subscriptions: Subscription[] = [];

  /** @inheritdoc */
  public onAfterRender(): void {
    this.subscriptions.push(
      this.defaultOptionValue.sub(() => {
        this.slotRef.instance.refreshFromChars();
      }, true)
    );
  }

  /**
   * Sets the value of this slot. As part of the operation, this slot's character will be set to a non-null
   * representation of the new value, if possible. The value of this slot after the operation is complete may differ
   * from the requested value depending on whether the requested value can be accurately represented by this slot.
   * @param value The new value.
   * @returns The value of this slot after the operation is complete.
   */
  public setValue(value: string): string {
    return this.slotRef.instance.setValue(value);
  }

  /**
   * Increments this slot's value.
   * @returns Whether the increment operation was accepted.
   */
  public incrementValue(): boolean {
    return this.slotRef.instance.incrementValue();
  }

  /**
   * Decrements this slot's value.
   * @returns Whether the decrement operation was accepted.
   */
  public decrementValue(): boolean {
    return this.slotRef.instance.decrementValue();
  }

  /**
   * Sets the value of this slot's character.
   * @param index The index to set.
   * @param char The value to set.
   * @param force Whether to force the character to accept a value that would normally be invalid. Defaults to `false`.
   * @returns Whether the operation was accepted.
   */
  public setChar(index: number, char: string | null, force?: boolean): boolean {
    return this.slotRef.instance.setChar(index, char, force);
  }

  /**
   * Changes this slot's value in a specified direction.
   * @param direction The direction in which to change the value.
   * @param value This slot's current value.
   * @param setValue A function which sets this slot's value.
   * @returns Whether the value was successfully changed.
   */
  private changeValue(direction: 1 | -1, value: string, setValue: (value: string) => void): boolean {
    const optionIndex = this.props.options.indexOf(value);
    if (optionIndex < 0) {
      setValue(this.props.options[direction > 0 ? 0 : this.props.options.length - 1]);
      return true;
    }

    const newIndex = optionIndex + direction;

    if (newIndex < 0) {
      if (this.wrap.get()) {
        setValue(this.props.options[this.props.options.length - 1]);
        return true;
      } else {
        return false;
      }
    }

    if (newIndex >= this.props.options.length) {
      if (this.wrap.get()) {
        setValue(this.props.options[0]);
        return true;
      } else {
        return false;
      }
    }

    setValue(this.props.options[newIndex]);
    return true;
  }

  /**
   * Sets the value of one of this slot's characters.
   * @param characters An array of characters.
   * @param index The index of the character to set.
   * @param charToSet The value to set.
   * @param force Whether to force the character to accept a value that would normally be invalid. Defaults to `false`.
   * @returns Whether the operation was accepted.
   */
  private _setChar(characters: readonly MutableSubscribable<string | null>[], index: number, charToSet: string | null, force?: boolean): boolean {
    if (charToSet === null || force) {
      characters[index].set(charToSet);
      return true;
    }

    const entry = this.value.get().substring(0, index) + charToSet;
    const option = this.findNextMatchingOption(entry);
    if (option) {
      for (let i = index; i < this.characterCount; i++) {
        characters[i].set(option[i] ?? null);
      }
      return true;
    } else {
      return false;
    }
  }

  /**
   * Finds the next matching option starting at the current option.
   * @param partialEntry The partial entry to search for.
   * @returns The option value if found, else undefined.
   */
  private findNextMatchingOption(partialEntry: string): string | undefined {
    const currentIndex = this.props.options.indexOf(this.value.get());
    // search forward only
    for (let optionIndex = Math.max(0, currentIndex); optionIndex < this.props.options.length; optionIndex++) {
      if (this.props.options[optionIndex].startsWith(partialEntry)) {
        return this.props.options[optionIndex];
      }
    }

    // search from the start
    for (let optionIndex = 0; optionIndex < currentIndex; optionIndex++) {
      if (this.props.options[optionIndex].startsWith(partialEntry)) {
        return this.props.options[optionIndex];
      }
    }

    return undefined;
  }

  /**
   * Checks whether one of this slot's characters can be set to a given value.
   * @param index The index of the character to set.
   * @param character The value to set.
   * @param force Whether the character should accept a value that would normally be invalid.
   * @returns Whether the specified character can be set to the specified value.
   */
  private canSetChar(index: number, character: string | null, force?: boolean): boolean {
    if (character === null || force) {
      return true;
    }

    const entry = this.value.get().substring(0, index) + character;

    return this.findNextMatchingOption(entry) !== undefined;
  }

  /** @inheritdoc */
  public render(): VNode {
    let cssClass: string | SetSubject<string>;

    if (typeof this.props.class === 'object') {
      cssClass = SetSubject.create();
      cssClass.add('char-input-slot');

      const sub = FSComponent.bindCssClassSet(cssClass, this.props.class, OptionInputSlot.RESERVED_CSS_CLASSES);
      if (Array.isArray(sub)) {
        this.subscriptions.push(...sub);
      } else {
        this.subscriptions.push(sub);
      }
    } else {
      cssClass = 'char-input-slot';

      if (this.props.class !== undefined && this.props.class.length > 0) {
        cssClass += ' ' + FSComponent.parseCssClassesFromString(this.props.class, classToAdd => !OptionInputSlot.RESERVED_CSS_CLASSES.includes(classToAdd)).join(' ');
      }
    }

    return (
      <GenericCursorInputSlot<string>
        ref={this.slotRef}
        allowBackfill={false}
        characterCount={this.characterCount}
        parseValue={this.parseValue}
        digitizeValue={this.digitizeValue}
        renderChar={this.renderChar}
        incrementValue={this.changeValue.bind(this, 1)}
        decrementValue={this.changeValue.bind(this, -1)}
        setChar={this._setChar.bind(this)}
        canSetChar={(characters, index, charToSet, force): boolean => this.canSetChar(index, charToSet, force)}
        class={cssClass}
      />
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.slotRef.getOrDefault()?.destroy();

    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    super.destroy();
  }
}

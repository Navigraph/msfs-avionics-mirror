import { AccessibleUtils, FSComponent, MappedSubject, NodeReference, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../Components/List/IfdListItemComponent';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { FlightPlanLegListData, FlightPlanStore } from '../../../../FlightPlan';
import { VirtualKeyboardState } from '../../../../Keyboard/KeyboardState';
import { KeyboardInputType } from '../../../../Keyboard/KeyboardTypes';
import { AltitudeField } from './AltitudeField';
import { HoldField } from './HoldField';
import { LabelField } from './LabelField';
import { TextInputField } from './TextInputField';

/** Base properties for editable blocks */
export interface BaseEditableBlockProps extends IfdListItemComponentProps {
  /** The data for the leg */
  readonly data: FlightPlanLegListData;
  /** div ref to hide text input when not in use */
  readonly hiddenFieldRef: NodeReference<HTMLDivElement>;
  /** @inheritdoc */
  readonly openWaypointKeyboard: (smartPrefill: string,
    onAccept: (ident: string) => void,
    anchorEl?: HTMLElement) => void;
  /** @inheritdoc */
  readonly openNumberKeyboard: (smartPrefill: string,
    keyboardInputType: KeyboardInputType,
    onAccept: (ident: string) => void,
    anchorEl?: HTMLElement) => void;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** Text field ref */
  readonly textFieldRef: NodeReference<TextInputField>;
  /** A function that scrolls this list item into view if it is not already. */
  readonly scrollIntoView: () => void;
}

/**
 * Editable block fields
 */
export type EditableBlockFieldRef =
  | NodeReference<AltitudeField>
  | NodeReference<TextInputField>
  | NodeReference<LabelField>
  | NodeReference<HoldField<any>>;

/** Field definition for editable blocks */
export interface EditableField {
  /** Reference to the field's DOM element */
  ref: NodeReference<HTMLElement>;
  /** Reference to the field */
  fieldRef?: EditableBlockFieldRef;
  /** Current value of the field */
  getValue: () => string;
  /** Whether this field can be edited */
  canEdit: boolean | Subscribable<boolean>;
  /** Field type for different edit behaviors */
  type: 'text' | 'menu' | 'number' | 'label' | 'degrees' | 'minute' | 'nm' | Subscribable<string>;
  /** Callback when field is edited (for text fields) */
  onEdit?: (value: string, event?: IfdInteractionEvent | MouseEvent) => void;
  /** Callback when field menu is opened (for menu fields) */
  onMenuOpen?: () => void;
}

/** Base class for blocks with editable fields and cursor navigation */
export abstract class BaseEditableBlock<T extends BaseEditableBlockProps> extends IfdListItemComponent<T> {
  public readonly blockRef = FSComponent.createRef<HTMLDivElement>();
  /** The fields for this block */
  protected abstract readonly fields: Record<string, EditableField>;

  /** Field indexes */
  protected abstract readonly fieldIndexes: Record<string, number>;

  /** Shows which fields are editable when the leg is selected. */
  protected readonly isInEditMode = Subject.create(false);

  /** The user is editing a field via knob or keyboard **/
  protected readonly isInEntryMode = Subject.create(false);

  /** Selected field index */
  protected readonly _selectedFieldIndex = Subject.create<number>(-1);

  /** Computed selected field index that respects selection state */
  protected readonly selectedFieldIndex = MappedSubject.create(
    ([isSelected, selectedFieldIndex]) => {
      return isSelected ? selectedFieldIndex : -1;
    },
    this.isSelected,
    this._selectedFieldIndex
  );

  public readonly _miniFplFormatStyle = MappedSubject.create(([format, selected]) => {
    return (format && !selected);
  },
    this.props.store.miniFplFormat,
    this.isSelected,
  ).withLifecycle(this.defaultLifecycle);
  public readonly miniFplFormatStyle = this._miniFplFormatStyle as Subscribable<boolean>;

  protected inputPlaceholderRef = FSComponent.createRef<HTMLDivElement>();
  protected keyboardState = VirtualKeyboardState.getInstance();

  /** Get the maximum field index
   * @returns number */
  protected get maxFieldIndex(): number {
    return Math.max(...Object.values(this.fieldIndexes));
  }

  /**
   * Get field by index
   * @returns the EditableField or undefined
   * @param index the field index
   */
  protected getFieldByIndex(index: number): EditableField | undefined {
    const fieldKey = Object.keys(this.fieldIndexes).find(key => this.fieldIndexes[key] === index);
    return fieldKey ? this.fields[fieldKey] : undefined;
  }

  /**
   * Gets the field type as a string
   * @param field The editable field
   * @returns The field type as a string
   */
  protected getFieldType(field: EditableField | undefined): string | undefined {
    if (!field) { return undefined; }
    return AccessibleUtils.isAccessible(field.type) ? field.type.get() : field.type;
  }

  /**
   * Called when the is entered mode state changes.
   * @param isActive The new edit mode state.
   */
  protected onEnteredModeChanged(isActive: boolean): void {
    const currentField = this.getFieldByIndex(this._selectedFieldIndex.get());

    if (currentField && this.getFieldType(currentField) === 'number') {
      const currentValue = currentField.getValue();
      this.keyboardState.setInputDirect(currentValue);
      this.keyboardState.setEditingActive(true);
      this.keyboardState.setCaret(0);
    }

    if (isActive && currentField && this.getFieldType(currentField) === 'text') {
      this.inputPlaceholderRef.instance.appendChild(this.props.textFieldRef.instance.divRef.instance);

      const currentValue = currentField.getValue();
      this.props.textFieldRef.instance.inputText.set(currentValue);

      this.props.textFieldRef.instance.inputRef.instance.setValue(currentValue);
      this.props.textFieldRef.instance.inputRef.instance.activateEditing(false);

      this.keyboardState.setInputDirect(currentValue);
      this.keyboardState.setEditingActive(true);

      this.props.textFieldRef.instance.inputRef.instance.placeCursor(0, false);
      this.keyboardState.setCaret(0);
    } else {
      this.props.hiddenFieldRef.instance.appendChild(this.props.textFieldRef.instance.divRef.instance);

      if (!isActive) {
        this.keyboardState.setEditingActive(false);
        this.props.textFieldRef.instance.inputRef.instance.deactivateEditing();
      }
    }
  }

  /**
   * Set the selected field by index.
   * If the field does not exist or is not editable, no action will be taken.
   * @param index Index of the desired field.
   */
  public setSelectedFieldIndex(index: number): void {
    const field = this.getFieldByIndex(index);
    if (!field || !field.canEdit || (SubscribableUtils.isSubscribable(field.canEdit) && !field.canEdit.get())) {
      return;
    }
    this._selectedFieldIndex.set(index);
  }

  /**
   * Setup field click handlers
   */
  protected setupFieldClickHandlers(): void {
    Object.entries(this.fields).forEach(([key, field]) => {
      const fieldIndex = this.fieldIndexes[key];

      if (!field.ref.instance) {
        console.warn(`BaseEditableBlock: field ref for ${key} not initialized`);
        return;
      }

      field.ref.instance.addEventListener('click', (event) => {
        if (this._isSelected.get()) {
          event.stopPropagation();
          this.handleFieldClick(fieldIndex, event);
        }
      });
    });
  }

  /**
   * Handles field clicks with proper two-click behavior for text fields
   * @param fieldIndex The field index that was clicked
   * @param event the type of event
   */
  protected handleFieldClick(fieldIndex: number, event: MouseEvent): void {
    const field = this.getFieldByIndex(fieldIndex);
    if (!field || !field.canEdit || (SubscribableUtils.isSubscribable(field.canEdit) && !field.canEdit.get())) {
      return;
    }

    const wasAlreadySelected = this.selectedFieldIndex.get() === fieldIndex;

    if (wasAlreadySelected) {
      // Second click - handle based on field type
      this.props.scrollIntoView();

      const fieldType = this.getFieldType(field);
      switch (fieldType) {
        case 'label':
          field.onEdit?.(field.getValue(), event);
          break;
        case 'number':
          this.isInEntryMode.set(true);
          this.props.openNumberKeyboard(
            field.getValue(),
            KeyboardInputType.ClimbAltitudeOrFlightLevel,
            (value) => {
              field.onEdit?.(value);
              this.isInEntryMode.set(false);
            }
          );
          break;
        case 'degrees':
          this.isInEntryMode.set(true);
          this.props.openNumberKeyboard(
            field.getValue(),
            KeyboardInputType.Angle,
            (value) => {
              field.onEdit?.(value);
              this.isInEntryMode.set(false);
            }
          );
          break;
        case 'minute':
          this.isInEntryMode.set(true);
          this.props.openNumberKeyboard(
            field.getValue(),
            KeyboardInputType.Duration,
            (value) => {
              field.onEdit?.(value);
              this.isInEntryMode.set(false);
            }
          );
          break;
        case 'nm':
          this.isInEntryMode.set(true);
          this.props.openNumberKeyboard(
            field.getValue(),
            KeyboardInputType.NM,
            (value) => {
              field.onEdit?.(value);
              this.isInEntryMode.set(false);
            }
          );
          break;
        case 'text':
          this.isInEntryMode.set(true);
          this.props.openWaypointKeyboard(
            field.getValue(),
            (value) => {
              field.onEdit?.(value);
              this.isInEntryMode.set(false);
            }
          );
          break;

        case 'menu':
          // Menu fields open immediately on second click
          field.onMenuOpen?.();
          break;

        default:
          break;
      }
    } else {
      // First click - just select the field
      this.isInEntryMode.set(false);
      this._selectedFieldIndex.set(fieldIndex);
    }
  }

  /**
   * Goes to the next selectable field in this block.
   */
  protected gotoNextField(): void {
    const current = this._selectedFieldIndex.get();
    this.isInEntryMode.set(false);

    if (current < this.maxFieldIndex) {
      const next = this.getNextEditableFieldIndex(current, 1);
      const field = this.getFieldByIndex(next);
      // the last field should remain selected
      if (field) {
        this._selectedFieldIndex.set(current);
        return;
      }
      this._selectedFieldIndex.set(next);
    }
  }

  /**
   * Computes the next selectable field index, skipping fields as appropriate.
   * Base implementation - can be overridden by subclasses for custom logic.
   * @param current The current field index.
   * @param delta The direction to move (1 for next, -1 for previous).
   * @returns The next selectable field index.
   */
  /** @inheritdoc */
  protected getNextEditableFieldIndex(current: number, delta: 1 | -1): number {
    if (delta < 0) {
      for (let i = current - 1; i >= 0; i--) {
        const field = this.getFieldByIndex(i);
        if (!field || !field.canEdit || (SubscribableUtils.isSubscribable(field.canEdit) && !field.canEdit.get())) {
          continue;
        }
        return i;
      }
    } else {
      for (let i = current + 1; i <= this.maxFieldIndex; i++) {
        const field = this.getFieldByIndex(i);
        if (!field || !field.canEdit || (SubscribableUtils.isSubscribable(field.canEdit) && !field.canEdit.get())) {
          continue;
        }
        return i;
      }
    }
    return -1;
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isSelected.pipe(this.props.data.isSelected);

    if (this.isEditableItem()) {
      this.setupFieldClickHandlers();

      this.keyboardState.keyboardVisible.sub((v) => {
        if (!v) {
          this.isInEntryMode.set(false);
        }
      });

      this.isInEntryMode.sub(this.onEnteredModeChanged.bind(this));

      // Reset states when the selected field changes
      this._selectedFieldIndex.sub(() => this.updateEditMode());
    }

    this.blockRef.instance.addEventListener('click', (event) => {
      if (!this._isSelected.get()) {
        event.stopPropagation();
        this.focus();
      }
    });
  }

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    const currentField = this.getFieldByIndex(this._selectedFieldIndex.get());
    currentField?.fieldRef?.instance?.onInteractionEvent(event);

    if (!this.isInEntryMode.get() && !this.keyboardState.keyboardVisible.get()) {

      switch (event) {
        case IfdInteractionEvent.RightKnobInnerDec: {
          const current = this._selectedFieldIndex.get();
          const next = this.getNextEditableFieldIndex(current, -1);
          if (next >= 0) {
            this.props.scrollIntoView();
            this._selectedFieldIndex.set(next);
            return true;
          }
          // Already at top field, let list handle it
          return false;
        }

        case IfdInteractionEvent.RightKnobInnerInc: {
          const current = this._selectedFieldIndex.get();
          const next = this.getNextEditableFieldIndex(current, +1);
          if (next >= 0) {
            this.props.scrollIntoView();
            this._selectedFieldIndex.set(next);
            return true;
          }
          // Already at bottom field, let list handle it
          return false;
        }

        case IfdInteractionEvent.ENTR:
        case IfdInteractionEvent.RightKnobPush: {
          const fieldType = currentField && this.getFieldType(currentField);
          if (currentField && (currentField.canEdit === true || (SubscribableUtils.isSubscribable(currentField.canEdit) && currentField.canEdit.get()))) {
            this.props.scrollIntoView();
            switch (fieldType) {
              case 'number':
              case 'degrees':
              case 'minute':
              case 'nm':
              case 'label':
                // field handles own events
                return true;
              case 'text':
                this.isInEntryMode.set(true);
                this.props.openWaypointKeyboard(
                  currentField.getValue(),
                  (value) => {
                    currentField.onEdit?.(value);
                    this.isInEntryMode.set(false);
                  }
                );
                return true;

              case 'menu':
                currentField.onMenuOpen?.();
                return true;

              default:
                break;
            }
          }
          return false;
        }

        default:
          return false;
      }
    } else {
      // Handle entry mode
      switch (event) {
        case IfdInteractionEvent.RightKnobPush: {
          const fieldType = this.getFieldType(currentField);

          if (fieldType === 'text' && this.isInEntryMode.get()) {
            currentField?.onEdit?.(this.props.textFieldRef.instance.inputText.get());
          }
          if (fieldType === 'menu' || fieldType === 'text') {
            this.isInEntryMode.set(!this.isInEntryMode.get());
          }
          return true;
        }
        case IfdInteractionEvent.CLR:
          // If we get this event, it means the keyboard is not open and the edits are being made with the knob.
          // We cancel the entry in that case.
          this.isInEntryMode.set(false);
          break;
      }
      return true;
    }
  }

  /** @inheritdoc */
  public override onFocus(event: IfdInteractionEvent | 'click'): void {
    super.onFocus(event);
    switch (event) {
      case IfdInteractionEvent.RightKnobOuterInc:
      case IfdInteractionEvent.RightKnobOuterDec:
      case 'click':
        // set no field selected
        this._selectedFieldIndex.set(-1);
        break;
      case IfdInteractionEvent.RightKnobInnerInc:
        // set the first editable field
        this._selectedFieldIndex.set(this.getNextEditableFieldIndex(-1, 1));
        break;
      case IfdInteractionEvent.RightKnobInnerDec:
        // set the last editable field
        this._selectedFieldIndex.set(this.getNextEditableFieldIndex(this.maxFieldIndex + 1, -1));
        break;
    }
    this.updateEditMode();
  }

  /** @inheritdoc */
  public override onBlur(): void {
    super.onBlur();
    this._selectedFieldIndex.set(-1);
    this.updateEditMode();
  }

  /**
   * Update the edit mode based on the selected field index.
   * Base implementation - can be overridden by subclasses for custom logic.
   */
  protected updateEditMode(): void {
    if (!this.isSelected.get() || !this.isEditableItem()) {
      this.isInEditMode.set(false);
      this.isInEntryMode.set(false);
      return;
    }

    const selectedIndex = this._selectedFieldIndex.get();
    this.isInEditMode.set(selectedIndex >= 0);
  }

  /**
   * Checks if this item is editable at all.
   * @returns true if editable.
   */
  protected isEditableItem(): boolean {
    return true;
  }

  /**
   * Gets the reactive canEdit state for a field.
   * CAUTION: Use carefully as this can create a new mapped subject for every call.
   * @param fieldIndex the field index
   * @returns Subscribable boolean, or false is the field is never editable.
   */
  private getCanEditSubscribableOrBool(fieldIndex: number): Subscribable<boolean> | false {
    const field = this.getFieldByIndex(fieldIndex);
    if (field && field.canEdit !== false) {
      return SubscribableUtils.isSubscribable(field.canEdit) ?
        MappedSubject.create(
          ([editMode, canEdit]) => editMode && canEdit,
          this.isInEditMode,
          field.canEdit).withLifecycle(this.defaultLifecycle) :
        this.isInEditMode;
    }

    return false;
  }

  /**
   * Helper to create field selection CSS classes
   * @param fieldIndex The field index to check
   * @param additionalClasses extra classes
   * @returns CSS class object
   */
  protected createFieldClasses(fieldIndex: number, additionalClasses: Record<string, any> = {}): Record<string, boolean | Subscribable<boolean> | any> {
    const isSelectedNotEntered = MappedSubject.create(
      ([isEntryMode, selectedFieldIndex]): boolean => {
        return !isEntryMode && selectedFieldIndex === fieldIndex;
      },
      this.isInEntryMode,
      this.selectedFieldIndex
    );

    return {
      'text-input-selected': isSelectedNotEntered,
      'leg-block-input-field': true,
      'leg-block-black-field': this.getCanEditSubscribableOrBool(fieldIndex),
      ...additionalClasses,
    };
  }

  /**
   * Helper to create input placeholder for text fields
   * @param fieldIndex The field index
   * @param content The content to show when not editing
   * @param className Additional classes for the content div
   * @returns VNode for the field content
   */
  protected createTextField(fieldIndex: number, content: any, className = ''): VNode {
    const isFieldInEntry = MappedSubject.create(
      ([selectedIndex, isInEntry]) => {
        return selectedIndex === fieldIndex && isInEntry;
      },
      this.selectedFieldIndex,
      this.isInEntryMode
    );

    return (
      <>
        <div ref={this.inputPlaceholderRef} />
        <div class={{ [className]: true, 'hidden': isFieldInEntry }}>{content}</div>
      </>
    );
  }
}

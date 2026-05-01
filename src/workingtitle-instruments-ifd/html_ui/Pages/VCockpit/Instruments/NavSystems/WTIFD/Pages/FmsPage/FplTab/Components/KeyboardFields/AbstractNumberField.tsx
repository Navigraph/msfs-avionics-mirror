import { ComponentProps, FSComponent, MutableSubscribable, NodeReference, SetSubject, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { NumberInput } from '../NumberInput/NumberInput';
import { AbstractField } from './AbstractField';

/**
 * A request input for {@link AbstractNumberField}.
 */
export interface NumberFieldInput {
  /** The value initially loaded into the field */
  initialValue: number;
}

/**
 * A definition for a {@link NumberInput} used in a {@link AbstractNumberField}.
 */
export interface NumberInputDefinition {
  /** A reference to this definition's input. */
  readonly ref: NodeReference<NumberInput>;

  /** The value bound to this definition's input. */
  readonly value: MutableSubscribable<number>;

  /** A mutable subscribable which controls the visibility of this definition's input. */
  readonly isVisible: MutableSubscribable<boolean>;

  /**
   * Renders this definition's input.
   * @param ref The reference to which to assign the rendered input.
   * @param value The value to bind to the rendered input.
   * @param rootCssClassName The CSS class name for this fields root element.
   * @returns This definition's input, as a VNode.
   */
  render(ref: NodeReference<NumberInput>, value: MutableSubscribable<number>, rootCssClassName: string | undefined): VNode;
}

/**
 * An abstract implementation of a field which allows the user to select an arbitrary numeric value.
 * Subclasses can register an arbitrary number of
 * {@link NumberInput} components. The different inputs may be used to allow the user to input numbers with different
 * formatting, number of digits, etc. However, only one input is active and visible at a time. Subclasses may also
 * choose to render additional content by overriding the `renderOtherContents()` method.
 */
export abstract class AbstractNumberField
  <
    Input extends NumberFieldInput = NumberFieldInput,
    InputDef extends NumberInputDefinition = NumberInputDefinition,
    Props extends ComponentProps = ComponentProps,
  > extends AbstractField<Input, Props> {

  protected readonly inputContainerRef = FSComponent.createRef<HTMLDivElement>();

  protected readonly rootCssClass = SetSubject.create(['vkb-input']);

  protected readonly inputDefinitions = new Map<string, InputDef>();

  protected activeInputDef?: InputDef;

  protected resolveFunction?: (value: any) => void;

  /**
   * Registers an input definition. Definitions must be registered before this is rendered
   * in order to function properly.
   * @param key The key to register the definition under. If an existing definition is already registered under the
   * same key, it will be replaced.
   * @param def The definition to register.
   */
  protected registerInputDefinition(key: string, def: InputDef): void {
    const existing = this.inputDefinitions.get(key);
    if (existing && existing.ref.getOrDefault()) {
      existing.isVisible.set(false);
      existing.ref.instance.destroy();
    }

    this.inputDefinitions.set(key, def);
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    //@TODO set sidebar state?
    //this._sidebarState.slot5.set('enterEnabled');
  }

  /**
   * Responds to when the editing state of this fields's active number input changes.
   * @param isEditingActive Whether editing is active.
   * @param activeInputDef The active input definition.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onEditingActiveChanged(isEditingActive: boolean, activeInputDef: InputDef): void {
    if (isEditingActive) {
      //@TODO set sidebar state?
      //this._sidebarState.slot1.set('cancel');
    }
  }

  /**
   * A callback method which is called when this field receives a request.
   * @param input The input for the request.
   */
  public abstract onRequest(input: Input): void;

  /**
   * Resets the active input. This will
   * @param key The key of the input to set as the active input. Defaults to the key of the current active input.
   * @param initialValue The initial value to set on the new active input. If not defined, the new active input will
   * retain its current value.
   * @param resetEditing Whether to reset the editing state of this field, in effect resetting the Back/Cancel button
   * on the button bar to Back. Defaults to `false`.
   */
  protected resetActiveInput(key?: string, initialValue?: number, resetEditing = false): void {
    this.activeInputDef?.ref.instance.deactivateEditing();
    this.activeInputDef?.isVisible.set(false);

    this.activeInputDef = key === undefined ? this.activeInputDef : this.inputDefinitions.get(key);

    if (this.activeInputDef === undefined) {
      return;
    }

    // Render the active input if it has not yet been rendered.
    if (!this.activeInputDef.ref.getOrDefault()) {
      this.renderInputToContainer(this.activeInputDef);
    }

    if (resetEditing) {
      //@TODO set sidebar state
      //this._sidebarState.slot1.set(null);
    }

    if (initialValue !== undefined) {
      this.activeInputDef.ref.instance.setValue(initialValue);
    }

    this.activeInputDef.isVisible.set(true);
    this.activeInputDef.ref.instance.refresh();
  }

  /**
   * Renders one of this field's registered inputs to the input container.
   * @param def The definition for the input to render.
   */
  protected renderInputToContainer(def: InputDef): void {
    FSComponent.render(def.render(def.ref, def.value, this.getRootCssClassName()), this.inputContainerRef.instance);

    def.ref.instance.isEditingActive.sub(isActive => {
      if (def === this.activeInputDef) {
        this.onEditingActiveChanged(isActive, def);
      }
    });
  }

  /** @inheritdoc */
  public onClose(): void {
    this.cleanupRequest();
  }

  /** @inheritdoc */
  public onResume(): void {
    this.activeInputDef?.ref.instance.refresh();
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
        this.activeInputDef?.ref.instance.changeSlotValue(1);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        this.activeInputDef?.ref.instance.changeSlotValue(-1);
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        this.activeInputDef?.ref.instance.moveCursor(1, true);
        return true;
      case IfdInteractionEvent.RightKnobOuterDec:
        this.activeInputDef?.ref.instance.moveCursor(-1, true);
        return true;
      default:
        return false;
    }
  }

  /**
   * Validates the currently selected value, and if valid sets the value to be returned for the currently pending
   * request and deactivates this field.
   */
  protected async validateValueAndClose(): Promise<void> {
    this.activeInputDef?.ref.instance.deactivateEditing();
  }

  /**
   * Checks if a value is valid to be returned for a request.
   * @param value The value to check.
   * @param activeInputDef The input definition used to generate the value to check.
   * @returns Whether the specified value is valid to be returned for a request.
   */
  protected abstract isValueValid(value: number, activeInputDef: InputDef): boolean;

  /**
   * Gets the message to display when attempting to return an invalid value.
   * @param value The invalid value.
   * @param activeInputDef The input definition used to generate the invalid value.
   * @returns The message to display when attempting to return an invalid value.
   */
  protected abstract getInvalidValueMessage(value: number, activeInputDef: InputDef): string | VNode;

  /**
   * Gets the current value
   * @returns string - the current value
   */
  public getValue(): string {
    return this.activeInputDef?.ref.instance.value.get().toString() ?? '';
  }

  /**
   * Clears this field's pending request and fulfills the pending request Promise if one exists.
   */
  protected cleanupRequest(): void {
    this.activeInputDef?.ref.instance.deactivateEditing();

    this.onCleanupRequest();
  }

  /**
   * A callback method which is called when this field cleans up a request. This method is called before the pending
   * request Promise is fulfilled, if one exists.
   */
  protected onCleanupRequest(): void {
    // noop
  }

  /**
   * Responds to when one of this field's number pad buttons is pressed.
   * @param value The value of the button that was pressed.
   */
  protected onNumberPressed(value: number): void {
    this.activeInputDef?.ref.instance.setSlotCharacterValue(`${value}`);
  }

  /**
   * Called when this field's decimal button is pressed.
   */
  protected onDecimalPressed(): void {
    // noop
  }

  /**
   * Responds to when this field's backspace button is pressed.
   */
  public onBackspacePressed(): void {
    this.activeInputDef?.ref.instance.backspace();
  }

  /** @inheritdoc */
  public render(): VNode {
    const rootCssClassName = this.getRootCssClassName();

    if (rootCssClassName !== undefined) {
      this.rootCssClass.add(rootCssClassName);
    }

    return (
      <div class={this.rootCssClass}>
        <div
          ref={this.inputContainerRef}
          class={`number-field-input-container ${rootCssClassName === undefined ? '' : `${rootCssClassName}-input-container`}`}
        />
        {this.renderOtherContents(rootCssClassName)}
      </div>
    );
  }

  /**
   * Gets the CSS class name (singular) for this field's root element.
   * @returns The CSS class name (singular) for this field's root element.
   */
  protected abstract getRootCssClassName(): string | undefined;


  /**
   * Renders additional contents in this field's root container.
   * @param rootCssClassName The CSS class name for this field's root element.
   * @returns Additional contents in this field's root container, as a VNode, or `null` if there are no additional
   * contents.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected renderOtherContents(rootCssClassName: string | undefined): VNode | null {
    return null;
  }

  /** @inheritdoc */
  public destroy(): void {

    this.cleanupRequest();

    for (const def of this.inputDefinitions.values()) {
      def.ref.getOrDefault()?.destroy();
    }
  }
}

import {
  ComponentProps, FSComponent, LifecycleComponent, Subject, Subscribable, SubscribableUtils, ToggleableClassNameRecord, VNode
} from '@microsoft/msfs-sdk';

import { IconBackspaceArrow } from '../Assets/SVGs/IconBackspaceArrow';

import './VirtualKeyboard.css';

/**
 * Style types for the keyboard button
 */
export enum KeyboardButtonStyleType {
  // Alphanumeric Keyboard Button Types
  AlphanumericAlphaKey = 'vkb-alphanumeric-key',
  AlphanumericNumpadKey = 'vkb-alphanumeric-numpad-key',
  AlphanumericSpecialKey = 'vkb-alphanumeric-special-key',
  AlphanumericAlphaModeKey = 'vkb-alphanumeric-key vkb-alphanumeric-mode-key',
  AlphanumericNumpadModeKey = 'vkb-alphanumeric-numpad-key vkb-alphanumeric-numpad-mode-key',
  AlphanumericShiftKey = 'vkb-alphanumeric-key vkb-alphanumeric-shift-key',
  AlphanumericSpaceKey = 'vkb-alphanumeric-key vkb-alphanumeric-space-key',
  AlphanumericEnterAlphaKey = 'vkb-alphanumeric-key vkb-alphanumeric-enter-key',
  AlphanumericEnterNumpadKey = 'vkb-alphanumeric-numpad-enter-key',
  AlphanumericBackspaceAlphaKey = 'vkb-alphanumeric-backspace-key',
  AlphanumericBackspaceNumpadKey = 'vkb-alphanumeric-numpad-backspace-key',
  AlphanumericAlphaCloseKey = 'vkb-alphanumeric-key vkb-alphanumeric-close-key',
  AlphanumericNumpadCloseKey = 'vkb-alphanumeric-close-key vkb-alphanumeric-numpad-close-key',

  // XPDR Transponder Keyboard Button Types
  XpdrDigitKey = 'xpdr-key vkb-xpdr-first-row-key',
  XpdrModeKey = 'xpdr-key vkb-xpdr-mode-key',
  XpdrVfrKey = 'xpdr-key vkb-xpdr-vfr-key',
  XpdrIdentKey = 'xpdr-key vkb-xpdr-ident-key',
  XpdrClrKey = 'xpdr-key vkb-xpdr-clr-key',
  XpdrCloseKey = 'xpdr-key vkb-xpdr-first-row-key vkb-xpdr-close-key',
}

/**
 * Props for the KeyboardButton component
 */
export interface KeyboardButtonProps extends ComponentProps {
  /** The label for the button */
  label: string | Subscribable<string>;
  /** Whether the button is disabled */
  disabled?: Subscribable<boolean> | boolean;
  /** Callback for when the button is pressed */
  onPressed?: () => void;
  /** The type of the button */
  type: KeyboardButtonStyleType;
}

/**
 * A simple button component for the keyboard
 */
export class KeyboardButton extends LifecycleComponent<KeyboardButtonProps> {
  protected readonly isDisabled = SubscribableUtils.toSubscribable(this.props.disabled ?? false, true) as Subscribable<boolean>;
  protected readonly isEnabled = this.isDisabled.map(isDisabled => !isDisabled).withLifecycle(this.defaultLifecycle);

  protected readonly isPrimed = Subject.create<boolean>(false);
  protected readonly isPressEffectImageHidden = this.isPrimed.map(isPrimed => !isPrimed).withLifecycle(this.defaultLifecycle);

  protected readonly mouseDownListener = this.onMouseDown.bind(this);
  protected readonly mouseUpListener = this.onMouseUp.bind(this);
  protected readonly mouseLeaveListener = this.onMouseLeave.bind(this);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  /**
   * Responds to mouse down events on this button's root element.
   */
  protected onMouseDown(): void {
    if (!this.isEnabled.get()) {
      return;
    }
    this.isPrimed.set(true);
  }

  /**
   * Responds to mouse up events on this button's root element.
   */
  protected onMouseUp(): void {
    const wasPrimed = this.isPrimed.get();
    this.isPrimed.set(false);
    if (wasPrimed && this.isEnabled.get()) {
      this.onPressed();
    }
  }

  /**
   * Responds to mouse leave events on this button's root element.
   */
  protected onMouseLeave(): void {
    this.isPrimed.set(false);
  }

  /**
   * Responds to when this button is pressed.
   */
  protected onPressed(): void {
    this.props.onPressed?.();
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <KeyboardButtonBase
        {...this.props}
        mouseDownHandler={this.mouseDownListener}
        mouseUpHandler={this.mouseUpListener}
        mouseLeaveHandler={this.mouseLeaveListener}
      >
        <KeyboardButtonBase
          isPressEffectImage
          isHidden={this.isPressEffectImageHidden}
          {...this.props}
        />
      </KeyboardButtonBase>
    );
  }
}

/** Props for a KeyboardButtonBase component. */
interface KeyboardButtonBaseProps extends KeyboardButtonProps {
  /** Whether the button is interactive or the effect image when pressed. */
  isPressEffectImage?: boolean;
  /** Whether the button is hidden. */
  isHidden?: Subscribable<boolean>;
  /** An optional mousedown handler. */
  mouseDownHandler?: (event: MouseEvent) => void;
  /** An optional mouseup handler. */
  mouseUpHandler?: () => void;
  /** An optional mouseleave handler. */
  mouseLeaveHandler?: () => void;
}

/** A base component for the keyboard button that is used to render both the button itself and the effect image when pressed. */
class KeyboardButtonBase extends LifecycleComponent<KeyboardButtonBaseProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  private readonly alphaIsEnlarged: boolean = Boolean(this.props.isPressEffectImage) && [
    KeyboardButtonStyleType.AlphanumericAlphaKey, KeyboardButtonStyleType.AlphanumericShiftKey,
    KeyboardButtonStyleType.XpdrDigitKey, KeyboardButtonStyleType.XpdrIdentKey,
    KeyboardButtonStyleType.XpdrModeKey, KeyboardButtonStyleType.XpdrVfrKey,
  ].includes(this.props.type);

  private readonly numpadIsEnlarged: boolean = Boolean(this.props.isPressEffectImage) &&
    this.props.type === KeyboardButtonStyleType.AlphanumericNumpadKey;

  private propClasses: ToggleableClassNameRecord = this.props.type.split(' ')
    .filter(className => className.trim())
    .reduce((accum, className) => {
      accum[className] = true;
      return accum;
    }, {} as ToggleableClassNameRecord);

  private readonly isShift: boolean = this.props.type === KeyboardButtonStyleType.AlphanumericShiftKey;

  private readonly isBackspace: boolean = this.props.type === KeyboardButtonStyleType.AlphanumericBackspaceAlphaKey
    || this.props.type === KeyboardButtonStyleType.AlphanumericBackspaceNumpadKey;

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    if (this.props.mouseDownHandler) {
      this.ref.instance.addEventListener('mousedown', this.props.mouseDownHandler);
    }
    if (this.props.mouseUpHandler) {
      this.ref.instance.addEventListener('mouseup', this.props.mouseUpHandler);
    }
    if (this.props.mouseLeaveHandler) {
      this.ref.instance.addEventListener('mouseleave', this.props.mouseLeaveHandler);
    }
  }

  /** @inheritDoc */
  render(): VNode {
    return (
      <div
        ref={this.ref}
        class={{
          'vkb-key': true,
          'vkb-key-press-effect': this.props.isPressEffectImage ?? false,
          'vkb-key-press-effect-alpha-enlarged': this.alphaIsEnlarged,
          'vkb-key-press-effect-numpad-enlarged': this.numpadIsEnlarged,
          disabled: this.props.disabled ?? false,
          hidden: this.props.isHidden ?? false,
          ...this.propClasses,
        }}
      >
        {!this.isShift && this.props.label}
        {this.isBackspace &&
          <div class="vkb-backspace-icon">
            <IconBackspaceArrow />
          </div>}
        {this.isShift &&
          <div class="vkb-shift-arrow"></div>}
        {this.props.children}
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    if (this.props.mouseDownHandler) {
      this.ref.instance.removeEventListener('mousedown', this.props.mouseDownHandler);
    }
    if (this.props.mouseUpHandler) {
      this.ref.instance.removeEventListener('mouseup', this.props.mouseUpHandler);
    }
    if (this.props.mouseLeaveHandler) {
      this.ref.instance.removeEventListener('mouseleave', this.props.mouseLeaveHandler);
    }
  }
}

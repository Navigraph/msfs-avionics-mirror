import { DisplayComponent, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { KeyboardButton, KeyboardButtonStyleType } from './KeyboardButton';

/**
 * Props for the SymbolKeyboard component
 */
export interface SymbolKeyboardProps {
  /** Callback for when a key is pressed */
  onKeyPressed?: (char: string) => void;
  /** Callback for when backspace is pressed */
  onBackspacePressed?: () => void;
  /** Callback for when enter is pressed */
  onEnterPressed?: () => void;
  /** Callback for when close is pressed */
  onClosePressed?: () => void;
  /** Callback for when mode is pressed */
  onModePressed?: () => void;
  /** Whether to disable the keyboard mode switch */
  disableModeSwitch?: Subscribable<boolean>;
}

/**
 * Symbol Keyboard component for IFD
 */
export class SymbolKeyboard extends DisplayComponent<SymbolKeyboardProps> {
  /**
   * Renders the Symbol keyboard
   * @returns VNode The rendered Symbol keyboard
   */
  public render(): VNode {
    return (
      <div class="vkb-display-none vkb-layout-symbol">
        <div class="vkb-row-alpha-1">
          <div class="vkb-spacer-row-1"></div>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(char =>
            <KeyboardButton
              type={KeyboardButtonStyleType.AlphanumericAlphaKey}
              label={char}
              onPressed={this.props.onKeyPressed?.bind(this, char)}
            />
          )}
          <KeyboardButton
            type={KeyboardButtonStyleType.AlphanumericAlphaCloseKey}
            label="X"
            onPressed={this.props.onClosePressed}
          />
        </div>
        <div class="vkb-row-alpha-2-3">
          <div class="vkb-spacer-row-2-3"></div>
          {['!', '@', '#', '$', '%', '&', '*', '\\', '/'].map(char =>
            <KeyboardButton
              type={KeyboardButtonStyleType.AlphanumericAlphaKey}
              label={char}
              onPressed={this.props.onKeyPressed?.bind(this, char)}
            />
          )}
        </div>
        <div class="vkb-row-alpha-2-3">
          <div class="vkb-spacer-row-2-3"></div>
          <KeyboardButton
            type={KeyboardButtonStyleType.AlphanumericShiftKey}
            label=""
            disabled={Subject.create(true)}
            onPressed={this.props.onKeyPressed?.bind(this, ' ')}
          />
          {['_', '-', '+', '=', ':', ',', '?', '.'].map(char =>
            <KeyboardButton
              type={KeyboardButtonStyleType.AlphanumericAlphaKey}
              label={char}
              onPressed={this.props.onKeyPressed?.bind(this, char)}
            />
          )}
        </div>
        <div class="vkb-row-alpha-4 vkb-row-function">
          <div class="vkb-spacer-row-4"></div>
          <KeyboardButton
            type={KeyboardButtonStyleType.AlphanumericAlphaModeKey}
            label='ABC...'
            disabled={this.props.disableModeSwitch}
            onPressed={this.props.onModePressed}
          />
          <KeyboardButton
            type={KeyboardButtonStyleType.AlphanumericSpaceKey}
            label="SPC"
            onPressed={this.props.onKeyPressed?.bind(this, ' ')}
          />
        </div>
        <KeyboardButton
          type={KeyboardButtonStyleType.AlphanumericBackspaceAlphaKey}
          label="CLR"
          onPressed={this.props.onBackspacePressed}
        />
        <KeyboardButton
          type={KeyboardButtonStyleType.AlphanumericEnterAlphaKey}
          label="ENTR"
          onPressed={this.props.onEnterPressed}
        />
      </div>
    );
  }
}

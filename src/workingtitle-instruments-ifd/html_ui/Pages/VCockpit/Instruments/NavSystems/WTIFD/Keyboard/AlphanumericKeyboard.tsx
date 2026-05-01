import { DisplayComponent, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { KeyboardButton, KeyboardButtonStyleType } from './KeyboardButton';

/**
 * Props for the AlphanumericKeyboard component
 */
export interface AlphanumericKeyboardProps {
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
 * Alphanumeric Keyboard component for IFD
 */
export class AlphanumericKeyboard extends DisplayComponent<AlphanumericKeyboardProps> {
  /**
   * Renders the alphanumeric keyboard
   * @returns VNode The rendered alphanumeric keyboard
   */
  public render(): VNode {
    return (
      <div class="vkb-display-none vkb-layout-alpha">
        <div class="vkb-row-alpha-1">
          <div class="vkb-spacer-row-1"></div>
          {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map(char =>
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
          {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map(char =>
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
          {['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.'].map(char =>
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
            label='123...'
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

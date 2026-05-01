import { DisplayComponent, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { KeyboardButton, KeyboardButtonStyleType } from './KeyboardButton';

/**
 * Props for the NumpadKeyboard component
 */
export interface NumpadKeyboardProps {
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
 * Numpad Keyboard component for IFD
 */
export class NumpadKeyboard extends DisplayComponent<NumpadKeyboardProps> {
  /**
   * Renders the numpad keyboard
   * @returns VNode The rendered numpad keyboard
   */
  public render(): VNode {
    return (
      <div class="vkb-display-none vkb-layout-numpad">
        <div class="vkb-numpad-layout">
          <div class="vkb-numpad-group">
            <div class="vkb-row-numpad">
              {['1', '2', '3'].map(char =>
                <KeyboardButton
                  type={KeyboardButtonStyleType.AlphanumericNumpadKey}
                  label={char}
                  onPressed={this.props.onKeyPressed?.bind(this, char)}
                />
              )}
              <KeyboardButton
                type={KeyboardButtonStyleType.AlphanumericNumpadCloseKey}
                label="X"
                onPressed={this.props.onClosePressed}
              />
            </div>
            <div class="vkb-row-numpad">
              {['4', '5', '6'].map(char =>
                <KeyboardButton
                  type={KeyboardButtonStyleType.AlphanumericNumpadKey}
                  label={char}
                  onPressed={this.props.onKeyPressed?.bind(this, char)}
                />
              )}
            </div>
            <div class="vkb-row-numpad">
              {['7', '8', '9'].map(char =>
                <KeyboardButton
                  type={KeyboardButtonStyleType.AlphanumericNumpadKey}
                  label={char}
                  onPressed={this.props.onKeyPressed?.bind(this, char)}
                />
              )}
            </div>
            <div class="vkb-row-numpad">
              <KeyboardButton
                type={KeyboardButtonStyleType.AlphanumericNumpadModeKey}
                label='ABC...'
                disabled={this.props.disableModeSwitch}
                onPressed={this.props.onModePressed}
              />
              <KeyboardButton
                type={KeyboardButtonStyleType.AlphanumericNumpadKey}
                label='0'
                onPressed={this.props.onKeyPressed?.bind(this, '0')}
              />
              <KeyboardButton
                type={KeyboardButtonStyleType.AlphanumericNumpadKey}
                label='.'
                onPressed={this.props.onKeyPressed?.bind(this, '.')}
              />
            </div>
          </div>
        </div>
        <KeyboardButton
          type={KeyboardButtonStyleType.AlphanumericBackspaceNumpadKey}
          label="CLR"
          onPressed={this.props.onBackspacePressed}
        />
        <KeyboardButton
          type={KeyboardButtonStyleType.AlphanumericEnterNumpadKey}
          label="ENTR"
          onPressed={this.props.onEnterPressed}
        />
      </div>
    );
  }
}

import { ControlEvents, DisplayComponent, EventBus, FSComponent, VNode, XPDRMode } from '@microsoft/msfs-sdk';

import { IfdTransponderManager } from '../Events/IfdTransponderManager';
import { KeyboardButton, KeyboardButtonStyleType } from './KeyboardButton';

/**
 * Props for the XpdrKeyboard component
 */
export interface XpdrKeyboardProps {
  /** Callback for when a key is pressed */
  onKeyPressed?: (char: string) => void;
  /** Callback for when backspace is pressed */
  onBackspacePressed?: () => void;
  /** Callback for when enter is pressed */
  onEnterPressed?: () => void;
  /** Callback for when close is pressed */
  onClosePressed?: () => void;
  /** An instance of the EventBus */
  bus: EventBus;
  /** An instance of the IfdTransponderManager */
  xpdrManager: IfdTransponderManager;
  /** onEnterCallback */
  onEnterCallback?: (value: string) => void;
}

/**
 * XPDR Transponder Keyboard component for IFD
 */
export class XpdrKeyboard extends DisplayComponent<XpdrKeyboardProps> {
  /**
   * Renders the XPDR Transponder keyboard
   * @returns VNode The rendered XPDR keyboard
   */
  public render(): VNode {
    return (
      <div class="vkb-mode-xpdr">
        {/* Top row - Digits 0-7 and close button */}
        <div class="vkb-xpdr-1-row">
          {['0', '1', '2', '3', '4', '5', '6', '7'].map(digit =>
            <KeyboardButton
              type={KeyboardButtonStyleType.XpdrDigitKey}
              label={digit}
              onPressed={this.props.onKeyPressed?.bind(this, digit)}
            />
          )}
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrCloseKey}
            label="X"
            onPressed={this.props.onClosePressed}
          />
        </div>

        {/* Middle row - Mode keys */}
        <div class="vkb-xpdr-2-row">
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrModeKey}
            label="SBY"
            onPressed={() => {
              this.props.xpdrManager.setXpdrMode(XPDRMode.STBY);
              this.props.onClosePressed?.();
            }}
          />
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrModeKey}
            label="GND"
            onPressed={() => {
              this.props.xpdrManager.setXpdrMode(XPDRMode.GROUND);
              this.props.onClosePressed?.();
            }}
          />
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrModeKey}
            label="ON"
            onPressed={() => {
              this.props.xpdrManager.setXpdrMode(XPDRMode.ON);
              this.props.onClosePressed?.();
            }}
          />
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrModeKey}
            label="ALT"
            onPressed={() => {
              this.props.xpdrManager.setXpdrMode(XPDRMode.ALT);
              this.props.onClosePressed?.();
            }}
          />
        </div>

        {/* Bottom row - Function keys */}
        <div class="vkb-xpdr-3-row">
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrVfrKey}
            label="VFR"
            onPressed={() => this.props.onEnterCallback?.(
              [WorldRegion.NORTH_AMERICA, WorldRegion.AUSTRALIA]
                .includes(Simplane.getWorldRegion()) ? '1200' : '7000')}
          />
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrIdentKey}
            label="IDENT"
            onPressed={() => {
              this.props.bus.getPublisher<ControlEvents>().pub('xpdr_send_ident_1', true);
              this.props.onClosePressed?.();
            }}
          />
          <KeyboardButton
            type={KeyboardButtonStyleType.XpdrClrKey}
            label="CLR"
            onPressed={this.props.onBackspacePressed}
          />
        </div>
      </div>
    );
  }
}

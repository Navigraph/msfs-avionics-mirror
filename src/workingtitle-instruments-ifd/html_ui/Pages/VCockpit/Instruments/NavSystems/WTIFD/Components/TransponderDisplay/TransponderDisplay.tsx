import { ComponentProps, ControlEvents, EventBus, FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent, IfdInteractions } from '../../Events/IfdInteractionEvent';
import { IfdTransponderManager } from '../../Events/IfdTransponderManager';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../Keyboard/KeyboardTypes';
import { LineSelectKeyButton } from '../../LineSelectKeyButtons';
import { LskUtils } from '../../LineSelectKeyButtons/LskUtils';

import './TransponderDisplay.css';

/** Props for {@link TransponderDisplay} */
interface TransponderDisplayProps extends ComponentProps {
  /** An instance of the EventBus */
  bus: EventBus;
  /** An instance of the IfdTransponderManager */
  xpdrManager: IfdTransponderManager;
  /** Whether the component should be hidden*/
  isHidden: Subscribable<boolean>;
  /** The IfdInstrumentIndex */
  readonly ifdInstrumentIndex: number;
}

/**
 * Dumb component.
 * Displays the XPDR display on the top left corner of the left side panel
 */
export class TransponderDisplay extends LifecycleComponent<TransponderDisplayProps> {
  private readonly lskState = LskUtils.createState(true);
  private readonly identDivRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.lskState.lsk1.label.set(() => <>Ident</>);
    this.lskState.lsk1.onClick.set(this.sendIdent.bind(this));
    this.lskState.lsk1.isVisible.set(true);

    this.props.bus.getSubscriber<IfdInteractions>().on('ifd_interaction_event').handle((event) => {
      if (event === IfdInteractionEvent.LineSelectKey1 && this.props.isHidden.get() === false) {
        this.sendIdent();
      }
    });

    this.identDivRef.instance.addEventListener('click', this.editIdent.bind(this));
  }

  /** Opens the XPDR keyboard */
  private editIdent(): void {
    const pub = this.props.bus.getPublisher<IfdKeyboardControlEvents>();
    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.XPDR,
      keyboardInputType: KeyboardInputType.Ident,
      disableModeSwitch: true,
      initialShowNumpad: true,
      initialValue: this.props.xpdrManager.xpdrCode.get().toString() || '0000',
      instrumentIndex: this.props.ifdInstrumentIndex,
      onEnter: (value: string) => {
        if (value) {
          this.props.xpdrManager.setXpdrCode(Number(value));
        }
        this.sendIdent();
      },
      rowRef: null
    };

    pub.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /** Sends the transponder ident event on the bus */
  private sendIdent(): void {
    this.props.bus.getPublisher<ControlEvents>().pub(`xpdr_send_ident_${this.props.xpdrManager.transponderIndex}`, true);
  }

  /**
   * Renders the communication interface
   * @returns The virtual DOM node representing the transponder display
   */
  public render(): VNode {
    return (
      <div
        class={{
          'wt-ifd-transponder-display': true,
          'hidden': this.props.isHidden,
        }}
      >
        <div class="wt-ifd-transponder-block-container">
          <div class="top-container">
            <div ref={this.identDivRef} class={{
              'top-left-container': true,
              'wt-ifd-xpdr-code-value': true,
              'wt-ifd-freq-is-being-edited': this.props.xpdrManager.isBeingEdited,
            }}>
              {this.props.xpdrManager.xpdrCode.map((code) => code.toFixed(0).padStart(4, '0'))}
            </div>
            <div class="top-right-container">
              <div class="wt-ifd-xpdr-active-reply-flag-container">
                <div class={{
                  'wt-ifd-xpdr-active-reply-flag': true,
                  'hidden': this.props.xpdrManager.isXpdrActiveReply.map((v) => !v),
                }}>
                  R
                </div>
              </div>
              <div class="wt-ifd-xpdr-mode-value">
                {this.props.xpdrManager.xpdrModeDisplay}
              </div>
            </div>
          </div>
          <div class="bottom-container">
            <div class="wt-ifd-xpdr-code-title-container">
              <div class="wt-ifd-xpdr-code-title">
                Xpdr
              </div>
            </div>
            <div class="wt-ifd-xpdr-ident-button-container">
              <LineSelectKeyButton
                lskState={this.lskState.lsk1}
                isSelected={this.lskState.selectedButton.map(x => x === 1)}
                data-button-index="1"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();
    this.identDivRef.instance.removeEventListener('click', () => this.editIdent.bind(this));
  }
}

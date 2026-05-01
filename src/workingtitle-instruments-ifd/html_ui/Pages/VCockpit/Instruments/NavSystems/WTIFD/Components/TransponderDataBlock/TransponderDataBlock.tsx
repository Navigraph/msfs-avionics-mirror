import { ComponentProps, ControlEvents, EventBus, FSComponent, LifecycleComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent, IfdInteractions } from '../../Events/IfdInteractionEvent';
import { IfdTransponderManager } from '../../Events/IfdTransponderManager';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../Keyboard/KeyboardTypes';
import { LineSelectKeyButton } from '../../LineSelectKeyButtons';
import { LskUtils } from '../../LineSelectKeyButtons/LskUtils';

import './TransponderDataBlock.css';

/** Props for {@link TransponderDataBlock} */
interface TransponderDataBlockProps extends ComponentProps {
  /** An instance of the EventBus */
  readonly bus: EventBus;
  /** An instance of the IfdTransponderManager */
  readonly xpdrManager: IfdTransponderManager;
  /** The IfdInstrumentIndex */
  readonly ifdInstrumentIndex: number;
}

/**
 * Dumb component.
 * Displays the XPDR data block on the bottom left corner of the left side panel
 */
export class TransponderDataBlock extends LifecycleComponent<TransponderDataBlockProps> {
  private readonly lskState = LskUtils.createState(true);
  private readonly isBeingEdited = Subject.create<boolean>(false);
  private readonly xpdrModeDivRef = FSComponent.createRef<HTMLDivElement>();
  private readonly identDivRef = FSComponent.createRef<HTMLDivElement>();

  /** Opens the XPDR keyboard */
  private readonly editIdent = (): void => {
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
  };

  /** Sends the transponder ident event on the bus */
  private readonly sendIdent = (): void => {
    this.props.bus.getPublisher<ControlEvents>().pub(`xpdr_send_ident_${this.props.xpdrManager.transponderIndex}`, true);
  };

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.lskState.lsk1.label.set(() => <IdentLskLabel xpdrManager={this.props.xpdrManager} />);
    this.lskState.lsk1.onClick.set(this.sendIdent);
    this.lskState.lsk1.isVisible.set(true);

    this.props.bus.getSubscriber<IfdInteractions>().on('ifd_interaction_event').handle((event) => {
      if (event === IfdInteractionEvent.LineSelectKey1) {
        this.sendIdent();
      }
    }).withLifecycle(this.defaultLifecycle);

    this.identDivRef.instance.addEventListener('click', this.editIdent);
    this.xpdrModeDivRef.instance.addEventListener('click', this.editIdent);
  }

  /**
   * Renders the communication interface
   * @returns The virtual DOM node representing the transponder data block
   */
  public render(): VNode {
    return (
      <div class="wt-ifd-transponder-data-block">
        <div class="wt-ifd-transponder-block-container">
          <div class="wt-ifd-xpdr-mode-title">
            Xpdr Mode
          </div>
          <div ref={this.xpdrModeDivRef} class="wt-ifd-xpdr-mode-value">
            {this.props.xpdrManager.xpdrModeDisplay}
          </div>
          <div class="wt-ifd-xpdr-code-title">
            Xpdr Code
          </div>
          <div ref={this.identDivRef} class={{
            'wt-ifd-xpdr-code-value': true,
            'wt-ifd-freq-is-being-edited': this.isBeingEdited,
          }}>
            {this.props.xpdrManager.xpdrCode.map((code) => code.toFixed(0).padStart(4, '0')).withLifecycle(this.defaultLifecycle)}
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
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();
    this.identDivRef.instance.removeEventListener('click', this.editIdent);
    this.xpdrModeDivRef.instance.removeEventListener('click', this.editIdent);
  }
}

/** Props for the IDENT LSK label. */
interface IdentLskLabelProps {
  /** The transponder manager to use. */
  readonly xpdrManager: IfdTransponderManager;
}

/** The IDENT LSK label. */
class IdentLskLabel extends LifecycleComponent<IdentLskLabelProps> {
  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div class={{ 'wtdyne-text-green': this.props.xpdrManager.isIdentActive }}>Ident</div>
    );
  }
}

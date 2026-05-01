import {
  ComponentProps, ComSpacing, EventBus, FacilityLoader, FacilitySearchType, FSComponent, LifecycleComponent, NodeReference, RadioType, Subject, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { Fms } from '../../../../../Fms';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { KeyboardInputType } from '../../../../../Keyboard/KeyboardTypes';
import { ChannelSpacing, FrequencyInput } from '../FrequencyInput';
import { TextInputField } from '../TextInputField';

/**
 * Freuqency Keyboard Input types
 */
type FrequencyKeyboardTypes =
  | KeyboardInputType.Com_Frequency_Spacing833Khz
  | KeyboardInputType.Com_Frequency_Spacing25Khz
  | KeyboardInputType.Nav
  | KeyboardInputType.NavText;

/**
 * A request input for {@link FrequencyField}.
 */
export interface FrequencyFieldInput {
  /** The channel spacing to use when selecting a frequency. */
  spacing?: ComSpacing;
  /** The frequency, in hertz, initially loaded into the dialog at the start of the request. */
  initialValue: number;
  /** The radio type **/
  radioType: FrequencyKeyboardTypes;
}

/**
 * A COM frequency context.
 */
type ComFrequencyContext = {
  /** This context's COM spacing type. */
  readonly type: ComSpacing | 'TextField' | 'Nav';

  /** A reference to this context's frequency input. */
  readonly inputRef: NodeReference<FrequencyInput | TextInputField>;

  /** This context's frequency value. */
  readonly freqValue: Subject<number>;

  /** Whether this context's frequency input is hidden. */
  readonly hidden: Subject<boolean>;
}

/**
 * Props for {@FrequencyField}
 */
interface FrequencyFieldProps extends ComponentProps {
  /** Event bus */
  bus: EventBus;
  /** FMS instance */
  fms: Fms;
  /** Facility loader */
  facilityLoader: FacilityLoader;
  /** Is the keyboard numpad shown */
  showNumpad: Subject<boolean>;
}

/**
 * A field which allows the user to select a COM radio frequency.
 */
export class FrequencyField extends LifecycleComponent<FrequencyFieldProps> {
  private keyboardState = VirtualKeyboardState.getInstance();

  private readonly contexts: Record<FrequencyKeyboardTypes, ComFrequencyContext> = {
    [KeyboardInputType.Com_Frequency_Spacing25Khz]: {
      type: ComSpacing.Spacing25Khz,
      inputRef: FSComponent.createRef<FrequencyInput>(),
      freqValue: Subject.create(0),
      hidden: Subject.create<boolean>(true)
    },
    [KeyboardInputType.Com_Frequency_Spacing833Khz]: {
      type: ComSpacing.Spacing833Khz,
      inputRef: FSComponent.createRef<FrequencyInput>(),
      freqValue: Subject.create(0),
      hidden: Subject.create<boolean>(true)
    },
    [KeyboardInputType.Nav]: {
      type: 'Nav',
      inputRef: FSComponent.createRef<FrequencyInput>(),
      freqValue: Subject.create(0),
      hidden: Subject.create<boolean>(true)
    },
    [KeyboardInputType.NavText]: {
      type: 'TextField',
      inputRef: FSComponent.createRef<TextInputField>(),
      freqValue: Subject.create(0),
      hidden: Subject.create<boolean>(true)
    }
  };

  private activeContext?: ComFrequencyContext;


  /** @inheritdoc */
  public onRequest(input: FrequencyFieldInput): void {

    this.activeContext = this.contexts[input.radioType];
    this.activeContext.hidden.set(false);
    this.activeContext?.inputRef.instance.placeCursor(0);
    this.activeContext?.inputRef.instance.refresh();
  }


  /** @inheritDoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        this.onEnterPressed();
        return true;
      default:
        return false;
    }
  }

  /**
   * Responds to when one of keyboard number buttons is pressed.
   * @param value The value of the button that was pressed.
   */
  public onKeyPressed(value: number): void {
    this.activeContext?.inputRef.instance.onKeyPressed(value.toString());
    this.activeContext?.inputRef.instance.refresh();
  }

  /**
   * Gets the current value
   * @returns string - the current value
   */
  protected getValue(): string {
    return this.activeContext?.inputRef.instance.getValue() ?? '';
  }

  /**
   * Activate editing
   */
  public activateEditing = (): void => {
    this.keyboardState.setEditingActive(true);
    this.activeContext?.inputRef.instance.activateEditing(true);
  };

  /**
   * De-activate editing
   */
  public deactivateEditing = (): void => {
    this.keyboardState.setEditingActive(true);
    this.activeContext?.inputRef.instance.deactivateEditing();
  };

  /**
   * Handle enter press
   * @returns string
   */
  public onEnterPressed(): string {
    if (this.activeContext?.inputRef.instance instanceof TextInputField) {
      const selectedFacilityFrequency = this.activeContext.inputRef.instance.getFacilityFrequency();
      return selectedFacilityFrequency ? selectedFacilityFrequency.toFixed(2) : '';
    }
    const freqInHz = this.activeContext?.freqValue.get() ?? 0;
    const freqInMHz = freqInHz.toString().substring(0, 7);
    return freqInMHz.substring(0, 3) + '.' + freqInMHz.substring(3, 6);
  }

  /**
   * Responds to when one of this dialog's numeral buttons is pressed.
   * @param value The numeric value of the button that was pressed.
   */
  private onNumberPressed(value: number): void {
    this.activeContext?.inputRef.instance.onKeyPressed(value.toString());
  }

  /**
   * Responds to when this dialog's backspace button is pressed.
   */
  private onBackspacePressed(): void {
    this.activeContext?.inputRef.instance.backspace();
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    /** Switching between frequency/VOR text field */
    this.props.showNumpad.sub((v) => {
      if (this.activeContext?.type === 'Nav' || this.activeContext?.type === 'TextField') {
        this.activeContext?.hidden.set(true);
        this.deactivateEditing();

        if (this.activeContext?.type === 'Nav' && !v) {
          this.activeContext = this.contexts[KeyboardInputType.NavText];
        }
        if (this.activeContext?.type === 'TextField' && v) {
          this.activeContext = this.contexts[KeyboardInputType.Nav];
        }

        this.activeContext?.inputRef.instance.clearValue();
        this.activeContext?.inputRef.instance.refresh();
        this.activeContext?.hidden.set(false);
        this.activateEditing();
      }
    });
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="vkb-input">
        <FrequencyInput
          ref={this.contexts[KeyboardInputType.Com_Frequency_Spacing25Khz].inputRef}
          radioType={RadioType.Com}
          comChannelSpacing={ChannelSpacing.Spacing25Khz}
          frequency={this.contexts[KeyboardInputType.Com_Frequency_Spacing25Khz].freqValue}
          class={{ 'com-freq-dialog-input': true, 'com-freq-dialog-input-25': true, 'hidden': this.contexts[KeyboardInputType.Com_Frequency_Spacing25Khz].hidden }}
        />
        <FrequencyInput
          ref={this.contexts[KeyboardInputType.Com_Frequency_Spacing833Khz].inputRef}
          radioType={RadioType.Com}
          comChannelSpacing={ChannelSpacing.Spacing8_33Khz}
          frequency={this.contexts[KeyboardInputType.Com_Frequency_Spacing833Khz].freqValue}
          class={{ 'com-freq-dialog-input': true, 'com-freq-dialog-input-83': true, 'hidden': this.contexts[KeyboardInputType.Com_Frequency_Spacing833Khz].hidden }}
        />
        <FrequencyInput
          ref={this.contexts[KeyboardInputType.Nav].inputRef}
          radioType={RadioType.Nav}
          frequency={this.contexts[KeyboardInputType.Nav].freqValue}
          class={{ 'nav-freq-dialog-input': true, 'hidden': this.contexts[KeyboardInputType.Nav].hidden }}
        />
        <TextInputField
          bus={this.props.bus}
          ref={this.contexts[KeyboardInputType.NavText].inputRef}
          facLoader={this.props.facilityLoader}
          textInputSearchType={FacilitySearchType.Vor}
          fms={this.props.fms}
          class={{
            'hidden': this.contexts[KeyboardInputType.NavText].hidden
          }} />
      </div>
    );
  }
}

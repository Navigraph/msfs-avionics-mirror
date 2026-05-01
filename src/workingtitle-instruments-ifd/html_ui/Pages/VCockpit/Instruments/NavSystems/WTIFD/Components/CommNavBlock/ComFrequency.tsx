import { ComRadioIndex, ComSpacing, ConsumerSubject, FSComponent, MappedSubject, NumberFormatter, RadioType, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../Keyboard/KeyboardTypes';
import { ComRadioUserSettings } from '../../Settings/ComRadioUserSettings';
import { BaseFrequency } from './BaseFrequency';
import { RadioTuningControlModes } from './ComNavTypes';
import { FrequencyDisplay } from './FrequencyDisplay';
import { FrequencyVolume } from './FrequencyVolume';

import './ComFrequency.css';

const SpacingToInputType: Record<ComSpacing, KeyboardInputType> = {
  [ComSpacing.Spacing25Khz]: KeyboardInputType.Com_Frequency_Spacing25Khz,
  [ComSpacing.Spacing833Khz]: KeyboardInputType.Com_Frequency_Spacing833Khz,
};

/**
 * Smart component.
 * Displays a formatted COM frequency string, frequency facility data,
 * and frequency transmitting/receiving status.
 */
export class ComFrequency extends BaseFrequency {
  private readonly pub = this.props.bus.getPublisher<IfdKeyboardControlEvents>();

  private readonly index = this.props.index as ComRadioIndex;
  private readonly spacing = ComRadioUserSettings.getManager(this.props.bus).getSetting('comSpacing');
  private readonly facilityIdent = ConsumerSubject.create(this.radioSub.on(`com_active_facility_ident_${this.index}`), '');
  private readonly facilityName = ConsumerSubject.create(this.radioSub.on(`com_active_facility_name_${this.index}`), '');
  private readonly facilityType = ConsumerSubject.create(this.radioSub.on(`com_active_facility_type_${this.index}`), '');
  private readonly ref = FSComponent.createRef<FrequencyDisplay>();
  private readonly divRef = FSComponent.createRef<HTMLDivElement>();
  private freqFormatter = NumberFormatter.create({ precision: 0.001 });
  private readonly frequency = this.props.isActiveFreq
    ? ConsumerSubject.create(this.radioSub.on(`com_active_frequency_${this.index}`), 0).withLifecycle(this.defaultLifecycle)
    : this.props.ifdTuningControlManager.getStandbyFrequencySubscribable(this.props.standbyIndex ?? 1, RadioType.Com);
  private readonly frequencyEdit = this.props.frequencyEditDisplay ?? Subject.create<string | null>(null);

  private readonly powered = ConsumerSubject.create(this.powerSub.on(`elec_circuit_com_on_${this.props.index}`), true);

  private readonly volume = ConsumerSubject.create(this.radioSub.on(`com_volume_${this.index}`), 1);

  private readonly freqStatusFlag = MappedSubject.create(
    ([isTx, isRx]) => isTx ? 'Tx' : (isRx ? 'Rx' : ''),
    ConsumerSubject.create(this.radioSub.on(`com_transmit_${this.index}`), false),
    ConsumerSubject.create(this.radioSub.on(`com_receive_${this.index}`), false),
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Com frequency click handler
   */
  private handleClick(): void {
    this.props.ifdTuningControlManager.activateTuningMode(RadioTuningControlModes.COM);

    if (!this.powered.get()) {
      return;
    }

    const spacing = this.spacing.get();

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: SpacingToInputType[spacing],
      disableModeSwitch: true,
      initialShowNumpad: true,
      initialValue: this.freqFormatter(this.props.ifdTuningControlManager.getStandbyFrequencySubscribable(this.props.standbyIndex ?? 1, RadioType.Com).get()).toString(),
      instrumentIndex: this.props.ifdInstrumentIndex,
      onValueChanged: (value: string) => {
        const padded = (value.replace('.', '') + '------').substring(0, 6);
        const formattedValue = padded.substring(0, 3) + '.' + padded.substring(3);
        this.frequencyEdit.set(formattedValue);
      },
      onEnter: (value: string) => {
        if (value) {
          const numValue = Number(value);
          this.props.ifdTuningControlManager.setComStandbyFrequency(numValue);
        }
      },
      onClose: () => {
        this.frequencyEdit.set(null);
      },
      rowRef: null
    };

    this.pub.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(this.powered);
    this.register(this.freqStatusFlag);
    this.register(this.facilityType);
    this.register(this.facilityName);
    this.register(this.facilityIdent);

    this.frequency.sub(this.triggerEditEffect.bind(this)).withLifecycle(this.defaultLifecycle);
    this.divRef.instance.addEventListener('click', this.handleClick.bind(this));

    // hide the keyboard if the radio goes away and we are currently editing
    this.powered.sub((isPowered) => {
      if (!isPowered && this.frequencyEdit.get() !== null) {
        this.pub.pub('keyboard_close', undefined, true, false);
      }
    }).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public override render(): VNode {
    return (
      <div class={{
        'active-freq': this.props.isActiveFreq,
        'standby-freq': !this.props.isActiveFreq,
        'wt-ifd-com-frequency-container': true
      }}>
        <FrequencyDisplay
          ref={this.ref}
          divRef={this.divRef}
          isPowered={this.powered}
          isActiveFreq={this.props.isActiveFreq}
          isFocused={this.props.isFocused}
          isBeingEdited={this.isFreqBeingEdited}
          isRecentlySwapped={this.props.isRecentlySwapped}
          isRemoteTuningEnabled={this.props.ifdTuningControlManager.isRemoteTuningEnabled}
          displayIndex={this.props.displayIndex}
          frequency={this.frequency}
          frequencyEdit={this.frequencyEdit}
          freqSpacing={this.spacing}
          decimals={3} // The COM frequencies are always displayed with 3 decimals, even in 25 kHz spacing
          hasTxRxFlag={this.props.hasFrequencyFlag}
          frequencyFlag={this.freqStatusFlag}
          isFacilityFlagHidden={this.isFacilityFlagHidden}
          facilityDefaultText='COM'
          facilityName={this.facilityName}
          facilityIdent={this.facilityIdent}
          facilityType={this.facilityType}
        />
        {this.props.isActiveFreq && (
          <FrequencyVolume
            volume={this.volume}
            isFocused={this.props.isFocused}
          />
        )}
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    super.destroy();
    this.divRef.instance.removeEventListener('click', () => null);
  }
}

import { ConsumerSubject, FSComponent, MappedSubject, NavRadioIndex, NumberFormatter, RadioType, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../Keyboard/KeyboardTypes';
import { BaseFrequency } from './BaseFrequency';
import { RadioTuningControlModes } from './ComNavTypes';
import { FrequencyDisplay } from './FrequencyDisplay';
import { FrequencyVolume } from './FrequencyVolume';

import './NavFrequency.css';

/**
 * Smart component.
 * Displays a formatted NAV frequency string, frequency facility data,
 * and frequency transmitting/receiving status.
 */
export class NavFrequency extends BaseFrequency {
  private readonly pub = this.props.bus.getPublisher<IfdKeyboardControlEvents>();

  private readonly index = this.props.index as NavRadioIndex;
  private readonly powered = ConsumerSubject.create(this.powerSub.on(`elec_circuit_nav_on_${this.index}`), true);
  private readonly signalIsDetected = ConsumerSubject.create(this.radioSub.on('nav_has_nav_1'), false);
  private readonly facilityIdent = ConsumerSubject.create(this.radioSub.on(`nav_ident_${this.index}`), '');
  private readonly freqStatusFlag = Subject.create<string>('ID');
  private readonly ref = FSComponent.createRef<FrequencyDisplay>();
  private readonly divRef = FSComponent.createRef<HTMLDivElement>();

  private readonly frequency = this.props.isActiveFreq
    ? ConsumerSubject.create(this.radioSub.on(`nav_active_frequency_${this.index}`), 0).withLifecycle(this.defaultLifecycle)
    : this.props.ifdTuningControlManager.getStandbyFrequencySubscribable(this.props.standbyIndex ?? 1, RadioType.Nav);
  private readonly frequencyEdit = this.props.frequencyEditDisplay ?? Subject.create<string | null>(null);
  private freqFormatter = NumberFormatter.create({ precision: 0.001 });
  private readonly volume = ConsumerSubject.create(this.radioSub.on(`nav_volume_${this.index}`), 1);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(this.powered);
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

  /**
   * Nav frequency click handler
   */
  private handleClick(): void {
    this.props.ifdTuningControlManager.activateTuningMode(RadioTuningControlModes.NAV);

    if (!this.powered.get()) {
      return;
    }

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: KeyboardInputType.Nav,
      disableModeSwitch: false,
      initialShowNumpad: true,
      initialValue: this.freqFormatter(this.props.ifdTuningControlManager.getStandbyFrequencySubscribable(this.props.standbyIndex ?? 1, RadioType.Nav).get()).toString(),
      instrumentIndex: this.props.ifdInstrumentIndex,
      onValueChanged: (value: string) => {
        const padded = (value.replace('.', '') + '-----').substring(0, 5);
        const formattedValue = padded.substring(0, 3) + '.' + padded.substring(3);
        // don't sync text entries
        if (!isNaN(Number(formattedValue))) {
          this.frequencyEdit.set(formattedValue);
        }
      },
      onEnter: (value: string) => {
        if (value) {
          const numValue = Number(value);
          this.props.ifdTuningControlManager.setNavStandbyFrequency(numValue);
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
  public override render(): VNode {
    return (
      <div class={{
        'active-freq': this.props.isActiveFreq,
        'standby-freq': !this.props.isActiveFreq,
        'wt-ifd-nav-frequency-container': true
      }}>
        <FrequencyDisplay
          ref={this.ref}
          isPowered={this.powered}
          isActiveFreq={this.props.isActiveFreq}
          isFocused={this.props.isFocused}
          isBeingEdited={this.isFreqBeingEdited}
          isRecentlySwapped={this.props.isRecentlySwapped}
          isRemoteTuningEnabled={this.props.ifdTuningControlManager.isRemoteTuningEnabled}
          displayIndex={this.props.displayIndex}
          frequency={this.frequency}
          frequencyEdit={this.frequencyEdit}
          decimals={2}
          hasTxRxFlag={this.props.hasFrequencyFlag}
          frequencyFlag={this.freqStatusFlag}
          isFacilityFlagHidden={MappedSubject.create(
            ([facilityFlagIsHidden, signalIsDetected]) => facilityFlagIsHidden || !signalIsDetected,
            this.isFacilityFlagHidden,
            this.signalIsDetected,
          )}
          facilityDefaultText='NAV'
          facilityName={this.facilityIdent}
          facilityIdent={this.facilityIdent}
          facilityType={this.facilityIdent}
          divRef={this.divRef}
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

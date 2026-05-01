import {
  ComponentProps, ComSpacing, EventBus, FSComponent, LifecycleComponent, MappedSubject, MathUtils, RadioFrequencyFormatter, RadioUtils, Subject, Subscribable,
  UserSetting, VNode
} from '@microsoft/msfs-sdk';

import { TouchButton } from '../../../../Components/TouchButton/TouchButton';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../../Keyboard/KeyboardTypes';
import { IfdInteractionEventHandler } from '../../../../RightKnob/IfdInteractionEventHandler';

/** Props for the {@link ComPresetRow} component. */
interface ComPresetRowProps extends ComponentProps {
  /** The event bus. */
  readonly bus: EventBus;
  /** The IFD instrument index */
  readonly ifdInstrumentIndex: number;
  /** The index of the row. */
  readonly index: number;
  /** The index of the selected row. */
  readonly selectedIndex: Subject<number>;
  /** Whether the editing mode is active. */
  readonly editingActive: Subject<boolean>;
  /** The user setting for the preset frequency. */
  readonly presetFrequencySetting: UserSetting<number>;
  /** The spacing setting. */
  readonly comSpacing: UserSetting<ComSpacing>;
  /** The last selected preset index. */
  readonly lastSelectedPresetIndex: Subscribable<number>;
  /** Function to tune a preset by index. */
  readonly tunePresetByIndex: (index: number) => void;
}

/** A row in the COM preset menu. */
export class ComPresetRow extends LifecycleComponent<ComPresetRowProps> implements IfdInteractionEventHandler {
  private static readonly COM_PRESET_FREQ_FORMATTER = RadioFrequencyFormatter.createCom(ComSpacing.Spacing833Khz, '<BLANK>');

  private readonly presetFrequencyDisplay = Subject.create('&lt;BLANK&gt;');
  private readonly isFrequencyBlank = Subject.create(true);

  private readonly knobEditingActive = Subject.create(false);
  private readonly temporaryFrequency = Subject.create<number | null>(null);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    MappedSubject.create(this.props.presetFrequencySetting, this.temporaryFrequency, this.knobEditingActive)
      .sub(([presetFreq, tempFreq, knobEditingActive]) => {
        if (knobEditingActive && tempFreq !== null) {
          this.presetFrequencyDisplay.set(ComPresetRow.COM_PRESET_FREQ_FORMATTER(tempFreq * 1_000_000));
        } else {
          this.presetFrequencyDisplay.set(ComPresetRow.COM_PRESET_FREQ_FORMATTER(presetFreq !== 0 ? presetFreq * 1_000_000 : NaN));
        }
        this.isFrequencyBlank.set(presetFreq === 0);
      }, true).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritDoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.props.index !== this.props.selectedIndex.get()) {
      return false;
    }

    const presetFrequency = this.props.presetFrequencySetting.get();
    const tempFrequency = this.temporaryFrequency.get() ?? 118;
    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        if (this.knobEditingActive.get()) {
          this.saveNewPresetFrequency(tempFrequency ?? 0);
        } else {
          this.temporaryFrequency.set(presetFrequency === 0 ? 118 : presetFrequency);
          this.knobEditingActive.set(true);
          this.props.editingActive.set(true);
        }
        return true;
      case IfdInteractionEvent.RightKnobOuterDec:
        if (this.knobEditingActive.get() && tempFrequency !== 0) {
          this.temporaryFrequency.set(Math.max(tempFrequency - 1, 118));
          return true;
        }
        break;
      case IfdInteractionEvent.RightKnobOuterInc:
        if (this.knobEditingActive.get() && tempFrequency !== 0) {
          this.temporaryFrequency.set(Math.min(tempFrequency + 1, this.props.comSpacing.get() === ComSpacing.Spacing833Khz ? 136.990 : 136.975));
          return true;
        }
        break;
      case IfdInteractionEvent.RightKnobInnerDec:
        if (this.knobEditingActive.get() && tempFrequency !== 0) {
          if (this.props.comSpacing.get() === ComSpacing.Spacing833Khz) {
            this.temporaryFrequency.set(this.stepValidCom833Or25Frequency(tempFrequency, 'dec'));
          } else {
            this.temporaryFrequency.set(Math.max(tempFrequency - 0.025, 118));
          }
          return true;
        }
        break;
      case IfdInteractionEvent.RightKnobInnerInc:
        if (this.knobEditingActive.get() && tempFrequency !== 0) {
          if (this.props.comSpacing.get() === ComSpacing.Spacing833Khz) {
            this.temporaryFrequency.set(this.stepValidCom833Or25Frequency(tempFrequency, 'inc'));
          } else {
            this.temporaryFrequency.set(Math.min(tempFrequency + 0.025, 136.975));
          }
          return true;
        }
        break;
      case IfdInteractionEvent.CLR:
        if (this.knobEditingActive.get() || this.props.editingActive.get()) {
          this.saveNewPresetFrequency(0);
          return true;
        }
        break;
      case IfdInteractionEvent.ENTR:
        if (this.knobEditingActive.get()) {
          this.saveNewPresetFrequency(this.temporaryFrequency.get() ?? 0);
        } else {
          this.tunePresetAsStandby();
        }
        return true;
    }
    return false;
  }

  /**
   * Saves a new preset frequency to the user setting.
   * @param newFrequency The new preset frequency, in Megahertz.
   */
  private saveNewPresetFrequency(newFrequency: number): void {
    this.props.presetFrequencySetting.set(newFrequency);
    this.temporaryFrequency.set(null);
    this.knobEditingActive.set(false);
    this.props.editingActive.set(false);
  }

  /**
   * Tunes the preset as the standby COM frequency.
   * If the preset frequency is blank, the standby frequency will not change.
   */
  private tunePresetAsStandby(): void {
    if (!this.isFrequencyBlank.get()) {
      this.props.tunePresetByIndex(this.props.index);
    }
  }

  /**
   * Finds the previous/next valid COM frequency in 8.33 mode.
   * @param currentMhz The current COM frequency, in Megahertz.
   * @param direction The direction to search in.
   * @returns The next/previous valid COM frequency, in Megahertz.
   */
  private stepValidCom833Or25Frequency(
    currentMhz: number,
    direction: 'inc' | 'dec',
  ): number {
    const minKhz = 118_000;
    const maxKhz = 136_990;

    const startKhz = Math.round(currentMhz * 1000);
    const deltaKhz = direction === 'inc' ? 5 : -5;

    let candidateKhz = startKhz + deltaKhz;

    while (candidateKhz >= minKhz && candidateKhz <= maxKhz) {
      const candidateMhz = candidateKhz / 1000;
      if (RadioUtils.isCom833Frequency(candidateMhz) || RadioUtils.isCom25Frequency(candidateMhz)) {
        return candidateMhz;
      }
      candidateKhz += deltaKhz;
    }

    return (direction === 'inc' ? maxKhz : minKhz) / 1000;
  }

  /**
   * Handles the button click event.
   *
   * If the row is not selected, it will select it.
   * If the row is selected:
   * - if editing is not active and the preset frequency is not blank, it will tune the preset as the standby COM frequency.
   * - if editing is active, it will open a keyboard to edit the preset frequency.
   */
  public onButtonClick(): void {
    if (this.props.index !== this.props.selectedIndex.get()) {
      this.props.selectedIndex.set(this.props.index);
      return;
    }
    if (this.props.editingActive.get()) {
      const pub = this.props.bus.getPublisher<IfdKeyboardControlEvents>();
      const spacing = this.props.comSpacing.get();

      const payload: TextEditRowKeyboardEvent = {
        type: VirtualKeyboardType.Alphanumeric,
        keyboardInputType: spacing === ComSpacing.Spacing833Khz ? KeyboardInputType.Com_Frequency_Spacing833Khz : KeyboardInputType.Com_Frequency_Spacing25Khz,
        disableModeSwitch: true,
        initialShowNumpad: true,
        initialValue: '118.000',
        instrumentIndex: this.props.ifdInstrumentIndex,
        onValueChanged: (value: string) => {
          const padded = (value.replace('.', '') + '------').substring(0, 6);
          const formattedValue = padded.substring(0, 3) + '.' + padded.substring(3);
          this.temporaryFrequency.set(parseFloat(formattedValue));
        },
        onEnter: (value: string) => {
          if (value) {
            const numValue = Number(value);
            this.props.presetFrequencySetting.set(MathUtils.clamp(numValue, 118.0, spacing === ComSpacing.Spacing25Khz ? 136.975 : 136.995));
            this.temporaryFrequency.set(null);
            this.knobEditingActive.set(false);
            this.props.editingActive.set(false);
          }
        },
        onClose: () => {
          this.temporaryFrequency.set(null);
          this.knobEditingActive.set(false);
          this.props.editingActive.set(false);
        },
        rowRef: null
      };

      pub.pub('text_edit_row_keyboard_open', payload, true, false);
    } else {
      this.tunePresetAsStandby();
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={{ 'com-preset-row': true, 'freq-blank': this.isFrequencyBlank, 'editing': this.knobEditingActive }}>
        <div class="com-preset-arrow-container">
          <div class={{
            'com-preset-arrow': true,
            hidden: this.props.lastSelectedPresetIndex.map(v => v !== this.props.index).withLifecycle(this.defaultLifecycle)
          }}>
            <svg viewBox="9 8 17.5 16" height="16" width="17.5">
              <path d="M 11 10 l 12.5 6 l -12.5 6 z" stroke="var(--wtdyne-color-cyan)" stroke-width="3" stroke-linejoin="round" fill="none" />
            </svg>
          </div>
        </div>
        <div class="com-preset-row-index">{this.props.index.toString()}</div>
        <TouchButton
          class="com-preset-button freq-button"
          label={this.presetFrequencyDisplay}
          isHighlighted={this.props.selectedIndex.map(v => v === this.props.index).withLifecycle(this.defaultLifecycle)}
          onPressed={this.onButtonClick.bind(this)}
        />
      </div>
    );
  }
}

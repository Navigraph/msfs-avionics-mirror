import {
  ComSpacing, ConsumerSubject, ConsumerValue, DebounceTimer, EventBus, FacilityLoader, KeyEventManager, KeyEvents, MappedSubject, MappedSubscribable, MathUtils,
  NavComEvents,
  NavRadioIndex, RadioType, SimVarValueType, Subject, Subscribable,
} from '@microsoft/msfs-sdk';

import { RadioTuningControlModes } from '../Components/CommNavBlock/ComNavTypes';
import { IfdOptions } from '../IfdOptions';
import { IfdInteractionEvent, IfdInteractions } from './IfdInteractionEvent';
import { IfdNavComManager } from './IfdNavComManager';
import { IfdTransponderManager } from './IfdTransponderManager';
import { ComRadioUserSettings } from '../Settings/ComRadioUserSettings';

/**
 * The IfdTuningControlsManager
 * Initializes an IfdNavComManager and an IfdTransponderManager.
 * Manages focus states, focus reset timer shared between COM NAV and Transponder blocks
 */
export class IfdTuningControlsManager {
  // Duration for COM/NAV frequencies and XPDR code edit effects
  public static readonly EDIT_EFFECT_TIME = 2_000; // 2 seconds
  public static readonly INACTIVITY_TIME = 20_000; // 20 seconds

  private readonly COM_SPACING_KEY_EVENT = `COM_${this.options.comIndex}_SPACING_MODE_SWITCH`;

  private readonly radioSub = this.bus.getSubscriber<NavComEvents>();
  private readonly keyEventSub = this.bus.getSubscriber<KeyEvents>();

  private readonly simComRadioSpacing = ConsumerSubject.create(this.radioSub.on(`com_spacing_mode_${this.options.comIndex}`), SimVar.GetSimVarValue(`COM SPACING MODE:${this.options.comIndex}`, 'number') as ComSpacing);
  private readonly simComStandbyFrequency = ConsumerSubject.create(this.radioSub.on(`com_standby_frequency_${this.options.comIndex}`).whenChanged(), NaN);
  private readonly simComActiveFrequencyValue = ConsumerValue.create(this.radioSub.on(`com_active_frequency_${this.options.comIndex}`).whenChanged(), NaN);
  private readonly simNavStandbyFrequency = ConsumerSubject.create(this.options.navIndex !== undefined ? this.radioSub.on(`nav_standby_frequency_${this.options.navIndex as NavRadioIndex}`).whenChanged() : null, NaN);

  private readonly comRadioUserSettings = ComRadioUserSettings.getManager(this.bus);
  private readonly comRadioSpacingUserSetting = this.comRadioUserSettings.getSetting('comSpacing');
  private readonly comRadioLastUsedPreset = this.comRadioUserSettings.getSetting('lastSelectedPresetIndex');

  private readonly controlSub = this.bus.getSubscriber<IfdInteractions>();
  private readonly activeRadioTuning = Subject.create<RadioTuningControlModes>(RadioTuningControlModes.COM);
  public readonly navComManager = new IfdNavComManager(this.bus, this.activeRadioTuning, this.options, this.facLoader);
  // FIXME don't instantiate if transponder is not enabled!
  public readonly xpdrManager = new IfdTransponderManager(this.bus, this.activeRadioTuning, this.options.enableTransponder ? 1 : 0);

  public readonly isRemoteTuningEnabled = this.options.enableRemoteTuning;

  private readonly _activeTuningControlModeResetTimer = new DebounceTimer();

  public readonly isComRecentlySwapped = Subject.create<boolean>(false);
  public readonly isNavRecentlySwapped = Subject.create<boolean>(false);

  public readonly isXpdrSelected = this.activeRadioTuning.map((v) => v === RadioTuningControlModes.XPDR) as Subscribable<boolean>;
  public readonly isComSelected = this.activeRadioTuning.map((v) => v === RadioTuningControlModes.COM) as MappedSubscribable<boolean>;
  public readonly isNavSelected = this.activeRadioTuning.map((v) => v === RadioTuningControlModes.NAV) as MappedSubscribable<boolean>;
  public readonly isNavOrComSelected = MappedSubject.create(
    ([isNavSelected, isComSelected]) => isNavSelected || isComSelected,
    this.isNavSelected,
    this.isComSelected
  ) as MappedSubscribable<boolean>;

  private readonly _selectedComStandbyIndex = Subject.create<1 | 2 | 3 | 4>(1);
  public readonly selectedComStandbyIndex = this._selectedComStandbyIndex as Subscribable<1 | 2 | 3 | 4>;
  private readonly _selectedNavStandbyIndex = Subject.create<1 | 2 | 3 | 4>(1);
  public readonly selectedNavStandbyIndex = this._selectedNavStandbyIndex as Subscribable<1 | 2 | 3 | 4>;

  private readonly _standbyComFrequency1 = Subject.create(124.850);
  private readonly _standbyComFrequency2 = Subject.create(124.850);
  private readonly _standbyComFrequency3 = Subject.create(124.850);
  private readonly _standbyComFrequency4 = Subject.create(124.850);

  private readonly _standbyNavFrequency1 = Subject.create(113.90);
  private readonly _standbyNavFrequency2 = Subject.create(113.90);
  private readonly _standbyNavFrequency3 = Subject.create(113.90);
  private readonly _standbyNavFrequency4 = Subject.create(113.90);

  /**
   * Constructor
   * @param bus An instance of the EventBus.
   * @param options The IfdOptions.
   * @param facLoader An instance of the facility loader
   */
  constructor(
    private readonly bus: EventBus,
    private readonly options: IfdOptions,
    private readonly facLoader: FacilityLoader,
  ) {
    this.activeRadioTuning.sub(this.startTuningControlModeResetTimer.bind(this));
    this.controlSub.on('ifd_interaction_event').handle(this.interactionEventHandler.bind(this));

    this.simComStandbyFrequency.sub((v) => this.updateStandbyFrequency(v, RadioType.Com), true);
    this.simNavStandbyFrequency.sub((v) => this.updateStandbyFrequency(v, RadioType.Nav), true);

    this._selectedComStandbyIndex.sub(index => {
      const simFreq = this.simComStandbyFrequency.get();
      const currentFreq = this.getStandbyFrequencySubject(index, RadioType.Com).get();
      if (MathUtils.round(currentFreq, 0.001) !== MathUtils.round(simFreq, 0.001)) {
        this.navComManager.setComStandbyFrequency(currentFreq);
      }
    }, true);
    this._selectedNavStandbyIndex.sub(index => {
      const simFreq = this.simNavStandbyFrequency.get();
      const currentFreq = this.getStandbyFrequencySubject(index, RadioType.Nav).get();
      if (MathUtils.round(currentFreq, 0.001) !== MathUtils.round(simFreq, 0.001)) {
        this.navComManager.setNavStandbyFrequency(currentFreq);
      }
    }, true);

    KeyEventManager.getManager(this.bus).then((manager) => {
      manager.interceptKey(this.COM_SPACING_KEY_EVENT, false);

      this.comRadioSpacingUserSetting.sub(v => {
        if (this.simComRadioSpacing.get() !== v) {
          manager.triggerKey(this.COM_SPACING_KEY_EVENT, true);
        }

        if (v === ComSpacing.Spacing25Khz) {
          this.validateAndResetComFrequencies();
        }
      }, true);
    });

    // Intercept and handle the com radio spacing mode switch key event
    this.keyEventSub.on('key_intercept').handle(event => {
      if (event.key === this.COM_SPACING_KEY_EVENT) {
        this.comRadioSpacingUserSetting.set(this.comRadioSpacingUserSetting.get() === ComSpacing.Spacing25Khz ? ComSpacing.Spacing833Khz : ComSpacing.Spacing25Khz);
      }
    });
  }

  /**
   * Sets the NAV standby frequency
   * @param frequency The frequency to set, in MHz
   */
  public setNavStandbyFrequency(frequency: number): void {
    this.navComManager.setNavStandbyFrequency(frequency);
    this.activateTuningMode(RadioTuningControlModes.NAV);
  }

  /**
   * Sets the COM standby frequency
   * @param frequency The frequency to set, in MHz
   */
  public setComStandbyFrequency(frequency: number): void {
    this.navComManager.setComStandbyFrequency(frequency);
    this.activateTuningMode(RadioTuningControlModes.COM);
  }

  /**
   * Updates the standby frequency for the specified radio type.
   * @param frequency The new frequency to set for the standby.
   * @param type The type of radio for which the standby frequency is being updated.
   */
  private updateStandbyFrequency(frequency: number, type: RadioType): void {
    const index = type === RadioType.Com ? this._selectedComStandbyIndex.get() : this._selectedNavStandbyIndex.get();
    this.getStandbyFrequencySubject(index, type).set(frequency);
  }

  /**
   * Increments the standby preset frequency by the given direction.
   * The index does not wrap around.
   *
   * HEvents to control the COM presets:
   * - WT_IFD_{instrumentIndex}_COM_PRESET_INC
   * - WT_IFD_{instrumentIndex}_COM_PRESET_DEC
   *
   * @param direction The direction to increment towards
   */
  private incrementStandbyPresetFrequency(direction: 1 | -1): void {
    let newPresetIndex = 0;
    let nextPresetFrequency = 0;

    for (let i = this.comRadioLastUsedPreset.get() + (direction === 1 ? 1 : -1); direction === 1 ? i <= 16 : i >= 1; direction === 1 ? i++ : i--) {
      const presetAtIndex = (i > 0 && i <= 16) ? this.comRadioUserSettings.getSetting(`presetFrequency_${i}`).get() : 0;
      if (!isNaN(presetAtIndex) && presetAtIndex !== 0) {
        newPresetIndex = i;
        nextPresetFrequency = presetAtIndex;
        break;
      }
    }

    if (nextPresetFrequency !== 0) {
      this.selectStandbyIndex(1, RadioType.Com);
      this.setComStandbyFrequency(nextPresetFrequency);
      this.comRadioLastUsedPreset.set(newPresetIndex);
    }
  }

  /**
   * Handles IFD interaction events
   * @param event The IfdInteractionEvent
   */
  private interactionEventHandler(event: IfdInteractionEvent): void {
    switch (event) {
      case IfdInteractionEvent.LeftKnobPush:
        switch (this.activeRadioTuning.get()) {
          case RadioTuningControlModes.COM:
            if (this.options.navIndex !== undefined) {
              this.activeRadioTuning.set(RadioTuningControlModes.NAV);
              this.startTuningControlModeResetTimer();
            } else if (this.options.enableTransponder) {
              this.activeRadioTuning.set(RadioTuningControlModes.XPDR);
              this.startTuningControlModeResetTimer();
            }
            break;
          case RadioTuningControlModes.NAV:
            if (this.options.enableTransponder) {
              this.activeRadioTuning.set(RadioTuningControlModes.XPDR);
              this.startTuningControlModeResetTimer();
            } else {
              this.activeRadioTuning.set(RadioTuningControlModes.COM);
            }
            break;
          case RadioTuningControlModes.XPDR:
            this.activeRadioTuning.set(RadioTuningControlModes.COM);
            break;
          default:
            break;
        }
        break;
      case IfdInteractionEvent.FrequencySwap:
        switch (this.activeRadioTuning.get()) {
          case RadioTuningControlModes.COM:
            this.isComRecentlySwapped.set(true);
            this.isNavRecentlySwapped.set(false);
            break;
          case RadioTuningControlModes.NAV:
            if (this.options.navIndex !== undefined) {
              this.isComRecentlySwapped.set(false);
              this.isNavRecentlySwapped.set(true);
            }
            break;
          default:
            this.isComRecentlySwapped.set(false);
            this.isNavRecentlySwapped.set(false);
            break;
        }
        break;
      case IfdInteractionEvent.LeftKnobOuterInc:
      case IfdInteractionEvent.LeftKnobOuterDec:
      case IfdInteractionEvent.LeftKnobInnerInc:
      case IfdInteractionEvent.LeftKnobInnerDec:
        this.startTuningControlModeResetTimer();
        break;
      case IfdInteractionEvent.ComPresetInc:
        this.incrementStandbyPresetFrequency(1);
        break;
      case IfdInteractionEvent.ComPresetDec:
        this.incrementStandbyPresetFrequency(-1);
        break;
      default:
        break;
    }
  }

  /**
   * Selects the given standby index for the radio type.
   * @param index The standby index to select.
   * @param type The radio type for which the index should be selected.
   */
  public selectStandbyIndex(index: 1 | 2 | 3 | 4, type: RadioType): void {
    if (type === RadioType.Nav) {
      this._selectedNavStandbyIndex.set(index);
    } else {
      this._selectedComStandbyIndex.set(index);
    }
  }

  /** Starts the 20-seconds timer of inactivity before switching tuning controls back to COM */
  public startTuningControlModeResetTimer(): void {
    this._activeTuningControlModeResetTimer.schedule(
      () => this.activeRadioTuning.set(RadioTuningControlModes.COM),
      IfdTuningControlsManager.INACTIVITY_TIME
    );
  }

  /**
   * Activates the given tuning control mode.
   * @param mode The tuning control mode to activate.
   */
  public activateTuningMode(mode: RadioTuningControlModes): void {
    this.activeRadioTuning.set(mode);
    this.startTuningControlModeResetTimer();
  }

  /**
   * Gets the subscribable containing the standby frequency of the given index for the radio type.
   * @param index The standby frequency index.
   * @param type The radio type.
   * @returns The subscribable with the standby frequency.
   */
  public getStandbyFrequencySubscribable(index: 1 | 2 | 3 | 4, type: RadioType): Subscribable<number> {
    return this.getStandbyFrequencySubject(index, type) as Subscribable<number>;
  }

  /**
   * Retrieves the standby frequency subject based on the provided index and radio type.
   * @param index - The index of the standby frequency subject to retrieve (1, 2, 3, or 4).
   * @param type - The type of radio (Com or Nav) to determine the relevant standby frequency subject.
   * @returns The corresponding standby frequency subject. Returns a default `Subject` with `NaN` if no matching index and type exist.
   */
  private getStandbyFrequencySubject(index: 1 | 2 | 3 | 4, type: RadioType): Subject<number> {
    if (type === RadioType.Com) {
      switch (index) {
        case 1:
          return this._standbyComFrequency1;
        case 2:
          return this._standbyComFrequency2;
        case 3:
          return this._standbyComFrequency3;
        case 4:
          return this._standbyComFrequency4;
      }
    }
    if (type === RadioType.Nav && this.options.navIndex !== undefined) {
      switch (index) {
        case 1:
          return this._standbyNavFrequency1;
        case 2:
          return this._standbyNavFrequency2;
        case 3:
          return this._standbyNavFrequency3;
        case 4:
          return this._standbyNavFrequency4;
      }
    }
    return Subject.create(NaN);
  }

  /**
   * Validates and resets the COM frequencies for 25 kHz spacing.
   *
   * If we had an 8.33 kHz frequency tuned before switching to 25 kHz spacing,
   * reset that given frequency to 118.000 MHz. This is consistent with the IFD trainer.
   */
  private validateAndResetComFrequencies(): void {
    const indexOrEmpty = this.options.comIndex === 1 ? '' : this.options.comIndex;

    const currentActive = this.simComActiveFrequencyValue.get();
    if (!isNaN(currentActive) && Math.trunc(currentActive * 1000) % 25 !== 0) {
      SimVar.SetSimVarValue(`K:COM${indexOrEmpty}_RADIO_SET_HZ`, SimVarValueType.Number, 118 * 1000000);
    }

    if (Math.trunc(this._standbyComFrequency1.get() * 1000) % 25 !== 0) {
      this._standbyComFrequency1.set(118);
    }
    if (Math.trunc(this._standbyComFrequency2.get() * 1000) % 25 !== 0) {
      this._standbyComFrequency2.set(118);
    }
    if (Math.trunc(this._standbyComFrequency3.get() * 1000) % 25 !== 0) {
      this._standbyComFrequency3.set(118);
    }
    if (Math.trunc(this._standbyComFrequency4.get() * 1000) % 25 !== 0) {
      this._standbyComFrequency4.set(118);
    }

    const currentStandby = this.simComStandbyFrequency.get();
    if (!isNaN(currentStandby) && Math.trunc(currentStandby * 1000) % 25 !== 0) {
      this.navComManager.setComStandbyFrequency(118);
    }
  }

  /** Pause the manager **/
  public pause(): void {
    this._activeTuningControlModeResetTimer.isPending() && this._activeTuningControlModeResetTimer.clear();
    this.isNavOrComSelected.isAlive && !this.isNavOrComSelected.isPaused && this.isNavOrComSelected.pause();
    this.isNavSelected.isAlive && !this.isNavSelected.isPaused && this.isNavSelected.pause();
    this.isComSelected.isAlive && !this.isComSelected.isPaused && this.isComSelected.pause();
  }

  /** Resume the manager **/
  public resume(): void {
    this.startTuningControlModeResetTimer();
    this.isNavOrComSelected.isAlive && this.isNavOrComSelected.isPaused && this.isNavOrComSelected.resume();
    this.isNavSelected.isAlive && this.isNavSelected.isPaused && this.isNavSelected.resume();
    this.isComSelected.isAlive && this.isComSelected.isPaused && this.isComSelected.resume();
  }

  /** Destroy the manager **/
  public destroy(): void {
    this._activeTuningControlModeResetTimer.isPending() && this._activeTuningControlModeResetTimer.clear();
    this.isNavOrComSelected.destroy();
    this.isNavSelected.destroy();
    this.isComSelected.destroy();
  }
}

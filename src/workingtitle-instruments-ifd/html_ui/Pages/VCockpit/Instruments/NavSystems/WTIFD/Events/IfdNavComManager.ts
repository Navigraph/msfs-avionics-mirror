import {
  ArraySubject, EventBus, FacilityFrequency, FacilityLoader, FacilitySearchType, FacilityType, MutableSubscribable, NavComEvents, RadioType, RegisteredSimVarUtils, SimVarValueType,
  Subscription,
} from '@microsoft/msfs-sdk';

import { RadioTuningControlModes } from '../Components/CommNavBlock/ComNavTypes';
import { IfdOptions } from '../IfdOptions';
import { IfdInteractionEvent, IfdInteractions } from './IfdInteractionEvent';

/** Interface for the InteractionEventMapItem */
interface InteractionEventMapItem {
  /** The IfdInteractionEvent name to be mapped */
  interactionEvent: IfdInteractionEvent;
  /** The KEvent name mapped to the IfdInteractionEvent */
  event: string;
}

/** Handles the effects of COM and NAV IfdInteractionEvents. */
export class IfdNavComManager {
  private readonly activeComFreqIdentSimvar = RegisteredSimVarUtils.create(`COM ACTIVE FREQ IDENT:${this.options.comIndex}`, SimVarValueType.String);

  private readonly controlSub = this.bus.getSubscriber<IfdInteractions>();

  private interactionEventSub: Subscription | undefined;

  private readonly comEventMapArray = this.generateInteractionEventMap(RadioType.Com);
  private readonly navEventMapArray = this.generateInteractionEventMap(RadioType.Nav);

  public readonly recentComFrequencies = ArraySubject.create<FacilityFrequency>([]);

  /**
   * Class constructor.
   * @param bus An instance of the EventBus
   * @param activeTuningControl The currently selected tuning control (NAV / COM or XPDR)
   * @param options An instance of the IfdOptions
   * @param facLoader An instance of the facility loader
   */
  constructor(
    private readonly bus: EventBus,
    private readonly activeTuningControl: MutableSubscribable<RadioTuningControlModes>,
    private readonly options: IfdOptions,
    private readonly facLoader: FacilityLoader,
  ) {
    this.generateInteractionEventMap(RadioType.Nav);
    this.generateInteractionEventMap(RadioType.Com);
    this.handleInteractionEvents();

    this.bus.getSubscriber<NavComEvents>().on(`com_active_frequency_${options.comIndex}`).whenChanged().handle((v) => this.handleActiveFrequencyChange(v));
  }

  /**
   * Sets the COM standby frequency
   * @param frequency The frequency to set, in MHz
   */
  public setComStandbyFrequency(frequency: number): void {
    const indexOrEmpty = this.options.comIndex === 1 ? '' : this.options.comIndex;
    SimVar.SetSimVarValue(`K:COM${indexOrEmpty}_STBY_RADIO_SET_HZ`, SimVarValueType.Number, frequency * 1000000);
  }

  /**
   * Sets the NAV standby frequency
   * @param frequency The frequency to set, in MHz
   */
  public setNavStandbyFrequency(frequency: number): void {
    if (this.options.navIndex !== undefined) {
      SimVar.SetSimVarValue(`K:NAV${this.options.navIndex}_STBY_SET_HZ`, SimVarValueType.Number, frequency * 1000000);
    }
  }

  /** Handles IfdInteractionEvents */
  private handleInteractionEvents(): void {
    this.interactionEventSub = this.controlSub.on('ifd_interaction_event').handle((event: IfdInteractionEvent) => {
      const capturedEvent = this.getFromEventMap(event);

      if (!capturedEvent) {
        return;
      }

      if (
        (this.activeTuningControl.get() === RadioTuningControlModes.COM && capturedEvent.event.includes('K:COM'))
        || (this.options.navIndex !== undefined && this.activeTuningControl.get() === RadioTuningControlModes.NAV && capturedEvent.event.includes('K:NAV'))
      ) {
        SimVar.SetSimVarValue(capturedEvent.event, 'number', 0);
      }
    });
  }

  /**
   * Handles when the active frequency changes and adds it to the recent com frequencies list
   * @param frequencyMhz The frequency that is tuned, in MHz
   */
  private async handleActiveFrequencyChange(frequencyMhz: number): Promise<void> {
    const stationIdent = this.activeComFreqIdentSimvar.get();

    if (stationIdent !== '') {
      const airportIcao = await this.facLoader.searchByIdent(FacilitySearchType.Airport, stationIdent);
      if (airportIcao) {
        const fac = await this.facLoader.getFacility(FacilityType.Airport, airportIcao[0]);
        const frequency = fac.frequencies.find((v) => v.freqMHz > frequencyMhz - 0.002 && v.freqMHz < frequencyMhz + 0.002);

        if (frequency) {
          this.recentComFrequencies.insert(frequency, 0);
          if (this.recentComFrequencies.length > 10) {
            this.recentComFrequencies.removeAt(this.recentComFrequencies.length - 1);
          }
        }
      }
    }
  }

  /**
   * Generates the eventMapArray with the needed InteractionEventMapItems
   * @param radioType The target radio type NAV or COM
   * @returns The array of `InteractionEventMapItem`s
   */
  private generateInteractionEventMap(radioType: RadioType): InteractionEventMapItem[] {
    if (radioType === RadioType.Nav && this.options.navIndex === undefined) {
      return [];
    }
    // COM1 is just COM for some events, volume still has the 1 though
    const indexOrEmpty = radioType === RadioType.Com
      ? this.options.comIndex === 1 ? '' : this.options.comIndex
      : this.options.navIndex;
    return [
      {
        interactionEvent: IfdInteractionEvent.VolumeInc,
        event: `K:${radioType}${radioType === RadioType.Com ? this.options.comIndex : this.options.navIndex}_VOLUME_INC`,
      },
      {
        interactionEvent: IfdInteractionEvent.VolumeDec,
        event: `K:${radioType}${radioType === RadioType.Com ? this.options.comIndex : this.options.navIndex}_VOLUME_DEC`,
      },
      {
        interactionEvent: IfdInteractionEvent.LeftKnobOuterInc,
        event: `K:${radioType}${indexOrEmpty}_RADIO_WHOLE_INC`,
      },
      {
        interactionEvent: IfdInteractionEvent.LeftKnobOuterDec,
        event: `K:${radioType}${indexOrEmpty}_RADIO_WHOLE_DEC`,
      },
      {
        interactionEvent: IfdInteractionEvent.LeftKnobInnerInc,
        event: `K:${radioType}${indexOrEmpty}_RADIO_FRACT_INC`,
      },
      {
        interactionEvent: IfdInteractionEvent.LeftKnobInnerDec,
        event: `K:${radioType}${indexOrEmpty}_RADIO_FRACT_DEC`,
      },
      {
        interactionEvent: IfdInteractionEvent.FrequencySwap,
        event: `K:${radioType}${radioType === RadioType.Com ? this.options.comIndex : this.options.navIndex}_RADIO_SWAP`,
      },
    ];
  }

  /**
   * Gets the requested InteractionEventMapItem from the respective eventMapArray
   * @param event The name of the IfdInteractionEvent to look up
   * @returns The requested InteractionEventMapItem if found, undefined if not found
   */
  private getFromEventMap(event: IfdInteractionEvent): InteractionEventMapItem | undefined {
    let eventMapArray: InteractionEventMapItem[];
    if (this.activeTuningControl.get() === RadioTuningControlModes.COM) {
      eventMapArray = this.comEventMapArray;
    } else if (this.activeTuningControl.get() === RadioTuningControlModes.NAV) {
      eventMapArray = this.navEventMapArray;
    } else {
      eventMapArray = this.comEventMapArray;
    }

    for (let i = 0; i < eventMapArray.length; i++) {
      if (eventMapArray[i].interactionEvent === event) {
        return eventMapArray[i];
      }
    }
    return undefined;
  }

  /** Pause the data provider **/
  public pause(): void {
    this.interactionEventSub?.isAlive && !this.interactionEventSub.isPaused && this.interactionEventSub?.pause();
  }

  /** Resume the data provider **/
  public resume(): void {
    this.interactionEventSub?.isAlive && this.interactionEventSub.isPaused && this.interactionEventSub?.resume();
  }

  /** Destroy the data provider **/
  public destroy(): void {
    this.interactionEventSub?.destroy();
  }
}

import {
  ComponentProps, ComRadioIndex, DebounceTimer, ElectricalEvents, EventBus, FSComponent, LifecycleComponent, MappedSubject, MutableSubscribable, NavComEvents,
  NavRadioIndex, Subject, Subscribable, VNode
} from '@microsoft/msfs-sdk';

import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';

/** Props for {@link BaseFrequency} */
export interface BaseFrequencyProps extends ComponentProps {
  /** An instance of the EventBus */
  bus: EventBus;
  /** COM/NAV radio index. */
  index: ComRadioIndex | NavRadioIndex;
  /** The display index of this block (1 or 2). */
  displayIndex: 1 | 2;
  /** If this is a standby frequency, which index should be used. Defaults to 1 */
  standbyIndex?: 1 | 2 | 3 | 4;
  /** Whether a TxRx component should be added to this ComFrequency component */
  hasFrequencyFlag?: boolean;
  /** Whether the frequency is the active frequency */
  isActiveFreq: boolean;
  /** Whether the frequency box is currently focused */
  isFocused: Subscribable<boolean>;
  /** Whether the active/standby frequencies are recently swapped */
  isRecentlySwapped: MutableSubscribable<boolean>;
  /** The IfdInstrumentIndex */
  readonly ifdInstrumentIndex: number;
  /** The IFD Tuning controls manager */
  ifdTuningControlManager: IfdTuningControlsManager;
  /** The frequency edit display, if the edit effect should be display outside of the component */
  frequencyEditDisplay?: Subject<string | null>;
}

/**
 * Smart component.
 * Base component for NavFrequency and ComFrequency.
 */
export class BaseFrequency extends LifecycleComponent<BaseFrequencyProps> {
  protected readonly radioSub = this.props.bus.getSubscriber<NavComEvents>();
  protected readonly powerSub = this.props.bus.getSubscriber<ElectricalEvents>();

  protected readonly isFreqBeingEdited = Subject.create<boolean>(false);
  protected readonly isVolumeBeingEdited = Subject.create<boolean>(false);

  protected readonly isFacilityFlagHidden = MappedSubject.create(
    ([isVolumeBeingEdited, isFreqBeingEdited, isRecentlySwapped]) => isVolumeBeingEdited || isFreqBeingEdited || isRecentlySwapped,
    this.isVolumeBeingEdited,
    this.isFreqBeingEdited,
    this.props.isRecentlySwapped
  );

  private readonly editEffectTimer = new DebounceTimer();

  private readonly recentlySwappedTimer = new DebounceTimer();
  private readonly recentlySwappedTime = this.props.isActiveFreq ? 100 : 150;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(
      this.props.isRecentlySwapped.sub((isRecentlySwapped: boolean) => {
        if (!isRecentlySwapped) {
          return;
        }

        this.recentlySwappedTimer.schedule(() => this.props.isRecentlySwapped.set(false), this.recentlySwappedTime);
      })
    );
  }

  /** Triggers field edit effect (highlighting) when frequency value changes. */
  protected triggerEditEffect(): void {
    if (!this.props.isActiveFreq) {
      this.isFreqBeingEdited.set(true);
      this.editEffectTimer.schedule(() => this.isFreqBeingEdited.set(false), IfdTuningControlsManager.EDIT_EFFECT_TIME);
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{
        'active-freq': this.props.isActiveFreq,
        'standby-freq': !this.props.isActiveFreq,
        'wt-ifd-com-frequency-container': true
      }}>
        BASE FREQ BLOCK
      </div>
    );
  }
}

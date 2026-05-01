import {
  ComponentProps, ComSpacing, FSComponent, LifecycleComponent, MappedSubject, NodeReference, Subscribable, SubscribableUtils, VNode
} from '@microsoft/msfs-sdk';

import { FacilityDefaultText, FrequencyFacility } from './FrequencyFacility';
import { FrequencyNumber } from './FrequencyNumber';
import { FrequencyTxRxFlag } from './FrequencyTxRxFlag';

import './FrequencyDisplay.css';

/** Props for {@link FrequencyDisplay} */
interface FrequencyDisplayProps extends ComponentProps {
  /** The display index of this block (1 or 2). */
  displayIndex: 1 | 2;
  /** The subscribable frequency to display. */
  frequency: Subscribable<number>;
  /** The subscribable frequency to display whilst being edited. */
  frequencyEdit: Subscribable<string | null>;
  /** Whether the power is on*/
  isPowered: Subscribable<boolean>;
  /** COM frequency spacing on COM radios. */
  freqSpacing?: Subscribable<ComSpacing>;
  /** Whether a TxRx component should be added to this ComFrequency component */
  hasTxRxFlag?: boolean;
  /** Whether the frequency is the active frequency */
  isActiveFreq: boolean;
  /** Whether the frequency box is currently focused */
  isFocused: Subscribable<boolean>;
  /** Whether the frequency is currently being edited */
  isBeingEdited: Subscribable<boolean>;
  /** Whether the active/standby frequencies are recently swapped */
  isRecentlySwapped: Subscribable<boolean>;
  /** Whether remote tuning is enabled */
  isRemoteTuningEnabled: boolean;
  /** The number of decimals, default 2*/
  decimals?: number;
  /** The current transmitting/receiving status of the frequency */
  frequencyFlag: Subscribable<string>;
  /** Whether the frequency facility flag should be hidden */
  isFacilityFlagHidden: Subscribable<boolean>;
  /** Default text to display when there is no facility name/ident/type found */
  facilityDefaultText: FacilityDefaultText;
  /** The facility name */
  facilityName: Subscribable<string>;
  /** The facility ident */
  facilityIdent: Subscribable<string>;
  /** The facility type */
  facilityType: Subscribable<string>;
  /** The div ref */
  divRef: NodeReference<HTMLDivElement>;
}

/**
 * Formats a frequency to a string.
 * @param root0 Inputs
 * @param root0."0" The frequency.
 * @param root0."1" The channel spacing.
 * @param root0."2" Whether the radio is powered.
 * @param root0."3" The number of decimals
 * @returns A formatted frequency string.
 */
function formatFrequency([freq, spacing, powered, decimals]: readonly [number, ComSpacing | undefined, boolean, number | undefined]): string {
  // Convert to kHz so that all potentially significant digits lie to the left of the decimal point.
  // This prevents floating point rounding errors.
  if (!powered) {
    return `---${decimals || decimals === undefined ? `.${'-'.repeat(decimals ?? 3)}` : ''}`;
  }
  const freqKhz: number = Math.round(freq * 1e3);
  let formattedFreq: string;

  if (spacing === undefined) {
    return (Math.round(freqKhz / 50) * 50 / 1000).toFixed(decimals ?? 3);
  }

  switch (spacing) {
    case ComSpacing.Spacing833Khz:
      formattedFreq = (freqKhz / 1000).toFixed(decimals ?? 3);
      break;
    default:
      formattedFreq = (Math.trunc(freqKhz / 10) / 100).toFixed(decimals ?? 3);
      break;
  }

  return formattedFreq;
}

/**
 * Dumb component.
 * Displays a formatted COM/NAV frequency string, and the block's focused/selected/editing states.
 */
export class FrequencyDisplay extends LifecycleComponent<FrequencyDisplayProps> {
  private readonly integerPart = MappedSubject.create(
    this.frequencyIntegerFormatter,
    this.props.frequency,
    SubscribableUtils.toSubscribable(this.props.freqSpacing, true),
    this.props.isPowered,
    SubscribableUtils.toSubscribable(this.props.decimals, true)
  ).withLifecycle(this.defaultLifecycle);

  private readonly decimalPart = MappedSubject.create(
    this.frequencyDecimalFormatter,
    this.props.frequency,
    SubscribableUtils.toSubscribable(this.props.freqSpacing, true),
    this.props.isPowered,
    SubscribableUtils.toSubscribable(this.props.decimals, true)
  ).withLifecycle(this.defaultLifecycle);

  private readonly isCyanOutlineHiddenSub = MappedSubject.create(
    ([isFocused, isActiveFreq]) => !isFocused || isActiveFreq,
    this.props.isFocused,
    SubscribableUtils.toSubscribable(this.props.isActiveFreq, true)
  ).withLifecycle(this.defaultLifecycle);

  private readonly isFrequencyHidden = MappedSubject.create(
    ([isRecentlySwapped, isPowered]) => isRecentlySwapped || !isPowered,
    this.props.isRecentlySwapped,
    this.props.isPowered,
  ).withLifecycle(this.defaultLifecycle);

  private readonly txRxFlag = this.props.hasTxRxFlag ? MappedSubject.create(
    ([frequencyFlag, isPowered]) => isPowered ? frequencyFlag : '',
    this.props.frequencyFlag,
    this.props.isPowered,
  ).withLifecycle(this.defaultLifecycle) : undefined;

  private readonly isFacilityFlagHidden = MappedSubject.create(
    ([isFacilityFlagHidden, isPowered]) => isFacilityFlagHidden || !isPowered,
    this.props.isFacilityFlagHidden,
    this.props.isPowered,
  ).withLifecycle(this.defaultLifecycle);

  private readonly editIntegerPart = this.props.frequencyEdit.map(v => v ? v.split('.')[0] : '').withLifecycle(this.defaultLifecycle);
  private readonly editDecimalPart = this.props.frequencyEdit.map(v => {
    if (!v) { return ''; }
    const parts = v.split('.');
    return `.${parts[1] || '---'}`;
  }).withLifecycle(this.defaultLifecycle);
  private readonly shouldShowEdit = MappedSubject.create(
    ([freq]) => !this.props.isActiveFreq && !!freq,
    this.props.frequencyEdit,
  ).withLifecycle(this.defaultLifecycle);
  /**
   * Formats the integer part of a frequency to a string.
   * @param root0 Inputs
   * @param root0."0" The frequency.
   * @param root0."1" The channel spacing.
   * @param root0."2" Whether the radio is powered.
   * @param root0."3" The number of decimals
   * @returns A formatted string.
   */
  private frequencyIntegerFormatter([freq, spacing, powered, decimals]: readonly [number, ComSpacing | undefined, boolean, number | undefined]): string {
    const formattedFreqString = formatFrequency([freq, spacing, powered, decimals]);
    return formattedFreqString.split('.')[0];
  }

  /**
   * Formats the decimal part of a frequency to a string.
   * @param root0 Inputs
   * @param root0."0" The frequency.
   * @param root0."1" The channel spacing.
   * @param root0."2" Whether the radio is powered.
   * @param root0."3" The number of decimals
   * @returns A formatted string.
   */
  private frequencyDecimalFormatter([freq, spacing, powered, decimals]: readonly [number, ComSpacing | undefined, boolean, number | undefined]): string {
    const formattedFreqString = formatFrequency([freq, spacing, powered, decimals]);
    return `.${formattedFreqString.split('.')[1]}`;
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(this.isCyanOutlineHiddenSub);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div ref={this.props.divRef} class={{
        'wt-ifd-frequency-display-container': true,
        'wt-ifd-freq-is-being-edited': this.props.isBeingEdited
      }}>
        <div class="wt-ifd-freq-edit-background" />
        <div class={{
          'wt-ifd-frequency-value': true,
          'wt-ifd-remote-tuning-enabled': this.props.isRemoteTuningEnabled,
          'active-freq': this.props.isActiveFreq,
          'standby-freq': !this.props.isActiveFreq,
          'hidden': this.isFrequencyHidden,
        }}>
          <FrequencyNumber
            hidden={this.shouldShowEdit}
            integerPart={this.integerPart}
            decimalPart={this.decimalPart}
          />
          <FrequencyNumber
            hidden={this.shouldShowEdit.map((v) => !v)}
            integerPart={this.editIntegerPart}
            decimalPart={this.editDecimalPart}
          />
        </div>
        {this.txRxFlag && <FrequencyTxRxFlag txRxStatus={this.txRxFlag} />}
        <FrequencyFacility
          isHidden={this.isFacilityFlagHidden}
          isRemoteTuningEnabled={this.props.isRemoteTuningEnabled}
          displayIndex={this.props.displayIndex}
          isActiveFreq={this.props.isActiveFreq}
          facilityDefaultText={this.props.facilityDefaultText}
          facilityName={this.props.facilityName}
          facilityIdent={this.props.facilityIdent}
          facilityType={this.props.facilityType}
        />
        <svg class={{ 'wt-ifd-freq-failed': true, 'hidden': this.props.isPowered }} viewBox='0 0 131 47'>
          <path d='M 0 0 l 131 47 M 0 47 l 131 -47' />
        </svg>
        <div class={{
          'wt-ifd-freq-focus-cyan-outline': true,
          'hidden': this.isCyanOutlineHiddenSub,
        }} />
      </div>
    );
  }
}

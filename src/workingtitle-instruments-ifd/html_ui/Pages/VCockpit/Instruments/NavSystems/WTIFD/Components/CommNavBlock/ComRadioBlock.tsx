import {
  ComponentProps, ComRadioIndex, DisplayComponent, EventBus,
  FSComponent, MutableSubscribable, Subject, Subscribable, VNode,
} from '@microsoft/msfs-sdk';

import { DualFrequencyBlock } from './DualFrequencyBlock';
import { ComFrequency } from './ComFrequency';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';
import { IfdOptions } from '../../IfdOptions';

import './ComRadioBlock.css';

/** Props for {@link ComRadioBlock} */
interface ComRadioBlockProps extends ComponentProps {
  /** An instance of the EventBus */
  bus: EventBus;
  /** Com radio index. */
  index: ComRadioIndex;
  /** The display index of this block (1 or 2). */
  displayIndex: 1 | 2;
  /** Whether the radio pane is focused */
  isFocused: Subscribable<boolean>;
  /** Whether the component should be hidden*/
  isHidden: Subscribable<boolean>;
  /** Whether the active/standby frequencies are recently swapped */
  isRecentlySwapped: MutableSubscribable<boolean>;
  /** The IFD Tuning controls manager */
  ifdTuningControlManager: IfdTuningControlsManager;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
}

/**
 * Dumb component.
 * ComRadioBlock component for the Working Title IFD
 * Displays communication information blocks
 */
export class ComRadioBlock extends DisplayComponent<ComRadioBlockProps> {
  private readonly frequencyEditDisplay = Subject.create<string | null>(null);

  /**
   * Renders the communication interface
   * @returns The virtual DOM node representing the comm/nav block
   */
  public render(): VNode {
    return (
      <div
        id="com-radio-block"
        class={{
          'hidden': this.props.isHidden
        }}
      >
        <DualFrequencyBlock>
          <ComFrequency
            bus={this.props.bus}
            index={this.props.index}
            displayIndex={this.props.displayIndex}
            hasFrequencyFlag
            isActiveFreq={true}
            isFocused={this.props.isFocused}
            isRecentlySwapped={this.props.isRecentlySwapped}
            ifdTuningControlManager={this.props.ifdTuningControlManager}
            ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
            frequencyEditDisplay={this.frequencyEditDisplay}
          />
          <ComFrequency
            bus={this.props.bus}
            index={this.props.index}
            displayIndex={this.props.displayIndex}
            isActiveFreq={false}
            isFocused={this.props.isFocused}
            isRecentlySwapped={this.props.isRecentlySwapped}
            ifdTuningControlManager={this.props.ifdTuningControlManager}
            standbyIndex={1}
            ifdInstrumentIndex={this.props.ifdOptions.instrumentIndex}
            frequencyEditDisplay={this.frequencyEditDisplay}
          />
        </DualFrequencyBlock>
      </div>
    );
  }
}

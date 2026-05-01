import {
  ComponentProps,
  DisplayComponent,
  EventBus,
  FSComponent, MutableSubscribable,
  NavRadioIndex,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';

import { DualFrequencyBlock } from './DualFrequencyBlock';
import { NavFrequency } from './NavFrequency';
import { IfdTuningControlsManager } from '../../Events/IfdTuningControlsManager';

import './NavRadioBlock.css';

/** Props for {@link NavRadioBlock} */
interface NavRadioBlockProps extends ComponentProps {
  /** An instance of the EventBus */
  bus: EventBus;
  /** Nav radio index */
  index: NavRadioIndex;
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
  /** The IfdInstrumentIndex */
  readonly ifdInstrumentIndex: number;
}

/**
 * Dumb component.
 * NavRadioBlock component for the Working Title IFD
 * Displays navigation information blocks
 */
export class NavRadioBlock extends DisplayComponent<NavRadioBlockProps> {
  private readonly frequencyEditDisplay = Subject.create<string | null>(null);

  /**
   * Renders the navigation interface
   * @returns The virtual DOM node representing the comm/nav block
   */
  public render(): VNode {
    return (
      <div
        id="nav-radio-block"
        class={{
          'hidden': this.props.isHidden
        }}
      >
        <DualFrequencyBlock>
          <NavFrequency
            bus={this.props.bus}
            index={this.props.index}
            displayIndex={this.props.displayIndex}
            hasFrequencyFlag
            isActiveFreq={true}
            isFocused={this.props.isFocused}
            isRecentlySwapped={this.props.isRecentlySwapped}
            ifdInstrumentIndex={this.props.ifdInstrumentIndex}
            ifdTuningControlManager={this.props.ifdTuningControlManager}
            frequencyEditDisplay={this.frequencyEditDisplay}
          />
          <NavFrequency
            bus={this.props.bus}
            index={this.props.index}
            displayIndex={this.props.displayIndex}
            isActiveFreq={false}
            isFocused={this.props.isFocused}
            isRecentlySwapped={this.props.isRecentlySwapped}
            ifdTuningControlManager={this.props.ifdTuningControlManager}
            standbyIndex={1}
            ifdInstrumentIndex={this.props.ifdInstrumentIndex}
            frequencyEditDisplay={this.frequencyEditDisplay}
          />
        </DualFrequencyBlock>
      </div>
    );
  }
}

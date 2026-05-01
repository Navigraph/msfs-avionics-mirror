import {
  ComponentProps, FSComponent, LifecycleComponent, Subscribable, VNode
} from '@microsoft/msfs-sdk';

import './FrequencyTxRxFlag.css';

/** Props for {@link FrequencyTxRxFlag} */
interface FrequencyTxRxFlagProps extends ComponentProps {
  /** Transmitting/Receiving status flag of the frequency */
  txRxStatus: Subscribable<string>;
}

/**
 * Dumb component.
 * Displays a standby frequency and an active frequency on the top-left
 * of the IFD screen, COM-NAV block. Reacts to Frequency Swap button presses.
 */
export class FrequencyTxRxFlag extends LifecycleComponent<FrequencyTxRxFlagProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{
        'wt-ifd-frequency-tx-rx-container': true,
        'hidden': this.props.txRxStatus.map(status => status === ''),
      }}>
        {this.props.txRxStatus}
      </div>
    );
  }
}

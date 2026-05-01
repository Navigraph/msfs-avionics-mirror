import { ComponentProps, DisplayComponent, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './FrequencyNumber.css';

/** Props for {@link FrequencyNumber} */
interface FrequencyNumberProps extends ComponentProps {
  /** The numbers before the decimal. */
  integerPart: Subscribable<string>;
  /** The numbers after the decimal */
  decimalPart: Subscribable<string>;
  /** Wether to show the frequency */
  hidden: Subscribable<boolean>;
}

/**
 * Dumb component.
 * Displays a formatted COM frequency string.
 */
export class FrequencyNumber extends DisplayComponent<FrequencyNumberProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        <div class={{ 'wt-ifd-frequency-value-integer-part': true, 'hidden': this.props.hidden }}>
          {this.props.integerPart.map((v) => v)}
        </div>
        <div class={{ 'wt-ifd-frequency-value-decimal-part': true, 'hidden': this.props.hidden }}>
          {this.props.decimalPart.map((v) => v)}
        </div>
      </>
    );
  }
}

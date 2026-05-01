import {
  ComponentProps, DisplayComponent, FSComponent, VNode
} from '@microsoft/msfs-sdk';

import './DualFrequencyBlock.css';

/** Props for {@link DualFrequencyBlock} */
type DualFrequencyBlockProps = ComponentProps

/**
 * Dumb component.
 * Displays a standby frequency and an active frequency on the top-left
 * of the IFD screen, COM-NAV block.
 */
export class DualFrequencyBlock extends DisplayComponent<DualFrequencyBlockProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="wt-ifd-dual-frequency-container">
        {this.props.children}
      </div>
    );
  }
}
import {
  ComponentProps, DisplayComponent, FSComponent, VNode
} from '@microsoft/msfs-sdk';

import './SingleFrequencyBlock.css';

/** Props for {@link SingleFrequencyBlock} */
type SingleFrequencyBlockProps = ComponentProps

/**
 * Dumb component.
 * Displays a standby frequency on the left side of the IFD screen, COM-NAV block.
 */
export class SingleFrequencyBlock extends DisplayComponent<SingleFrequencyBlockProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="wt-ifd-single-frequency-container">
        {this.props.children}
      </div>
    );
  }
}
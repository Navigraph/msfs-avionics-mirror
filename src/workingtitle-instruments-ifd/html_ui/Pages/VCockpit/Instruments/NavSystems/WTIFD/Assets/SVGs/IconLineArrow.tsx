import { ComponentProps, DisplayComponent, FSComponent, Subscribable, SubscribableSet, ToggleableClassNameRecord, VNode } from '@microsoft/msfs-sdk';

/** Props for {@link IconLineArrow } */
interface IconLineArrowProps extends ComponentProps {
  /** The CSS classe(s) to apply to the root element. */
  class?: string | Subscribable<string> | SubscribableSet<string> | ToggleableClassNameRecord;
  /** The fill color code */
  fillColor?: string;
}

/**
 * The arrow used primarily in IFD nav source indicator.
 */
export class IconLineArrow extends DisplayComponent<IconLineArrowProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={this.props.class}>
        <svg viewBox="0 0 11.375 5.6">
          <path
            d="m 0.1 2.2 V 3.3 L 5.5 3.3 L 6 5 Q 6.15 5.402 6.579 5.172 L 11 2.9 Q 11.228 2.736 11 2.6 l -4.446 -2.216 Q 6.15 0.145 6 0.597 L 5.5 2.2 H 0.1 z"
            fill={this.props.fillColor}
          />
        </svg>
      </div>
    );
  }
}

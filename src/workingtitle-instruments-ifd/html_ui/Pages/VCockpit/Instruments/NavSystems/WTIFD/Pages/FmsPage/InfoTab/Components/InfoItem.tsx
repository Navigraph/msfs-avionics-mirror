import { ComponentProps, FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './InfoItem.css';

/** The properties for the {@link InfoItem} component. */
export interface InfoItemProps extends ComponentProps {
  /** Whether the item is selected. */
  isSelected?: Subscribable<boolean>;
  /** Whether the item is hidden. */
  hidden?: Subscribable<boolean>;
  /** Optional class of the root element. */
  class?: string;
  /** Optional index used for event delegation selection. */
  dataIndex?: number;
}

/** A component that renders an item in a group. */
export class InfoItem extends LifecycleComponent<InfoItemProps> {
  /** @inheritDoc */
  public render(): VNode {
    return (
      <div
        class={{ [this.props.class ?? '']: true, 'info-item': true, 'selected': this.props.isSelected ?? false, 'hidden': this.props.hidden ?? false }}
        data-index={this.props.dataIndex}
      >
        {...(this.props.children ?? [])}
      </div>
    );
  }
}

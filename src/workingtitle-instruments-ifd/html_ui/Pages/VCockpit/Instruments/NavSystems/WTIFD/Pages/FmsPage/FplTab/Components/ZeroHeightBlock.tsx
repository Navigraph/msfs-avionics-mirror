import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../Components/List/IfdListItemComponent';

/** A component with zero height. */
export class ZeroHeightBlock extends IfdListItemComponent<IfdListItemComponentProps> {
  /** @inheritdoc */
  public override render(): VNode {
    return (
      <div style="height: 0">{this.props.children}</div>
    );
  }
}

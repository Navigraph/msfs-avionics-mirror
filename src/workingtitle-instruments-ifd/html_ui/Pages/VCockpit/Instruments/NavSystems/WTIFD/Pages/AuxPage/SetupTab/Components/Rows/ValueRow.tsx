import { FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { SetupRowBase, SetupRowBaseProps } from './SetupRowBase';

/**
 * Props for the ValueRow component.
 */
export interface ValueRowProps extends SetupRowBaseProps {
  /** The value */
  readonly value: Subscribable<string>;
}

/**
 * Component to render a value row.
 */
export class ValueRow extends SetupRowBase<ValueRowProps> {
  /** @inheritdoc */
  public onFocus(): void {
    // This row cannot be focussed.
    return;
  }

  /** @inheritdoc */
  protected onEnter(): void { }

  /** @inheritdoc */
  protected onClear(): void { }

  /** @inheritdoc */
  protected renderContent(): VNode {
    return (
      <div class="settings-row-content">
        <div class='settings-value-row-value'>
          {this.props.value}
        </div>
      </div>
    );
  }
}

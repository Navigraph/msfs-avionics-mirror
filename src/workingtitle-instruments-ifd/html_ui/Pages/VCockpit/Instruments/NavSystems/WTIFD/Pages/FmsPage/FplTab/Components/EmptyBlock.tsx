import { ComponentProps, FSComponent, LifecycleComponent, NodeReference, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './EmptyBlock.css';

/** The properties for the {@link EmptyBlock} component. */
export interface EmptyBlockProps extends ComponentProps {
  /** Whether the block is selected */
  readonly isSelected: Subscribable<boolean>;
  /**
   * Is positioned before
   */
  readonly isBefore?: boolean;
  /**
   * Node ref
   */
  readonly ref?: NodeReference<HTMLDivElement>;
}

/**
 * The empty block node in the flight plan list
 */
export class EmptyBlock extends LifecycleComponent<EmptyBlockProps> {

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);


  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'empty-leg-block': true,
          'empty-leg-before': this.props.isBefore ?? false,
          'empty-leg-block-selected': this.props.isSelected,
        }}
        ref={this.props.ref}
      >
        <div class="empty-leg-borders">
          <div class="empty-leg-border-1"></div>
          <div class="empty-leg-border-2"></div>
        </div>
      </div>
    );
  }
}

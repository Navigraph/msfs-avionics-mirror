import { ComponentProps, DisplayComponent, FSComponent, MappedSubject, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

/**
 * Component props for {@link IfdListItemWrapper};
 */
export interface IfdListItemWrapperProps extends ComponentProps {
  /** Whether the wrapper's list item should be visible. */
  isVisible?: Subscribable<boolean>;
  /** The height of the wrapper's list item in pixels. */
  heightPx?: number | Subscribable<number>;
}

/**
 * A wrapper for a rendered item in an IFD list.
 */
export class IfdListItemWrapper extends DisplayComponent<IfdListItemWrapperProps> {
  private thisNode?: VNode;

  private readonly hideCommand = Subject.create(false);

  private readonly hidden = this.props.isVisible
    ? MappedSubject.create(
      ([hideCommand, isVisible]) => hideCommand || !isVisible,
      this.hideCommand,
      this.props.isVisible
    )
    : this.hideCommand;

  /** @inheritdoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;
  }

  /**
   * Sets the visibility of this wrapper and its child item.
   * @param visible Whether the wrapper and its child item should be visible.
   */
  public setVisible(visible: boolean): void {
    this.hideCommand.set(!visible);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'ifd-list-item-wrapper': true,
          'hidden': this.hidden
        }}
        style={{
          height: SubscribableUtils.isSubscribable(this.props.heightPx) ? this.props.heightPx.map((v) => `${v}px`) : `${this.props.heightPx}px`,
        }}
      >
        {this.props.children}
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.thisNode && FSComponent.shallowDestroy(this.thisNode);

    'destroy' in this.hidden && this.hidden.destroy();

    super.destroy();
  }
}

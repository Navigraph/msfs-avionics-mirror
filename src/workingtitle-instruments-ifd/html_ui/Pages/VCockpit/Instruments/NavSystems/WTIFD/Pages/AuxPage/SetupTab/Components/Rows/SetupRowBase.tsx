import { FSComponent, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../../Components/List/IfdListItemComponent';
import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { SetupMenuRowListItemData } from '../SetupMenuTypes';

/**
 * Base props for all setup row components.
 */
export interface SetupRowBaseProps<DataType extends SetupMenuRowListItemData = SetupMenuRowListItemData> extends IfdListItemComponentProps<DataType> {
  /** The setup row label */
  readonly label: string;

  /** Whether the row is enabled/interactive */
  readonly isEnabled?: boolean | Subscribable<boolean>;
  /** The collapse level of this row */
  readonly collapseLevel?: number;
  /** Whether the row is double height */
  readonly doubleRow?: Subscribable<boolean> | boolean;
}

/**
 * Base class for all setup row components
 * @template T Type of props extending SetupRowBaseProps
 */
export abstract class SetupRowBase<T extends SetupRowBaseProps = SetupRowBaseProps> extends IfdListItemComponent<T> {
  protected readonly rowRef = FSComponent.createRef<HTMLDivElement>();

  protected readonly _isEnabled: Subscribable<boolean> = SubscribableUtils.toSubscribable(this.props.isEnabled ?? true, true);

  private readonly mouseDownListener = (): void => this.focus();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.rowRef.instance.addEventListener('click', this.mouseDownListener);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
      case IfdInteractionEvent.ENTR:
        if (this.isSelected.get()) {
          this.onEnter();
          return true;
        }
        break;
      case IfdInteractionEvent.CLR:
        if (this.isSelected.get()) {
          this.onClear();
          return true;
        }
        break;
    }

    return false;
  }

  /** Handles enter button or right knob presses. */
  protected abstract onEnter(): void;

  /** Handles clear while the field is selected.*/
  protected abstract onClear(): void;

  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    if (this._isEnabled.get()) {
      super.onFocus(event);
    }
  }

  /** @inheritdoc */
  public destroy(): void {
    this.rowRef.instance.removeEventListener('click', this.mouseDownListener);
    super.destroy();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={`ifd-settings-row-collapse-${this.props.collapseLevel ?? 1}`}>
        <div
          ref={this.rowRef}
          class={{
            'settings-row': true,
            'settings-row-double': this.props.doubleRow ?? false,
            'settings-row-disabled': this._isEnabled.map((v) => !v).withLifecycle(this.defaultLifecycle),
            'settings-row-selected': this._isSelected
          }}
        >
          <div class="settings-row-left-section">
            {this.renderIcon()}
            <div class="settings-row-label">{this.props.label}</div>
          </div>
          {this.renderContent()}
        </div>
        {this.renderChildren()}
      </div>
    );
  }


  /**
   * Renders the children of the row. To be implemented by subclasses.
   * @returns The row children VNode.
   */
  protected renderChildren(): VNode | null {
    return null;
  }

  /**
   * Renders the content of the row. To be implemented by subclasses.
   * @returns The row content VNode.
   */
  protected renderContent(): VNode | null {
    return null;
  }

  /**
   * Renders an icon to the left of the row label. To be implemented by subclasses.
   * @returns The icon VNode, or null if no icon.
   */
  protected renderIcon(): VNode | null {
    return null;
  }
}

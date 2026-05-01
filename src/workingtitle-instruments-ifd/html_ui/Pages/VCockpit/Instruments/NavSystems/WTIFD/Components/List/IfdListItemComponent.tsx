import { LifecycleComponent, Subject, Subscribable } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler } from '../../RightKnob';
import { DynamicListData } from './DynamicListData';

/** The properties for the {@link LegBlock} component. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IfdListItemComponentProps<DataType extends DynamicListData = DynamicListData> {
  /** The data for the leg */
  readonly data: DataType;
  /** A function to call to focus this list item. */
  readonly focus?: () => void;
}

/**
 * A base class for list item components in an IFD list.
 */
export abstract class IfdListItemComponent<P extends IfdListItemComponentProps = IfdListItemComponentProps>
  extends LifecycleComponent<P>
  implements IfdInteractionEventHandler {

  protected readonly _isSelected = Subject.create(false);
  public readonly isSelected = this._isSelected as Subscribable<boolean>;

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    return false;
  }

  /**
   * Handle focus event.
   * @param event The event that caused focus to be set, either the knob event or 'click' if it was clicked.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    this._isSelected.set(true);
  }

  /**
   * Handle blur event.
   */
  public onBlur(): void {
    this._isSelected.set(false);
  }

  /**
   * Focus this list item.
   */
  protected focus(): void {
    this.props.focus?.();
  }
}

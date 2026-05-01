import { ComponentProps, FSComponent, LifecycleComponent, MappedSubject, Subject, SubscribableArray, VNode } from '@microsoft/msfs-sdk';

import { IfdListCursor } from '../../../../Components/List/IfdListCursor';
import { TimerListItemData } from './TimerListItem';

import './TimerListCursor.css';

/** Props for the timer list cursor. */
interface TimerListCursorProps extends ComponentProps {
  /** The data block this cursor is attached to. */
  readonly data: TimerListItemData;
  /** The list of items in the list. */
  readonly listItems: SubscribableArray<TimerListItemData>;
  /** The list cursor to use. */
  readonly cursor: IfdListCursor<TimerListItemData>;
  /** A method called when the bar is pressed. */
  readonly onPressed: (data: TimerListItemData) => void;
}

/** The timer list cursor for inserting new timers at the end of the list. */
export class TimerListCursor extends LifecycleComponent<TimerListCursorProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  private readonly isHidden = Subject.create(true);

  private readonly isSelected = MappedSubject.create(
    ([selectedItem, spaceAfterItemSelected]) => selectedItem === this.props.data && spaceAfterItemSelected,
    this.props.cursor.activeItem,
    this.props.cursor.spaceAfterItemSelected,
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.listItems.sub((idx, type, item, array) => this.isHidden.set(array[array.length - 1] !== this.props.data), true).withLifecycle(this.defaultLifecycle);

    this.ref.instance.addEventListener('mousedown', this.onClick);
  }

  /** @inheritdoc */
  public render(): VNode | null {
    return <div ref={this.ref} class={{ 'timer-list-cursor': true, 'hidden': this.isHidden, 'selected': this.isSelected }}>
      <div class="border-1" />
      <div class="border-2" />
    </div>;
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.ref.getOrDefault()?.removeEventListener('mousedown', this.onClick);
  }

  private onClick = (ev: MouseEvent): void => {
    if (!this.isHidden.get()) {
      ev.stopPropagation();
      this.props.onPressed(this.props.data);
    }
  };
}

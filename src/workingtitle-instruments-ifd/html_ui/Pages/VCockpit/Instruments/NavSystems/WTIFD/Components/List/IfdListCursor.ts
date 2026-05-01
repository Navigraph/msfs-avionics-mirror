
import { Subject, Subscribable, Subscription, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler } from '../../RightKnob';
import { DynamicList } from './DynamicList';
import { DynamicListData } from './DynamicListData';
import { IfdListItemComponent } from './IfdListItemComponent';

/**
 * A cursor for navigating a dynamic list.
 */
export class IfdListCursor<
  DataType extends DynamicListData = DynamicListData,
  BlockType extends IfdListItemComponent = IfdListItemComponent
>
  implements IfdInteractionEventHandler {

  private readonly _activeIndex = Subject.create(-1);
  public readonly activeIndex = this._activeIndex as Subscribable<number>;

  private readonly _activeBlock = Subject.create<BlockType | undefined>(undefined);
  public readonly activeBlock = this._activeBlock as Subscribable<BlockType | undefined>;

  private readonly _activeItem = this.activeIndex.map(index => this.dynamicList.data.getArray()[index]);
  public readonly activeItem = this._activeItem as Subscribable<DataType | undefined>;

  private readonly _spaceAfterItemSelected = Subject.create(false);
  public readonly spaceAfterItemSelected: Subscribable<boolean> = this._spaceAfterItemSelected;

  private readonly subs: Subscription[] = [];

  /**
   * Creates an instance of the IfdListCursor.
   * @param dynamicList The dynamic list to navigate.
   * @param canSelectItem A predicate to determine if an item can be selected.
   * @param canSelectSpace A predicate to determine if the space between two items can be selected.
   * Item b is undefined when a is the last item in the list. Defaults to always false.
   */
  public constructor(
    private readonly dynamicList: DynamicList<DataType>,
    private readonly canSelectItem?: (a: DataType | undefined) => boolean,
    private readonly canSelectSpace?: (a: DataType | undefined, b: DataType | undefined) => boolean,
  ) {
    this._activeBlock.set(this.dynamicList.getRenderedItem(this.activeIndex.get())?.props.children?.[0] as BlockType | undefined);
    this.subs.push(this.dynamicList.data.sub(this.checkSelection.bind(this)));
    this.subs.push(this.dynamicList.visibleItemCount.sub(this.checkSelection.bind(this), true));
  }

  /**
   * Make sure what we have selected is still valid if the list changes.
   * Can also be called if canSelectItem might have changed for other reasons.
   */
  public checkSelection(): void {
    if (this.dynamicList.visibleItemCount.get() < 1) {
      this.setActiveItem(undefined, false);
      return;
    }

    const activeItem = this._activeItem.get();

    // if the active item is no longer selectable, select the next selectable
    if (this.canSelectItem && !this.canSelectItem(activeItem)) {
      this.setActiveItem(this.getNextItem(), false);
      return;
    }

    // or else if the space after the item can no longer be selected, de-select it
    if (!this.canSelectSpace || !this._spaceAfterItemSelected.get()) {
      return;
    }

    const nextItem = this.getNextItem();

    if (!this.canSelectSpace(activeItem, nextItem)) {
      this.setActiveItem(activeItem, false);
    }
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const spaceAfterItemSelected = this._spaceAfterItemSelected.get();

    // Always forward the event to the active list item first
    if (this._activeBlock.get()?.onInteractionEvent?.(event)) {
      return true;
    }

    // If the event was not handled by the active block, handle it here
    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
      case IfdInteractionEvent.RightKnobOuterInc: {
        if (this.dynamicList.visibleItemCount.get() === 0) {
          this.setActiveItem(undefined, false);
          return true;
        }

        const nextItem = this.getNextItem();

        // If we are able to select the space after the item, we do that
        if (!spaceAfterItemSelected && this.canSelectSpace) {
          const item = this._activeItem.get();
          if (item && this.canSelectSpace(item, nextItem)) {
            this.setActiveItem(item, true, event);
            return true;
          }
        }

        // Else move to the next item
        if (nextItem) {
          this.setActiveItem(nextItem, false, event);
          this._spaceAfterItemSelected.set(false);
        }
        return true;
      }
      case IfdInteractionEvent.RightKnobInnerDec:
      case IfdInteractionEvent.RightKnobOuterDec: {
        if (this.dynamicList.visibleItemCount.get() === 0) {
          this.setActiveItem(undefined, false);
          return true;
        }

        if (spaceAfterItemSelected) {
          this.setActiveItem(this._activeItem.get(), false, event);
          return true;
        }

        const previousItem = this.getPreviousItem();
        if (this.canSelectSpace) {
          const item = this._activeItem.get();
          if (this.canSelectSpace(previousItem, item)) {
            this.setActiveItem(previousItem, previousItem !== undefined, event);
            return true;
          }
        }
        if (previousItem) {
          this.setActiveItem(previousItem, false, event);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Get the next visible item in the list.
   * @param index The index to get the next item after. Defaults to the currently active index.
   * @returns The next visible item or undefined if not found.
   */
  private getNextItem(index?: number): DataType | undefined {
    const arr = this.dynamicList.data.getArray();

    for (let i = (index === undefined ? this.activeIndex.get() : index) + 1; i < arr.length; i++) {
      const item = arr[i];
      if ((item.isVisible === undefined || item.isVisible.get() === true) && (!this.canSelectItem || this.canSelectItem(item))) {
        return item;
      }
    }
  }

  /**
   * Get the previous visible item in the list.
   * @returns The previous visible item or undefined if not found.
   */
  private getPreviousItem(): DataType | undefined {
    const arr = this.dynamicList.data.getArray();

    for (let i = this.activeIndex.get() - 1; i >= 0; i--) {
      const item = arr[i];
      if ((item.isVisible === undefined || item.isVisible.get() === true) && (!this.canSelectItem || this.canSelectItem(item))) {
        return item;
      }
    }
  }

  /**
   * Set the active item in the list.
   * @param newActiveItem The new active item.
   * @param spaceAfterItemSelected Whether the space after the item is selected rather than the item itself.
   * @param event The event that caused focus to be set, either the knob event or 'click' if it was clicked.
   */
  public setActiveItem(newActiveItem: DataType | undefined, spaceAfterItemSelected: boolean, event?: IfdInteractionEvent | 'click'): void {
    if (newActiveItem && this.canSelectItem && !this.canSelectItem(newActiveItem)) {
      return;
    }

    const activeBlock = this._activeBlock.get();

    const newIndex = newActiveItem ? this.dynamicList.data.getArray().indexOf(newActiveItem) : -1;

    // disallow setting the space as selected if it's not valid to do so
    if (spaceAfterItemSelected) {
      const nextItem = newIndex >= 0 ? this.getNextItem(newIndex) : undefined;
      if (!this.canSelectSpace || !this.canSelectSpace(newActiveItem, nextItem)) {
        spaceAfterItemSelected = false;
      }
    }

    if (
      activeBlock && activeBlock.isSelected.get() &&
      (!newActiveItem || this._activeIndex.get() !== newIndex || spaceAfterItemSelected)
    ) {
      activeBlock.onBlur();
    }

    if (!newActiveItem) {
      this._activeBlock.set(undefined);
      this._activeIndex.set(-1);
      this._spaceAfterItemSelected.set(false);
      return;
    }

    this._activeIndex.set(newIndex);
    const wrapper = this.dynamicList.getRenderedItem(this._activeIndex.get());

    this._activeBlock.set((wrapper?.props.children?.[0] as VNode | undefined)?.instance as BlockType | undefined);

    if (!spaceAfterItemSelected) {
      this._activeBlock.get()?.onFocus?.(event);
    }

    this._spaceAfterItemSelected.set(spaceAfterItemSelected);
  }

  /** Destroys the component. */
  public destroy(): void {
    for (let i = 0; i < this.subs.length; i++) {
      this.subs[i].destroy();
    }
  }
}

import {
  ComponentProps, DebounceTimer, DisplayComponent, EventBus, FSComponent, MappedSubject, ReadonlyFloat64Array, RenderPosition, SetSubject, Subject,
  Subscribable, SubscribableArray, SubscribableSet, SubscribableUtils, Subscription, ToggleableClassNameRecord, Vec2Math, Vec2Subject, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler, RightKnobState } from '../../RightKnob';
import { DynamicList } from './DynamicList';
import { DynamicListData } from './DynamicListData';
import { IfdListCursor } from './IfdListCursor';
import { IfdListItemWrapper } from './IfdListItemWrapper';
import { IfdTouchList } from './IfdTouchList';
import { TouchListProps } from './TouchList';
import { IfdListItemComponent, IfdListItemComponentProps } from './IfdListItemComponent';

import './IfdList.css';

/**
 * Where to place the item at when scrolling to it.
 */
export type ScrollToPosition = 'top' | 'bottom' | 'closest' | number;

/**
 * Formatting props for IfdList.
 */
export type IfdListFormattingProps = Omit<TouchListProps, 'itemCount' | 'maxRenderedItemCount'>;

/**
 * Component props for IfdList.
 */
export interface IfdListProps<DataType extends DynamicListData> extends ComponentProps, IfdListFormattingProps {
  /** The event bus. */
  bus: EventBus,

  /**
   * The data to display in the list. If both this property and `renderItem` are defined, the list will display
   * rendered data items instead of its children.
   */
  data?: SubscribableArray<DataType>;

  /**
   * A function that renders a single data item into the list. If both this property and `data` are defined, the
   * list will display rendered data items instead of its children.
   */
  renderItem?: (data: DataType, index: number, focus: () => void) => VNode;

  /**
   * The maximum number of items that can be rendered simultaneously. Ignored if `data`, `renderItem`, or
   * `itemsPerPage` is not defined. The value will be clamped to be greater than or equal to `itemsPerPage * 3`.
   * Defaults to infinity.
   */
  maxRenderedItemCount?: number | Subscribable<number>;

  /**
   * A VNode which will be rendered into the list's translating container and positioned after the container that
   * holds the list's rendered items. Can also be a function that receives the total list length observable.
   */
  staticTouchListChildren?: VNode | ((totalListLength: Subscribable<number>) => VNode);

  /**
   * A function to sort data items before rendering them. The function should return a negative number if the first
   * item should be rendered before the second, a positive number if the first item should be rendered after the
   * second, or zero if the two items' relative order does not matter. If not defined, items will be rendered in the
   * order in which they appear in the data array.
   */
  sortItems?: (a: DataType, b: DataType) => number

  /** The knob state to use. */
  knobState?: RightKnobState | Subscribable<RightKnobState | null>;

  /** A callback that will be called with the topVisibleIndex when it changes. */
  onTopVisibleIndexChanged?: (topVisibleIndex: number) => void;

  /** A callback function to execute when the list is destroyed. */
  onDestroy?: () => void;

  /** CSS class(es) to add to the list's root element. */
  class?: string | SubscribableSet<string> | ToggleableClassNameRecord;

  /** A predicate to determine if an item can be selected. */
  canSelectItem?: (a: DataType | undefined) => boolean

  /**
   * A predicate to determine if the space between two items can be selected.
   * Item b is undefined when a is the last item in the list.
   * Both can be undefined when there are no items in the list.
   * Defaults to always false.
   */
  canSelectSpace?: (a: DataType | undefined, b: DataType | undefined) => boolean;

  /**
   * A function to render the content shown in a selected space.
   */
  renderSpace?(data: DataType, cursor: IfdListCursor<DataType>): VNode | null;

  /**
   * A function to render the content shown in the space at the start of the list.
   * If not defined no space item will be shown at the start of the list.
   */
  renderSpaceBeforeList?(cursor: IfdListCursor<DataType>): VNode | null;

  /**
   * Whether to render the scrollbar. Defaults to true.
   */
  renderScrollBar?: boolean;
}

/**
 * A touchscreen vertically scrollable list which includes an animated scroll bar and supports rendering either a static
 * or dynamic sequence of list items. The list also supports scrolling in response to IFD Knob events and
 * editing of IFD right knob state to show the appropriate knob labels.
 */
export class IfdList<DataType extends DynamicListData>
  extends DisplayComponent<IfdListProps<DataType>>
  implements IfdInteractionEventHandler {

  private readonly scrollBarRef = FSComponent.createRef<HTMLDivElement>();
  private readonly touchListRef = FSComponent.createRef<IfdTouchList>();

  private readonly _renderWindow = Vec2Subject.create(Vec2Math.create(0, Infinity));
  /**
   * The window of rendered list items, as `[startIndex, endIndex]`, where `startIndex` is the index of the first
   * rendered item, inclusive, and `endIndex` is the index of the last rendered item, exclusive. These indexes are
   * defined after item sorting and visibility have been taken into account, such that index `i` refers to the *i*th
   * visible item in sorted order.
   */
  public readonly renderWindow = this._renderWindow as Subscribable<ReadonlyFloat64Array>;

  private readonly visibleItemCount = Subject.create(0);
  public readonly totalListLength = Subject.create(0);

  private readonly _activeIndex = Subject.create(0);
  public readonly activeIndex = this._activeIndex as Subscribable<number>;

  private readonly _activeItem = Subject.create<DataType | undefined>(undefined);
  public readonly activeItem = this._activeItem as Subscribable<DataType | undefined>;

  private readonly _spaceAfterItemSelected = Subject.create(false);
  public readonly spaceAfterItemSelected: Subscribable<boolean> = this._spaceAfterItemSelected;

  private readonly listItemSpacingPx = SubscribableUtils.toSubscribable(this.props.listItemSpacingPx, true);

  private staticChildrenRootNode?: VNode;
  private dynamicList?: DynamicList<DataType>;
  private ifdListCursor?: IfdListCursor<DataType>;

  private readonly updateRenderedWrappersTimer = new DebounceTimer();

  private readonly subscriptions: Subscription[] = [];

  /** @inheritdoc */
  public onAfterRender(): void {
    this.touchListRef.instance.renderWindow.pipe(this._renderWindow);

    if (this.props.data === undefined || this.props.renderItem === undefined) {
      // Render children into the touch list.

      if (this.props.children !== undefined) {
        const container = this.touchListRef.instance.getContainerRef();

        const root: VNode = this.staticChildrenRootNode = (
          <>{this.props.children}</>
        );

        FSComponent.render(root, container);

        // Count each first-level descendent non-fragment VNode as one list item.
        let count = 0;
        FSComponent.visitNodes(root, node => {
          if (node !== root && node.instance !== null && node.instance !== undefined) {
            if (typeof node.instance !== 'boolean') {
              count++;
            }
            return true;
          }

          return false;
        });

        this.visibleItemCount.set(count);
        const listItemHeightPx = SubscribableUtils.toSubscribable(this.props.listItemHeightPx ?? 0, true).get();
        this.totalListLength.set((count * listItemHeightPx) + ((this.listItemSpacingPx.get() ?? 0) * Math.max(count - 1, 0)));
      }
    } else {
      // Set up a dynamic list to render the provided data.

      const useRenderWindow = this.props.maxRenderedItemCount !== undefined;
      this.dynamicList = new DynamicList(
        this.props.data,
        this.touchListRef.instance.getContainerRef(),
        this.renderItemWrapper.bind(this),
        this.listItemSpacingPx.get() ?? 0,
        this.props.keepSpaceBeforeFirstItem ?? false,
        this.props.keepSpaceAfterLastItem ?? false,
        this.props.sortItems,
      );
      this.dynamicList.visibleItemCount.pipe(this.visibleItemCount);
      this.dynamicList.totalListLength.pipe(this.totalListLength);

      this.ifdListCursor = new IfdListCursor<DataType>(this.dynamicList, this.props.canSelectItem, this.props.canSelectSpace);

      // we have to do this after the cursor is setup
      if (this.props.renderSpaceBeforeList && this.props.canSelectSpace && this.ifdListCursor) {
        FSComponent.render(
          <div class='space-before-list-wrapper'>{this.props.renderSpaceBeforeList(this.ifdListCursor)}</div>,
          this.touchListRef.instance.getContainerRef(),
          RenderPosition.After,
        );
      }

      this.dynamicList.init();

      if (useRenderWindow) {
        const updateRenderedWrappers = this.updateRenderedWrappers.bind(this);

        const scheduleUpdate = (): void => {
          if (!this.updateRenderedWrappersTimer.isPending()) {
            this.updateRenderedWrappersTimer.schedule(updateRenderedWrappers, 0);
          }
        };

        // Visible item count increments and decrements with each visible item added/removed from the list (no bulk
        // changes), so we are guaranteed to be notified when any change is made to the set of visible items.
        this.visibleItemCount.sub(scheduleUpdate);
        this.touchListRef.instance.renderWindow.sub(updateRenderedWrappers);

        this.updateRenderedWrappers();
      }
    }

    const canScroll = MappedSubject.create(
      ([totalHeightPx, heightPx]) => totalHeightPx > heightPx,
      this.touchListRef.instance.totalLengthPx,
      this.touchListRef.instance.lengthPx
    );

    if (this.props.renderScrollBar === undefined || this.props.renderScrollBar) {
      canScroll.sub(val => {
        this.scrollBarRef.instance.style.opacity = val ? '1' : '0';
      }, true);

      this.touchListRef.instance.scrollBarLengthFraction.sub(scrollBarLengthFraction => {
        this.scrollBarRef.instance.style.height = (scrollBarLengthFraction * 100) + '%';
      }, true);
    }

    const updateScrollBarTranslation = this.updateScrollBarTranslation.bind(this);
    this.touchListRef.instance.lengthPx.sub(updateScrollBarTranslation, true);
    this.touchListRef.instance.scrollPosFraction.sub(updateScrollBarTranslation, true);
    this.touchListRef.instance.scrollBarLengthFraction.sub(updateScrollBarTranslation, true);

    const { onTopVisibleIndexChanged } = this.props;
    if (onTopVisibleIndexChanged) {
      this.touchListRef.getOrDefault()?.firstVisibleIndex.sub(x => onTopVisibleIndexChanged(x), true);
    }

    this.ifdListCursor?.activeIndex.sub((index) => {
      this.scrollToIndex(index, 'closest', true, true);
    });

    this.ifdListCursor?.activeIndex.pipe(this._activeIndex);
    this.ifdListCursor?.activeItem.pipe(this._activeItem);
    this.ifdListCursor?.spaceAfterItemSelected.pipe(this._spaceAfterItemSelected);
  }

  /**
   * Make sure what we have selected is still valid.
   * Can be called if canSelectItem might have changed for reasons other than the list changing.
   */
  public checkSelection(): void {
    this.ifdListCursor?.checkSelection();
  }

  /**
   * Scrolls until the item at a specified index is in view.
   * @param index The index of the item to which to scroll, after sorting has been applied and hidden items have been
   * excluded.
   * @param position The position to place the target item at the end of the scroll. `top` will put the item
   * at the top of the list, `bottom` at the bottom. Position `0` is the top-most
   * visible slot, position `1` is the next slot, and so on. Values greater than or equal to the number of visible
   * items per page will be clamped. If this value is negative or `closest`, the target item will be placed at the visible position
   * that results in the shortest scroll distance. Ignored if this list does not support snapping to list items.
   * @param animate Whether to animate the scroll.
   * @param ignoreIfItemInView Whether to skip the scroll operation if the target item is already in view or will
   * be in view when the current scrolling animation finishes. Defaults to `false`.
   */
  public scrollToIndex(index: number, position: ScrollToPosition, animate: boolean, ignoreIfItemInView = false): void {
    const touchList = this.touchListRef.getOrDefault();

    if (!touchList) {
      return;
    }

    const itemsPerPage = touchList.itemsPerPage?.get();

    if (itemsPerPage !== undefined && typeof position === 'number') {
      if (ignoreIfItemInView && itemsPerPage !== undefined) {
        const scrollY = touchList.targetScrollPos.get();
        const listItemHeightWithMarginPx = touchList.listItemLengthWithMarginPx.get();
        const topVisibleIndex = scrollY / listItemHeightWithMarginPx;
        const bottomVisibleIndex = topVisibleIndex + itemsPerPage - 1;
        if (index >= topVisibleIndex && index <= bottomVisibleIndex) {
          return;
        }
      }

      if (position < 0) {
        touchList.scrollToIndexWithMargin(index, 0, animate);
      } else {
        touchList.scrollToIndex(index, position, animate);
      }

      return;
    }

    // The following will calculate the target scroll position based on each item's height
    const arr = this.props.data?.getArray();
    const listVisibleLength = touchList.lengthPx.get();
    let topTarget = 0;
    let bottomTarget = 0;

    if (!arr || !arr[index]) {
      return;
    }

    // Calculate height of all items up to the index
    const listItemSpacingPx = this.listItemSpacingPx.get() ?? 0;
    for (let i = 0; i < index; i++) {
      const item = arr[i];
      const heightPx = SubscribableUtils.isSubscribable(item.heightPx) ? item.heightPx.get() : item.heightPx;
      if (item && (item.isVisible === undefined || item.isVisible.get())) {
        topTarget += heightPx + listItemSpacingPx;
      }
    }

    const margin = index < arr.length - 1 ? listItemSpacingPx : 0;
    const itemHeight = SubscribableUtils.isSubscribable(arr[index].heightPx) ? arr[index].heightPx.get() : arr[index].heightPx;

    bottomTarget = topTarget;
    bottomTarget -= listVisibleLength;
    bottomTarget += itemHeight + margin;
    // We don't do this for topTarget because in the IFD it include the space above the item as the top of the item when scrolling up
    if (this.props.keepSpaceBeforeFirstItem) {
      bottomTarget += listItemSpacingPx;
    }
    bottomTarget = Math.max(0, bottomTarget);

    if (ignoreIfItemInView) {
      const scrollY = touchList.targetScrollPos.get();
      if (scrollY <= topTarget && scrollY >= bottomTarget) {
        return;
      }
    }

    if (position === 'closest') {
      const scrollPos = touchList.scrollPos.get();
      position = Math.abs(scrollPos - topTarget) < Math.abs(scrollPos - bottomTarget) ? 'top' : 'bottom';
    }

    if (position === 'top') {
      touchList.executeScrollTo(topTarget, animate);
    } else if (position === 'bottom') {
      touchList.executeScrollTo(bottomTarget, animate);
    }
  }

  /**
   * Scrolls until the specified item is in view. If this is a static list, this method does nothing.
   * @param item The item to which to scroll.
   * @param position The position to place the target item at the end of the scroll. `top` will put the item
   * at the top of the list, `bottom` at the bottom. Position `0` is the top-most
   * visible slot, position `1` is the next slot, and so on. Values greater than or equal to the number of visible
   * items per page will be clamped. If this value is negative or `closest`, the target item will be placed at the visible position
   * that results in the shortest scroll distance. Ignored if this list does not support snapping to list items.
   * @param animate Whether to animate the scroll.
   * @param ignoreIfItemInView Whether to skip the scroll operation if the target item is already in view or will
   * be in view when the current scrolling animation finishes. Defaults to `false`.
   */
  public scrollToItem(item: DataType, position: ScrollToPosition, animate: boolean, ignoreIfItemInView = false): void {
    if (this.props.data === undefined || this.dynamicList === undefined || item.isVisible?.get() === false) {
      return;
    }

    const listIndex = this.dynamicList.sortedIndexOfData(item);
    if (listIndex < 0) {
      return;
    }

    this.scrollToIndex(listIndex, position, animate, ignoreIfItemInView);
  }

  /**
   * Gets the pixel offset of the top of a list item by index.
   * @param index The index of the item to get the offset for.
   * @returns the offset in pixels, or null if the item is not displayed or is otherwise not available.
   */
  public getTopPositionOfIndex(index: number): number | null {
    const touchList = this.touchListRef.getOrDefault();

    if (!touchList) {
      return null;
    }

    const arr = this.props.data?.getArray();
    let topTarget = 0;

    if (!arr) {
      return null;
    }

    // Calculate height of all items up to the index
    const listItemSpacingPx = this.listItemSpacingPx.get() ?? 0;
    for (let i = 0; i < index; i++) {
      const item = arr[i];
      if (item && item.isVisible?.get() !== false) {
        const heightPx = SubscribableUtils.isSubscribable(item.heightPx) ? item.heightPx.get() : item.heightPx;
        topTarget += heightPx + listItemSpacingPx;
      }
    }

    if (this.props.keepSpaceBeforeFirstItem) {
      topTarget += listItemSpacingPx;
    }

    return topTarget;
  }

  /**
   * Gets the pixel offset of the top of a list item.
   * @param item The item to get the offset for.
   * @returns the offset in pixels, or null if the item is not displayed or is otherwise not available.
   */
  public getTopPositionOfItem(item: DataType): number | null {
    if (this.props.data === undefined || this.dynamicList === undefined || item.isVisible?.get() === false) {
      return null;
    }

    const listIndex = this.dynamicList.sortedIndexOfData(item);
    if (listIndex < 0) {
      return null;
    }

    return this.getTopPositionOfIndex(listIndex);
  }

  /**
   * Focuses a specified item in this list. If this is a static list, this method does nothing.
   * @param item The item to focus.
   * @param event The event that caused the focus.
   * @param spaceAfterItemSelected Whether the space after the item is selected rather than the item itself.
   */
  public focusItem(item: DataType, event?: IfdInteractionEvent | 'click', spaceAfterItemSelected = false): void {
    if (this.props.data === undefined || this.dynamicList === undefined || item.isVisible?.get() === false) {
      return;
    }

    this.ifdListCursor?.setActiveItem(item, spaceAfterItemSelected, event);
  }

  /**
   * Focuses a specified item in this list by index. If this is a static list, this method does nothing.
   * @param index The index of the item to focus, after sorting has been applied and hidden items have been excluded.
   * @param event The event that caused the focus.
   */
  public focusIndex(index: number, event?: IfdInteractionEvent | 'click'): void {
    if (this.props.data === undefined || this.dynamicList === undefined) {
      return;
    }

    const item = this.props.data.tryGet(index);
    if (item) {
      this.focusItem(item, event);
    }
  }

  /**
   * Updates the order of rendered items in this list.
   */
  public updateOrder(): void {
    if (this.dynamicList) {
      this.dynamicList.updateOrder();
      this.updateRenderedWrappers();
    }
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    return this.ifdListCursor?.onInteractionEvent(event) ?? false;
  }

  /**
   * Updates the translation of this list's scroll bar.
   */
  private updateScrollBarTranslation(): void {
    const heightPx = this.touchListRef.instance.lengthPx.get();
    const scrollBarHeightPx = this.touchListRef.instance.scrollBarLengthFraction.get() * heightPx;
    const maxScrollBarY = heightPx - scrollBarHeightPx;
    const scrollBarY = maxScrollBarY * this.touchListRef.instance.scrollPosFraction.get();
    if (this.props.renderScrollBar === undefined || this.props.renderScrollBar) {
      this.scrollBarRef.instance.style.transform = `translate3d(0px, ${scrollBarY}px, 0)`;
    }
  }

  /**
   * Updates the visibility of rendered list item wrappers. Has no effect if a dynamic list has not been created
   * for this list or if a maximum rendered item count is not defined.
   */
  private updateRenderedWrappers(): void {
    if (!this.dynamicList || this.props.maxRenderedItemCount === undefined) {
      return;
    }

    this.updateRenderedWrappersTimer.clear();

    const win = this.touchListRef.instance.renderWindow.get();
    const count = this.visibleItemCount.get(); // number of visible items right now

    if (!Number.isFinite(count) || count <= 0) {
      // nothing to show; hide everything defensively
      this.dynamicList.forEachComponent<IfdListItemWrapper>(w => w?.setVisible(false), true, true);
      return;
    }

    // clamp the window to [0, count]
    const start = Math.max(0, Math.min(win[0], count));
    const end = Math.max(start, Math.min(win[1], count));

    this.dynamicList.forEachComponent<IfdListItemWrapper>((wrapper, index) => {
      wrapper?.setVisible(index >= start && index < end);
    }, true, true);
  }

  /**
   * Gets the rendered item at the specified index.
   * @returns The rendered item wrapper, or undefined if the index is invalid or no dynamic list exists.
   */
  public getRenderedItem(): IfdListItemComponent<IfdListItemComponentProps<DynamicListData>> | undefined {
    return this.ifdListCursor?.activeBlock.get();
  }

  /**
   * Renders a list item and wrapper for a data item.
   * @param data The data item for which to render the list item.
   * @param index The index of the data item in its containing array.
   * @returns A wrapper containing the rendered list item for the specified data item.
   */
  private renderItemWrapper(data: DataType, index: number): VNode {
    const itemNode = this.props.renderItem && this.props.renderItem(data, index, () => {
      this.ifdListCursor?.setActiveItem(data, false, 'click');
    });

    return (
      <IfdListItemWrapper
        isVisible={data.isVisible}
        heightPx={data.heightPx}
      >
        {itemNode}
        {this.props.canSelectSpace && this.props.renderSpace && this.ifdListCursor ? this.props.renderSpace(data, this.ifdListCursor) : null}
      </IfdListItemWrapper>
    );
  }

  /** @inheritdoc */
  public render(): VNode {
    let cssClass = SetSubject.create(['ifd-list']);

    if (typeof this.props.class === 'object') {
      const sub = FSComponent.bindCssClassSet(cssClass, this.props.class, ['ifd-list']);
      if (Array.isArray(sub)) {
        this.subscriptions.push(...sub);
      } else {
        this.subscriptions.push(sub);
      }
    } else if (this.props.class !== undefined) {
      cssClass = SetSubject.create([
        'ifd-list',
        ...(FSComponent.parseCssClassesFromString(this.props.class)
          .filter(classToAdd => classToAdd !== 'ifd-list'))
      ]);
    }

    if (this.props.keepSpaceBeforeFirstItem) {
      cssClass.add('ifd-list-keep-space-before-first-item');
    }
    if (this.props.keepSpaceAfterLastItem) {
      cssClass.add('ifd-list-keep-space-after-last-item');
    }

    return (
      <div class={cssClass}>
        <IfdTouchList
          ref={this.touchListRef}
          lengthPx={this.props.heightPx}
          totalLengthPx={this.totalListLength}
          itemsPerPage={this.props.itemsPerPage}
          maxRenderedItemCount={this.props.data === undefined || this.props.renderItem === undefined ? undefined : this.props.maxRenderedItemCount}
          maxOverscrollPx={this.props.maxOverscrollPx}
          listItemLengthPx={this.props.listItemHeightPx}
          listItemSpacingPx={this.props.listItemSpacingPx}
          itemCount={this.visibleItemCount}
          bus={this.props.bus}
        >
          {typeof this.props.staticTouchListChildren === 'function'
            ? this.props.staticTouchListChildren(this.totalListLength)
            : this.props.staticTouchListChildren
          }
        </IfdTouchList>
        {(this.props.renderScrollBar === undefined || this.props.renderScrollBar) &&
          <div class="ifd-list-scroll-bar-container">
            <div ref={this.scrollBarRef} class="ifd-list-scroll-bar" />
          </div>
        }
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.props.onDestroy && this.props.onDestroy();

    this.touchListRef.getOrDefault()?.destroy();

    const staticChildrenRootNode = this.staticChildrenRootNode;
    if (staticChildrenRootNode !== undefined) {
      FSComponent.shallowDestroy(staticChildrenRootNode);
    }

    this.ifdListCursor?.destroy();
    this.dynamicList?.destroy();
    this.updateRenderedWrappersTimer.clear();

    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    super.destroy();
  }
}

import {
  ArraySubject, ClassProp, ComponentProps, EventBus, FSComponent, LifecycleComponent, SetSubject, Subject, Subscribable, SubscribableArray,
  SubscribableArrayEventType, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { DynamicListData, IfdList } from '../../../../Components/List';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler } from '../../../../RightKnob';
import { Position } from '../FplSelectionMenu/FplSelectionMenuController';

import './SelectionMenu.css';

/** A menu option definition. */
export type SelectionMenuOptionDefinition = {
  /** The name to show in the UI. */
  name: string;
  /** Additional annotation shown to the right of the label. */
  annotation?: string;
  /** The handler when this option is confirmed. */
  confirmHandler: (optionIndex: number, groupIndex: number, name: string) => void,
  /** The handler when this option is selected or de-selected. */
  selectHandler?: (selected: boolean, optionIndex: number, groupIndex: number, name: string) => void,
}

/** A group of options with an optional section title */
export type SelectionMenuGroup = {
  /** Group title. */
  title?: string;
  /** The group's option labels */
  options: SubscribableArray<SelectionMenuOptionDefinition>;
};

/** The list data for a selection menu */
type BaseSelectionMenuListData = DynamicListData & {
  /** Internal list item kinds */
  kind: 'header' | 'option';
  /** Visible label shown on the row (title for headers, option text for options) */
  label?: string;
  /** Indexes for selection mapping */
  groupIndex: number;
};

/** List data for a group. */
type GroupSelectionMenuListData = BaseSelectionMenuListData & {
  /** Internal list item kinds */
  kind: 'header',
}

/** List data for an option. */
type OptionSelectionMenuListData = BaseSelectionMenuListData & {
  /** Internal list item kinds */
  kind: 'option',
  /** Visible label shown on the row (title for headers, option text for options) */
  label: string;
  /** Additional annotation shown to the right of the label. */
  annotation?: string;
  /** The option index within the group. */
  optionIndex: number;
  /** The handler when this option is confirmed. */
  confirmHandler: (optionIndex: number, groupIndex: number, name: string) => void,
  /** The handler when this option is selected or de-selected. Closing the menu is counted as de-selection. */
  selectHandler?: (selected: boolean, optionIndex: number, groupIndex: number, name: string) => void,
}

/** The list data for a selection menu */
type SelectionMenuListData = GroupSelectionMenuListData | OptionSelectionMenuListData;

/** The properties for the {@link SelectionMenu} component. */
export interface SelectionMenuProps extends ComponentProps {
  /** CSS classes to apply. */
  readonly class?: ClassProp;
  /** The grouped options */
  readonly groups: SubscribableArray<SelectionMenuGroup>;
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** A method to be called when selection of an option is complete. Hint: close menu, or whatever you need to do. */
  readonly onConfirmed?: () => void;
  /** Whether the menu is hidden. */
  readonly isHidden: Subscribable<boolean>;
  /** Automatically selects the first item in the list when it is added if true. */
  readonly autoSelectFirstItem?: boolean;
}

/** The SelectionMenu component. */
export class SelectionMenu extends LifecycleComponent<SelectionMenuProps> implements IfdInteractionEventHandler {
  private class = SetSubject.create(['leg-block-selection-menu']);

  private readonly listData = ArraySubject.create<SelectionMenuListData>([]);
  private readonly listRef = FSComponent.createRef<IfdList<SelectionMenuListData>>();

  private readonly itemHeights = {
    header: 32,
    option: 58,
  };
  private readonly menuHeight = Subject.create<number>(200);

  private readonly groupSubs: Subscription[] = [];

  /** The selected index in the listData array. Not globalOptionIndex of the option! */
  private readonly selectedItemIndex = Subject.create(-1);
  /** The selected item, or undefined if there isn't one. */
  private readonly selectedItem = Subject.create<OptionSelectionMenuListData | undefined>(undefined);

  private renderItem = (listItem: SelectionMenuListData): VNode => {
    if (listItem.kind === 'header') {
      return listItem.label ? (
        <div class="leg-block-selection-menu-group-title">
          <span class="leg-block-selection-menu-group-title-text">{listItem.label}</span>
        </div>
      ) : <></>;
    }

    return (
      <SelectionMenuOption
        data={listItem}
        onConfirmed={this.onConfirmed}
        selectItem={this.setSelectedItem}
        isSelected={this.selectedItem.map((sel) => sel === listItem).withLifecycle(this.defaultLifecycle)}
      />
    );
  };

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    if (this.props.class) {
      FSComponent.bindSetToCssClasses(this.class, ['leg-block-selection-menu'], this.props.class);
    }

    this.props.groups.sub(this.onGroupsChanged.bind(this), true);

    this.listData.sub((index, type, item, array) => {
      const total = array.reduce(
        (sum, r) => sum + (r.kind === 'header' ? this.itemHeights.header : this.itemHeights.option),
        0
      );
      this.menuHeight.set(Math.min(400, total));

      const selectedIndex = this.selectedItemIndex.get();
      switch (type) {
        case SubscribableArrayEventType.Added:
          if (selectedIndex >= index) {
            // our selection is after the added items
            this.selectedItemIndex.set(selectedIndex + (Array.isArray(item) ? item.length : 1));
          } else if (this.props.autoSelectFirstItem && selectedIndex < 0) {
            this.selectedItemIndex.set(this.getFirstOptionIndex());
          }
          break;
        case SubscribableArrayEventType.Removed:
          if (selectedIndex >= index) {
            const removedItemCount = (Array.isArray(item) ? item.length : 1);
            if (selectedIndex < (index + removedItemCount)) {
              // our selection was deleted!
              this.selectedItemIndex.set(-1);
            } else {
              // our selection is after the deleted range
              this.selectedItemIndex.set(selectedIndex - removedItemCount);
            }
          }
          break;
        case SubscribableArrayEventType.Cleared:
          this.selectedItemIndex.set(-1);
          break;
      }

      const selectedItem = array[this.selectedItemIndex.get()];
      this.selectedItem.set(selectedItem?.kind === 'option' ? selectedItem : undefined);
    }, true).withLifecycle(this.defaultLifecycle);

    this.selectedItemIndex.sub((i) => {
      const oldSelectedItem = this.selectedItem.get();
      let newSelectedItem = this.listData.tryGet(i);
      if (newSelectedItem?.kind !== 'option') {
        newSelectedItem = undefined;
      }

      if (oldSelectedItem !== newSelectedItem) {
        if (oldSelectedItem) {
          oldSelectedItem.selectHandler?.(false, oldSelectedItem.optionIndex, oldSelectedItem.groupIndex, oldSelectedItem.label);
        }
        if (newSelectedItem) {
          newSelectedItem.selectHandler?.(true, newSelectedItem.optionIndex, newSelectedItem.groupIndex, newSelectedItem.label);
        }
      }

      this.selectedItem.set(newSelectedItem);
      this.listRef.getOrDefault()?.scrollToIndex(i, 'closest', true, true);
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Automatically selects the first list option if one exists.
   * @returns The index of the first option item on the list, or -1 if there isn't one.
   */
  private getFirstOptionIndex(): number {
    for (let i = 0; i < this.listData.length; i++) {
      if (this.listData.tryGet(i)?.kind === 'option') {
        return i;
      }
    }
    return -1;
  }

  /**
   * Handles the group array changing.
   * @param index Index of changed item.
   * @param type Operation type.
   * @param item Changed item(s).
   */
  private onGroupsChanged(index: number, type: SubscribableArrayEventType, item: SelectionMenuGroup | readonly SelectionMenuGroup[] | undefined): void {
    switch (type) {
      case SubscribableArrayEventType.Added: {
        const newItems: SelectionMenuGroup[] = Array.isArray(item) ? item : [item];
        const newListDataItems: SelectionMenuListData[] = newItems.map((v) => ({
          kind: 'header',
          label: v.title,
          groupIndex: index,
          optionIndex: -1,
          isVisible: Subject.create(v.title !== undefined),
          heightPx: this.itemHeights.header,
        }));

        let insertIndex = 0;
        for (let i = 0; i < this.listData.length; i++) {
          const listItem = this.listData.get(i);
          if (listItem.groupIndex < index) {
            insertIndex = i + 1;
          }
          if (listItem.groupIndex >= index) {
            listItem.groupIndex += newItems.length;
          }
        }

        this.listData.insertRange(insertIndex, newListDataItems);

        this.groupSubs.splice(index, 0, ...newListDataItems.map(
          (group, i) => newItems[i].options.sub(
            (optionIndex, optionEventType, optionItem) => this.onGroupOptionsChanged(group, optionIndex, optionEventType, optionItem),
            true,
          )
        ));
        break;
      }

      case SubscribableArrayEventType.Removed: {
        const removedItemsCount = Array.isArray(item) ? item.length : 1;

        for (let i = this.listData.length - 1; i >= 0; i--) {
          const listItem = this.listData.get(i);
          if (listItem.groupIndex >= index && listItem.groupIndex < (index + removedItemsCount)) {
            this.listData.removeAt(i);
          } else if (listItem.groupIndex > index) {
            listItem.groupIndex -= removedItemsCount;
          }
        }

        for (const sub of this.groupSubs.splice(index, removedItemsCount)) {
          sub.destroy();
        }
        break;
      }

      case SubscribableArrayEventType.Cleared:
        this.listData.clear();
        for (const sub of this.groupSubs) {
          sub.destroy();
        }
        this.groupSubs.length = 0;
        break;
    }
  }

  /**
   * Handles the options array for a group changing.
   * @param group The group that the options changed for.
   * @param index Index of changed item.
   * @param type Operation type.
   * @param item Changed item(s).
   */
  private onGroupOptionsChanged(
    group: SelectionMenuListData,
    index: number,
    type: SubscribableArrayEventType,
    item: SelectionMenuOptionDefinition | readonly SelectionMenuOptionDefinition[] | undefined,
  ): void {
    switch (type) {
      case SubscribableArrayEventType.Added: {
        const newItems: SelectionMenuOptionDefinition[] = Array.isArray(item) ? item : [item];

        let groupItemCount = 0;
        let groupIndex = -1;

        // we go +1 to ensure we insert if the items are going after the end of the current list
        for (let i = 0; i < this.listData.length + 1; i++) {
          const listItem = this.listData.tryGet(i);

          if (groupIndex === group.groupIndex && groupItemCount === index) {
            const newListDataItems: SelectionMenuListData[] = newItems.map((v) => ({
              kind: 'option',
              label: v.name,
              annotation: v.annotation,
              confirmHandler: v.confirmHandler,
              selectHandler: v.selectHandler,
              groupIndex: groupIndex,
              optionIndex: groupItemCount++,
              isVisible: Subject.create(true),
              heightPx: this.itemHeights.option,
            }));

            this.listData.insertRange(i, newListDataItems);
            i += newListDataItems.length;
          }

          if (listItem?.kind === 'header') {
            groupItemCount = 0;
            groupIndex = listItem.groupIndex;
          } else if (listItem?.kind === 'option') {
            listItem.optionIndex = groupItemCount++;
          }
        }

        break;
      }
      case SubscribableArrayEventType.Removed: {
        const removedItemsCount = Array.isArray(item) ? item.length : 1;

        let groupItemCount = 0;
        let groupIndex = -1;
        const removed = false;

        for (let i = 0; i < this.listData.length; i++) {
          if (!removed && groupIndex === group.groupIndex && groupItemCount === index) {
            for (let j = 0; j < removedItemsCount; j++) {
              this.listData.removeAt(i);
            }
            continue;
          }

          const listItem = this.listData.get(i);
          if (listItem) {
            if (listItem.kind === 'header') {
              groupItemCount = 0;
              groupIndex = listItem.groupIndex;
            } else if (listItem.kind === 'option') {
              listItem.optionIndex = groupItemCount++;
            }
          }
        }
        break;
      }
      case SubscribableArrayEventType.Cleared: {
        for (let i = 0; i < this.listData.length; i++) {
          const listItem = this.listData.get(i);
          if (listItem.kind === 'option' && listItem.groupIndex === group.groupIndex) {
            this.listData.removeAt(i);
            i--;
            continue;
          }
        }
        break;
      }
    }
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.props.isHidden.get()) {
      return false;
    }

    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
      case IfdInteractionEvent.RightKnobOuterInc:
        this.stepSelection(1);
        return true;

      case IfdInteractionEvent.RightKnobInnerDec:
      case IfdInteractionEvent.RightKnobOuterDec:
        this.stepSelection(-1);
        return true;

      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        this.confirmSelection();
        return true;

      default:
        return false;
    }
  }

  /**
   * Gets the next available option index.
   * @returns The option index in this.listData, or undefined if it doesn't exist.
   */
  private getNextOptionIndex(): number | undefined {
    for (let i = this.selectedItemIndex.get() + 1; i < this.listData.length; i++) {
      if (this.listData.tryGet(i)?.kind === 'option') {
        return i;
      }
    }
  }

  /**
   * Gets the next available option index.
   * @returns The option index in this.listData, or undefined if it doesn't exist.
   */
  private getPreviousOptionIndex(): number | undefined {
    for (let i = this.selectedItemIndex.get() - 1; i >= 0; i--) {
      if (this.listData.tryGet(i)?.kind === 'option') {
        return i;
      }
    }
  }

  /**
   * Step the currently highlighted option by `delta` (negative to move up).
   * @param delta The number of steps to move the selection by.
   */
  private stepSelection(delta: number): void {
    const newIndex = delta > 0 ? this.getNextOptionIndex() : this.getPreviousOptionIndex();
    if (newIndex !== undefined) {
      this.selectedItemIndex.set(newIndex);
    }
  }

  /** Commit the currently highlighted option as if the user pressed the knob. */
  private confirmSelection(): void {
    const selectedOption = this.selectedItem.get();
    if (selectedOption) {
      this.onConfirmed(selectedOption);
    }
  }

  private onConfirmed = (data: OptionSelectionMenuListData): void => {
    if (this.props.isHidden.get()) {
      return;
    }
    data.confirmHandler(data.optionIndex, data.groupIndex, data.label);
    this.props.onConfirmed?.();
  };

  private setSelectedItem = (item: OptionSelectionMenuListData): void => {
    this.setSelectedOption(item.optionIndex, item.groupIndex);
  };

  /**
   * Sets the selected item.
   * @param optionIndex The option index (within it's group).
   * @param groupIndex The group index. If not specified the first group with a matching option will be selected.
   */
  public setSelectedOption(optionIndex: number, groupIndex?: number): void {
    for (let i = 0; i < this.listData.length; i++) {
      const item = this.listData.get(i);
      if (item.kind === 'option' && item.optionIndex === optionIndex && (groupIndex === undefined || item.groupIndex === groupIndex)) {
        this.selectedItemIndex.set(i);
        break;
      }
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={this.class}>
        <div class="leg-block-selection-menu-options">
          <IfdList<SelectionMenuListData>
            ref={this.listRef}
            bus={this.props.bus}
            listItemHeightPx={this.itemHeights.option}
            heightPx={this.menuHeight}
            data={this.listData}
            renderItem={this.renderItem}
            maxRenderedItemCount={20}
            itemsPerPage={20}
          />
        </div>
      </div>
    );
  }
}

/** The properties for the {@link SelectionMenuOption} component. */
export interface SelectionMenuOptionProps {
  /** The data for this list item. */
  readonly data: OptionSelectionMenuListData;
  /** Whether the option is selected */
  readonly isSelected: Subscribable<boolean>;
  /** A method to be called when selection of an option is complete. */
  readonly onConfirmed: (data: OptionSelectionMenuListData) => void;
  /** A method to select an item in the list. */
  readonly selectItem: (data: OptionSelectionMenuListData) => void;
}

/** The SelectionMenuOption component. */
class SelectionMenuOption extends LifecycleComponent<SelectionMenuOptionProps> {
  private readonly optionRef = FSComponent.createRef<HTMLDivElement>();
  private mouseDownPosition: Position | null = null;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.optionRef.instance.addEventListener('mousedown', (evt) => {
      this.mouseDownPosition = { xCoord: evt.clientX, yCoord: evt.clientY };
    });
    this.optionRef.instance.addEventListener('mouseup', (evt) => {
      if (
        this.mouseDownPosition
        && this.mouseDownPosition.xCoord === evt.clientX
        && this.mouseDownPosition.yCoord === evt.clientY
      ) {
        if (this.props.isSelected.get()) {
          this.props.onConfirmed(this.props.data);
        } else {
          this.props.selectItem(this.props.data);
        }
      }
    });
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'leg-block-selection-menu-option': true,
          'leg-block-selection-menu-option-selected': this.props.isSelected,
        }}
        ref={this.optionRef}
      >
        <div class="leg-block-selection-menu-option-text">
          {this.props.data.label}
        </div>
        {this.props.data.annotation &&
          <div class="leg-block-selection-menu-option-annotation">{this.props.data.annotation}</div>
        }
      </div>
    );
  }
}

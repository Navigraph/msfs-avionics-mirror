import { ComponentProps, DisplayComponent, FSComponent, MutableSubscribable, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { TouchTab, TouchTabHighlightColor } from './TouchTab';

import './TouchTabGroup.css';

/** Info and state for a TouchTab. */
export interface TouchTabInfo {
  /** The label to display on the tab. */
  readonly title: string | Subscribable<string>;
  /** When undefined, no highlight will be applied, otherwise the highlight color will be applied. */
  readonly highlightColor?: Subscribable<TouchTabHighlightColor | undefined>
  /** Whether this is the default tab in the group. */
  readonly isDefault?: boolean;
}

/**
 * The properties for the {@link TouchTabGroup} component.
 */
export interface TouchTabGroupProps extends ComponentProps {
  /** Array of tab info objects. */
  readonly tabs: readonly TouchTabInfo[];
  /** The currently selected tab. */
  readonly activeTab: MutableSubscribable<TouchTabInfo | undefined>;
  /** Callback when a tab is clicked. */
  readonly onTabClicked?: (tab: TouchTabInfo) => void;
}

/**
 * TouchTabGroup component for the IFD
 * Displays page tabs for the different tabs in the current page
 */
export class TouchTabGroup extends DisplayComponent<TouchTabGroupProps> {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  render(): VNode {
    return <div ref={this.rootRef} class="touch-tab-group">
      {/* Reverse the order of the tabs, then reverse with flex-box, that way the left most tabs render on top of the right most tabs. */}
      {this.props.tabs.slice().reverse().map(tab => (
        <TouchTab
          label={tab.title}
          isSelected={this.props.activeTab.map(activeTab => activeTab === tab)}
          onClick={() => {
            this.props.activeTab.set(tab);
            this.props.onTabClicked?.(tab);
          }}
          highlightColor={tab.highlightColor}
        />
      ))}
    </div>;
  }
}

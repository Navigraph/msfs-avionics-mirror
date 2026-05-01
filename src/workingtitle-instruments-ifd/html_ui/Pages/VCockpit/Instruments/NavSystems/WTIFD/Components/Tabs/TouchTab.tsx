import { ComponentProps, DisplayComponent, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './TouchTab.css';

/** The different color highlights supported by a TouchTab. */
export type TouchTabHighlightColor = 'yellow' | 'red' | 'cyan' | 'green';

/** The properties for the {@link TouchTab} component. */
interface TabProps extends ComponentProps {
  /** The label to display on the tab. */
  readonly label: string | Subscribable<string>;
  /** Whether the tab is currently selected. */
  readonly isSelected: Subscribable<boolean>;
  /** The function to call when the tab is clicked. */
  readonly onClick: () => void;
  /** When undefined, no highlight will be applied, otherwise the highlight color will be applied. */
  readonly highlightColor?: Subscribable<TouchTabHighlightColor | undefined>
}

/** The Tab component. */
export class TouchTab extends DisplayComponent<TabProps> {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public onAfterRender(): void {
    this.rootRef.instance.addEventListener('mousedown', this.props.onClick);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        ref={this.rootRef}
        class={{
          'touch-tab': true,
          'touch-tab-selected': this.props.isSelected,
          'touch-tab-highlight-yellow': this.props.highlightColor?.map(color => color === 'yellow') || false,
          'touch-tab-highlight-red': this.props.highlightColor?.map(color => color === 'red') || false,
          'touch-tab-highlight-cyan': this.props.highlightColor?.map(color => color === 'cyan') || false,
          'touch-tab-highlight-green': this.props.highlightColor?.map(color => color === 'green') || false,
        }}>
        <div class="touch-tab-label">
          {this.props.label}
        </div>
      </div>
    );
  }
}

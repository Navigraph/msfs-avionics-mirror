import { FSComponent, NodeReference, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { ExpandCollapseButton } from '../../../../../Components/SettingsMenu/ExpandCollapseButton';
import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { SetupRowBase, SetupRowBaseProps } from './SetupRowBase';

/**
 * Props for the CollapsibleRow component.
 */
export interface CollapsibleRowProps extends SetupRowBaseProps {
  /** Optional state to show on the right side when collapsed */
  readonly collapsedStateContent?: Subscribable<string>;
  /** Whether the row is initially expanded */
  readonly initiallyExpanded?: boolean;
  /** Optional callback when the expanded state changes */
  readonly onExpandedChanged?: (isExpanded: boolean) => void;
  /** When true, expanding this row will hide all other rows at root level */
  readonly expandAsSingle?: boolean;
  /** Reference to the component instance */
  readonly ref?: NodeReference<CollapsibleRow>;
}

/**
 * A setup row that can be expanded to reveal additional content.
 */
export class CollapsibleRow extends SetupRowBase<CollapsibleRowProps> {
  protected readonly isExpanded = Subject.create<boolean>(false);

  /**
   * Constructor.
   * @param props The component props.
   */
  constructor(props: CollapsibleRowProps) {
    super(props);
    this.isExpanded.set(props.initiallyExpanded ?? false);
  }

  /**
   * Toggles the expanded state.
   */
  private toggleExpanded(): void {
    const newState = !this.isExpanded.get();

    this.updateExpandedState(newState);
  }

  /**
   * Updates the expanded state.
   * @param isExpanded The new expanded state.
   */
  private updateExpandedState(isExpanded: boolean): void {
    this.isExpanded.set(isExpanded);

    // Call the onExpandedChanged callback if provided
    if (this.props.onExpandedChanged) {
      this.props.onExpandedChanged(isExpanded);
    }
  }

  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    if (this._isSelected.get()) {
      this.toggleExpanded();
    }

    super.onFocus(event);
  }

  /** @inheritdoc */
  protected onEnter(): void {
    this.toggleExpanded();
  }

  /** @inheritdoc */
  protected onClear(): void { }

  /** @inheritdoc */
  protected renderIcon(): VNode {
    return (
      <ExpandCollapseButton isExpanded={this.isExpanded} width="20px" height="20px" />
    );
  }

  /** @inheritdoc */
  protected renderContent(): VNode {
    return (
      <div class="settings-row-content">
        <div class={{
          'settings-row-value': true,
          'settings-row-value-hidden': this.isExpanded
        }}>
          {this.props.collapsedStateContent}
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  protected renderChildren(): VNode {
    return (
      <div class={{
        'settings-row-collapsible-content': true,
        'settings-row-collapsible-content-expanded': this.isExpanded
      }}>
        {this.props.children}
      </div>
    );
  }
}

/**
 * Props for the CollapsibleSection component.
 */
export interface CollapsibleSectionProps extends SetupRowBaseProps {
  /** Title of the section */
  readonly title: string;
  /** Initial expanded state */
  readonly initiallyExpanded?: boolean;
  /** State displayed when collapsed */
  readonly collapsedState?: string;
  /** Whether the section is enabled */
  readonly isEnabled?: boolean;
  /** Callback when the expanded state changes */
  readonly onExpandedChanged?: (isExpanded: boolean) => void;
}

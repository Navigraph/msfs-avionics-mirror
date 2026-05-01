import { FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { ExpandCollapseButton } from '../../../../Components/SettingsMenu/ExpandCollapseButton';
import { InfoTabGroupId } from '../InfoTabIds';

import './InfoGroup.css';

/**
 * Props for the InfoTab-specific collapsible group.
 */
export interface InfoGroupProps {
  /** Label to show in the header. */
  readonly label: string;
  /** Label to show when collapsed. */
  readonly summaryNode?: () => VNode | null;
  /** Optional callback when expanded changes. */
  readonly onExpandedChanged?: (isExpanded: boolean) => void;
  /** Whether is the selected group */
  readonly isSelected?: Subscribable<boolean>;
  /** Whether the group is hidden */
  readonly hidden?: Subscribable<boolean>;
  /** The group ID. */
  readonly groupId: InfoTabGroupId;
  /** The expanded group ID. */
  readonly expandedGroupId: Subscribable<InfoTabGroupId | null>;
  /** Sets the expanded group ID. */
  readonly setExpandedGroupId: (id: InfoTabGroupId | null) => void;
  /** Called when the group header is clicked. */
  readonly onHeaderClicked?: () => void;
}

/**
 * A collapsible group to use inside the InfoTab IfdList.
 */
export class InfoGroup extends LifecycleComponent<InfoGroupProps> {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  private readonly headerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly bodyRef = FSComponent.createRef<HTMLDivElement>();

  private readonly isExpanded = this.props.expandedGroupId
    .map((id) => id === this.props.groupId)
    .withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.headerRef.instance.addEventListener('click', this.handleHeaderClick);
    this.isExpanded
      .sub((expanded: boolean): void => {
        if (this.props.onExpandedChanged) {
          this.props.onExpandedChanged(expanded);
        }
      }, false)
      .withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public destroy(): void {
    this.headerRef
      .getOrDefault()
      ?.removeEventListener('click', this.handleHeaderClick);
    super.destroy();
  }

  /**
   * Header click -> select in parent + toggle expand/collapse.
   */
  private readonly handleHeaderClick = (): void => {
    if (this.props.onHeaderClicked) {
      this.props.onHeaderClicked();
    }
    const expanded = this.isExpanded.get();

    if (expanded) {
      this.props.setExpandedGroupId(null);
    } else {
      this.props.setExpandedGroupId(this.props.groupId);
    }
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'info-group': true,
          selected: this.props.isSelected ?? false,
          hidden: this.props.hidden ?? false,
        }}
        ref={this.rootRef}
        data-info-group-id={this.props.groupId}
      >
        <div class="info-group-header" ref={this.headerRef}>
          <ExpandCollapseButton
            isExpanded={this.isExpanded}
            width="20px"
            height="20px"
          />
          <div class="info-group-label">{this.props.label}</div>
          <div class={{ hidden: this.isExpanded, 'summary-label': true }}>
            {this.props.summaryNode?.()}
          </div>
        </div>

        <div
          class={{
            'info-group-body': true,
            hidden: this.isExpanded
              .map((expanded) => !expanded)
              .withLifecycle(this.defaultLifecycle),
          }}
          ref={this.bodyRef}
        >
          {this.props.children}
        </div>
      </div>
    );
  }
}

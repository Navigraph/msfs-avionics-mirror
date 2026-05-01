import { FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../Components/List/IfdListItemComponent';
import { FlightPlanLegListData } from '../../../../FlightPlan';
import { IfdDiscontinuityType } from '../../../../Fms';

import './DiscontinuityBlock.css';

/**
 * A centered title divider with responsive side lines that include diagonal caps next to the title.
 */
export interface DiscontinuityBlockProps extends IfdListItemComponentProps {
  /** The data for the leg */
  readonly data: FlightPlanLegListData;
  /** Whether this component is in sidebar mode. */
  readonly isInSidebarMode: Subscribable<boolean>;
}

/**
 * A DiscontinuityBlock component.
 */
export class DiscontinuityBlock extends IfdListItemComponent<DiscontinuityBlockProps> {
  private legDiscoRowRef = FSComponent.createRef<HTMLDivElement>();
  private discontinuityTypeLabel = Subject.create('');

  private updateLabelFromUserData = (): void => {
    const label = DiscontinuityBlock.getLabel(this.props.data.legData.leg.userData.discontinuityType, this.props.isInSidebarMode.get());
    this.discontinuityTypeLabel.set(label);
  };

  /** @inheritdoc */
  public onAfterRender(): void {
    this.legDiscoRowRef.instance.addEventListener('click', () => {
      this.focus();
    });
    this.register(this.props.data.legData.userDataChanged.on(this.updateLabelFromUserData));
    this.register(this.props.isInSidebarMode.sub(this.updateLabelFromUserData, true));
    this.updateLabelFromUserData();
  }

  /**
   * Checks if the disco block can be deleted.
   * @returns boolean
   */
  public isDeletionPrevented(): boolean {
    return this.props.data.legData.leg.userData?.discontinuityType !== IfdDiscontinuityType.GapInRoute;
  }

  /**
   * Gets the label to show for a type of discontinuity.
   * @param discontinuityType The type of discontinuity.
   * @param shortLabel Whether to get the short label for sidebar mode.
   * @returns The UI label.
   */
  private static getLabel(discontinuityType: IfdDiscontinuityType, shortLabel: boolean): string {
    if (shortLabel) {
      return discontinuityType === IfdDiscontinuityType.MissedApproach ? 'Missed' : 'Gap';
    }

    if (discontinuityType === IfdDiscontinuityType.GapInRouteConstraint) {
      return IfdDiscontinuityType.GapInRoute;
    }
    return discontinuityType;
  }

  /** @inheritdoc */
  render(): VNode {
    return (
      <div class={{
        'discontinuity-block': true,
        'discontinuity-block-selected': this.isSelected,
      }} ref={this.legDiscoRowRef}>
        <div class="line left" />
        <span class="label">{this.discontinuityTypeLabel}</span>
        <div class="line right" />
      </div>
    );
  }

}

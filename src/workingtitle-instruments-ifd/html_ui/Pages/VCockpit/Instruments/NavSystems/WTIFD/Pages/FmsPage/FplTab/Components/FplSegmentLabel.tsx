import {
  ComponentProps, FlightPlanSegmentType, FSComponent, LifecycleComponent, MappedSubject, NodeReference, ObjectSubject, Subject, Subscribable, SubscribableArray,
  SubscribableUtils, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { IfdList } from '../../../../Components/List';
import { FlightPlanListData, FlightPlanSegmentData, FlightPlanStore } from '../../../../FlightPlan';

/** Properties for the segment labels. */
export interface FplSegmentLabelProps extends ComponentProps {
  /** The flight plan list component. */
  readonly flightPlanList: NodeReference<IfdList<FlightPlanListData>>;

  /** The flight plan data.*/
  readonly flightPlanData: SubscribableArray<FlightPlanListData>;

  /** The flight plan store to use. */
  readonly store: FlightPlanStore;

  /** The segment data. */
  readonly segmentData: FlightPlanSegmentData;
}

/** Fpl Segment Label in the Left Margin. */
export class FplSegmentLabel extends LifecycleComponent<FplSegmentLabelProps> {
  private static readonly BRACKET_PADDING = 10;

  private readonly style = ObjectSubject.create({
    'height': '0',
    'top': '0',
  });

  /** The top offset from the top of the list in px. */
  private readonly top = Subject.create(0);

  /** The bottom offset from the top of the list in px. */
  private readonly bottom = Subject.create(0);

  private readonly label = Subject.create('');

  private readonly isHidden = MappedSubject.create(
    ([viewMode, isActiveSegment, label]) => {
      if (label.length === 0) {
        return true;
      }
      if (viewMode === 'compact' && !isActiveSegment) {
        return true;
      }
      return false;
    },
    this.props.store.viewMode,
    this.props.segmentData.isActiveSegment,
    this.label
  ).withLifecycle(this.defaultLifecycle);

  /** Whether the active leg is in this segment. */
  private readonly isActive = this.props.segmentData.isActiveSegment;
  /** Whether the active leg is beyond this segment. */
  private readonly isHistory = Subject.create(false);

  private readonly height = MappedSubject.create(
    ([top, bottom]) => Math.max(0, bottom - top),
    this.top,
    this.bottom,
  );

  private labelPipe?: Subscription;

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.top.sub((v) => this.style.set('top', `${v}px`), true).withLifecycle(this.defaultLifecycle);
    this.height.sub((v) => this.style.set('height', `${v}px`), true).withLifecycle(this.defaultLifecycle);
    this.props.store.activeLegGlobalIndex.sub(this.updateActive.bind(this), true).withLifecycle(this.defaultLifecycle);
  }

  /** Updates whether this leg is active or history, or not. */
  private updateActive(): void {
    const activeLeg = this.props.store.activeLegGlobalIndex.get();
    if (activeLeg) {
      this.isHistory.set(activeLeg >= (this.props.segmentData.segment.offset + this.props.segmentData.segment.legs.length));
    } else {
      this.isHistory.set(false);
    }
  }

  /** Updates the data shown in the label. */
  public updateData(): void {
    const segment = this.props.segmentData.segment;
    const flightPlanList = this.props.flightPlanList.getOrDefault();

    if (
      !flightPlanList || (
        segment.segmentType !== FlightPlanSegmentType.Approach &&
        segment.segmentType !== FlightPlanSegmentType.Arrival &&
        segment.segmentType !== FlightPlanSegmentType.Departure &&
        (segment.segmentType !== FlightPlanSegmentType.Enroute || segment.airway === undefined) &&
        segment.segmentType !== FlightPlanSegmentType.MissedApproach)
    ) {
      this.hide();
      return;
    }

    const fromLegPlanIndex = segment.offset;
    const toLegPlanIndex = segment.offset + segment.legs.length - 1;

    const arr = this.props.flightPlanData.getArray();

    let fromLegItem: FlightPlanListData | undefined;
    let toLegItem: FlightPlanListData | undefined;

    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (item.type === 'leg' && item.isVisible?.get() && !item.legData.isDiscontinuity) {
        const globalLegIndex = item.legData.globalLegIndex.get();
        if (globalLegIndex > toLegPlanIndex) {
          break;
        }
        if (globalLegIndex >= fromLegPlanIndex) {
          if (fromLegItem === undefined) {
            fromLegItem = item;
          }
          toLegItem = item;
        }
      }
    }

    if (!fromLegItem || !toLegItem) {
      this.hide();
      return;
    }

    const fromLegTopPx = flightPlanList.getTopPositionOfItem(fromLegItem) ?? null;
    const toLegTopPx = flightPlanList.getTopPositionOfItem(toLegItem) ?? null;

    if (fromLegTopPx === null || toLegTopPx === null) {
      this.hide();
      return;
    }

    if (this.labelPipe) {
      this.labelPipe.destroy();
      this.labelPipe = undefined;
    }
    const label = this.getLabelForSegment(this.props.segmentData);
    if (SubscribableUtils.isSubscribable(label)) {
      this.labelPipe = label.pipe(this.label, (v) => v ?? '');
    } else {
      this.label.set(label);
    }

    const fromLegItemHeightPx = SubscribableUtils.isSubscribable(fromLegItem.heightPx) ? fromLegItem.heightPx.get() : fromLegItem.heightPx;
    const toLegItemHeightPx = SubscribableUtils.isSubscribable(toLegItem.heightPx) ? toLegItem.heightPx.get() : toLegItem.heightPx;

    if (segment.segmentType === FlightPlanSegmentType.Enroute) {
      this.top.set(fromLegTopPx + fromLegItemHeightPx / 2);
      this.bottom.set(toLegTopPx + toLegItemHeightPx / 2);
    } else {
      this.top.set(fromLegTopPx - FplSegmentLabel.BRACKET_PADDING);
      this.bottom.set(toLegTopPx + toLegItemHeightPx + FplSegmentLabel.BRACKET_PADDING);
    }

    this.updateActive();
  }

  /**
   * Gets the label to show for a segment.
   * @param segmentData The segment data.
   * @returns the label or empty string.
   */
  private getLabelForSegment(segmentData: FlightPlanSegmentData): Subscribable<string | undefined> | string {
    switch (segmentData.segment.segmentType) {
      case FlightPlanSegmentType.Approach:
        return this.props.store.approachName;
      case FlightPlanSegmentType.Arrival:
        return this.props.store.arrivalString;
      case FlightPlanSegmentType.Departure:
        return this.props.store.departureString;
      case FlightPlanSegmentType.Enroute:
        return segmentData.airway;
      case FlightPlanSegmentType.MissedApproach:
        return 'Missed Approach';
      default:
        return '';
    }
  }

  /** Hides the element. */
  private hide(): void {
    this.label.set('');
  }

  /** @inheritdoc */
  public override render(): VNode | null {
    return (
      <div
        class={{
          'fpl-segment-label': true,
          'hidden': this.isHidden,
          'active': this.isActive,
          'history': this.isHistory,
        }}
        style={this.style}
      >
        <div class='brackets' />
        <div class='label-text'>{this.label}</div>
      </div >
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.labelPipe?.destroy();
    this.labelPipe = undefined;
    super.destroy();
  }
}

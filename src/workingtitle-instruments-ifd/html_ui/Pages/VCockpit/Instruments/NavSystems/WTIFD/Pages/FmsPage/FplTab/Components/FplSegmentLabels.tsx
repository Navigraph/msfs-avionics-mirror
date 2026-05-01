import {
  ArraySubject, ComponentProps, DebounceTimer, FSComponent, LifecycleComponent, NodeReference, ReadonlyFloat64Array, Subscribable, SubscribableArray,
  SubscribableArrayEventType, VNode
} from '@microsoft/msfs-sdk';

import { DynamicList, DynamicListData, IfdList } from '../../../../Components/List';
import { FlightPlanListData, FlightPlanSegmentData, FlightPlanStore } from '../../../../FlightPlan';
import { FplSegmentLabel } from './FplSegmentLabel';

import './FplSegmentLabels.css';

/** Props for the collection of segment labels. */
export interface FplSegmentLabelsProps extends ComponentProps {
  /** The flight plan list component. */
  readonly flightPlanList: NodeReference<IfdList<FlightPlanListData>>;

  /** The flight plan data.*/
  readonly flightPlanData: SubscribableArray<FlightPlanListData>;

  /** The flight plan store to use. */
  readonly store: FlightPlanStore;

  /**
   * The window of rendered list items, as `[startIndex, endIndex]`, where `startIndex` is the index of the first
   * rendered item, inclusive, and `endIndex` is the index of the last rendered item, exclusive. If not defined, then
   * it is assumed that the window includes all list items.
   */
  readonly listRenderWindow?: Subscribable<ReadonlyFloat64Array>;
}

/** Data for each segment label. */
interface SegmentLabelData extends DynamicListData {
  /** The segment data. */
  readonly segmentData: FlightPlanSegmentData;
}

/** The collection of FPL segment labels in the left margin. */
export class FplSegmentLabels extends LifecycleComponent<FplSegmentLabelsProps> {
  private static readonly RECALCULATE_DEBOUNCE_MS = 100;

  private readonly root = FSComponent.createRef<HTMLDivElement>();

  private readonly segmentLabels = ArraySubject.create<SegmentLabelData>();

  private segmentLabelList?: DynamicList<SegmentLabelData>;

  private readonly recalculateDebounce = new DebounceTimer();

  /**
   * Renders a segment label component.
   * @param data The segment label data.
   * @param index The index of the list item.
   * @returns The rendered label.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private renderLabel(data: SegmentLabelData, index: number): VNode {
    return (
      <FplSegmentLabel
        store={this.props.store}
        flightPlanData={this.props.flightPlanData}
        flightPlanList={this.props.flightPlanList}
        segmentData={data.segmentData}
      />
    );
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.segmentLabelList = new DynamicList(
      this.segmentLabels,
      this.root.instance,
      this.renderLabel.bind(this),
      0,
    );
    this.segmentLabelList.init();

    this.props.flightPlanList.instance.totalListLength.sub(() => {
      this.scheduleRecalculateLabels();
    }).withLifecycle(this.defaultLifecycle);

    this.props.flightPlanData.sub((idx, event, item) => {
      if (event === SubscribableArrayEventType.Cleared) {
        this.segmentLabels.clear();
        return;
      }

      if (event === SubscribableArrayEventType.Added) {
        if (Array.isArray(item)) {
          for (let i = 0; i < item.length; i++) {
            this.onNewItem(item[i]);
          }
        } else if (item) {
          this.onNewItem(item as FlightPlanListData);
        }
        this.scheduleRecalculateLabels();
      } else if (event === SubscribableArrayEventType.Removed) {
        if (Array.isArray(item)) {
          for (let i = 0; i < item.length; i++) {
            this.handleRemovedItem(item[i]);
          }
        } else if (item) {
          this.handleRemovedItem(item as FlightPlanListData);
        }
        this.scheduleRecalculateLabels();
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Handles addition of new items in the flight plan list.
   * @param item The item being added.
   */
  private onNewItem(item: FlightPlanListData): void {
    if (item.type === 'segment') {
      this.segmentLabels.insert(
        {
          segmentData: item.segmentData,
          heightPx: 0,
        },
        item.segmentData.segmentIndex.get()
      );
    }
  }

  /**
   * Handles removal of items in the flight plan list.
   * @param item The item being added.
   */
  private handleRemovedItem(item: FlightPlanListData): void {
    if (item.type === 'segment') {
      this.segmentLabels.removeAt(item.segmentData.segmentIndex.get());
    }
  }

  private readonly scheduleRecalculateLabels = (): void => {
    this.recalculateDebounce.schedule(this.recalculateLabels, FplSegmentLabels.RECALCULATE_DEBOUNCE_MS);
  };

  /** Recalculates the segment label position and labels. */
  private recalculateLabels = (): void => {
    this.segmentLabelList?.forEachComponent((v: FplSegmentLabel | undefined) => v?.updateData());
  };

  /** @inheritdoc */
  public override render(): VNode | null {
    return (
      <div class='fpl-segment-labels-container' ref={this.root} />
    );
  }
}

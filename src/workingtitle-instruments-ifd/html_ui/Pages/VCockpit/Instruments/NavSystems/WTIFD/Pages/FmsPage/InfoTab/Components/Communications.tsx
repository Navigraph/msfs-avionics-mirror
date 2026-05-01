import {
  AirportFacility,
  ArraySubject,
  ComponentProps,
  DebounceTimer,
  EventBus,
  Facility,
  FacilityType,
  FSComponent,
  ICAO,
  LifecycleComponent,
  Subject,
  Subscribable,
  VNode,
} from '@microsoft/msfs-sdk';

import { InfoGroup } from './InfoGroup';
import { InfoItem } from './InfoItem';
import { DynamicListData, IfdList } from '../../../../Components/List';
import { FacilityInfoUtils } from '../../../../Utilities/FacilityInfoUtils';
import { InfoTabGroupId } from '../InfoTabIds';

import './Communications.css';

/** The properties for the {@link Communications} component. */
interface CommunicationsProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The InfoTab Facility  */
  readonly infoFacility: Subscribable<Facility | undefined>;
  /** The group ID. */
  readonly groupId: InfoTabGroupId;
  /** The expanded group ID. */
  readonly expandedGroupId: Subscribable<InfoTabGroupId | null>;
  /** Sets the expanded group ID. */
  readonly setExpandedGroupId: (id: InfoTabGroupId | null) => void;
  /** Whether this group is currently selected by knob navigation. */
  readonly isSelected: Subscribable<boolean>;
  /** Called when the group header is clicked. */
  readonly onHeaderClicked?: () => void;
}

/** Interface for Communications list data. */
interface CommunicationsListData extends DynamicListData {
  /** The frequency, in MHz. */
  readonly freqMHz: number;
  /** Formatted name of the frequency */
  readonly name: string;
  /** Index for selection */
  readonly index: number;
}

/** The general info of the info tab */
export class Communications extends LifecycleComponent<CommunicationsProps> {
  private readonly freqData = ArraySubject.create<CommunicationsListData>([]);
  private readonly listClickRef = FSComponent.createRef<HTMLDivElement>();
  private readonly numberOfItems = Subject.create(0);
  private readonly collapsedLabel = Subject.create('');
  private readonly selectedIndex = Subject.create(0);
  private readonly itemCount = Subject.create(0);
  private readonly listRef =
    FSComponent.createRef<IfdList<CommunicationsListData>>();
  private static readonly LIST_ITEM_HEIGHT_PX = 35;
  private static readonly LIST_ITEM_SPACING_PX = 3;
  private static readonly LIST_VIEWPORT_HEIGHT_PX = 220;
  private readonly listHeightPx = Subject.create(
    Communications.LIST_VIEWPORT_HEIGHT_PX,
  );
  private readonly itemsPerPage = Subject.create(1);
  private readonly ensureInViewTimer = new DebounceTimer();

  /**
   * Moves the selected inner item by the given delta.
   * @param delta The delta to move by (+1 / -1).
   */
  public moveSelectionBy(delta: number): void {
    const count = this.itemCount.get();

    if (count <= 0) {
      return;
    }

    const current = this.selectedIndex.get();
    const next = Math.max(0, Math.min(count - 1, current + delta));

    if (next === current) {
      return;
    }

    this.selectedIndex.set(next);

    const data = this.freqData.getArray();
    const selected = data[next];
    if (selected) {
      this.collapsedLabel.set(
        `${selected.freqMHz.toFixed(3)} ${selected.name}`,
      );
    }

    this.scheduleEnsureSelectedInView();
  }

  /**
   * Ensures the currently selected item is visible in the list viewport.
   * Debounced to avoid excessive scroll work during fast knob spinning.
   */
  private scheduleEnsureSelectedInView(): void {
    this.ensureInViewTimer.schedule(() => {
      const index = this.selectedIndex.get();
      this.listRef.getOrDefault()?.scrollToIndex(index, 'closest', false, true);
    }, 0);
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const itemHeight = Communications.LIST_ITEM_HEIGHT_PX;
    const spacing = Communications.LIST_ITEM_SPACING_PX;

    this.listHeightPx
      .sub((heightPx) => {
        const rows = Math.floor((heightPx + spacing) / (itemHeight + spacing));
        this.itemsPerPage.set(Math.max(1, rows));
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.props.infoFacility
      .sub((fac) => {
        if (
          fac &&
          ICAO.getFacilityTypeFromValue(fac.icaoStruct) === FacilityType.Airport
        ) {
          const baseObject = {
            isVisible: Subject.create(true),
            heightPx: 35,
          };

          const freqs = (fac as AirportFacility).frequencies;

          const data = freqs.map((freq, index) => {
            const name = FacilityInfoUtils.getFrequencyName(
              freq,
              fac.icaoStruct.ident,
            );

            return {
              name,
              freqMHz: freq.freqMHz,
              index,
              ...baseObject,
            };
          });

          this.freqData.set(data);
          this.numberOfItems.set(data.length);
          this.itemCount.set(data.length);

          // Reset selection on new facility / new data
          this.selectedIndex.set(0);
          this.scheduleEnsureSelectedInView();

          const first = data[0];
          if (first) {
            this.collapsedLabel.set(
              `${first.freqMHz.toFixed(3)} ${first.name}`,
            );
          } else {
            this.collapsedLabel.set('');
          }
        } else {
          this.freqData.clear();
          this.numberOfItems.set(0);
          this.itemCount.set(0);
          this.selectedIndex.set(0);
          this.collapsedLabel.set('');
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);
    this.listClickRef.instance.addEventListener('click', this.onListClicked);
  }

  /**
   * Syncs the collapsed label to the currently selected item.
   */
  private syncCollapsedLabelToSelection(): void {
    const data = this.freqData.getArray();
    const index = this.selectedIndex.get();

    const item = data[index];

    if (item) {
      this.collapsedLabel.set(`${item.freqMHz.toFixed(3)} ${item.name}`);
    } else {
      this.collapsedLabel.set('');
    }
  }

  /**
   * Handles click selection inside the communications list via event delegation.
   * @param e The mouse event.
   */
  private readonly onListClicked = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;

    if (target) {
      const itemEl = target.closest(
        '.communications-item',
      ) as HTMLElement | null;

      if (itemEl) {
        const indexStr = itemEl.dataset.index;

        if (indexStr !== undefined) {
          const index = Number(indexStr);

          if (Number.isFinite(index)) {
            const clamped = Math.max(
              0,
              Math.min(this.itemCount.get() - 1, index),
            );

            this.selectedIndex.set(clamped);
            this.syncCollapsedLabelToSelection();
            this.scheduleEnsureSelectedInView();
          }
        }
      }
    }
  };

  /** @inheritDoc */
  public render(): VNode {
    return (
      <InfoGroup
        label="Communications"
        summaryNode={() => <span>{this.collapsedLabel}</span>}
        hidden={this.numberOfItems
          .map((v) => v === 0)
          .withLifecycle(this.defaultLifecycle)}
        groupId={this.props.groupId}
        expandedGroupId={this.props.expandedGroupId}
        setExpandedGroupId={this.props.setExpandedGroupId}
        isSelected={this.props.isSelected}
        onHeaderClicked={this.props.onHeaderClicked}
      >
        <div ref={this.listClickRef}>
          <IfdList<CommunicationsListData>
            ref={this.listRef}
            bus={this.props.bus}
            data={this.freqData}
            heightPx={this.listHeightPx}
            listItemHeightPx={Communications.LIST_ITEM_HEIGHT_PX}
            listItemSpacingPx={Communications.LIST_ITEM_SPACING_PX}
            itemsPerPage={this.itemsPerPage}
            renderScrollBar={false}
            maxOverscrollPx={0}
            renderItem={(item) => (
              <InfoItem
                class="communications-item"
                dataIndex={item.index}
                isSelected={this.selectedIndex
                  .map((i) => i === item.index)
                  .withLifecycle(this.defaultLifecycle)}
              >
                <div class="freq">{item.freqMHz.toFixed(3)}</div>
                <div class="freq-name">{item.name}</div>
              </InfoItem>
            )}
          />
        </div>
      </InfoGroup>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.listClickRef
      .getOrDefault()
      ?.removeEventListener('click', this.onListClicked);
    this.ensureInViewTimer.clear();

    super.destroy();
  }
}

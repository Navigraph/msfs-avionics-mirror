import {
  AirportFacility, ArraySubject, ComponentProps, DebounceTimer, EventBus, Facility, FacilityLoader, FacilityType, FlightPlanner, FSComponent, ICAO,
  LifecycleComponent, MappedSubject, MappedSubscribable, MathUtils, NodeReference, Subject, Subscribable, VNode
} from '@microsoft/msfs-sdk';

import { IfdList } from '../../../../../Components/List';
import { Fms } from '../../../../../Fms';
import { IfdOptions } from '../../../../../IfdOptions';
import { MapDataProvider } from '../../../../../Providers/Map/MapDataProvider';
import { TrafficSystem } from '../../../../../Systems/Traffic/TrafficSystem';
import { IfdViewService } from '../../../../../ViewService';
import { FplSelectionMenuController } from '../../../FplTab/FplSelectionMenu/FplSelectionMenuController';
import { InfoTabGroupId } from '../../InfoTabIds';
import { InfoGroup } from '../InfoGroup';
import { ApproachItem, ApproachListData } from './ApproachItem';

import './Procedures.css';

/**
 * Sub-selection within an expanded item.
 */
enum ExpandedItemFocusIndex {
  Chevron = 0,
  Transition = 1,
}

/** The properties for the {@link Approaches} component. */
interface ApproachesProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The InfoTab Facility  */
  readonly infoFacility: Subscribable<Facility | undefined>;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** A instance of the traffic system */
  readonly trafficSystem?: TrafficSystem;
  /** The IFD instrument config.  */
  readonly ifdOptions: IfdOptions;
  /** An instance of the view service. */
  readonly viewService: IfdViewService;
  /** The group ID. */
  readonly groupId: InfoTabGroupId;
  /** The expanded group ID. */
  readonly expandedGroupId: Subscribable<InfoTabGroupId | null>;
  /** Sets the expanded group ID. */
  readonly setExpandedGroupId: (id: InfoTabGroupId | null) => void;
  /** Reference to the map parking div */
  readonly mapParkingRef: NodeReference<HTMLDivElement>;
  /** The fms instance */
  readonly fms: Fms;
  /** The FPL selection menu controller to use. */
  readonly selectionMenuController: FplSelectionMenuController;
  /** Whether this group is currently selected by knob navigation. */
  readonly isSelected: Subscribable<boolean>;
  /** Called when the group header is clicked. */
  readonly onHeaderClicked?: () => void;
}

/** The Approaches procedure list of the info tab */
export class Approaches extends LifecycleComponent<ApproachesProps> {
  private static readonly LIST_ITEM_SPACING_PX = 3;
  private static readonly COLLAPSED_ROW_HEIGHT_PX = 35;
  private static readonly EXPANDED_ROW_HEIGHT_PX = 255;
  private static readonly LIST_VIEWPORT_HEIGHT_PX = 275;

  private readonly listRef = FSComponent.createRef<IfdList<ApproachListData>>();
  private readonly listHeightPx = Subject.create(
    Approaches.LIST_VIEWPORT_HEIGHT_PX,
  );
  private readonly ensureInViewTimer = new DebounceTimer();
  private readonly appData = ArraySubject.create<ApproachListData>([]);
  private readonly numberOfItems = Subject.create(0);
  private readonly collapsedLabel = Subject.create('');

  private readonly expandedIndex = Subject.create<number | null>(null);
  private readonly selectedIndex = Subject.create<number | null>(null);

  private readonly itemRefs: Array<NodeReference<ApproachItem>> = [];

  /** The focused sub-target within the expanded item. */
  private readonly expandedItemFocusIndex = Subject.create(
    ExpandedItemFocusIndex.Chevron,
  );

  /**
   * Gets a stable item ref for a given list index.
   * @param index The list index.
   * @returns A NodeReference for the ApproachItem at the index.
   */
  private getItemRef(index: number): NodeReference<ApproachItem> {
    let ref = this.itemRefs[index];

    if (!ref) {
      ref = FSComponent.createRef<ApproachItem>();
      this.itemRefs[index] = ref;
    }

    return ref;
  }

  private readonly itemsPerPage = MappedSubject.create(
    ([count, expandedIndex]) => {
      if (count <= 0) {
        return 0;
      }

      if (expandedIndex === null) {
        return count;
      }

      const deltaPx =
        Approaches.EXPANDED_ROW_HEIGHT_PX - Approaches.COLLAPSED_ROW_HEIGHT_PX;
      const slotPx =
        Approaches.COLLAPSED_ROW_HEIGHT_PX + Approaches.LIST_ITEM_SPACING_PX;

      const extraSlots = Math.ceil(deltaPx / slotPx);

      return count + extraSlots;
    },
    this.numberOfItems,
    this.expandedIndex,
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Per-row height subjects must be owned by the list items, not the component lifecycle.
   * We destroy them deterministically, but only after the list has had a chance to
   * detach from the old data (deferred disposal).
   */
  private readonly mappedSubjectsToDestroy: MappedSubscribable<number>[] = [];
  private readonly pendingDispose: MappedSubscribable<number>[] = [];
  private readonly disposeTimer = new DebounceTimer();

  /**
   * Expands the procedure item at the specified index.
   * @param index The index of the procedure item to expand.
   */
  private expandProcedureItemByIndex(index: number): void {
    this.expandedIndex.set(index);
    this.expandedItemFocusIndex.set(ExpandedItemFocusIndex.Chevron);
    this.scheduleEnsureSelectedInView();
  }

  /** Collapses the currently expanded procedure item. */
  private collapseProcedureItem(): void {
    this.expandedIndex.set(null);
    this.expandedItemFocusIndex.set(ExpandedItemFocusIndex.Chevron);
    this.scheduleEnsureSelectedInView();
  }

  /**
   * Selects the procedure item at the specified index.
   * @param index The index of the procedure item to select.
   */
  private selectProcedureItemByIndex(index: number): void {
    this.selectedIndex.set(index);
    this.expandedItemFocusIndex.set(ExpandedItemFocusIndex.Chevron);
    this.scheduleEnsureSelectedInView();
  }

  /**
   * Gets valid focus targets for an expanded approach item.
   *
   * @param proc The procedure for the selected item.
   * @returns Array of focus indices in navigation order.
   */
  private getExpandedFocusTargets(
    proc: ApproachListData['procedure'] | undefined,
  ): ExpandedItemFocusIndex[] {
    const targets: ExpandedItemFocusIndex[] = [ExpandedItemFocusIndex.Chevron];

    const hasClickableTransitions = (proc?.transitions?.length ?? 0) > 1;

    if (hasClickableTransitions) {
      targets.push(ExpandedItemFocusIndex.Transition);
    }

    return targets;
  }

  /**
   * Clamps expanded sub-focus to valid targets for the selected/expanded item.
   */
  private clampExpandedFocusIndex(): void {
    const selected = this.selectedIndex.get();

    if (selected === null) {
      return;
    }

    if (this.expandedIndex.get() !== selected) {
      this.expandedItemFocusIndex.set(ExpandedItemFocusIndex.Chevron);
      return;
    }

    const item = this.appData.get(selected);
    const proc = item?.procedure;

    const targets = this.getExpandedFocusTargets(proc);
    const current = this.expandedItemFocusIndex.get();

    if (targets.indexOf(current) < 0) {
      this.expandedItemFocusIndex.set(
        targets[0] ?? ExpandedItemFocusIndex.Chevron,
      );
    }
  }

  /**
   * Ensures selectedIndex points to a valid item whenever data changes.
   */
  private ensureSelectionValid(): void {
    const count = this.numberOfItems.get();
    if (count <= 0) {
      this.selectedIndex.set(null);
      return;
    }
    const current = this.selectedIndex.get();
    const value = current === null ? 0 : current;

    this.selectedIndex.set(MathUtils.clamp(value, 0, count - 1));
  }

  /**
   * Schedules ensuring the selected item is in view.
   */
  private scheduleEnsureSelectedInView(): void {
    this.ensureInViewTimer.schedule(() => {
      const index = this.selectedIndex.get();
      if (index === null) {
        return;
      }
      this.listRef.getOrDefault()?.scrollToIndex(index, 'closest', false, true);
    }, 0);
  }

  /**
   * Moves selected procedure by delta (+1 / -1).
   * Called by InfoTab only when this section is expanded + focused.
   * @param delta The delta to move by (+1 / -1).
   */
  public moveSelectionBy(delta: number): void {
    const count = this.numberOfItems.get();

    if (count <= 0) {
      return;
    }

    this.ensureSelectionValid();

    const current = this.selectedIndex.get();

    if (current === null) {
      this.selectProcedureItemByIndex(0);
      return;
    }

    const expanded = this.expandedIndex.get();

    // Lock outer selection while the selected item is expanded.
    if (expanded === current) {
      const item = this.appData.get(current);
      const proc = item?.procedure;

      const targets = this.getExpandedFocusTargets(proc);

      if (targets.length <= 1) {
        this.expandedItemFocusIndex.set(ExpandedItemFocusIndex.Chevron);
        return;
      }

      const start = this.expandedItemFocusIndex.get();
      const startPos = Math.max(0, targets.indexOf(start));

      const direction = delta > 0 ? 1 : -1;

      let nextPos = startPos + direction;

      if (nextPos < 0) {
        nextPos = targets.length - 1;
      } else if (nextPos >= targets.length) {
        nextPos = 0;
      }

      const next = targets[nextPos] ?? ExpandedItemFocusIndex.Chevron;

      this.expandedItemFocusIndex.set(next);
      return;
    }

    // Collapsed: allow moving across other items.
    const direction = delta > 0 ? 1 : -1;
    const nextIndex = MathUtils.clamp(current + direction, 0, count - 1);

    this.selectProcedureItemByIndex(nextIndex);
  }

  /**
   * Activates the current selection (ENTR / knob push).
   * Behavior: toggle expand for selected procedure.
   */
  public activateSelection(): void {
    this.ensureSelectionValid();

    const index = this.selectedIndex.get();

    if (index === null) {
      return;
    }

    const currentlyExpanded = this.expandedIndex.get() === index;

    if (!currentlyExpanded) {
      this.expandProcedureItemByIndex(index);
      return;
    }

    this.clampExpandedFocusIndex();

    const focus = this.expandedItemFocusIndex.get();
    const ref = this.itemRefs[index];
    const itemInstance = ref?.getOrDefault();

    if (!itemInstance) {
      return;
    }

    itemInstance.activateFocusedTarget(focus);
  }

  /**
   * Schedules mapped subjects for destruction after the list has processed data changes.
   * This is intentionally deferred because the list may still be holding references
   * to the old row subjects until it processes the latest data update.
   *
   * NOTE: We always reschedule the deferred handler. This avoids a race when the facility
   * changes multiple times before the previous deferred handler executes.
   * @param subjects Subjects to destroy.
   */
  private scheduleDispose(subjects: MappedSubscribable<number>[]): void {
    while (subjects.length > 0) {
      const subject = subjects.pop();
      if (subject) {
        this.pendingDispose.push(subject);
      }
    }

    if (this.pendingDispose.length === 0) {
      return;
    }

    // Always reschedule to ensure disposal occurs after the most recent data change.
    this.disposeTimer.clear();
    this.disposeTimer.schedule(() => {
      while (this.pendingDispose.length > 0) {
        const s = this.pendingDispose.pop();
        if (s) {
          s.destroy();
        }
      }
    }, 0);
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.infoFacility
      .sub((fac) => {
        this.resetProceduresData();

        if (
          fac &&
          ICAO.getFacilityTypeFromValue(fac.icaoStruct) === FacilityType.Airport
        ) {
          this.updateProcedureList(fac as AirportFacility);
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.props.expandedGroupId
      .map((id) => id === this.props.groupId)
      .sub((expanded) => {
        if (expanded) {
          this.ensureSelectionValid();
          this.scheduleEnsureSelectedInView();
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);

    MappedSubject.create(this.numberOfItems, this.selectedIndex)
      .sub(() => {
        this.ensureSelectionValid();
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.props.expandedGroupId
      .map((id) => id === this.props.groupId)
      .sub((expanded) => {
        if (!expanded) {
          this.expandedIndex.set(null);
          this.selectedIndex.set(null);
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);
  }

  /**
   * Updates the procedure data based on the provided airport.
   * @param airport The airport to update the approach list with.
   */
  private updateProcedureList(airport: AirportFacility): void {
    const approaches = airport.approaches;
    const count = approaches.length;

    if (count > 0) {
      const newData: ApproachListData[] = [];

      // CAUTION:
      // We intentionally create and store per-row MappedSubscribables here.
      // These subjects must outlive a single render, and are disposed later via
      // scheduleDispose() to avoid destroying subjects while the list still references them.
      for (let index = 0; index < count; index++) {
        const app = approaches[index];

        const heightSubject = this.expandedIndex.map((expanded) => {
          if (expanded === index) {
            return Approaches.EXPANDED_ROW_HEIGHT_PX;
          }

          return Approaches.COLLAPSED_ROW_HEIGHT_PX;
        });

        this.mappedSubjectsToDestroy.push(heightSubject);

        newData.push({
          procedure: app,
          airportFacility: airport,
          heightPx: heightSubject,
        });
      }

      this.appData.set(newData);
      this.numberOfItems.set(count);

      this.ensureSelectionValid();
      this.scheduleEnsureSelectedInView();
    } else {
      // Keep state consistent if called with an airport that has no approaches.
      this.appData.set([]);
      this.numberOfItems.set(0);
    }
  }

  /** Resets the procedures data safely. */
  public resetProceduresData(): void {
    this.scheduleDispose(this.mappedSubjectsToDestroy);

    this.ensureInViewTimer.clear();
    this.expandedItemFocusIndex.set(ExpandedItemFocusIndex.Chevron);
    this.appData.set([]);
    this.numberOfItems.set(0);
    this.expandedIndex.set(null);
    this.selectedIndex.set(null);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <InfoGroup
        label="Approaches"
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
        <IfdList<ApproachListData>
          ref={this.listRef}
          bus={this.props.bus}
          data={this.appData}
          heightPx={this.listHeightPx}
          listItemHeightPx={Approaches.COLLAPSED_ROW_HEIGHT_PX}
          listItemSpacingPx={Approaches.LIST_ITEM_SPACING_PX}
          itemsPerPage={this.itemsPerPage}
          renderScrollBar={false}
          maxOverscrollPx={0}
          keepSpaceAfterLastItem={true}
          renderItem={(item, index) => (
            <ApproachItem
              ref={this.getItemRef(index)}
              expandedFocusIndex={this.expandedItemFocusIndex}
              procedureListData={item}
              bus={this.props.bus}
              trafficSystem={this.props.trafficSystem}
              facLoader={this.props.facLoader}
              viewService={this.props.viewService}
              flightPlanner={this.props.flightPlanner}
              mapDataProvider={this.props.mapDataProvider}
              ifdOptions={this.props.ifdOptions}
              listIndex={index}
              expandedIndex={this.expandedIndex}
              selectedIndex={this.selectedIndex}
              expandItem={this.expandProcedureItemByIndex.bind(this)}
              collapseItem={this.collapseProcedureItem.bind(this)}
              selectItem={this.selectProcedureItemByIndex.bind(this)}
              mapParkingRef={this.props.mapParkingRef}
              fms={this.props.fms}
              selectionMenuController={this.props.selectionMenuController}
            />
          )}
        />
      </InfoGroup>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.disposeTimer.clear();
    this.appData.set([]);
    this.ensureInViewTimer.clear();
    while (this.pendingDispose.length > 0) {
      const s = this.pendingDispose.pop();
      if (s) {
        s.destroy();
      }
    }

    while (this.mappedSubjectsToDestroy.length > 0) {
      const s = this.mappedSubjectsToDestroy.pop();
      if (s) {
        s.destroy();
      }
    }

    super.destroy();
  }
}

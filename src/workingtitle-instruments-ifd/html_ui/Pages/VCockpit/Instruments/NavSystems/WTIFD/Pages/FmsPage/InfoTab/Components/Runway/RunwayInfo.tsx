import {
  AirportFacility, AirportRunway, ArraySubject, ComponentProps, DebounceTimer, EventBus, Facility, FacilityType, FSComponent, ICAO, LifecycleComponent,
  MappedSubject, MappedSubscribable, RunwayUtils, Subject, Subscribable, Unit, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { IfdList } from '../../../../../Components/List';
import { UnitsUserSettings } from '../../../../../Settings/UnitsUserSettings';
import { IfdRunwayUtils } from '../../../../../Utilities/IfdRunwayUtils';
import { InfoTabGroupId } from '../../InfoTabIds';
import { InfoGroup } from '../InfoGroup';
import { RunwayInfoItem, RunwayListData } from './RunwayinfoItem';
import { RunwayLayoutDiagram } from './RunwayLayoutDiagram';

import './RunwayInfo.css';

/** The properties for the {@link RunwayInfo} component. */
interface RunwayInfoProps extends ComponentProps {
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

/**
 * The Runway info of the info tab
 */
export class RunwayInfo extends LifecycleComponent<RunwayInfoProps> {
  private static readonly COLLAPSED_ROW_HEIGHT_PX = 35;
  private static readonly EXPANDED_ROW_HEIGHT_PX = 140;
  private static readonly LIST_ITEM_HEIGHT_PX =
    RunwayInfo.COLLAPSED_ROW_HEIGHT_PX;
  private static readonly LIST_ITEM_SPACING_PX = 3;
  private static readonly LIST_VIEWPORT_HEIGHT_PX = 220;

  private readonly listRef = FSComponent.createRef<IfdList<RunwayListData>>();
  private readonly listHeightPx = Subject.create(
    RunwayInfo.LIST_VIEWPORT_HEIGHT_PX,
  );
  private readonly itemsPerPage = Subject.create(1);
  private readonly ensureInViewTimer = new DebounceTimer();

  private readonly numberOfItems = Subject.create(0);
  private readonly collapsedLabel = Subject.create('');

  /** The longest runway at the airport associated with this airport, or null if the airport has no runways. */
  private longestRunway = Subject.create<AirportRunway | null>(null);

  private readonly runwayData = ArraySubject.create<RunwayListData>([]);

  private readonly unitsUserSettings = UnitsUserSettings.getManager(
    this.props.bus,
  );
  private readonly distanceUnit = this.unitsUserSettings.distanceUnitsSmall;

  private readonly expandedIndex = Subject.create<number | null>(null);
  private readonly selectedIndex = Subject.create<number | null>(null);

  /**
   * Per-row height subjects must be owned by the list items, not the component lifecycle.
   * We destroy them deterministically, but only after the list has had a chance to
   * detach from the old data (deferred disposal).
   */
  private readonly mappedSubjectsToDestroy: MappedSubscribable<number>[] = [];
  private readonly pendingDispose: MappedSubscribable<number>[] = [];
  private readonly disposeTimer = new DebounceTimer();

  /**
   * Ensures selected index is valid whenever data changes.
   */
  private ensureSelectionValid(): void {
    const count = this.numberOfItems.get();

    if (count <= 0) {
      this.selectedIndex.set(null);
      return;
    }

    const current = this.selectedIndex.get();

    if (current === null) {
      this.selectedIndex.set(0);
      return;
    }

    const clamped = Math.max(0, Math.min(count - 1, current));

    if (clamped !== current) {
      this.selectedIndex.set(clamped);
    }
  }

  /**
   * Moves selected runway by delta (+1 / -1).
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
      this.selectRunwayItemByIndex(0);
      return;
    }

    const next = Math.max(
      0,
      Math.min(count - 1, current + (delta > 0 ? 1 : -1)),
    );

    if (next !== current) {
      this.selectRunwayItemByIndex(next);
    }
  }

  /**
   * Activates the current selection (ENTR / knob push).
   * Behavior: toggle expand for selected runway.
   */
  public activateSelection(): void {
    this.ensureSelectionValid();

    const index = this.selectedIndex.get();

    if (index === null) {
      return;
    }

    const data = this.runwayData.get(index);

    if (data?.forceExpanded) {
      this.props.setExpandedGroupId(null);
      return;
    }

    const currentlyExpanded = this.expandedIndex.get() === index;

    if (currentlyExpanded) {
      this.collapseRunwayItem();
    } else {
      this.expandRunwayItemByIndex(index);
    }
  }

  /**
   * Schedules mapped subjects for destruction after the list has processed data changes.
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

    if (!this.disposeTimer.isPending()) {
      this.disposeTimer.schedule(() => {
        while (this.pendingDispose.length > 0) {
          const s = this.pendingDispose.pop();
          if (s) {
            s.destroy();
          }
        }
      }, 0);
    }
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    MappedSubject.create(this.props.infoFacility, this.distanceUnit)
      .sub(([fac]) => {
        this.resetRunwayList();
        if (
          fac &&
          ICAO.getFacilityTypeFromValue(fac.icaoStruct) === FacilityType.Airport
        ) {
          const airport = fac as AirportFacility;
          this.updateRunwayList(airport);
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);

    MappedSubject.create(this.longestRunway, this.distanceUnit)
      .sub(
        ([runway, distanceUnit]): void =>
          this.updateCollapsedLabel(runway, distanceUnit),
        true,
      )
      .withLifecycle(this.defaultLifecycle);

    MappedSubject.create(this.numberOfItems, this.selectedIndex)
      .sub(() => {
        this.ensureSelectionValid();
      }, true)
      .withLifecycle(this.defaultLifecycle);

    const itemHeight = RunwayInfo.LIST_ITEM_HEIGHT_PX;
    const spacing = RunwayInfo.LIST_ITEM_SPACING_PX;

    this.listHeightPx
      .sub((heightPx) => {
        const rows = Math.floor((heightPx + spacing) / (itemHeight + spacing));
        this.itemsPerPage.set(Math.max(1, rows));
      }, true)
      .withLifecycle(this.defaultLifecycle);
  }

  /** Resets the runway list to empty (safe deferred disposal of per-row mapped subjects). */
  public resetRunwayList(): void {
    this.runwayData.set([]);
    this.numberOfItems.set(0);
    this.expandedIndex.set(null);
    this.selectedIndex.set(null);
    this.collapsedLabel.set('');
    this.longestRunway.set(null);
    this.scheduleDispose(this.mappedSubjectsToDestroy);
  }

  /**
   * Expands the runway item at the specified index.
   * @param index The index of the runway item to expand.
   */
  private expandRunwayItemByIndex(index: number): void {
    this.expandedIndex.set(index);
    this.scheduleEnsureSelectedInView();
  }

  /** Collapses the currently expanded runway item. */
  private collapseRunwayItem(): void {
    this.expandedIndex.set(null);
    this.scheduleEnsureSelectedInView();
  }

  /**
   * Selects the runway item at the specified index.
   * @param index The index of the runway item to select.
   */
  private selectRunwayItemByIndex(index: number): void {
    this.selectedIndex.set(index);
    this.scheduleEnsureSelectedInView();
  }

  /**
   * Updates the runway list based on the provided airport.
   * @param airport The airport to update the runway list with.
   */
  private updateRunwayList(airport: AirportFacility): void {
    if (airport.runways.length === 0) {
      return;
    }
    this.numberOfItems.set(airport.runways.length);
    this.longestRunway.set(IfdRunwayUtils.getLongestRunway(airport));
    this.runwayData.set(
      airport.runways.map((rwy, index): RunwayListData => {
        const heightSubject = this.expandedIndex.map((v) =>
          v === index
            ? RunwayInfo.EXPANDED_ROW_HEIGHT_PX
            : RunwayInfo.COLLAPSED_ROW_HEIGHT_PX,
        );
        this.mappedSubjectsToDestroy.push(heightSubject);
        return {
          runway: rwy,
          heightPx: heightSubject,
          forceExpanded: airport.runways.length === 1,
        };
      }),
    );
    if (airport.runways.length === 1) {
      this.expandedIndex.set(0);
    }

    // Ensure we always have a valid selection when data appears.
    if (this.selectedIndex.get() === null) {
      this.selectedIndex.set(0);
    } else {
      this.ensureSelectionValid();
    }
    this.scheduleEnsureSelectedInView();
  }

  /**
   * Updates the collapsed label based on the provided runway.
   * @param runway The runway to update the collapsed label with.
   * @param distanceUnit The distance unit to use for the collapsed label.
   */
  private updateCollapsedLabel(
    runway: AirportRunway | null,
    distanceUnit: Unit<UnitFamily.Distance>,
  ): void {
    if (!runway) {
      this.collapsedLabel.set('');
      return;
    }
    const runwayName = this.getRunwayDisplayName(runway);
    const runwaySize = this.getRunwaySizeString(runway, distanceUnit);
    const surface = IfdRunwayUtils.getRunwaySurfaceName(runway.surface);
    this.collapsedLabel.set(`${runwayName}, ${runwaySize}, ${surface}`);
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
   * Generates a display name for a runway in the format of the IFD Info page.
   * @param runway The runway
   * @returns A display name for the runway in the desired format (e.g., "13L/31R").
   */
  private getRunwayDisplayName(runway: AirportRunway): string {
    return RunwayUtils.getRunwayPairNameString(runway).replace('-', '/');
  }

  /**
   * Generates a string representing the size of a runway in the format of the IFD Info page.
   * @param runway The runway
   * @param distanceUnit The distance unit to use for the size string.
   * @returns A string representing the size of the runway in the desired format (e.g., "1000 x 50M").
   */
  private getRunwaySizeString(
    runway: AirportRunway,
    distanceUnit: Unit<UnitFamily.Distance>,
  ): string {
    const length = distanceUnit
      .convertFrom(runway.length, UnitType.METER)
      .toFixed(0);
    const width = distanceUnit
      .convertFrom(runway.width, UnitType.METER)
      .toFixed(0);
    const unitString = distanceUnit.equals(UnitType.FOOT) ? 'Ft' : 'M';
    return `${length} x ${width}${unitString}`;
  }

  /**
   * Renders a runway list item.
   * @param data The data for the runway list item.
   * @param index The index of the runway list item.
   * @returns The rendered runway list item.
   */
  private renderRunwayListItem(data: RunwayListData, index: number): VNode {
    return (
      <RunwayInfoItem
        runwayData={data}
        displayName={this.getRunwayDisplayName(data.runway)}
        distanceUnit={this.distanceUnit}
        runwaySizeDisplay={this.getRunwaySizeString(
          data.runway,
          this.distanceUnit.get(),
        )}
        listIndex={index}
        expandedIndex={this.expandedIndex}
        selectedIndex={this.selectedIndex}
        expandItem={this.expandRunwayItemByIndex.bind(this)}
        collapseItem={this.collapseRunwayItem.bind(this)}
        selectItem={this.selectRunwayItemByIndex.bind(this)}
        navAngleUserSetting={UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle')}
      />
    );
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <InfoGroup
        label="Runways"
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
        <IfdList<RunwayListData>
          ref={this.listRef}
          bus={this.props.bus}
          data={this.runwayData}
          heightPx={this.listHeightPx}
          listItemHeightPx={RunwayInfo.LIST_ITEM_HEIGHT_PX}
          listItemSpacingPx={RunwayInfo.LIST_ITEM_SPACING_PX}
          itemsPerPage={this.itemsPerPage}
          renderScrollBar={false}
          maxOverscrollPx={0}
          renderItem={(item, index) => this.renderRunwayListItem(item, index)}
        />
        <RunwayLayoutDiagram
          airport={this.props.infoFacility}
          selectedIndex={this.selectedIndex}
          expandedIndex={this.expandedIndex}
        />
      </InfoGroup>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.disposeTimer.clear();
    this.ensureInViewTimer.clear();
    this.runwayData.set([]);

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

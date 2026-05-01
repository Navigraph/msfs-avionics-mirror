import {
  ArraySubject, BitFlags, Facility, FacilityType, FixTypeFlags, FlightPlanSegmentType, FSComponent, GeoPoint, ICAO, MappedSubject, OneWayRunway,
  RunwayTransition, RunwayUtils, SetSubject, SubEvent, Subject, Subscribable, SubscribableArray, SubscribableSet, UnitType
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { FlightPlanStore } from '../../../../FlightPlan';
import { ApproachListItem, ApproachTransitionType, ArrivalListItem, DepartureListItem, Fms, ProcedureType } from '../../../../Fms';
import { IfdInteractionEventHandler } from '../../../../RightKnob';
import { IfdApproachUtils } from '../../../../Utilities/IfdApproachUtils';
import { IfdViewService } from '../../../../ViewService';
import { SelectionMenu, SelectionMenuGroup, SelectionMenuOptionDefinition } from '../Components/SelectionMenu';

/** The position of an element in pixels */
export interface Position {
  /** The x coordinate of an element (horizontal position) in pixels.
   * Origin is left edge of containing element.
   * X coordinate increases as you move to the right */
  xCoord: number;
  /** The y coordinate of an element (vertical position) in pixels.
   * Origin is top edge of containing element.
   * Y coordinate increases as you move down */
  yCoord: number;
}

/** Visual approach entry types (shared by menus, labels, and logic). */
enum VisualEntry {
  StraightIn = 0,
  LeftBase = 1,
  RightBase = 2,
  LeftDownwind = 3,
  RightDownwind = 4,
}

/** Stable order for UI menus. */
const VISUAL_ENTRY_ORDER: VisualEntry[] = [
  VisualEntry.StraightIn,
  VisualEntry.LeftBase,
  VisualEntry.RightBase,
  VisualEntry.LeftDownwind,
  VisualEntry.RightDownwind,
];

/** Human-readable labels for each entry. */
const VISUAL_ENTRY_LABELS: Record<VisualEntry, string> = {
  [VisualEntry.StraightIn]: 'Straight in',
  [VisualEntry.LeftBase]: 'Left Base',
  [VisualEntry.RightBase]: 'Right Base',
  [VisualEntry.LeftDownwind]: 'Left Downwind',
  [VisualEntry.RightDownwind]: 'Right Downwind',
};

/**
 * Get a label for an entry enum value.
 * @param entry The visual entry enum value.
 * @returns The label for the entry, or 'Unknown' if not found.
 */
const getVisualEntryLabel = (entry: VisualEntry): string => VISUAL_ENTRY_LABELS[entry];

/** The class that holds the state of the FplSelectionMenu */
export class FplSelectionMenuController implements IfdInteractionEventHandler {
  public readonly selectionMenuRef = FSComponent.createRef<SelectionMenu>();

  private readonly _isVisible = Subject.create(false);
  public readonly isVisible = this._isVisible as Subscribable<boolean>;

  private readonly _menuClass = SetSubject.create<string>();
  public readonly menuClass: SubscribableSet<string> = this._menuClass;

  public readonly onDepartureLoaded = new SubEvent();
  public readonly onArrivalLoaded = new SubEvent();
  public readonly onApproachLoaded = new SubEvent();

  private readonly _groups = ArraySubject.create<SelectionMenuGroup & {
    /** Mutable options. */
    options: ArraySubject<SelectionMenuOptionDefinition>
  }>();
  public readonly groups = this._groups as SubscribableArray<SelectionMenuGroup>;
  private readonly _selectedOptionIndex = Subject.create(0);
  public readonly selectedOptionIndex = this._selectedOptionIndex as Subscribable<number>;
  private readonly _position = Subject.create<Position>({ xCoord: 280, yCoord: 125 });
  public readonly position = this._position as Subscribable<Position>;

  // DEPARTURE pending state
  private readonly pendingDepartureUiIndex = Subject.create(0);
  private readonly pendingDepartureTransitionFmsIndex = Subject.create(0);
  private readonly pendingRunwayIndex = Subject.create(0);

  // ARRIVAL pending state
  private readonly pendingArrivalUiIndex = Subject.create(0);
  private readonly pendingArrivalTransitionFmsIndex = Subject.create(0);
  private readonly pendingArrivalRunwayIndex = Subject.create(0);

  // APPROACH pending state
  private readonly pendingApproachUiIndex = Subject.create(0);
  private readonly pendingApproachTransitionIndex = Subject.create(0);

  // VISUAL approach pending state
  private readonly pendingVisualRunwayIndex = Subject.create(0);
  private readonly pendingVisualEntryIndex = Subject.create<VisualEntry>(VisualEntry.StraightIn);

  /** Whether hiding the menu should clear the procedure preview. */
  private clearPreviewOnHide = true;

  /**
   * Sets whether the menu should clear procedure preview when hidden.
   * @param value True to clear preview on hide, false to keep it.
   */
  public setClearPreviewOnHide(value: boolean): void {
    this.clearPreviewOnHide = value;
  }

  private getRunwayName = (runwayTransition: RunwayTransition): string => {
    return `${runwayTransition.runwayNumber.toString().padStart(2, '0')}${RunwayUtils.getDesignatorLetter(runwayTransition.runwayDesignation)}`;
  };

  private readonly pendingDeparture = MappedSubject.create(
    ([departures, index]): DepartureListItem | undefined => departures[index],
    this.store.originDepartures,
    this.pendingDepartureUiIndex,
  );

  private readonly pendingArrival = MappedSubject.create(
    ([arrivals, index]): ArrivalListItem | undefined => arrivals[index],
    this.store.destinationArrivals,
    this.pendingArrivalUiIndex,
  );

  private readonly pendingApproach = MappedSubject.create(
    ([approaches, index]): ApproachListItem | undefined => approaches[index],
    this.store.destinationApproaches,
    this.pendingApproachUiIndex,
  );

  /**
   * Handles selecting a departure procedure. If there are >1 en-route transitions, show list (with
   * optional "None"). If 0 or 1, auto-select/skip.
   * @param index The selected departure index.
   */
  private handleDepartureConfirm = (index: number): void => {
    this.pendingDepartureUiIndex.set(index);

    const pendingDep = this.pendingDeparture.get();
    const enrouteCount = pendingDep?.departure.enRouteTransitions.length ?? 0;

    if (pendingDep && enrouteCount > 1) {
      this.clearMenu();
      const groupIndex = this.addGroup(`${pendingDep.departure.name} Transitions`);

      // FIXME should also have "None" option when there are runway transition legs?
      // (update getPendingDepartureTransitionFmsIndex as well)
      if (pendingDep.departure.commonLegs.length > 0) {
        this.addOption(groupIndex, {
          name: 'None',
          confirmHandler: this.handleDepartureTransitionConfirm,
          selectHandler: this.handleDepartureTransitionSelect,
        });
      }

      for (let i = 0; i < pendingDep.departure.enRouteTransitions.length; i++) {
        this.addOption(groupIndex, {
          name: pendingDep.departure.enRouteTransitions[i].name,
          confirmHandler: this.handleDepartureTransitionConfirm,
          selectHandler: this.handleDepartureTransitionSelect,
        });
      }
      this.show();
    } else {
      // Auto-pick index 0 (covers 0 or 1 transitions). -1 not needed because there is no menu.
      this.handleDepartureTransitionConfirm(0);
    }
  };

  private handleDepartureSelect = (selected: boolean, optionIndex: number): Promise<unknown> => {
    const deps = this.store.originDepartures.get();
    const airportFacility = this.store.originFacility.get();
    if (!selected || !airportFacility || !deps[optionIndex]) {
      return Promise.resolve();
    }
    return this.fms.updateProcedurePreview(ProcedureType.DEPARTURE, airportFacility, deps[optionIndex].index, undefined, undefined);
  };

  /**
   * Gets the enroute transition FMS index for a pending departure.
   * @param uiIndex The UI index for the menu, which might include a "None" option at index 0.
   * @returns The FMS index.
   */
  private getPendingDepartureTransitionFmsIndex(uiIndex: number): number {
    const dep = this.pendingDeparture.get()?.departure;
    const hasCommon = (dep?.commonLegs?.length ?? 0) > 0;
    const hasEnroute = (dep?.enRouteTransitions?.length ?? 0) > 0;

    // If we injected "None" (uiIndex==0), map to -1; otherwise shift down by 1.
    return (hasCommon && hasEnroute) ? (uiIndex === 0 ? -1 : uiIndex - 1) : uiIndex;
  }

  /**
   * Maps the user’s transition selection into the real en-route transition index.
   * Index 0 might be "None" if a common segment exists, which maps to -1 for the FMS call.
   * @param uiIndex The index selected in the menu (including the injected "None", if present).
   */
  private handleDepartureTransitionConfirm = (uiIndex: number): void => {
    const dep = this.pendingDeparture.get()?.departure;
    const realIndex = this.getPendingDepartureTransitionFmsIndex(uiIndex);

    this.pendingDepartureTransitionFmsIndex.set(realIndex);

    const pendingDepRunways = dep?.runwayTransitions;
    if (pendingDepRunways && pendingDepRunways.length > 0) {
      const active = this.store.originRunway.get();

      if (active) {
        const idx = pendingDepRunways.findIndex(rt =>
          active.direction === rt.runwayNumber &&
          active.runwayDesignator === rt.runwayDesignation
        );
        if (idx >= 0) {
          this.handleDepartureRunwayConfirm(idx);
          return;
        }
      }

      if (pendingDepRunways.length > 1) {
        this.clearMenu();
        this.addGroup('Runways', dep.runwayTransitions.map((t) => ({
          name: `RW${this.getRunwayName(t)}`,
          confirmHandler: this.handleDepartureRunwayConfirm,
          selectHandler: this.handleDepartureRunwaySelect
        })));
        this.setSelectedOption(this.pendingRunwayIndex.get());
        this.show();
      } else {
        this.handleDepartureRunwayConfirm(0);
      }
    } else {
      this.handleDepartureRunwayConfirm(0);
    }
  };

  private handleDepartureTransitionSelect = (selected: boolean, optionIndex: number): Promise<unknown> => {
    const dep = this.pendingDeparture.get();
    const realIndex = this.getPendingDepartureTransitionFmsIndex(optionIndex);
    const airportFacility = this.store.originFacility.get();

    // handle case where "None" is selected
    if (realIndex === -1 && airportFacility && dep) {
      return this.fms.updateProcedurePreview(ProcedureType.DEPARTURE, airportFacility, dep.index, undefined, undefined);
    }

    const trans = dep?.departure.enRouteTransitions[realIndex];
    if (!selected || !airportFacility || !dep || !trans) {
      return Promise.resolve();
    }

    return this.fms.updateProcedurePreview(ProcedureType.DEPARTURE, airportFacility, dep.index, realIndex, undefined);
  };

  private handleDepartureRunwaySelect = (selected: boolean, optionIndex: number): Promise<unknown> => {
    const dep = this.pendingDeparture.get();
    const fmsIndex = this.getPendingDepartureTransitionFmsIndex(optionIndex);

    this.pendingDepartureTransitionFmsIndex.set(fmsIndex);
    this.pendingRunwayIndex.set(optionIndex);

    const trans = dep?.departure.enRouteTransitions[fmsIndex];
    const airportFacility = this.store.originFacility.get();
    if (!selected || !airportFacility || !dep || !trans) {
      return Promise.resolve();
    }
    return this.fms.updateProcedurePreview(ProcedureType.DEPARTURE, airportFacility, dep.index, fmsIndex, optionIndex);
  };

  /**
   * Handles selecting a departure runway transition, inserts to FMS and sets the origin runway.
   * @param index The index of the selected runway transition.
   * If the index is -1, it means "None" was selected, and no runway will be set.
   * If the index is valid, it will insert the departure procedure into the FMS
   * and set the origin runway to match the chosen runway transition.
   */
  private handleDepartureRunwayConfirm = async (index: number): Promise<void> => {
    this.pendingRunwayIndex.set(index);

    this.hide();

    const airportFacility = this.store.originFacility.get();
    const departureItem = this.pendingDeparture.get();

    if (!airportFacility || !departureItem) {
      return;
    }

    let selectedRunway: OneWayRunway | undefined;

    const rwyTrans = departureItem.departure.runwayTransitions?.[index];
    if (rwyTrans) {
      selectedRunway = RunwayUtils.matchOneWayRunway(
        airportFacility,
        rwyTrans.runwayNumber,
        rwyTrans.runwayDesignation
      );
    }

    if (this.store.activeLegSegmentType.get() === FlightPlanSegmentType.Departure) {
      try {
        await this.viewService.requestConfirmation('Replace Active Departure', 'mint', 155, undefined, true);
      } catch {
        return;
      }
    }

    // Insert new departure procedure.
    await this.fms.loadDeparture(
      airportFacility,
      departureItem.index,
      this.pendingRunwayIndex.get(),
      this.pendingDepartureTransitionFmsIndex.get(), // may be -1 if "None" selected
      selectedRunway
    );

    this.onDepartureLoaded.notify(this, undefined);
  };

  /**
   * Creates a new FplPlanSelectionMenuController
   * @param store An instance of the flight plan store
   * @param fms An instance of the FMS
   * @param viewService The view service to use.
   */
  public constructor(
    private readonly store: FlightPlanStore,
    private readonly fms: Fms,
    private readonly viewService: IfdViewService,
  ) { }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this._isVisible.get()) {
      if (event == IfdInteractionEvent.CLR) {
        this.hide();
        return true;
      }

      if (this.selectionMenuRef.getOrDefault()?.onInteractionEvent(event)) {
        return true;
      }
    }
    return false;
  }

  /** Clears all menu options. */
  public clearMenu(): void {
    this._menuClass.clear();
    this._groups.set([]);
    this._selectedOptionIndex.set(0);
  }

  /**
   * Adds a group to the list.
   * @param title The title of the group.
   * @param options Optionally, the list of options for the group.
   * @returns The group index of the new group.
   */
  public addGroup(title?: string, options?: SelectionMenuOptionDefinition[]): number {
    this._groups.insert({ title, options: ArraySubject.create<SelectionMenuOptionDefinition>(options) });
    return this._groups.length - 1;
  }

  /**
   * Adds an option to a group.
   * @param groupIndex The index of the group.
   * @param option The option to add.
   * @returns The option index within the group of the new option.
   * @throws RangeError if the groupIndex is out of range.
   */
  public addOption(groupIndex: number, option: SelectionMenuOptionDefinition): number {
    const group = this._groups.get(groupIndex);
    if (!group) {
      throw new RangeError('[FplSelectionMenuController::addOption] groupIndex out of range!');
    }

    group.options.insert(option);
    return group.options.length - 1;
  }

  /**
   * Sets the selected item.
   * @param optionIndex The option index (within it's group).
   * @param groupIndex The group index. If not specified the first group with a matching option will be selected.
   */
  public setSelectedOption(optionIndex: number, groupIndex?: number): void {
    this.selectionMenuRef.getOrDefault()?.setSelectedOption(optionIndex, groupIndex);
  }

  /** Adds the departures group + options to the list. */
  public addDepartureGroup(): void {
    const airportFacility = this.store.originFacility.get();
    if (!airportFacility) {
      return;
    }

    this.addGroup(`${airportFacility.icaoStruct.ident} Departures`, this.store.originDepartures.get().map((d) => ({
      name: d.departure.name,
      confirmHandler: this.handleDepartureConfirm,
      selectHandler: this.handleDepartureSelect,
    })));
  }

  /** Shows the departure selection menu. */
  public readonly showDepartureMenu = (): void => {
    this.clearMenu();
    this.addDepartureGroup();

    const departureFmsIndex = this.store.departureIndex.get();
    const selectedItemIndex = this.store.originDepartures.get().findIndex((v) => v.index === departureFmsIndex);
    this._selectedOptionIndex.set(selectedItemIndex);

    this._isVisible.set(true);
  };

  /** Shows the runway selection menu for the current origin airport. */
  public readonly showOriginRunwayMenu = (): void => {
    this.clearMenu();

    const airportFacility = this.store.originFacility.get();
    if (!airportFacility || airportFacility.runways.length === 0) {
      return;
    }

    const oneWayRunways = RunwayUtils.getOneWayRunwaysFromAirport(airportFacility);
    if (oneWayRunways.length === 0) {
      return;
    }

    const groupIndex = this.addGroup(`${airportFacility.icaoStruct.ident} Runways`);

    const activeRunway = this.store.originRunway.get();
    let initialSelectedIndex = 0;

    for (let i = 0; i < oneWayRunways.length; i++) {
      const rwy = oneWayRunways[i];

      if (
        activeRunway &&
        rwy.direction === activeRunway.direction &&
        rwy.runwayDesignator === activeRunway.runwayDesignator
      ) {
        initialSelectedIndex = i;
      }

      this.addOption(groupIndex, {
        name: `RW${RunwayUtils.getRunwayNameString(rwy.direction, rwy.runwayDesignator)}`,
        confirmHandler: this.handleOriginRunwayConfirm,
      });
    }

    this.pendingRunwayIndex.set(initialSelectedIndex);
    this.setSelectedOption(initialSelectedIndex, groupIndex);

    this.show();
  };

  /**
   * Handles confirming a manual origin runway selection from the runway menu.
   * Commits the selected runway into the FMS as the origin runway.
   * @param uiIndex The index of the selected one-way runway in the menu.
   */
  private handleOriginRunwayConfirm = async (uiIndex: number): Promise<void> => {
    this.pendingRunwayIndex.set(uiIndex);

    this.hide();

    const airportFacility = this.store.originFacility.get();

    if (!airportFacility || airportFacility.runways.length === 0) {
      return;
    }

    const oneWayRunways = RunwayUtils.getOneWayRunwaysFromAirport(airportFacility);
    if (uiIndex < 0 || uiIndex >= oneWayRunways.length) {
      return;
    }

    const selectedRunway = oneWayRunways[uiIndex];

    if (selectedRunway.designation === this.store.originRunway.get()?.designation) {
      return;
    }

    const departureIndex = this.store.departureIndex.get();

    if (departureIndex === -1) {
      await this.fms.setOrigin(airportFacility, selectedRunway);
      return;
    }

    if (this.store.activeLegSegmentType.get() === FlightPlanSegmentType.Departure) {
      try {
        await this.viewService.requestConfirmation('Replace Active Departure', 'mint', 155, undefined, true);
      } catch {
        return;
      }
    }

    const departureProcedure = this.store.departureProcedure.get();
    const enrouteTransitionIndex = this.store.departureTransitionIndex.get();
    const departureRunwayTransitionIndex = departureProcedure?.runwayTransitions.findIndex(
      x => x.runwayNumber === selectedRunway.direction && x.runwayDesignation === selectedRunway.runwayDesignator);

    // Insert new runway with existing departure procedure.
    await this.fms.loadDeparture(
      airportFacility,
      departureIndex,
      departureRunwayTransitionIndex ?? -1,
      enrouteTransitionIndex,
      selectedRunway
    );

    this.onDepartureLoaded.notify(this, undefined);
  };

  /** Shows the runway selection menu for the current origin airport. */
  public readonly showDestinationRunwayMenu = (): void => {
    this.clearMenu();

    const airportFacility = this.store.destinationFacility.get();
    if (!airportFacility || airportFacility.runways.length === 0) {
      return;
    }

    const oneWayRunways = RunwayUtils.getOneWayRunwaysFromAirport(airportFacility);
    if (oneWayRunways.length === 0) {
      return;
    }

    const groupIndex = this.addGroup(`${airportFacility.icaoStruct.ident} Runways`);

    const activeRunway = this.store.destinationRunway.get();
    let initialSelectedIndex = 0;

    for (let i = 0; i < oneWayRunways.length; i++) {
      const rwy = oneWayRunways[i];

      if (
        activeRunway &&
        rwy.direction === activeRunway.direction &&
        rwy.runwayDesignator === activeRunway.runwayDesignator
      ) {
        initialSelectedIndex = i;
      }

      this.addOption(groupIndex, {
        name: `RW${RunwayUtils.getRunwayNameString(rwy.direction, rwy.runwayDesignator)}`,
        confirmHandler: this.handleDestinationRunwayConfirm,
      });
    }

    this.pendingArrivalRunwayIndex.set(initialSelectedIndex);
    this.setSelectedOption(initialSelectedIndex, groupIndex);

    this.show();
  };

  /**
   * Handles confirming a manual destination runway selection from the runway menu.
   * Commits the selected runway into the FMS as the destination runway.
   * @param uiIndex The index of the selected one-way runway in the menu.
   */
  private handleDestinationRunwayConfirm = async (uiIndex: number): Promise<void> => {
    this.pendingArrivalRunwayIndex.set(uiIndex);

    this.hide();

    const airportFacility = this.store.destinationFacility.get();

    if (!airportFacility || airportFacility.runways.length === 0) {
      return;
    }

    const oneWayRunways = RunwayUtils.getOneWayRunwaysFromAirport(airportFacility);

    if (uiIndex < 0 || uiIndex >= oneWayRunways.length) {
      return;
    }

    const selectedRunway = oneWayRunways[uiIndex];

    if (selectedRunway.designation === this.store.destinationRunway.get()?.designation) {
      return;
    }

    const isCircling = !this.store.approachProcedure.get()?.runway;
    const activeSegmentType = this.store.activeLegSegmentType.get();

    if (!isCircling && (activeSegmentType === FlightPlanSegmentType.Approach || activeSegmentType === FlightPlanSegmentType.MissedApproach)) {
      try {
        await this.viewService.requestConfirmation('Delete Active Approach', 'mint', 155, undefined, true);
      } catch {
        return;
      }
    }

    await this.fms.setDestination(airportFacility, selectedRunway, false, !isCircling);
  };

  /** Hides the menu */
  public readonly hide = (): void => {
    this._isVisible.set(false);

    if (this.clearPreviewOnHide) {
      this.fms.clearProcedurePreview();
    }

    // Reset to default.
    this.clearPreviewOnHide = true;
  };

  /** Shows the menu. */
  private show(): void {
    this._isVisible.set(true);
  }

  /**
   * Sets the position of the menu
   * @param position The new position of the menu
   */
  public readonly setPosition = (position: Position): void => {
    this._position.set(position);
  };

  /** Adds the arrivals group + options to the list. */
  public addArrivalGroup(): void {
    const airportFacility = this.store.destinationFacility.get();
    if (!airportFacility) {
      return;
    }

    this.addGroup(`${airportFacility.icaoStruct.ident} Arrivals`, this.store.destinationArrivals.get().map((a) => ({
      name: a.arrival.name,
      confirmHandler: this.handleArrivalConfirm,
      selectHandler: this.handleArrivalSelect,
    })));
  }

  /**
   * Opens the selection menu for arrivals at the given facility.
   */
  public showArrivalMenu = (): void => {
    this.clearMenu();
    this.addArrivalGroup();

    const arrivalFmsIndex = this.store.arrivalIndex.get();
    const selectedItemIndex = this.store.destinationArrivals.get().findIndex((v) => v.index === arrivalFmsIndex);
    this._selectedOptionIndex.set(selectedItemIndex);

    this.show();
  };

  /**
   * Handles selecting an arrival procedure.
   * If there are >1 en-route transitions, present the list (with "None" when common path exists).
   * Otherwise auto-select/skip.
   * @param index The selected arrival index.
   */
  private handleArrivalConfirm = (index: number): void => {
    const facility = this.store.destinationFacility.get();
    if (!facility) { return; }

    this.pendingArrivalUiIndex.set(index);

    const arrivalItem = this.pendingArrival.get();
    const enrouteCount = arrivalItem?.arrival.enRouteTransitions.length ?? 0;

    if (arrivalItem && enrouteCount > 1) {
      this.clearMenu();
      const groupIndex = this.addGroup(`${arrivalItem.arrival.name} Transitions`);

      if (arrivalItem.arrival.commonLegs.length > 0) {
        this.addOption(groupIndex, {
          name: 'None',
          confirmHandler: this.handleArrivalTransitionConfirm,
          selectHandler: this.handleArrivalTransitionSelect,
        });
      }

      for (let i = 0; i < arrivalItem.arrival.enRouteTransitions.length; i++) {
        this.addOption(groupIndex, {
          name: arrivalItem.arrival.enRouteTransitions[i].name,
          confirmHandler: this.handleArrivalTransitionConfirm,
          selectHandler: this.handleArrivalTransitionSelect
        });
      }
      this.show();
    } else {
      this.handleArrivalTransitionConfirm(0);
    }
  };

  private handleArrivalSelect = (selected: boolean, uiIndex: number): Promise<unknown> => {
    const arrs = this.store.destinationArrivals.get();
    const airportFacility = this.store.destinationFacility.get();
    if (!selected || !airportFacility || !arrs[uiIndex]) {
      return Promise.resolve();
    }
    return this.fms.updateProcedurePreview(ProcedureType.ARRIVAL, airportFacility, arrs[uiIndex].index, undefined, undefined);
  };

  /**
   * Gets the enroute transition FMS index for a pending departure.
   * @param uiIndex The UI index for the menu, which might include a "None" option at index 0.
   * @returns The FMS index.
   */
  private getPendingArrivalTransitionFmsIndex(uiIndex: number): number {
    const proc = this.pendingArrival.get()?.arrival;
    const hasCommon = (proc?.commonLegs?.length ?? 0) > 0;
    const hasEnroute = (proc?.enRouteTransitions?.length ?? 0) > 0;

    // If we injected "None" (uiIndex==0), map to -1; otherwise shift down by 1.
    return (hasCommon && hasEnroute) ? (uiIndex === 0 ? -1 : uiIndex - 1) : uiIndex;
  }

  /**
   * Handles selecting an arrival en-route transition.
   * Applies the "None" mapping when present and proceeds to runway pick/commit.
   * @param uiIndex The UI index selected (may include "None").
   */
  private handleArrivalTransitionConfirm = (uiIndex: number): void => {
    const facility = this.store.destinationFacility.get();
    if (!facility) { return; }

    const arrivalItem = this.pendingArrival.get();
    const hasCommon = (arrivalItem?.arrival.commonLegs?.length ?? 0) > 0;
    const hasEnroute = (arrivalItem?.arrival.enRouteTransitions?.length ?? 0) > 0;

    const realIndex = (hasCommon && hasEnroute) ? (uiIndex === 0 ? -1 : uiIndex - 1) : uiIndex;
    this.pendingArrivalTransitionFmsIndex.set(realIndex);

    const runways = arrivalItem?.arrival.runwayTransitions ?? [];
    if (runways.length === 0) {
      this.commitArrivalToFms(undefined, undefined);
      return;
    }

    const active = this.store.destinationRunway.get();
    if (active) {
      const idx = runways.findIndex(rt =>
        active.direction === rt.runwayNumber &&
        active.runwayDesignator === rt.runwayDesignation
      );
      if (idx >= 0) {
        this.handleArrivalRunwayConfirm(idx);
        return;
      }
    }

    if (!arrivalItem || runways.length === 1) {
      this.handleArrivalRunwayConfirm(0);
      return;
    }

    this.clearMenu();

    this.addGroup(`${arrivalItem.arrival.name} Transitions`, arrivalItem.arrival.runwayTransitions.map((t) => ({
      name: `RW${t.runwayNumber.toString().padStart(2, '0')}${RunwayUtils.getDesignatorLetter(t.runwayDesignation)}`,
      confirmHandler: this.handleArrivalRunwayConfirm,
    })));

    this.setSelectedOption(this.pendingArrivalRunwayIndex.get());
    this.show();
  };

  private handleArrivalTransitionSelect = (selected: boolean, uiIndex: number): Promise<unknown> => {
    const arr = this.pendingArrival.get();
    const fmsIndex = this.getPendingArrivalTransitionFmsIndex(uiIndex);

    const trans = arr?.arrival.enRouteTransitions[fmsIndex];
    const airportFacility = this.store.destinationFacility.get();

    // handle case where "None" is selected
    if (fmsIndex === -1 && airportFacility && arr) {
      return this.fms.updateProcedurePreview(ProcedureType.ARRIVAL, airportFacility, arr.index, undefined, undefined);
    }

    if (!selected || !airportFacility || !arr || !trans) {
      return Promise.resolve();
    }

    return this.fms.updateProcedurePreview(ProcedureType.ARRIVAL, airportFacility, arr.index, fmsIndex, undefined);
  };

  /**
   * Handles selecting an arrival runway transition and commits to the FMS.
   * Also sets the destination runway to the chosen runway.
   * @param index The runway transition index selected.
   */
  private handleArrivalRunwayConfirm = async (index: number): Promise<void> => {
    this.pendingArrivalRunwayIndex.set(index);

    const facility = this.store.destinationFacility.get();
    const arrivalItem = this.pendingArrival.get();
    const rwyTrans = arrivalItem?.arrival.runwayTransitions?.[index];

    let selectedRunway: OneWayRunway | undefined;
    if (facility && rwyTrans) {
      selectedRunway = RunwayUtils.matchOneWayRunway(
        facility,
        rwyTrans.runwayNumber,
        rwyTrans.runwayDesignation
      );
    }

    this.commitArrivalToFms(index, selectedRunway);
  };

  /**
   * Commits the currently pending arrival into the FMS.
   * @param runwayIndex The arrival runway transition index, or `undefined` if none exist.
   * @param runway The concrete `OneWayRunway` to pass to the FMS (used by the builder to create the runway leg).
   */
  private commitArrivalToFms = async (runwayIndex: number | undefined, runway: OneWayRunway | undefined): Promise<void> => {
    const facility = this.store.destinationFacility.get();
    const arrivalItem = this.pendingArrival.get();
    if (!facility || !arrivalItem) { return; }

    this.hide();

    if (this.store.activeLegSegmentType.get() === FlightPlanSegmentType.Arrival) {
      try {
        await this.viewService.requestConfirmation('Replace Active Arrival', 'mint', 155, undefined, true);
      } catch {
        return;
      }
    }

    await this.fms.loadArrival(
      facility,
      arrivalItem.index,
      runwayIndex ?? -1,
      this.pendingArrivalTransitionFmsIndex.get(),
      runway
    );

    this.onArrivalLoaded.notify(this, undefined);
  };

  /**
   * Adds the approaches group + options to the list.
   */
  public addApproachGroup(): void {
    const airportFacility = this.store.destinationFacility.get();
    if (!airportFacility) {
      return;
    }

    this.addGroup(`${airportFacility.icaoStruct.ident} Approaches`, this.store.destinationApproaches.get().map((a) => ({
      name: IfdApproachUtils.getApproachName(a.approach),
      annotation: IfdApproachUtils.getRnavTypeAnnotation(a.approach),
      confirmHandler: this.handleApproachConfirm,
      selectHandler: this.handleApproachSelect,
    }) satisfies SelectionMenuOptionDefinition));

    this._menuClass.add('with-approaches');
  }

  /**
   * Opens the selection menu for approaches at the destination facility.
   */
  public showApproachMenu = (): void => {
    this.clearMenu();
    this.addApproachGroup();

    const approachFmsIndex = this.store.approachIndex.get();
    const selectedItemIndex = this.store.destinationApproaches.get().findIndex((v) => v.index === approachFmsIndex);
    this._selectedOptionIndex.set(selectedItemIndex);

    this.show();
  };

  /**
   * Get menu option strings in the canonical order.
   * @returns An array of strings representing the visual entry options in order.
   */
  private getVisualEntryOptions = (): SelectionMenuOptionDefinition[] => VISUAL_ENTRY_ORDER.map(
    (entry) => ({ name: getVisualEntryLabel(entry), confirmHandler: this.handleVisualEntryConfirm })
  );

  /**
   * Handles selecting an approach or a visual approach.
   * - If the index points into the instrument list: keep old flow (transitions, insertApproach).
   * - If it points into the visual list: open the Visual Entries submenu.
   * @param uiIndex The index of the selected approach in the UI.
   */
  private handleApproachConfirm = (uiIndex: number): void => {
    const facility = this.store.destinationFacility.get();
    if (!facility) { return; }

    this.pendingApproachUiIndex.set(uiIndex);

    const item = this.pendingApproach.get();
    if (!item) { return; }

    if (item.isVisualApproach) {
      const runway = RunwayUtils.matchOneWayRunwayFromDesignation(facility, item.approach.runway!);
      if (!runway) { return; }

      this.pendingApproachUiIndex.set(uiIndex);

      const allRunways = RunwayUtils.getOneWayRunwaysFromAirport(facility);
      const rwyIdx = allRunways.findIndex(r =>
        r.direction === runway.direction &&
        r.runwayDesignator === runway.runwayDesignator
      );
      if (rwyIdx >= 0) {
        this.pendingVisualRunwayIndex.set(rwyIdx);
      }

      this.clearMenu();
      this.addGroup('Visual Entries', this.getVisualEntryOptions());
      this.setSelectedOption(this.pendingVisualEntryIndex.get());
      this.show();
      return;
    }

    this.pendingApproachUiIndex.set(uiIndex);

    const approach = item.approach;
    const count = approach?.transitions.length ?? 0;
    if (count > 0) {
      this.pendingApproachTransitionIndex.set(0);

      this.clearMenu();
      const options: SelectionMenuOptionDefinition[] = [
        {
          name: 'Vectors',
          confirmHandler: this.handleApproachTransitionConfirm,
          selectHandler: this.handleApproachTransitionSelect,
        },
        ...approach.transitions.map((t) => ({
          name: t.name,
          annotation: BitFlags.isAny(t.legs[0]?.fixTypeFlags ?? 0, FixTypeFlags.IAF) ? '(IAF)' : undefined,
          confirmHandler: this.handleApproachTransitionConfirm,
          selectHandler: this.handleApproachTransitionSelect,
        }))
      ];
      this.addGroup(`${IfdApproachUtils.getApproachName(approach)} Transitions`, options);
      this.setSelectedOption(this.pendingApproachTransitionIndex.get());
      this.show();
    } else {
      this.handleApproachTransitionConfirm(0);
    }
  };

  private handleApproachSelect = async (selected: boolean, uiIndex: number): Promise<unknown> => {
    const apps = this.store.destinationApproaches.get();
    const airportFacility = this.store.destinationFacility.get();
    if (!selected || !airportFacility || !apps[uiIndex]) {
      return Promise.resolve();
    }

    return this.fms.updateProcedurePreview(ProcedureType.APPROACH, airportFacility, apps[uiIndex].index, undefined, undefined);
  };

  /**
   * Commits the selected visual approach (we handle building/insertion ourselves).
   * Entry affects labeling and VTF choice; geometry is handled via insertApproach params.
   * @param entry The selected visual entry type (StraightIn, LeftBase, etc.).
   */
  private handleVisualEntryConfirm = async (entry: VisualEntry): Promise<void> => {
    this.hide();

    const facility = this.store.destinationFacility.get();
    if (!facility) { return; }

    this.pendingVisualEntryIndex.set(entry);

    const runways = RunwayUtils.getOneWayRunwaysFromAirport(facility);
    const runway = runways[this.pendingVisualRunwayIndex.get()];
    if (!runway) { return; }

    // Update destination runway (parity with instrument flows).
    await this.fms.setDestination(facility, runway);

    // Decide VTF vs “straight-in” based on entry type.
    const isVtf = entry !== VisualEntry.StraightIn;

    await this.fms.insertApproach(
      facility,
      -1,
      isVtf ? -1 : 0,
      runway.direction,
      runway.runwayDesignator
    );

    this.onApproachLoaded.notify(this, undefined);
  };

  /**
   * Handles selecting an approach transition.
   * Commits using the FMS approach index (not the UI index).
   * @param uiTransitionIndex The approach transition index selected in the UI, 0 is "Vectors", and after that the facility transitions.
   */
  private handleApproachTransitionConfirm = async (uiTransitionIndex: number): Promise<void> => {
    const facility = this.store.destinationFacility.get();
    const approachItem = this.pendingApproach.get();
    if (!facility || !approachItem) {
      return;
    }

    const currentItem = this.pendingApproach.get();
    if (currentItem?.isVisualApproach) {
      this.clearMenu();
      this.addGroup('Visual Entries', this.getVisualEntryOptions());
      this.setSelectedOption(this.pendingVisualEntryIndex.get());
      this.show();
      return;
    }

    this.hide();

    this.pendingApproachTransitionIndex.set(uiTransitionIndex);

    if (this.store.activeLegSegmentType.get() === FlightPlanSegmentType.Approach || this.store.activeLegSegmentType.get() === FlightPlanSegmentType.MissedApproach) {
      try {
        await this.viewService.requestConfirmation('Replace Active Approach', 'mint', 155, undefined, true);
      } catch {
        return;
      }
    }

    const destinationRunway = this.store.destinationRunway.get();
    const fmsTransitionIndex = uiTransitionIndex < 1 ? ApproachTransitionType.VectorsToFinal : uiTransitionIndex - 1; // first option is "Vectors" which should be -2

    await this.fms.insertApproach(
      facility,
      approachItem.index,
      fmsTransitionIndex,
      undefined,
      undefined,
      false,
      false,
      destinationRunway,
    );

    this.onApproachLoaded.notify(this, undefined);
  };

  private handleApproachTransitionSelect = async (selected: boolean, uiIndex: number): Promise<unknown> => {
    const app = this.pendingApproach.get();
    const fmsTransitionIndex = uiIndex < 1 ? ApproachTransitionType.VectorsToFinal : uiIndex - 1; // first option is "Vectors" which should be -2
    const airportFacility = this.store.destinationFacility.get();
    if (!selected || !airportFacility || !app) {
      return;
    }
    await this.fms.updateProcedurePreview(ProcedureType.APPROACH, airportFacility, app.index, fmsTransitionIndex, undefined);
  };

  /**
   * Makes the selection menu visible at a specific position.
   *
   * @param position - Absolute position (px) of the menu container.
   */
  public showAt(position: Position): void {
    this._position.set(position);
    this.show();
  }

  /**
   * Formats a single facility row for selection menus, matching the style used elsewhere.
   *
   * When {@link distanceNm} is not a finite number, the distance prefix is omitted (per spec).
   *
   * @param fac The facility to format.
   * @param distanceNm Optional distance in nautical miles from a reference point.
   * @returns A single-line string to display in the selection menu.
   */
  public formatFacilityMenuLine(fac: Facility, distanceNm?: number): string {
    const fType = ICAO.getFacilityTypeFromValue(fac.icaoStruct);
    const typeShort =
      fType === FacilityType.Airport ? 'APT' :
        fType === FacilityType.VOR ? 'VOR' :
          fType === FacilityType.NDB ? 'NDB' :
            fType === FacilityType.Intersection ? 'FIX' :
              fType === FacilityType.RWY ? 'RWY' :
                fType === FacilityType.USR ? 'USR' :
                  fType === FacilityType.VIS ? 'VIS' : 'WPT';

    const cityStr = fac.city
      .split(', ')
      .map(city => Utils.Translate(city))
      .join(', ');

    const distPart = (typeof distanceNm === 'number' && Number.isFinite(distanceNm))
      ? `${Math.round(distanceNm)}NM `
      : '';

    return `${distPart}${typeShort} ${fac.icaoStruct.ident} ${Utils.Translate(fac.name)} ${cityStr}`;
  }

  /**
   * Filters and sorts candidate facilities by distance from a reference point.
   * If no reference is provided, distances are set to NaN and no distance cutoff is applied.
   *
   * Primary pass keeps facilities within {@link maxNm}. If none qualify,
   * all candidates are included and sorted by distance.
   *
   * @param candidates The candidate facilities to consider.
   * @param ref Optional reference position for distance computation.
   * @param maxNm Optional maximum distance (NM) for the primary pass. Defaults to 1000 NM.
   * @returns An array of { fac, distNm } items, sorted by distance when known.
   */
  private filterAndSortFacilitiesByDistance(
    candidates: readonly Facility[],
    ref?: GeoPoint,
    maxNm = 1000
  ): {
    /** The facility */
    fac: Facility,
    /** Distance from the reference point in nautical miles (NaN if unknown). */
    distNm: number
  }[] {
    if (!ref || !ref.isValid()) {
      return candidates.map(f => ({ fac: f, distNm: Number.NaN }));
    }

    const toNm = (f: Facility): number => {
      const distRad = ref.distance(f.lat, f.lon);
      return UnitType.GA_RADIAN.convertTo(distRad, UnitType.NMILE);
    };

    let filtered = candidates
      .map(f => ({ fac: f, distNm: toNm(f) }))
      .filter(x => x.distNm <= maxNm)
      .sort((a, b) => a.distNm - b.distNm);

    if (filtered.length === 0) {
      filtered = candidates
        .map(f => ({ fac: f, distNm: toNm(f) }))
        .sort((a, b) => a.distNm - b.distNm);
    }

    return filtered;
  }

  /**
   * Opens a duplicate selection menu for facilities and resolves the user's choice.
   * Uses the shared selection menu UI so FPL and Direct-To behave identically.
   *
   * @param candidates The candidate facilities to present.
   * @param ref Optional reference point used for distance labels and sorting.
   * @param title Optional menu title. Defaults to 'Select Waypoint'.
   * @param position Optional absolute position for the menu container (px).
   * @param initialSelectedIndex Optional initial selection index (clamped).
   * @returns A promise that resolves with the selected facility, or `undefined` if none was picked.
   */
  public async showFacilityDuplicatePicker(
    candidates: readonly Facility[],
    ref?: GeoPoint,
    title = 'Select Waypoint',
    position: Position = { xCoord: 175, yCoord: 15 },
    initialSelectedIndex?: number,
  ): Promise<Facility | undefined> {
    const filtered = this.filterAndSortFacilitiesByDistance(candidates, ref);

    if (filtered.length === 0) {
      return undefined;
    }

    if (filtered.length === 1) {
      return filtered[0].fac;
    }

    // FIXME we should probably reject if the menu is closed without selection!
    return new Promise<Facility | undefined>((resolve) => {
      const onConfirm = (optionIndex: number): void => {
        const picked = filtered[optionIndex]?.fac;
        resolve(picked);
        this.hide();
      };

      this.clearMenu();
      this.addGroup(title, filtered.map((x) => ({ name: this.formatFacilityMenuLine(x.fac, x.distNm), confirmHandler: onConfirm })));
      this._selectedOptionIndex.set(initialSelectedIndex ?? 0);

      this.showAt(position);
    });
  }
}

import {
  DebounceTimer, DisplayComponent, EventBus, Facility, FacilityLoader, FacilitySearchType, FlightPlanner, FSComponent, GeoPoint, NodeReference, Subject, VNode
} from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../Charts/IfdChartsManager';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { FlightPlanStore } from '../../../FlightPlan';
import { Fms } from '../../../Fms';
import { IfdOptions } from '../../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../Keyboard/KeyboardTypes';
import { IfdNearestContext } from '../../../Navigation/IfdNearestContext';
import { MapDataProvider } from '../../../Providers/Map/MapDataProvider';
import { IfdInteractionEventHandler } from '../../../RightKnob';
import { FmsPositionSystemEvents } from '../../../Systems/FmsPositionSystem';
import { TrafficSystem } from '../../../Systems/Traffic/TrafficSystem';
import { FacilitySearchUtils } from '../../../Utilities/FacilitySearchUtils';
import { FplSelectionMenuController } from '../FplTab/FplSelectionMenu/FplSelectionMenuController';
import { Communications } from './Components/Communications';
import { GeneralInfo } from './Components/GeneralInfo';
import { InfoHeaderBlock } from './Components/InfoHeaderBlock';
import { NearbyNavaids } from './Components/NearbyNavaids';
import { Approaches } from './Components/Procedures/Approaches';
import { Arrivals } from './Components/Procedures/Arrivals';
import { Departures } from './Components/Procedures/Departures';
import { RunwayInfo } from './Components/Runway/RunwayInfo';
import { Weather } from './Components/Weather/Weather';
import { INFO_TAB_FOCUS_ORDER, InfoTabFocusableId, InfoTabGroupId } from './InfoTabIds';

import './InfoTab.css';

/** A group component that supports knob-based internal selection.*/
interface InfoTabSelectableGroup {
  /** Moves internal selection by the given delta (+1 / -1). */
  moveSelectionBy(delta: number): void;
}

/** A group component that supports activation of its currently selected internal item. */
interface InfoTabActivatableGroup extends InfoTabSelectableGroup {
  /** Activates the currently selected internal item. */
  activateSelection(): void;
}

/** The properties for the {@link InfoTab} component. */
interface InfoTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The fms instance */
  readonly fms: Fms;
  /** The IFD charts manager */
  readonly chartManager: IfdChartsManager;
  /** The InfoTab Facility  */
  readonly infoFacility: Subject<Facility | undefined>;
  /** The FPL selection menu controller to use. */
  readonly fplSelectionMenuController: FplSelectionMenuController;
  /** The IFD instrument config. */
  readonly ifdOptions: IfdOptions;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** A instance of the traffic system */
  readonly trafficSystem?: TrafficSystem;
  /** Nearest context */
  readonly nearestContext: IfdNearestContext;
}

/** The InfoTab component. */
export class InfoTab
  extends TabContent<InfoTabProps>
  implements IfdInteractionEventHandler {
  public readonly title: string = 'INFO';
  private readonly ppos = new GeoPoint(0, 0);
  private readonly expandedInfoGroupId = Subject.create<InfoTabGroupId | null>(
    null,
  );
  private readonly mapParkingRef = FSComponent.createRef<HTMLDivElement>();
  private readonly headerRef = FSComponent.createRef<InfoHeaderBlock>();
  private readonly activeFocusableId = Subject.create<InfoTabFocusableId>(
    InfoTabFocusableId.HeaderTerminus,
  );
  private readonly activeFocusableIndex = Subject.create(0);
  private readonly scrollToExpandedTimer = new DebounceTimer();
  private readonly scrollContainerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly communicationsRef = FSComponent.createRef<Communications>();
  private readonly nearbyNavaidsRef = FSComponent.createRef<NearbyNavaids>();
  private readonly generalInfoRef = FSComponent.createRef<GeneralInfo>();
  private readonly runwayInfoRef = FSComponent.createRef<RunwayInfo>();
  private readonly weatherRef = FSComponent.createRef<Weather>();
  private readonly departuresRef = FSComponent.createRef<Departures>();
  private readonly approachesRef = FSComponent.createRef<Approaches>();
  private readonly arrivalsRef = FSComponent.createRef<Arrivals>();

  /** Refs for all collapsible groups, keyed by their focusable ID. */
  private readonly groupRefs: Readonly<
    Record<InfoTabGroupId, NodeReference<DisplayComponent<any, any>>>
  > = {
      [InfoTabFocusableId.General]: this.generalInfoRef,
      [InfoTabFocusableId.Communications]: this.communicationsRef,
      [InfoTabFocusableId.RunwayInfo]: this.runwayInfoRef,
      [InfoTabFocusableId.NearbyNavaids]: this.nearbyNavaidsRef,
      [InfoTabFocusableId.Departures]: this.departuresRef,
      [InfoTabFocusableId.Approaches]: this.approachesRef,
      [InfoTabFocusableId.Arrivals]: this.arrivalsRef,
      [InfoTabFocusableId.Weather]: this.weatherRef,
    };

  /**
   * Gets a group component instance for the given group id, if available.
   *
   * @param groupId The group id.
   * @returns The group component instance, or undefined.
   */
  private getGroupComponent(
    groupId: InfoTabGroupId,
  ): DisplayComponent<any, any> | null {
    return this.groupRefs[groupId].getOrDefault();
  }

  /**
   * Checks if a value is a selectable group.
   * @param value The value to check.
   * @returns Whether the value is a selectable group.
   */
  private isSelectableGroup(value: unknown): value is InfoTabSelectableGroup {
    return (
      typeof (value as InfoTabSelectableGroup | null)?.moveSelectionBy ===
      'function'
    );
  }

  /**
   * Checks if a value is an activatable group.
   * @param value The value to check.
   * @returns Whether the value is an activatable group.
   */
  private isActivatableGroup(value: unknown): value is InfoTabActivatableGroup {
    return (
      this.isSelectableGroup(value) &&
      typeof (value as InfoTabActivatableGroup | null)?.activateSelection ===
      'function'
    );
  }

  /**
   * Scrolls the given group container to the top of the scroll container.
   * Debounced to allow DOM/layout to update after expand/collapse.
   *
   * @param groupId The group id to scroll to.
   */
  private scrollGroupToTop(groupId: InfoTabGroupId): void {
    this.scrollToExpandedTimer.schedule(() => {
      const yOffsetPx = 10;
      const scrollEl = this.scrollContainerRef.getOrDefault();

      if (!scrollEl) {
        return;
      }

      const target = scrollEl.querySelector(
        `[data-info-group-id="${groupId}"]`,
      ) as HTMLElement | null;

      if (!target) {
        return;
      }

      const scrollRect = scrollEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const delta = targetRect.top - scrollRect.top;
      const top = scrollEl.scrollTop + delta;

      scrollEl.scrollTop = Math.max(0, top - yOffsetPx);
    }, 0);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const handledByCalc = this.tryHandleDensityAltCalcEvent(event);
    if (handledByCalc) {
      return true;
    }

    const isClear = event === IfdInteractionEvent.CLR;
    const isActivate =
      event === IfdInteractionEvent.RightKnobPush ||
      event === IfdInteractionEvent.ENTR;

    if (isClear) {
      return this.handleClear();
    }

    const delta = this.getFocusDeltaFromEvent(event);

    if (delta !== 0) {
      return this.handleDelta(delta);
    }

    if (isActivate) {
      return this.handleActivate();
    }

    return false;
  }

  /**
   * Handles CLR behavior:
   * - if a section is expanded -> collapse it
   * - otherwise -> focus header terminus
   *
   * @returns Whether the event was handled.
   */
  private handleClear(): boolean {
    const expanded = this.expandedInfoGroupId.get();

    if (expanded !== null) {
      this.expandedInfoGroupId.set(null);
      return true;
    }

    this.setFocusToId(InfoTabFocusableId.HeaderTerminus);
    return true;
  }

  /**
   * Handles focus delta from knob events.
   * If an expanded section supports internal selection, move that selection.
   * Otherwise move outer focus.
   *
   * @param delta The delta (+1 / -1).
   * @returns Whether the event was handled.
   */
  private handleDelta(delta: number): boolean {
    const active = this.activeFocusableId.get();
    const expanded = this.expandedInfoGroupId.get();

    const handledByInternal = this.tryMoveInternalSelection(
      active,
      expanded,
      delta,
    );

    if (handledByInternal) {
      return true;
    }

    this.moveFocusBy(delta);
    return true;
  }

  /**
   * Handles "activate" (knob push / ENTR).
   * If an expanded section supports internal activation, do that.
   * Otherwise activate focused element (header controls, expand/collapse group).
   *
   * @returns Whether the event was handled.
   */
  private handleActivate(): boolean {
    const active = this.activeFocusableId.get();
    const expanded = this.expandedInfoGroupId.get();

    const handledByInternal = this.tryActivateInternalSelection(
      active,
      expanded,
    );

    if (handledByInternal) {
      return true;
    }

    return this.activateFocused();
  }

  /**
   * Attempts to route knob delta to an expanded group's internal selection.
   *
   * @param active The currently focused element.
   * @param expanded The currently expanded group id.
   * @param delta The delta (+1 / -1).
   * @returns True if handled.
   */
  private tryMoveInternalSelection(
    active: InfoTabFocusableId,
    expanded: InfoTabGroupId | null,
    delta: number,
  ): boolean {
    if (active !== expanded) {
      return false;
    }

    if (!this.isGroupFocusableId(active)) {
      return false;
    }

    const group = this.getGroupComponent(active);

    if (!this.isSelectableGroup(group)) {
      return false;
    }

    group.moveSelectionBy(delta);
    return true;
  }

  /**
   * Attempts to route activation to an expanded group's internal activation.
   *
   * @param active The currently focused element.
   * @param expanded The currently expanded group id.
   * @returns True if handled.
   */
  private tryActivateInternalSelection(
    active: InfoTabFocusableId,
    expanded: InfoTabGroupId | null,
  ): boolean {
    if (active !== expanded) {
      return false;
    }

    if (!this.isGroupFocusableId(active)) {
      return false;
    }

    const group = this.getGroupComponent(active);

    if (!this.isActivatableGroup(group)) {
      return false;
    }

    group.activateSelection();
    return true;
  }

  /**
   * Attempts to handle interaction events by the Density Alt Calc overlay.
   * If visible, it steals relevant knob events.
   *
   * @param event The interaction event.
   * @returns True if handled by the overlay.
   */
  private tryHandleDensityAltCalcEvent(event: IfdInteractionEvent): boolean {
    const general = this.generalInfoRef.getOrDefault();

    if (!general) {
      return false;
    }

    if (!general.isDensityAltCalcVisible()) {
      return false;
    }

    if (event === IfdInteractionEvent.CLR) {
      general.hideDensityAltCalc();
      return true;
    }

    const delta = this.getFocusDeltaFromEvent(event);

    if (delta !== 0) {
      general.moveDensityAltCalcSelectionBy(delta);
      return true;
    }

    if (
      event === IfdInteractionEvent.RightKnobPush ||
      event === IfdInteractionEvent.ENTR
    ) {
      general.activateDensityAltCalcSelection();
      return true;
    }

    return false;
  }

  /**
   * Activates the currently focused element.
   * @returns Whether activation was handled.
   */
  private activateFocused(): boolean {
    const active = this.activeFocusableId.get();

    let handled = false;

    if (active === InfoTabFocusableId.HeaderTerminus) {
      this.headerRef.getOrDefault()?.activateTerminus();
      handled = true;
    } else if (active === InfoTabFocusableId.HeaderProcedureIcon) {
      this.headerRef.getOrDefault()?.activateProcedureIcon();
      handled = true;
    } else if (this.isGroupFocusableId(active)) {
      this.toggleGroupExpanded(active);
      handled = true;
    }

    return handled;
  }

  /**
   * Toggles expanded state for a given group.
   * @param groupId The group to toggle.
   */
  private toggleGroupExpanded(groupId: InfoTabGroupId): void {
    const expandedId = this.expandedInfoGroupId.get();

    if (expandedId === groupId) {
      this.expandedInfoGroupId.set(null);
    } else {
      this.expandedInfoGroupId.set(groupId);
      this.scrollGroupToTop(groupId);
    }
  }

  /**
   * Checks if a focusable ID is a group ID (i.e. not a header focus target).
   * @param id The focusable ID.
   * @returns Whether the ID is a group ID.
   */
  private isGroupFocusableId(id: InfoTabFocusableId): id is InfoTabGroupId {
    return (
      id !== InfoTabFocusableId.HeaderTerminus &&
      id !== InfoTabFocusableId.HeaderProcedureIcon
    );
  }

  /**
   * Sets header focus to a specific target.
   * @param target The target to focus.
   */
  private setHeaderFocusTo(target: 'terminus' | 'procedure-icon'): void {
    const id =
      target === 'terminus'
        ? InfoTabFocusableId.HeaderTerminus
        : InfoTabFocusableId.HeaderProcedureIcon;

    this.setFocusToId(id);
  }

  /**
   * Converts an interaction event to a focus delta (+1 / -1), or 0 if the event is not a focus move.
   * @param event The interaction event.
   * @returns The focus delta.
   */
  private getFocusDeltaFromEvent(event: IfdInteractionEvent): number {
    let delta = 0;

    switch (event) {
      case IfdInteractionEvent.RightKnobInnerInc:
      case IfdInteractionEvent.RightKnobOuterInc: {
        delta = 1;
        break;
      }

      case IfdInteractionEvent.RightKnobInnerDec:
      case IfdInteractionEvent.RightKnobOuterDec: {
        delta = -1;
        break;
      }

      default: {
        delta = 0;
        break;
      }
    }

    return delta;
  }

  /**
   * Moves focus by the given delta.
   * @param delta The delta to move focus by.
   */
  private moveFocusBy(delta: number): void {
    const current = this.activeFocusableIndex.get();
    const next = current + delta;
    this.setFocusIndex(next);
  }

  /**
   * Sets focus to the focusable element at the given index.
   * @param index The index of the focusable element to focus.
   */
  private setFocusIndex(index: number): void {
    const clamped = Math.max(
      0,
      Math.min(INFO_TAB_FOCUS_ORDER.length - 1, index),
    );

    this.activeFocusableIndex.set(clamped);
    this.activeFocusableId.set(INFO_TAB_FOCUS_ORDER[clamped]);
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.setFocusIndex(0);
    this.activeFocusableId
      .sub(() => this.syncFocusableSelection(), true)
      .withLifecycle(this.defaultLifecycle);
    this.bus
      .getSubscriber<FmsPositionSystemEvents>()
      .on('fms_pos_position_1')
      .atFrequency(1)
      .handle((v) => this.ppos.set(v.lat, v.long))
      .withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public override pause(): void {
    this.expandedInfoGroupId.set(null);
    super.pause();
  }

  /**
   * Syncs the selected state of focusable elements based on the active focusable ID.
   */
  private syncFocusableSelection(): void {
    const active = this.activeFocusableId.get();
    const header = this.headerRef.getOrDefault();

    if (!header) {
      return;
    }

    const headerSelected =
      active === InfoTabFocusableId.HeaderTerminus ||
      active === InfoTabFocusableId.HeaderProcedureIcon;

    header.setSelected(headerSelected);

    if (active === InfoTabFocusableId.HeaderTerminus) {
      header.setHeaderFocus('terminus');
    } else if (active === InfoTabFocusableId.HeaderProcedureIcon) {
      header.setHeaderFocus('procedure-icon');
    } else {
      header.setHeaderFocus(null);
    }
  }

  /**
   * Opens the shared IFD text keyboard via IfdContainer.
   * Uses the existing "text_edit_row_keyboard_open" event. We buffer value in
   * onValueChanged and commit on close (Enter).
   *
   * @param smartPrefill - Initial ident.
   * @param onAccept - Called with final ident (uppercased) after Enter.
   * @param anchorEl - Optional element for anchor purposes (passed through as rowRef).
   * @param onValueChangedCallback - Optional live update callback on every keyboard change.
   * @param onCloseCallback - Called when closed.
   * @param inputType - The keyboard input type.
   */
  private openKeyboard(
    smartPrefill: string,
    onAccept: (ident: string) => void,
    anchorEl?: HTMLElement,
    onValueChangedCallback?: (value: string) => void,
    onCloseCallback?: () => void,
    inputType: KeyboardInputType = KeyboardInputType.FreeText,
  ): void {
    const pub = this.bus.getPublisher<IfdKeyboardControlEvents>();
    let pendingValue =
      inputType === KeyboardInputType.FreeText
        ? smartPrefill.toUpperCase()
        : '';
    const isNumerical = inputType !== KeyboardInputType.FreeText;

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: inputType,
      disableModeSwitch: isNumerical,
      initialShowNumpad: isNumerical,
      initialValue: pendingValue,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      onValueChanged: (value: string) => {
        const upper = value.toUpperCase();
        pendingValue = upper;
        if (onValueChangedCallback) {
          onValueChangedCallback(upper);
        }
      },
      onEnter: () => {
        const ident = pendingValue.trim();
        if (ident) {
          onAccept(ident);
        }
      },
      onClose: () => {
        if (onCloseCallback) {
          onCloseCallback();
        }
      },
      rowRef: anchorEl ?? null,
    };

    pub.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /**
   * Loads facilities matching `ident`, invokes the shared duplicate picker to resolve
   * any ambiguities (with distance labels relative to the previous waypoint when available),
   * and inserts the chosen facility before/after the anchor leg.
   *
   * @param ident The user-entered ident (case-insensitive).
   * @returns A promise that resolves when the insertion step is complete (or skipped).
   */
  private async insertWaypointByIdentWithPicker(
    ident: string,
  ): Promise<boolean> {
    const trimmed = ident.trim().toUpperCase();
    if (!trimmed) {
      return false;
    }

    const candidates: readonly Facility[] =
      await FacilitySearchUtils.getSearchUtils(this.bus).loadFacilities(
        trimmed,
        FacilitySearchType.All,
        true,
      );

    if (!candidates?.length) {
      console.warn(`[FPL] No facilities found for ident "${trimmed}"`);
      return false;
    }

    const picked =
      await this.props.fplSelectionMenuController.showFacilityDuplicatePicker(
        candidates,
        this.ppos,
        '- Select Waypoint -',
      );

    if (!picked) {
      // User cancelled or nothing selected.
      return false;
    }

    this.props.infoFacility.set(picked);
    return true;
  }

  /**
   * Sets the active focus to a specific focusable ID.
   * @param id The ID to focus.
   */
  private setFocusToId(id: InfoTabFocusableId): void {
    const index = INFO_TAB_FOCUS_ORDER.indexOf(id);

    if (index < 0) {
      return;
    }

    this.activeFocusableIndex.set(index);
    this.activeFocusableId.set(id);
  }

  private readonly setExpandedGroupId = (id: InfoTabGroupId | null): void => {
    this.expandedInfoGroupId.set(id);

    if (id !== null) {
      this.scrollGroupToTop(id);
    }
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="info-tab">
        <InfoHeaderBlock
          ref={this.headerRef}
          chartManager={this.props.chartManager}
          infoFacility={this.props.infoFacility}
          openKeyboard={this.openKeyboard.bind(this)}
          onReplaceInfoFacility={async (ident: string) =>
            await this.insertWaypointByIdentWithPicker(ident)
          }
          viewService={this.props.viewService}
          collapseAllSections={() => this.setExpandedGroupId(null)}
          onFocusRequested={(target) => {
            this.setHeaderFocusTo(target);
            this.setExpandedGroupId(null);
          }}
        />
        <div class="scroll-container" ref={this.scrollContainerRef}>
          <GeneralInfo
            ref={this.generalInfoRef}
            bus={this.props.bus}
            facLoader={this.props.facLoader}
            fms={this.props.fms}
            mapDataProvider={this.props.mapDataProvider}
            flightPlanner={this.props.flightPlanner}
            trafficSystem={this.props.trafficSystem}
            viewService={this.props.viewService}
            infoFacility={this.props.infoFacility}
            ifdOptions={this.props.ifdOptions}
            openKeyboard={this.openKeyboard.bind(this)}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.General}
            mapParkingRef={this.mapParkingRef}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.General)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.General)
            }
          />
          <Communications
            ref={this.communicationsRef}
            bus={this.props.bus}
            infoFacility={this.props.infoFacility}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.Communications}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.Communications)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.Communications)
            }
          />
          <RunwayInfo
            ref={this.runwayInfoRef}
            bus={this.props.bus}
            infoFacility={this.props.infoFacility}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.RunwayInfo}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.RunwayInfo)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.RunwayInfo)
            }
          />
          <NearbyNavaids
            bus={this.props.bus}
            infoFacility={this.props.infoFacility}
            nearestContext={this.props.nearestContext}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.NearbyNavaids}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.NearbyNavaids)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.NearbyNavaids)
            }
            ref={this.nearbyNavaidsRef}
          />
          <Departures
            ref={this.departuresRef}
            bus={this.props.bus}
            infoFacility={this.props.infoFacility}
            facLoader={this.props.facLoader}
            mapDataProvider={this.props.mapDataProvider}
            flightPlanner={this.props.flightPlanner}
            trafficSystem={this.props.trafficSystem}
            viewService={this.props.viewService}
            ifdOptions={this.props.ifdOptions}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.Departures}
            mapParkingRef={this.mapParkingRef}
            fms={this.props.fms}
            selectionMenuController={this.props.fplSelectionMenuController}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.Departures)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.Departures)
            }
          />
          <Approaches
            ref={this.approachesRef}
            bus={this.props.bus}
            infoFacility={this.props.infoFacility}
            facLoader={this.props.facLoader}
            mapDataProvider={this.props.mapDataProvider}
            flightPlanner={this.props.flightPlanner}
            trafficSystem={this.props.trafficSystem}
            viewService={this.props.viewService}
            ifdOptions={this.props.ifdOptions}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.Approaches}
            mapParkingRef={this.mapParkingRef}
            fms={this.props.fms}
            selectionMenuController={this.props.fplSelectionMenuController}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.Approaches)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.Approaches)
            }
          />
          <Arrivals
            ref={this.arrivalsRef}
            bus={this.props.bus}
            infoFacility={this.props.infoFacility}
            facLoader={this.props.facLoader}
            mapDataProvider={this.props.mapDataProvider}
            flightPlanner={this.props.flightPlanner}
            trafficSystem={this.props.trafficSystem}
            viewService={this.props.viewService}
            ifdOptions={this.props.ifdOptions}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.Arrivals}
            mapParkingRef={this.mapParkingRef}
            fms={this.props.fms}
            selectionMenuController={this.props.fplSelectionMenuController}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.Arrivals)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.Arrivals)
            }
          />
          <Weather
            ref={this.weatherRef}
            bus={this.props.bus}
            infoFacility={this.props.infoFacility}
            facLoader={this.props.facLoader}
            expandedGroupId={this.expandedInfoGroupId}
            setExpandedGroupId={this.setExpandedGroupId}
            groupId={InfoTabFocusableId.Weather}
            isSelected={this.activeFocusableId
              .map((id) => id === InfoTabFocusableId.Weather)
              .withLifecycle(this.defaultLifecycle)}
            onHeaderClicked={() =>
              this.setFocusToId(InfoTabFocusableId.Weather)
            }
          />
        </div>
        <div class="hidden" ref={this.mapParkingRef} />
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.scrollToExpandedTimer.clear();
    super.destroy();
  }
}

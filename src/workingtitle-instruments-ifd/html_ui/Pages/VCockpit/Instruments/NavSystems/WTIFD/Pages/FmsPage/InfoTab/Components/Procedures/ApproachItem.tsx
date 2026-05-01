import {
  AirportFacility, ApproachProcedure, ComponentProps, DebounceTimer, EventBus, FacilityLoader, FlightPlanner, FSComponent, LifecycleComponent, MappedSubject,
  NodeReference, Subject, Subscribable, VNode
} from '@microsoft/msfs-sdk';

import { DynamicListData } from '../../../../../Components/List';
import { Fms, ProcedureType } from '../../../../../Fms';
import { IfdOptions } from '../../../../../IfdOptions';
import { MapContainer } from '../../../../../Map/MapContainer';
import { MapSizes } from '../../../../../Map/MapSizes';
import { MapDataProvider } from '../../../../../Providers/Map/MapDataProvider';
import { TrafficSystem } from '../../../../../Systems/Traffic/TrafficSystem';
import { IfdViewService } from '../../../../../ViewService';
import { SelectionMenuOptionDefinition } from '../../../FplTab/Components/SelectionMenu';
import { FplSelectionMenuController } from '../../../FplTab/FplSelectionMenu/FplSelectionMenuController';
import { InfoItem } from '../InfoItem';

import './Procedures.css';

/** Interface for Approach list data. */
export interface ApproachListData extends DynamicListData {
  /** The airport facility associated with the procedure. */
  readonly airportFacility: AirportFacility;
  /** The procedure associated with the list item. */
  readonly procedure: ApproachProcedure;
}

/** The properties for the {@link ApproachItem} component. */
interface ApproachItemProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
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
  /** A list data for a procedure */
  readonly procedureListData: ApproachListData;
  /** The index of this item in the runway list */
  readonly listIndex: number;
  /** The index of currently expanded item. Null if no item is expanded. */
  readonly expandedIndex: Subscribable<number | null>;
  /** The index of currently selected item. Null if no item is selected. */
  readonly selectedIndex: Subscribable<number | null>;
  /** Callback to expand an item by index */
  readonly expandItem: (index: number) => void;
  /** Callback to collapse the item */
  readonly collapseItem: () => void;
  /** Callback to select an item by index */
  readonly selectItem: (index: number) => void;
  /** Reference to the parking map container */
  readonly mapParkingRef: NodeReference<HTMLDivElement>;
  /** The fms instance */
  readonly fms: Fms;
  /** Shared selection menu controller */
  readonly selectionMenuController: FplSelectionMenuController;
  /**
   * Sub-selection within an expanded item:
   * 0 = Chevron, 1 = Transition
   */
  readonly expandedFocusIndex: Subscribable<number>;
}

/**
 * The Approach info item of the info tab.
 */
export class ApproachItem extends LifecycleComponent<ApproachItemProps> {
  private readonly mapContainerRef = FSComponent.createRef<MapContainer>();
  private readonly iconContainerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly headerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly transitionRef = FSComponent.createRef<HTMLSpanElement>();

  private readonly adoptTimer = new DebounceTimer();

  private readonly transitionIndex = Subject.create(0);

  private readonly isCollapsed = this.props.expandedIndex.map((v) => v !== this.props.listIndex).withLifecycle(this.defaultLifecycle);
  private readonly isSelected = this.props.selectedIndex.map((v) => v === this.props.listIndex).withLifecycle(this.defaultLifecycle);

  private readonly onHeaderClickBound = this.onHeaderClick.bind(this);
  private readonly onIconClickBound = this.onIconClick.bind(this);
  private readonly onTransitionClickBound = this.onTransitionClick.bind(this);

  private readonly chevronFocused = MappedSubject.create(
    ([collapsed, focused]) => !collapsed && focused === 0,
    this.isCollapsed,
    this.props.expandedFocusIndex
  ).withLifecycle(this.defaultLifecycle);

  private readonly transitionFocused = MappedSubject.create(
    ([collapsed, focused]) => !collapsed && focused === 1,
    this.isCollapsed,
    this.props.expandedFocusIndex
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.isCollapsed.sub((collapsed) => {
      const map = this.mapContainerRef.getOrDefault();
      if (!map) {
        return;
      }

      if (collapsed) {
        this.adoptTimer.clear();
        map.unhost();
        this.props.fms.clearProcedurePreview();
        return;
      }
      // Defer adopt to allow the map container to become visible first
      this.adoptTimer.schedule(() => {
        map.host();

        void this.updatePreview();
      }, 0);
    }, true).withLifecycle(this.defaultLifecycle);

    this.headerRef.instance.addEventListener('click', this.onHeaderClickBound);
    this.iconContainerRef.instance.addEventListener('click', this.onIconClickBound);

    const proc = this.props.procedureListData.procedure;
    const enrouteEl = this.transitionRef.getOrDefault();
    if (enrouteEl && proc.transitions.length > 1) {
      enrouteEl.addEventListener('click', this.onTransitionClickBound);
    }
  }

  /**
   * Updates procedure preview using the currently selected indices.
   * @returns A promise for the preview update.
   */
  private updatePreview(): Promise<unknown> {
    const proc = this.props.procedureListData.procedure;
    const hasTransition = proc.transitions.length > 0;
    const transitionIndex = hasTransition ? this.transitionIndex.get() : undefined;

    return this.props.fms.updateProcedurePreview(
      ProcedureType.APPROACH,
      this.props.procedureListData.airportFacility,
      this.props.listIndex,
      transitionIndex,
      undefined,
    );
  }

  /**
   * Expands this item if collapsed, otherwise collapses it.
   * This method assumes the caller already decided whether selection should happen.
   */
  private toggleExpanded(): void {
    if (this.isCollapsed.get()) {
      this.props.expandItem(this.props.listIndex);
    } else {
      this.props.collapseItem();
    }
  }

  /**
   * Handles click on the header row (select only).
   * @param e The mouse event.
   */
  private onHeaderClick(e: MouseEvent): void {
    e.stopPropagation();
    if (this.props.selectedIndex.get() === this.props.listIndex && this.isCollapsed.get()) {
      this.props.expandItem(this.props.listIndex);
    } else {
      this.props.selectItem(this.props.listIndex);
    }
  }

  /**
   * Handles click on the expand icon (select + expand/collapse).
   * @param e The mouse event.
   */
  private onIconClick(e: MouseEvent): void {
    e.stopPropagation();
    this.props.selectItem(this.props.listIndex);
    this.toggleExpanded();
  }

  /** Shows transition selection menu for this procedure item. */
  public showTransitionMenu(): void {
    const proc = this.props.procedureListData.procedure;
    const trans = proc.transitions;

    if (trans.length <= 1) {
      return;
    }

    const menu = this.props.selectionMenuController;
    menu.setClearPreviewOnHide(false);

    const options: SelectionMenuOptionDefinition[] = [];

    for (let i = 0; i < trans.length; i++) {
      const t = trans[i];
      options.push({
        name: t.name,
        confirmHandler: (optionIndex) => {
          this.transitionIndex.set(optionIndex);
          void this.updatePreview();
          this.props.selectionMenuController.hide();
        },
      });
    }

    menu.clearMenu();

    const groupIndex = menu.addGroup('Transitions', options);
    menu.setSelectedOption(this.transitionIndex.get(), groupIndex);
    menu.showAt({ xCoord: 10, yCoord: 10 });
  }

  /**
   * Activates a focused sub-target inside this item when expanded.
   * 0 = Chevron (collapse), 1 = Transition menu.
   *
   * @param focusIndex The focused sub-target index.
   */
  public activateFocusedTarget(focusIndex: number): void {
    if (this.isCollapsed.get()) {
      return;
    }

    if (focusIndex === 0) {
      this.props.collapseItem();
      return;
    }

    if (focusIndex === 1) {
      this.showTransitionMenu();
      return;
    }
  }

  /**
   * Handles transition click: selects the item and opens transition menu.
   * @param e Mouse event.
   */
  private onTransitionClick(e: MouseEvent): void {
    const proc = this.props.procedureListData.procedure;
    if (proc.transitions.length <= 1) {
      return;
    }

    e.stopPropagation();
    this.props.selectItem(this.props.listIndex);
    this.showTransitionMenu();
  }

  /** @inheritDoc */
  public render(): VNode {
    const proc = this.props.procedureListData.procedure;
    const hasTransition = proc.transitions.length > 0;
    const hasMultipleTransitions = proc.transitions.length > 1;
    const transitionLabel = this.transitionIndex.map((idx) => proc.transitions[idx] ? proc.transitions[idx].name : '').withLifecycle(this.defaultLifecycle);
    const showCollapsedName = this.isCollapsed.map((v) => v).withLifecycle(this.defaultLifecycle);
    const showExpandedName = this.isCollapsed.map((v) => !v).withLifecycle(this.defaultLifecycle);

    return (
      <InfoItem
        class="procedures-item"
        isSelected={this.isSelected}
      >
        <div class="header" ref={this.headerRef}>
          <div class="name">
            {/* Expanded header: transition.procedure */}
            <div class={{ hidden: showCollapsedName }}>
              <span
                ref={this.transitionRef}
                class={{ 'clickable': hasMultipleTransitions, 'selected': this.transitionFocused, hidden: !hasTransition }}
              >
                {transitionLabel}
              </span>
              <span class={{ hidden: !hasTransition }}>.</span>
              <span>{proc.name}</span>
            </div>

            {/* Collapsed header: procedure name only */}
            <div class={{ hidden: showExpandedName }}>
              {proc.name}
            </div>
          </div>

          <div class={{ 'chevron-button': true, selected: this.chevronFocused, collapsed: this.isCollapsed }} ref={this.iconContainerRef}>
            <img src="/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/chevron.png" />
          </div>
        </div>

        <div class={{ 'procedure-preview': true, hidden: this.isCollapsed }}>
          <MapContainer
            ref={this.mapContainerRef}
            parkingRef={this.props.mapParkingRef}
            bus={this.props.bus}
            trafficSystem={this.props.trafficSystem}
            facLoader={this.props.facLoader}
            viewService={this.props.viewService}
            flightPlanner={this.props.flightPlanner}
            mapDataProvider={this.props.mapDataProvider}
            ifdOptions={this.props.ifdOptions}
            projectedSize={new Float64Array([MapSizes.procedurePreview.width, MapSizes.procedurePreview.height])}
            previewMode={true}
            fms={this.props.fms}
            class="approach-item-map-container"
          />
        </div>
      </InfoItem>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.adoptTimer.clear();
    this.mapContainerRef.getOrDefault()?.unhost();
    this.headerRef.instance?.removeEventListener('click', this.onHeaderClickBound);
    this.iconContainerRef.instance?.removeEventListener('click', this.onIconClickBound);
    this.transitionRef.instance?.removeEventListener('click', this.onTransitionClickBound);
    super.destroy();
  }
}

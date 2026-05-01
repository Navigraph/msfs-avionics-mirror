/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  AirwayData, AirwaySegment, ClockEvents, ConsumerSubject, DebounceTimer, EventBus, Facility, FacilityLoader, FacilitySearchType, FacilityType, FlightPlan,
  FlightPlanLeg, FlightPlanSegmentType, FlightPlanUtils, FSComponent, GeoPoint, ICAO, IntersectionFacility, IntersectionFacilityUtils, LegDefinition,
  LegTurnDirection, LegType, NodeReference, Subject, Subscribable, Subscription, Vec2Math, Vec2Subject, VNode
} from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';
import { IfdList } from '../../../../Components/List';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import {
  FlightPlanLegData, FlightPlanLegListData, FlightPlanListData, FlightPlanListManager, FlightPlanStore, SelectableFlightPlanListData
} from '../../../../FlightPlan';
import { FlightPlanIndex, Fms, FmsUtils } from '../../../../Fms';
import { IfdOptions } from '../../../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../../Keyboard/KeyboardTypes';
import { LineSelectKeyButtonType } from '../../../../LineSelectKeyButtons';
import { LskState } from '../../../../LineSelectKeyButtons/LskState';
import { getVerticalDirectIcon } from '../../../../LineSelectKeyButtons/VerticalDirectIcon';
import { FmsHooksManager } from '../../../../Navigation/FmsHooksManager';
import { IfdNearestContext } from '../../../../Navigation/IfdNearestContext';
import { IfdInteractionEventHandler, RightKnobState } from '../../../../RightKnob';
import { IfdView, IfdViewProps } from '../../../../ViewService';
import { FmsPageEvents } from '../../FmsPageEvents';
import { DestinationBlock } from '../Components/DestinationBlock';
import { DiscontinuityBlock } from '../Components/DiscontinuityBlock';
import { FplCursor } from '../Components/FplCursor';
import { FplSegmentLabels } from '../Components/FplSegmentLabels';
import { HoldBlock } from '../Components/HoldBlock';
import { InsertWptBlock } from '../Components/InsertWptBlock/InsertWptBlock';
import { LegBlock } from '../Components/LegBlock';
import { OriginBlock } from '../Components/OriginBlock';
import { ProcedureTurnBlock } from '../Components/ProcedureTurnBlock';
import { TextInputField } from '../Components/TextInputField';
import { ZeroHeightBlock } from '../Components/ZeroHeightBlock';
import { FplSelectionMenuController, Position } from '../FplSelectionMenu/FplSelectionMenuController';
import { NavigationMapPaneFlightPlanFocusData } from './NavigationMapPaneViewEvents';

import './FplContainer.css';

/** The properties for the {@link FplContainer} component. */
interface FplContainerProps extends IfdViewProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The fms instance */
  readonly fms: Fms;
  /** Which flight plan index to handle events for. */
  readonly planIndex: number;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** The flight plan list to use. */
  readonly listManager: FlightPlanListManager;
  /** The right knob state. */
  readonly knobState: RightKnobState;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The IFD config options to use. */
  readonly ifdOptions: IfdOptions;
  /** The LSK state. */
  readonly lskState: LskState;
  /** The FMS hooks manager. */
  readonly fmsHooks: FmsHooksManager;
  /** Whether this component is in sidebar mode. */
  readonly isInSidebarMode: Subscribable<boolean>;
  /** The FPL selection menu controller to use. */
  readonly fplSelectionMenuController: FplSelectionMenuController;
  /** The IFD charts manager */
  readonly chartManager: IfdChartsManager;
  /** Nearest context */
  readonly nearestContext: IfdNearestContext;
}

/**
 * The FplContainer component.
 * Display the main flight plan list, either in full page mode or sidebar mode.
 * Component was started by copying GtcFlightPlanPage.tsx from the G3000, so look at that for reference.
 */
export class FplContainer extends IfdView<FplContainerProps> implements IfdInteractionEventHandler {
  private readonly store = this.props.store;
  private readonly listManager = this.props.listManager;
  private procCursor = -1;
  private procMode: 'approach' | 'arrival' = 'approach';
  private readonly destinationRefMap = new Map<FlightPlanLegData, NodeReference<DestinationBlock>>();
  private readonly holdBlockRefMap = new Map<FlightPlanLegData, NodeReference<HoldBlock>>();
  private readonly insertWptBlockRef = FSComponent.createRef<InsertWptBlock>();
  private readonly tmpWptSelectionActive = Subject.create(false);
  private readonly insertWptInitialFacility = Subject.create<Facility | null>(null);

  /** Anchor leg for the Insert Wpt temporary row (may be null for empty plan). */
  private insertWptAnchorLegData: FlightPlanLegData | null = null;

  private readonly selectedListData = Subject.create<SelectableFlightPlanListData | undefined>(undefined);
  private readonly spaceAfterItemSelected = Subject.create(false);

  private readonly canScrollUpWaypoint = Subject.create(false);
  private readonly canScrollDownWaypoint = Subject.create(false);

  private readonly controlPublisher = this.bus.getPublisher<FmsPageEvents>();
  private readonly isInsertWptBlockDisplayed = Subject.create(false);

  // private readonly showOnMap: UserSetting<boolean>;
  private readonly showOnMapData = Subject.create<NavigationMapPaneFlightPlanFocusData>({
    planIndex: -1,
    globalLegIndexStart: -1,
    globalLegIndexEnd: -1,
    segmentIndex: -1,
    globalLegIndex: -1
  });
  private readonly showOnMapDataUpdateTimer = new DebounceTimer();

  /** Updates this page's show on map flight plan focus data based on the current show on map state and flight plan list selection. */
  private readonly showOnMapUpdateHandler = (): void => {
    //   const showOnMap = this.showOnMap.get();

    //   if (!showOnMap) {
    //     this.showOnMapData.set({ planIndex: -1, globalLegIndexStart: -1, globalLegIndexEnd: -1, segmentIndex: -1, globalLegIndex: -1 });
    //     return;
    //   }

    //   const plan = this.props.fms.getFlightPlan(this.props.planIndex);

    //   let globalLegIndexStart: number;
    //   let globalLegIndexEnd: number;
    //   let segmentIndex: number;
    //   let globalLegIndex: number;

    //   const data = this.selectedListData.get();
    //   if (data === null) {
    //     globalLegIndexStart = 0;
    //     globalLegIndexEnd = plan.length;
    //     segmentIndex = -1;
    //     globalLegIndex = -1;
    //   } else {
    //     if (data.type === 'leg') {
    //       const legData = data.legData;
    //       globalLegIndexStart = legData.globalLegIndex.get();

    //       // If the selected leg is the target of a DTO existing, focus the DTO leg instead.
    //       if (legData.segment.segmentIndex === plan.directToData.segmentIndex
    // && globalLegIndexStart - legData.segment.offset === plan.directToData.segmentLegIndex) {
    //         globalLegIndexStart += FmsUtils.DTO_LEG_OFFSET;
    //       }

    //       globalLegIndexEnd = globalLegIndexStart + 1;
    //       segmentIndex = -1;
    //       globalLegIndex = globalLegIndexStart;
    //     } else {
    //       const segmentData = data.segmentData;
    //       const segment = segmentData.segment;

    //       if (segment.segmentType === FlightPlanSegmentType.Enroute && segment.airway === undefined) {
    //         // When the enroute header is selected, flight plan focus is set to all enroute legs, plus the first leg
    //         // after the last enroute leg.

    //         globalLegIndexStart = -1;
    //         globalLegIndexEnd = -1;

    //         for (const planSegment of plan.segmentsOfType(FlightPlanSegmentType.Enroute)) {
    //           globalLegIndexStart ??= planSegment.offset;
    //           globalLegIndexEnd = planSegment.offset + planSegment.legs.length + 1;
    //         }

    //         globalLegIndexEnd = Math.min(plan.length, globalLegIndexEnd);
    //         segmentIndex = -1;
    //       } else {
    //         globalLegIndexStart = segment.offset;
    //         globalLegIndexEnd = segment.offset + segment.legs.length;
    //         segmentIndex = segment.segmentIndex;
    //       }

    //       globalLegIndex = -1;
    //     }
    //   }

    //   this.showOnMapData.set({ planIndex: this.props.planIndex, globalLegIndexStart, globalLegIndexEnd, segmentIndex, globalLegIndex });
  };

  private readonly flightPlanList = FSComponent.createRef<IfdList<FlightPlanListData>>();
  private readonly segmentLabels = FSComponent.createRef<FplSegmentLabels>();
  private readonly cursorBeforeListRef = FSComponent.createRef<FplCursor>();

  // TODO Mini should be 13, but it causes some style issues in other components that need fixing
  private readonly listItemSpacingPx = this.store.miniFplFormat.map(x => x ? 20 : 20);
  private readonly listRenderWindow = Vec2Subject.create(Vec2Math.create(0, Infinity));

  private readonly lastActiveLegAutoScrolledTo = Subject.create<FlightPlanLegData | undefined>(undefined);
  private readonly toLegScrollSub: Subscription;
  private readonly activeLegChangedDebounced = new DebounceTimer();
  private readonly tempWptScrollTimer = new DebounceTimer();

  private readonly selectedSegmentIndex = Subject.create(-1);
  private readonly selectedSegmentLegIndex = Subject.create(-1);
  private readonly isPageOpen = Subject.create(false);

  private readonly isDirectToOpen = ConsumerSubject.create(this.bus.getSubscriber<FmsPageEvents>().on('fms_page_direct_to_open'), false);

  private selectedListDataSub?: Subscription;
  private showOnMapSub?: Subscription;
  private waypointArrowUpdateClockSub?: Subscription;

  private isPaused = true;
  private readonly textFieldRef = FSComponent.createRef<TextInputField>();
  private readonly hiddenFieldRef = FSComponent.createRef<HTMLDivElement>();

  private selectedGlobalLegIndexSub?: Subscription;
  private altitudeFieldSub?: Subscription;
  private verticalDirectSub?: Subscription;
  private readonly isSelectedLegVerticalDirectEligible = Subject.create(false);

  private readonly viewModeLsk3Pipe = this.store.viewMode.pipe(
    this.props.lskState.lsk3.value,
    mode => mode === 'expanded' ? 'Expanded' : 'Compact',
    false,
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Constructor.
   * @param props This component's props.
   * @throws Error if a display pane index is not defined for this view.
   */
  public constructor(props: FplContainerProps) {
    super(props);

    // this.showOnMap = this.props.gtcService.gtcSettings.getSetting(`gtcShowFlightPlanPreview${this.displayPaneIndex}`);

    // Scroll to active leg when changed, but only if not in view
    this.toLegScrollSub = this.store.toLeg.sub(() => {
      this.activeLegChangedDebounced.schedule(this.autoScrollToActiveLeg.bind(this), 0);
    }, false, true);

    this.waypointArrowUpdateClockSub = this.bus.getSubscriber<ClockEvents>().on('realTime').atFrequency(1)
      .handle(this.updateWaypointArrowButtons.bind(this)).pause();

    // Deselect the selected item if it gets deleted
    this.props.store.flightPlanLegsChanged.on(() => {
      this.pruneDestinationRefMap();
      const selected = this.selectedListData.get();
      if (!selected) { return; }
      if (selected.type === 'leg' && !this.store.legMap.has(selected.legData.leg)) {
        this.selectedListData.set(undefined);
      }
    });

    this.props.store.flightPlanLegsChanged.on(() => {
      // this.calcTopRow();
    });

    this.props.store.toLeg.sub(() => {
      // this.calcTopRow();
    });

    // TODO Context sensitive
    this.props.knobState.leftText.set('Scroll');
    this.props.knobState.rightText.set('Select');
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.flightPlanList.instance.renderWindow.pipe(this.listRenderWindow);

    const setLsk2Handler = this.setLsk2.bind(this);
    this.register(this.store.canActivate.sub(setLsk2Handler));
    this.register(this.store.isThereAtLeastOneLeg.sub(setLsk2Handler));
    this.register(this.isSelectedLegVerticalDirectEligible.sub(setLsk2Handler));
    this.register(this.flightPlanList.instance.activeIndex.sub(setLsk2Handler));
    this.register(this.props.fmsHooks.onHookStateChanged.on(setLsk2Handler));
    this.register(this.props.fms.isPlanActivated.sub(setLsk2Handler, true));

    const setFmsHookLegIndex = this.props.fmsHooks.setSelectedLegIndex.bind(this.props.fmsHooks);

    this.register(this.flightPlanList.instance.activeItem.sub((item) => {
      if (this.altitudeFieldSub) {
        this.altitudeFieldSub.destroy();
        this.altitudeFieldSub = undefined;
      }
      if (this.verticalDirectSub) {
        this.verticalDirectSub.destroy();
        this.verticalDirectSub = undefined;
      }
      if (this.selectedGlobalLegIndexSub) {
        this.selectedGlobalLegIndexSub.destroy();
        this.selectedGlobalLegIndexSub = undefined;
      }

      if (item?.type === 'leg') {
        this.altitudeFieldSub = item.isAltitudeFieldSelected.sub(this.onAltitudeFieldSelectionChanged.bind(this));
        this.verticalDirectSub = item.legData.isVerticalDirectToEligible.sub(this.updateVerticalDirectState, true);
        this.selectedGlobalLegIndexSub = item.legData.globalLegIndex.sub(setFmsHookLegIndex, true);
      } else {
        this.isSelectedLegVerticalDirectEligible.set(false);
        setFmsHookLegIndex(-1);
      }
    }));

    const updateLsk4FmsHooks = this.updateLsk4FmsHooks.bind(this);

    this.isInsertWptBlockDisplayed.sub(() => {
      updateLsk4FmsHooks();
      this.setLsk3();
      this.setLsk2();
    }, true).withLifecycle(this.defaultLifecycle);

    this.register(this.props.fmsHooks.onHookStateChanged.on(updateLsk4FmsHooks));
    this.register(this.spaceAfterItemSelected.sub(updateLsk4FmsHooks));
    // When the Insert Wpt temp row exists, force selection/focus to it.
    this.register(this.listManager.tempWptListIndex.sub(index => {
      if (index === undefined) {
        this.isInsertWptBlockDisplayed.set(false);
        return;
      }

      this.isInsertWptBlockDisplayed.set(true);

      const list = this.flightPlanList.getOrDefault();
      if (!list) {
        return;
      }

      this.tempWptScrollTimer.schedule(() => {
        const items = this.listManager.dataList.getArray();

        if (index < 0 || index >= items.length) {
          return;
        }

        const tempItem = items[index];
        if (!tempItem) {
          return;
        }

        list.focusItem(tempItem);
        list.scrollToItem(tempItem, 'closest', true, true);
      }, 0);
    }, true));
    this.updateLsk4FmsHooks();


    this.props.fplSelectionMenuController.onDepartureLoaded.on(this.scrollOriginIntoView);
    this.props.fplSelectionMenuController.onArrivalLoaded.on(this.scrollDestinationIntoView);
    this.props.fplSelectionMenuController.onApproachLoaded.on(this.scrollDestinationIntoView);

    this.flightPlanList.instance.activeItem.pipe(this.selectedListData);
    this.flightPlanList.instance.spaceAfterItemSelected.pipe(this.spaceAfterItemSelected);

    // make sure a leg is selected if the direct to dialog opens
    this.isDirectToOpen.sub((v) => v && this.flightPlanList.getOrDefault()?.checkSelection()).withLifecycle(this.defaultLifecycle);

    // this._activeComponent.set(this.flightPlanList.instance);

    // ---- Register Popups ----

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.FlightPlanOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <GtcFlightPlanOptionsPopup
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         planIndex={this.props.planIndex}
    //         showOnMap={this.showOnMap}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.DataFields,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) =>
    // <FlightPlanDataFieldsPage gtcService={gtcService} controlMode={controlMode} displayPaneIndex={displayPaneIndex!} />,
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.OriginOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <OriginOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         store={this.store}
    //         planIndex={this.props.planIndex}
    //         selectedListData={this.selectedListData}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.DepartureOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <DepartureOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         store={this.store}
    //         planIndex={this.props.planIndex}
    //         selectedListData={this.selectedListData}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.EnrouteOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <EnrouteOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         planIndex={this.props.planIndex}
    //         selectedListData={this.selectedListData}
    //         onWaypointInserted={this.handleWaypointInserted.bind(this)}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.AirwayOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <AirwayOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         selectedListData={this.selectedListData}
    //         fms={this.props.fms}
    //         planIndex={this.props.planIndex}
    //         store={this.props.store}
    //         listManager={this.listManager}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.ArrivalOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <ArrivalOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         store={this.store}
    //         planIndex={this.props.planIndex}
    //         selectedListData={this.selectedListData}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.DestinationOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <DestinationOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         store={this.store}
    //         planIndex={this.props.planIndex}
    //         selectedListData={this.selectedListData}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.ApproachOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <ApproachOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         store={this.store}
    //         planIndex={this.props.planIndex}
    //         selectedListData={this.selectedListData}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Persistent, // This popup gets opened/closed a lot when scrolling through waypoints, so make it persistent.
    //   GtcFlightPlanPageViewKeys.WaypointOptions,
    //   'MFD',
    //   (gtcService, controlMode, displayPaneIndex) => {
    //     return (
    //       <WaypointOptionsSlideoutMenu
    //         gtcService={gtcService}
    //         controlMode={controlMode}
    //         displayPaneIndex={displayPaneIndex}
    //         fms={this.props.fms}
    //         store={this.store}
    //         listManager={this.listManager}
    //         planIndex={this.props.planIndex}
    //         selectedListData={this.selectedListData}
    //         selectNextWaypoint={this.selectNextWaypoint.bind(this)}
    //         canScrollUp={this.canScrollUpWaypoint}
    //         canScrollDown={this.canScrollDownWaypoint}
    //         onWaypointInserted={this.handleWaypointInserted.bind(this)}
    //       />
    //     );
    //   },
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.FpaSpeedMenu, 'MFD',
    //   () => <FlightPlanFpaSpeedSlideoutMenu controlMode='MFD' gtcService={this.gtcService} fms={this.props.fms} store={this.store} />,
    //   this.props.displayPaneIndex
    // );

    // this.props.gtcService.registerView(
    //   GtcViewLifecyclePolicy.Transient,
    //   GtcFlightPlanPageViewKeys.VnavConstraint, 'MFD',
    //   () => <FlightPlanVnavConstraintSlideoutMenu
    // controlMode='MFD' gtcService={this.gtcService} fms={this.props.fms} store={this.store} planIndex={this.props.planIndex} />,
    //   this.props.displayPaneIndex
    // );

    // ---- Selected Item Popups ----

    this.selectedListDataSub = this.selectedListData.sub(selected => {
      this.controlPublisher.pub('fms_page_fpl_selected_item', selected, false, true);

      if (selected === undefined) {
        return;
      }

      // if (selected.type === 'leg') {
      //   this.props.gtcService.openPopup<WaypointOptionsSlideoutMenu>(GtcFlightPlanPageViewKeys.WaypointOptions, 'slideout-right', 'none')
      //     .ref.setData(selected);
      // } else {
      //   let popupKey: string | undefined;
      //   switch (selected.segmentData.segment.segmentType) {
      //     case FlightPlanSegmentType.Departure:
      //       popupKey = this.props.store.departureProcedure.get() === undefined
      //         ? GtcFlightPlanPageViewKeys.OriginOptions
      //         : GtcFlightPlanPageViewKeys.DepartureOptions;
      //       break;
      //     case FlightPlanSegmentType.Enroute:
      //       if (selected.segmentData.segment.airway === undefined) {
      //         popupKey = GtcFlightPlanPageViewKeys.EnrouteOptions;
      //       } else {
      //         popupKey = GtcFlightPlanPageViewKeys.AirwayOptions;
      //       }
      //       break;
      //     case FlightPlanSegmentType.Arrival:
      //       popupKey = GtcFlightPlanPageViewKeys.ArrivalOptions;
      //       break;
      //     case FlightPlanSegmentType.Approach:
      //       popupKey = GtcFlightPlanPageViewKeys.ApproachOptions;
      //       break;
      //     case FlightPlanSegmentType.Destination:
      //       popupKey = GtcFlightPlanPageViewKeys.DestinationOptions;
      //       break;
      //   }

      //   if (popupKey !== undefined) {
      //     this.props.gtcService.openPopup<GtcFlightPlanPageSlideoutMenu<FlightPlanSegmentListData>>(popupKey, 'slideout-right', 'none')
      //       .ref.setData(selected);
      //   }
      // }
    }, false, true);

    this.selectedListData.sub(() => this.updateWaypointArrowButtons(), true);

    // TODO Pause and resume
    this.selectedListData.sub(selected => {
      if (!selected) {
        this.selectedSegmentIndex.set(-1);
        this.selectedSegmentLegIndex.set(-1);
      } else if (selected.type === 'leg') {
        this.selectedSegmentIndex.set(selected.segmentListData?.segmentData.segment.segmentIndex ?? -1);
        this.selectedSegmentLegIndex.set(selected.legData.segmentLegIndex.get());
      }
    });

    // ---- Show On Map ----

    // const selectedListDataShowOnMapSub = this.selectedListData.sub(() => {
    //   if (!this.showOnMapDataUpdateTimer.isPending()) {
    //     this.showOnMapDataUpdateTimer.schedule(this.showOnMapUpdateHandler, 0);
    //   }
    // }, false, true);

    // const legsChangedSub = this.legsChangedSub = this.props.store.flightPlanLegsChanged.on(() => {
    //   if (!this.showOnMapDataUpdateTimer.isPending()) {
    //     this.showOnMapDataUpdateTimer.schedule(this.showOnMapUpdateHandler, 0);
    //   }
    // }, true);

    // const showOnMapDataSub = this.showOnMapData.sub(data => {
    //   this.sendFlightPlanFocusData(data);
    // }, false, true);

    // this.showOnMapSub = this.showOnMap.sub(show => {
    //   const viewSetting = this.displayPaneSettings.getSetting('displayPaneView');

    //   if (show) {
    //     viewSetting.value = DisplayPaneViewKeys.NavigationMap;
    //     this.showOnMapUpdateHandler();
    //     selectedListDataShowOnMapSub.resume();
    //     legsChangedSub.resume();
    //     showOnMapDataSub.resume(true);
    //   } else {
    //     selectedListDataShowOnMapSub.pause();
    //     legsChangedSub.pause();
    //     this.showOnMapUpdateHandler();
    //     showOnMapDataSub.pause();
    //     viewSetting.value = this.displayPaneSettings.getSetting('displayPaneDesignatedView').value;
    //   }
    // }, false, true);
  }

  /** Handles changes to the altitude field selection state of the selected leg. */
  private onAltitudeFieldSelectionChanged(): void {
    this.updateVerticalDirectState();
    this.updateLsk4FmsHooks();
  }

  /** Updates whether vertical direct to is available. */
  private updateVerticalDirectState = (): void => {
    const activeItem = this.flightPlanList.instance.activeItem.get();
    const isAltFieldSelected = activeItem?.type === 'leg' && activeItem.isAltitudeFieldSelected.get();
    const isVerticalDirectEligible = activeItem?.type === 'leg' && activeItem.legData.isVerticalDirectToEligible.get();
    this.isSelectedLegVerticalDirectEligible.set(isAltFieldSelected && isVerticalDirectEligible);
  };

  private onDeletePlan = (): void => {
    this.viewService.requestConfirmation('Delete Flight Plan')
      .then(() => this.props.fms.emptyPrimaryFlightPlan())
      .catch(() => { });
  };

  /**
   * Set LSK3 label and visibility.
   */
  private setLsk3(): void {
    if (this.isInsertWptBlockDisplayed.get()) {
      this.viewModeLsk3Pipe.pause();
      this.props.lskState.lsk3.label.set('Enter');
      this.props.lskState.lsk3.isVisible.set(true);
      this.props.lskState.lsk3.onClick.set(this.handleInsertWptEnter);
      this.props.lskState.lsk3.type.set(LineSelectKeyButtonType.Action);
      this.props.lskState.lsk3.value.set(undefined);
      return;
    } else {
      this.viewModeLsk3Pipe.resume(true);
      this.props.lskState.lsk3.isVisible.set(true);
      this.props.lskState.lsk3.onClick.set(this.handleViewLskClicked);
      this.props.lskState.lsk3.type.set(LineSelectKeyButtonType.State);
      this.props.lskState.lsk3.label.set('View');
      return;
    }
  }

  /**
   * Set LSK2 label and visibility.
   */
  private setLsk2(): void {
    if (this.isInsertWptBlockDisplayed.get()) {
      this.props.lskState.lsk2.label.set('');
      this.props.lskState.lsk2.isVisible.set(false);
      return;
    }

    if (this.props.store.canActivate.get()) {
      this.props.lskState.lsk2.label.set('Activate\nFlight Plan');
      this.props.lskState.lsk2.isVisible.set(this.props.store.canActivate.get());
      this.props.lskState.lsk2.onClick.set(() => this.props.fms.activatePrimaryFlightPlan());
      return;
    }

    const item = this.flightPlanList.instance.activeItem.get() as FlightPlanLegListData | unknown;
    if (item instanceof FlightPlanLegListData) {
      const globalLegIndex = item.legData.globalLegIndex.get();
      const fpl = this.props.fms.getPrimaryFlightPlan();
      const segmentIndex = fpl.getSegmentIndex(globalLegIndex);
      const segmentLegIndex = fpl.getSegmentLegIndex(globalLegIndex);
      const canActivateLeg = this.props.fms.canActivateLeg(segmentIndex, segmentLegIndex);
      const alreadyActive = fpl.activeLateralLeg === globalLegIndex;

      if (this.props.fmsHooks.isDisableMissedEnabled.get()) {
        this.props.lskState.lsk2.label.set('Disable\nMissed');
        this.props.lskState.lsk2.isVisible.set(true);
        this.props.lskState.lsk2.onClick.set(this.props.fmsHooks.disableMissed);
        return;
      } else if (this.isSelectedLegVerticalDirectEligible.get()) {
        this.props.lskState.lsk2.isVisible.set(true);
        this.props.lskState.lsk2.onClick.set(() => this.props.fms.activateVerticalDirect(item.legData.globalLegIndex.get()));
        this.props.lskState.lsk2.label.set(getVerticalDirectIcon);
        return;
      } else if (canActivateLeg && globalLegIndex !== -1 && !alreadyActive) {
        this.props.lskState.lsk2.label.set('Activate\nLeg');
        this.props.lskState.lsk2.isVisible.set(true);
        this.props.lskState.lsk2.onClick.set(() => {
          this.props.fms.activateLeg(fpl.getSegmentIndex(globalLegIndex), fpl.getSegmentLegIndex(globalLegIndex));
          this.setLsk2();
        });
        return;
      }
    }

    if (this.store.isThereAtLeastOneLeg.get()) {
      // FIXME workaround while we don't have ROUTE page:
      // The flight plan can be deleted from LSK2 instead when it is not used for anything else.
      // Remember to remove the sub in onAfterRender when we remove this.
      this.props.lskState.lsk2.label.set('Delete\nFlight Plan');
      this.props.lskState.lsk2.isVisible.set(true);
      this.props.lskState.lsk2.onClick.set(this.onDeletePlan);
    } else {
      this.props.lskState.lsk2.isVisible.set(false);
      this.props.lskState.lsk2.onClick.set(undefined);
      this.props.lskState.lsk2.label.set('');
    }
  }

  /** Handles the View LSK click to toggle between expanded and compact view modes. */
  private handleViewLskClicked = (): void => {
    const currentMode = this.store.viewMode.get();
    this.store.viewMode.set(currentMode === 'expanded' ? 'compact' : 'expanded');
  };

  /** Removes the temporary Insert Wpt row from the list and clears its context. */
  private handleRemoveTempWpt = (): void => {
    this.listManager.removeTempWpt();
    this.tmpWptSelectionActive.set(false);
    this.insertWptAnchorLegData = null;
  };

  /**
   * Handles LSK3 press while Insert Wpt is active.
   * - If the Insert Wpt block has a resolved facility, inserts it into the flight plan
   * after the anchor leg (or into the first enroute segment if no anchor).
   * - If there is no resolved facility yet, tries to resolve duplicates first. If a
   * facility is chosen, inserts it immediately.
   */
  private handleInsertWptEnter = async (): Promise<void> => {
    const block = this.insertWptBlockRef.getOrDefault();
    if (!block) {
      return;
    }

    let facility = block.getSelectedFacility();

    // No facility yet → try duplicates first.
    if (!facility && block.hasDuplicates()) {
      facility = await block.resolveDuplicates();
    }

    // If we still have no facility (user cancelled, no matches, etc), just bail.
    if (!facility) {
      return;
    }

    const anchorLegData = this.insertWptAnchorLegData ?? null;

    const newLeg = await this.insertPickedFacility(
      facility,
      anchorLegData,
      'after',
      false
    );

    this.handleRemoveTempWpt();

    if (!newLeg) {
      return;
    }

    this.handleWaypointInserted(newLeg);
  };

  /** Updates the LSK4 FMS Hooks. */
  private updateLsk4FmsHooks(): void {
    if (this.isInsertWptBlockDisplayed.get()) {
      this.props.lskState.lsk4.label.set('Cancel');
      this.props.lskState.lsk4.isVisible.set(true);
      this.props.lskState.lsk4.onClick.set(this.handleRemoveTempWpt.bind(this));
      return;
    }

    const item = this.flightPlanList.instance.activeItem.get() as FlightPlanLegListData | unknown;
    const cursorInSpace = this.spaceAfterItemSelected.get();

    if (this.props.fmsHooks.isEnableApAprEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.enableApApproach);
      this.props.lskState.lsk4.label.set('Enable A/P\nApproach');
    } else if (this.props.fmsHooks.isDeleteConstraintEnabled.get() && item instanceof FlightPlanLegListData && item.isAltitudeFieldSelected.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.deleteConstraint);
      this.props.lskState.lsk4.label.set('Delete\nConstraint');
    } else if (this.props.fmsHooks.isActivateApproachEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.activateApproach);
      this.props.lskState.lsk4.label.set('Activate\nApproach');
    } else if (this.props.fmsHooks.isRetryApproachEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.retryApproach);
      this.props.lskState.lsk4.label.set('Retry\nApproach');
    } else if (this.props.fmsHooks.isEnableMissedEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.enableMissed);
      this.props.lskState.lsk4.label.set('Enable\nMissed');
    } else if (this.props.fmsHooks.isContinueHoldEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.enableMissed);
      this.props.lskState.lsk4.label.set('Continue\nHold');
    } else if (this.props.fmsHooks.isDeleteHoldEnabled.get() && !cursorInSpace) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.deleteHold);
      this.props.lskState.lsk4.label.set('Delete\nHold');
    } else if (this.props.fmsHooks.isExitHoldEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.exitHold);
      this.props.lskState.lsk4.label.set('Exit\nHold');
    } else if (this.props.fmsHooks.isSkipHoldEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.skipHold);
      this.props.lskState.lsk4.label.set('Skip\nHold');
    } else if (this.props.fmsHooks.isSequenceLegEnabled.get()) {
      this.props.lskState.lsk4.onClick.set(this.props.fmsHooks.sequenceLeg);
      this.props.lskState.lsk4.label.set('Sequence\nLeg');
    } else if (this.props.fmsHooks.isDeleteWaypointEnabled.get() && !cursorInSpace) {
      const isOrigin = item && item instanceof FlightPlanLegListData && item.isOriginLeg;
      const isDestination = item && item instanceof FlightPlanLegListData && item.isDestinationLeg;

      this.props.lskState.lsk4.onClick.set(this.handleDeleteSelectedLeg);
      this.props.lskState.lsk4.label.set(
        isOrigin ? 'Delete\nOrigin' :
          isDestination ? 'Delete\nDestination' :
            'Delete\nWaypoint'
      );
    } else if (this.props.fmsHooks.isConnectLegsEnabled.get() && item && item instanceof FlightPlanLegListData) {
      const globalLegIndex = item.legData.globalLegIndex.get();
      const prevLeg = this.props.fms.getPrimaryFlightPlan().tryGetLeg(globalLegIndex - 1);
      const nextLeg = this.props.fms.getPrimaryFlightPlan().tryGetLeg(globalLegIndex + 1);

      if (!prevLeg || !nextLeg) {
        this.props.lskState.lsk4.onClick.set(undefined);
        this.props.lskState.lsk4.label.set(undefined);
      } else {
        this.props.lskState.lsk4.onClick.set(this.handleDeleteSelectedLeg);
        this.props.lskState.lsk4.label.set(() => <>
          <div>Connect</div>
          <div style="font-size: 15px">{prevLeg.leg.fixIcaoStruct.ident} & {nextLeg.leg.fixIcaoStruct.ident}</div>
        </>);
      }
    } else {
      this.props.lskState.lsk4.onClick.set(undefined);
      this.props.lskState.lsk4.label.set(undefined);
    }

    this.props.lskState.lsk4.isVisible.set(this.props.lskState.lsk4.label.get() !== undefined);
  }

  /**
   * Called by FplTab on PROC press.
   * Cycles through destination blocks, alternates between Approach and Arrival.
   */
  public handleProcBtn(): void {
    this.pruneDestinationRefMap();
    const refs = this.getDestinationRefsInUiOrder();

    if (refs.length === 0) {
      // No destinations - insert cursor at the top, no procedures.
      this.flightPlanList.instance.focusIndex(0);
      return;
    }

    // First press - Approach of the next destination after the active leg
    if (this.procCursor < 0) {
      const fpl = this.props.fms.getPrimaryFlightPlan();
      const active = fpl?.activeLateralLeg ?? -1;

      let seed = 0;
      for (let i = 0; i < refs.length; i++) {
        const gi = refs[i].getOrDefault()!.globalLegIndex;
        if (gi > active) {
          seed = i;
          break;
        }
      }

      this.procCursor = seed;
      this.procMode = 'approach';
    }

    // clamp to list size (in case items changed)
    if (this.procCursor >= refs.length) {
      this.procCursor = 0;
    }

    const block = refs[this.procCursor].getOrDefault();
    if (!block) {
      this.procCursor = (this.procCursor + 1) % refs.length;
      return;
    }

    const listItem = this.listManager.legDataMap.get(block.legData);
    listItem && this.flightPlanList.getOrDefault()?.scrollToItem(listItem, 'top', true, false);

    if (this.procMode === 'approach') {
      block.onEditApproach();
      this.procMode = 'arrival';
    } else {
      block.onEditArrival();
      this.procMode = 'approach';
      this.procCursor = (this.procCursor + 1) % refs.length;
    }
  }

  private static fullScreenMenuPosition: Position = {
    xCoord: 175,
    yCoord: 15,
  };

  private static sidebarMenuPosition: Position = {
    xCoord: 295,
    yCoord: 5,
  };

  /**
   * Gets the position menus should be spawned.
   * @returns The menu position.
   */
  private getMenuPosition(): Position {
    return this.props.isInSidebarMode.get() ? FplContainer.sidebarMenuPosition : FplContainer.fullScreenMenuPosition;
  }

  /**
   * Handles request for waypoint insertion.
   * @param legData The leg to insert after.
   * @param anchorEl Anchor element for menu positioning.
   */
  private onWaypointInsertRequested(legData: FlightPlanLegData | null, anchorEl: HTMLElement): void {
    this.openWaypointKeyboard(
      '',
      (ident) => {
        void this.insertWaypointByIdentWithPicker(
          ident,
          legData,
          'after'
        );
      },
      anchorEl
    );
  }

  /**
   * Handles the user's request to insert a waypoint relative to a specific leg.
   * This uses the leg before the chosen gap as the airway/anchor reference
   * and always inserts after that anchor leg in the FPL.
   *
   * @param anchorEl The element near which the menu should appear.
   * @param legData  The leg at the UI row the user interacted with, or null if the plan is empty.
   * @param showKeyboard Whether the keyboard should open immediately.
   */
  private handleInsertMenuRequested = async (
    anchorEl: HTMLElement,
    legData: FlightPlanLegData | null,
    showKeyboard: boolean,
  ): Promise<void> => {
    this.props.fplSelectionMenuController.clearMenu();

    // generic/unlabelled group options
    const addOrigin = legData === null;
    const addWaypoint = !legData || FmsUtils.canInsertWaypointAfterLeg(legData.plan, legData.globalLegIndex.get());
    const addHold = legData && FmsUtils.canInsertHoldAfterLeg(legData.plan, legData.globalLegIndex.get());

    // airport procedures
    const addDepartures = legData && this.store.originDepartures.get().length > 0 &&
      (legData.segment.segmentType === FlightPlanSegmentType.Departure || legData.segment.segmentType === FlightPlanSegmentType.Origin);
    const addArrivals = legData && this.store.destinationArrivals.get().length > 0 && (
      legData.segment.segmentType === FlightPlanSegmentType.Arrival || legData.segment.segmentType === FlightPlanSegmentType.Approach ||
      legData.segment.segmentType === FlightPlanSegmentType.Destination || legData.segment.segmentType === FlightPlanSegmentType.MissedApproach
    );
    const addApproaches = legData && this.store.destinationApproaches.get().length > 0 && (
      legData.segment.segmentType === FlightPlanSegmentType.Arrival || legData.segment.segmentType === FlightPlanSegmentType.Approach ||
      legData.segment.segmentType === FlightPlanSegmentType.Destination || legData.segment.segmentType === FlightPlanSegmentType.MissedApproach
    );

    // airways
    let legIntersection: IntersectionFacility | null = null;
    let legRoutes: readonly AirwaySegment[] = [];
    if (legData && FmsUtils.canInsertAirwayAfterLeg(legData.plan, legData.globalLegIndex.get())) {
      legIntersection = await this.getAirwayEntryIntersection(legData);
      if (legIntersection) {
        legRoutes = legIntersection.routes;
      }
    }
    const addAirways = legIntersection ? legIntersection.routes.length > 0 : false;

    // if insert waypoint is the only option, the IFD just shortcuts straight to that
    if (!addOrigin && addWaypoint && !addHold && !addDepartures && !addArrivals && !addApproaches && !addAirways) {
      this.displayInsertWptBlock(legData, showKeyboard);
      return;
    }

    // Group 1: generic insert actions
    if (addOrigin || addWaypoint || addHold) {
      const genericGroupIndex = this.props.fplSelectionMenuController.addGroup();
      if (addOrigin) {
        // Insert Origin
        this.props.fplSelectionMenuController.addOption(genericGroupIndex, {
          name: 'Origin',
          confirmHandler: () => {
            this.props.fplSelectionMenuController.hide();
            this.openWaypointKeyboard(
              '',
              this.setOriginFromIdent,
              anchorEl
            );
          }
        });
      }

      // Insert Waypoint
      if (addWaypoint) {
        this.props.fplSelectionMenuController.addOption(genericGroupIndex, {
          name: 'Waypoint',
          confirmHandler: () => {
            this.props.fplSelectionMenuController.hide();
            this.displayInsertWptBlock(legData, showKeyboard);
          },
        });
      }

      // Insert Hold (if allowed)
      if (addHold) {
        this.props.fplSelectionMenuController.addOption(genericGroupIndex, {
          name: `Hold at ${legData.leg.leg.fixIcaoStruct.ident}`,
          confirmHandler: () => this.createHold(legData),
        });
      }
    }

    if (addDepartures) {
      this.props.fplSelectionMenuController.addDepartureGroup();
    }

    if (addArrivals) {
      this.props.fplSelectionMenuController.addArrivalGroup();
    }
    if (addApproaches) {
      this.props.fplSelectionMenuController.addApproachGroup();
    }

    // Group 2: airways (if any)
    if (addAirways && legIntersection && legData) {
      const airwayNames: string[] = [];

      for (const r of legIntersection.routes) {
        if (r && typeof r.name === 'string') {
          airwayNames.push(r.name);
        }
      }

      const uniqueSortedAirwayNames = Array.from(new Set(airwayNames)).sort((a, b) => a.localeCompare(b));

      if (uniqueSortedAirwayNames.length > 0) {
        this.props.fplSelectionMenuController.addGroup('Airways', uniqueSortedAirwayNames.map((name) => ({
          name,
          confirmHandler: () => {
            this.openAirwayExitList(
              legData,
              'after',
              legIntersection,
              name
            );
          },
          selectHandler: async (selected: boolean) => {
            if (selected) {
              const airway = await this.props.facLoader.getAirway(name, 0, legIntersection.icaoStruct);
              if (airway.waypoints.length > 1) {
                this.props.fms.buildAirwayPreviewSegment(airway, airway.waypoints[0], airway.waypoints[airway.waypoints.length - 1]);
              }
            } else {
              this.props.fms.clearProcedurePreview();
            }
          },
        })));
      }
    }

    this.props.fplSelectionMenuController.groups.getArray().length > 0 && this.props.fplSelectionMenuController.showAt(this.getMenuPosition());
  };


  /**
   * Resolves the facility for the waypoint immediately *before* the insert location,
   * or `null` if none exist.
   *
   * @param legData Anchor leg for the insert.
   * @returns The previous waypoint facility, or null if not available.
   */
  private async getPreviousWaypointFacility(
    legData: FlightPlanLegData,
  ): Promise<Facility | null> {
    const plan = this.props.fms.getFlightPlan(this.props.planIndex);
    if (!plan) {
      return null;
    }
    const prevLeg = plan.getPrevLeg(legData.segment.segmentIndex, legData.segmentLegIndex.get());

    if (!prevLeg || !ICAO.isValueFacility(prevLeg.leg.fixIcaoStruct)) {
      return null;
    }

    const type = ICAO.getFacilityTypeFromValue(prevLeg.leg.fixIcaoStruct);
    return this.props.facLoader.tryGetFacility(type, prevLeg.leg.fixIcaoStruct);

  }

  /**
   * Loads facilities matching `ident`, invokes the shared duplicate picker to resolve
   * any ambiguities (with distance labels relative to the previous waypoint when available),
   * and inserts the chosen facility before/after the anchor leg.
   *
   * @param ident The user-entered ident (case-insensitive).
   * @param legData Anchor leg for the insert, or null if inserting in an empty plan.
   * @param where Insert position relative to the anchor leg ('before' or 'after').
   * @param legToDelete optional leg to remove afterwards
   * @returns A promise that resolves when the insertion step is complete (or skipped).
   */
  private async insertWaypointByIdentWithPicker(
    ident: string,
    legData: FlightPlanLegData | null,
    where: 'before' | 'after',
    legToDelete?: FlightPlanLegData
  ): Promise<void> {
    const trimmed = ident.trim().toUpperCase();
    if (!trimmed) {
      return;
    }

    const deleteLeg = (): void => {
      if (legToDelete) {
        // FIXME this could be a little dangerous. Best to let the FMS handle fpl edits.
        const plan = this.props.fms.getFlightPlan();
        plan.removeLeg(legToDelete.segment.segmentIndex, legToDelete.segmentLegIndex.get());
      }
    };

    // const candidates: readonly Facility[] =
    //   await FacilitySearchUtils.getSearchUtils(this.bus).loadFacilities(
    //     trimmed,
    //     FacilitySearchType.All,
    //     true
    //   );

    const candidates = await this.findFacilitiesByIdentGlobal(trimmed);

    if (!candidates?.length) {
      console.warn(`[FPL] No facilities found for ident "${trimmed}"`);
      return;
    }

    const prevFac = legData ? await this.getPreviousWaypointFacility(legData) : null;
    // TODO PPOS if no ref facility
    const ref = prevFac ? new GeoPoint(prevFac.lat, prevFac.lon) : undefined;

    const picked = await this.props.fplSelectionMenuController.showFacilityDuplicatePicker(
      candidates,
      ref,
      'Select Waypoint',
      this.getMenuPosition(),
    );

    if (!picked) {
      // User cancelled or nothing selected.
      return;
    }

    await this.insertPickedFacility(picked, legData, where);

    deleteLeg();
  }

  private displayInsertWptBlock = async (legData: FlightPlanLegData | null, showKeyboard: boolean): Promise<void> => {

    const suggestions = this.props.nearestContext.waypointsWithin40Nm.getArray();
    let nearestSuggestion: Facility | null = null;

    const plan = this.props.fms.getFlightPlan(this.props.planIndex);

    if (plan) {
      // Find first suggestion that does NOT belong to the current FPL.
      for (const suggestion of suggestions) {
        let existsInPlan = false;

        for (let gi = 0; gi < plan.length; gi++) {
          const legDef = plan.tryGetLeg(gi);
          if (!legDef) {
            continue;
          }

          const fix = legDef.leg.fixIcaoStruct;

          if (ICAO.isValueFacility(fix) && ICAO.valueEquals(fix, suggestion.icaoStruct)) {
            existsInPlan = true;
            break;
          }
        }

        if (!existsInPlan) {
          nearestSuggestion = suggestion;
          break;
        }
      }
    }

    // Fallback: if every suggestion is already in the FPL, keep using the first one.
    if (!nearestSuggestion && suggestions.length > 0) {
      nearestSuggestion = suggestions[0];
    }

    this.insertWptInitialFacility.set(nearestSuggestion ?? null);

    this.insertWptAnchorLegData = legData;
    // scroll anchor leg to the top if we have one
    if (legData) {
      const anchorListData = this.listManager.legDataMap.get(legData);
      if (anchorListData) {
        this.flightPlanList.instance.scrollToItem(anchorListData, 0, true);
      }
    }

    this.listManager.showTempWaypointAfterLeg(
      legData,
      showKeyboard,
      legData?.leg.calculated?.endLat ?? this.store.aircraftPosition.get()?.lat,
      legData?.leg.calculated?.endLon ?? this.store.aircraftPosition.get()?.long,
    );
    this.tmpWptSelectionActive.set(true);
  };

  /**
   * Globally resolves facilities whose ident exactly matches the given string.
   * This mirrors the ident-based search used by InsertWptController so that
   * keyboard-entered idents behave consistently (no distance / region limits).
   *
   * @param ident The user-entered ident (case-insensitive).
   * @returns A list of matching facilities (may contain multiple for duplicates).
   */
  private async findFacilitiesByIdentGlobal(ident: string): Promise<readonly Facility[]> {
    const trimmed = (ident ?? '').trim().toUpperCase();
    if (!trimmed) {
      return [];
    }

    // Global search by ident (same as InsertWptController).
    const icaos = await this.props.facLoader.searchByIdentWithIcaoStructs(
      FacilitySearchType.All,
      trimmed,
      40
    );

    // Filter duplicates in the same way we do elsewhere.
    const filteredIcaos = IntersectionFacilityUtils.filterDuplicates(icaos);

    const facilities: Facility[] = [];
    for (let i = 0; i < filteredIcaos.length; i++) {
      const icao = filteredIcaos[i];

      // For FPL insertion we only care about exact ident matches.
      if (icao.ident !== trimmed) {
        continue;
      }

      const fac = await this.props.facLoader.tryGetFacility(
        ICAO.getFacilityTypeFromValue(icao),
        icao
      );

      if (fac) {
        facilities.push(fac);
      }
    }

    return facilities;
  }

  /**
   * Sets the origin airport given an ident, if that airport exists.
   * @param ident The airport ident.
   */
  private setOriginFromIdent = async (ident: string): Promise<void> => {
    const icao = ICAO.value('A', '', '', ident.trim().toUpperCase());

    const facility = await this.props.facLoader.tryGetFacility(FacilityType.Airport, icao);
    if (!facility) {
      console.warn(`[FPL] No facilities found for ident "${icao.ident}"`);
      // FIXME show green popup
      return;
    }

    await this.props.fms.setOrigin(facility);
  };

  /**
   * Modify an existing hold leg
   * @param holdLegDefinition modified hold fields
   * @param legData @inheritDoc
   * @param nextFieldIndex The next field to select on the new hold leg
   */
  private modifyHold(holdLegDefinition: Partial<FlightPlanLeg>, legData: FlightPlanLegData, nextFieldIndex: number): void {
    const plan = this.props.fms.getFlightPlan();
    const segmentIndex = legData.segment.segmentIndex;
    const segLegIndex = legData.segmentLegIndex.get();

    // Bail if this leg no longer exists (deleted by sync/other instrument)
    const current = plan.tryGetLeg(segmentIndex, segLegIndex);
    if (!current || current !== legData.leg) {
      return;
    }

    const leg: FlightPlanLeg = FlightPlan.createLeg({ ...legData.leg.leg, ...holdLegDefinition });
    plan.removeLeg(segmentIndex, segLegIndex, true);
    this.holdBlockRefMap.delete(legData);
    const newLeg = plan.addLeg(segmentIndex, leg, segLegIndex, 0, true);
    this.handleWaypointInserted(newLeg, true, false);

    const newLegData = this.store.legMap.get(newLeg);

    if (newLegData) {
      const blockRef = this.holdBlockRefMap.get(newLegData);
      blockRef?.instance?.setSelectedFieldIndex(nextFieldIndex);
    }
  }

  /**
   * Creates and inserts a hold into the pending plan
   * @param anchorLegData The anchor leg for the hold
   */
  private createHold(anchorLegData: FlightPlanLegData): void {
    this.props.fplSelectionMenuController.hide();

    const holdLeg = FlightPlan.createLeg({
      fixIcaoStruct: anchorLegData.leg.leg.fixIcaoStruct,
      type: LegType.HM,
      course: anchorLegData.leg.calculated?.courseMagVar ?? undefined,
      turnDirection: LegTurnDirection.Right,
      distance: 1,
      distanceMinutes: true,
    });

    this.props.fms.insertHold(FlightPlanIndex.Active, anchorLegData.segment.segmentIndex, anchorLegData.segmentLegIndex.get(), holdLeg);
  }

  /**
   * Remove and replace leg fix
   * @param ident facility ident
   * @param legData {@FlightPlanLegData}
   */
  public async replaceLegFix(ident: string, legData: FlightPlanLegData): Promise<void> {
    if (!ident) {
      return;
    }
    await this.insertWaypointByIdentWithPicker(ident, legData, 'after', legData);
  }

  /**
   * Inserts a selected facility into the flight plan after the duplicate menu resolves.
   *
   * @param pick The facility chosen by the user.
   * @param legData Anchor leg for the insert, or null if inserting in an empty plan.
   * @param where Insert position relative to the anchor leg.
   * @param reFocus Whether to move the cursor & scroll to the inserted leg.
   * @returns The new leg definition, or null if insertion failed.
   */
  private async insertPickedFacility(
    pick: Facility,
    legData: FlightPlanLegData | null,
    where: 'before' | 'after',
    reFocus: boolean = true
  ): Promise<LegDefinition | null> {
    const segmentIndex = legData?.segment.segmentIndex ?? this.props.fms.findFirstEnrouteSegmentIndex(this.props.fms.getPrimaryFlightPlan());
    const legIndexInSegment = legData?.segmentLegIndex.get() ?? undefined;
    const insertLegIndex = legIndexInSegment !== undefined ? (where === 'before' ? legIndexInSegment : (legIndexInSegment + 1)) : undefined;

    const newLeg = await this.props.fms.insertEnrouteWaypointOrAirport(pick, segmentIndex, insertLegIndex);
    if (!newLeg) {
      console.warn('[FPL] FMS.insertWaypoint returned undefined');
      return null;
    }

    if (reFocus) {
      this.handleWaypointInserted(newLeg);
    }

    this.props.fplSelectionMenuController.hide();

    return newLeg;
  }

  /**
   * Opens the shared IFD text keyboard for number entry (via IfdContainer).
   * Uses the existing "text_edit_row_keyboard_open" event. We buffer value in
   * onValueChanged and commit on close (Enter).
   *
   * @param smartPrefill - Initial value.
   * @param keyboardInputType - The keyboard input type
   * @param onAccept - Called with final value after Enter.
   * @param anchorEl - Optional element for anchor purposes (passed through as rowRef).
   */
  private openNumberKeyboard(
    smartPrefill: string,
    keyboardInputType: KeyboardInputType,
    onAccept: (ident: string) => void,
    anchorEl?: HTMLElement
  ): void {
    const pub = this.bus.getPublisher<IfdKeyboardControlEvents>();

    let pendingValue = smartPrefill.toUpperCase();

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: keyboardInputType,
      disableModeSwitch: true,
      initialShowNumpad: true,
      initialValue: pendingValue,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      onValueChanged: (value: string) => {
        // Called on every keystroke; just buffer the latest.
        pendingValue = value.toUpperCase();
      },
      onEnter: () => {
        // IfdContainer closes the keyboard on Enter -> commit here.
        const ident = pendingValue.trim();
        if (ident) {
          onAccept(ident);
        }
      },
      rowRef: anchorEl ?? null
    };

    pub.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /**
   * Opens the shared IFD text keyboard for waypoint ident entry (via IfdContainer).
   * Uses the existing "text_edit_row_keyboard_open" event. We buffer value in
   * onValueChanged and commit on close (Enter).
   *
   * @param smartPrefill - Initial ident.
   * @param onAccept - Called with final ident (uppercased) after Enter.
   * @param anchorEl - Optional element for anchor purposes (passed through as rowRef).
   */
  private openWaypointKeyboard(
    smartPrefill: string,
    onAccept: (ident: string) => void,
    anchorEl?: HTMLElement
  ): void {
    const pub = this.bus.getPublisher<IfdKeyboardControlEvents>();

    let pendingValue = smartPrefill.toUpperCase();

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: KeyboardInputType.FreeText,
      disableModeSwitch: false,
      initialShowNumpad: false,
      initialValue: pendingValue,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      onValueChanged: (value: string) => {
        // Called on every keystroke; just buffer the latest.
        pendingValue = value.toUpperCase();
      },
      onEnter: () => {
        // IfdContainer closes the keyboard on Enter -> commit here.
        const ident = pendingValue.trim();
        if (ident) {
          onAccept(ident);
        }
      },
      rowRef: anchorEl ?? null
    };

    pub.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /** Scrolls to the active leg because the active leg changed. */
  private autoScrollToActiveLeg(): void {
    const toLeg = this.store.toLeg.get();
    if (!toLeg) { return; }
    if (toLeg === this.lastActiveLegAutoScrolledTo.get()) { return; }
    this.lastActiveLegAutoScrolledTo.set(toLeg);
    const toLegListData = this.listManager.legDataMap.get(toLeg);
    if (!toLegListData) { return; }
    // Don't scroll if a slideout menu is open
    if (this.selectedListData.get() !== null) { return; }
    // We still want to do the above stuff, mainly setting the last active leg auto scrolled to
    // But don't want to actually scroll when paused
    if (this.isPaused) { return; }
    this.flightPlanList.instance.scrollToItem(toLegListData, 2, true, true);
  }

  /** @inheritdoc */
  public onOpen(wasPreviouslyOpened: boolean): void {
    this.isPageOpen.set(true);
    this.showOnMapSub?.resume(true);
    this.waypointArrowUpdateClockSub?.resume(true);
    this.lastActiveLegAutoScrolledTo.set(this.store.toLeg.get());
    this.toLegScrollSub.resume();

    // Scroll to active leg when page is opened
    if (!wasPreviouslyOpened) {
      const toLeg = this.store.toLeg.get();
      if (!toLeg) { return; }
      const toLegListData = this.listManager.legDataMap.get(toLeg);
      if (!toLegListData) { return; }
      this.flightPlanList.instance.scrollToItem(toLegListData, 2, false);
    }
  }

  /**
   * Tries to delete the currently selected leg in the flight plan.
   * @returns true if leg deletion suceeded.
   */
  private handleDeleteSelectedLeg = async (): Promise<boolean> => {
    const listIndex = this.flightPlanList.instance.activeIndex.get();
    const item = this.flightPlanList.instance.activeItem.get();
    if (item && item.type === 'leg') {
      // First we have to confirm deleting any active procedures or legs
      let confirmText: string | undefined;
      if (item.isOriginLeg) {
        if (this.store.activeLegSegmentType.get() === FlightPlanSegmentType.Departure) {
          confirmText = 'Delete Active Departure';
        }
      } else if (item.isDestinationLeg) {
        const activeSegmentType = this.store.activeLegSegmentType.get();
        if (activeSegmentType === FlightPlanSegmentType.Arrival) {
          confirmText = 'Delete Active Arrival';
        }
        if (activeSegmentType === FlightPlanSegmentType.Approach) {
          confirmText = 'Delete Active Approach';
        }
      } else if (item.legData.isActiveLeg.get() && !item.legData.isDiscontinuity) {
        confirmText = `Delete ${item.legData.leg.name ?? 'Waypoint'}`;
      }

      if (confirmText !== undefined) {
        try {
          await this.viewService.requestConfirmation(confirmText, 'mint', 155, undefined, true);
        } catch {
          return false;
        }
      }

      // Now delete
      const segIndex = item.legData.segment.segmentIndex;
      const segLegIndex = item.legData.segmentLegIndex.get();

      const success = this.props.fms.tryDeleteSelectedLeg(segIndex, segLegIndex);

      if (success) {
        this.flightPlanList.instance.focusIndex(Math.max(0, listIndex - 1));
      }

      return success;
    }

    return false;
  };

  /** @inheritdoc */
  public override resume(): void {
    this.isPaused = false;
    super.resume();
    this.selectedListDataSub?.resume(true);
  }

  /** @inheritdoc */
  public override pause(): void {
    super.pause();
    this.isPaused = true;
    this.selectedListDataSub?.pause();
    this.controlPublisher.pub('fms_page_fpl_selected_item', undefined, false, true);
  }

  /** @inheritdoc */
  public onClose(): void {
    // TODO There's no equivalent for this in LifecylceComponent
    this.isPageOpen.set(false);
    // this.showOnMap.set(false);
    this.showOnMapSub?.pause();
    this.waypointArrowUpdateClockSub?.pause();
    this.toLegScrollSub.pause();

    this.selectedListData.set(undefined);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    // Insert Wpt exclusive mode: let the special block own the right knob.
    if (this.isInsertWptBlockDisplayed.get()) {
      const insertBlock = this.insertWptBlockRef.getOrDefault();

      if (insertBlock && insertBlock.onInteractionEvent(event)) {
        return true;
      }
      // While Insert Wpt is active, don’t let the list move selection away
      // from the temp row via knob events.
      return true;
    }
    if (event === IfdInteractionEvent.CLR && this.selectedListData.get()?.type === 'leg' && !this.spaceAfterItemSelected.get()) {
      this.handleDeleteSelectedLeg();
      return true;
    }

    if (this.cursorBeforeListRef.getOrDefault()?.onInteractionEvent(event)) {
      return true;
    }

    return this.flightPlanList.instance.onInteractionEvent(event);
  }

  /**
   * Handles a new waypoint being inserted.
   * @param newLeg The new leg defintion.
   * @param reFocus Should focus and scroll after
   * @param focusOnSpace Wether it should focus on the space after
   */
  private handleWaypointInserted(newLeg: LegDefinition, reFocus: boolean = true, focusOnSpace: boolean = true): void {
    const newLegData = this.store.legMap.get(newLeg);
    if (!newLegData) { return; }
    const newLegListData = this.listManager.legDataMap.get(newLegData);
    if (!newLegListData) { return; }
    if (reFocus) {
      this.flightPlanList.instance.focusItem(newLegListData, undefined, focusOnSpace);
      this.flightPlanList.instance.scrollToItem(newLegListData, 2, true);
    }
  }

  /** Updates which waypoint arrow buttons are enabled. */
  private updateWaypointArrowButtons(): void {
    this.canScrollUpWaypoint.set(!!this.getNextWaypoint(-1));
    this.canScrollDownWaypoint.set(!!this.getNextWaypoint(1));
  }

  /**
   * Gets the next waypoint in the given direction, or undefined if no more waypoints in that direction.
   * @param direction The direction to look in.
   * @returns the next waypoint or undefined if no more waypoints in that direction.
   */
  private getNextWaypoint(direction: 1 | -1): FlightPlanLegListData | undefined {
    const selectedWaypoint = this.selectedListData.get();
    if (!selectedWaypoint) { return undefined; }

    const itemArray = this.listManager.dataList.getArray();
    const selectedIndex = itemArray.indexOf(selectedWaypoint);
    if (selectedIndex === -1) { return; }

    let newSelection: FlightPlanLegListData | undefined;

    if (direction === 1) {
      for (let i = selectedIndex + 1; i < itemArray.length; i++) {
        const item = itemArray[i];
        if (item.type === 'leg' && item.isVisible.get()) {
          newSelection = item;
          break;
        }
      }
    } else {
      for (let i = selectedIndex - 1; i >= 0; i--) {
        const item = itemArray[i];
        if (item.type === 'leg' && item.isVisible.get()) {
          newSelection = item;
          break;
        }
      }
    }

    return newSelection;
  }

  /**
   * Sends flight plan focus data to the display pane controlled by this page.
   * @param data The data to send.
   */
  protected sendFlightPlanFocusData(data: NavigationMapPaneFlightPlanFocusData): void {
    // this.publisher.pub('display_pane_view_event', {
    //   displayPaneIndex: this.displayPaneIndex,
    //   eventType: 'display_pane_nav_map_fpl_focus_set',
    //   eventData: data
    // }, true, false);
  }

  /**
   * Returns the intersection facility at the insert anchor,
   * or null if it is not an airway-capable fix (i.e., no routes).
   *
   * @param legData The anchor leg data.
   * @returns The airway intersection facility, or null if not applicable.
   */
  private async getAirwayEntryIntersection(
    legData: FlightPlanLegData
  ): Promise<IntersectionFacility | null> {
    const plan = this.props.fms.getFlightPlan(this.props.planIndex);
    if (!plan) {
      return null;
    }

    const leg = legData.leg;
    const icao = leg.leg.fixIcaoStruct;
    const facType = ICAO.getFacilityTypeFromValue(icao);
    if (facType !== FacilityType.Intersection) {
      return null;
    }

    const fac = await this.props.facLoader.tryGetFacility(
      FacilityType.Intersection,
      icao
    );

    const hasRoutes =
      !!fac && Array.isArray(fac.routes);

    return hasRoutes ? fac : null;
  }

  /**
   * After choosing an airway, show the full ordered list of waypoints for that airway.
   * The entry fix is highlighted. Selecting any *other* fix inserts the segment from entry to selection.
   * @param legData Anchor leg for the insert.
   * @param where Whether to insert before or after the anchor leg.
   * @param entry The airway entry intersection.
   * @param airwayName The airway name.
   */
  private async openAirwayExitList(
    legData: FlightPlanLegData,
    where: 'before' | 'after',
    entry: IntersectionFacility,
    airwayName: string
  ): Promise<void> {
    const airway = await this.props.facLoader.getAirway(airwayName, 0, entry.icaoStruct);
    const wpts = airway.waypoints;

    const entryIdx = wpts.findIndex(w => ICAO.valueEquals(w.icaoStruct, entry.icaoStruct));
    if (entryIdx < 0) {
      this.props.fplSelectionMenuController.hide();
      return;
    }

    // Full, ordered list of waypoints (including the entry).
    const labels = wpts.map(w => w.icaoStruct.ident);

    // Corner case: single-point airway (unlikely), just show a disabled message.
    if (labels.length <= 1) {
      this.props.fplSelectionMenuController.clearMenu();
      this.props.fplSelectionMenuController.addGroup(airwayName, [{ name: '(no other waypoints)', confirmHandler: () => this.props.fplSelectionMenuController.hide() }]);
      this.props.fplSelectionMenuController.showAt(this.getMenuPosition());
      return;
    }

    // Show full list, highlight the entry fix.
    const confirmAirway = (pickedIdx: number): void => {
      if (pickedIdx === entryIdx) {
        // If the user presses the already-highlighted entry, do nothing.
        return;
      }

      this.insertAirwaySegment(legData, airway, entryIdx, pickedIdx);
      this.props.fplSelectionMenuController.hide();
    };

    const selectAirway = (selected: boolean, optionIndex: number, _groupIndex: number, _name: string): void => {
      if (selected) {
        const entryFac = airway.waypoints[entryIdx];
        const pickedFac = airway.waypoints[optionIndex];
        this.props.fms.buildAirwayPreviewSegment(airway, entryFac, pickedFac);
      } else {
        this.props.fms.clearProcedurePreview();
      }
    };

    this.props.fplSelectionMenuController.clearMenu();
    this.props.fplSelectionMenuController.addGroup(airwayName, labels.map((name) => ({ name, confirmHandler: confirmAirway, selectHandler: selectAirway })));
    this.props.fplSelectionMenuController.showAt(this.getMenuPosition());
  }

  /**
   * Inserts all intermediate waypoints from the entry fix to the selected target fix,
   * walking the airway in the requested direction. Regardless of direction, all
   * inserted waypoints are placed **after** the selected waypoint in the flight plan.
   *
   * @param legData   Anchor leg for the insert.
   * @param airway The airway data.
   * @param entryIdx  Index of the entry fix within `wpts`.
   * @param exitIdx   Index of the chosen target fix within `wpts`.
   */
  private insertAirwaySegment(
    legData: FlightPlanLegData,
    airway: AirwayData,
    entryIdx: number,
    exitIdx: number,
  ): void {
    const segmentIndex = legData.segment.segmentIndex;

    // Always insert after the selected waypoint in the FPL, regardless of direction.
    const anchorLegIdx = legData.segmentLegIndex.get();
    const insertLegIndex = anchorLegIdx + 1;

    const insertedSegmentIdx = this.props.fms.insertAirwaySegment(airway, airway.waypoints[entryIdx], airway.waypoints[exitIdx], segmentIndex, insertLegIndex);

    // Move cursor to the last inserted fix (if any).
    if (insertedSegmentIdx >= 0) {
      const lastInsertedIdent = airway.waypoints[exitIdx].icaoStruct.ident;

      const arr = this.listManager.dataList.getArray();
      const lastIdx = arr.findIndex(item =>
        item.type === 'leg'
        && item.legData.leg.leg.fixIcaoStruct.ident === lastInsertedIdent
        && item.legData.segmentData?.segment.segmentIndex === segmentIndex
      );
      if (lastIdx >= 0) {
        this.flightPlanList.instance.focusIndex(lastIdx);
      }
    }
  }

  /**
   * Returns an array of dest block live instances.
   * @returns DestinationBlock refs in current UI order.
   */
  private getDestinationRefsInUiOrder(): NodeReference<DestinationBlock>[] {
    const arr = this.listManager.dataList.getArray();
    const ordered: NodeReference<DestinationBlock>[] = [];

    for (const item of arr) {
      if (item.type === 'leg' && item.isDestinationLeg) {
        const ref = this.destinationRefMap.get(item.legData);
        if (ref?.getOrDefault()) {
          ordered.push(ref);
        }
      }
    }
    return ordered;
  }

  /** Remove map entries for legs that no longer exist or components that unmounted. */
  private pruneDestinationRefMap(): void {
    const stillHere = new Set<FlightPlanLegData>();
    for (const item of this.listManager.dataList.getArray()) {
      if (item.type === 'leg' && item.isDestinationLeg) {
        stillHere.add(item.legData);
      }
    }
    for (const [legData, ref] of this.destinationRefMap) {
      if (!stillHere.has(legData) || !ref.getOrDefault()) {
        this.destinationRefMap.delete(legData);
      }
    }
  }

  /**
   * Tries to replace an airport if the given ident is valid.
   * @param ident The new airport ident.
   * @param type Whether to replace the origin or destination.
   */
  private async tryReplaceAirport(ident: string, type: 'origin' | 'destination'): Promise<void> {
    if (ident.length > 4 || ident.length < 3) {
      // should never get here as input box is not supposed to allow invalid airports
      return;
    }

    const facility = await this.props.facLoader.tryGetFacility(FacilityType.Airport, ICAO.value('A', '', '', ident));
    if (!facility) {
      // should never get here as input box is not supposed to allow invalid airports
      return;
    }

    if (type === 'origin') {
      if (this.store.activeLegSegmentType.get() === FlightPlanSegmentType.Departure) {
        try {
          await this.viewService.requestConfirmation('Delete Active Departure', 'mint', 155, undefined, true);
        } catch {
          return;
        }
      }
      await this.props.fms.setOrigin(facility);
    } else {
      const activeSegmentType = this.store.activeLegSegmentType.get();
      if (activeSegmentType === FlightPlanSegmentType.Arrival) {
        try {
          await this.viewService.requestConfirmation('Delete Active Arrival', 'mint', 155, undefined, true);
        } catch {
          return;
        }
      }
      if (activeSegmentType === FlightPlanSegmentType.Approach) {
        try {
          await this.viewService.requestConfirmation('Delete Active Approach', 'mint', 155, undefined, true);
        } catch {
          return;
        }
      }
      await this.props.fms.setDestination(facility);
    }
  }

  /**
   * Scrolls a list item into view at the closest position if it is not already in view.
   * @param listItem The list item to show.
   */
  private scrollIntoView(listItem: FlightPlanListData): void {
    this.flightPlanList.getOrDefault()?.scrollToItem(listItem, 'closest', false, true);
  }

  private scrollOriginIntoView = (): void => {
    const origin = this.listManager.dataList.getArray().find((v) => v.type === 'leg' && v.isOriginLeg);
    if (origin) {
      this.scrollIntoView(origin);
    }
  };

  private scrollDestinationIntoView = (): void => {
    const destination = this.listManager.dataList.getArray().find((v) => v.type === 'leg' && v.isDestinationLeg);
    if (destination) {
      this.scrollIntoView(destination);
    }
  };

  /**
   * Renders a flight plan list item.
   * @param listItem The list item to render.
   * @param index The list item index
   * @param focus A function which focuses the list item.
   * @returns The rendered list item.
   */
  private readonly renderItem = (listItem: FlightPlanListData, index: number, focus: () => void): VNode => {
    switch (listItem.type) {
      case 'temporary_wpt':
        this.isInsertWptBlockDisplayed.set(true);
        return (
          <InsertWptBlock
            ref={this.insertWptBlockRef}
            data={listItem}
            focus={focus}
            bus={this.props.bus}
            facLoader={this.props.facLoader}
            fms={this.props.fms}
            ifdOptions={this.props.ifdOptions}
            menuController={this.props.fplSelectionMenuController}
            handleRemoveTempWpt={this.handleRemoveTempWpt.bind(this)}
            handleInsertWptEnter={this.handleInsertWptEnter.bind(this)}
            initialFacility={this.insertWptInitialFacility}
          />
        );
      case 'segment':
        return (
          <ZeroHeightBlock data={listItem} />
        );
      case 'leg': {
        const isDisco = FlightPlanUtils.isDiscontinuityLeg(listItem.legData.leg.leg.type);
        const isHold = FlightPlanUtils.isHoldLeg(listItem.legData.leg.leg.type);
        const isProcedureTurn = listItem.legData.leg.leg.type === LegType.PI;

        if (listItem.isOriginLeg) {
          return (
            <OriginBlock
              chartManager={this.props.chartManager}
              data={listItem}
              focus={focus}
              hiddenFieldRef={this.hiddenFieldRef}
              isInSidebarMode={this.props.isInSidebarMode}
              menuController={this.props.fplSelectionMenuController}
              onReplaceOrigin={(ident) => this.tryReplaceAirport(ident, 'origin')}
              openNumberKeyboard={this.openNumberKeyboard.bind(this)}
              openWaypointKeyboard={this.openWaypointKeyboard.bind(this)}
              store={this.props.store}
              textFieldRef={this.textFieldRef}
              viewService={this.viewService}
              scrollIntoView={() => this.scrollIntoView(listItem)}
            />
          );
        } else if (listItem.isDestinationLeg) {
          let ref = this.destinationRefMap.get(listItem.legData);
          if (!ref) {
            ref = FSComponent.createRef<DestinationBlock>();
            this.destinationRefMap.set(listItem.legData, ref);
          }
          return <DestinationBlock
            bus={this.props.bus}
            store={this.props.store}
            data={listItem}
            fms={this.props.fms}
            menuController={this.props.fplSelectionMenuController}
            focus={focus}
            ref={ref}
            openNumberKeyboard={this.openNumberKeyboard.bind(this)}
            openWaypointKeyboard={this.openWaypointKeyboard.bind(this)}
            textFieldRef={this.textFieldRef}
            hiddenFieldRef={this.hiddenFieldRef}
            chartManager={this.props.chartManager}
            viewService={this.viewService}
            onReplaceDestination={(ident) => this.tryReplaceAirport(ident, 'destination')}
            isInSidebarMode={this.props.isInSidebarMode}
            scrollIntoView={() => this.scrollIntoView(listItem)}
          />;
        } else if (isDisco) {
          return <DiscontinuityBlock
            data={listItem}
            focus={focus}
            isInSidebarMode={this.props.isInSidebarMode}
          />;
        } else if (isHold) {
          let ref = this.holdBlockRefMap.get(listItem.legData);
          if (!ref) {
            ref = FSComponent.createRef<HoldBlock>();
            this.holdBlockRefMap.set(listItem.legData, ref);
          }
          return <HoldBlock
            bus={this.bus}
            data={listItem}
            fms={this.props.fms}
            focus={focus}
            hiddenFieldRef={this.hiddenFieldRef}
            isInSidebarMode={this.props.isInSidebarMode}
            menuController={this.props.fplSelectionMenuController}
            modifyHold={this.modifyHold.bind(this)}
            openNumberKeyboard={this.openNumberKeyboard.bind(this)}
            openWaypointKeyboard={this.openWaypointKeyboard.bind(this)}
            ref={ref}
            store={this.props.store}
            textFieldRef={this.textFieldRef}
            scrollIntoView={() => this.scrollIntoView(listItem)}
          />;
        } else if (isProcedureTurn) {
          return <ProcedureTurnBlock
            bus={this.bus}
            data={listItem}
            focus={focus}
            fms={this.props.fms}
            hiddenFieldRef={this.hiddenFieldRef}
            isInSidebarMode={this.props.isInSidebarMode}
            menuController={this.props.fplSelectionMenuController}
            openNumberKeyboard={this.openNumberKeyboard.bind(this)}
            openWaypointKeyboard={this.openWaypointKeyboard.bind(this)}
            store={this.props.store}
            textFieldRef={this.textFieldRef}
            scrollIntoView={() => this.scrollIntoView(listItem)}
          />;
        } else {
          return <LegBlock
            bus={this.bus}
            data={listItem}
            fms={this.props.fms}
            focus={focus}
            hiddenFieldRef={this.hiddenFieldRef}
            isInSidebarMode={this.props.isInSidebarMode}
            menuController={this.props.fplSelectionMenuController}
            onReplaceFix={this.replaceLegFix.bind(this)}
            openNumberKeyboard={this.openNumberKeyboard.bind(this)}
            openWaypointKeyboard={this.openWaypointKeyboard.bind(this)}
            store={this.props.store}
            textFieldRef={this.textFieldRef}
            scrollIntoView={() => this.scrollIntoView(listItem)}
          />;
        }
      }
      default:
        console.error('unhandled list item type: ', (listItem as FlightPlanListData).type);
        return (
          <div style={`height: ${(listItem as FlightPlanListData).heightPx}px`} />
        );
    }
  };

  private canSelectItem = (item: FlightPlanListData | undefined): boolean => {
    // when dir to is active only valid dir to legs can be selected
    if (this.isDirectToOpen.get()) {
      return item?.type === 'leg' && FlightPlanUtils.isToFixLeg(item.legData.leg.leg.type);
    }
    // When Insert Wpt is exclusive, only the temp row can be selected.
    if (this.isInsertWptBlockDisplayed.get()) {
      return item?.type === 'temporary_wpt';
    }
    return item === undefined || item.type === 'leg' || item.type === 'temporary_wpt';
  };

  private canSelectSpace = (a: FlightPlanListData | undefined, b: FlightPlanListData | undefined): boolean => {
    // only legs can be selected when direct to is open
    if (this.isDirectToOpen.get()) {
      return false;
    }
    // No spaces at all while Insert Wpt is modal.
    if (this.isInsertWptBlockDisplayed.get()) {
      return false;
    }
    if (a === undefined && b === undefined) {
      // this means the plan is empty, and we only have a space to select
      return true;
    }
    if (a === undefined) {
      // This means the space is before the start of the plan
      // That is only valid when there's no origin airport.
      return b?.type === 'leg' && !b.isOriginLeg;
    }
    // the space after disconts is not selectable, and neither is the space between a leg to a hold and the hold itself
    return a.type === 'leg' && !a.legData.isDiscontinuity && (b?.type !== 'leg' || !b.isHoldLeg);
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'fpl-plan-container': true,
          'fpl-compact': this.props.store.viewMode.map(x => x === 'compact').withLifecycle(this.defaultLifecycle),
        }}
      >
        <div class="flight-plan-box">
          <IfdList<FlightPlanListData>
            ref={this.flightPlanList}
            class="flight-plan-list"
            bus={this.bus}
            canSelectItem={this.canSelectItem}
            canSelectSpace={this.canSelectSpace}
            renderSpace={(data, cursor) => {
              if (data.type === 'leg') {
                return (<FplCursor
                  ref={data.cursorAfterRef}
                  data={data}
                  cursor={cursor}
                  fms={this.props.fms}
                  store={this.props.store}
                  onInsertMenuRequested={this.handleInsertMenuRequested}
                />);
              } else {
                return null;
              }
            }}
            renderSpaceBeforeList={(cursor) => {
              return (<FplCursor
                ref={this.cursorBeforeListRef}
                cursor={cursor}
                fms={this.props.fms}
                store={this.props.store}
                onInsertMenuRequested={this.handleInsertMenuRequested}
              />);
            }}
            knobState={this.props.knobState}
            heightPx={425}
            maxOverscrollPx={5}
            listItemSpacingPx={this.listItemSpacingPx}
            keepSpaceBeforeFirstItem={true}
            keepSpaceAfterLastItem={true}
            // itemsPerPage={this.store.isDirectToRandomActiveWithHold.map(x => x === 'with-hold' ? 2 : x === 'no-hold' ? 3 : 5)}
            maxRenderedItemCount={20}
            data={this.listManager.dataList}
            renderItem={this.renderItem}
            // onTopVisibleIndexChanged={this.calcTopRow}
            staticTouchListChildren={(totalListLength: Subscribable<number>) => (
              <FplSegmentLabels
                ref={this.segmentLabels}
                store={this.store}
                flightPlanList={this.flightPlanList}
                flightPlanData={this.listManager.dataList}
              />
            )}
          />
        </div>
        <div class="hidden" ref={this.hiddenFieldRef}>
          <TextInputField
            bus={this.props.bus}
            ref={this.textFieldRef}
            facLoader={this.props.facLoader}
            fms={this.props.fms}
          /></div>
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    if (this.altitudeFieldSub) {
      this.altitudeFieldSub.destroy();
      this.altitudeFieldSub = undefined;
    }
    this.viewModeLsk3Pipe.destroy();
    super.destroy();
  }
}

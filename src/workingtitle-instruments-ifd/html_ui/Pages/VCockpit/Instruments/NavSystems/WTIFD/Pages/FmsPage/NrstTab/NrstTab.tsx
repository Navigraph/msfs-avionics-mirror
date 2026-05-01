import {
  AirportFacility, ArraySubject, DebounceTimer, EventBus, Facility, FacilityFrequency, FacilityFrequencyType, FacilityLoader, FacilityType, FlightPlanner,
  FSComponent, GeoPoint, ICAO, IcaoValue, IntersectionFacility, MagVar, MetarCloudLayer, MetarCloudLayerCoverage, MetarVisibilityUnits, NdbFacility,
  NearestContext, Subject, SubscribableArrayEventType, Subscription, UnitType, UserFacility, VNode, VorFacility
} from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../Charts/IfdChartsManager';
import { IfdList } from '../../../Components/List';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../../../Events/IfdTuningControlsManager';
import { FlightPlanStore } from '../../../FlightPlan';
import { Fms } from '../../../Fms';
import { IfdOptions } from '../../../IfdOptions';
import { LineSelectKeyButtonType } from '../../../LineSelectKeyButtons';
import { MapContainer } from '../../../Map/MapContainer';
import { MapDataProvider } from '../../../Providers/Map/MapDataProvider';
import { FullPageSidebar, FullPageSidebarMode } from '../../../Sidebar';
import { FmsPositionSystemEvents } from '../../../Systems/FmsPositionSystem';
import { TrafficSystem } from '../../../Systems/Traffic/TrafficSystem';
import { FacilityRow } from './Components/FacilityRow';
import { FacilityListData, IfdMetarCategory } from './Components/FacilityRowTypes';

import './NrstTab.css';

/** The properties for the {@link NrstTab} component. */
interface NrstTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** A facility loader */
  readonly facLoader: FacilityLoader;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** An instance of the traffic system. */
  readonly trafficSystem?: TrafficSystem;
  /** The instrument config (needed by MainMap). */
  readonly ifdOptions: IfdOptions;
  /** Charts manager */
  readonly chartsManager: IfdChartsManager;
  /** The FMS to use. */
  readonly fms: Fms;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
}

/** The categories of items available to be searched */
type NearestSearchCategories = 'Airports' | 'VORs' | 'NDBs' | 'Intersections' | 'User Wpts'

/** The NrstTab component. */
export class NrstTab extends TabContent<NrstTabProps> {
  private static readonly NEAREST_SEARCH_TYPES: NearestSearchCategories[] = ['Airports', 'VORs', 'NDBs', 'Intersections', 'User Wpts'];
  private static readonly AIRPORT_FREQUENCY_TYPE_PRIORITY = {
    [FacilityFrequencyType.Tower]: 15, // We want to prioritise in-air frequencies for display
    [FacilityFrequencyType.FSS]: 14,
    [FacilityFrequencyType.Unicom]: 13,
    [FacilityFrequencyType.CTAF]: 12,
    [FacilityFrequencyType.Multicom]: 11,
    [FacilityFrequencyType.Center]: 10,
    [FacilityFrequencyType.Approach]: 9,
    [FacilityFrequencyType.Departure]: 0,
    [FacilityFrequencyType.Ground]: 0,
    [FacilityFrequencyType.Clearance]: 0,
    [FacilityFrequencyType.CPT]: 0,
    [FacilityFrequencyType.GCO]: 0,
    [FacilityFrequencyType.ATIS]: 0,
    [FacilityFrequencyType.ASOS]: 0,
    [FacilityFrequencyType.AWOS]: 0,
    [FacilityFrequencyType.None]: 0,
  };

  public readonly title: string = 'Nearest';
  private readonly listRef = FSComponent.createRef<IfdList<FacilityListData>>();

  private readonly data = ArraySubject.create<FacilityListData>([]);

  private readonly ppos = new GeoPoint(0, 0);

  private readonly currentSearchType = Subject.create<NearestSearchCategories>('Airports');

  private readonly fullPageSidebarRef = FSComponent.createRef<FullPageSidebar>();

  private readonly isInSidebarMode = Subject.create(false);

  private readonly updateActiveLegDebounce = new DebounceTimer();
  private readonly updateAirportsDebounce = new DebounceTimer();

  private readonly scheduleActiveLegUpdate = (): void => this.updateActiveLegDebounce.schedule(this.updateActiveLegFromPlan.bind(this), 500);
  private readonly scheduleAirportUpdate = (): void => this.updateAirportsDebounce.schedule(this.updateAirportsFromPlan.bind(this), 500);

  private readonly airportSubs: Subscription[] = [];

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // TODO Context sensitive
    this._knobState.leftText.set('Scroll');
    this._knobState.rightText.set('Select');

    this._lskState.lsk2.type.set(LineSelectKeyButtonType.State);
    this._lskState.lsk2.label.set('Nearest');
    this.currentSearchType.sub((v) => this._lskState.lsk2.value.set(v), true);
    this._lskState.lsk2.isVisible.set(true);
    this._lskState.lsk2.onClick.set(() => this.onNrstButtonPress());

    this.bus.getSubscriber<FmsPositionSystemEvents>().on('fms_pos_position_1').atFrequency(1).handle((v) => {
      const ppos = this.ppos.set(v.lat, v.long);
      this.ppos.set(ppos);

      const items = this.data.getArray();
      for (const item of items) {
        item.facilityDistance.set(this.getDistanceOfFacilityFromPpos(item.facility, ppos));
        item.facilityHeading.set(this.getHeadingOfFacilityFromPpos(item.facility, ppos));
      }

      this.listRef.getOrDefault()?.updateOrder();
    });

    this.airportSubs.push(
      this.props.flightPlanner.onEvent('fplActiveLegChange').handle((data) => {
        if (data.planIndex === this.props.flightPlanner.activePlanIndex) {
          this.scheduleActiveLegUpdate();
        }
      }, true).withLifecycle(this.defaultLifecycle),

      this.props.flightPlanner.onEvent('fplOriginDestChanged').handle((data) => {
        if (data.planIndex === this.props.flightPlanner.activePlanIndex) {
          this.scheduleAirportUpdate();
        }
      }, true).withLifecycle(this.defaultLifecycle),

      this.props.flightPlanner.onEvent('fplSegmentChange').handle((data) => {
        if (data.planIndex === this.props.flightPlanner.activePlanIndex) {
          this.scheduleAirportUpdate();
        }
      }, true).withLifecycle(this.defaultLifecycle),

      this.props.flightPlanner.onEvent('fplLegChange').handle((data) => {
        if (data.planIndex === this.props.flightPlanner.activePlanIndex) {
          this.scheduleAirportUpdate();
        }
      }, true).withLifecycle(this.defaultLifecycle),
    );

    NearestContext.onInitialized((context) => {
      let currentSearchSub: Subscription;

      this.currentSearchType.sub((v) => {
        this.data.clear();
        currentSearchSub?.destroy();

        switch (v) {
          case 'Airports':
            currentSearchSub = context.airports.sub(async (_, type, item) => this.handleSearchSub<AirportFacility>(_, type, item), true);
            this.resumeAirportSubs();
            break;
          case 'VORs':
            currentSearchSub = context.vors.sub(async (_, type, item) => this.handleSearchSub<VorFacility>(_, type, item), true);
            this.pauseAirportSubs();
            break;
          case 'NDBs':
            currentSearchSub = context.ndbs.sub(async (_, type, item) => this.handleSearchSub<NdbFacility>(_, type, item), true);
            this.pauseAirportSubs();
            break;
          case 'Intersections':
            currentSearchSub = context.intersections.sub(async (_, type, item) => this.handleSearchSub<IntersectionFacility>(_, type, item), true);
            this.pauseAirportSubs();
            break;
          case 'User Wpts':
            currentSearchSub = context.usrs.sub(async (_, type, item) => this.handleSearchSub<UserFacility>(_, type, item), true);
            this.pauseAirportSubs();
            break;
        }
      }, true);
    });
  }

  /** Pauses subscriptions that are only needed for airports. */
  private pauseAirportSubs(): void {
    for (let i = 0; i < this.airportSubs.length; i++) {
      this.airportSubs[i].pause();
    }
  }

  /** Resumes subscriptions that are only needed for airports. */
  private resumeAirportSubs(): void {
    for (let i = 0; i < this.airportSubs.length; i++) {
      this.airportSubs[i].resume();
    }

    this.scheduleAirportUpdate();
    this.scheduleActiveLegUpdate();
  }

  /**
   * Updates the active leg from the active flight plan.
   */
  private updateActiveLegFromPlan(): void {
    const plan = this.props.flightPlanner.hasActiveFlightPlan() ? this.props.flightPlanner.getActiveFlightPlan() : undefined;

    const activeLeg = plan?.tryGetLeg(plan.activeLateralLeg);
    const activeFixIcao = activeLeg?.leg.fixIcaoStruct;

    for (const item of this.data.getArray()) {
      item.isActiveWaypoint.set(!!activeFixIcao && ICAO.valueEquals(activeFixIcao, item.facility.icaoStruct));
    }
  }

  /**
   * Updates the airports from the active flight plan.
   */
  private updateAirportsFromPlan(): void {
    if (!this.props.flightPlanner.hasActiveFlightPlan()) {
      return;
    }

    const plan = this.props.flightPlanner.hasActiveFlightPlan() ? this.props.flightPlanner.getActiveFlightPlan() : undefined;

    const airports: IcaoValue[] = [];

    if (plan) {
      if (plan.originAirportIcao) {
        airports.push(plan.originAirportIcao);
      }
      if (plan.destinationAirportIcao && (airports.length === 0 || !ICAO.valueEquals(airports[0], plan.destinationAirportIcao))) {
        airports.push(plan.destinationAirportIcao);
      }

      for (const leg of plan.legs()) {
        if (ICAO.isValueFacility(leg.leg.fixIcaoStruct, FacilityType.Airport) && !airports.find((v) => ICAO.valueEquals(v, leg.leg.fixIcaoStruct))) {
          airports.push(leg.leg.fixIcaoStruct);
        }
      }
    }

    for (const item of this.data.getArray()) {
      if (item.type === 'airport') {
        item.isFlightplanAirport.set(!!airports.find((v) => ICAO.valueEquals(v, item.facility.icaoStruct)));
      }
    }
  }

  /**
   * Handles a search subscription
   * @param _index Unused index
   * @param type The array event type
   * @param item The item(s) being added
   * @returns Nothing
   */
  private async handleSearchSub<T extends Facility>(_index: number, type: SubscribableArrayEventType, item: T | readonly T[] | undefined): Promise<void> {
    const items = item ? Array.isArray(item) ? item as T[] : [item as T] : [];

    switch (type) {
      case SubscribableArrayEventType.Added:
        return this.insertFacilities(items, this.ppos);
      case SubscribableArrayEventType.Removed: {
        return this.removeFacilities(items);
      }
    }
  }

  /**
   * Inserts facilities into the nearest page list
   * @param items The facilities to insert
   * @param ppos The current PPOS
   */
  private insertFacilities(items: readonly Facility[], ppos: GeoPoint): void {
    this.data.insertRange(this.data.length, items.map((v): FacilityListData => {
      const baseObject = {
        facilityDistance: Subject.create(ppos.isValid() ? this.getDistanceOfFacilityFromPpos(v, ppos) : NaN),
        facilityHeading: Subject.create(ppos.isValid() ? this.getHeadingOfFacilityFromPpos(v, ppos) : NaN),
        isVisible: Subject.create(true),
        heightPx: 55,
        isActiveWaypoint: Subject.create(false),
      };

      switch (ICAO.getFacilityTypeFromValue(v.icaoStruct)) {
        case FacilityType.Airport:
          return {
            type: 'airport',
            isFlightplanAirport: Subject.create(false),
            facility: v as AirportFacility,
            metarCategory: async () => this.getMetarTypeOfAirportFacility(v as AirportFacility),
            frequency: this.getFrequencyToDisplayForAirport(v as AirportFacility)?.freqMHz,
            ...baseObject
          };
        case FacilityType.VOR:
          return {
            type: 'vor',
            facility: v as VorFacility,
            ...baseObject
          };
        case FacilityType.NDB:
          return {
            type: 'ndb',
            facility: v as NdbFacility,
            ...baseObject
          };
        case FacilityType.Intersection:
        case FacilityType.USR:
        case FacilityType.RWY:
        case FacilityType.VIS:
          return {
            type: 'standard',
            facility: v,
            ...baseObject
          };
      }
    }));

    this.scheduleActiveLegUpdate();
    this.scheduleAirportUpdate();
  }

  /**
   * Removes facilities from the nearest page list
   * @param items The facilities to remove
   */
  private removeFacilities(items: Facility[]): void {
    const currentItems = this.data.getArray();

    for (const it of items) {
      const freq = currentItems.find(v => ICAO.valueEquals(it.icaoStruct, v.facility.icaoStruct));
      freq && this.data.removeItem(freq);
    }
  }

  /**
   * Gets the distance of a faciliy from the PPOS
   * @param facility The facility to get the distance from
   * @param ppos The current PPOS as a geopoint
   * @returns The distance of the facility from the PPOS in nautical miles
   */
  private getDistanceOfFacilityFromPpos(facility: Facility, ppos: GeoPoint): number {
    return UnitType.GA_RADIAN.convertTo(ppos.distance(facility.lat, facility.lon), UnitType.NMILE);
  }

  /**
   * Gets the heading of a faciliy from the PPOS
   * @param facility The facility to get the heading for
   * @param ppos The current PPOS as a geopoint
   * @returns The heading to the facility from PPOS.
   */
  private getHeadingOfFacilityFromPpos(facility: Facility, ppos: GeoPoint): number {
    return MagVar.trueToMagnetic(ppos.bearingTo(facility.lat, facility.lon), ppos);
  }

  /**
   * Gets the METAR category to assign to an airport facility
   * @param fac The facility to check
   * @returns An enum for the specified category
   */
  private async getMetarTypeOfAirportFacility(fac: AirportFacility): Promise<IfdMetarCategory | undefined> {
    const metar = await this.props.facLoader.getMetar(fac);

    if (!metar) {
      return undefined;
    }


    const highestCloud = (metar.layers.filter((v) => v.cover === MetarCloudLayerCoverage.Broken || v.cover === MetarCloudLayerCoverage.Overcast)
      .sort((a, b) => b.alt - a.alt)[0] as MetarCloudLayer | undefined
    );
    const ceiling = Math.min(metar.vertVis ? metar.vertVis * 100 : 5000, highestCloud ? highestCloud.alt * 100 : 5000);
    const visSm = metar.visUnits === MetarVisibilityUnits.Meter ? UnitType.METER.convertTo(metar.vis ?? 9999, UnitType.MILE) : metar.vis ?? 10;

    switch (true) {
      case visSm < 0.5 || ceiling < 200:
        return IfdMetarCategory.CAT1;
      case visSm < 1 || ceiling < 500:
        return IfdMetarCategory.LIFR;
      case visSm < 3 || ceiling < 1000:
        return IfdMetarCategory.IFR;
      case visSm < 5 || ceiling < 3000:
        return IfdMetarCategory.MVFR;
      default:
        return IfdMetarCategory.VFR;
    }
  }

  /**
   * Gets the frequency that should be displayed for an airport facility on the nearest page
   * @param fac The airport facility
   * @returns The frequency to display, or undefined.
   */
  private getFrequencyToDisplayForAirport(fac: AirportFacility): FacilityFrequency | undefined {
    const freqs = fac.frequencies.filter((v) => NrstTab.AIRPORT_FREQUENCY_TYPE_PRIORITY[v.type] > 0)
      .sort((a, b) => NrstTab.AIRPORT_FREQUENCY_TYPE_PRIORITY[b.type] - NrstTab.AIRPORT_FREQUENCY_TYPE_PRIORITY[a.type]);

    return freqs[0];
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.FMSHeldLeft:
      case IfdInteractionEvent.FMSHeldRight:
        this.setSideBarMode(!this.isInSidebarMode.get() ? FullPageSidebarMode.Sidebar : FullPageSidebarMode.Full);
        return true;
    }

    return this.listRef.getOrDefault()?.onInteractionEvent(event) ?? false;
  }

  /**
   * Sets the current sidebar mode.
   * @param mode The mode to set.
   */
  private setSideBarMode(mode: FullPageSidebarMode): void {
    this.fullPageSidebarRef.getOrDefault()?.setSideBarMode(mode);
  }

  /** Handles a NRST button press */
  public onNrstButtonPress(): void {
    const searchTypes = NrstTab.NEAREST_SEARCH_TYPES;
    const currentSearchTypeIndex = searchTypes.indexOf(this.currentSearchType.get());
    this.currentSearchType.set(currentSearchTypeIndex === searchTypes.length - 1 ? searchTypes[0] : searchTypes[currentSearchTypeIndex + 1]);
  }

  /** @inheritdoc */
  public getPageFacility(): Facility | undefined {
    return this.listRef.getOrDefault()?.activeItem?.get()?.facility;
  }

  /** @inheritdoc */
  public override resume(): void {
    super.resume();
    // The map is always in narrow mode on NRST tab, so this is sufficient.
    this.props.mapDataProvider.isSidebarVisible.set(true);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="ifd-nrst-tab">
        <div class={{ 'ifd-narrow-container': true, 'ifd-narrow-page': true }}>
          <MapContainer
            bus={this.props.bus}
            trafficSystem={this.props.trafficSystem}
            facLoader={this.props.facLoader}
            viewService={this.viewService}
            flightPlanner={this.props.flightPlanner}
            mapDataProvider={this.props.mapDataProvider}
            ifdOptions={this.props.ifdOptions}
            fms={this.props.fms}
            class="nrst-tab-map-container"
          />
        </div>
        <FullPageSidebar
          ref={this.fullPageSidebarRef}
          isInSidebarMode={this.isInSidebarMode}
          sidebarTabLabel="NRST"
          fullStateTabLabel="MAP"
        >
          <div class='nearest-container'>
            <div class="nearest-title">
              <span class='nearest-title-prefix'>Nearest</span>
              <span>{this.currentSearchType}</span>
            </div>
            <IfdList<FacilityListData>
              bus={this.props.bus}
              data={this.data}
              renderItem={(data, _index, focusFunc) =>
                <FacilityRow
                  data={data}
                  store={this.props.store}
                  viewService={this.viewService}
                  focus={focusFunc}
                  tuningControlsManager={this.props.tuningControlsManager}
                  chartsManager={this.props.chartsManager}
                />
              }
              listItemSpacingPx={5}
              heightPx={423}
              ref={this.listRef}
              sortItems={(a, b) => a.facilityDistance.get() - b.facilityDistance.get()}
            />
          </div>
        </FullPageSidebar>
      </div>
    );
  }
}

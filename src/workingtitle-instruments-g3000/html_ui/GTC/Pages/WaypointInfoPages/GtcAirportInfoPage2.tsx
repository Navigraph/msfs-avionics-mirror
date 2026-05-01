import {
  AirportFacility, AirportFacilityDataFlags, BitFlags, FacilitySearchType, FacilityType, FSComponent, ICAO, IcaoValue,
  MappedSubject, NodeReference, VNode
} from '@microsoft/msfs-sdk';

import { AirportWaypoint, DirectToState, Fms, FmsUtils } from '@microsoft/msfs-garminsdk';

import { FlightPlanStore, G3000NearestContext } from '@microsoft/msfs-wtg3000-common';

import { GtcWaypointInfoPage2, GtcWaypointInfoPage2Props } from './GtcWaypointInfoPage2';
import { GtcAirportInfo, GtcWaypointInfo } from '../../Components/WaypointInfo';

import './GtcAirportInfoPage2.css';

/**
 * Component props for {@link GtcAirportInfoPage2}.
 */
export interface GtcAirportInfoPage2Props extends GtcWaypointInfoPage2Props {
  /** The FMS. */
  fms: Fms;

  /** The flight plan store to use. */
  flightPlanStore: FlightPlanStore;
}

/**
 * GTC view keys for popups owned by airport information pages.
 */
enum GtcAirportInfoPagePopupKeys {
  Options = 'AirportInfoOptions'
}

/**
 * A GTC airport information page.
 */
export class GtcAirportInfoPage2 extends GtcWaypointInfoPage2<FacilitySearchType.Airport, GtcAirportInfoPage2Props> {
  protected static readonly REQUIRED_FACILITY_DATA_FLAGS
    = AirportFacilityDataFlags.Departures
    | AirportFacilityDataFlags.Arrivals
    | AirportFacilityDataFlags.Approaches
    | AirportFacilityDataFlags.Frequencies
    | AirportFacilityDataFlags.Runways;

  protected readonly waypointSelectType = FacilitySearchType.Airport;
  protected readonly optionsPopupKey = GtcAirportInfoPagePopupKeys.Options;

  private nearestContext?: G3000NearestContext;
  private initSelectionOpId = 0;

  /**
   * Creates a new instance of GtcAirportInfoPage2.
   * @param props The component's props.
   * @throws Error if a display pane index is not defined for this view.
   */
  public constructor(props: GtcAirportInfoPage2Props) {
    super(props);

    G3000NearestContext.getInstance().then(instance => { this.nearestContext = instance; });
  }

  /** @inheritDoc */
  public onAfterRender(): void {
    super.onAfterRender();

    MappedSubject.create(
      this.infoRef.instance.selectedFacility,
      (this.infoRef.instance as GtcAirportInfo).selectedRunwayIndex
    ).pipe(this.showOnMapData, ([facility, runwayIndex]) => {
      return { icao: facility?.icaoStruct ?? ICAO.emptyValue(), runwayIndex };
    });
  }

  /**
   * Initializes this page's airport selection.
   * @param facility The airport facility to select, or its ICAO. If not defined, an initial airport will automatically
   * be selected.
   */
  public async initSelection(facility?: AirportFacility | IcaoValue): Promise<void> {
    let selection: AirportFacility | null = null;

    const opId = ++this.initSelectionOpId;

    if (facility === undefined) {
      selection = await this.autoSelectFacility();
    } else {
      if (ICAO.isValue(facility)) {
        if (ICAO.isValueFacility(facility, FacilityType.Airport)) {
          selection = await this.props.facLoader.tryGetFacility(FacilityType.Airport, facility);
        }
      } else if (BitFlags.isAll(facility.loadedDataFlags, GtcAirportInfoPage2.REQUIRED_FACILITY_DATA_FLAGS)) {
        selection = facility;
      } else {
        selection = await this.props.facLoader.tryGetFacility(FacilityType.Airport, facility.icaoStruct, GtcAirportInfoPage2.REQUIRED_FACILITY_DATA_FLAGS);
      }
    }

    if (opId === this.initSelectionOpId) {
      this.selectedWaypoint.set(selection === null ? null : this.facWaypointCache.get(selection) as AirportWaypoint);
    }
  }

  /**
   * Automatically selects an airport facility. The selected airport will be one of the following, in order of
   * decreasing priority:
   * * The current active flight plan waypoint (if it is an airport).
   * * The current destination airport in the primary flight plan.
   * * The last airport waypoint that appears in the primary flight plan.
   * * The current origin airport in the primary flight plan.
   * * The nearest airport to the airplane's current position.
   * * The most recently selected airport.
   * @returns A Promise which is fulfilled with the automatically selected airport facility or `null` if a selection
   * could not be made.
   */
  private async autoSelectFacility(): Promise<AirportFacility | null> {
    // ---- Active waypoint ----

    const activeFlightPlan = this.props.fms.getDirectToState() === DirectToState.TORANDOM
      ? this.props.fms.getDirectToFlightPlan()
      : this.props.fms.hasPrimaryFlightPlan() ? this.props.fms.getPrimaryFlightPlan() : undefined;

    const activeLegIcao = activeFlightPlan?.tryGetLeg(activeFlightPlan.activeLateralLeg)?.leg.fixIcaoStruct;
    if (activeLegIcao !== undefined && ICAO.isValueFacility(activeLegIcao) && ICAO.getFacilityTypeFromValue(activeLegIcao) === FacilityType.Airport) {
      const activeLegFacility = await this.props.fms.facLoader.tryGetFacility(FacilityType.Airport, activeLegIcao, GtcAirportInfoPage2.REQUIRED_FACILITY_DATA_FLAGS);
      if (activeLegFacility) {
        return activeLegFacility;
      }
    }

    // ---- Destination airport ----

    const destinationFacility = this.props.flightPlanStore.destinationFacility.get();
    if (destinationFacility !== undefined) {
      return destinationFacility;
    }

    // ---- Last airport in primary flight plan ----

    const lastAirportIcao = FmsUtils.getLastAirportFromPlan(this.props.fms.getFlightPlan(Fms.PRIMARY_PLAN_INDEX));
    if (lastAirportIcao !== undefined) {
      const lastAirportFacility = this.props.fms.facLoader.tryGetFacility(FacilityType.Airport, lastAirportIcao, GtcAirportInfoPage2.REQUIRED_FACILITY_DATA_FLAGS);
      if (lastAirportFacility) {
        return lastAirportFacility;
      }
    }

    // ---- Origin airport ----

    const originFacility = this.props.flightPlanStore.originFacility.get();
    if (originFacility !== undefined) {
      return originFacility;
    }

    // ---- Nearest airport ----

    if (this.nearestContext !== undefined) {
      const nearest = this.nearestContext.getNearest(FacilityType.Airport);
      if (nearest !== undefined) {
        return nearest;
      }
    }

    // ---- Last selected airport ----

    return this.selectedWaypoint.get()?.facility.get() ?? null;
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'airport-info-page2';
  }

  /** @inheritDoc */
  protected renderContent(infoRef: NodeReference<GtcWaypointInfo<FacilitySearchType.Airport>>): VNode {
    return (
      <GtcAirportInfo
        ref={infoRef}
        gtcService={this.props.gtcService}
        waypointCache={this.facWaypointCache}
        posHeadingDataProvider={this.props.posHeadingDataProvider}
        allowWaypointSelection={true}
        selectedWaypoint={this.selectedWaypoint}
        onOptionsPressed={() => { this.props.gtcService.openPopup(this.optionsPopupKey, 'slideout-right'); }}
        unitsSettingManager={this.unitsSettingManager}
        facLoader={this.props.facLoader}
        sidebarState={this._sidebarState}
      />
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.infoRef.getOrDefault()?.destroy();

    super.destroy();
  }
}

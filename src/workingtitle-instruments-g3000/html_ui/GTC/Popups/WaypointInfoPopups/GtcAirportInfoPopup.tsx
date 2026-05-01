import {
  AirportFacility, AirportFacilityDataFlags, FacilitySearchType, FacilityType, FSComponent, IcaoValue, VNode
} from '@microsoft/msfs-sdk';

import { GtcAirportInfo } from '../../Components/WaypointInfo/GtcAirportInfo';
import { GtcWaypointInfoPopup } from './GtcWaypointInfoPopup';

import './GtcAirportInfoPopup.css';

/**
 * A GTC airport information popup.
 */
export class GtcAirportInfoPopup extends GtcWaypointInfoPopup<FacilitySearchType.Airport> {
  protected static readonly REQUIRED_FACILITY_DATA_FLAGS
    = AirportFacilityDataFlags.Departures
    | AirportFacilityDataFlags.Arrivals
    | AirportFacilityDataFlags.Approaches
    | AirportFacilityDataFlags.Frequencies
    | AirportFacilityDataFlags.Runways;

  protected readonly waypointSelectType = FacilitySearchType.Airport;

  /** @inheritDoc */
  protected getFacility(icao: IcaoValue): Promise<AirportFacility | null> {
    return this.props.facLoader.tryGetFacility(FacilityType.Airport, icao, GtcAirportInfoPopup.REQUIRED_FACILITY_DATA_FLAGS);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='wpt-info-popup airport-info-popup gtc-popup-panel'>
        <GtcAirportInfo
          ref={this.infoRef}
          gtcService={this.props.gtcService}
          waypointCache={this.facWaypointCache}
          posHeadingDataProvider={this.props.posHeadingDataProvider}
          allowWaypointSelection={false}
          selectedWaypoint={this.selectedWaypoint}
          unitsSettingManager={this.unitsSettingManager}
          facLoader={this.props.facLoader}
          sidebarState={this._sidebarState}
        />
      </div>
    );
  }
}

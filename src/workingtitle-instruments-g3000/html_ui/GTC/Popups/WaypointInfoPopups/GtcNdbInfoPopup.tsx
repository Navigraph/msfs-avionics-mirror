import { FacilitySearchType, FacilityType, FSComponent, ICAO, IcaoValue, NdbFacility, VNode } from '@microsoft/msfs-sdk';

import { GtcNdbInfo } from '../../Components/WaypointInfo/GtcNdbInfo';
import { GtcWaypointInfoPopup } from './GtcWaypointInfoPopup';

import './GtcNdbInfoPopup.css';

/**
 * A GTC NDB information popup.
 */
export class GtcNdbInfoPopup extends GtcWaypointInfoPopup<FacilitySearchType.Ndb> {
  protected readonly waypointSelectType = FacilitySearchType.Ndb;

  /** @inheritDoc */
  protected async getFacility(icao: IcaoValue): Promise<NdbFacility | null> {
    if (ICAO.isValueFacility(icao, FacilityType.NDB)) {
      return this.props.facLoader.tryGetFacility(FacilityType.NDB, icao);
    } else {
      return null;
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='wpt-info-popup ndb-info-popup gtc-popup-panel'>
        <GtcNdbInfo
          ref={this.infoRef}
          gtcService={this.props.gtcService}
          waypointCache={this.facWaypointCache}
          posHeadingDataProvider={this.props.posHeadingDataProvider}
          allowWaypointSelection={false}
          selectedWaypoint={this.selectedWaypoint}
          unitsSettingManager={this.unitsSettingManager}
        />
      </div>
    );
  }
}

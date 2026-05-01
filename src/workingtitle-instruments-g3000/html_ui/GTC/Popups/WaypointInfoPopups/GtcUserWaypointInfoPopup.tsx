import { FacilitySearchType, FacilityType, FSComponent, ICAO, IcaoValue, UserFacility, VNode } from '@microsoft/msfs-sdk';

import { GtcUserWaypointInfo } from '../../Components/WaypointInfo/GtcUserWaypointInfo';
import { GtcWaypointInfoPopup } from './GtcWaypointInfoPopup';

import './GtcUserWaypointInfoPopup.css';

/**
 * A GTC user waypoint information popup.
 */
export class GtcUserWaypointInfoPopup extends GtcWaypointInfoPopup<FacilitySearchType.User> {
  protected readonly waypointSelectType = FacilitySearchType.User;

  /** @inheritDoc */
  protected async getFacility(icao: IcaoValue): Promise<UserFacility | null> {
    if (ICAO.isValueFacility(icao, FacilityType.USR)) {
      return this.props.facLoader.tryGetFacility(FacilityType.USR, icao);
    } else {
      return null;
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='wpt-info-popup user-info-popup gtc-popup-panel'>
        <GtcUserWaypointInfo
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

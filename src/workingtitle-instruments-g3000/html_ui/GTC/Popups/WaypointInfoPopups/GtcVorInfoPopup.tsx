import { FacilitySearchType, FacilityType, FSComponent, ICAO, IcaoValue, VNode, VorFacility } from '@microsoft/msfs-sdk';

import { GtcVorInfo } from '../../Components/WaypointInfo/GtcVorInfo';
import { GtcWaypointInfoPopup } from './GtcWaypointInfoPopup';

import './GtcVorInfoPopup.css';

/**
 * A GTC VOR information popup.
 */
export class GtcVorInfoPopup extends GtcWaypointInfoPopup<FacilitySearchType.Vor> {
  protected readonly waypointSelectType = FacilitySearchType.Vor;

  /** @inheritDoc */
  protected async getFacility(icao: IcaoValue): Promise<VorFacility | null> {
    if (ICAO.isValueFacility(icao, FacilityType.VOR)) {
      return this.props.facLoader.tryGetFacility(FacilityType.VOR, icao);
    } else {
      return null;
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='wpt-info-popup vor-info-popup gtc-popup-panel'>
        <GtcVorInfo
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

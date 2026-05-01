import { FacilitySearchType, FacilityType, FSComponent, ICAO, IcaoValue, IntersectionFacility, VNode } from '@microsoft/msfs-sdk';

import { GtcIntersectionInfo } from '../../Components/WaypointInfo/GtcIntersectionInfo';
import { GtcWaypointInfoPopup } from './GtcWaypointInfoPopup';

import './GtcIntersectionInfoPopup.css';

/**
 * A GTC intersection information popup.
 */
export class GtcIntersectionInfoPopup extends GtcWaypointInfoPopup<FacilitySearchType.Intersection> {
  protected readonly waypointSelectType = FacilitySearchType.Intersection;

  /** @inheritDoc */
  protected async getFacility(icao: IcaoValue): Promise<IntersectionFacility | null> {
    if (ICAO.isValueFacility(icao, FacilityType.Intersection)) {
      return this.props.facLoader.tryGetFacility(FacilityType.Intersection, icao);
    } else {
      return null;
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='wpt-info-popup int-info-popup gtc-popup-panel'>
        <GtcIntersectionInfo
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

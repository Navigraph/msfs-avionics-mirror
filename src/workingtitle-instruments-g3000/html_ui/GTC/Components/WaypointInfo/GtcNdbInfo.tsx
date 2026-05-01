import { FacilitySearchType, FSComponent, RadioFrequencyFormatter, VNode } from '@microsoft/msfs-sdk';

import { GtcWaypointInfo, GtcWaypointInfoNoWaypointMessage } from './GtcWaypointInfo';
import { GtcWaypointInfoInfo } from './GtcWaypointInfoInfo';

import './GtcNdbInfo.css';

/**
 * A GTC NDB information display.
 */
export class GtcNdbInfo extends GtcWaypointInfo<FacilitySearchType.Ndb> {
  private static readonly FREQ_FORMATTER = RadioFrequencyFormatter.createAdf();

  protected readonly waypointSelectType = FacilitySearchType.Ndb;

  // Even though the property is called freqMHz, for NDBs the frequency is reported in kHz
  private readonly freqText = this.selectedFacility.map(facility => facility === null ? '' : GtcNdbInfo.FREQ_FORMATTER(facility.freqMHz * 1e3));

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    super.onAfterRender(thisNode);

    this._title.set('NDB Information');
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'ndb-info';
  }

  /** @inheritDoc */
  protected renderContent(): VNode {
    return (
      <GtcWaypointInfoInfo
        city={this.selectedWaypointInfo.city}
        region={this.selectedWaypointInfo.region}
        location={this.selectedWaypointInfo.location}
        bearing={this.selectedWaypointInfo.bearing}
        relativeBearing={this.selectedWaypointRelativeBearing}
        distance={this.selectedWaypointInfo.distance}
        unitsSettingManager={this.props.unitsSettingManager}
      >
        <div class='wpt-info-info-section ndb-info-info-nrst'>
          <div class='ndb-info-info-section-title'>Nearest Airport</div>
        </div>
        <div class='wpt-info-info-section ndb-info-info-freq'>
          <div class='ndb-info-info-section-title'>Frequency</div>
          <div class='ndb-info-info-freq-value'>{this.freqText}</div>
        </div>
        <GtcWaypointInfoNoWaypointMessage selectedWaypoint={this.props.selectedWaypoint}>
          No NDB Available
        </GtcWaypointInfoNoWaypointMessage>
      </GtcWaypointInfoInfo>
    );
  }
}

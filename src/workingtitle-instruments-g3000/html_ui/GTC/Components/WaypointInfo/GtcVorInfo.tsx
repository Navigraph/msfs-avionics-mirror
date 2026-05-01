import {
  FacilitySearchType, FSComponent, MathUtils, RadioFrequencyFormatter, VNode, VorClass, VorType
} from '@microsoft/msfs-sdk';

import { MagVarDisplay } from '@microsoft/msfs-garminsdk';

import { GtcWaypointInfo, GtcWaypointInfoNoWaypointMessage } from './GtcWaypointInfo';

import { GtcViewKeys } from '@microsoft/msfs-wtg3000-common';
import { GtcLoadFrequencyDialog } from '../../Dialog/GtcLoadFrequencyDialog';
import { GtcTouchButton } from '../TouchButton/GtcTouchButton';
import { GtcWaypointInfoInfo } from './GtcWaypointInfoInfo';

import './GtcVorInfo.css';

/**
 * A GTC VOR information display.
 */
export class GtcVorInfo extends GtcWaypointInfo<FacilitySearchType.Vor> {
  private static readonly CLASS_TEXT = {
    [VorClass.HighAlt]: 'High Altitude',
    [VorClass.LowAlt]: 'Low Altitude',
    [VorClass.Terminal]: 'Terminal',
    [VorClass.ILS]: 'Terminal',
    [VorClass.VOT]: '',
    [VorClass.Unknown]: ''
  };

  private static readonly TYPE_TEXT = {
    [VorType.VOR]: 'VOR',
    [VorType.VORDME]: 'VOR-DME',
    [VorType.VORTAC]: 'VOR-TACAN',
    [VorType.DME]: 'DME',
    [VorType.TACAN]: 'TACAN',
    [VorType.ILS]: 'ILS',
    [VorType.VOT]: 'VOT',
    [VorType.Unknown]: ''
  };

  private static readonly FREQ_FORMATTER = RadioFrequencyFormatter.createNav();

  protected readonly waypointSelectType = FacilitySearchType.Vor;

  private readonly classText = this.selectedFacility.map(facility => facility === null ? '' : GtcVorInfo.CLASS_TEXT[facility.vorClass]);
  private readonly typeText = this.selectedFacility.map(facility => facility === null ? '' : GtcVorInfo.TYPE_TEXT[facility.type]);

  private readonly magVar = this.selectedFacility.map(facility => facility === null ? 0 : -facility.magneticVariation);

  private readonly freqText = this.selectedFacility.map(facility => facility === null ? '' : GtcVorInfo.FREQ_FORMATTER(facility.freqMHz * 1e6));

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    super.onAfterRender(thisNode);

    this._title.set('VOR Information');
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'vor-info';
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
        <div class='wpt-info-page-info-section wpt-info-page-info-section-bottom-separator vor-info-info-type-magvar'>
          <div class='vor-info-info-type-magvar-left'>{this.classText}</div>
          <MagVarDisplay magvar={this.magVar} class='vor-info-info-type-magvar-right' />
          <div class='vor-info-info-type-magvar-left'>{this.typeText}</div>
        </div>
        <div class='wpt-info-page-info-section vor-info-info-nrst'>
          <div class='vor-info-info-nrst-title'>Nearest Airport</div>
        </div>
        <GtcTouchButton
          isEnabled={this.hasSelectedWaypoint}
          onPressed={() => {
            const facility = this.selectedFacility.get();

            if (facility !== null) {
              this.props.gtcService.openPopup<GtcLoadFrequencyDialog>(GtcViewKeys.LoadFrequencyDialog)
                .ref.request({
                  type: 'NAV',
                  frequency: MathUtils.round(facility.freqMHz, 0.01),
                  label: `${facility.icaoStruct.ident} VOR`
                });
            }
          }}
          class='vor-info-info-freq-button'
        >
          <div>Frequency:</div>
          <div class='vor-info-info-freq-button-freq'>{this.freqText}</div>
        </GtcTouchButton>
        <GtcWaypointInfoNoWaypointMessage selectedWaypoint={this.props.selectedWaypoint}>
          No VOR Available
        </GtcWaypointInfoNoWaypointMessage>
      </GtcWaypointInfoInfo>
    );
  }
}

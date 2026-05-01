import {
  BasicNavAngleSubject, BasicNavAngleUnit, FacilitySearchType, FSComponent, NumberFormatter, NumberUnitSubject,
  UnitType, VNode, VorType
} from '@microsoft/msfs-sdk';

import { DefaultWaypointIconImageKey } from '@microsoft/msfs-garminsdk';

import { BearingDisplay, NumberUnitDisplay } from '@microsoft/msfs-wtg3000-common';
import { GtcUiMapWaypointIconImageCache } from '../GtcWaypointIcon/GtcUiWaypointIconImageCache';
import { GtcWaypointInfo, GtcWaypointInfoNoWaypointMessage } from './GtcWaypointInfo';
import { GtcWaypointInfoInfo } from './GtcWaypointInfoInfo';

import './GtcIntersectionInfo.css';

/**
 * A GTC intersection information display.
 */
export class GtcIntersectionInfo extends GtcWaypointInfo<FacilitySearchType.Intersection> {
  private static readonly VOR_ICON_KEY_MAP = {
    [VorType.VOR]: DefaultWaypointIconImageKey.Vor,
    [VorType.DME]: DefaultWaypointIconImageKey.DmeOnly,
    [VorType.ILS]: DefaultWaypointIconImageKey.DmeOnly,
    [VorType.TACAN]: DefaultWaypointIconImageKey.Tacan,
    [VorType.VORDME]: DefaultWaypointIconImageKey.VorDme,
    [VorType.VORTAC]: DefaultWaypointIconImageKey.Vortac,
    [VorType.VOT]: DefaultWaypointIconImageKey.Vor,
    [VorType.Unknown]: DefaultWaypointIconImageKey.Vor
  };

  private static readonly BEARING_FORMATTER = NumberFormatter.create({ precision: 1, pad: 3, nanString: '___' });
  private static readonly DISTANCE_FORMATTER = NumberFormatter.create({ precision: 0.1, maxDigits: 3, nanString: '__._' });

  protected readonly waypointSelectType = FacilitySearchType.Intersection;

  private readonly iconCache = GtcUiMapWaypointIconImageCache.getCache();

  private readonly nearestVorIdent = this.selectedFacility.map(facility => facility === null ? ' ' : facility.nearestVorICAOStruct.ident);
  private readonly nearestVorIconSrc = this.selectedFacility.map(facility => {
    return facility === null ? '' : this.iconCache.get(GtcIntersectionInfo.VOR_ICON_KEY_MAP[facility.nearestVorType])?.src ?? '';
  });

  private readonly nearestVorRadial = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));
  private readonly nearestVorDistance = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    super.onAfterRender(thisNode);

    this._title.set('Intersection Information');

    this.selectedFacility.sub(facility => {
      if (facility === null) {
        this.nearestVorRadial.set(NaN);
        this.nearestVorDistance.set(NaN);
      } else {
        this.nearestVorRadial.set(facility.nearestVorMagneticRadial, facility.nearestVorTrueRadial - facility.nearestVorMagneticRadial);
        this.nearestVorDistance.set(facility.nearestVorDistance);
      }
    }, true);
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'int-info';
  }

  /** @inheritDoc */
  protected renderContent(): VNode {
    return (
      <GtcWaypointInfoInfo
        region={this.selectedWaypointInfo.region}
        location={this.selectedWaypointInfo.location}
        bearing={this.selectedWaypointInfo.bearing}
        relativeBearing={this.selectedWaypointRelativeBearing}
        distance={this.selectedWaypointInfo.distance}
        unitsSettingManager={this.props.unitsSettingManager}
      >
        <div class='wpt-info-info-section int-info-info-nrst'>
          <div class='int-info-info-nrst-title'>Nearest VOR</div>
          <div class='int-info-info-nrst-vor'>
            <span class='int-info-info-nrst-ident'>{this.nearestVorIdent}</span>
            <img class='int-info-info-nrst-icon' src={this.nearestVorIconSrc} />
          </div>
          <div class='int-info-info-nrst-pos'>
            <div class='wpt-info-info-field int-info-info-nrst-rad'>
              <div class='wpt-info-info-field-title'>RAD</div>
              <BearingDisplay
                value={this.nearestVorRadial}
                displayUnit={this.props.unitsSettingManager.navAngleUnits}
                formatter={GtcIntersectionInfo.BEARING_FORMATTER}
              />
            </div>
            <div class='wpt-info-info-field int-info-info-nrst-dis'>
              <div class='wpt-info-info-field-title'>DIS</div>
              <NumberUnitDisplay
                value={this.nearestVorDistance}
                displayUnit={this.props.unitsSettingManager.distanceUnitsLarge}
                formatter={GtcIntersectionInfo.DISTANCE_FORMATTER}
              />
            </div>
          </div>
        </div>
        <GtcWaypointInfoNoWaypointMessage selectedWaypoint={this.props.selectedWaypoint}>
          No Intersection Available
        </GtcWaypointInfoNoWaypointMessage>
      </GtcWaypointInfoInfo >
    );
  }
}

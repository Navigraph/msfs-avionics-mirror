import {
  ComponentProps, DisplayComponent, FSComponent, LatLonInterface, NavAngleUnit, NavAngleUnitFamily, NumberFormatter,
  NumberUnitInterface, Subscribable, UnitFamily, VNode
} from '@microsoft/msfs-sdk';

import { LatLonDisplayFormat, UnitsUserSettingManager } from '@microsoft/msfs-garminsdk';

import { BearingDisplay, GarminLatLonDisplay, NumberUnitDisplay } from '@microsoft/msfs-wtg3000-common';

import { GtcBearingArrow } from '../../Components/BearingArrow/GtcBearingArrow';

import './GtcWaypointInfoInfo.css';

/**
 * Component props for {@link GtcWaypointInfoInfo}.
 */
export interface GtcWaypointInfoInfoProps extends ComponentProps {
  /** The city associated with the waypoint. If not defined, then the city field will not be displayed. */
  city?: Subscribable<string | undefined>;

  /** The region in which the waypoint is located. */
  region: Subscribable<string | undefined>;

  /** The location of the waypoint. */
  location: Subscribable<LatLonInterface>;

  /** The true bearing from the airplane's current position to the waypoint, or `NaN` if the bearing cannot be determined. */
  bearing: Subscribable<NumberUnitInterface<NavAngleUnitFamily, NavAngleUnit>>;

  /**
   * The bearing from the airplane's current position to the waypoint, relative to the airplane's current heading, in
   * degrees, or `NaN` if the bearing cannot be determined.
   */
  relativeBearing: Subscribable<number>;

  /** The distance from the airplane's current position to the waypoint, or `NaN` if the distance cannot be determined. */
  distance: Subscribable<NumberUnitInterface<UnitFamily.Distance>>;

  /** A manager for display units user settings. */
  unitsSettingManager: UnitsUserSettingManager;
}

/**
 * An information display for a GTC waypoint information display. Displays a waypoint's city, region, and location, and
 * the distance/bearing to the waypoint.
 */
export class GtcWaypointInfoInfo extends DisplayComponent<GtcWaypointInfoInfoProps> {
  private static readonly BEARING_FORMATTER = NumberFormatter.create({ precision: 1, pad: 3, nanString: '___' });
  private static readonly DISTANCE_FORMATTER = NumberFormatter.create({ precision: 0.1, maxDigits: 3, nanString: '__._' });

  private thisNode?: VNode;

  private readonly cityText = this.props.city?.map(city => city ?? ' ');
  private readonly regionText = this.props.region.map(region => region ?? ' ');

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='wpt-info-info'>
        <div class='wpt-info-info-section wpt-info-info-section-bottom-separator wpt-info-info-city-region'>
          {this.cityText && <div>{this.cityText}</div>}
          <div>{this.regionText}</div>
        </div>
        <div class='wpt-info-info-section wpt-info-info-section-bottom-separator wpt-info-info-pos'>
          <GarminLatLonDisplay
            value={this.props.location}
            format={LatLonDisplayFormat.HDDD_MMmm}
            class='wpt-info-info-coords'
          />
          <div class='wpt-info-info-field wpt-info-info-gps-field wpt-info-info-brg'>
            <div class='wpt-info-info-field-title'>BRG</div>
            <div class='wpt-info-info-brg-value'>
              <BearingDisplay
                value={this.props.bearing}
                displayUnit={this.props.unitsSettingManager.navAngleUnits}
                formatter={GtcWaypointInfoInfo.BEARING_FORMATTER}
              />
              <GtcBearingArrow
                relativeBearing={this.props.relativeBearing}
              />
            </div>
          </div>
          <div class='wpt-info-info-field wpt-info-info-gps-field wpt-info-info-dis'>
            <div class='wpt-info-info-field-title'>DIS</div>
            <NumberUnitDisplay
              value={this.props.distance}
              displayUnit={this.props.unitsSettingManager.distanceUnitsLarge}
              formatter={GtcWaypointInfoInfo.DISTANCE_FORMATTER}
            />
          </div>
        </div>
        {this.props.children}
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    if (this.thisNode !== undefined) {
      FSComponent.visitNodes(this.thisNode, node => {
        if (node !== this.thisNode && node.instance instanceof DisplayComponent) {
          node.instance.destroy();
          return true;
        } else {
          return false;
        }
      });
    }

    this.cityText?.destroy();
    this.regionText.destroy();

    super.destroy();
  }
}

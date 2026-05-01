import {
  FacilitySearchType, FacilityType, FacilityWaypoint, FSComponent, ICAO, IcaoValue, IntersectionFacility,
  MutableSubscribable, NodeReference, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { GtcIntersectionInfo } from '../../Components/WaypointInfo/GtcIntersectionInfo';
import { GtcWaypointInfo } from '../../Components/WaypointInfo/GtcWaypointInfo';
import { GtcWaypointInfoPage2, GtcWaypointInfoPage2Props } from './GtcWaypointInfoPage2';

import './GtcIntersectionInfoPage2.css';

/**
 * Component props for {@link GtcIntersectionInfoPage2}.
 */
export interface GtcIntersectionInfoPage2Props extends GtcWaypointInfoPage2Props {
  /** A mutable subscribable from and to which to sync the page's selected intersection waypoint. */
  selectedIntersection: MutableSubscribable<FacilityWaypoint<IntersectionFacility> | null>;
}

/**
 * GTC view keys for popups owned by intersection information pages.
 */
enum GtcIntersectionInfoPagePopupKeys {
  Options = 'IntersectionInfoOptions'
}

/**
 * A GTC intersection information page.
 */
export class GtcIntersectionInfoPage2 extends GtcWaypointInfoPage2<FacilitySearchType.Intersection, GtcIntersectionInfoPage2Props> {
  protected readonly waypointSelectType = FacilitySearchType.Intersection;
  protected readonly optionsPopupKey = GtcIntersectionInfoPagePopupKeys.Options;

  private initSelectionOpId = 0;

  private selectedIntPipeOut?: Subscription;

  /** @inheritDoc */
  public onAfterRender(): void {
    super.onAfterRender();

    this.selectedIntPipeOut = this.selectedWaypoint.pipe(this.props.selectedIntersection);

    this.infoRef.instance.selectedFacility.pipe(this.showOnMapData, facility => {
      return { icao: facility?.icaoStruct ?? ICAO.emptyValue(), runwayIndex: -1 };
    });
  }

  /**
   * Initializes this page's intersection selection.
   * @param facility The intersection facility to select, or its ICAO. If not defined, the selection will be
   * initialized to the most recently selected intersection.
   */
  public async initSelection(facility?: IntersectionFacility | IcaoValue): Promise<void> {
    const opId = ++this.initSelectionOpId;

    if (facility === undefined) {
      this.selectedWaypoint.set(this.props.selectedIntersection.get());
    } else {
      let selection: IntersectionFacility | null = null;

      if (ICAO.isValue(facility)) {
        if (ICAO.isValueFacility(facility, FacilityType.Intersection)) {
          selection = await this.props.facLoader.tryGetFacility(FacilityType.Intersection, facility);
        }
      } else {
        selection = facility;
      }

      if (opId === this.initSelectionOpId) {
        this.selectedWaypoint.set(selection === null ? null : this.facWaypointCache.get(selection) as FacilityWaypoint<IntersectionFacility>);
      }
    }
  }

  /** @inheritDoc */
  public onOpen(): void {
    super.onOpen();

    this.selectedIntPipeOut?.resume();
  }

  /** @inheritDoc */
  public onClose(): void {
    super.onClose();

    this.selectedIntPipeOut?.pause();
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'int-info-page2';
  }

  /** @inheritDoc */
  protected renderContent(infoRef: NodeReference<GtcWaypointInfo<FacilitySearchType.Intersection>>): VNode {
    return (
      <GtcIntersectionInfo
        ref={infoRef}
        gtcService={this.props.gtcService}
        waypointCache={this.facWaypointCache}
        posHeadingDataProvider={this.props.posHeadingDataProvider}
        allowWaypointSelection={true}
        selectedWaypoint={this.selectedWaypoint}
        onOptionsPressed={() => { this.props.gtcService.openPopup(this.optionsPopupKey, 'slideout-right'); }}
        unitsSettingManager={this.unitsSettingManager}
      />
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.infoRef.getOrDefault()?.destroy();

    this.selectedIntPipeOut?.destroy();

    super.destroy();
  }
}

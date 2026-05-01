import {
  FacilitySearchType, FacilityType, FacilityWaypoint, FSComponent, ICAO, IcaoValue, MutableSubscribable, NdbFacility,
  NodeReference, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { GtcNdbInfo } from '../../Components/WaypointInfo/GtcNdbInfo';
import { GtcWaypointInfo } from '../../Components/WaypointInfo/GtcWaypointInfo';
import { GtcWaypointInfoPage2, GtcWaypointInfoPage2Props } from './GtcWaypointInfoPage2';

import './GtcNdbInfoPage2.css';

/**
 * Component props for {@link GtcNdbInfoPage2}.
 */
export interface GtcNdbInfoPage2Props extends GtcWaypointInfoPage2Props {
  /** A mutable subscribable from and to which to sync the page's selected NDB waypoint. */
  selectedNdb: MutableSubscribable<FacilityWaypoint<NdbFacility> | null>;
}

/**
 * GTC view keys for popups owned by NDB information pages.
 */
enum GtcNdbInfoPagePopupKeys {
  Options = 'NdbInfoOptions'
}

/**
 * A GTC NDB information page.
 */
export class GtcNdbInfoPage2 extends GtcWaypointInfoPage2<FacilitySearchType.Ndb, GtcNdbInfoPage2Props> {
  protected readonly waypointSelectType = FacilitySearchType.Ndb;
  protected readonly optionsPopupKey = GtcNdbInfoPagePopupKeys.Options;

  private initSelectionOpId = 0;

  private selectedNdbPipeOut?: Subscription;

  /** @inheritDoc */
  public onAfterRender(): void {
    super.onAfterRender();

    this.selectedNdbPipeOut = this.selectedWaypoint.pipe(this.props.selectedNdb);

    this.infoRef.instance.selectedFacility.pipe(this.showOnMapData, facility => {
      return { icao: facility?.icaoStruct ?? ICAO.emptyValue(), runwayIndex: -1 };
    });
  }

  /**
   * Initializes this page's NDB selection.
   * @param facility The NDB facility to select, or its ICAO. If not defined, the selection will be initialized to the
   * most recently selected NDB.
   */
  public async initSelection(facility?: NdbFacility | IcaoValue): Promise<void> {
    const opId = ++this.initSelectionOpId;

    if (facility === undefined) {
      this.selectedWaypoint.set(this.props.selectedNdb.get());
    } else {
      let selection: NdbFacility | null = null;

      if (ICAO.isValue(facility)) {
        if (ICAO.isValueFacility(facility, FacilityType.NDB)) {
          selection = await this.props.facLoader.tryGetFacility(FacilityType.NDB, facility);
        }
      } else {
        selection = facility;
      }

      if (opId === this.initSelectionOpId) {
        this.selectedWaypoint.set(selection === null ? null : this.facWaypointCache.get(selection) as FacilityWaypoint<NdbFacility>);
      }
    }
  }

  /** @inheritDoc */
  public onOpen(): void {
    super.onOpen();

    this.selectedNdbPipeOut?.resume();
  }

  /** @inheritDoc */
  public onClose(): void {
    super.onClose();

    this.selectedNdbPipeOut?.pause();
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'ndb-info-page2';
  }

  /** @inheritDoc */
  protected renderContent(infoRef: NodeReference<GtcWaypointInfo<FacilitySearchType.Ndb>>): VNode {
    return (
      <GtcNdbInfo
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

    this.selectedNdbPipeOut?.destroy();

    super.destroy();
  }
}

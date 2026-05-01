import {
  FacilitySearchType, FacilityType, FacilityWaypoint, FSComponent, ICAO, IcaoValue, MutableSubscribable, NodeReference,
  Subscription, VNode, VorFacility
} from '@microsoft/msfs-sdk';

import { GtcVorInfo } from '../../Components/WaypointInfo/GtcVorInfo';
import { GtcWaypointInfo } from '../../Components/WaypointInfo/GtcWaypointInfo';
import { GtcWaypointInfoPage2, GtcWaypointInfoPage2Props } from './GtcWaypointInfoPage2';

import './GtcVorInfoPage2.css';

/**
 * Component props for {@link GtcVorInfoPage2}.
 */
export interface GtcVorInfoPage2Props extends GtcWaypointInfoPage2Props {
  /** A mutable subscribable from and to which to sync the page's selected VOR waypoint. */
  selectedVor: MutableSubscribable<FacilityWaypoint<VorFacility> | null>;
}

/**
 * GTC view keys for popups owned by VOR information pages.
 */
enum GtcVorInfoPagePopupKeys {
  Options = 'VorInfoOptions'
}

/**
 * A GTC VOR information page.
 */
export class GtcVorInfoPage2 extends GtcWaypointInfoPage2<FacilitySearchType.Vor, GtcVorInfoPage2Props> {
  protected readonly waypointSelectType = FacilitySearchType.Vor;
  protected readonly optionsPopupKey = GtcVorInfoPagePopupKeys.Options;

  private initSelectionOpId = 0;

  private selectedVorPipeOut?: Subscription;

  /** @inheritDoc */
  public onAfterRender(): void {
    super.onAfterRender();

    this.selectedVorPipeOut = this.selectedWaypoint.pipe(this.props.selectedVor);

    this.infoRef.instance.selectedFacility.pipe(this.showOnMapData, facility => {
      return { icao: facility?.icaoStruct ?? ICAO.emptyValue(), runwayIndex: -1 };
    });
  }

  /**
   * Initializes this page's VOR selection.
   * @param facility The VOR facility to select, or its ICAO. If not defined, the selection will be initialized to the
   * most recently selected VOR.
   */
  public async initSelection(facility?: VorFacility | IcaoValue): Promise<void> {
    const opId = ++this.initSelectionOpId;

    if (facility === undefined) {
      this.selectedWaypoint.set(this.props.selectedVor.get());
    } else {
      let selection: VorFacility | null = null;

      if (ICAO.isValue(facility)) {
        if (ICAO.isValueFacility(facility, FacilityType.VOR)) {
          selection = await this.props.facLoader.tryGetFacility(FacilityType.VOR, facility);
        }
      } else {
        selection = facility;
      }

      if (opId === this.initSelectionOpId) {
        this.selectedWaypoint.set(selection === null ? null : this.facWaypointCache.get(selection) as FacilityWaypoint<VorFacility>);
      }
    }
  }

  /** @inheritDoc */
  public onOpen(): void {
    super.onOpen();

    this.selectedVorPipeOut?.resume();
  }

  /** @inheritDoc */
  public onClose(): void {
    super.onClose();

    this.selectedVorPipeOut?.pause();
  }

  /** @inheritDoc */
  protected getCssClass(): string {
    return 'vor-info-page2';
  }

  /** @inheritDoc */
  protected renderContent(infoRef: NodeReference<GtcWaypointInfo<FacilitySearchType.Vor>>): VNode {
    return (
      <GtcVorInfo
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

    this.selectedVorPipeOut?.destroy();

    super.destroy();
  }
}

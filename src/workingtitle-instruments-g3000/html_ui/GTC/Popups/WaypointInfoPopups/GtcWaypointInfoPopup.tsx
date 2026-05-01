import { FacilityLoader, FSComponent, ICAO, IcaoValue, SearchTypeMap, Subject } from '@microsoft/msfs-sdk';

import { GarminFacilityWaypointCache, UnitsUserSettings } from '@microsoft/msfs-garminsdk';

import { WaypointSelectType, WaypointSelectTypeMap } from '../../Components/TouchButton/GtcWaypointSelectButton';
import { GtcWaypointInfo } from '../../Components/WaypointInfo/GtcWaypointInfo';
import { GtcView, GtcViewProps } from '../../GtcService/GtcView';
import { GtcPositionHeadingDataProvider } from '../../Navigation/GtcPositionHeadingDataProvider';

import './GtcWaypointInfoPopup.css';

/**
 * Component props for {@link GtcWaypointInfoPopup}.
 */
export interface GtcWaypointInfoPopupProps extends GtcViewProps {
  /** The facility loader to use. */
  facLoader: FacilityLoader;

  /** A provider of airplane position and heading data. */
  posHeadingDataProvider: GtcPositionHeadingDataProvider;
}

/**
 * A GTC waypoint information popup.
 */
export abstract class GtcWaypointInfoPopup<T extends WaypointSelectType, P extends GtcWaypointInfoPopupProps = GtcWaypointInfoPopupProps> extends GtcView<P> {
  /** The type of waypoint displayed by this popup. */
  protected abstract readonly waypointSelectType: T;

  protected readonly facWaypointCache = GarminFacilityWaypointCache.getCache(this.bus);

  protected readonly unitsSettingManager = UnitsUserSettings.getManager(this.bus);

  /** The selected waypoint, or `null` if there is no selected waypoint. */
  protected readonly selectedWaypoint = Subject.create<WaypointSelectTypeMap[T] | null>(null);

  protected readonly infoRef = FSComponent.createRef<GtcWaypointInfo<T>>();

  protected setWaypointOpId = 0;

  /** @inheritDoc */
  public onAfterRender(): void {
    this._activeComponent.set(this.infoRef.instance);

    this.infoRef.instance.title.pipe(this._title);
  }

  /**
   * Sets the waypoint to be displayed on this popup.
   * @param facility The facility to display, or its ICAO.
   * @returns A Promise which is fulfilled when the waypoint has been set.
   */
  public async setWaypoint(facility: SearchTypeMap[T] | IcaoValue | null): Promise<void> {
    const opId = ++this.setWaypointOpId;

    if (facility === null) {
      this.selectedWaypoint.set(null);
    } else {
      let selection: SearchTypeMap[T] | null = null;

      if (ICAO.isValue(facility)) {
        selection = await this.getFacility(facility);
      } else {
        selection = facility;
      }

      if (opId === this.setWaypointOpId) {
        this.selectedWaypoint.set(selection === null ? null : this.facWaypointCache.get(selection) as WaypointSelectTypeMap[T] | null);
      }
    }
  }

  /**
   * Gets a facility for this popup.
   * @param icao The ICAO of the facility to retrieve.
   * @returns A Promise which is fulfilled with the requested facility, or `null` if the facility could not be
   * retrieved.
   */
  protected abstract getFacility(icao: IcaoValue): Promise<SearchTypeMap[T] | null>;

  /** @inheritDoc */
  public onInUse(): void {
    this.infoRef.instance.onInUse();
  }

  /** @inheritDoc */
  public onOutOfUse(): void {
    this.infoRef.instance.onOutOfUse();
  }

  /** @inheritDoc */
  public onOpen(): void {
    this.infoRef.instance.onOpen();
  }

  /** @inheritDoc */
  public onClose(): void {
    this.infoRef.instance.onClose();
  }

  /** @inheritDoc */
  public onResume(): void {
    this.infoRef.instance.onResume();
  }

  /** @inheritDoc */
  public onPause(): void {
    this.infoRef.instance.onPause();
  }

  /** @inheritDoc */
  public destroy(): void {
    this.infoRef.getOrDefault()?.destroy();

    super.destroy();
  }
}

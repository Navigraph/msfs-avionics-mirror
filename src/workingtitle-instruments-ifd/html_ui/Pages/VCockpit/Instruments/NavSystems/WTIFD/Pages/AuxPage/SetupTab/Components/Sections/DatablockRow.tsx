import { NodeReference, Subject, Subscribable, SubscribableMapFunctions } from '@microsoft/msfs-sdk';

import { IfdList } from '../../../../../Components/List';
import { DatablockService } from '../../../../../Datablocks/DatablocksService';
import { DataBlockId, DatablockSizeMap, DatablockSlotLocation } from '../../../../../Datablocks/DatablockTypes';
import { IfdOptions } from '../../../../../IfdOptions';
import { SetupMenuCheckboxRowData, SetupMenuRowListItemData, SetupMenuRowListItems } from '../SetupMenuTypes';

/** The datablock settings of the setup menu. */
export class DatablockRow {
  private readonly _isExpanded = Subject.create(false);
  public readonly isExpanded = this._isExpanded as Subscribable<boolean>;

  /** @inheritdoc */
  constructor(private readonly datablockService: DatablockService, list: NodeReference<IfdList<SetupMenuRowListItemData>>, private readonly ifdOptions: IfdOptions) {
    this.datablockService.selectedDatablock.sub((selectedPosition) => {
      const listData = list.getOrDefault()?.props.data;
      if (!selectedPosition || !listData) {
        return;
      }

      // Get the datablock that is selected at the new position.
      const datablock = this.datablockService.getDatablockAtPosition(selectedPosition[0], selectedPosition[1]);
      const info = datablock?.getInfo();

      if (!datablock || !info) {
        return;
      }

      // Find the selected datablock in the selection list, and then focus it.
      const itemToFocus = listData.getArray().findIndex((v) => v.item.type === 'checkbox' && v.item.label === info.displayName);

      if (itemToFocus >= 0) {
        list.instance.focusIndex(itemToFocus);
      }
    }, true);
  }

  /**
   * Gets the rows to display for this section
   * @returns Section
   */
  public getRows(): SetupMenuRowListItems[] {
    const items = [
      this.getDatablockCheckboxItem('Primary COM/VLOC', DataBlockId.PrimaryComVloc, true),
      this.getDatablockCheckboxItem('COM/VLOC Standby #2', DataBlockId.ComVlocStandby2),
      this.getDatablockCheckboxItem('COM/VLOC Standby #3', DataBlockId.ComVlocStandby3),
      this.getDatablockCheckboxItem('COM/VLOC Standby #4', DataBlockId.ComVlocStandby4),
      this.getDatablockCheckboxItem('Traffic Thumbnail', DataBlockId.TrafficThumbnail),
      this.getDatablockCheckboxItem('To Waypoint Information', DataBlockId.ToWaypointInformation),
      this.getDatablockCheckboxItem('Next Waypoint Information', DataBlockId.NextWaypointInformation),
      this.getDatablockCheckboxItem('Designated Waypoint', DataBlockId.DesignatedWaypoint),
      this.getDatablockCheckboxItem('Destination Along Track Info', DataBlockId.DestinationAlongTrackInfo),
      this.getDatablockCheckboxItem('Destination Direct Info', DataBlockId.DestinationDirectInfo),
      this.getDatablockCheckboxItem('Destination Waypoint', DataBlockId.DestinationWaypoint),
      this.getDatablockCheckboxItem('Destination Direct Distance', DataBlockId.DestinationDirectDistance),
      // this.getDatablockCheckboxItem('To Waypoint Direct Info', DataBlockId.ToWaypointDirectInfo),
      // this.getDatablockCheckboxItem('To Waypoint Direct Distance', DataBlockId.ToWaypointDirectDistance),
      // this.getDatablockCheckboxItem('ETA at Destination', DataBlockId.EtaAtDestination),
      // this.getDatablockCheckboxItem('To Waypoint ETA', DataBlockId.ToWaypointEta),
      // this.getDatablockCheckboxItem('Destination ETE', DataBlockId.DestinationEte),
      // this.getDatablockCheckboxItem('To Waypoint ETE', DataBlockId.ToWaypointEte),
      this.getDatablockCheckboxItem('GPS CDI', DataBlockId.GpsCdi),
      this.getDatablockCheckboxItem('Track Angle Error', DataBlockId.TrackAngleError),
      this.getDatablockCheckboxItem('Desired Track', DataBlockId.DesiredTrack),
      this.getDatablockCheckboxItem('Cross Track Distance', DataBlockId.CrossTrackDistance),
      this.getDatablockCheckboxItem('Next Desired Track', DataBlockId.NextDesiredTrack),
      this.getDatablockCheckboxItem('Vertical Speed Required', DataBlockId.VerticalSpeedRequired),
      this.getDatablockCheckboxItem('Navigation Mode', DataBlockId.NavigationMode),
      this.getDatablockCheckboxItem('Active GPS Approach', DataBlockId.ActiveGpsApproach),
      this.getDatablockCheckboxItem('Nearest Airport', DataBlockId.NearestAirport),
      this.getDatablockCheckboxItem('Aircraft Position', DataBlockId.AircraftPosition),
      this.getDatablockCheckboxItem('GPS AGL Altitude', DataBlockId.GpsAglAltitude),
      this.getDatablockCheckboxItem('Ground Speed', DataBlockId.GroundSpeed),
      this.getDatablockCheckboxItem('Ground Track', DataBlockId.GroundTrack),
      this.getDatablockCheckboxItem('Wind Vector', DataBlockId.WindVector),
      this.getDatablockCheckboxItem('Radar Altitude', DataBlockId.RadarAltitude),
      this.getDatablockCheckboxItem('Total Air Temperature', DataBlockId.TotalAirTemp),
      this.getDatablockCheckboxItem('Static Air Temperature', DataBlockId.StaticAirTemp),
      this.getDatablockCheckboxItem('Local Time', DataBlockId.LocalTime),
      this.getDatablockCheckboxItem('UTC Time', DataBlockId.UtcTime),
      this.getDatablockCheckboxItem('Flight Timer', DataBlockId.FlightTimer),
      this.getDatablockCheckboxItem('Number of Alerts', DataBlockId.NumberOfAlerts),
      this.getDatablockCheckboxItem('User Profile', DataBlockId.UserProfile),
      this.getDatablockCheckboxItem('Fuel Amount Remaining', DataBlockId.FuelRemaining),
      this.getDatablockCheckboxItem('Fuel Time Remaining', DataBlockId.FuelTimeRemaining),
      this.getDatablockCheckboxItem('Fuel Flow', DataBlockId.FuelFlow),
      this.getDatablockCheckboxItem('Fuel Used', DataBlockId.FuelUsed),
      this.getDatablockCheckboxItem('Fuel Economy', DataBlockId.FuelEconomy),
      this.getDatablockCheckboxItem('*** Blank ***', DataBlockId.Blank),
    ];

    if (this.ifdOptions.navIndex !== undefined) {
      items.splice(1, 0, this.getDatablockCheckboxItem('VLOC Radio', DataBlockId.VlocRadio));

      const vlocIdentPriorItemIndex = items.findIndex((v) => v.label === 'Active GPS Approach');
      vlocIdentPriorItemIndex > 0 && items.splice(vlocIdentPriorItemIndex + 1, 0, this.getDatablockCheckboxItem('Decoded VLOC Identifier', DataBlockId.DecodedVlocIdentifier));
    }

    if (this.ifdOptions.enableTransponder) {
      const vlocIdentPriorItemIndex = items.findIndex((v) => v.label === 'COM/VLOC Standby #4');
      vlocIdentPriorItemIndex > 0 && items.splice(vlocIdentPriorItemIndex + 1, 0, this.getDatablockCheckboxItem('Transponder Thumbnail', DataBlockId.TransponderThumbnail));
    }

    return [
      {
        type: 'title',
        label: 'Datablocks',
        onExpandedChanged: (isExpanded: boolean): void => {
          this._isExpanded.set(isExpanded);
          isExpanded ? this.datablockService.startEditing() : this.datablockService.stopEditing();
        },
        items
      }
    ];
  }

  /**
   * Gets an object used to construct a checkbox used in the datablock row
   * @param label The label for the checkbox item
   * @param id The datablock id
   * @param isDisabled Whether this checkbox should be disabled. Defaults to false.
   * @returns A checkbox object
   */
  private getDatablockCheckboxItem(
    label: string,
    id: DataBlockId,
    isDisabled = false,
  ): SetupMenuCheckboxRowData {
    const checked = Subject.create(false);

    this.datablockService.datablocksInUse.sub((map) => checked.set(id === DataBlockId.Blank || map.has(id)), true);

    return {
      type: 'checkbox',
      label,
      checked: checked.map(SubscribableMapFunctions.identity()), // make immutable so the row doesn't modify it
      onPressed: () => this.datablockService.setSelectedLocation(id), // Action from the row only ever inserts blocks. CLR is handled directly by the service.
      isVisible: this.datablockService.selectedDatablock.map((selectedPosition) => !this.isIncompatible(selectedPosition, id)),
      isEnabled: isDisabled ? false : this.datablockService.selectedDatablock.map((selectedPosition) => this.isDatablockEnabledForCurrentPosition(selectedPosition, id))
    };
  }

  /**
   * Determines whether the currently selected datablock is incompatible with the selected position.
   * @param selectedPosition The selected position.
   * @param id The datablock id
   * @returns Whether the currently selected datablock is incompatible with the selected position.
   */
  private isIncompatible(selectedPosition: [DatablockSlotLocation, number] | null, id: DataBlockId): boolean {
    return this.datablockService.isDatablockIncompatibleWithSelectedPosition(id, selectedPosition);
  }

  /**
   * Determines whether there is enough space in the selected bar to replace the currently selected datablock
   * or any other prohibiting factor to enabling the selection of the datablock
   * @param selectedPosition The selected position.
   * @param id The datablock id
   * @returns Whether the datablock can be selected.
   */
  private isDatablockEnabledForCurrentPosition(selectedPosition: [DatablockSlotLocation, number] | null, id: DataBlockId): boolean {
    if (!selectedPosition) {
      return false;
    }

    // Handle special cases
    const currentDatablockAtPosition = this.datablockService.getDatablockAtPosition(selectedPosition[0], selectedPosition[1]);
    if (selectedPosition[0] === DatablockSlotLocation.TopBar) {
      // The top bar always has 2 slots, which we can always replace (unless locked by preset)
      return true;
    }
    if (id === DataBlockId.VlocRadio) {
      // The VLOC radio can only be selected in the second slot on the left sidebar
      if (selectedPosition[0] === DatablockSlotLocation.LeftSidebar && selectedPosition[1] === 1) {
        // The VLOC radio can't be selected if we have ComVlocStandby2 currently in the slot
        // and ComVlocStandby3 is also selected in the next slot
        return currentDatablockAtPosition?.getInfo()?.id === DataBlockId.ComVlocStandby2
          ? this.datablockService.getDatablockAtPosition(DatablockSlotLocation.LeftSidebar, 2)?.getInfo()?.id !== DataBlockId.ComVlocStandby3
          : true;
      }
      return false;
    }
    if (id === DataBlockId.ComVlocStandby2) {
      // The COM/VLOC standby #2 can only be selected in the second slot on the left sidebar
      return selectedPosition[0] === DatablockSlotLocation.LeftSidebar && selectedPosition[1] === 1;
    }
    if (id === DataBlockId.ComVlocStandby3) {
      // The COM/VLOC standby #3 can only be selected in the third slot of the right sidebar
      // when the second slot is COM/VLOC standby #2
      if (selectedPosition[0] !== DatablockSlotLocation.LeftSidebar || selectedPosition[1] !== 2) {
        return false;
      }
      const secondSlot = this.datablockService.getDatablockAtPosition(DatablockSlotLocation.LeftSidebar, 1)?.getInfo();
      return secondSlot?.id === DataBlockId.ComVlocStandby2;
    }
    if (id === DataBlockId.ComVlocStandby4) {
      // The COM/VLOC standby #4 can only be selected in the fourth slot of the right sidebar
      // when the third slot is COM/VLOC standby #3
      if (selectedPosition[0] !== DatablockSlotLocation.LeftSidebar || selectedPosition[1] !== 3) {
        return false;
      }
      const thirdSlot = this.datablockService.getDatablockAtPosition(DatablockSlotLocation.LeftSidebar, 2)?.getInfo();
      return thirdSlot?.id === DataBlockId.ComVlocStandby3;
    }

    if (currentDatablockAtPosition?.getInfo()?.id === DataBlockId.ComVlocStandby2) {
      // If the subsequent position is ComVlocStandby3,
      // we can't select any other datablock in this position so only ComVlocStandby2 is enabled
      const subsequentId = this.datablockService.getDatablockAtPosition(selectedPosition[0], selectedPosition[1] + 1)?.getInfo()?.id;
      if (subsequentId === DataBlockId.ComVlocStandby3) {
        return false;
      }
    }
    if (currentDatablockAtPosition?.getInfo()?.id === DataBlockId.ComVlocStandby3) {
      // If the subsequent position is ComVlocStandby4,
      // we can't select any other datablock in this position so only ComVlocStandby3 is enabled
      const subsequentId = this.datablockService.getDatablockAtPosition(selectedPosition[0], selectedPosition[1] + 1)?.getInfo()?.id;
      if (subsequentId === DataBlockId.ComVlocStandby4) {
        return false;
      }
    }

    const size = DatablockSizeMap.get(id) ?? 99;
    const capacity = selectedPosition[0] === DatablockSlotLocation.LeftSidebar ? DatablockService.LEFT_SIDEBAR_SLOTS : DatablockService.RIGHT_SIDEBAR_SLOTS;

    return capacity - size >= selectedPosition[1];
  }
}

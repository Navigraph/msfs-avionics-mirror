import { DataBlockId } from './DatablockTypes';

export enum DatablockPresetType {
  FactorySettings = 'factory-settings',
  LeftSideFactory = 'left-side-factory',
  LeftSideTraffic = 'left-side-traffic',
  LeftSideTransponder = 'left-side-transponder',
  CustomSettings = 'custom-settings',
}

/** A datablock preset. */
export interface DatablockPreset {
  /** The default slots for the left sidebar. */
  leftSidebarSlots?: DataBlockId[];
  /** The default slots for the top sidebar. */
  topSidebarSlots?: DataBlockId[];
  /** The default slots for the right sidebar. */
  rightSidebarSlots?: DataBlockId[];
}

export const DefaultDatablockPresets: Record<DatablockPresetType, DatablockPreset> = {
  [DatablockPresetType.FactorySettings]: {
    leftSidebarSlots: [
      DataBlockId.PrimaryComVloc,
      DataBlockId.VlocRadio,
      DataBlockId.DecodedVlocIdentifier,
      DataBlockId.NavigationMode,
    ],
    topSidebarSlots: [
      DataBlockId.UtcTime,
      DataBlockId.GpsAglAltitude,
    ],
    rightSidebarSlots: [
      DataBlockId.ToWaypointInformation,
      DataBlockId.NearestAirport,
      DataBlockId.DestinationDirectInfo,
      DataBlockId.GroundSpeed,
      DataBlockId.GpsCdi,
      DataBlockId.FlightTimer,
      DataBlockId.AircraftPosition,
      DataBlockId.NumberOfAlerts,
    ]
  },
  [DatablockPresetType.LeftSideFactory]: {
    leftSidebarSlots: [
      DataBlockId.PrimaryComVloc,
      DataBlockId.VlocRadio,
      DataBlockId.DecodedVlocIdentifier,
      DataBlockId.NavigationMode,
    ],
  },
  [DatablockPresetType.LeftSideTraffic]: {
    leftSidebarSlots: [
      DataBlockId.PrimaryComVloc,
      DataBlockId.ComVlocStandby2,
      DataBlockId.TrafficThumbnail,
    ],
  },
  [DatablockPresetType.LeftSideTransponder]: {
    leftSidebarSlots: [
      DataBlockId.PrimaryComVloc,
      DataBlockId.ComVlocStandby2,
      DataBlockId.TransponderThumbnail,
    ],
  },
  [DatablockPresetType.CustomSettings]: {
    leftSidebarSlots: [
      DataBlockId.PrimaryComVloc,
      DataBlockId.VlocRadio,
      DataBlockId.DecodedVlocIdentifier,
      DataBlockId.NavigationMode,
    ],
    topSidebarSlots: [
      DataBlockId.UtcTime,
      DataBlockId.GpsAglAltitude,
    ],
    rightSidebarSlots: [
      DataBlockId.ToWaypointInformation,
      DataBlockId.NearestAirport,
      DataBlockId.DestinationDirectInfo,
      DataBlockId.GroundSpeed,
      DataBlockId.GpsCdi,
      DataBlockId.FlightTimer,
      DataBlockId.AircraftPosition,
      DataBlockId.NumberOfAlerts,
    ]
  },
};

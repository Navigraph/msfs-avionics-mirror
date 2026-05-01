import { BitFlags, ComponentProps, EventBus } from '@microsoft/msfs-sdk';

import { DatablockService } from './DatablocksService';

/**
 * Props for datablock containers
 */
export interface DatablocksContainerProps extends ComponentProps {
  /** The event bus instance */
  bus: EventBus;
  /** The datablock service instance */
  datablockService: DatablockService;
}

/**
 * Enum defining the different datablock slot locations
 */
export enum DatablockSlotLocation {
  LeftSidebar = 'left-sidebar',
  TopBar = 'top-bar',
  RightSidebar = 'right-sidebar'
}

/** BitFlags to define datablock compatibility */
export enum DatablockCompatibility {
  None = 0,
  Left = 1 << 1,
  Top = 1 << 2,
  Right = 1 << 3,
}

export enum DataBlockId {
  Blank = 'blank',

  PrimaryComVloc = 'primary-com-vloc',
  VlocRadio = 'vloc-radio',
  ComVlocStandby2 = 'com-vloc-standby-2',
  ComVlocStandby3 = 'com-vloc-standby-3',
  ComVlocStandby4 = 'com-vloc-standby-4',
  TransponderThumbnail = 'transponder-thumbnail',
  TrafficThumbnail = 'traffic-thumbnail',
  ToWaypointInformation = 'to-waypoint-information',
  NextWaypointInformation = 'next-waypoint-information',
  DesignatedWaypoint = 'designated-waypoint',
  DestinationAlongTrackInfo = 'destination-along-track-info',
  DestinationDirectInfo = 'destination-direct-info',
  DestinationWaypoint = 'destination-waypoint',
  DestinationDirectDistance = 'destination-direct-distance',
  ToWaypointDirectInfo = 'to-waypoint-direct-info',
  ToWaypointDirectDistance = 'to-waypoint-direct-distance',
  EtaAtDestination = 'eta-at-destination',
  ToWaypointEta = 'to-waypoint-eta',
  DestinationEte = 'to-destination-ete',
  ToWaypointEte = 'to-waypoint-ete',
  GpsCdi = 'gps-cdi',
  TrackAngleError = 'track-angle-error',
  DesiredTrack = 'desired-track',
  CrossTrackDistance = 'cross-track-distance',
  NextDesiredTrack = 'next-desired-track',
  VerticalSpeedRequired = 'vertical-speed-required',
  NavigationMode = 'navigation-mode',
  ActiveGpsApproach = 'active-gps-approach',
  DecodedVlocIdentifier = 'decoded-vloc-identifier',
  NearestAirport = 'nearest-airport',
  AircraftPosition = 'aircraft-position',
  GpsAglAltitude = 'gps-agl-altitude',
  GroundSpeed = 'ground-speed',
  GroundTrack = 'ground-track',
  WindVector = 'wind-vector',
  RadarAltitude = 'radar-altitude',
  StaticAirTemp = 'static-air-temperature',
  TotalAirTemp = 'total-air-temperature',
  LocalTime = 'local-time',
  UtcTime = 'utc-time',
  FlightTimer = 'flight-timer',
  NumberOfAlerts = 'number-of-alerts',
  UserProfile = 'user-profile',
  FuelRemaining = 'fuel-remaining',
  FuelTimeRemaining = 'fuel-time-remaining',
  FuelFlow = 'fuel-flow',
  FuelUsed = 'fuel-used',
  FuelEconomy = 'fuel-economy',
}

/** Map to look up the datablock compatibility flags for each datablock */
export const DatablockCompatibilityMap: Map<DataBlockId, DatablockCompatibility> = new Map([
  [DataBlockId.PrimaryComVloc, BitFlags.union(DatablockCompatibility.Left)],
  [DataBlockId.VlocRadio, BitFlags.union(DatablockCompatibility.Left)],
  [DataBlockId.ComVlocStandby2, BitFlags.union(DatablockCompatibility.Left)],
  [DataBlockId.ComVlocStandby3, BitFlags.union(DatablockCompatibility.Left)],
  [DataBlockId.ComVlocStandby4, BitFlags.union(DatablockCompatibility.Left)],
  [DataBlockId.TransponderThumbnail, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.TrafficThumbnail, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.ToWaypointInformation, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.NextWaypointInformation, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DesignatedWaypoint, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DestinationAlongTrackInfo, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DestinationDirectInfo, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DestinationWaypoint, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DestinationDirectDistance, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.ToWaypointDirectInfo, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.ToWaypointDirectDistance, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.EtaAtDestination, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.ToWaypointEta, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DestinationEte, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.ToWaypointEte, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.GpsCdi, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.TrackAngleError, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DesiredTrack, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.CrossTrackDistance, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.NextDesiredTrack, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.VerticalSpeedRequired, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.NavigationMode, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.ActiveGpsApproach, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.DecodedVlocIdentifier, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.NearestAirport, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.AircraftPosition, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.GpsAglAltitude, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.GroundSpeed, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.GroundTrack, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.WindVector, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.RadarAltitude, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.TotalAirTemp, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.StaticAirTemp, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.LocalTime, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.UtcTime, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.FlightTimer, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.NumberOfAlerts, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.UserProfile, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.FuelRemaining, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.FuelTimeRemaining, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.FuelFlow, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.FuelUsed, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.FuelEconomy, BitFlags.union(DatablockCompatibility.Left, DatablockCompatibility.Right)],
  [DataBlockId.Blank, BitFlags.union(DatablockCompatibility.Top, DatablockCompatibility.Left, DatablockCompatibility.Right)],
]);

/** Map to look up the datablock size for each datablock */
export const DatablockSizeMap: Map<DataBlockId, number> = new Map([
  [DataBlockId.PrimaryComVloc, 4],
  [DataBlockId.VlocRadio, 4],
  [DataBlockId.ComVlocStandby2, 2],
  [DataBlockId.ComVlocStandby3, 2],
  [DataBlockId.ComVlocStandby4, 2],
  [DataBlockId.TransponderThumbnail, 7],
  [DataBlockId.TrafficThumbnail, 7],
  [DataBlockId.ToWaypointInformation, 4],
  [DataBlockId.NextWaypointInformation, 4],
  [DataBlockId.DesignatedWaypoint, 5],
  [DataBlockId.DestinationAlongTrackInfo, 3],
  [DataBlockId.DestinationDirectInfo, 3],
  [DataBlockId.DestinationWaypoint, 1],
  [DataBlockId.DestinationDirectDistance, 2],
  [DataBlockId.ToWaypointDirectInfo, 3],
  [DataBlockId.ToWaypointDirectDistance, 2],
  [DataBlockId.EtaAtDestination, 2],
  [DataBlockId.ToWaypointEta, 2],
  [DataBlockId.DestinationEte, 2],
  [DataBlockId.ToWaypointEte, 2],
  [DataBlockId.GpsCdi, 3],
  [DataBlockId.TrackAngleError, 2],
  [DataBlockId.DesiredTrack, 1],
  [DataBlockId.CrossTrackDistance, 2],
  [DataBlockId.NextDesiredTrack, 1],
  [DataBlockId.VerticalSpeedRequired, 1],
  [DataBlockId.NavigationMode, 2],
  [DataBlockId.ActiveGpsApproach, 3],
  [DataBlockId.DecodedVlocIdentifier, 3],
  [DataBlockId.NearestAirport, 3],
  [DataBlockId.AircraftPosition, 2],
  [DataBlockId.GpsAglAltitude, 2],
  [DataBlockId.GroundSpeed, 1],
  [DataBlockId.GroundTrack, 1],
  [DataBlockId.WindVector, 4],
  [DataBlockId.RadarAltitude, 2],
  [DataBlockId.TotalAirTemp, 1],
  [DataBlockId.StaticAirTemp, 1],
  [DataBlockId.LocalTime, 2],
  [DataBlockId.UtcTime, 1],
  [DataBlockId.FlightTimer, 2],
  [DataBlockId.NumberOfAlerts, 2],
  [DataBlockId.UserProfile, 1],
  [DataBlockId.FuelRemaining, 2],
  [DataBlockId.FuelTimeRemaining, 2],
  [DataBlockId.FuelFlow, 2],
  [DataBlockId.FuelUsed, 2],
  [DataBlockId.FuelEconomy, 2],
  [DataBlockId.Blank, 0],
]);


/**
 * Information about a datablock type
 */
export interface DatablockInfo {
  /** Unique identifier for this datablock type */
  id: DataBlockId;
  /** Display name shown in the setup menu */
  displayName: string;
  /** Size of this datablock */
  size: number;
  /** Which slot locations this datablock is compatible with */
  compatibleSlots: DatablockCompatibility;
  /** Optional description for the datablock */
  description?: string;
}

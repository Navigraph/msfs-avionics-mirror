import { Subscribable } from '@microsoft/msfs-sdk';

import { DynamicListData } from '../Components/List';
import { FlightPlanLegData, FlightPlanLegListData } from './FlightPlanLegListData';
import { FlightPlanSegmentData, FlightPlanSegmentListData } from './FlightPlanSegmentListData';
import { TemporaryWaypointListData } from './TemporaryWaypointListData';

/** Base interface for flight plan data. */
export interface FlightPlanBaseData {
  /** The type of flight plan list item. */
  readonly type: string;
}

/** Type for a data item in the flight plan. */
export type FlightPlanDataObject = FlightPlanSegmentData | FlightPlanLegData;

/** Base interface for flight plan list data. */
export interface FlightPlanBaseListData extends DynamicListData {
  /** The type of flight plan list item. */
  readonly type: string;
  /** @inheritdoc */
  readonly isVisible: Subscribable<boolean>;
  /** @inheritdoc */
  readonly heightPx: number | Subscribable<number>;
}

/** Type for an item in the flight plan list. */
export type FlightPlanListData = FlightPlanSegmentListData | FlightPlanLegListData | TemporaryWaypointListData;

/** Type for a selectable item in the flight plan list. */
export type SelectableFlightPlanListData = FlightPlanLegListData;

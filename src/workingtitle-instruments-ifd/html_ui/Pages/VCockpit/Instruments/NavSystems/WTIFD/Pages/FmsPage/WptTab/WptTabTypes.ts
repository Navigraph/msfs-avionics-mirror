import { UserFacility } from '@microsoft/msfs-sdk';

import { DynamicListData } from '../../../Components/List';

/** An interface containing data for the waypoint list. */
export interface WaypointListData extends DynamicListData {
  /** The facility to display */
  facility: UserFacility;
}

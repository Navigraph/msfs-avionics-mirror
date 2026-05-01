import { IcaoValue } from '@microsoft/msfs-sdk';

import { DisplayPaneIndex } from './DisplayPaneTypes';

/**
 * Base common data events published by display pane views.
 */
export interface BaseDisplayPaneViewDataEvents {
  /**
   * The ICAO of the current hovered map waypoint. If there is no hovered waypoint or the hovered waypoint cannot be
   * identified by an ICAO, then this will be the empty ICAO.
   */
  display_pane_comm_map_hovered_waypoint_icao: IcaoValue;
}

/**
 * Indexed common data events published by display pane views.
 */
export type IndexedDisplayPaneViewDataEvents<I extends DisplayPaneIndex> = {
  [P in keyof BaseDisplayPaneViewDataEvents as `${P}_${I}`]: BaseDisplayPaneViewDataEvents[P];
}

/**
 * Common data events published by display pane views.
 */
export type DisplayPaneViewDataEvents = IndexedDisplayPaneViewDataEvents<DisplayPaneIndex>;

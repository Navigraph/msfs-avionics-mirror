import { SelectableFlightPlanListData } from '../../FlightPlan';

/** Events from the FMS page. */
export interface FmsPageEvents {
  /** The currently selected flight plan item, or undefined if none. */
  fms_page_fpl_selected_item: SelectableFlightPlanListData | undefined;
  /** Whether the direct to dialog is open. */
  fms_page_direct_to_open: boolean;
}

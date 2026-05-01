import { MapOwnAirplanePropsModule, MapSystemKeys, MapTerrainColorsModule } from '@microsoft/msfs-sdk';

import { MapKeys } from './MapKeys';
import { MapDragPanModule } from './Modules/MapDragPanModule';
import { MapIfdTrafficModule } from './Modules/MapIfdTrafficModule';
import { MapStylesModule } from './Modules/MapStylesModule';
import { VNavDataModule } from './Modules/VNavDataModule';
import { MapFlightPlanFocusModule } from './Modules/MapFlightPlanFocusModule';

/** Map modules used by IFD maps. */
export interface MapModules {
  /** TerrainColors */
  [MapSystemKeys.TerrainColors]: MapTerrainColorsModule;

  /** Own airplane props module. */
  [MapSystemKeys.OwnAirplaneProps]: MapOwnAirplanePropsModule,

  /** Traffic module */
  [MapSystemKeys.Traffic]: MapIfdTrafficModule;

  /** MapStyles module */
  [MapKeys.MapStyles]: MapStylesModule;

  /** VNavData module */
  [MapKeys.VNavData]: VNavDataModule;

  /** Map Drag Pan module */
  [MapKeys.DragPan]: MapDragPanModule;

  /** Map Flight Plan Focus module */
  [MapKeys.FlightPlanFocusModule]: MapFlightPlanFocusModule;
}

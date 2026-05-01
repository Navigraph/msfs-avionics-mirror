import {
  MapCullableTextLabelManager, MapWaypointRenderer as BaseMapWaypointRenderer, Waypoint, MapWaypointRendererEntry,
  MapWaypointRenderRoleDef
} from '@microsoft/msfs-sdk';

/**
 * Render roles for MapWaypointRenderer.
 */
export enum MapWaypointRenderRole {
  /** A highlighted waypoint. */
  Highlight = 1 << 0,

  /** A waypoint which is the active waypoint in a flight plan. */
  FlightPlanActive = 1 << 1,

  /** A waypoint in a flight plan which is not the active waypoint. */
  FlightPlanInactive = 1 << 2,

  /** A normally displayed waypoint. */
  Normal = 1 << 3,

  /** A waypoint in an airway. */
  Airway = 1 << 4,

  /** A VNAV waypoint. */
  VNav = 1 << 5,

  /** A waypoint in a procedure preview plan. */
  ProcedurePreview = 1 << 6,

  /** A waypoint in a procedure transition preview plan. */
  ProcedureTransitionPreview = 1 << 7,

  /** A hovered waypoint. */
  Hover = 1 << 31,
}

/**
 * A renderer which draws waypoints to a Garmin-style map.
 */
export class MapWaypointRenderer extends BaseMapWaypointRenderer<Waypoint> {
  private static readonly SINGLE_ROLES = [
    MapWaypointRenderRole.Hover,
    MapWaypointRenderRole.Highlight,
    MapWaypointRenderRole.FlightPlanActive,
    MapWaypointRenderRole.FlightPlanInactive,
    MapWaypointRenderRole.ProcedurePreview,
    MapWaypointRenderRole.ProcedureTransitionPreview,
    MapWaypointRenderRole.Normal,
    MapWaypointRenderRole.Airway,
    MapWaypointRenderRole.VNav,
  ];

  private static readonly HOVER_COMBINED_ROLES = [
    MapWaypointRenderRole.Highlight,
    MapWaypointRenderRole.FlightPlanActive,
    MapWaypointRenderRole.FlightPlanInactive,
    MapWaypointRenderRole.ProcedurePreview,
    MapWaypointRenderRole.ProcedureTransitionPreview,
    MapWaypointRenderRole.Normal,
    MapWaypointRenderRole.Airway,
    MapWaypointRenderRole.VNav,
  ];

  /**
   * Creates a new instance of MapWaypointRenderer.
   * @param textManager The text label manager to use for waypoint labels.
   */
  public constructor(
    textManager: MapCullableTextLabelManager,
  ) {
    super(textManager, MapWaypointRenderer.selectRoleToRender);

    for (const role of MapWaypointRenderer.SINGLE_ROLES) {
      this.addRenderRole(role);
    }

    for (const role of MapWaypointRenderer.HOVER_COMBINED_ROLES) {
      this.addRenderRole(role | MapWaypointRenderRole.Hover);
    }
  }

  /**
   * Selects a render role to use to render a waypoint.
   * @param entry An entry describing the waypoint to render.
   * @param roleDefinitions A map from render roles to their definitions.
   * @returns The render role to use to render the specified waypoint.
   */
  private static selectRoleToRender(
    entry: MapWaypointRendererEntry<Waypoint>,
    roleDefinitions: ReadonlyMap<number, Readonly<MapWaypointRenderRoleDef<Waypoint>>>
  ): number {
    for (const role of MapWaypointRenderer.HOVER_COMBINED_ROLES) {
      if (
        entry.isAllRoles(role | MapWaypointRenderRole.Hover)
        && roleDefinitions.get(role)!.visibilityHandler(entry.waypoint)
        && roleDefinitions.get(MapWaypointRenderRole.Hover)!.visibilityHandler(entry.waypoint)
      ) {
        return role | MapWaypointRenderRole.Hover;
      }
    }

    for (const role of MapWaypointRenderer.SINGLE_ROLES) {
      if (entry.isAllRoles(role) && roleDefinitions.get(role)!.visibilityHandler(entry.waypoint)) {
        return role;
      }
    }

    return 0;
  }
}

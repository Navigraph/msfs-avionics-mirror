/* eslint-disable jsdoc/require-jsdoc */
import {
  APLateralModes, BitFlags, EventBus, Facility, FacilityType, FacilityWaypoint, FacilityWaypointUtils, FlightPathLegRenderPart, FlightPathRenderStyle,
  FlightPathVectorStyle, FlightPathWaypoint, FlightPlan, FlightPlanDisplayBuilder, FlightPlanner, ICAO, ImageCache, LegDefinition, LegDefinitionFlags,
  LegStyleHandler, MapCullableLocationTextLabel, MapFlightPlanModule, MapLocationTextLabelOptions, MapSystemContext, MapSystemKeys, MapSystemWaypointRoles,
  MapWaypointImageIcon, Subscribable, Vec2Math, VorFacility, Waypoint, WaypointDisplayBuilder, WaypointTypes
} from '@microsoft/msfs-sdk';

import { ActiveWaypointIcon } from '../Components/Map/ActiveWaypoint';
import { AirportSize, AirportWaypoint } from '../Components/Map/AirportWaypoint';
import { MapAirportIcon } from '../Components/Map/MapAirportIcon';
import { FmsUtils } from '../Fms';
import { Colors, ColorValue } from '../Misc/Colors';
import { MapDataProvider } from '../Providers/Map/MapDataProvider';
import { FlightPathWaypointLabel } from './Components/FlightPathWaypointLabel';
import { MapCommon, MapLabelPriority } from './MapCommon';
import { MapSystemCommon } from './MapSystemCommon';
import { MapStyles } from './Modules/MapStylesModule';

/**
 * A map system config for IFD maps.
 */
export class MapSystemConfig {
  private readonly MAP_ICON_SIZE = Vec2Math.create(
    this.mapStyles.mapIconSize,
    this.mapStyles.mapIconSize
  );
  private readonly MAP_AIRPORT_ICON_SIZE = Vec2Math.create(
    this.mapStyles.mapIconSize * 2,
    this.mapStyles.mapIconSize * 2
  );
  private readonly FLIGHT_PLAN_ICON_SIZE = Vec2Math.create(
    this.mapStyles.flightPlanIconSize,
    this.mapStyles.flightPlanIconSize
  );
  private readonly LNAV_ENGAGED_MODES = [
    APLateralModes.GPSS,
    APLateralModes.NAV,
  ];
  private nextLegIndex = -1;
  private nextWaypointIndex = -1;

  private readonly MagentaPath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: this.mapStyles.strokeWidth + 1,
    style: Colors.magenta,
    outlineWidth: this.mapStyles.outlineWidth,
  };

  private readonly MagentaDashedPath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: this.mapStyles.strokeWidth + 1,
    style: Colors.magenta,
    outlineWidth: this.mapStyles.outlineWidth,
    dash: [10, 10],
  };

  private readonly GreenPath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: this.mapStyles.strokeWidth + 1,
    style: Colors.green,
    outlineWidth: this.mapStyles.outlineWidth,
  };

  private readonly WhitePath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: this.mapStyles.strokeWidth + 1,
    style: Colors.white,
    outlineWidth: this.mapStyles.outlineWidth,
  };

  private readonly WhiteDashedPath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: this.mapStyles.strokeWidth + 1,
    style: Colors.white,
    dash: [14, 10],
    outlineWidth: this.mapStyles.outlineWidth,
    lineCap: 'round',
  };

  private readonly WhiteDottedPath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: (this.mapStyles.strokeWidth + 1) * 1.5,
    style: Colors.white,
    dash: [0.75, 10],
    outlineWidth: this.mapStyles.outlineWidth,
    lineCap: 'round',
  };

  private readonly CyanDashedPath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: this.mapStyles.strokeWidth + 1,
    style: Colors.cyan,
    dash: [24, 10],
    outlineWidth: this.mapStyles.outlineWidth,
    lineCap: 'round',
  };

  private readonly CyanPath: FlightPathRenderStyle = {
    isDisplayed: true,
    width: this.mapStyles.strokeWidth + 1,
    style: Colors.cyan,
    outlineWidth: this.mapStyles.outlineWidth,
  };

  private readonly HoldLegWhitePath: FlightPathVectorStyle = {
    partsToRender:
      FlightPathLegRenderPart.Base | FlightPathLegRenderPart.Ingress,
    styleBuilder: this.buildWhiteHoldStyle.bind(this),
  };

  private readonly HoldLegMagentaPath: FlightPathVectorStyle = {
    partsToRender:
      FlightPathLegRenderPart.Base | FlightPathLegRenderPart.Ingress,
    styleBuilder: this.buildMagentaHoldStyle.bind(this),
  };

  private readonly HoldLegGreenPath: FlightPathVectorStyle = {
    partsToRender:
      FlightPathLegRenderPart.Base | FlightPathLegRenderPart.Ingress,
    styleBuilder: this.buildGreenHoldStyle.bind(this),
  };

  private readonly HoldLegCyanPath: FlightPathVectorStyle = {
    partsToRender:
      FlightPathLegRenderPart.Base | FlightPathLegRenderPart.Ingress,
    styleBuilder: this.buildCyanHoldStyle.bind(this),
  };

  private readonly HoldLegWhiteDashedPath: FlightPathVectorStyle = {
    partsToRender:
      FlightPathLegRenderPart.Base | FlightPathLegRenderPart.Ingress,
    styleBuilder: this.buildWhiteDashedHoldStyle.bind(this),
  };

  private readonly HoldLegWhiteDottedPath: FlightPathVectorStyle = {
    partsToRender:
      FlightPathLegRenderPart.Base | FlightPathLegRenderPart.Ingress,
    styleBuilder: this.buildWhiteDottedHoldStyle.bind(this),
  };

  private readonly HoldLegCyanDashedPath: FlightPathVectorStyle = {
    partsToRender:
      FlightPathLegRenderPart.Base | FlightPathLegRenderPart.Ingress,
    styleBuilder: this.buildCyanDashedHoldStyle.bind(this),
  };

  private readonly FlightPathWaypointLabelOptions: MapLocationTextLabelOptions =
    {
      anchor: new Float64Array([0.5, 2.2]),
      fontSize: this.mapStyles.labelFontSize,
      font: MapCommon.fontBold,
      fontOutlineWidth: this.mapStyles.fontOutlineWidth,
      fontOutlineColor: Colors.black,
      offset: this.mapStyles.labelOffset,
    } as const;

  private readonly WhiteAndMagentaDashedPath: readonly [
    FlightPathRenderStyle,
    FlightPathRenderStyle
  ] = [this.WhitePath, this.MagentaDashedPath];

  /**
   * Creates a new map system config.
   * @param mapStyles the IFD map styles.
   * @param flightplanner instance of flightplanner
   * @param bus The event bus to use for this map system.
   */
  public constructor(
    private readonly mapStyles: MapStyles,
    private readonly flightplanner: FlightPlanner,
    private readonly bus: EventBus,
  ) { }

  /**
   * Builds non-active leg style for hold legs.
   * @returns The appropriate hold leg display style.
   */
  private buildWhiteHoldStyle(): FlightPathRenderStyle {
    return this.WhitePath;
  }

  /**
   * Builds active leg style for hold legs.
   * @returns The appropriate hold leg display style.
   */
  private buildMagentaHoldStyle(): FlightPathRenderStyle {
    return this.MagentaPath;
  }

  /**
   * Builds active leg style for hold legs.
   * @returns The appropriate hold leg display style.
   */
  private buildGreenHoldStyle(): FlightPathRenderStyle {
    return this.GreenPath;
  }

  /**
   * Builds leg style for hold legs on the missed approach.
   * @returns The appropriate hold leg display style.
   */
  private buildCyanHoldStyle(): FlightPathRenderStyle {
    return this.CyanPath;
  }

  /**
   * Builds mod leg style for hold legs.
   * @returns The appropriate hold leg display style.
   */
  private buildWhiteDashedHoldStyle(): FlightPathRenderStyle {
    return this.WhiteDashedPath;
  }

  /**
   * Builds mod leg style for hold legs.
   * @returns The appropriate hold leg display style.
   */
  private buildWhiteDottedHoldStyle(): FlightPathRenderStyle {
    return this.WhiteDottedPath;
  }

  /**
   * Builds inactive plan leg style for hold legs.
   * @returns The appropriate hold leg display style.
   */
  private buildCyanDashedHoldStyle(): FlightPathRenderStyle {
    return this.CyanDashedPath;
  }

  /**
   * Builds a label for facility waypoints.
   * @param color The color of the label.
   * @param maxRange The max range at which this label should be visible.
   * @param currentRange The current range setting of the map.
   * @param options Additional options for the label.
   * @returns A new factory that will create the label.
   */
  private buildFacilityLabel(
    color: string,
    maxRange: number,
    currentRange: Subscribable<number>,
    options?: Partial<MapLocationTextLabelOptions>
  ): (w: FacilityWaypoint) => MapCullableLocationTextLabel {
    return (w: FacilityWaypoint): MapCullableLocationTextLabel => {
      const defaultOptions: MapLocationTextLabelOptions = {
        fontColor: color,
        font: MapCommon.fontBold,
        fontOutlineWidth: this.mapStyles.fontOutlineWidth,
        fontOutlineColor: Colors.black,
        offset: this.mapStyles.labelOffset,
        anchor: this.mapStyles.labelAnchor,
      };

      // check if it's a large airport
      const isLargerAirport =
        w instanceof AirportWaypoint && w.size !== AirportSize.Small;
      if (!isLargerAirport) {
        defaultOptions.fontSize = currentRange.map((range) =>
          range <= maxRange ? this.mapStyles.labelFontSize : 0
        );
      } else {
        defaultOptions.fontSize = currentRange.map((range) =>
          range <= 50 ? this.mapStyles.labelFontSize : 0
        );
      }

      const mergedOptions: MapLocationTextLabelOptions = {
        ...defaultOptions,
        ...options,
      };

      const label = new MapCullableLocationTextLabel(
        ICAO.getIdent(w.facility.get().icao),
        MapLabelPriority.Bottom,
        w.location,
        false,
        mergedOptions
      );

      return label;
    };
  }

  /**
   * Builds an icon for a waypoint.
   * @param id The ID of the icon.
   * @param priority The render priority of this icon.
   * @returns A factory that builds the image icon.
   */
  private buildActiveWaypointIcon(
    id: string,
    priority = 0
  ): (w: Waypoint) => MapWaypointImageIcon<any> {
    return (w: Waypoint) =>
      new ActiveWaypointIcon(
        w,
        priority,
        ImageCache.get(id),
        this.FLIGHT_PLAN_ICON_SIZE
      );
  }

  /**
   * Configures the map waypoint display layer.
   * @param bus The event bus.
   * @param mapDataProvider The map data provider.
   * @returns A builder function to configure the waypoint display system.
   */
  public readonly configureMapWaypoints = (
    bus: EventBus,
    mapDataProvider: MapDataProvider
  ): ((builder: WaypointDisplayBuilder) => void) => {
    return (builder): void => {
      builder.withSearchCenter('target');
      this.configWptRoles(
        MapSystemWaypointRoles.Normal,
        builder,
        mapDataProvider.mapRange
      );
    };
  };

  /**
   * Configures the map waypoint role styles.
   * @param role The role to configure.
   * @param builder The waypoint display builder
   * @param rangeSetting The map range setting.
   */
  private configWptRoles(
    role: number | string,
    builder: WaypointDisplayBuilder,
    rangeSetting: Subscribable<number>
  ): void {
    builder
      .addDefaultIcon(
        role,
        (w) =>
          new MapWaypointImageIcon(
            w,
            0,
            ImageCache.get('INTERSECTION'),
            this.MAP_ICON_SIZE
          )
      )
      .addDefaultLabel(
        role,
        this.buildFacilityLabel(Colors.lightGrey, 3, rangeSetting, {
          anchor: MapSystemCommon.labelAnchor,
          offset: MapSystemCommon.labelOffset,
        })
      ) // intersection
      .addLabel(
        role,
        WaypointTypes.Airport,
        this.buildFacilityLabel(Colors.white, 5, rangeSetting, {
          anchor: MapSystemCommon.labelAnchor,
          offset: MapSystemCommon.labelOffset,
        })
      )
      .addIcon(
        role,
        WaypointTypes.Airport,
        (w: AirportWaypoint) => new MapAirportIcon(
          w,
          0,
          w.facility.get().towered ? ImageCache.get('AIRPORT_TOWERED') : ImageCache.get('AIRPORT'),
          this.MAP_AIRPORT_ICON_SIZE,
          rangeSetting
        )
      )
      .addLabel(
        role,
        WaypointTypes.NDB,
        this.buildFacilityLabel(Colors.white, 50, rangeSetting, {
          anchor: MapSystemCommon.labelAnchor,
          offset: MapSystemCommon.labelOffset,
        })
      )
      .addIcon(
        role,
        WaypointTypes.NDB,
        (w) =>
          new MapWaypointImageIcon(
            w,
            0,
            ImageCache.get('NDB'),
            this.MAP_ICON_SIZE
          )
      )
      .addLabel(
        role,
        WaypointTypes.VOR,
        this.buildFacilityLabel(Colors.white, 100, rangeSetting,
          {
            anchor: MapSystemCommon.labelAnchor,
            offset: MapSystemCommon.labelOffset,
          }
        )
      )
      .addIcon(role, WaypointTypes.VOR, (w: FacilityWaypoint<VorFacility>) => new MapWaypointImageIcon(w, 0, ImageCache.get('VOR'), this.MAP_ICON_SIZE));
  }

  /**
   * Configures the map flight plan display layer for the mod flight plan.
   * @param mapDataProvider The map data provider.
   * @returns A builder function to configure the mod flight plan display system.
   */
  public readonly configureModFlightPlan = (mapDataProvider: MapDataProvider): (builder: FlightPlanDisplayBuilder) => void => {
    return (builder): void => {
      builder
        .registerRole(FlightPlanPathRoles.Previewing)
        .addDefaultIcon(FlightPlanPathRoles.Previewing, (w) => new MapWaypointImageIcon(w, 999, ImageCache.get('FLIGHTPLAN_C'), this.FLIGHT_PLAN_ICON_SIZE))
        .addDefaultLabel(FlightPlanPathRoles.Previewing, (waypoint) =>
          this.getFlightPlanWaypointLabel(waypoint, Colors.cyan, mapDataProvider)
        )
        .withAnticipationTurns(true)
        .withLegPathStyles(() => this.CyanPath)
        .withLegWaypointRoles(() => builder.getRoleId(FlightPlanPathRoles.Previewing));
    };
  };

  /**
   * Configures the map flight plan display layer.
   * @param mapDataProvider The map data provider.
   * @returns A builder function to configure the flight plan display system.
   */
  public readonly configureFlightPlan = (mapDataProvider: MapDataProvider): ((
      builder: FlightPlanDisplayBuilder,
      context: MapSystemContext<{
        [MapSystemKeys.FlightPlan]: MapFlightPlanModule;
      }>
    ) => void) => {
    return (builder): void => {
      builder
        .registerRole(FlightPlanPathRoles.Inactive)
        .registerRole(FlightPlanPathRoles.Current)
        .registerRole(FlightPlanPathRoles.Next)
        .addDefaultIcon(
          FlightPlanPathRoles.Inactive,
          (w) =>
            new MapWaypointImageIcon(
              w,
              999,
              ImageCache.get('FLIGHTPLAN'),
              this.FLIGHT_PLAN_ICON_SIZE
            )
        )
        .addDefaultIcon(
          FlightPlanPathRoles.Current,
          (w) =>
            new MapWaypointImageIcon(
              w,
              999,
              ImageCache.get('FLIGHTPLAN_M'),
              this.FLIGHT_PLAN_ICON_SIZE
            )
        )
        .addDefaultIcon(
          FlightPlanPathRoles.Next,
          (w) =>
            new MapWaypointImageIcon(
              w,
              999,
              ImageCache.get('FLIGHTPLAN'),
              this.FLIGHT_PLAN_ICON_SIZE
            )
        )
        .addDefaultLabel(FlightPlanPathRoles.Inactive, (waypoint) =>
          this.getFlightPlanWaypointLabel(waypoint, Colors.white, mapDataProvider)
        )
        .addDefaultLabel(FlightPlanPathRoles.Current, (waypoint) =>
          this.getFlightPlanWaypointLabel(waypoint, Colors.magenta, mapDataProvider)
        )
        .addDefaultLabel(FlightPlanPathRoles.Next, (waypoint) =>
          this.getFlightPlanWaypointLabel(waypoint, Colors.white, mapDataProvider)
        )
        .withAnticipationTurns(true)
        .withLegPathStyles(((_plan, leg, activeLeg, legIndex) => {
          const isMissedApproachLeg = BitFlags.isAll(
            leg.flags,
            LegDefinitionFlags.MissedApproach
          );
          const isHoldLeg = FmsUtils.isHoldAtLeg(leg.leg.type);

          if (isMissedApproachLeg) {
            return isHoldLeg
              ? this.HoldLegWhiteDottedPath
              : this.WhiteDottedPath;
          }

          if (activeLeg && activeLeg.name === leg.name) {
            this.nextLegIndex = legIndex + 1;
            return this.MagentaPath;
          }

          if (legIndex === this.nextLegIndex) {
            this.nextLegIndex = -1;
            return this.WhiteAndMagentaDashedPath;
          }

          return this.WhitePath;
        }) as LegStyleHandler)
        .withLegWaypointRoles((_plan, leg, activeLeg, legIndex) => {
          if (activeLeg && activeLeg.name === leg.name) {
            this.nextWaypointIndex = legIndex + 1;
            return builder.getRoleId(FlightPlanPathRoles.Current);
          }
          if (legIndex === this.nextWaypointIndex) {
            this.nextWaypointIndex = -1;
            return builder.getRoleId(FlightPlanPathRoles.Next);
          }
          return builder.getRoleId(FlightPlanPathRoles.Inactive);
        });
    };
  };

  /**
   * Checks if leg is the origin or destination airport leg or runway leg.
   * @param plan the plan.
   * @param leg the leg.
   * @returns Whether leg is the origin or destination airport leg or runway leg.
   */
  private isOriginDestOrRunwayLeg(
    plan: FlightPlan,
    leg: LegDefinition
  ): boolean {
    const isOriginOrDestinationAirportLeg =
      leg.leg.fixIcao === plan.originAirport ||
      leg.leg.fixIcao === plan.destinationAirport;

    const isRunwayLeg = ICAO.isFacility(leg.leg.fixIcao, FacilityType.RWY);

    return isOriginOrDestinationAirportLeg || isRunwayLeg;
  }

  /**
   * Builds a label for flight plan waypoints.
   * @param waypoint Waypoint
   * @param fontColor The color of the label.
   * @param mapDataProvider The map data provider.
   * @returns A new factory that will create the label.
   */
  private getFlightPlanWaypointLabel(
    waypoint: Waypoint,
    fontColor: ColorValue,
    mapDataProvider: MapDataProvider
  ): MapCullableLocationTextLabel {
    let ident = '';
    if (waypoint instanceof FlightPathWaypoint) {
      ident = waypoint.ident;
    } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
      const facility = (waypoint as FacilityWaypoint<Facility>).facility.get();
      ident = ICAO.getIdent(facility.icao);
    }
    return new FlightPathWaypointLabel(
      waypoint,
      this.flightplanner,
      { ...this.FlightPathWaypointLabelOptions, fontColor },
      this.mapStyles.labelLineHeight,
      ident,
      mapDataProvider,
      this.bus,
    );
  }
}

enum FlightPlanPathRoles {
  Inactive = 'Inactive',
  Current = 'Current',
  Next = 'Next',
  Previewing = 'Previewing',
}

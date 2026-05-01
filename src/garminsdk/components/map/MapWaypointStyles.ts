import {
  BitFlags, FacilityType, FacilityWaypointUtils, FlightPathWaypoint, ICAO, MapLocationTextLabelOptions,
  ReadonlyFloat64Array, RunwaySurfaceCategory, Vec2Math, VecNMath, Waypoint
} from '@microsoft/msfs-sdk';

import { AirportSize, AirportWaypoint } from '../../navigation/AirportWaypoint';
import { ProcedureTurnLegWaypoint } from './flightplan/MapFlightPlanWaypointRecord';
import { MapRunwayLabelWaypoint } from './MapRunwayLabelWaypoint';
import { MapRunwayOutlineWaypoint } from './MapRunwayOutlineWaypoint';
import {
  MapRunwayOutlineIconStyles, MapWaypointIconHighlightStyles, MapWaypointIconStyles, MapWaypointLabelStyles
} from './MapWaypointDisplayBuilder';
import { MapWaypointRenderRole } from './MapWaypointRenderer';

/**
 * Render priority values.
 */
type Priorities = {
  /** The base priority. */
  base: number;

  /** Priorities for airport waypoints. */
  airport: {
    /** Priorities for large airport waypoints. */
    [AirportSize.Large]: number;

    /** Priorities for medium airport waypoints. */
    [AirportSize.Medium]: number;

    /** Priorities for small airport waypoints. */
    [AirportSize.Small]: number;
  };

  /** Priorities for VOR waypoints. */
  vor: number;

  /** Priorities for NDB waypoints. */
  ndb: number;

  /** Priorities for intersection waypoints. */
  int: number;

  /** Priorities for runway waypoints. */
  rwy: number;

  /** Priorities for user waypoints. */
  user: number;

  /** Priorities for flight plan waypoints. */
  fp: number;
};

/**
 * Label font parameters.
 */
type Font = {
  /** The font family. */
  font: string;

  /** The large font size. */
  largeFontSize: number;

  /** The regular font size. */
  regularFontSize: number;

  /** The large font size for flight plan labels. */
  fpLargeFontSize: number;

  /** The regular font size for flight plan labels. */
  fpRegularFontSize: number;
};

/**
 * A utility class for generating next-generation (NXi, G3000, etc) Garmin map waypoint styles.
 */
export class NextGenMapWaypointStyles {
  /**
   * Gets a set of render priorities for a given base priority. All render priorities are guaranteed to be in the range
   * `[basePriority, basePriority + 1)`.
   * @param basePriority The base priority for which to get a set of render priorities.
   * @returns A set of render priorities for the specified base priority.
   */
  private static getPriorities(basePriority: number): Priorities {
    return {
      base: basePriority,
      airport: {
        [AirportSize.Large]: basePriority + 0.8,
        [AirportSize.Medium]: basePriority + 0.79,
        [AirportSize.Small]: basePriority + 0.78
      },
      vor: basePriority + 0.7,
      ndb: basePriority + 0.6,
      int: basePriority + 0.5,
      rwy: basePriority + 0.4,
      user: basePriority + 0.9,
      fp: basePriority + 0.1,
    };
  }

  /**
   * Gets font parameters.
   * @param fontType The font type.
   * @param scale The font scale.
   * @returns Font parameters for the specified font type and scale.
   */
  private static getFont(fontType: 'Roboto' | 'DejaVu', scale: number): Font {
    if (fontType === 'Roboto') {
      return {
        font: 'Roboto',
        largeFontSize: 20 * scale,
        regularFontSize: 16 * scale,
        fpLargeFontSize: 20 * scale,
        fpRegularFontSize: 16 * scale,
      };
    } else {
      return {
        font: 'DejaVuSans-SemiBold',
        largeFontSize: 17 * scale,
        regularFontSize: 14 * scale,
        fpLargeFontSize: 17 * scale,
        fpRegularFontSize: 17 * scale,
      };
    }
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for normal waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param scale The scaling factor for the icons. The larger the value, the larger the rendered icons. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for normal waypoints.
   */
  public static normalIconStyles(basePriority: number, scale = 1): (waypoint: Waypoint) => MapWaypointIconStyles {
    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const airportSize = Vec2Math.create(26 * scale, 26 * scale);
    const standardSize = Vec2Math.create(32 * scale, 32 * scale);

    const airportStyle = {
      [AirportSize.Large]: { priority: priorities.airport[AirportSize.Large], size: airportSize },
      [AirportSize.Medium]: { priority: priorities.airport[AirportSize.Medium], size: airportSize },
      [AirportSize.Small]: { priority: priorities.airport[AirportSize.Small], size: airportSize }
    };

    const vorStyle = { priority: priorities.vor, size: standardSize };
    const ndbStyle = { priority: priorities.ndb, size: standardSize };
    const intStyle = { priority: priorities.int, size: standardSize };
    const userStyle = { priority: priorities.user, size: standardSize };

    const defaultStyle = { priority: basePriority, size: standardSize };

    return (waypoint: Waypoint): MapWaypointIconStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.USR:
            return userStyle;
        }
      }

      return defaultStyle;
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for normal waypoints.
   * @param basePriority The base label render priority. Label priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param fontType The type of font to use for the labels.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered labels. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for normal waypoints.
   */
  public static normalLabelStyles(
    basePriority: number,
    fontType: 'Roboto' | 'DejaVu',
    scale = 1
  ): (waypoint: Waypoint) => MapWaypointLabelStyles {
    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const { font, largeFontSize, regularFontSize } = NextGenMapWaypointStyles.getFont(fontType, scale);

    const airportOptions = {
      [AirportSize.Large]: NextGenMapWaypointStyles.createNormalLabelOptions(Vec2Math.create(0, -12 * scale), font, largeFontSize),
      [AirportSize.Medium]: NextGenMapWaypointStyles.createNormalLabelOptions(Vec2Math.create(0, -12 * scale), font, regularFontSize),
      [AirportSize.Small]: NextGenMapWaypointStyles.createNormalLabelOptions(Vec2Math.create(0, -12 * scale), font, regularFontSize)
    };

    const standardOptions = NextGenMapWaypointStyles.createNormalLabelOptions(Vec2Math.create(0, -8 * scale), font, regularFontSize);
    const intOptions = NextGenMapWaypointStyles.createNormalLabelOptions(Vec2Math.create(0, -5 * scale), font, regularFontSize);

    const runwayOutlineOptions = NextGenMapWaypointStyles.createRunwayLabelOptions(Vec2Math.create(0, -5 * scale), font, largeFontSize, 7 * scale);

    const airportStyle = {
      [AirportSize.Large]: { priority: priorities.airport[AirportSize.Large], alwaysShow: false, options: airportOptions[AirportSize.Large] },
      [AirportSize.Medium]: { priority: priorities.airport[AirportSize.Medium], alwaysShow: false, options: airportOptions[AirportSize.Medium] },
      [AirportSize.Small]: { priority: priorities.airport[AirportSize.Small], alwaysShow: false, options: airportOptions[AirportSize.Small] }
    };

    const vorStyle = { priority: priorities.vor, alwaysShow: false, options: standardOptions };
    const ndbStyle = { priority: priorities.ndb, alwaysShow: false, options: standardOptions };
    const intStyle = { priority: priorities.int, alwaysShow: false, options: intOptions };
    const userStyle = { priority: priorities.user, alwaysShow: false, options: standardOptions };

    const runwayOutlineStyle = { priority: basePriority + 0.75, alwaysShow: false, options: runwayOutlineOptions };

    const defaultStyle = { priority: basePriority, alwaysShow: false, options: standardOptions };

    return (waypoint: Waypoint): MapWaypointLabelStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (waypoint instanceof MapRunwayLabelWaypoint) {
        return runwayOutlineStyle;
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.USR:
            return userStyle;
        }
      }

      return defaultStyle;
    };
  }

  /**
   * Creates initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in a normal
   * role.
   * @param offset The label offset, in pixels.
   * @param font The name of the label font.
   * @param fontSize The font size of the label, in pixels.
   * @returns Initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in a normal
   * role.
   */
  private static createNormalLabelOptions(offset: ReadonlyFloat64Array, font: string, fontSize: number): MapLocationTextLabelOptions {
    return {
      anchor: Vec2Math.create(0.5, 1),
      offset,
      font,
      fontSize,
      fontOutlineWidth: 6
    };
  }

  /**
   * Creates initialization options for next-generation (NXi, G3000, etc) style runway labels.
   * @param offset The label offset, in pixels.
   * @param font The name of the label font.
   * @param fontSize The font size of the label, in pixels.
   * @param borderRadius The border radius of the label, in pixels.
   * @returns Initialization options for next-generation (NXi, G3000, etc) style runway labels rendered in a normal
   * role.
   */
  private static createRunwayLabelOptions(offset: ReadonlyFloat64Array, font: string, fontSize: number, borderRadius: number): MapLocationTextLabelOptions {
    return {
      anchor: Vec2Math.create(0.5, 1),
      offset,
      font,
      fontSize,
      fontColor: '#123086',
      fontOutlineWidth: 0,
      showBg: true,
      bgPadding: VecNMath.create(4, 1, 3, 1, 3),
      bgColor: 'white',
      bgOutlineWidth: 1,
      bgOutlineColor: '#123086',
      bgBorderRadius: borderRadius
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for runway outline waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for normal waypoints.
   */
  public static runwayOutlineIconStyles(basePriority: number): (waypoint: MapRunwayOutlineWaypoint) => MapRunwayOutlineIconStyles {
    const priority = basePriority;

    const hardStyle = { priority, options: { fillStyle: '#afafaf' } };
    const softStyle = { priority, options: { fillStyle: '#006400' } };
    const waterStyle = { priority, options: { fillStyle: 'transparent' } };

    return (waypoint: MapRunwayOutlineWaypoint): MapRunwayOutlineIconStyles => {
      switch (waypoint.surfaceCategory) {
        case RunwaySurfaceCategory.Hard:
          return hardStyle;
        case RunwaySurfaceCategory.Soft:
          return softStyle;
        case RunwaySurfaceCategory.Water:
          return waterStyle;
        default:
          return hardStyle;
      }
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for flight plan waypoints.
   * @param active Whether to retrieve styles for active flight plan waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param scale The scaling factor for the icons. The larger the value, the larger the rendered icons. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for flight plan waypoints.
   */
  public static flightPlanIconStyles(active: boolean, basePriority: number, scale = 1): (waypoint: Waypoint) => MapWaypointIconStyles {
    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const airportSize = Vec2Math.create(26 * scale, 26 * scale);
    const standardSize = Vec2Math.create(32 * scale, 32 * scale);
    const fpIconSize = Vec2Math.create(8 * scale, 8 * scale);

    const airportStyle = {
      [AirportSize.Large]: { priority: priorities.airport[AirportSize.Large], size: airportSize },
      [AirportSize.Medium]: { priority: priorities.airport[AirportSize.Medium], size: airportSize },
      [AirportSize.Small]: { priority: priorities.airport[AirportSize.Small], size: airportSize }
    };

    const vorStyle = { priority: priorities.vor, size: standardSize };
    const ndbStyle = { priority: priorities.ndb, size: standardSize };
    const intStyle = { priority: priorities.int, size: standardSize };
    const rwyStyle = { priority: priorities.rwy, size: standardSize };
    const userStyle = { priority: priorities.user, size: standardSize };
    const fpStyle = { priority: priorities.fp, size: fpIconSize };

    const defaultStyle = { priority: basePriority, size: standardSize };

    return (waypoint: Waypoint): MapWaypointIconStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.RWY:
            return rwyStyle;
          case FacilityType.USR:
            return userStyle;
        }
      } else if (waypoint instanceof FlightPathWaypoint) {
        return fpStyle;
      }

      return defaultStyle;
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for flight plan waypoints.
   * @param active Whether to retrieve styles for active flight plan waypoints.
   * @param basePriority The base label render priority. Label priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param fontType The type of font to use for the labels.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered labels. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for flight plan waypoints.
   */
  public static flightPlanLabelStyles(
    active: boolean,
    basePriority: number,
    fontType: 'Roboto' | 'DejaVu',
    scale = 1
  ): (waypoint: Waypoint) => MapWaypointLabelStyles {
    const createLabelOptions = active
      ? NextGenMapWaypointStyles.createFplActiveLabelOptions
      : NextGenMapWaypointStyles.createFplInactiveLabelOptions;

    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const { font, fpLargeFontSize: largeFontSize, fpRegularFontSize: regularFontSize } = NextGenMapWaypointStyles.getFont(fontType, scale);

    const airportOptions = {
      [AirportSize.Large]: createLabelOptions(Vec2Math.create(0, -15 * scale), font, largeFontSize),
      [AirportSize.Medium]: createLabelOptions(Vec2Math.create(0, -15 * scale), font, regularFontSize),
      [AirportSize.Small]: createLabelOptions(Vec2Math.create(0, -15 * scale), font, regularFontSize)
    };

    const vorOptions = createLabelOptions(Vec2Math.create(0, -11 * scale), font, regularFontSize);
    const ndbOptions = createLabelOptions(Vec2Math.create(0, -11 * scale), font, regularFontSize);
    const userOptions = createLabelOptions(Vec2Math.create(0, -12 * scale), font, regularFontSize);
    const smallOptions = createLabelOptions(Vec2Math.create(0, -8 * scale), font, regularFontSize);

    const airportStyle = {
      [AirportSize.Large]: { priority: priorities.airport[AirportSize.Large], alwaysShow: true, options: airportOptions[AirportSize.Large] },
      [AirportSize.Medium]: { priority: priorities.airport[AirportSize.Medium], alwaysShow: true, options: airportOptions[AirportSize.Medium] },
      [AirportSize.Small]: { priority: priorities.airport[AirportSize.Small], alwaysShow: true, options: airportOptions[AirportSize.Small] }
    };

    const vorStyle = { priority: priorities.vor, alwaysShow: true, options: vorOptions };
    const ndbStyle = { priority: priorities.ndb, alwaysShow: true, options: ndbOptions };
    const intStyle = { priority: priorities.int, alwaysShow: true, options: smallOptions };
    const rwyStyle = { priority: priorities.rwy, alwaysShow: true, options: smallOptions };
    const userStyle = { priority: priorities.user, alwaysShow: true, options: userOptions };
    const fpStyle = { priority: priorities.fp, alwaysShow: true, options: smallOptions };

    const defaultStyle = { priority: basePriority, alwaysShow: true, options: smallOptions };

    return (waypoint: Waypoint): MapWaypointLabelStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.RWY:
            return rwyStyle;
          case FacilityType.USR:
            return userStyle;
        }
      } else if (waypoint instanceof FlightPathWaypoint || waypoint instanceof ProcedureTurnLegWaypoint) {
        return fpStyle;
      }

      return defaultStyle;
    };
  }

  /**
   * Creates initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in an inactive
   * flight plan role.
   * @param offset The label offset, in pixels.
   * @param font The name of the label font.
   * @param fontSize The font size of the label, in pixels.
   * @returns Initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in an
   * inactive flight plan role.
   */
  private static createFplInactiveLabelOptions(offset: ReadonlyFloat64Array, font: string, fontSize: number): MapLocationTextLabelOptions {
    return {
      anchor: Vec2Math.create(0, 1),
      offset,
      font,
      fontSize,
      fontColor: 'black',
      fontOutlineWidth: 0,
      showBg: true,
      bgPadding: VecNMath.create(4, 1, 1, 1, 1),
      bgColor: 'white',
      bgOutlineWidth: 1,
      bgOutlineColor: 'black'
    };
  }

  /**
   * Creates initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in an active
   * flight plan role.
   * @param offset The label offset, in pixels.
   * @param font The name of the label font.
   * @param fontSize The font size of the label, in pixels.
   * @returns Initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in an active
   * flight plan role.
   */
  private static createFplActiveLabelOptions(offset: ReadonlyFloat64Array, font: string, fontSize: number): MapLocationTextLabelOptions {
    return {
      anchor: Vec2Math.create(0, 1),
      offset,
      font,
      fontSize,
      fontColor: 'magenta',
      fontOutlineWidth: 0,
      showBg: true,
      bgPadding: VecNMath.create(4, 1, 1, 1, 1),
      bgOutlineWidth: 1
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for highlighted waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param scale The scaling factor for the icons. The larger the value, the larger the rendered icons. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for highlighted waypoints.
   */
  public static highlightIconStyles(basePriority: number, scale = 1): (waypoint: Waypoint) => MapWaypointIconHighlightStyles {
    const baseHighlightOptions = {
      strokeWidth: 2,
      strokeColor: 'white',
      outlineWidth: 0,
      outlineColor: 'black',
      bgColor: '#3c3c3c'
    };

    const airportHighlightRingRadiusBuffer = -5 * scale;
    const standardHighlightRingRadiusBuffer = -8 * scale;

    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const airportSize = Vec2Math.create(26 * scale, 26 * scale);
    const standardSize = Vec2Math.create(32 * scale, 32 * scale);

    const airportStyle = {
      [AirportSize.Large]: {
        priority: priorities.airport[AirportSize.Large],
        size: airportSize,
        highlightOptions: Object.assign({ ringRadiusBuffer: airportHighlightRingRadiusBuffer }, baseHighlightOptions)
      },
      [AirportSize.Medium]: {
        priority: priorities.airport[AirportSize.Medium],
        size: airportSize,
        highlightOptions: Object.assign({ ringRadiusBuffer: airportHighlightRingRadiusBuffer }, baseHighlightOptions)
      },
      [AirportSize.Small]: {
        priority: priorities.airport[AirportSize.Small],
        size: airportSize,
        highlightOptions: Object.assign({ ringRadiusBuffer: airportHighlightRingRadiusBuffer }, baseHighlightOptions)
      },
    };

    const vorStyle = {
      priority: priorities.vor,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const ndbStyle = {
      priority: priorities.ndb,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const intStyle = {
      priority: priorities.int,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const rwyStyle = {
      priority: priorities.rwy,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const userStyle = {
      priority: priorities.user,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };

    const defaultStyle = {
      priority: basePriority,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };

    return (waypoint: Waypoint): MapWaypointIconHighlightStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.RWY:
            return rwyStyle;
          case FacilityType.USR:
            return userStyle;
        }
      }

      return defaultStyle;
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for highlighted waypoints.
   * @param basePriority The base label render priority. Label priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param fontType The type of font to use for the labels.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered label. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for highlighted waypoints.
   */
  public static highlightLabelStyles(
    basePriority: number,
    fontType: 'Roboto' | 'DejaVu',
    scale = 1
  ): (waypoint: Waypoint) => MapWaypointLabelStyles {
    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const { font, largeFontSize, regularFontSize } = NextGenMapWaypointStyles.getFont(fontType, scale);

    const airportOptions = {
      [AirportSize.Large]: NextGenMapWaypointStyles.createHighlightLabelOptions(Vec2Math.create(0, -15 * scale), font, largeFontSize),
      [AirportSize.Medium]: NextGenMapWaypointStyles.createHighlightLabelOptions(Vec2Math.create(0, -15 * scale), font, regularFontSize),
      [AirportSize.Small]: NextGenMapWaypointStyles.createHighlightLabelOptions(Vec2Math.create(0, -15 * scale), font, regularFontSize)
    };

    const vorOptions = NextGenMapWaypointStyles.createHighlightLabelOptions(Vec2Math.create(0, -11 * scale), font, regularFontSize);
    const ndbOptions = NextGenMapWaypointStyles.createHighlightLabelOptions(Vec2Math.create(0, -11 * scale), font, regularFontSize);
    const userOptions = NextGenMapWaypointStyles.createHighlightLabelOptions(Vec2Math.create(0, -12 * scale), font, regularFontSize);
    const smallOptions = NextGenMapWaypointStyles.createHighlightLabelOptions(Vec2Math.create(0, -8 * scale), font, regularFontSize);

    const airportStyle = {
      [AirportSize.Large]: { priority: priorities.airport[AirportSize.Large], alwaysShow: true, options: airportOptions[AirportSize.Large] },
      [AirportSize.Medium]: { priority: priorities.airport[AirportSize.Medium], alwaysShow: true, options: airportOptions[AirportSize.Medium] },
      [AirportSize.Small]: { priority: priorities.airport[AirportSize.Small], alwaysShow: true, options: airportOptions[AirportSize.Small] }
    };

    const vorStyle = { priority: priorities.vor, alwaysShow: true, options: vorOptions };
    const ndbStyle = { priority: priorities.ndb, alwaysShow: true, options: ndbOptions };
    const intStyle = { priority: priorities.int, alwaysShow: true, options: smallOptions };
    const rwyStyle = { priority: priorities.rwy, alwaysShow: true, options: smallOptions };
    const userStyle = { priority: priorities.user, alwaysShow: true, options: userOptions };

    const defaultStyle = { priority: basePriority, alwaysShow: false, options: smallOptions };

    return (waypoint: Waypoint): MapWaypointLabelStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.RWY:
            return rwyStyle;
          case FacilityType.USR:
            return userStyle;
        }
      }

      return defaultStyle;
    };
  }

  /**
   * Creates initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in a highlight
   * role.
   * @param offset The label offset, in pixels.
   * @param font The name of the label font.
   * @param fontSize The font size of the label, in pixels.
   * @returns Initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in a highlight
   * role.
   */
  private static createHighlightLabelOptions(offset: ReadonlyFloat64Array, font: string, fontSize: number): MapLocationTextLabelOptions {
    return {
      anchor: Vec2Math.create(0.5, 1),
      offset,
      font,
      fontSize,
      fontColor: 'black',
      fontOutlineWidth: 0,
      showBg: true,
      bgPadding: VecNMath.create(4, 1, 1, 1, 1),
      bgColor: 'white',
      bgOutlineWidth: 1,
      bgOutlineColor: 'black'
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for VNAV waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param scale The scaling factor for the icons. The larger the value, the larger the rendered icons. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for VNAV waypoints.
   */
  public static vnavIconStyles(basePriority: number, scale = 1): (waypoint: Waypoint) => MapWaypointIconStyles {
    const vnavStyle = { priority: basePriority, size: Vec2Math.create(32 * scale, 32 * scale) };

    return (): MapWaypointIconStyles => {
      return vnavStyle;
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for VNAV waypoints.
   * @param basePriority The base label render priority. Label priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param fontType The type of font to use for the labels.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered labels. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for VNAV waypoints.
   */
  public static vnavLabelStyles(basePriority: number, fontType: 'Roboto' | 'DejaVu', scale = 1): (waypoint: Waypoint) => MapWaypointLabelStyles {
    let font: string, fontSize: number;

    if (fontType === 'Roboto') {
      font = 'Roboto';
      fontSize = 16 * scale;
    } else {
      font = 'DejaVuSans-SemiBold';
      fontSize = 14 * scale;
    }

    const vnavStyle = {
      priority: basePriority,
      alwaysShow: true,
      options: NextGenMapWaypointStyles.createNormalLabelOptions(Vec2Math.create(0, -8 * scale), font, fontSize)
    };

    return (): MapWaypointLabelStyles => {
      return vnavStyle;
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for procedure preview waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param scale The scaling factor for the icons. The larger the value, the larger the rendered icons. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for procedure preview waypoints.
   */
  public static procPreviewIconStyles(basePriority: number, scale = 1): (waypoint: Waypoint) => MapWaypointIconStyles {
    return NextGenMapWaypointStyles.flightPlanIconStyles(false, basePriority, scale);
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for procedure preview waypoints.
   * @param basePriority The base label render priority. Label priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param fontType The type of font to use for the labels.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered labels. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for procedure preview waypoints.
   */
  public static procPreviewLabelStyles(basePriority: number, fontType: 'Roboto' | 'DejaVu', scale = 1): (waypoint: Waypoint) => MapWaypointLabelStyles {
    return NextGenMapWaypointStyles.flightPlanLabelStyles(false, basePriority, fontType, scale);
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for procedure transition preview
   * waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param scale The scaling factor for the icons. The larger the value, the larger the rendered icons. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for procedure transition
   * preview waypoints.
   */
  public static procTransitionPreviewIconStyles(basePriority: number, scale = 1): (waypoint: Waypoint) => MapWaypointIconStyles {
    return NextGenMapWaypointStyles.normalIconStyles(basePriority, scale);
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for procedure transition preview
   * waypoints.
   * @param basePriority The base label render priority. Label priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param fontType The type of font to use for the labels.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered labels. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for procedure preview transition
   * waypoints.
   */
  public static procTransitionPreviewLabelStyles(basePriority: number, fontType: 'Roboto' | 'DejaVu', scale = 1): (waypoint: Waypoint) => MapWaypointLabelStyles {
    return NextGenMapWaypointStyles.normalLabelStyles(basePriority, fontType, scale);
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) icon styles for hovered waypoints.
   * @param basePriority The base icon render priority. Icon priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param scale The scaling factor for the icons. The larger the value, the larger the rendered icons. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) icon styles for hovered waypoints.
   */
  public static hoverIconStyles(basePriority: number, scale = 1): (combinedRole: MapWaypointRenderRole | 0, waypoint: Waypoint) => MapWaypointIconHighlightStyles {
    const baseHighlightOptions = {
      strokeWidth: 2,
      strokeColor: 'white',
      outlineWidth: 0,
      outlineColor: 'black',
      bgColor: '#3c3c3c'
    };

    const airportHighlightRingRadiusBuffer = -5 * scale;
    const standardHighlightRingRadiusBuffer = -8 * scale;
    const fpHighlightRingRadiusBuffer = 8 * scale;

    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const airportSize = Vec2Math.create(26 * scale, 26 * scale);
    const standardSize = Vec2Math.create(32 * scale, 32 * scale);
    const fpSize = Vec2Math.create(8 * scale, 8 * scale);

    const airportStyle = {
      [AirportSize.Large]: {
        priority: priorities.airport[AirportSize.Large],
        size: airportSize,
        highlightOptions: Object.assign({ ringRadiusBuffer: airportHighlightRingRadiusBuffer }, baseHighlightOptions)
      },
      [AirportSize.Medium]: {
        priority: priorities.airport[AirportSize.Medium],
        size: airportSize,
        highlightOptions: Object.assign({ ringRadiusBuffer: airportHighlightRingRadiusBuffer }, baseHighlightOptions)
      },
      [AirportSize.Small]: {
        priority: priorities.airport[AirportSize.Small],
        size: airportSize,
        highlightOptions: Object.assign({ ringRadiusBuffer: airportHighlightRingRadiusBuffer }, baseHighlightOptions)
      },
    };

    const vorStyle = {
      priority: priorities.vor,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const ndbStyle = {
      priority: priorities.ndb,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const intStyle = {
      priority: priorities.int,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const rwyStyle = {
      priority: priorities.rwy,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };
    const userStyle = {
      priority: priorities.user,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };

    const fpStyle = {
      priority: priorities.fp,
      size: fpSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: fpHighlightRingRadiusBuffer }, baseHighlightOptions)
    };

    const defaultStyle = {
      priority: basePriority,
      size: standardSize,
      highlightOptions: Object.assign({ ringRadiusBuffer: standardHighlightRingRadiusBuffer }, baseHighlightOptions)
    };

    return (combinedRole: MapWaypointRenderRole | 0, waypoint: Waypoint): MapWaypointIconHighlightStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.RWY:
            return rwyStyle;
          case FacilityType.USR:
            return userStyle;
        }
      } else if (waypoint instanceof FlightPathWaypoint) {
        return fpStyle;
      }

      return defaultStyle;
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for hovered waypoints.
   * @param basePriority The base label render priority. Label priorities are guaranteed to fall in the range
   * `[basePriority, basePriority + 1)`.
   * @param fontType The type of font to use for the labels.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered label. Defaults to
   * `1`.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for hovered waypoints.
   */
  public static hoverLabelStyles(
    basePriority: number,
    fontType: 'Roboto' | 'DejaVu',
    scale = 1
  ): (combinedRole: MapWaypointRenderRole | 0, waypoint: Waypoint) => MapWaypointLabelStyles {
    const font = NextGenMapWaypointStyles.getFont(fontType, scale);
    const priorities = NextGenMapWaypointStyles.getPriorities(basePriority);

    const styles = new Map([
      0,
      MapWaypointRenderRole.Highlight,
      MapWaypointRenderRole.FlightPlanActive,
      MapWaypointRenderRole.FlightPlanInactive,
      MapWaypointRenderRole.ProcedurePreview,
      MapWaypointRenderRole.ProcedureTransitionPreview,
      MapWaypointRenderRole.Normal,
      MapWaypointRenderRole.Airway,
      MapWaypointRenderRole.VNav,
    ].map(combinedRole => {
      return [combinedRole, NextGenMapWaypointStyles.hoverLabelStylesForCombinedRole(combinedRole, priorities, font, scale)];
    }));

    return (combinedRole: MapWaypointRenderRole | 0, waypoint: Waypoint): MapWaypointLabelStyles => {
      return (styles.get(combinedRole) ?? styles.get(0)!)(waypoint);
    };
  }

  /**
   * Creates a function which retrieves next-generation (NXi, G3000, etc) label styles for hovered waypoints rendered
   * under a given combined render role.
   * @param combinedRole The combined render role for which to get label styles.
   * @param priorities The render priorities to use.
   * @param font The font parameters to use.
   * @param scale The scaling factor for the labels. The larger the value, the larger the rendered label.
   * @returns A function which retrieves next-generation (NXi, G3000, etc) label styles for hovered waypoints rendered
   * under the specified combined render role.
   */
  private static hoverLabelStylesForCombinedRole(
    combinedRole: MapWaypointRenderRole | 0,
    priorities: Readonly<Priorities>,
    font: Readonly<Font>,
    scale: number
  ): (waypoint: Waypoint) => MapWaypointLabelStyles {
    const isFlightPlan = BitFlags.isAny(
      combinedRole,
      MapWaypointRenderRole.FlightPlanActive
      | MapWaypointRenderRole.FlightPlanInactive
      | MapWaypointRenderRole.ProcedurePreview
    );

    let largeFontSize: number;
    let regularFontSize: number;

    if (isFlightPlan) {
      ({ fpLargeFontSize: largeFontSize, fpRegularFontSize: regularFontSize } = font);
    } else {
      ({ largeFontSize, regularFontSize } = font);
    }

    const airportOptions = {
      [AirportSize.Large]: NextGenMapWaypointStyles.createHoverLabelOptions(combinedRole, Vec2Math.create(0, -15 * scale), font.font, largeFontSize),
      [AirportSize.Medium]: NextGenMapWaypointStyles.createHoverLabelOptions(combinedRole, Vec2Math.create(0, -15 * scale), font.font, regularFontSize),
      [AirportSize.Small]: NextGenMapWaypointStyles.createHoverLabelOptions(combinedRole, Vec2Math.create(0, -15 * scale), font.font, regularFontSize)
    };

    const vorOptions = NextGenMapWaypointStyles.createHoverLabelOptions(combinedRole, Vec2Math.create(0, -11 * scale), font.font, regularFontSize);
    const ndbOptions = NextGenMapWaypointStyles.createHoverLabelOptions(combinedRole, Vec2Math.create(0, -11 * scale), font.font, regularFontSize);
    const userOptions = NextGenMapWaypointStyles.createHoverLabelOptions(combinedRole, Vec2Math.create(0, -12 * scale), font.font, regularFontSize);
    const smallOptions = NextGenMapWaypointStyles.createHoverLabelOptions(combinedRole, Vec2Math.create(0, -8 * scale), font.font, regularFontSize);

    const airportStyle = {
      [AirportSize.Large]: { priority: priorities.airport[AirportSize.Large], alwaysShow: true, options: airportOptions[AirportSize.Large] },
      [AirportSize.Medium]: { priority: priorities.airport[AirportSize.Medium], alwaysShow: true, options: airportOptions[AirportSize.Medium] },
      [AirportSize.Small]: { priority: priorities.airport[AirportSize.Small], alwaysShow: true, options: airportOptions[AirportSize.Small] }
    };

    const vorStyle = { priority: priorities.vor, alwaysShow: true, options: vorOptions };
    const ndbStyle = { priority: priorities.ndb, alwaysShow: true, options: ndbOptions };
    const intStyle = { priority: priorities.int, alwaysShow: true, options: smallOptions };
    const rwyStyle = { priority: priorities.rwy, alwaysShow: true, options: smallOptions };
    const userStyle = { priority: priorities.user, alwaysShow: true, options: userOptions };
    const fpStyle = { priority: priorities.fp, alwaysShow: true, options: smallOptions };

    const defaultStyle = { priority: priorities.base, alwaysShow: false, options: smallOptions };

    return (waypoint: Waypoint): MapWaypointLabelStyles => {
      if (waypoint instanceof AirportWaypoint) {
        return airportStyle[waypoint.size];
      } else if (FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
        switch (ICAO.getFacilityTypeFromValue(waypoint.facility.get().icaoStruct)) {
          case FacilityType.VOR:
            return vorStyle;
          case FacilityType.NDB:
            return ndbStyle;
          case FacilityType.Intersection:
            return intStyle;
          case FacilityType.RWY:
            return rwyStyle;
          case FacilityType.USR:
            return userStyle;
        }
      } else if (waypoint instanceof FlightPathWaypoint) {
        return fpStyle;
      }

      return defaultStyle;
    };
  }

  /**
   * Creates initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in a hover
   * role.
   * @param combinedRole The hover role's combined render role.
   * @param offset The label offset, in pixels.
   * @param font The name of the label font.
   * @param fontSize The font size of the label, in pixels.
   * @returns Initialization options for next-generation (NXi, G3000, etc) style waypoint labels rendered in a hover
   * role.
   */
  private static createHoverLabelOptions(combinedRole: MapWaypointRenderRole | 0, offset: ReadonlyFloat64Array, font: string, fontSize: number): MapLocationTextLabelOptions {
    const isFlightPlan = BitFlags.isAny(
      combinedRole,
      MapWaypointRenderRole.FlightPlanActive
      | MapWaypointRenderRole.FlightPlanInactive
      | MapWaypointRenderRole.ProcedurePreview
    );

    return {
      anchor: isFlightPlan ? Vec2Math.create(0, 1) : Vec2Math.create(0.5, 1),
      offset,
      font,
      fontSize,
      fontColor: 'white',
      fontOutlineWidth: 0,
      showBg: true,
      bgPadding: VecNMath.create(4, 1, 1, 1, 1),
      bgColor: 'black',
      bgOutlineWidth: 1,
      bgOutlineColor: 'white'
    };
  }
}

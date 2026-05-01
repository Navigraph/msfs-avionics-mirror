import {
  AbstractMapWaypointIconOptions, ImageCache, MapCullableLocationTextLabel, MapCullableTextLabel, MapLocationTextLabelOptions, MapWaypointIcon,
  MapWaypointImageIcon, MapWaypointRendererIconFactory, MapWaypointRendererLabelFactory, ReadonlyFloat64Array, Vec2Math, VNavWaypoint, Waypoint
} from '@microsoft/msfs-sdk';

import { Colors } from '../Misc/Colors';
import { MapCommon, MapLabelPriority } from './MapCommon';
import { MapSystemCommon } from './MapSystemCommon';

const labelOptions: MapLocationTextLabelOptions = {
  fontSize: MapSystemCommon.labelFontSize,
  fontColor: Colors.green,
  font: MapCommon.fontBold,
  anchor: MapSystemCommon.labelAnchorTopRight,
  offset: MapSystemCommon.labelOffset,
  fontOutlineWidth: MapSystemCommon.fontOutlineWidth,
  fontOutlineColor: Colors.black
};

/**
 * A waypoint icon factory for VNAV waypoints.
 */
export class MapTodIconFactory implements MapWaypointRendererIconFactory<Waypoint> {
  private static readonly ICON_SIZE = Vec2Math.create(12, 12);

  /** @inheritdoc */
  public getIcon<T extends Waypoint>(role: number, waypoint: T): MapWaypointIcon<T> {
    return new MapTodIcon(
      waypoint as any, MapLabelPriority.TopOfDescent, MapTodIconFactory.ICON_SIZE,
      { offset: new Float64Array([0, 0.5]) }
    ) as unknown as MapWaypointIcon<T>;
  }
}

/**
 * A waypoint label factory for VNAV TOD waypoints.
 */
export class MapTodLabelFactory implements MapWaypointRendererLabelFactory<Waypoint> {

  /** @inheritdoc */
  public getLabel(role: number, waypoint: Waypoint): MapCullableTextLabel {
    return new MapCullableLocationTextLabel('TOD', MapLabelPriority.TopOfDescent, waypoint.location, true, labelOptions);
  }
}

/**
 * A VNAV waypoint icon.
 */
export class MapTodIcon extends MapWaypointImageIcon<VNavWaypoint> {
  /**
   * Constructor.
   * @param waypoint The waypoint associated with this icon.
   * @param priority The render priority of this icon. Icons with higher priorities should be rendered above those with lower priorities.
   * @param size The size of this icon, as `[width, height]` in pixels.
   * @param options Options with which to initialize this icon.
   */
  constructor(
    waypoint: VNavWaypoint,
    priority: number,
    size: ReadonlyFloat64Array,
    options?: AbstractMapWaypointIconOptions
  ) {
    super(waypoint, priority, ImageCache.get('TOD'), size, options);
  }
}

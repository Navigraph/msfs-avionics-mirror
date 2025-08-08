import { G3000FilePaths } from '@microsoft/msfs-wtg3000-common';

/**
 * File paths for horizontal GTC button background images.
 */
export class GtcHorizButtonBackgroundImagePaths {
  public static readonly BackspaceIcon = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/backspace.png`;
  public static readonly ButtonRoundDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/btn-round-down.png`;
  public static readonly ButtonRoundUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/btn-round-up.png`;
  public static readonly ComBottomBorder = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/com-bottom-border.png`;
  public static readonly ComBottomDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/com-bottom-down.png`;
  public static readonly ComBottomHighlight = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/com-bottom-highlight.png`;
  public static readonly ComBottomUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/com-bottom-up.png`;
  public static readonly ComTopDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/com-top-down.png`;
  public static readonly ComTopUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/com-top-up.png`;
  public static readonly DoubleArrow = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/double-arrow.png`;
  public static readonly FindIcon = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/find.png`;
  public static readonly MicDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/mic-down.png`;
  public static readonly MicUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/mic-up.png`;
  public static readonly MonDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/mon-down.png`;
  public static readonly MonUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/mon-up.png`;
  public static readonly PlayIcon = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/play.png`;
  public static readonly TriangleDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/mic-mon-triangle-down.png`;
  public static readonly TriangleUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/mic-mon-triangle-up.png`;
  public static readonly XpdrBottomDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/xpdr-bottom-down.png`;
  public static readonly XpdrBottomUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/xpdr-bottom-up.png`;
  public static readonly XpdrTopDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/xpdr-top-down.png`;
  public static readonly XpdrTopUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/horizontal/xpdr-top-up.png`;
}

/**
 * File paths for vertical GTC button background images.
 */
export class GtcVertButtonBackgroundImagePaths {
  public static readonly ButtonRoundSmallDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/btn-round-small-down.png`;
  public static readonly ButtonRoundSmallUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/btn-round-small-up.png`;
  public static readonly ComBottomBorder = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/com-bottom-border.png`;
  public static readonly ComBottomDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/com-bottom-down.png`;
  public static readonly ComBottomHighlight = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/com-bottom-highlight-small.png`;
  public static readonly ComBottomUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/com-bottom-up.png`;
  public static readonly ComTopDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/com-top-down.png`;
  public static readonly ComTopUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/com-top-up.png`;
  public static readonly MicDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/mic-down-small.png`;
  public static readonly MicUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/mic-up-small.png`;
  public static readonly MonDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/mon-down-small.png`;
  public static readonly MonUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/mon-up-small.png`;
  public static readonly TrafficDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/traffic-down.png`;
  public static readonly TrafficUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/traffic-up.png`;
  public static readonly TriangleLeft = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/icon_mic_mon_arrow_left.png`;
  public static readonly TriangleRight = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/icon_mic_mon_arrow_right.png`;
  public static readonly XpdrBottomDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/xpdr-bottom-down.png`;
  public static readonly XpdrBottomUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/xpdr-bottom-up.png`;
  public static readonly XpdrTopDown = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/xpdr-top-down.png`;
  public static readonly XpdrTopUp = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/buttons/vertical/xpdr-top-up.png`;
}

// The types below are for backwards compatibility.

/**
 * File paths for horizontal GTC button background images.
 * @deprecated Please use {@link GtcHorizButtonBackgroundImagePaths} instead.
 */
export const BtnImagePathHor = GtcHorizButtonBackgroundImagePaths;

/**
 * File paths for vertical GTC button background images.
 * @deprecated Please use {@link GtcVertButtonBackgroundImagePaths} instead.
 */
export const BtnImagePathVert = GtcVertButtonBackgroundImagePaths;

/**
 * File paths for GTC button images.
 * @deprecated
 */
export class BtnImagePath {
  public static readonly PlaybackBackward = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_playback_backward.png`;
  public static readonly PlaybackForward = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_playback_forward.png`;
  public static readonly SoftKeyArrowActive = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_knob_pair_arrow_active.png`;
  public static readonly SoftKeyArrowInactive = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_knob_pair_arrow_inactive.png`;
  public static readonly TrafficMap = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_traffic_map_home.png`;
  public static readonly WaypointFilterAll = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_waypoint_info.png`;
  public static readonly WaypointFilterAirport = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_airport.png`;
  public static readonly WaypointFilterIntersection = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_intersection.png`;
  public static readonly WaypointFilterNdb = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_ndb.png`;
  public static readonly WaypointFilterVor = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_vor.png`;
  public static readonly WaypointFilterUser = `${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_user.png`;
}

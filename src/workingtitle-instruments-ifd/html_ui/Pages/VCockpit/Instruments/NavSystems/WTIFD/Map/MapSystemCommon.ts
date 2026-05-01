import { ReadonlyFloat64Array, UnitType } from '@microsoft/msfs-sdk';

import { MapStyles } from './Modules/MapStylesModule';

/** Collection of common data used by the map system. */
export class MapSystemCommon {
  public static readonly labelFontSize = 20 as number;
  public static readonly fontOutlineWidth = 0.7 as number;
  public static readonly labelLineHeight = 25 as number;

  public static readonly strokeWidth = 3 as number;
  public static readonly arrowStrokeWidth = 3 as number;
  public static readonly outlineWidth = 0.7 as number;

  public static readonly labelAnchorTopLeft = new Float64Array([1, 1]) as ReadonlyFloat64Array;
  public static readonly labelAnchorBottomLeft = new Float64Array([1, -1]) as ReadonlyFloat64Array;
  public static readonly labelAnchorBottomRight = new Float64Array([0, -1]) as ReadonlyFloat64Array;
  public static readonly labelAnchorTopRight = new Float64Array([0, 1]) as ReadonlyFloat64Array;

  public static readonly labelAnchorBottomCenter = new Float64Array([1, -1]) as ReadonlyFloat64Array;
  public static readonly labelAnchor = this.labelAnchorBottomCenter;

  public static readonly labelOffsetPxX = 19 as number;
  public static readonly labelOffsetPxY = 5 as number;
  public static readonly labelOffset = new Float64Array([this.labelOffsetPxX, -this.labelOffsetPxY]) as ReadonlyFloat64Array;

  public static readonly labelOffsetAnchorTopLeft = new Float64Array([-this.labelOffsetPxX, -this.labelOffsetPxY]) as ReadonlyFloat64Array;
  public static readonly labelOffsetBottomRight = new Float64Array([this.labelOffsetPxX, -8]) as ReadonlyFloat64Array;
  public static readonly labelOffsetBottomLeft = new Float64Array([-this.labelOffsetPxX, -8]) as ReadonlyFloat64Array;

  public static readonly mapIconSize = 20 as number;
  public static readonly flightPlanIconSize = 15 as number;

  public static readonly mapStyles: MapStyles = {
    labelFontSize: MapSystemCommon.labelFontSize,
    fontOutlineWidth: MapSystemCommon.fontOutlineWidth,
    labelLineHeight: MapSystemCommon.labelLineHeight,
    strokeWidth: MapSystemCommon.strokeWidth,
    arrowStrokeWidth: MapSystemCommon.arrowStrokeWidth,
    outlineWidth: MapSystemCommon.outlineWidth,
    labelAnchor: MapSystemCommon.labelAnchor,
    labelOffset: MapSystemCommon.labelOffset,
    labelOffsetPxX: MapSystemCommon.labelOffsetPxX,
    labelOffsetPxY: MapSystemCommon.labelOffsetPxY,
    mapIconSize: MapSystemCommon.mapIconSize,
    flightPlanIconSize: MapSystemCommon.flightPlanIconSize,
  };

  public static readonly mapCompassMaskHeight = 340;
  public static readonly hsiCompassMaskHeight = 170;

  public static readonly rangeTickWidth = 20;

  public static readonly minimapHeightUnscaled = 505;

  public static readonly northUpCompassRadius = 175;
  public static readonly northUpCompassRadiusSidebar = 155;
  public static readonly hdgTrkUpCompassRadius = 228;
  public static readonly dataBlockCompassRadius = 50;
  public static readonly hsiCompassRadius = 228;
  public static readonly hdgTrkUpOffsetY = 108;
  public static readonly northTrkUpOffsetY = 5;
  public static readonly dataBlockOffsetY = 0;
  public static readonly hsiOffsetY = 100;

  public static readonly hsiMapWidth = 500;
  // Keep in sync with Map.css
  public static readonly hsiMapHeight = 334;

  /** Max unit ranges **/
  public static readonly maxRange = {
    [UnitType.NMILE.name]: 1000,
    [UnitType.KILOMETER.name]: 2000,
    [UnitType.MILE.name]: 1200
  };
  /** Min Range **/
  public static readonly minRange = 0.50;

  public static TrafficIconOptions = {
    iconSize: 22,
    fontSize: 22,
    font: 'Arial Bold',
    drawOffScale: false,
    supportAdsbVector: true,
    forceDrawNoArrow: true,
    vectorLength: 30,
    drawTARAVectorAsNormalVector: true
  };
}

import {
  AbstractMapTextLabel, AltitudeRestrictionType, EventBus, FlightPathWaypoint, FlightPlanner, MapCullableLocationTextLabel, MapLocationTextLabelOptions, MapProjection,
  Subscription, UnitType, Waypoint,
} from '@microsoft/msfs-sdk';

import { Colors } from '../../Misc/Colors';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { MapUserSettings } from '../../Settings/MapUserSettings';
import { MapLabelPriority } from '../MapCommon';
import { MapSystemCommon } from '../MapSystemCommon';
import { MapUtils } from '../Util/MapUtils';

const whiteSpaceRegex = /\s/g;

const FL = 'FL';
const MULTI_LINE_COEFF = 0.4;

/**
 * A map flightplan waypoint label for IFD.
 * Capable of showing speed and altitude restrictions.
 */
export class FlightPathWaypointLabel extends MapCullableLocationTextLabel {
  private readonly mapSettings = MapUserSettings.getManager(this.bus);

  private static readonly OUTLINE_COLOR = 'black';
  private static readonly BAR_WIDTH = 2;
  private static readonly CHAR_WIDTH = 9;

  private readonly displaySettingSub: Subscription | undefined;
  private readonly labelSettingSub: Subscription | undefined;

  private altDesc = AltitudeRestrictionType.Unused;
  private altitude1 = -1;
  private displayAltitude1AsFlightLevel = false;
  private altitude2 = -1;
  private displayAltitude2AsFlightLevel = false;
  private altitudeText: string[] = [];
  private labelSettingIsOn = this.mapSettings.getSetting('mapFlightPlanLabels').get();

  /**
   * Ctor
   * @param waypoint The map waypoint object to display.
   * @param flightPlanner instance of flightplanner
   * @param options The label options.
   * @param lineHeight The amount of pixels to offset each line by vertically.
   * @param ident waypoint ident
   * @param mapDataProvider The map data provider.
   * @param bus The event bus to use for this map system.
   */
  constructor(
    private readonly waypoint: Waypoint,
    private readonly flightPlanner: FlightPlanner,
    options: MapLocationTextLabelOptions,
    private readonly lineHeight: number,
    private readonly ident: string,
    private readonly mapDataProvider: MapDataProvider,
    private readonly bus: EventBus,
  ) {
    super(
      ident.replace(whiteSpaceRegex, ''),
      MapLabelPriority.FlightPlan,
      waypoint.location,
      true,
      options
    );

    this.labelSettingSub = this.mapSettings.getSetting('mapFlightPlanLabels')
      .sub(setting => this.labelSettingIsOn = setting);
  }

  /** @inheritdoc */
  public destroy(): void {
    this.displaySettingSub?.destroy();
    this.labelSettingSub?.destroy();
    super.destroy();
  }

  /** @inheritdoc */
  public draw(context: CanvasRenderingContext2D, mapProjection: MapProjection): void {
    if (this.labelSettingIsOn) {
      this.setTextStyle(context);
      context.textBaseline = 'bottom';
      context.textAlign = 'left';

      const pos = this.getPosition(mapProjection, AbstractMapTextLabel.tempVec2);
      const centerX = pos[0];
      const centerY = pos[1];

      this.drawText(context, centerX, centerY);
    }
  }

  /** @inheritdoc */
  protected drawText(context: CanvasRenderingContext2D, centerX: number, centerY: number): void {

    this.renderText(context, centerX, centerY, this.text.get());

    if (this.waypoint instanceof FlightPathWaypoint) {
      const renderAltitudeLabel = MapUtils.showAltitudeForLeg(this.waypoint.leg, this.flightPlanner);

      if (renderAltitudeLabel) {
        this.renderAltitudeConstraints(context, centerX, centerY);
      }
    }
  }

  /**
   * Renders text for the label
   * @param context the context
   * @param centerX the center x position
   * @param centerY the center y position
   * @param text the text to render
   * @param align the text alignment
   * @param color Optional font color to use for this text (defaults to this.fontColor.get())
   */
  protected renderText(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    text: string,
    align: CanvasTextAlign = 'left',
    color?: string
  ): void {
    const fontOutlineWidth = this.fontOutlineWidth.get();
    context.textAlign = align;

    if (fontOutlineWidth > 0) {
      context.lineWidth = fontOutlineWidth * 2;
      context.strokeStyle = this.fontOutlineColor.get();
      context.strokeText(text, centerX, centerY);
    }

    context.fillStyle = color ?? this.fontColor.get();
    context.fillText(text, centerX, centerY);
  }

  /** Updates the altitude data if anything changed. */
  private updateAltitudeData(): void {
    if (!(this.waypoint instanceof FlightPathWaypoint)) {
      return;
    }
    const legVerticalData = this.waypoint.leg.verticalData;

    let needsUpdate = false;

    if (legVerticalData.altDesc !== this.altDesc) {
      this.altDesc = legVerticalData.altDesc;
      needsUpdate = true;
    }

    if (legVerticalData.altitude1 !== this.altitude1) {
      this.altitude1 = legVerticalData.altitude1;
      needsUpdate = true;
    }

    if (legVerticalData.altitude2 !== this.altitude2) {
      this.altitude2 = legVerticalData.altitude2;
      needsUpdate = true;
    }

    if (legVerticalData.displayAltitude1AsFlightLevel !== this.displayAltitude1AsFlightLevel) {
      this.displayAltitude1AsFlightLevel = legVerticalData.displayAltitude1AsFlightLevel;
      needsUpdate = true;
    }

    if (legVerticalData.displayAltitude2AsFlightLevel !== this.displayAltitude2AsFlightLevel) {
      this.displayAltitude2AsFlightLevel = legVerticalData.displayAltitude2AsFlightLevel;
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.altitudeText = this.getAltitudeConstraints();
    }
  }

  /**
   * Formats an altitude constraints for display on a waypoint label.
   * @returns List of formatted altitude constraints.
   */
  private getAltitudeConstraints(): string[] {
    switch (this.altDesc) {
      case AltitudeRestrictionType.Between:
        return [this.formatAltitude(this.altitude2, this.displayAltitude2AsFlightLevel), this.formatAltitude(this.altitude1, this.displayAltitude1AsFlightLevel)];
      case AltitudeRestrictionType.Unused:
        return [];
      default:
        return [this.formatAltitude(this.altitude1, this.displayAltitude1AsFlightLevel)];
    }
  }

  /**
   * Formats an altitude as either an altitude in feet, or a flight level (with FL prefix), depending on the transition altitude.
   * @param altitude The altitude in metres.
   * @param isFl Whether the altitude should be displayed as a flight level.
   * @returns the formatted altitude.
   */
  private formatAltitude(altitude: number, isFl: boolean): string {
    const altitudeFeet = UnitType.FOOT.convertFrom(altitude, UnitType.METER);
    return `${isFl ? FL : ''}${(altitudeFeet / (isFl ? 100 : 1)).toFixed(0)}`;
  }

  /**
   * Renders Altitude constraints on the left side of the waypoint icon
   * @param context The context.
   * @param centerX The x position.
   * @param centerY The y position.
   */
  private renderAltitudeConstraints(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number
  ): void {
    this.updateAltitudeData();

    if (this.altDesc === AltitudeRestrictionType.Unused) {
      return;
    }

    const [offsetX] = this.offset.get();
    const color = Colors.green;

    if (this.altDesc === AltitudeRestrictionType.Between) {
      // There are two constraints to be rendered in two lines. Take the length of the longer one.
      const maxTextLength = Math.max(this.altitudeText[0].length, this.altitudeText[1].length);
      // Increase offset because we render two lines of text
      const x = centerX - 3 * offsetX;
      // Keep text lines tight vertically
      const lineOffset = MULTI_LINE_COEFF * this.lineHeight;
      this.renderText(context, x, centerY - lineOffset, this.altitudeText[1], 'right', color);
      this.renderText(context, x, centerY + lineOffset, this.altitudeText[0], 'right', color);
      this.drawConstraintBar(context, x, centerY, maxTextLength * FlightPathWaypointLabel.CHAR_WIDTH, color);
    } else {
      // There is only one altitude constraint text to be rendered.
      const x = centerX - 2 * offsetX;
      this.renderText(context, x, centerY, this.altitudeText[0], 'right', color);
      this.drawConstraintBar(context, x, centerY, this.altitudeText[0].length * FlightPathWaypointLabel.CHAR_WIDTH, color);
    }
  }

  /**
   * Draws an altitude constraint
   * @param ctx The context.
   * @param x The x position.
   * @param y The y position.
   * @param width Width of the bar.
   * @param color The color to use for the bar.
   */
  private drawConstraintBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    color: string
  ): void {
    const bottomBarOffset = -2;
    const topBarOffset = -1;
    switch (this.altDesc) {
      case AltitudeRestrictionType.AtOrAbove:
        this.drawBar(ctx, x, y + bottomBarOffset, -width, color);
        break;
      case AltitudeRestrictionType.AtOrBelow:
        this.drawBar(ctx, x, y - this.lineHeight - topBarOffset, -width, color);
        break;
      case AltitudeRestrictionType.At:
        this.drawBar(ctx, x, y - this.lineHeight - topBarOffset, -width, color);
        this.drawBar(ctx, x, y + bottomBarOffset, -width, color);
        break;
      case AltitudeRestrictionType.Between:
        this.drawBar(ctx, x, y - (1 + MULTI_LINE_COEFF) * this.lineHeight - topBarOffset, -width, color);
        this.drawBar(ctx, x, y + MULTI_LINE_COEFF * this.lineHeight + bottomBarOffset, -width, color);
        break;
    }
  }

  /**
   * Draws a horizontal bar
   * @param ctx The context.
   * @param x The x position.
   * @param y The y position.
   * @param width Width of the bar.
   * @param color The color to use for the bar.
   */
  private drawBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    color: string
  ): void {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = FlightPathWaypointLabel.BAR_WIDTH + 2 * MapSystemCommon.outlineWidth;
    ctx.stroke();
    ctx.lineWidth = FlightPathWaypointLabel.BAR_WIDTH;
    ctx.stroke();
  }
}

import { AbstractMapWaypointIcon, AbstractMapWaypointIconOptions, MapProjection, ReadonlyFloat64Array, Subscribable } from '@microsoft/msfs-sdk';
import { AirportSize, AirportWaypoint } from './AirportWaypoint';
import { Colors } from '../../Misc/Colors';

/**
 * An icon for airports on the IFD.
 * With support for showing a different icons and localizer beams based on the map range setting.
 */
export class MapAirportIcon<T extends AirportWaypoint> extends AbstractMapWaypointIcon<T> {
  private static readonly airportMaxRange = new Map<AirportSize, number>([
    [AirportSize.Small, 5],
    [AirportSize.Medium, 50],
    [AirportSize.Large, 50],
  ]);

  private readonly iconSize = new Float64Array(2);

  /**
   * Constructor.
   * @param waypoint The waypoint associated with this icon.
   * @param priority The render priority of this icon. Icons with higher priorities should be rendered above those
   * with lower priorities.
   * @param img This icon's image.
   * @param size The size of this icon, as `[width, height]` in pixels, or a subscribable which provides it.
   * @param currentRange The current range setting of the map.
   * @param options Options with which to initialize this icon.
   */
  constructor(
    waypoint: T,
    priority: number | Subscribable<number>,
    protected readonly img: HTMLImageElement,
    size: ReadonlyFloat64Array | Subscribable<ReadonlyFloat64Array>,
    protected readonly currentRange: Subscribable<number>,
    options?: AbstractMapWaypointIconOptions
  ) {
    super(waypoint, priority, size, options);

    if ('sub' in size) {
      size.sub(v => {
        this.iconSize[0] = v[0];
        this.iconSize[1] = v[1];
      }, true);
    } else {
      this.iconSize[0] = size[0];
      this.iconSize[1] = size[1];
    }
  }

  /** @inheritdoc */
  protected drawIconAt(context: CanvasRenderingContext2D, mapProjection: MapProjection, left: number, top: number): void {
    const size = this.iconSize;
    const currentRange = this.currentRange.get();
    context.drawImage(this.img, left, top, size[0], size[1]);

    if (currentRange < 25) {
      context.save();
      context.beginPath();
      this.drawAirportClipPath(context, left, top, size[0]);
      context.clip();

      context.beginPath();

      const facility = this.waypoint.facility.get();
      const runways = facility.runways;
      const rawRotRad = mapProjection.getRotation();
      const mapRotation = Math.round(rawRotRad * (180 / Math.PI)) * (Math.PI / 180);

      for (const runway of runways) {
        if (!runway || runway.length === 0) {
          continue;
        }
        this.addRunwayPath(context, left, top, size[0], runway.direction, mapRotation);
      }

      context.strokeStyle = Colors.lightCyan;
      context.lineWidth = 2;
      context.stroke();

      context.restore();
    }
  }

  /**
   * Defines a circular clipping path that matches the inner blue circle of the airport icon.
   * Excludes tabs and black stroke.
   *
   * @param ctx - The canvas rendering context.
   * @param left - Left position of the icon.
   * @param top - Top position of the icon.
   * @param size - Total icon size in pixels.
   */
  private drawAirportClipPath(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    size: number
  ): void {
    const cx = left + size / 2;
    const cy = top + size / 2;
    const r = size * 0.3;
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  }

  /**
   * Adds a runway line segment to the current path at the given heading,
   * snapping endpoints to device‐pixel centers for a crisp 2px stroke.
   *
   * @param ctx - The canvas rendering context.
   * @param left - The left position of the icon in canvas coordinates.
   * @param top - The top position of the icon in canvas coordinates.
   * @param size - The total width/height of the icon in pixels.
   * @param headingDeg - The runway heading, in degrees.
   * @param mapRotation - The current map rotation, in radians.
   */
  private addRunwayPath(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    size: number,
    headingDeg: number,
    mapRotation: number
  ): void {
    const cx = left + size / 2;
    const cy = top + size / 2;
    const half = size / 2;

    const headingRad = (headingDeg - 90) * Math.PI / 180;
    const rad = headingRad + mapRotation;
    const dx = Math.cos(rad) * half;
    const dy = Math.sin(rad) * half;

    const snap = (v: number): number => Math.round(v) + 0.5;
    const x1 = snap(cx + dx), y1 = snap(cy + dy);
    const x2 = snap(cx - dx), y2 = snap(cy - dy);

    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
}

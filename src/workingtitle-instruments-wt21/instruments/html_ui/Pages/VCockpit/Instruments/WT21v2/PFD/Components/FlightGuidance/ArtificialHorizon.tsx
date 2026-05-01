import { ComponentProps, DisplayComponent, EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { AdiProjectionUtils } from '../../Utils/AdiProjectionUtils';
import { FlightGuidancePlaneInfo } from './AttitudeDirectorIndicator';

import './ArtificialHorizon.css';

/**
 * The properties for the ArtificialHorizon component.
 */
interface ArtificialHorizonProps extends ComponentProps {
  /** An instance of the event bus. */
  bus: EventBus;
}

/**
 * The ArtificialHorizon component.
 */
export class ArtificialHorizon extends DisplayComponent<ArtificialHorizonProps> {
  private static readonly DEFAULT_WIDTH = 772;
  private static readonly DEFAULT_HEIGHT = 461;
  private static readonly CENTER_X = 386;
  private static readonly CENTER_Y = 262;
  private static readonly HORIZON_LINE_WIDTH = 2;
  private static readonly HORIZON_HALF_SPAN = Math.hypot(ArtificialHorizon.DEFAULT_WIDTH, ArtificialHorizon.DEFAULT_HEIGHT);
  private static readonly HORIZON_SPAN = ArtificialHorizon.HORIZON_HALF_SPAN * 2;
  private static readonly SKY_COLOR = 'hsl(217, 100%, 50%)';
  private static readonly GROUND_COLOR = 'hsl(30, 63%, 37%)';
  private static readonly HORIZON_LINE_COLOR = '#ffffff';
  private static readonly HORIZON_LINE_HALF_WIDTH = ArtificialHorizon.HORIZON_LINE_WIDTH / 2;
  private static readonly PX_PER_DEG_Y: number = AdiProjectionUtils.getPxPerDegY();

  private readonly canvasRef = FSComponent.createRef<HTMLCanvasElement>();
  private canvasContext: CanvasRenderingContext2D | null = null;

  /**
   * A callback called after the component renders.
   */
  public onAfterRender(): void {
    const canvas = this.canvasRef.instance;
    this.canvasContext = canvas.getContext('2d');

    canvas.width = ArtificialHorizon.DEFAULT_WIDTH;
    canvas.height = ArtificialHorizon.DEFAULT_HEIGHT;

    this.drawHorizon(0, 0);
  }

  /**
   * Update method.
   * @param planeState The plane state info
   */
  public update(planeState: FlightGuidancePlaneInfo): void {
    this.drawHorizon(planeState.pitch, planeState.roll);
  }

  /**
   * Draws the horizon.
   * @param pitch The current pitch, in degrees.
   * @param roll The current roll, in degrees.
   */
  private drawHorizon(pitch: number, roll: number): void {
    const context = this.canvasContext;
    if (!context) {
      return;
    }

    const pitchOffset = pitch * ArtificialHorizon.PX_PER_DEG_Y;
    const rotation = roll * Avionics.Utils.DEG2RAD;
    const sinRot = Math.sin(rotation);
    const cosRot = Math.cos(rotation);
    const translatedCenterX = ArtificialHorizon.CENTER_X - sinRot * pitchOffset;
    const translatedCenterY = ArtificialHorizon.CENTER_Y + cosRot * pitchOffset;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, ArtificialHorizon.DEFAULT_WIDTH, ArtificialHorizon.DEFAULT_HEIGHT);
    context.setTransform(cosRot, sinRot, -sinRot, cosRot, translatedCenterX, translatedCenterY);

    context.fillStyle = ArtificialHorizon.SKY_COLOR;
    context.fillRect(-ArtificialHorizon.HORIZON_HALF_SPAN, -ArtificialHorizon.HORIZON_HALF_SPAN, ArtificialHorizon.HORIZON_SPAN, ArtificialHorizon.HORIZON_HALF_SPAN);

    context.fillStyle = ArtificialHorizon.HORIZON_LINE_COLOR;
    context.fillRect(-ArtificialHorizon.HORIZON_HALF_SPAN, -ArtificialHorizon.HORIZON_LINE_HALF_WIDTH, ArtificialHorizon.HORIZON_SPAN, ArtificialHorizon.HORIZON_LINE_WIDTH);

    context.fillStyle = ArtificialHorizon.GROUND_COLOR;
    context.fillRect(-ArtificialHorizon.HORIZON_HALF_SPAN, ArtificialHorizon.HORIZON_LINE_HALF_WIDTH, ArtificialHorizon.HORIZON_SPAN, ArtificialHorizon.HORIZON_HALF_SPAN);
  }

  /**
   * Renders the component.
   * @returns The component VNode.
   */
  public render(): VNode {
    return (
      <canvas class="artificial-horizon-container" ref={this.canvasRef} />
    );
  }
}

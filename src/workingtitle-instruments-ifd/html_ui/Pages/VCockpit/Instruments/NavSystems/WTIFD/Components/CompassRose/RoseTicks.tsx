import { ComponentProps, DisplayComponent, FSComponent, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import './CompassRose.css';

/** Direction that ticks should point on a rose. */
export type HSITickDirection = 'Inwards' | 'Outwards';

/** Props for {@link RoseTicks} component. */
interface RoseTicksProps extends ComponentProps {
  /** The size of the square svg viewbox. */
  svgViewBoxSize: number;
  /** Length of a tick. */
  tickLength: number;
  /** Distance to put ticks at from the center of the svg view box. */
  ticksRadius: number | Subscribable<number>;
  /** Whether ticks should go outwards or inwards. */
  tickDirection: HSITickDirection;
  /** How many degrees between ticks. */
  degreesPerTick: number;
  /** The degree to start the ticks from. Defaults to 0. */
  startDegrees?: number;
  /** Hidden or not **/
  hidden: Subscribable<boolean>;
}

/**
 * RoseTicks to draw a rose with ticks
 */
export class RoseTicks extends DisplayComponent<RoseTicksProps> {
  private readonly ticksRadius = SubscribableUtils.toSubscribable(this.props.ticksRadius, true);
  private readonly tickPath = Subject.create(this.buildRoseTicks());

  /** Builds the rose tick marks.
   * @returns A collection of rose tick line path data. */
  private buildRoseTicks(): string {
    const {
      svgViewBoxSize,
      tickLength,
      tickDirection,
      degreesPerTick,
      startDegrees = 0,
    } = this.props;

    const half = svgViewBoxSize / 2;
    const direction = tickDirection === 'Inwards' ? 1 : -1;

    let path = '';

    for (let deg = startDegrees; deg < 360; deg += degreesPerTick) {
      const rad = deg * Avionics.Utils.DEG2RAD;

      const dx = Math.sin(rad);
      const dy = -Math.cos(rad); // Y-axis inversion in SVG

      const startX = half + (this.ticksRadius.get() - tickLength * direction) * dx;
      const startY = half + (this.ticksRadius.get() - tickLength * direction) * dy;

      const endX = startX + tickLength * direction * dx;
      const endY = startY + tickLength * direction * dy;

      path += `M ${startX} ${startY} L ${endX} ${endY} `;
    }

    return path;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        <path class={{ 'map-path-shadow': true, 'hidden': this.props.hidden.map((v) => !v) }} d={this.tickPath} />
        <path class={{ 'hidden': this.props.hidden.map((v) => !v) }} d={this.tickPath} />
      </>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    this.ticksRadius.sub(() => {
      this.tickPath.set(this.buildRoseTicks());
    }, true);
  }
}

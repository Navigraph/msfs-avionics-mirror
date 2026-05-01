import { FSComponent, LifecycleComponent, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { Colors } from '../../Misc/Colors';

/** The properties for the {@link HeadingTrackPointer} component. */
interface HeadingTrackPointerProps {
  /** Compass size */
  compassSvgSize: number;
  /** Ring radius */
  rangeRingRadius: number | Subscribable<number>;
  /** Rotation of the heading pointer relative to the compass up direction in degrees, or null when invalid. */
  headingPointerRotation: Subscribable<number | null>;
  /** Rotation of the track line relative to the compass up direction in degrees, or null when invalid. */
  trackLineRotation: Subscribable<number | null>;
}

/** Heading pointer / track line component */
export class HeadingTrackPointer extends LifecycleComponent<HeadingTrackPointerProps> {
  private readonly rangeRingRadius = SubscribableUtils.toSubscribable(this.props.rangeRingRadius, true);
  private readonly ringTop = Subject.create(0);
  private readonly trianglePoints = Subject.create('');
  private readonly pointerTop = Subject.create('0px');
  private readonly center = this.props.compassSvgSize / 2;
  private readonly triangleWidth = 24;
  private readonly triangleHeight = 6;

  /** @inheritdoc */
  public render(): VNode {

    return (
      <>
        <div
          class={{ 'hidden': this.props.headingPointerRotation.map((v) => v === null).withLifecycle(this.defaultLifecycle) }}
          style={{
            position: 'absolute',
            top: '0px',
            left: '0px',
            width: `${this.props.compassSvgSize}px`,
            height: `${this.props.compassSvgSize}px`,
            transform: this.props.headingPointerRotation.map(
              (rot) => `rotate3d(0, 0, 1, ${rot ?? 0}deg)`
            ),
          }}
        >
          {/* Heading blue pointer */}
          <svg
            class="heading-pointer"
            width="22"
            height="23"
            viewBox="0 0 54.85 51.68"
            style={{
              position: 'absolute',
              left: `${this.center - 10}px`,
              top: this.pointerTop,
              pointerEvents: 'none',
            }}
          >
            <path
              fill={Colors.lightCyan}
              stroke={Colors.blue}
              stroke-width={4}
              d="M28.1 2.6l7.7 20c.3.7.9 1.1 1.6 1.1H51.6c1.6 0 2.3 1.9 1.2 3L27.7 49.8c-.7.6-1.7.6-2.4 0L2 26.6c-1.1-1.1-.3-3 1.2-3H15.3c.7 0 1.3-.4 1.6-1.1l8-19.9c.6-1.5 2.6-1.4 3.2 0Z"
            />
          </svg>
        </div>
        <div
          class={{ 'hidden': this.props.trackLineRotation.map((v) => v === null).withLifecycle(this.defaultLifecycle) }}
          style={{
            position: 'absolute',
            top: '0px',
            left: '0px',
            width: `${this.props.compassSvgSize}px`,
            height: `${this.props.compassSvgSize}px`,
            transform: this.props.trackLineRotation.map(
              (rot) => `rotate3d(0, 0, 1, ${rot ?? 0}deg)`
            ),
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${this.props.compassSvgSize} ${this.props.compassSvgSize}`}
            style={{
              position: 'absolute',
            }}
          >
            {/* outline */}
            <line
              x1={this.center}
              y1={this.center}
              x2={this.center}
              y2={this.ringTop.map(r => r + this.triangleHeight)}
              stroke="black"
              stroke-width={4}
              stroke-dasharray="1,4"
              stroke-line-cap="square"
            />

            {/* track line */}
            <line
              x1={this.center}
              y1={this.center}
              x2={this.center}
              y2={this.ringTop.map(r => r + this.triangleHeight)}
              stroke="white"
              stroke-width={2}
              stroke-dasharray="1,4"
              stroke-line-cap="square"
            />
            {/* track line pointer */}
            <polygon
              points={this.trianglePoints}
              fill="black"
              stroke="white"
              stroke-width={1}
            />
          </svg>
        </div>

      </>
    );
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.rangeRingRadius.sub(radius => {
      const ringTop = this.center - radius * 2 + 8;

      this.ringTop.set(ringTop);
      this.pointerTop.set(`${ringTop - 20}px`);

      const points = `
      ${this.center},${ringTop + this.triangleHeight - this.triangleWidth / 2}
      ${this.center - this.triangleWidth / 2},${ringTop + this.triangleHeight}
      ${this.center + this.triangleWidth / 2},${ringTop + this.triangleHeight}
    `.trim();

      this.trianglePoints.set(points);
    }, true);
  }
}

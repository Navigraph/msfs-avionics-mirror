import { DisplayComponent, FSComponent, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { Colors } from '../../Misc/Colors';

/** The properties for the {@link DesiredTrackBug} component. */
interface DesiredTrackBugProps {
  /** Compass size */
  compassSvgSize: number;
  /** Ring radius */
  rangeRingRadius: number | Subscribable<number>;
  /** Rotation deg */
  rotationDeg: Subscribable<number>;
}

/** Track Bug */
export class DesiredTrackBug extends DisplayComponent<DesiredTrackBugProps> {
  private readonly rangeRingRadius = SubscribableUtils.toSubscribable(this.props.rangeRingRadius, true);
  private readonly ringTop = Subject.create(0);
  private readonly trianglePoints = Subject.create('');

  /** @inheritdoc */
  public render(): VNode {

    return (
      <>
        <div
          class={{
            'hidden': !!this.props.rotationDeg.map((v) => v),
          }}
          style={{
            position: 'absolute',
            top: '0px',
            left: '0px',
            width: `${this.props.compassSvgSize}px`,
            height: `${this.props.compassSvgSize}px`,
            transform: this.props.rotationDeg.map(
              (rot) => `rotate3d(0, 0, 1, ${rot}deg)`
            ),
          }}
        >
          <svg
            width="100%"
            height="100%"
            class="track-bug"
            viewBox={`0 0 ${this.props.compassSvgSize} ${this.props.compassSvgSize}`}
            style={{
              position: 'absolute'
            }}
          >
            <polygon
              points={this.trianglePoints}
              fill={Colors.magenta}
              stroke="none"
            />
          </svg>
        </div>
      </>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    this.rangeRingRadius.sub(radius => {
      const center = this.props.compassSvgSize / 2;
      const triangleHeight = 8;
      const triangleWidth = 28;
      const ringTop = center - radius * 2 + 8;

      this.ringTop.set(ringTop);

      const points = `
      ${center},${ringTop + triangleHeight - triangleWidth / 2}
      ${center - triangleWidth / 2},${ringTop + triangleHeight}
      ${center + triangleWidth / 2},${ringTop + triangleHeight}
    `.trim();

      this.trianglePoints.set(points);
    }, true);
  }
}

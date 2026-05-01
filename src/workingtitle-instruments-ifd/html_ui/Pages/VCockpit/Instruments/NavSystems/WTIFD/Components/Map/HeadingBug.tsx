import { FSComponent, LifecycleComponent, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { Colors } from '../../Misc/Colors';

/** The properties for the {@link HeadingBug} component. */
interface HeadingBugProps {
  /** Compass size */
  compassSvgSize: number;
  /** Ring radius */
  rangeRingRadius: number | Subscribable<number>;
  /** Rotation deg */
  rotationDeg: Subscribable<number>;
  /** Whether the bug is hidden. */
  isHidden?: Subscribable<boolean>;
}

/** Heading Bug */
export class HeadingBug extends LifecycleComponent<HeadingBugProps> {
  private readonly rangeRingRadius = SubscribableUtils.toSubscribable(this.props.rangeRingRadius, true);
  private readonly topOffset = Subject.create('0px');
  private readonly center = this.props.compassSvgSize / 2;

  private readonly transform = this.props.rotationDeg.map(
    (rot) => `rotate3d(0, 0, 1, ${rot}deg)`
  ).withLifecycle(this.defaultLifecycle);


  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.register(
      this.rangeRingRadius.sub(radius => {
        this.topOffset.set(`${this.center - radius * 2 + 3}px`);
      }, true)
    ).withLifecycle(this.defaultLifecycle);

    this.props.isHidden?.sub((isHidden) => {
      if (isHidden) {
        this.transform.pause();
      } else {
        this.transform.resume();
      }
    }, true);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        <div
          class={{ 'hidden': this.props.isHidden ?? false }}
          style={{
            position: 'absolute',
            top: '0px',
            left: '0px',
            width: `${this.props.compassSvgSize}px`,
            height: `${this.props.compassSvgSize}px`,
            transform: this.transform,
          }}
        >
          <svg
            width="34"
            height="14"
            class="heading-bug"
            viewBox={'0 0 39 18'}
            style={{
              position: 'absolute',
              left: `${this.center - 17}px`,
              top: this.topOffset,
              pointerEvents: 'none',
              fill: `${Colors.magenta}`,
              stroke: `${Colors.darkMagenta}`,
              filter: 'drop-shadow(0px 0px 1px rgba(0, 0, 0, 1))'
            }}
          >
            <path
              d="M35.4 0h-2C32.4 0 31.3.4 30.6 1.2l-8 8c-.8.8-1.8 1.2-2.8 1.2s-2.1-.4-2.8-1.2L8.8 1.2C8.1.4 7.1 0 6 0h-2C1.8 0 0 1.8 0 4v10.1c0 2.2 1.8 4 4 4h31.4c2.2 0 4-1.8 4-4V4C39.4 1.8 37.6 0 35.4 0ZM13.3 13.7H5.3c-.6 0-1-.4-1-1v-7.3c0-.9 1-1.3 1.7-.7l8 7.3c.7.6.2 1.7-.7 1.7ZM35.1 12.7c0 .6-.4 1-1 1h-8c-.9 0-1.3-1.1-.7-1.7l8-7.3c.6-.6 1.7-.1 1.7.7v7.3Z"
            />
          </svg>
        </div>
      </>
    );
  }
}

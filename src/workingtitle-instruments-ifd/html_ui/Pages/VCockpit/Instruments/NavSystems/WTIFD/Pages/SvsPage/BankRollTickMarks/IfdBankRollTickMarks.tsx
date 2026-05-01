import {
  BitFlags, ComponentProps, CssTransformBuilder, FSComponent, HorizonLayer,
  HorizonProjection, HorizonProjectionChangeType, ObjectSubject, VNode
} from '@microsoft/msfs-sdk';
import {IfdSvsController} from '../IfdSvsController';

import './IfdBankRollTickMarks.css';

/** Props for {@link IfdBankRollTickMarks} */
interface IfdBankRollTickMarksProps extends ComponentProps {
  /** The IfdSvsController */
  controller: IfdSvsController;
  /** The layer's horizon projection. */
  projection: HorizonProjection;
}

/**
 * Dumb component.
 * The IFD bank roll tick marks component
 * Draws the tick marks SVG on render.
 */
export class IfdBankRollTickMarks extends HorizonLayer<IfdBankRollTickMarksProps> {
  /** The size of the compass in SVG unit */
  private readonly size = 200;
  /** The size of the compass container in pixels */
  private readonly width = 350; 

  /** The length of the major compass ticks, in pixels. */
  private readonly majorTickLength: number = 9.5;

  /** The length of the minor compass ticks, in pixels. */
  private readonly minorTickLength: number = 6.5;

  private readonly majorMark: number = 30; // degrees
  private readonly minorMark: number = 10; // degrees

  private readonly rootStyle = ObjectSubject.create({
    'display': '',
    'position': 'absolute',
    'left': '0px',
    'top': '0px',
    'width': '0px',
    'height': '0px',
    'transform': 'rotate3d(0, 0, 1, 0deg)'
  });

  private readonly ticksContainerStyle = ObjectSubject.create({
    'position': 'absolute',
    'left': `-${this.width / 2}px`,
    'top': '-212px',
    'width': `${this.width}px`,
  });

  private readonly rootTransform = CssTransformBuilder.rotate3d('deg');
  private needUpdateBank = false;

  private viewBox: string = `-98 ${-(this.size / 2 + this.majorTickLength)} 196 63`;

  /** @inheritdoc */
  protected onVisibilityChanged(isVisible: boolean): void {
    this.rootStyle.set('display', isVisible ? '' : 'none');
  }

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();

    this.updateRootPosition();

    this.needUpdateBank = true;
  }

  /** @inheritdoc */
  public onProjectionChanged(projection: HorizonProjection, changeFlags: number): void {
    if (BitFlags.isAll(changeFlags, HorizonProjectionChangeType.OffsetCenterProjected)) {
      this.updateRootPosition();
    }

    if (BitFlags.isAny(changeFlags, HorizonProjectionChangeType.Roll)) {
      this.needUpdateBank = true;
    }
  }

  /**
   * Updates this indicator's root container position.
   */
  private updateRootPosition(): void {
    const offsetCenter = this.props.projection.getOffsetCenterProjected();
    this.props.controller.ifdHorizonHeight.get() === IfdSvsController.ARTIFICIAL_HORIZON_HEIGHT_FULLSCREEN
      ? this.rootStyle.set('top', `${offsetCenter[1]}px`)
      : this.rootStyle.set('top', `${offsetCenter[1] + 16}px`);
    this.rootStyle.set('left', `${offsetCenter[0]}px`);
  }

  /** @inheritdoc */
  public onUpdated(): void {
    if (!this.isVisible()) {
      return;
    }

    if (this.needUpdateBank) {
      this.updateRoll();

      this.needUpdateBank = false;
    }
  }

  /**
   * Renders a bank roll tick at the provided degree value.
   * @param degree The degree to which a bank roll tick is drawn.
   * @param type Whether this is a tick shape ('base') SVG or a tick shadow SVG. Default as 'base'
   * @returns The tick mark SVG sub element as a VNode or null
   * if the degree is neither a major, a minor, or a defined special degree (0, 45, 315)
   */
  private renderTicks(degree: number, type: 'base' | 'shadow' = 'base'): VNode | null {
    const transform = `rotate(${degree}) translate(0, ${-this.size / 2})`;

    switch (degree) {
      case 0:
        return (
          <path
            class={{
              'wt-ifd-bank-roll-zero-mark': true,
              'shadow': type === 'shadow',
            }}
            d="M -4.8 -8.7 L 4.8 -8.7 L 0 -0.5 z"
            transform={transform}
          />
        );
      case 45:
      case 315:
        return (
          <path
            class={{
              'wt-ifd-bank-roll-small-triangle-mark': true,
              'shadow': type === 'shadow',
            }}
            d="M -2.8 -6.9 L -2.8 -7.3 L 2.8 -7.3 L 2.8 -6.9 L 0 -1.5 z"
            transform={transform}
          />
        );
      default:
        break;
    }

    const isMajor = degree % this.majorMark === 0;
    const isMinor = !isMajor && degree % this.minorMark === 0;

    if (!isMajor && !isMinor) {
      return null;
    }

    const baseLength = isMajor ? this.majorTickLength : this.minorTickLength;
    const length = type === 'shadow' ? baseLength + 0.5 : baseLength;

    return (
      <line
        x1={0} y1={-length}
        x2={0} y2={type === 'shadow' ? 0.5 : 0}
        transform={transform}
        class={{
          'wt-ifd-bank-roll-tick': true,
          'shadow': type === 'shadow',
          [`wt-ifd-bank-roll-tick-${isMajor ? 'major' : 'minor'}`]: true
        }}
      />
    );
  }

  /**
   * Updates the rotation of the bank pointer and slip/skid indicator.
   */
  private updateRoll(): void {
    const bank = this.props.projection.getRoll();

    this.rootTransform.set(0, 0, 1, -bank, 0.1);
    this.rootStyle.set('transform', this.rootTransform.resolve());
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class="wt-ifd-bank-roll-tick-marks-container"
        style={this.rootStyle}
      >
        <svg
          class="wt-ifd-bank-roll-tick-marks"
          viewBox={this.viewBox}
          style={this.ticksContainerStyle}
        >
          {this.renderTicks(0, 'shadow')} {/* White-filled triangle */}
          {this.renderTicks(10, 'shadow')}
          {this.renderTicks(20, 'shadow')}
          {this.renderTicks(30, 'shadow')}
          {this.renderTicks(45, 'shadow')} {/* Blank-filled small triangle */}
          {this.renderTicks(60, 'shadow')}
          {this.renderTicks(300, 'shadow')}
          {this.renderTicks(315, 'shadow')} {/* Blank-filled small triangle */}
          {this.renderTicks(330, 'shadow')}
          {this.renderTicks(340, 'shadow')}
          {this.renderTicks(350, 'shadow')}

          {this.renderTicks(0)} {/* White-filled triangle */}
          {this.renderTicks(10)}
          {this.renderTicks(20)}
          {this.renderTicks(30)}
          {this.renderTicks(45)} {/* Blank-filled small triangle */}
          {this.renderTicks(60)}
          {this.renderTicks(300)}
          {this.renderTicks(315)} {/* Blank-filled small triangle */}
          {this.renderTicks(330)}
          {this.renderTicks(340)}
          {this.renderTicks(350)}
        </svg>
      </div>
    );
  }
}

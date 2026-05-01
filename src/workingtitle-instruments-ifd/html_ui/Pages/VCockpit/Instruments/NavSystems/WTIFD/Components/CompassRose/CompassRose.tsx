import { ComponentProps, DisplayComponent, FSComponent, NodeReference, Subject, Subscribable, SubscribableUtils, UnitType, VNode } from '@microsoft/msfs-sdk';

import './CompassRose.css';

/** Direction that ticks should point on a compass rose. */
export type HSITickDirection = 'Inwards' | 'Outwards';

/** Props for {@link CompassRoseTicks} component. */
interface CompassRoseTicksProps extends ComponentProps {
  /** The size of the square svg viewbox. */
  svgViewBoxSize: number;
  /** Length of a short tick. */
  shortTickLength: number;
  /** Length of a long tick. */
  longTickLength: number;
  /** Distance to put ticks at from the center of the svg view box. */
  ticksRadius: number | Subscribable<number>;
  /** Whether ticks should go outwards or inwards. */
  tickDirection: HSITickDirection;
  /** Whether to draw the compass circle. */
  withCircle: boolean;
  /** Whether to draw the compass ticks. */
  withTicks?: Subscribable<boolean> | boolean;
  /** How many degrees between ticks. */
  degreesPerTick: number;
  /** How many degrees between big ticks. Defaults to 10. */
  degreesPerBigTick?: number;
  /** The degree to start the ticks from. Defaults to 0. */
  startDegrees?: number;
}

/** A compass rose display component. */
export class CompassRoseTicks extends DisplayComponent<CompassRoseTicksProps> {
  private readonly ticksRadius = SubscribableUtils.toSubscribable(this.props.ticksRadius, true);
  private readonly tickPath = Subject.create(this.buildRoseTicks());
  private readonly radiusValue = Subject.create(this.ticksRadius.get());
  private readonly withTicks: Subscribable<boolean> = SubscribableUtils.toSubscribable(this.props.withTicks ?? true, true);

  /** Builds the compass rose tick marks.
   * @returns A collection of rose tick line elements. */
  private buildRoseTicks(): string {
    const {
      svgViewBoxSize,
      shortTickLength,
      longTickLength,
      tickDirection,
      degreesPerTick,
      degreesPerBigTick = 10,
      startDegrees = 0,
    } = this.props;
    const half = svgViewBoxSize / 2;

    const direction = tickDirection === 'Inwards' ? 1 : -1;
    const radialOffset = tickDirection === 'Inwards' ? 0 : 1;

    let path = '';

    for (let deg = startDegrees; deg < 360; deg += degreesPerTick) {
      const length = (deg % degreesPerBigTick == 0 ? longTickLength : shortTickLength) * direction;

      const startX = half + (this.ticksRadius.get() - length + radialOffset) * Math.sin(deg * Avionics.Utils.DEG2RAD);
      const startY = half + (this.ticksRadius.get() - length + radialOffset) * -Math.cos(deg * Avionics.Utils.DEG2RAD);

      const endX = startX + (length * Math.sin(deg * Avionics.Utils.DEG2RAD));
      const endY = startY + (length * -Math.cos(deg * Avionics.Utils.DEG2RAD));

      path += `M ${startX} ${startY} L ${endX} ${endY} `;
    }
    return path;
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        {this.props.withCircle &&
          <circle class="compass-circle map-path-shadow" cx="50%" cy="50%" r={this.radiusValue.map(r => r + 1)} />}
        <path class={{ 'map-path-shadow': true, 'hidden': this.withTicks.map((v) => !v) }} d={this.tickPath} />
        {this.props.withCircle &&
          <circle class="compass-circle" cx="50%" cy="50%" r={this.radiusValue.map(r => r + 1)} />}
        <path d={this.tickPath} class={{ 'hidden': this.withTicks.map((v) => !v) }} />
      </>
    );
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    this.ticksRadius.sub((radius) => {
      this.radiusValue.set(radius);
      this.tickPath.set(this.buildRoseTicks());
    }, true);
  }
}

/** Props for {@link CompassRoseNumbers} component. */
interface CompassRoseNumbersProps extends ComponentProps {
  /** The size of the square svg viewbox. */
  readonly svgViewBoxSize: number;
  /** Distance from the center that the numbers will be placed. */
  readonly numbersRadius: number | Subscribable<number>;
  /** The map data provider. */
  readonly rotation: Subscribable<number>;
  /** The rotational alignment of the numbers. */
  readonly alignNumbers?: 'Screen' | 'Ticks';
  /** Whether or not the cardinal directions (N, E, S, W) should be bigger than the other heading numbers. */
  readonly largeCardinalDirections?: boolean;
  /** The large font size of the compass rose numbers. Defaults to 18 px */
  readonly largeFontSize?: number;
  /** The small font size of the compass rose numbers. Defaults to 13 px */
  readonly smallFontSize?: number;
}

const DEG_TO_LETTER: Record<number, string> = {
  90: 'E',
  180: 'S',
  270: 'W',
  360: 'N'
};

/** A compass rose display component. */
export class CompassRoseNumbers extends DisplayComponent<CompassRoseNumbersProps> {
  private readonly numbersRadius = SubscribableUtils.toSubscribable(this.props.numbersRadius, true);

  private readonly numberRefs: {
    /** degrees */
    deg: number,
    /** ref */
    ref: NodeReference<HTMLDivElement>,
  }[] = [];

  /**
   * Builds the compass rose letter markings.
   * @returns A collection of letter marking text elements.
   */
  private buildNumbers(): SVGTextElement[] {
    const degreesPerNumber = 30;
    const degreesPerLetter = 90;

    const texts = [] as SVGTextElement[];

    for (let deg = degreesPerNumber; deg <= 360; deg += degreesPerNumber) {
      const isLetter = deg % degreesPerLetter === 0;

      const ref = FSComponent.createRef<HTMLDivElement>();

      this.numberRefs.push({ deg, ref });

      const text = isLetter
        ? DEG_TO_LETTER[deg]
        : Math.round(deg / 10).toFixed(0);

      texts.push(
        <div
          ref={ref}
          style={{
            position: 'absolute',
            display: 'flex',
            'align-items': 'center',
            'font-size': (this.props.largeCardinalDirections && isLetter ? (this.props.largeFontSize ?? 18) : (this.props.smallFontSize ?? 13)) + 'px',
          }}
        >
          {text}
        </div>
      );
    }

    return texts;
  }

  /**
   * Update the number positions
   * @param rot Rotation degree
   */
  private updateNumberPositions(rot: number): void {
    this.numberRefs.forEach(numberRef => {
      const rotated = numberRef.deg - rot;
      const rad = UnitType.DEGREE.convertTo(rotated, UnitType.RADIAN);
      const x = Math.sin(rad) * this.numbersRadius.get();
      const y = -Math.cos(rad) * this.numbersRadius.get();
      let transform = `translate3d(${x}px, ${y}px, 0px)`;
      if (this.props.alignNumbers === 'Ticks') {
        transform += ` rotate3d(0, 0, 1, ${numberRef.deg - rot}deg)`;
      }
      numberRef.ref.instance.style.transformOrigin = '50% 50%';
      numberRef.ref.instance.style.transform = transform;
    });
  }


  /** @inheritdoc */
  public onAfterRender(): void {
    this.props.rotation.sub(rot => this.updateNumberPositions(rot));
    this.numbersRadius.sub(() => this.updateNumberPositions(this.props.rotation.get()), true);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="compass-numbers" style="display: flex; justify-content: center; align-items: center;">
        {this.buildNumbers()}
      </div>
    );
  }
}

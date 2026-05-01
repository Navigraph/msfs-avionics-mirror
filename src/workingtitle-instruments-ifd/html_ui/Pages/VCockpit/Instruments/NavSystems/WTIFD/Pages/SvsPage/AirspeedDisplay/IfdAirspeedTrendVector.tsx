import { ClockEvents, Lookahead, MathUtils, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdBaseTrendVector, IfdBaseTrendVectorProps } from '../../../Components/TrendVectors/IfdBaseTrendVector';

import './IfdAirspeedTrendVector.css';

/** Props for the airspeed trend vector. */
export interface IfdAirspeedTrendVectorProps extends IfdBaseTrendVectorProps {
  /** The indicated airspeed in knots. */
  ias: Subscribable<number>;
}

/**
 * The IfdAirspeedTrendVector component.
 */
export class IfdAirspeedTrendVector extends IfdBaseTrendVector<IfdAirspeedTrendVectorProps> {
  protected significanceThreshold = 2;

  protected override readonly trend = Subject.create(0);

  private readonly casTrendFilter = new Lookahead(6000, 200 / Math.LN2, 1000 / Math.LN2);

  private lastSimDuration = 0;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.bus.getSubscriber<ClockEvents>().on('activeSimDuration').handle((duration) => {
      const dt = this.lastSimDuration > 0 ? MathUtils.clamp(duration - this.lastSimDuration, 0, 1000) : 0;
      this.lastSimDuration = duration;
      this.updateTrend(dt);
    });
  }

  /**
   * @inheritDoc
   * @param dt The time since the last update in ms.
   */
  private updateTrend(dt: number): void {
    const cas = this.props.ias.get();
    if (cas !== null) {
      const diff = this.casTrendFilter.nextTrend(MathUtils.clamp(cas, 50, 999), dt);
      this.trend.set(MathUtils.round(diff, 0.1));
    } else {
      this.casTrendFilter.reset();
      this.trend.set(0);
    }
  }
}

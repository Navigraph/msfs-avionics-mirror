import { MathUtils, Subscribable } from '@microsoft/msfs-sdk';

import { IfdBaseTrendVector, IfdBaseTrendVectorProps } from '../../../Components/TrendVectors/IfdBaseTrendVector';

import './IfdAltitudeTrendVector.css';

/** Props for the altitude trend vector. */
export interface IfdAltitudeTrendVectorProps extends IfdBaseTrendVectorProps {
  /** Barometric vertical speed in feet per minute. */
  baroVerticalSpeed: Subscribable<number>;
}

/**
 * The IfdAltitudeTrendVector component.
 */
export class IfdAltitudeTrendVector extends IfdBaseTrendVector<IfdAltitudeTrendVectorProps> {
  protected significanceThreshold = 100;

  protected readonly trend = this.props.baroVerticalSpeed.map((v: number) =>
    v < 0
      ? Math.ceil(MathUtils.clamp(v, -99950, 99950) / 50) * 50
      : Math.floor(MathUtils.clamp(v, -99950, 99950) / 50) * 50
  ).withLifecycle(this.defaultLifecycle);
}

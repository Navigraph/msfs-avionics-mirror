import { EventBus } from '../data/EventBus';
import { RegisteredSimVarUtils, SimVarValueType } from '../data/SimVars';
import { ThrottleLeverManager } from '../fadec/ThrottleLeverManager';
import { Accessible } from '../sub/Accessible';
import { Subscribable } from '../sub/Subscribable';
import { AbstractAutothrottle, AutothrottleThrottle, AutothrottleThrottleInfo } from './AbstractAutothrottle';

/**
 * An autothrottle system for turboprop engines.
 */
export class TurbopropAutothrottle extends AbstractAutothrottle {
  /** @inheritdoc */
  protected createThrottle(
    bus: EventBus,
    info: AutothrottleThrottleInfo,
    servoSpeed: number | Accessible<number>,
    powerSmoothingConstant: number,
    powerSmoothingVelocityConstant: number | undefined,
    powerLookahead: Subscribable<number>,
    powerLookaheadSmoothingConstant: number | undefined,
    powerLookaheadSmoothingVelocityConstant: number | undefined,
    throttleLeverManager: ThrottleLeverManager | undefined
  ): AutothrottleThrottle {
    return new TurbopropAutothrottleThrottle(
      bus,
      info,
      servoSpeed,
      powerSmoothingConstant, powerSmoothingVelocityConstant,
      powerLookahead,
      powerLookaheadSmoothingConstant, powerLookaheadSmoothingVelocityConstant,
      throttleLeverManager
    );
  }
}

/**
 * An autothrottle throttle for turboprop engines.
 */
class TurbopropAutothrottleThrottle extends AutothrottleThrottle {
  private readonly torqueSimVar = RegisteredSimVarUtils.create(`TURB ENG MAX TORQUE PERCENT:${this.index}`, SimVarValueType.Percent);

  /** @inheritdoc */
  public constructor(
    bus: EventBus,
    info: AutothrottleThrottleInfo,
    servoSpeed: number | Accessible<number>,
    powerSmoothingConstant: number,
    powerSmoothingVelocityConstant: number | undefined,
    powerLookahead: Subscribable<number>,
    powerLookaheadSmoothingConstant: number | undefined,
    powerLookaheadSmoothingVelocityConstant: number | undefined,
    throttleLeverManager?: ThrottleLeverManager
  ) {
    super(
      bus,
      info,
      servoSpeed,
      powerSmoothingConstant, powerSmoothingVelocityConstant,
      powerLookahead,
      powerLookaheadSmoothingConstant, powerLookaheadSmoothingVelocityConstant,
      throttleLeverManager
    );
  }

  /** @inheritdoc */
  protected getPower(): number {
    return this.torqueSimVar.get();
  }
}

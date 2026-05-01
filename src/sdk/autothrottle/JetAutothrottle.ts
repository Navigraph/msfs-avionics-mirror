import { EventBus } from '../data/EventBus';
import { RegisteredSimVarUtils, SimVarValueType } from '../data/SimVars';
import { ThrottleLeverManager } from '../fadec/ThrottleLeverManager';
import { Accessible } from '../sub/Accessible';
import { Subscribable } from '../sub/Subscribable';
import { AbstractAutothrottle, AutothrottleThrottle, AutothrottleThrottleInfo } from './AbstractAutothrottle';

/**
 * An autothrottle system for turbine jet engines.
 */
export class JetAutothrottle extends AbstractAutothrottle {
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
    return new JetAutothrottleThrottle(
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
 * An autothrottle throttle for turbine jet engines.
 */
class JetAutothrottleThrottle extends AutothrottleThrottle {
  private readonly n1SimVar = RegisteredSimVarUtils.create(`TURB ENG N1:${this.index}`, SimVarValueType.Percent);
  private readonly commandedN1SimVar = RegisteredSimVarUtils.create(`TURB ENG THROTTLE COMMANDED N1:${this.index}`, SimVarValueType.Percent);

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
    return this.n1SimVar.get();
  }

  /** @inheritdoc */
  protected getCommandedPower(): number {
    return this.commandedN1SimVar.get();
  }
}

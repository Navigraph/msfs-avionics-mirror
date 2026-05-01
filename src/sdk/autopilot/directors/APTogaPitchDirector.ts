import { APDataItem } from '../APDataProvider';
import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for {@link APTogaPitchDirector}.
 */
export type APTogaPitchDirectorOptions = {
  /**
   * The target pitch angle commanded by the director, in degrees, or a function which returns it. Defaults to `10`.
   */
  targetPitchAngle?: number | (() => number);

  /**
   * Whether the director should drive its commanded pitch angle toward the target angle instead of immediately setting
   * the commanded pitch angle to the target angle. Defaults to `false`.
   */
  drivePitch?: boolean;

  /**
   * The pitch rate to enforce when the director commands changes in pitch angle, in degrees per second, or a function
   * which returns it. If not defined, then a default pitch rate will be used. Ignored if `drivePitch` is `false`.
   * Defaults to `undefined`.
   */
  pitchRate?: number | (() => number) | undefined;
};

/**
 * An autopilot director that generates flight director pitch commands to hold a pitch attitude and sets the
 * `L:WT_TOGA_ACTIVE` SimVar state to true (1) when it is armed or activated, and to false (0) when it is
 * deactivated.
 *
 * If the director is created with access to an {@link APValues} object, then the director requires valid pitch data to
 * arm or activate.
 */
export class APTogaPitchDirector implements PlaneDirector {
  /** @inheritDoc */
  public state: DirectorState;

  /** @inheritDoc */
  public onActivate?: () => void;

  /** @inheritDoc */
  public onArm?: () => void;

  /** @inheritDoc */
  public onDeactivate?: () => void;

  /** @inheritDoc */
  public drivePitch?: (pitch: number, adjustForAoa?: boolean, adjustForVerticalWind?: boolean, rate?: number, maxNoseDownPitch?: number, maxNoseUpPitch?: number) => void;

  /** @inheritDoc */
  public setPitch?: (pitch: number) => void;

  private readonly isConstantPitch: boolean;

  private readonly targetPitchAngleFunc: () => number;
  private readonly drivePitchFunc?: (pitch: number) => void;

  private readonly pitch?: APDataItem<number>;

  /**
   * Creates a new instance of APTogaPitchDirector.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options with which to configure this director.
   */
  public constructor(apValues: APValues, options?: Readonly<APTogaPitchDirectorOptions>);
  /**
   * Creates a new instance of APTogaPitchDirector.
   * @param targetPitchAngle The target pitch angle set by this director when activated, in degrees. Positive values
   * indicate upward pitch. Defaults to `10`.
   * @deprecated Please use the constructor overload that takes an `APValues` object and options object as arguments
   * instead.
   */
  public constructor(targetPitchAngle?: number);
  // eslint-disable-next-line jsdoc/require-jsdoc
  public constructor(arg1?: APValues | number, options?: Readonly<APTogaPitchDirectorOptions>) {
    let apValues: APValues | undefined = undefined;

    if (arg1 !== undefined && typeof arg1 === 'object') {
      apValues = arg1;
    } else {
      options = {
        targetPitchAngle: arg1
      };
    }

    const targetPitchAngleOpt = options?.targetPitchAngle ?? 10;
    if (typeof targetPitchAngleOpt === 'number') {
      this.targetPitchAngleFunc = () => targetPitchAngleOpt;
    } else {
      this.targetPitchAngleFunc = targetPitchAngleOpt;
    }

    if (options?.drivePitch && apValues) {
      const pitchRateOpt = options?.pitchRate;
      switch (typeof pitchRateOpt) {
        case 'number':
          this.drivePitchFunc = pitch => {
            if (isFinite(pitch) && this.drivePitch) {
              this.drivePitch(pitch, false, false, pitchRateOpt * apValues!.simRate.get());
            }
          };
          break;
        case 'function':
          this.drivePitchFunc = pitch => {
            if (isFinite(pitch) && this.drivePitch) {
              this.drivePitch(pitch, false, false, pitchRateOpt() * apValues!.simRate.get());
            }
          };
          break;
        default:
          this.drivePitchFunc = pitch => {
            if (isFinite(pitch) && this.drivePitch) {
              this.drivePitch(pitch);
            }
          };
      }
    }

    this.isConstantPitch = typeof targetPitchAngleOpt === 'number' && this.drivePitchFunc === undefined;

    this.pitch = apValues?.dataProvider.getItem('pitch');

    this.state = DirectorState.Inactive;
  }

  /**
   * Checks whether the data required for this director to function are valid.
   * @returns Whether the data required for this director to function are valid.
   */
  private isDataValid(): boolean {
    return this.pitch === undefined || this.pitch.isValueValid();
  }

  /** @inheritDoc */
  public activate(): void {
    if (this.state === DirectorState.Active || !this.isDataValid()) {
      return;
    }

    this.state = DirectorState.Active;

    if (this.onActivate !== undefined) {
      this.onActivate();
    }

    if (this.isConstantPitch) {
      this.setPitch && this.setPitch(-this.targetPitchAngleFunc());
    }

    // TODO: The simvar is not currently writeable, so the line below has no effect.
    SimVar.SetSimVarValue('AUTOPILOT TAKEOFF POWER ACTIVE', 'Bool', true);
    SimVar.SetSimVarValue('L:WT_TOGA_ACTIVE', 'Bool', true);
  }

  /** @inheritDoc */
  public arm(): void {
    if (this.state == DirectorState.Inactive) {
      this.activate();
    }
  }

  /** @inheritDoc */
  public deactivate(): void {
    if (this.state === DirectorState.Inactive) {
      return;
    }

    this.state = DirectorState.Inactive;

    if (this.onDeactivate !== undefined) {
      this.onDeactivate();
    }

    // TODO: The simvar is not currently writeable, so the line below has no effect.
    SimVar.SetSimVarValue('AUTOPILOT TAKEOFF POWER ACTIVE', 'Bool', false);
    SimVar.SetSimVarValue('L:WT_TOGA_ACTIVE', 'Bool', false);
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state !== DirectorState.Active) {
      return;
    }

    if (!this.isDataValid()) {
      this.deactivate();
      return;
    }

    if (!this.isConstantPitch) {
      if (this.drivePitchFunc) {
        this.drivePitchFunc(-this.targetPitchAngleFunc());
      } else if (this.setPitch) {
        this.setPitch(-this.targetPitchAngleFunc());
      }
    }
  }
}

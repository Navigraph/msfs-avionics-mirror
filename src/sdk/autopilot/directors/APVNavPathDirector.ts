import { EventBus } from '../../data/EventBus';
import { SimVarValueType } from '../../data/SimVars';
import { MathUtils } from '../../math/MathUtils';
import { SimpleMovingAverage } from '../../math/SimpleMovingAverage';
import { Accessible } from '../../sub/Accessible';
import { Subscribable } from '../../sub/Subscribable';
import { SubscribableUtils } from '../../sub/SubscribableUtils';
import { APDataItem } from '../APDataProvider';
import { APValues } from '../APValues';
import { VNavVars } from '../vnav/VNavEvents';
import { VNavUtils } from '../vnav/VNavUtils';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Vertical navigation guidance for {@link APVNavPathDirector}.
 */
export type APVNavPathDirectorGuidance = {
  /** Whether this guidance is valid. */
  isValid: boolean;

  /**
   * The flight path angle of the vertical track, in degrees. Positive angles indicate a downward-sloping
   * track.
   */
  fpa: number;

  /**
   * The deviation of the vertical track from the airplane, in feet. Positive values indicate the track lies above
   * the airplane.
   */
  deviation: number;
};

/**
 * Options for {@link APVNavPathDirector}.
 */
export type APVNavPathDirectorOptions = {
  /**
   * The maximum absolute pitch up angle, in degrees, supported by the director, or a function which returns it. A
   * value of `null` will cause the director will use the maximum pitch up angle defined by its parent autopilot (via
   * `apValues`). Defaults to `null`.
   */
  maxPitchUpAngle?: number | null | (() => number | null);

  /**
   * The maximum absolute pitch down angle, in degrees, supported by the director, or a function which returns it. A
   * value of `null` will cause the director will use the maximum pitch up angle defined by its parent autopilot (via
   * `apValues`). Defaults to `null`.
   */
  maxPitchDownAngle?: number | null | (() => number | null);

  /**
   * The guidance for the director to use. If not defined, then the director will source guidance data from VNAV
   * SimVars at the index defined by `vnavIndex`.
   */
  guidance?: Accessible<Readonly<APVNavPathDirectorGuidance>>;

  /**
   * The index of the VNAV from which the director should source guidance data from SimVars. Ignored if `guidance` is
   * defined. Defaults to `0`.
   */
  vnavIndex?: number | Subscribable<number>;
};

/**
 * An autopilot director that generates flight director pitch commands to track a VNAV path.
 *
 * If the director is created with access to an {@link APValues} object, then the director requires valid pitch data to
 * arm or activate.
 */
export class APVNavPathDirector implements PlaneDirector {
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

  protected verticalWindAverage = new SimpleMovingAverage(10);

  protected readonly guidance?: Accessible<Readonly<APVNavPathDirectorGuidance>>;

  protected readonly vnavIndex?: Subscribable<number>;

  protected deviationSimVar: string = VNavVars.VerticalDeviation;
  protected fpaSimVar: string = VNavVars.FPA;

  private readonly maxPitchUpAngleFunc: () => number | undefined;
  private readonly maxPitchDownAngleFunc: () => number | undefined;

  protected readonly isGuidanceValidFunc: () => boolean;
  protected readonly getFpaFunc: () => number;
  protected readonly getDeviationFunc: () => number;

  private readonly pitch?: APDataItem<number>;

  private readonly getGroundSpeedFunc: () => number;

  /**
   * Creates a new instance of APVNavPathDirector.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options with which to configure the director.
   */
  public constructor(apValues: APValues, options?: Readonly<APVNavPathDirectorOptions>);
  /**
   * Creates a new instance of APVNavPathDirector.
   * @param bus The event bus.
   * @param options Options with which to configure the director.
   * @deprecated Please use the overload that takes an {@link APValues} object instead.
   */
  public constructor(bus: EventBus, options?: Readonly<APVNavPathDirectorOptions>);
  // eslint-disable-next-line jsdoc/require-jsdoc
  public constructor(arg1: APValues | EventBus, options?: Readonly<APVNavPathDirectorOptions>) {
    this.maxPitchUpAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchUpAngle);
    this.maxPitchDownAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchDownAngle);

    if (options?.guidance) {
      this.guidance = options.guidance;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.isGuidanceValidFunc = () => this.guidance!.get().isValid;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.getFpaFunc = () => this.guidance!.get().fpa;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.getDeviationFunc = () => this.guidance!.get().deviation;
    } else {
      this.vnavIndex = SubscribableUtils.toSubscribable(options?.vnavIndex ?? 0, true);
      this.vnavIndex.sub(index => {
        if (VNavUtils.isValidVNavIndex(index)) {
          const suffix = index === 0 ? '' : `:${index}`;
          this.deviationSimVar = `${VNavVars.VerticalDeviation}${suffix}`;
          this.fpaSimVar = `${VNavVars.FPA}${suffix}`;
        }
      });

      this.isGuidanceValidFunc = () => true;
      this.getFpaFunc = SimVar.GetSimVarValue.bind(undefined, this.fpaSimVar, SimVarValueType.Degree);
      this.getDeviationFunc = SimVar.GetSimVarValue.bind(undefined, this.deviationSimVar, SimVarValueType.Feet);
    }

    if (arg1 instanceof EventBus) {
      this.getGroundSpeedFunc = SimVar.GetSimVarValue.bind(undefined, 'GROUND VELOCITY', SimVarValueType.Knots);
    } else {
      this.getGroundSpeedFunc = () => arg1.dataProvider.getItem('ground_speed').getActualValue();
    }

    this.state = DirectorState.Inactive;
  }

  /**
   * Creates a function that returns the maximum pitch angle limit defined by an option.
   * @param option The option that defines the maximum pitch angle limit.
   * @returns A function that returns the maximum pitch angle limit defined by the specified option.
   */
  private createMaxPitchAngleFunc(option: number | null | (() => number | null) = null): () => number | undefined {
    switch (typeof option) {
      case 'number':
        return () => option;
      case 'function':
        return () => option() ?? undefined;
      default:
        return () => undefined;
    }
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

    SimVar.SetSimVarValue('AUTOPILOT PITCH HOLD', 'Bool', 0);
  }

  /** @inheritDoc */
  public arm(): void {
    if (this.state !== DirectorState.Inactive || !this.isDataValid()) {
      return;
    }

    this.state = DirectorState.Armed;

    if (this.onArm !== undefined) {
      this.onArm();
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
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state === DirectorState.Inactive) {
      return;
    }

    if (!this.isDataValid()) {
      this.deactivate();
      return;
    }

    if (this.state === DirectorState.Active) {
      if (!this.isGuidanceValidFunc()) {
        this.deactivate();
        return;
      }

      this.drivePitch && this.drivePitch(this.getDesiredPitch(), true, true, undefined, this.maxPitchDownAngleFunc(), this.maxPitchUpAngleFunc());
    }
  }

  /**
   * Gets a desired pitch from the FPA, AOA and Deviation.
   * @returns The desired pitch angle.
   */
  protected getDesiredPitch(): number {
    // FPA uses positive-down convention.
    const fpa = this.getFpaFunc();
    // Deviation is positive if the path lies above the airplane.
    const deviation = this.getDeviationFunc();

    const groundSpeed = this.getGroundSpeedFunc();

    const fpaPercentage = Math.max(deviation / (VNavUtils.getPathErrorDistance(groundSpeed) * -1), -1) + 1;

    // We limit desired pitch to avoid divebombing if something like a flight plan change suddenly puts you way above the path
    return Math.min(MathUtils.clamp(fpa * fpaPercentage, -1, fpa + 3), 10);
  }
}

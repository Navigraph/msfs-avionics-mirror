import { RegisteredSimVarUtils, SimVarValueType } from '../../data/SimVars';
import { ExpSmoother } from '../../math/ExpSmoother';
import { MathUtils } from '../../math/MathUtils';
import { UnitType } from '../../math/NumberUnit';
import { Subject } from '../../sub/Subject';
import { Subscribable } from '../../sub/Subscribable';
import { PidController } from '../../utils/controllers/PidController';
import { APDataProvider } from '../APDataProvider';

/**
 * Configuration options for {@link GenericFlcComputer}.
 */
export interface FlcComputerOptions {
  /** kP The proportional gain of the controller. */
  kP: number;

  /** kI The integral gain of the controller. */
  kI: number;

  /** kD The differential gain of the controller. */
  kD: number;

  /** maxOut The maximum output of the controller. */
  maxOut: number;

  /** minOut The minumum output of the controller. */
  minOut: number;

  /** maxI The maximum integral gain (optional). */
  maxI?: number;

  /** minI The minimum integral gain (optional). */
  minI?: number;

  /**
   * A provider of data for the computer to use. If not defined, then the computer will source required data from
   * standard SimVars.
   */
  apDataProvider?: APDataProvider;
}

/**
 * A Generic FLC computer to be used in directors that require FLC logic.
 */
export class GenericFlcComputer {

  protected readonly apDataProvider?: APDataProvider;
  protected readonly getIas: () => number | null;
  protected readonly getPitch: () => number | null;
  protected readonly getAoa: () => number | null;
  protected readonly getAcceleration: () => number | null;

  private _isActive = false;
  protected _targetIas = 0;
  protected _climbMode = false;

  private readonly _pitchTarget = Subject.create<number | null>(null);
  /**
   * The current pitch target calculated by this computer, in degrees. Positive values indicate downward pitch. If this
   * computer is not active or if a pitch target could not be calculated, then this value is null.
   */
  public readonly pitchTarget: Subscribable<number | null> = this._pitchTarget;

  protected _lastTime = 0;
  protected readonly pitchController: PidController;
  protected filter = new ExpSmoother(2.5);

  /**
   * Gets if this computer is active
   * @returns if this computer is active.
   */
  public get isActive(): boolean {
    return this._isActive;
  }

  // eslint-disable-next-line jsdoc/require-returns
  /** This computer's target speed, in knots indicated airspeed. */
  public get targetIas(): number {
    return this._targetIas;
  }

  // eslint-disable-next-line jsdoc/require-returns
  /**
   * Whether this computer is in climb mode. In climb mode, the computer will not target a pitch that would cause the
   * airplane to descend. When not in climb mode, the computer will not target a pitch that would cause the airplane to
   * climb.
   */
  public get isClimbMode(): boolean {
    return this._climbMode;
  }

  /**
   * Creates an instance of GenericFlcComputer.
   * @param options Options with which to configure the computer.
   */
  public constructor(options: Readonly<FlcComputerOptions>) {
    this.apDataProvider = options.apDataProvider;

    ({
      getIas: this.getIas,
      getPitch: this.getPitch,
      getAoa: this.getAoa,
      getAcceleration: this.getAcceleration,
    } = this.createDataGetters());

    this.pitchController = new PidController(
      options.kP,
      options.kI,
      options.kD,
      options.maxOut,
      options.minOut,
      options.maxI,
      options.minI
    );
  }

  /**
   * Creates this computer's data getter functions.
   * @returns Data getter functions for this computer.
   */
  private createDataGetters(): {
    /** A function that returns the airplane's current indicated airspeed, in knots. */
    getIas: () => number | null;

    /**
     * A function that returns the airplane's current pitch, in degrees. Positive values indicate upward pitch.
     * Negative values indicate downward pitch.
     */
    getPitch: () => number | null;

    /** A function that returns the airplane's current angle of attack. */
    getAoa: () => number | null;

    /**
     * A function that returns the airplane's current acceleration along its longitudinal axis, in meters per second
     * squared.
     */
    getAcceleration: () => number | null;
  } {
    if (this.apDataProvider) {
      const ias = this.apDataProvider.getItem('ias');
      const pitch = this.apDataProvider.getItem('pitch');
      const aoa = this.apDataProvider.getItem('aoa');
      const accel = this.apDataProvider.getItem('inertial_acceleration_body_z');

      return {
        getIas: () => ias.isValueValid() ? ias.getValue() : null,
        getPitch: () => pitch.isValueValid() ? -pitch.getValue() : null,
        getAoa: () => aoa.getActualValue(),
        getAcceleration: () => accel.getActualValue(),
      };
    } else {
      const ias = RegisteredSimVarUtils.create('AIRSPEED INDICATED', SimVarValueType.Knots);
      const pitch = RegisteredSimVarUtils.create('PLANE PITCH DEGREES', SimVarValueType.Degree);
      const aoa = RegisteredSimVarUtils.create('INCIDENCE ALPHA', SimVarValueType.Degree);
      const accel = RegisteredSimVarUtils.create('ACCELERATION BODY Z', SimVarValueType.MetersPerSecondSquared);

      return {
        getIas: () => ias.get(),
        getPitch: () => -pitch.get(),
        getAoa: () => aoa.get(),
        getAcceleration: () => accel.get(),
      };
    }
  }

  /**
   * Activates this computer.
   * @param climbMode Whether to force climb mode on (`true`) or off (`false`) on activation. If undefined, the climb
   * mode state will remain unchanged.
   */
  public activate(climbMode?: boolean): void {
    this._isActive = true;
    if (climbMode !== undefined) {
      this._climbMode = climbMode;
    }
    this.initialize();
  }

  /**
   * Turns climb mode on or off.
   * @param setToClimbMode Whether climb mode should be turned on.
   */
  public setClimbMode(setToClimbMode: boolean): void {
    this._climbMode = setToClimbMode;
  }

  /**
   * Sets the target speed for this computer, in knots indicated airspeed.
   * @param ias The target speed to set, in knots indicated airspeed.
   */
  public setTargetSpeed(ias: number): void {
    this._targetIas = ias;
  }

  /**
   * Deactivates this computer.
   */
  public deactivate(): void {
    this._isActive = false;
    this._pitchTarget.set(null);
  }

  /**
   * Initializes this director on activation.
   */
  private initialize(): void {
    this._lastTime = 0;
    this.pitchController.reset();
    this.filter.reset();
  }

  /**
   * Updates this director.
   */
  public update(): void {
    if (this._isActive) {
      const desiredPitch = this.getDesiredPitch();
      if (isFinite(desiredPitch)) {
        // negate the output value to conform with sim standard.
        this._pitchTarget.set(-desiredPitch);
      } else {
        this._pitchTarget.set(null);
      }
    } else {
      this._pitchTarget.set(null);
    }
  }

  /**
   * Gets a desired pitch when airborne to maintain a given speed.
   * @returns The desired pitch angle.
   */
  protected getDesiredPitch(): number {
    const time = performance.now() / 1000;
    let dt = time - this._lastTime;
    if (this._lastTime === 0) {
      dt = 0;
    }

    const currentIas = this.getIas();
    const currentPitch = this.getPitch();
    const currentAoa = this.getAoa();
    const currentAccel = this.getAcceleration();

    if (
      currentIas === null
      || currentPitch === null
      || currentAoa === null
      || currentAccel === null
    ) {
      return NaN;
    }

    //step 1 - we want to find the IAS error from target and set a target acceleration
    const iasError = currentIas - this._targetIas;
    const targetAcceleration = MathUtils.clamp(iasError / 5, -2, 2) * -1;

    //step 2 - we want to find the current acceleration, feed that to the pid to manage to the target acceleration
    const acceleration = UnitType.METER.convertTo(currentAccel, UnitType.NMILE) * 3600;
    const accelerationError = acceleration - targetAcceleration;
    const pitchCorrection = this.pitchController.getOutput(dt, accelerationError);

    this._lastTime = time;
    let targetPitch = isNaN(pitchCorrection) ? currentPitch - currentAoa : (currentPitch - currentAoa) + pitchCorrection;
    targetPitch = this.filter.next(targetPitch, dt);

    if (this._climbMode) {
      return Math.max(targetPitch + currentAoa, currentAoa);
    } else {
      return Math.min(targetPitch + currentAoa, currentAoa);
    }
  }
}

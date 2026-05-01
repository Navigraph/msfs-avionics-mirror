import { MathUtils } from '../../math/MathUtils';
import { UnitType } from '../../math/NumberUnit';
import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for {@link APVSDirector}.
 */
export type APVSDirectorOptions = {
  /**
   * The maximum absolute pitch up angle, in degrees, supported by the director, or a function which returns it. A
   * value of `null` will cause the director will use the maximum pitch up angle defined by its parent autopilot (via
   * `apValues`). Defaults to `15`.
   */
  maxPitchUpAngle?: number | null | (() => number | null);

  /**
   * The maximum absolute pitch down angle, in degrees, supported by the director, or a function which returns it. A
   * value of `null` will cause the director will use the maximum pitch up angle defined by its parent autopilot (via
   * `apValues`). Defaults to `15`.
   */
  maxPitchDownAngle?: number | null | (() => number | null);

  /**
   * The increment, in feet per minute, to use to round the target vertical speed set by the director on activation. If
   * not defined, then the target vertical speed will not be rounded.
   */
  targetVsIncrement?: number;
};

/**
 * An autopilot director that generates flight director pitch commands to hold an indicated vertical speed.
 *
 * The director requires valid pitch and indicated vertical speed data to arm or activate.
 */
export class APVSDirector implements PlaneDirector {

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

  private readonly maxPitchUpAngleFunc: () => number | undefined;
  private readonly maxPitchDownAngleFunc: () => number | undefined;

  protected readonly vsIncrement: number | undefined;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly verticalSpeed = this.apValues.dataProvider.getItem('indicated_vertical_speed');
  private readonly tas = this.apValues.dataProvider.getItem('tas');

  /**
   * Creates a new instance of APVSDirector.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options with which to configure the director.
   */
  public constructor(apValues: APValues, options?: Readonly<APVSDirectorOptions>);
  /**
   * Creates a new instance of APVSDirector.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param vsIncrement The increment, in feet per minute, to use to round the target vertical speed set by the
   * director on activation. If not defined, then the target vertical speed will not be rounded.
   * @deprecated Please use the constructor that takes an options object instead.
   */
  public constructor(apValues: APValues, vsIncrement: number | undefined);
  // eslint-disable-next-line jsdoc/require-jsdoc
  public constructor(protected readonly apValues: APValues, arg2?: Readonly<APVSDirectorOptions> | number) {
    let options: Readonly<APVSDirectorOptions> | undefined;
    if (typeof arg2 === 'number') {
      options = { targetVsIncrement: arg2 };
    } else {
      options = arg2;
    }

    this.maxPitchUpAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchUpAngle);
    this.maxPitchDownAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchDownAngle);

    this.vsIncrement = options?.targetVsIncrement;

    this.state = DirectorState.Inactive;
  }

  /**
   * Creates a function that returns the maximum pitch angle limit defined by an option.
   * @param option The option that defines the maximum pitch angle limit.
   * @returns A function that returns the maximum pitch angle limit defined by the specified option.
   */
  private createMaxPitchAngleFunc(option: number | null | (() => number | null) = 15): () => number | undefined {
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
    return this.pitch.isValueValid() && this.verticalSpeed.isValueValid();
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

    const currentVs = this.vsIncrement === undefined
      ? this.verticalSpeed.getValue()
      : MathUtils.round(this.verticalSpeed.getValue(), this.vsIncrement);
    Coherent.call('AP_VS_VAR_SET_ENGLISH', 1, currentVs);
    SimVar.SetSimVarValue('AUTOPILOT VERTICAL HOLD', 'Bool', true);
  }

  /**
   * Arms this director. If the director is not already active, then this will immediately attempt to activate the
   * director.
   */
  public arm(): void {
    if (this.state === DirectorState.Inactive) {
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

    SimVar.SetSimVarValue('AUTOPILOT VERTICAL HOLD', 'Bool', false);
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state !== DirectorState.Active) {
      return;
    }

    if (this.isDataValid()) {
      this.drivePitch && this.drivePitch(this.getDesiredPitch(), true, true, undefined, this.maxPitchDownAngleFunc(), this.maxPitchUpAngleFunc());
    } else {
      this.deactivate();
    }
  }

  /**
   * Gets a desired pitch from the selected vs value.
   * @returns The desired pitch angle.
   */
  protected getDesiredPitch(): number {
    const tas = this.tas.getActualValue();
    const desiredPitch = this.getFpa(UnitType.NMILE.convertTo(tas / 60, UnitType.FOOT), this.apValues.selectedVerticalSpeed.get());
    return isNaN(desiredPitch) ? 0 : -desiredPitch;
  }

  /**
   * Gets a desired fpa.
   * @param distance is the distance traveled per minute.
   * @param altitude is the vertical speed per minute.
   * @returns The desired pitch angle.
   */
  private getFpa(distance: number, altitude: number): number {
    return UnitType.RADIAN.convertTo(Math.atan(altitude / distance), UnitType.DEGREE);
  }
}

import { DirectorState, PlaneDirector } from './PlaneDirector';
import { MathUtils } from '../../math/MathUtils';
import { APValues } from '../APValues';

/**
 * Options for {@link APFPADirector}.
 */
export type APFPADirectorOptions = {
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
   * The maximum flight path angle, in degrees, supported by the director, or a function which returns it. If not
   * defined, then the director will not limit the FPA.
   */
  maxFpa?: number | (() => number);
};

/**
 * An autopilot director that generates flight director pitch commands to hold a flight path angle.
 *
 * The director requires valid pitch, ground speed, and positional vertical speed data to arm or activate.
 */
export class APFPADirector implements PlaneDirector {
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
  private readonly maxFpaFunc: () => number;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly aoa = this.apValues.dataProvider.getItem('aoa');
  private readonly groundSpeed = this.apValues.dataProvider.getItem('ground_speed');
  private readonly positionVerticalSpeed = this.apValues.dataProvider.getItem('position_vertical_speed');

  /**
   * Creates a new instance of APFPADirector.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options to configure the new director.
   */
  public constructor(private readonly apValues: APValues, options?: Readonly<APFPADirectorOptions>) {
    this.maxPitchUpAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchUpAngle);
    this.maxPitchDownAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchDownAngle);

    const maxFpaOpt = options?.maxFpa ?? undefined;
    switch (typeof maxFpaOpt) {
      case 'number':
        this.maxFpaFunc = () => maxFpaOpt;
        break;
      case 'function':
        this.maxFpaFunc = maxFpaOpt;
        break;
      default:
        this.maxFpaFunc = () => Infinity;
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
    return this.pitch.isValueValid() && this.groundSpeed.isValueValid() && this.positionVerticalSpeed.isValueValid();
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

    const fpa = this.getCurrentFpa();
    SimVar.SetSimVarValue('L:WT_AP_FPA_Target:1', 'degree', fpa);
    SimVar.SetSimVarValue('AUTOPILOT VERTICAL HOLD', 'Bool', true);
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

    SimVar.SetSimVarValue('AUTOPILOT VERTICAL HOLD', 'Bool', false);
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

    const maxFpa = this.maxFpaFunc();
    this.drivePitch && this.drivePitch(
      -MathUtils.clamp(this.apValues.selectedFlightPathAngle.get(), -maxFpa, maxFpa),
      true,
      true,
      undefined,
      this.maxPitchDownAngleFunc(),
      this.maxPitchUpAngleFunc()
    );
  }

  /**
   * Gets the current aircraft FPA.
   * @returns The current aircraft FPA, in degrees.
   */
  private getCurrentFpa(): number {
    return -this.pitch.getActualValue() - this.aoa.getActualValue();
  }
}

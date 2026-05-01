import { EventBus } from '../../data/EventBus';
import { SimVarValueType } from '../../data/SimVars';
import { Accessible } from '../../sub/Accessible';
import { Subscribable } from '../../sub/Subscribable';
import { SubscribableUtils } from '../../sub/SubscribableUtils';
import { APLateralModes } from '../APTypes';
import { APValues } from '../APValues';
import { ApproachGuidanceMode } from '../VerticalNavigation';
import { VNavVars } from '../vnav/VNavEvents';
import { VNavUtils } from '../vnav/VNavUtils';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Glidepath guidance for {@link APGPDirector}.
 */
export type APGPDirectorGuidance = {
  /** Whether this guidance is valid. */
  isValid: boolean;

  /** The flight path angle of the glidepath, in degrees. Positive angles indicate a downward-sloping path. */
  fpa: number;

  /**
   * The deviation of the glidepath from the airplane, in feet. Positive values indicate the path lies above the
   * airplane.
   */
  deviation: number;
};

/**
 * Options for {@link APGPDirector}.
 */
export type APGPDirectorOptions = {
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
  guidance?: Accessible<Readonly<APGPDirectorGuidance>>;

  /**
   * The index of the VNAV from which the director should source guidance data from SimVars. Ignored if `guidance` is
   * defined. Defaults to `0`.
   */
  vnavIndex?: number | Subscribable<number>;

  /**
   * A function that checks whether the director can be armed. If not defined, then the director can always be armed.
   * @param isGuidanceValid Whether valid glidepath guidance is available.
   * @param fpa The flight path angle of the glidepath, in degrees. Positive angles indicate a downward-sloping path.
   * @param deviation The deviation of the glidepath from the airplane, in feet. Positive values indicate the path lies
   * above the airplane.
   * @returns Whether the director can be armed.
   */
  canArm?: (isGuidanceValid: boolean, fpa: number, deviation: number) => boolean;

  /**
   * A function that checks whether the director can capture a glidepath from an armed state. If not defined, then the
   * director will capture if the autopilot's active lateral mode is `APLateralModes.GPSS`, the glidepath's flight
   * path angle is greater than zero, and deviation is between 100 and -15 feet.
   * @param fpa The flight path angle of the glidepath, in degrees. Positive angles indicate a downward-sloping path.
   * @param deviation The deviation of the glidepath from the airplane, in feet. Positive values indicate the path lies
   * above the airplane.
   * @returns Whether the director can capture a glidepath from an armed state.
   */
  canCapture?: (fpa: number, deviation: number) => boolean;

  /**
   * A function that checks whether the director can continue tracking a glidepath. If not defined, then the director
   * will continue tracking as long as the autopilot's active lateral mode is `APLateralModes.GPSS`.
   * @param fpa The flight path angle of the glidepath, in degrees. Positive angles indicate a downward-sloping path.
   * @param deviation The deviation of the glidepath from the airplane, in feet. Positive values indicate the path lies
   * above the airplane.
   * @returns Whether the director can continue tracking a glidepath.
   */
  canTrack?: (fpa: number, deviation: number) => boolean;
};

/**
 * An autopilot director that generates flight director pitch commands to track a glidepath.
 *
 * The director requires valid pitch data to arm or activate.
 */
export class APGPDirector implements PlaneDirector {
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

  private readonly guidance?: Accessible<Readonly<APGPDirectorGuidance>>;

  private readonly vnavIndex?: Subscribable<number>;

  private deviationSimVar: string = VNavVars.GPVerticalDeviation;
  private fpaSimVar: string = VNavVars.GPFpa;

  private readonly isGuidanceValidFunc: () => boolean;
  private readonly getFpaFunc: () => number;
  private readonly getDeviationFunc: () => number;

  private readonly canArmFunc: (isGuidanceValid: boolean, fpa: number, deviation: number) => boolean;
  private readonly canCaptureFunc: (fpa: number, deviation: number) => boolean;
  private readonly canTrackFunc: (fpa: number, deviation: number) => boolean;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly groundSpeed = this.apValues.dataProvider.getItem('ground_speed');

  /**
   * Creates a new instance of APGPDirector.
   * @param bus The event bus.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options with which to configure the director.
   */
  public constructor(
    bus: EventBus,
    private readonly apValues: APValues,
    options?: Readonly<APGPDirectorOptions>
  ) {
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
          this.deviationSimVar = `${VNavVars.GPVerticalDeviation}${suffix}`;
          this.fpaSimVar = `${VNavVars.GPFpa}${suffix}`;
        }
      });

      this.isGuidanceValidFunc = () => true;
      this.getFpaFunc = SimVar.GetSimVarValue.bind(undefined, this.fpaSimVar, SimVarValueType.Degree);
      this.getDeviationFunc = SimVar.GetSimVarValue.bind(undefined, this.deviationSimVar, SimVarValueType.Feet);
    }

    this.canArmFunc = options?.canArm ?? APGPDirector.defaultCanArm;
    this.canCaptureFunc = options?.canCapture ?? APGPDirector.defaultCanCapture.bind(undefined, this.apValues);
    this.canTrackFunc = options?.canTrack ?? APGPDirector.defaultCanTrack.bind(undefined, this.apValues);

    this.state = DirectorState.Inactive;

    apValues.approachHasGP.sub(hasGp => {
      if (this.state !== DirectorState.Inactive && !hasGp) {
        this.deactivate();
      }
    });
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
    return this.pitch.isValueValid();
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

    SimVar.SetSimVarValue(VNavVars.GPApproachMode, SimVarValueType.Number, ApproachGuidanceMode.GPActive);
    SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ACTIVE', 'Bool', true);
    SimVar.SetSimVarValue('AUTOPILOT APPROACH ACTIVE', 'Bool', true);
    SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ARM', 'Bool', false);
  }

  /** @inheritDoc */
  public arm(): void {
    if (this.state !== DirectorState.Inactive || !this.isDataValid()) {
      return;
    }

    if (this.canArmFunc(this.isGuidanceValidFunc(), this.getFpaFunc(), this.getDeviationFunc())) {
      this.state = DirectorState.Armed;

      if (this.onArm !== undefined) {
        this.onArm();
      }

      SimVar.SetSimVarValue(VNavVars.GPApproachMode, SimVarValueType.Number, ApproachGuidanceMode.GPArmed);
      SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ARM', 'Bool', true);
      SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ACTIVE', 'Bool', false);
      SimVar.SetSimVarValue('AUTOPILOT APPROACH ACTIVE', 'Bool', true);
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

    SimVar.SetSimVarValue(VNavVars.GPApproachMode, SimVarValueType.Number, ApproachGuidanceMode.None);
    SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ARM', 'Bool', false);
    SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ACTIVE', 'Bool', false);
    SimVar.SetSimVarValue('AUTOPILOT APPROACH ACTIVE', 'Bool', false);
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

    const isGuidanceValid = this.isGuidanceValidFunc();
    let deviation: number | undefined;
    let fpa: number | undefined;

    if (this.state === DirectorState.Armed) {
      fpa = this.getFpaFunc();
      deviation = this.getDeviationFunc();

      if (!this.canArmFunc(isGuidanceValid, fpa, deviation)) {
        this.deactivate();
      } else if (isGuidanceValid && this.canCaptureFunc(fpa, deviation)) {
        this.activate();
      }
    }

    if (this.state === DirectorState.Active) {
      fpa ??= this.getFpaFunc();
      deviation ??= this.getDeviationFunc();

      if (!isGuidanceValid || !this.canTrackFunc(fpa, deviation)) {
        this.deactivate();
        return;
      }

      const groundSpeed = this.groundSpeed.getActualValue();
      const fpaPercentage = Math.max(deviation / (VNavUtils.getPathErrorDistance(groundSpeed) * -1), -1) + 1;
      this.drivePitch && this.drivePitch(fpa * fpaPercentage, true, true, undefined, this.maxPitchDownAngleFunc(), this.maxPitchUpAngleFunc());
    }
  }

  /**
   * Checks whether the director can be armed using default logic.
   * @returns Whether the director can be armed.
   */
  private static defaultCanArm(): boolean {
    return true;
  }

  /**
   * Checks whether the director can capture a glidepath from an armed state using default logic.
   * @param apValues Autopilot values.
   * @param fpa The flight path angle of the glidepath, in degrees. Positive angles indicate a downward-sloping path.
   * @param deviation The deviation of the glidepath from the airplane, in feet. Positive values indicate the path lies
   * above the airplane.
   * @returns Whether the director can capture the glidepath.
   */
  private static defaultCanCapture(apValues: APValues, fpa: number, deviation: number): boolean {
    return apValues.lateralActive.get() === APLateralModes.GPSS
      && fpa > 0
      && deviation <= 100
      && deviation >= -15;
  }

  /**
   * Checks whether the director can continue tracking a glidepath using default logic.
   * @param apValues Autopilot values.
   * @returns Whether the director can continuing tracking the glidepath.
   */
  private static defaultCanTrack(apValues: APValues): boolean {
    return apValues.lateralActive.get() === APLateralModes.GPSS;
  }
}

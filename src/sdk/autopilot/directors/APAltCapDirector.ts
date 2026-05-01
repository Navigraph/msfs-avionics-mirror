import { MathUtils } from '../../math/MathUtils';
import { UnitType } from '../../math/NumberUnit';
import { DebounceTimer } from '../../utils/time/DebounceTimer';
import { APValues } from '../APValues';
import { VNavUtils } from '../vnav/VNavUtils';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for {@link APAltCapDirector}.
 */
export type APAltCapDirectorOptions = {
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
   * An optional function that contains the logic for the capturing. Has to return the desired pitch as input for the pitch controller.
   */
  captureAltitude: APAltCapDirectorCaptureFunc | undefined;

  /**
   * A function that returns true if the capturing shall start.
   */
  shouldActivate: APAltCapDirectorActivationFunc | undefined;

  /**
   * The time to inhibit altitude capture when the target altitude is changed, in ms.
   * Setting the time to null disables inhibition.
   * Defaults to 500 ms.
   * Note that if alt capture is already active when the target is changed, this will have no effect.
   */
  targetChangeInhibitTime: number | null;
};

/**
 * A function which calculates a desired pitch angle, in degrees, to capture a target altitude.
 * @param targetAltitude The altitude to capture, in feet.
 * @param indicatedAltitude The current indicated altitude, in feet.
 * @param initialFpa The flight path angle of the airplane, in degrees, when altitude capture was first activated.
 * Positive values indicate a descending path.
 * @param tas The current true airspeed of the airplane, in knots.
 * @returns The desired pitch angle, in degrees, to capture the specified altitude. Positive values indicate nose-up
 * pitch.
 */
export type APAltCapDirectorCaptureFunc = (
  targetAltitude: number,
  indicatedAltitude: number,
  initialFpa: number,
  tas: number
) => number;


/**
 * A function which returns true if the capturing shall be activated
 * @param vs Current vertical speed in [ft/min]
 * @param targetAltitude Target altitude [ft]
 * @param currentAltitude Current altitude [ft]
 * @returns True if the capturing shall be activated
 */
export type APAltCapDirectorActivationFunc = (
  vs: number,
  targetAltitude: number,
  currentAltitude: number) => boolean;

/**
 * An autopilot director that generates flight director pitch commands to capture a target indicated altitude.
 *
 * The director requires valid pitch, indicated altitude and indicated vertical speed data to arm or activate.
 */
export class APAltCapDirector implements PlaneDirector {
  private static readonly DEFAULT_TARGET_CHANGE_INHIBIT_MS = 500;
  private static readonly EMPTY_FUNCTION = (): void => { };

  private readonly targetChangeInhibitTimer?: DebounceTimer;
  private readonly targetChangeInhibitTime: number | null = APAltCapDirector.DEFAULT_TARGET_CHANGE_INHIBIT_MS;

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

  private initialFpa = 0;
  private readonly captureAltitude: APAltCapDirectorCaptureFunc = APAltCapDirector.captureAltitude;
  private readonly shouldActivate: APAltCapDirectorActivationFunc = APAltCapDirector.shouldActivate;

  /**
   * Inhibits altitude capture actrivation for {@link APAltCapDirector.targetChangeInhibitTime}.
   */
  private inhibitAltCapture?: () => void;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly indicatedAltitude = this.apValues.dataProvider.getItem('indicated_altitude');
  private readonly indicatedVerticalSpeed = this.apValues.dataProvider.getItem('indicated_vertical_speed');
  private readonly tas = this.apValues.dataProvider.getItem('tas');

  /**
   * Creates an instance of the APAltCapDirector.
   * @param apValues Autopilot data for this director.
   * @param options Optional options object with these:
   * --> shouldActivate: An optional function which returns true if the capturing shall be activated. If not
   * defined, a default function is used.
   * --> captureAltitude: An optional function which calculates desired pitch angles to capture a target altitude. If not
   * defined, a default function is used.
   * --> targetChangeInhibitTime: The time to inhibit altitude capture when the target altitude is changed, in ms.
   * Setting the time to null disables inhibition.
   * Defaults to 500 ms.
   * Note that if alt capture is already active when the target is changed, this will have no effect.
   */
  public constructor(
    private readonly apValues: APValues,
    options?: Partial<Readonly<APAltCapDirectorOptions>>
  ) {
    this.maxPitchUpAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchUpAngle);
    this.maxPitchDownAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchDownAngle);

    if (options?.captureAltitude !== undefined) {
      this.captureAltitude = options.captureAltitude;
    }
    if (options?.shouldActivate !== undefined) {
      this.shouldActivate = options.shouldActivate;
    }
    if (options?.targetChangeInhibitTime !== undefined) {
      this.targetChangeInhibitTime = options.targetChangeInhibitTime;
    }

    if (this.targetChangeInhibitTime !== null) {
      this.targetChangeInhibitTimer = new DebounceTimer();
      this.inhibitAltCapture = () => {
        this.targetChangeInhibitTimer?.schedule(APAltCapDirector.EMPTY_FUNCTION, this.targetChangeInhibitTime!);
      };
      this.apValues.selectedAltitude.sub(this.inhibitAltCapture, false);
    }

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
    return this.pitch.isValueValid() && this.indicatedAltitude.isValueValid() && this.indicatedVerticalSpeed.isValueValid();
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

    this.setCaptureFpa(this.indicatedVerticalSpeed.getValue(), this.indicatedAltitude.getValue());

    SimVar.SetSimVarValue('AUTOPILOT ALTITUDE LOCK', 'Bool', true);
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

    SimVar.SetSimVarValue('AUTOPILOT ALTITUDE LOCK', 'Bool', false);
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
      this.drivePitch && this.drivePitch(
        -this.captureAltitude(
          this.apValues.capturedAltitude.get(),
          this.indicatedAltitude.getValue(),
          this.initialFpa,
          this.tas.getActualValue()
        ),
        true,
        true,
        undefined,
        this.maxPitchDownAngleFunc(),
        this.maxPitchUpAngleFunc()
      );
    } else {
      this.tryActivate();
    }
  }

  /**
   * Attempts to activate altitude capture.
   */
  private tryActivate(): void {
    if (this.targetChangeInhibitTimer?.isPending()) {
      return;
    }

    const selectedAltitude = this.apValues.selectedAltitude.get();
    const vs = this.indicatedVerticalSpeed.getValue();
    const alt = this.indicatedAltitude.getValue();
    if (this.shouldActivate(vs, selectedAltitude, alt)) {
      this.apValues.capturedAltitude.set(Math.round(selectedAltitude));
      this.activate();
    }
  }

  /**
   * A function which returns true if the capturing shall be activated
   * @param vs Current vertical speed in [ft/min]
   * @param targetAltitude Target altitude [ft]
   * @param currentAltitude Current altitude [ft]
   * @returns True if the capturing shall be activated
   */
  private static shouldActivate(vs: number, targetAltitude: number, currentAltitude: number): boolean {
    return (Math.abs(targetAltitude - currentAltitude) <= Math.abs(vs / 6));
  }

  /**
   * Sets the initial capture FPA from the current vs value when capture is initiated.
   * @param vs The current vertical speed, in FPM.
   * @param alt The current indicated altitude, in Feet.
   */
  private setCaptureFpa(vs: number, alt: number): void {
    const altCapDeviation = alt - this.apValues.selectedAltitude.get();

    if (altCapDeviation < 0) {
      vs = Math.max(400, vs);
    } else {
      vs = Math.min(-400, vs);
    }

    const tas = UnitType.KNOT.convertTo(this.tas.getActualValue(), UnitType.FPM);
    this.initialFpa = VNavUtils.getFpa(tas, vs);
  }

  /**
   * Calculates a desired pitch angle, in degrees, to capture a target altitude.
   * @param targetAltitude The altitude to capture, in feet.
   * @param indicatedAltitude The current indicated altitude, in feet.
   * @param initialFpa The flight path angle of the airplane, in degrees, when altitude capture was first activated.
   * Positive values indicate a descending path.
   * @param tas The current true airspeed of the airplane, in knots.
   * @returns The desired pitch angle, in degrees, to capture the specified altitude. Positive values indicate nose-up
   * pitch.
   */
  private static captureAltitude(
    targetAltitude: number,
    indicatedAltitude: number,
    initialFpa: number,
    tas: number
  ): number {
    const initialFpaAbs = Math.abs(initialFpa);
    let deltaAltitude = targetAltitude - indicatedAltitude;

    if (deltaAltitude >= 0 && deltaAltitude < 10) {
      deltaAltitude = 10;
    } else if (deltaAltitude < 0 && deltaAltitude > -10) {
      deltaAltitude = -10;
    }

    const desiredClosureTime = MathUtils.lerp(Math.abs(deltaAltitude), 100, 1000, 5, 10, true, true);
    const desiredVs = deltaAltitude / (desiredClosureTime / 60);

    const desiredFpa = MathUtils.clamp(Math.asin(desiredVs / UnitType.KNOT.convertTo(tas, UnitType.FPM)) * Avionics.Utils.RAD2DEG, -initialFpaAbs, initialFpaAbs);
    return desiredFpa;
  }
}

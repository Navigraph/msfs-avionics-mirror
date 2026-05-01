import { SimVarValueType } from '../../data/SimVars';
import { AeroMath } from '../../math/AeroMath';
import { UnitType } from '../../math/NumberUnit';
import { APValues } from '../APValues';
import { GenericFlcComputer } from '../calculators/GenericFlcComputer';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * A command for {@link APFLCDirector} to set selected speed targets.
 */
export type APFLCDirectorSetSpeedCommand = {
  /** The selected IAS target to set, in knots, or `undefined` if the selected IAS target should remain unchanged. */
  ias: number | undefined;

  /** The selected mach target to set, or `undefined` if the selected mach target should remain unchanged. */
  mach: number | undefined;

  /** Whether the selected speed target should be in mach, or `undefined` if the setting should remain unchanged. */
  isSelectedSpeedInMach: boolean | undefined;
};

/**
 * Options for {@link APFLCDirector}.
 */
export type APFLCDirectorOptions = {
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
   * A function which commands the director to set selected speed targets when the director is activated. The function
   * takes the following as parameters:
   * * The airplane's current indicated airspeed, in knots
   * * The airplane's current mach number
   * * Whether the current selected speed target is in mach
   * * An object which defines commands to set selected speed targets.
   * The function should use the command object to set certain selected IAS and mach targets, and whether the selected
   * speed target should be in mach. Any undefined commands will leave the current settings unchanged.
   */
  setSpeedOnActivation?: (currentIas: number, currentMach: number, isSelectedSpeedInMach: boolean, command: APFLCDirectorSetSpeedCommand) => void;

  /**
   * Whether the director should use mach number calculated from the impact pressure derived from indicated airspeed
   * and ambient pressure instead of the true mach number. Defaults to `false`.
   */
  useIndicatedMach?: boolean;

  /**
   * The FLC computer for the director to use to generate pitch commands. If not defined, then a default computer will
   * be created.
   */
  flcComputer?: GenericFlcComputer;
};

/**
 * An autopilot director that generates flight director pitch commands to hold an indicated airspeed or mach. Sets the
 * `AUTOPILOT FLIGHT LEVEL CHANGE` SimVar state to true (1) when it is armed or activated, and to false (0) when it is
 * deactivated.
 *
 * The director requires valid pitch, indicated airspeed, mach, and indicated altitude data to arm or activate.
 */
export class APFLCDirector implements PlaneDirector {
  /** @inheritDoc */
  public state: DirectorState;

  private readonly flcComputer: GenericFlcComputer;

  /** @inheritDoc */
  public onActivate?: () => void;

  /** @inheritDoc */
  public onArm?: () => void;

  /** @inheritDoc */
  public onDeactivate?: () => void;

  /** @inheritDoc */
  public drivePitch?: (pitch: number, adjustForAoa?: boolean, adjustForVerticalWind?: boolean, rate?: number, maxNoseDownPitch?: number, maxNoseUpPitch?: number) => void;

  private readonly setSpeedCommand: APFLCDirectorSetSpeedCommand = {
    ias: undefined,
    mach: undefined,
    isSelectedSpeedInMach: undefined
  };

  private readonly maxPitchUpAngleFunc: () => number | undefined;
  private readonly maxPitchDownAngleFunc: () => number | undefined;
  private readonly setSpeedOnActivationFunc: (currentIas: number, currentMach: number, isSelectedSpeedInMach: boolean, command: APFLCDirectorSetSpeedCommand) => void;

  private readonly useIndicatedMach: boolean;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly ias = this.apValues.dataProvider.getItem('ias');
  private readonly mach = this.apValues.dataProvider.getItem('mach');
  private readonly pressure = this.apValues.dataProvider.getItem('static_air_pressure');
  private readonly indicatedAltitude = this.apValues.dataProvider.getItem('indicated_altitude');

  /**
   * Creates a new instance of APFLCDirector.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options with which to configure the new director.
   */
  public constructor(private readonly apValues: APValues, options?: Readonly<APFLCDirectorOptions>) {
    this.maxPitchUpAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchUpAngle);
    this.maxPitchDownAngleFunc = this.createMaxPitchAngleFunc(options?.maxPitchDownAngle);

    this.setSpeedOnActivationFunc = options?.setSpeedOnActivation ?? APFLCDirector.defaultSetSpeedOnActivation;

    this.useIndicatedMach = options?.useIndicatedMach ?? false;

    this.state = DirectorState.Inactive;
    this.flcComputer = options?.flcComputer ?? new GenericFlcComputer({ kP: 2, kI: 0, kD: 0, maxOut: 90, minOut: -90, apDataProvider: apValues.dataProvider });
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
    return this.pitch.isValueValid()
      && this.ias.isValueValid()
      && this.mach.isValueValid()
      && this.indicatedAltitude.isValueValid();
  }

  /** @inheritDoc */
  public activate(): void {
    if (this.state === DirectorState.Active || !this.isDataValid()) {
      return;
    }

    this.state = DirectorState.Active;
    this.onActivate && this.onActivate();

    // Handle setting selected speed on activation.

    this.setSpeedCommand.ias = undefined;
    this.setSpeedCommand.mach = undefined;
    this.setSpeedCommand.isSelectedSpeedInMach = undefined;

    const ias = this.ias.getValue();
    let mach: number;
    if (this.useIndicatedMach) {
      mach = AeroMath.casToMach(UnitType.KNOT.convertTo(ias, UnitType.MPS), this.pressure.getActualValue());
    } else {
      mach = this.mach.getValue();
    }

    this.setSpeedOnActivationFunc(
      ias,
      mach,
      this.apValues.isSelectedSpeedInMach.get(),
      this.setSpeedCommand
    );

    if (this.setSpeedCommand.ias !== undefined) {
      SimVar.SetSimVarValue('K:AP_SPD_VAR_SET', SimVarValueType.Number, this.setSpeedCommand.ias);
    }
    if (this.setSpeedCommand.mach !== undefined) {
      SimVar.SetSimVarValue('K:AP_MACH_VAR_SET', SimVarValueType.Number, Math.round(this.setSpeedCommand.mach * 100));
    }
    if (this.setSpeedCommand.isSelectedSpeedInMach !== undefined) {
      SimVar.SetSimVarValue(this.setSpeedCommand.isSelectedSpeedInMach ? 'K:AP_MANAGED_SPEED_IN_MACH_ON' : 'K:AP_MANAGED_SPEED_IN_MACH_OFF', SimVarValueType.Number, 0);
    }

    // Activate sim FLC hold and initialize FLC computer climb mode state

    SimVar.SetSimVarValue('AUTOPILOT FLIGHT LEVEL CHANGE', 'Bool', true);

    const currentAltitude = this.indicatedAltitude.getValue();
    this.flcComputer.activate(this.apValues.selectedAltitude.get() > currentAltitude);
  }

  /** @inheritDoc */
  public arm(): void {
    if (this.state !== DirectorState.Inactive || !this.isDataValid()) {
      return;
    }

    this.state = DirectorState.Armed;
    this.onArm && this.onArm();
  }

  /** @inheritDoc */
  public deactivate(): void {
    if (this.state === DirectorState.Inactive) {
      return;
    }

    this.state = DirectorState.Inactive;
    this.onDeactivate && this.onDeactivate();

    SimVar.SetSimVarValue('AUTOPILOT FLIGHT LEVEL CHANGE', 'Bool', false);
    this.flcComputer.deactivate();
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

    if (this.state !== DirectorState.Active) {
      return;
    }

    const currentAltitude = this.indicatedAltitude.getValue();
    this.flcComputer.setClimbMode(this.apValues.selectedAltitude.get() > currentAltitude);

    if (this.apValues.isSelectedSpeedInMach.get()) {
      const mach = this.apValues.selectedMach.get();

      let ias: number;
      if (this.useIndicatedMach) {
        ias = UnitType.KNOT.convertFrom(AeroMath.machToCas(mach, this.pressure.getActualValue()), UnitType.MPS);
      } else {
        ias = Simplane.getMachToKias(mach);
        if (!isFinite(ias)) {
          // Sometimes getMachToKias returns a NaN value. If so, fall back to doing the conversion ourselves.
          ias = UnitType.KNOT.convertFrom(AeroMath.machToCas(mach, this.pressure.getActualValue()), UnitType.MPS);
        }
      }

      this.flcComputer.setTargetSpeed(ias);
    } else {
      this.flcComputer.setTargetSpeed(this.apValues.selectedIas.get());
    }

    this.flcComputer.update();
    const pitchTarget = this.flcComputer.pitchTarget.get();

    if (pitchTarget !== null) {
      // The pitch target from the FLC computer does not need to be adjusted for AOA or vertical wind.
      this.drivePitch && this.drivePitch(pitchTarget, false, false, undefined, this.maxPitchDownAngleFunc(), this.maxPitchUpAngleFunc());
    } else {
      this.deactivate();
    }
  }

  /**
   * Executes default logic for setting selected speed targets when the FLC director is activated. If the current
   * selected speed target is in IAS, then the selected IAS target will be set to the airplane's current indicated
   * airspeed. If the current selected speed target is in mach, then the selected mach target will be set to the
   * airplane's current mach number.
   * @param currentIas The airplane's current indicated airspeed, in knots.
   * @param currentMach The airplane's current mach number.
   * @param isSelectedSpeedInMach Whether the current selected speed target is in mach.
   * @param command The command to set selected speed targets.
   */
  private static defaultSetSpeedOnActivation(currentIas: number, currentMach: number, isSelectedSpeedInMach: boolean, command: APFLCDirectorSetSpeedCommand): void {
    if (isSelectedSpeedInMach) {
      command.mach = currentMach;
    } else {
      command.ias = currentIas;
    }
  }
}

import { ConsumerValue } from '../../data/ConsumerValue';
import { EventBus } from '../../data/EventBus';
import { SimVarValueType } from '../../data/SimVars';
import { GeoPoint } from '../../geo/GeoPoint';
import { NavComEvents } from '../../instruments/NavCom';
import { NavSourceId, NavSourceType } from '../../instruments/NavProcessor';
import { NavRadioIndex } from '../../instruments/RadioCommon';
import { MathUtils } from '../../math/MathUtils';
import { Unit, UnitFamily, UnitType } from '../../math/NumberUnit';
import { APLateralModes, APVerticalModes } from '../APTypes';
import { APValues } from '../APValues';
import { ApproachGuidanceMode } from '../VerticalNavigation';
import { VNavVars } from '../vnav/VNavEvents';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Radio navigation data received by a {@link APGSDirector}.
 */
export type APGSDirectorNavData = {
  /** The CDI source of the data. An index of `0` indicates no data is received. */
  navSource: Readonly<NavSourceId>;

  /** The frequency on which the data is received, in megahertz, or `0` if no data is received. */
  frequency: number;

  /** The signal strength. */
  signal: number;

  /** Whether a glideslope signal is being received. */
  hasGs: boolean;

  /**
   * The angle of the received glideslope signal, in degrees. Positive values indicate a descending path. If a
   * glideslope signal is not being received, then this value is `null`.
   */
  gsAngle: number | null;

  /**
   * The glideslope angle error, in degrees, defined as the difference between the angle from the glideslope antenna to
   * the airplane and the glideslope angle. Positive values indicate deviation of the airplane above the glideslope. If
   * a glideslope signal is not being received, then this value is `null`.
   */
  gsAngleError: number | null;
};

/**
 * Radio navigation data received by a {@link APGSDirector} at the moment of activation.
 */
export type APGSDirectorActivateNavData = {
  /** The CDI source of the data. */
  navSource: Readonly<NavSourceId>;

  /** The frequency on which the data was received, in megahertz. */
  frequency: number;
};

/**
 * A function which calculates a desired angle closure rate, in degrees per second, to track a glideslope. The angle
 * closure rate is the rate of reduction of glideslope angle error. Positive values reduce glideslope angle error while
 * negative values increase glideslope angle error.
 * @param gsAngleError The glideslope angle error, in degrees, defined as the difference between the angle from the
 * glideslope antenna to the airplane and the glideslope angle. Positive values indicate deviation of the airplane
 * above the glideslope.
 * @param gsAngle The glideslope angle, in degrees.
 * @param currentAngleRate The current rate of change of glideslope angle error, in degrees per second.
 * @param distance The lateral distance from the airplane to the glideslope antenna, in meters.
 * @param height The height of the airplane above the glideslope antenna, in meters.
 * @param groundSpeed The airplane's current ground speed, in meters per second.
 * @param vs The airplane's current vertical speed, in meters per second.
 * @returns The desired angle closure rate, in degrees per second, toward the glideslope.
 */
export type APGSDirectorAngleClosureRateFunc = (
  gsAngleError: number,
  gsAngle: number,
  currentAngleRate: number,
  distance: number,
  height: number,
  groundSpeed: number,
  vs: number
) => number;

/**
 * A function which calculates a desired vertical speed to target, in feet per minute, to track a glideslope.
 * @param gsAngleError The glideslope angle error, in degrees, defined as the difference between the angle from the
 * glideslope antenna to the airplane and the glideslope angle. Positive values indicate deviation of the airplane
 * above the glideslope.
 * @param gsAngle The glideslope angle, in degrees.
 * @param currentAngleRate The current rate of change of glideslope angle error, in degrees per second.
 * @param distance The lateral distance from the airplane to the glideslope antenna, in meters.
 * @param height The height of the airplane above the glideslope antenna, in meters.
 * @param groundSpeed The airplane's current ground speed, in meters per second.
 * @param vs The airplane's current vertical speed, in meters per second.
 * @returns The desired vertical speed to target, in feet per minute.
 */
export type APGSDirectorVsTargetFunc = (
  gsAngleError: number,
  gsAngle: number,
  currentAngleRate: number,
  distance: number,
  height: number,
  groundSpeed: number,
  vs: number
) => number;

/**
 * Options for {@link APGSDirector}.
 */
export type APGSDirectorOptions = {
  /**
   * The maximum absolute pitch up angle, in degrees, supported by the director, or a function which returns it. A
   * value of `null` will cause the director will use the maximum pitch up angle defined by its parent autopilot (via
   * `apValues`). Defaults to `3`.
   */
  maxPitchUpAngle?: number | null | (() => number | null);

  /**
   * The maximum absolute pitch down angle, in degrees, supported by the director, or a function which returns it. A
   * value of `null` will cause the director will use the maximum pitch up angle defined by its parent autopilot (via
   * `apValues`). Defaults to `8`.
   */
  maxPitchDownAngle?: number | null | (() => number | null);

  /**
   * The index of the nav radio to force the director to use. If not defined, the director will use the nav radio
   * specified by the active autopilot navigation source.
   */
  forceNavSource?: NavRadioIndex;

  /**
   * A function that checks whether the director can be armed. If not defined, then default logic will be used.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @param navData The current radio navigation data received by the director.
   * @returns Whether the director can be armed.
   */
  canArm?: (apValues: APValues, navData: Readonly<APGSDirectorNavData>) => boolean;

  /**
   * A function that checks whether the director can be activated from an armed state. If not defined, then default
   * logic will be used.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @param navData The current radio navigation data received by the director.
   * @returns Whether the director can be activated from an armed state.
   */
  canActivate?: (apValues: APValues, navData: Readonly<APGSDirectorNavData>) => boolean;

  /**
   * A function that checks whether the director can remain in the active state. If not defined, then default logic
   * will be used.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @param navData The current radio navigation data received by the director.
   * @param activateNavData The radio navigation data received by the director at the moment of activation.
   * @returns Whether the director can remain in the active state.
   */
  canRemainActive?: (apValues: APValues, navData: Readonly<APGSDirectorNavData>, activateNavData: Readonly<APGSDirectorActivateNavData>) => boolean;

  /**
   * A function which returns the desired angle closure rate to track a glideslope. The angle closure rate is the rate
   * of reduction of glideslope angle error. If not defined, the director will use a default angle closure rate curve.
   * The output of this function will be overridden by the `vsTarget` function if the latter is defined.
   */
  angleClosureRate?: APGSDirectorAngleClosureRateFunc;

  /**
   * A function which returns the desired vertical speed target to track a glideslope. If defined, the output of this
   * function will override that of the `angleClosureRate` function.
   */
  vsTarget?: APGSDirectorVsTargetFunc;

  /** The minimum vertical speed the director can target, in feet per minute. Defaults to `-3000`. */
  minVs?: number;

  /** The maximum vertical speed the director can target, in feet per minute. Defaults to `0`. */
  maxVs?: number;
};

/**
 * An autopilot director that generates flight director pitch commands to track a glideslope signal from a radio
 * navigation aid.
 *
 * The director requires valid pitch data to arm or activate.
 *
 * Requires that the navigation radio topics defined in {@link NavComEvents} be published to the event bus in order to
 * function properly.
 */
export class APGSDirector implements PlaneDirector {
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

  private navSource: Readonly<NavSourceId> = {
    index: 0,
    type: NavSourceType.Nav,
  };

  private readonly navFrequency = ConsumerValue.create(null, 0);
  private readonly navSignal = ConsumerValue.create(null, 0);
  private readonly navHasGs = ConsumerValue.create(null, false);
  private readonly navGsAngle = ConsumerValue.create(null, 0);
  private readonly navGsError = ConsumerValue.create<number | null>(null, null);
  private readonly navLla = ConsumerValue.create<LatLongAlt | null>(null, null);

  private readonly forceNavSource: NavRadioIndex | undefined;

  private readonly navData = {
    navSource: { index: 0, type: NavSourceType.Nav } as NavSourceId,
    frequency: 0,
    signal: 0,
    hasGs: false as boolean,
    gsAngle: null as number | null,
    gsAngleError: null as number | null
  } satisfies APGSDirectorNavData;

  private readonly activateNavData = {
    navSource: { index: 0, type: NavSourceType.Nav } as NavSourceId,
    frequency: 0
  } satisfies APGSDirectorActivateNavData;

  private readonly canArm: (apValues: APValues, navData: Readonly<APGSDirectorNavData>) => boolean;
  private readonly canActivate: (apValues: APValues, navData: Readonly<APGSDirectorNavData>) => boolean;
  private readonly canRemainActive: (apValues: APValues, navData: Readonly<APGSDirectorNavData>, activateNavData: Readonly<APGSDirectorActivateNavData>) => boolean;

  private readonly angleClosureRateFunc: APGSDirectorAngleClosureRateFunc;
  private readonly vsTargetFunc?: APGSDirectorVsTargetFunc;

  private readonly minVs: number;
  private readonly maxVs: number;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly planeLat = this.apValues.dataProvider.getItem('lat');
  private readonly planeLon = this.apValues.dataProvider.getItem('lon');
  private readonly groundSpeed = this.apValues.dataProvider.getItem('ground_speed');
  private readonly verticalSpeed = this.apValues.dataProvider.getItem('position_vertical_speed');
  private readonly tas = this.apValues.dataProvider.getItem('tas');

  /**
   * Creates a new instance of APGSDirector.
   * @param bus The event bus to use with this instance.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options with which to configure the director.
   */
  public constructor(private readonly bus: EventBus, private readonly apValues: APValues, options?: Readonly<APGSDirectorOptions>) {
    let maxPitchUpOpt = options?.maxPitchUpAngle;
    if (maxPitchUpOpt === undefined) {
      maxPitchUpOpt = 3;
    }
    this.maxPitchUpAngleFunc = this.createMaxPitchAngleFunc(maxPitchUpOpt);

    let maxPitchDownOpt = options?.maxPitchDownAngle;
    if (maxPitchDownOpt === undefined) {
      maxPitchDownOpt = 8;
    }
    this.maxPitchDownAngleFunc = this.createMaxPitchAngleFunc(maxPitchDownOpt);

    this.forceNavSource = options?.forceNavSource;

    this.canArm = options?.canArm ?? APGSDirector.defaultCanArm;
    this.canActivate = options?.canActivate ?? APGSDirector.defaultCanActivate;
    this.canRemainActive = options?.canRemainActive ?? APGSDirector.defaultCanRemainActive;

    this.angleClosureRateFunc = options?.angleClosureRate ?? APGSDirector.defaultAngleClosureRate;
    this.vsTargetFunc = options?.vsTarget;

    const vsUnit = this.vsTargetFunc ? UnitType.FPM : UnitType.MPS;
    this.minVs = UnitType.FPM.convertTo(options?.minVs ?? -3000, vsUnit);
    this.maxVs = UnitType.FPM.convertTo(options?.maxVs ?? 0, vsUnit);

    this.state = DirectorState.Inactive;

    this.initCdiSourceSubs();
  }

  /**
   * Creates a function that returns the maximum pitch angle limit defined by an option.
   * @param option The option that defines the maximum pitch angle limit.
   * @returns A function that returns the maximum pitch angle limit defined by the specified option.
   */
  private createMaxPitchAngleFunc(option: number | null | (() => number | null) | undefined): () => number | undefined {
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
   * Initializes this director's subscription to the autopilot's CDI source. If this director is forced to use a
   * specific CDI source, then the autopilot's CDI source will be ignored.
   */
  protected initCdiSourceSubs(): void {
    if (this.forceNavSource !== undefined) {
      this.onCdiSourceChanged({
        index: this.forceNavSource,
        type: NavSourceType.Nav,
      });
    } else {
      this.apValues.cdiSource.sub(this.onCdiSourceChanged.bind(this), true);
    }
  }

  /**
   * Responds to when the CDI source used by this director changes.
   * @param source The new CDI source to use.
   */
  private onCdiSourceChanged(source: Readonly<NavSourceId>): void {
    Object.assign(this.navSource, source);

    if (source.type === NavSourceType.Nav && source.index >= 1 && source.index <= 4) {
      const index = source.index as NavRadioIndex;

      const sub = this.bus.getSubscriber<NavComEvents>();

      this.navFrequency.setConsumerWithDefault(sub.on(`nav_active_frequency_${index}`), 0);
      this.navSignal.setConsumerWithDefault(sub.on(`nav_signal_${index}`), 0);
      this.navHasGs.setConsumerWithDefault(sub.on(`nav_glideslope_${index}`), false);
      this.navGsAngle.setConsumerWithDefault(sub.on(`nav_raw_gs_${index}`), 0);
      this.navGsError.setConsumerWithDefault(sub.on(`nav_gs_error_${index}`), 0);
      this.navLla.setConsumerWithDefault(sub.on(`nav_lla_${index}`), null);
    } else {
      this.navFrequency.reset(0);
      this.navSignal.reset(0);
      this.navHasGs.reset(false);
      this.navGsAngle.reset(0);
      this.navGsError.reset(null);
      this.navLla.reset(null);
    }
  }

  /**
   * Checks whether the data required for this director to function are valid.
   * @returns Whether the data required for this director to function are valid.
   */
  private isDataValid(): boolean {
    return this.pitch.isValueValid();
  }

  /**
   * Updates this director's radio navigation data.
   */
  private updateNavData(): void {
    Object.assign(this.navData.navSource, this.navSource);
    this.navData.frequency = this.navFrequency.get();
    this.navData.signal = this.navSignal.get();
    this.navData.hasGs = this.navHasGs.get();
    this.navData.gsAngle = this.navData.hasGs ? this.navGsAngle.get() : null;
    this.navData.gsAngleError = this.navData.signal > 0 && this.navData.hasGs ? this.navGsError.get() : null;
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

    SimVar.SetSimVarValue(VNavVars.GPApproachMode, SimVarValueType.Number, ApproachGuidanceMode.GSActive);
    SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ACTIVE', 'Bool', true);
    SimVar.SetSimVarValue('AUTOPILOT APPROACH ACTIVE', 'Bool', true);
    SimVar.SetSimVarValue('AUTOPILOT GLIDESLOPE ARM', 'Bool', false);

    Object.assign(this.activateNavData.navSource, this.navSource);
    this.activateNavData.frequency = this.navFrequency.get();
  }

  /** @inheritDoc */
  public arm(): void {
    if (this.state !== DirectorState.Inactive || !this.isDataValid()) {
      return;
    }

    this.updateNavData();
    if (this.canArm(this.apValues, this.navData)) {
      this.state = DirectorState.Armed;

      if (this.onArm !== undefined) {
        this.onArm();
      }

      SimVar.SetSimVarValue(VNavVars.GPApproachMode, SimVarValueType.Number, ApproachGuidanceMode.GSArmed);
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

    if (this.state === DirectorState.Armed) {
      this.updateNavData();
      if (this.canActivate(this.apValues, this.navData)) {
        this.activate();
      }
      if (!this.canArm(this.apValues, this.navData)) {
        this.deactivate();
      }
    }
    if (this.state === DirectorState.Active) {
      this.updateNavData();
      if (!this.canRemainActive(this.apValues, this.navData, this.activateNavData)) {
        this.deactivate();
      }
      this.trackGlideslope();
    }
  }

  /**
   * Tracks the Glideslope.
   */
  private trackGlideslope(): void {
    const gsError = this.navHasGs.get() && this.navSignal.get() > 0 ? this.navGsError.get() : null;
    const navLla = this.navLla.get();
    if (gsError !== null && navLla !== null) {
      const gsAngle = this.navGsAngle.get();
      const distanceM = UnitType.GA_RADIAN.convertTo(
        GeoPoint.distance(
          navLla.lat,
          navLla.long,
          this.planeLat.getActualValue(),
          this.planeLon.getActualValue()
        ),
        UnitType.METER
      );

      // We want the height of the plane above the glideslope antenna, which we can calculate from distance,
      // glideslope angle, and glideslope error.
      const heightM = distanceM * Math.tan((gsAngle + gsError) * Avionics.Utils.DEG2RAD);
      const groundSpeedMps = UnitType.KNOT.convertTo(this.groundSpeed.getActualValue(), UnitType.MPS);
      const vsMps = UnitType.FPM.convertTo(this.verticalSpeed.getActualValue(), UnitType.MPS);

      const hypotSq = distanceM * distanceM + heightM * heightM;
      const heightTimesGs = heightM * groundSpeedMps;

      const currentAngleRate = (vsMps * distanceM + heightTimesGs) / hypotSq;

      let targetVs: number;
      let unit: Unit<UnitFamily.Speed>;

      if (this.vsTargetFunc) {
        targetVs = this.vsTargetFunc(gsError, gsAngle, currentAngleRate, distanceM, heightM, groundSpeedMps, vsMps);
        unit = UnitType.FPM;
      } else {
        const desiredClosureRate = this.angleClosureRateFunc(gsError, gsAngle, currentAngleRate, distanceM, heightM, groundSpeedMps, vsMps);
        const desiredAngleRate = Math.sign(gsError) * -1 * desiredClosureRate;

        targetVs = (Avionics.Utils.DEG2RAD * desiredAngleRate * hypotSq - heightTimesGs) / distanceM;
        unit = UnitType.MPS;
      }

      targetVs = MathUtils.clamp(targetVs, this.minVs, this.maxVs);

      const tas = UnitType.KNOT.convertTo(this.tas.getActualValue(), unit);
      const pitchForVerticalSpeed = Math.asin(MathUtils.clamp(targetVs / tas, -1, 1)) * Avionics.Utils.RAD2DEG;

      this.drivePitch && this.drivePitch(-pitchForVerticalSpeed, true, true, undefined, this.maxPitchDownAngleFunc(), this.maxPitchUpAngleFunc());
    }
  }

  /**
   * A default function that checks whether the director can be armed.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @param navData The current radio navigation data received by the director.
   * @returns Whether the director can be armed.
   */
  private static defaultCanArm(apValues: APValues, navData: Readonly<APGSDirectorNavData>): boolean {
    return (apValues.navToNavArmableVerticalMode && apValues.navToNavArmableVerticalMode() === APVerticalModes.GS)
      || navData.hasGs;
  }

  /**
   * A default function that checks whether the director can be activated from an armed state.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @param navData The current radio navigation data received by the director.
   * @returns Whether the director can be activated from an armed state.
   */
  private static defaultCanActivate(apValues: APValues, navData: Readonly<APGSDirectorNavData>): boolean {
    return apValues.lateralActive.get() === APLateralModes.LOC
      && navData.gsAngleError !== null
      && Math.abs(navData.gsAngleError) <= 0.1;
  }

  /**
   * A default function that checks whether the director can remain in the active state.
   * @param apValues Autopilot values from the director's parent autopilot.
   * @param navData The current radio navigation data received by the director.
   * @returns Whether the director can remain in the active state.
   */
  private static defaultCanRemainActive(apValues: APValues, navData: Readonly<APGSDirectorNavData>): boolean {
    return apValues.lateralActive.get() === APLateralModes.LOC && navData.gsAngleError !== null;
  }

  /**
   * A default function which calculates a desired angle closure rate, in degrees per second, to track a glideslope. The angle
   * closure rate is the rate of reduction of glideslope angle error. Positive values reduce glideslope angle error while
   * negative values increase glideslope angle error.
   * @param gsAngleError The glideslope angle error, in degrees, defined as the difference between the angle from the
   * glideslope antenna to the airplane and the glideslope angle. Positive values indicate deviation of the airplane
   * above the glideslope.
   * @returns The desired angle closure rate, in degrees per second, toward the glideslope.
   */
  private static defaultAngleClosureRate(gsAngleError: number): number {
    // We will target 0.1 degrees per second by default at full-scale deviation, decreasing linearly down to 0 at no
    // deviation. This is equivalent to a constant time-to-intercept of 7 seconds at full-scale deviation or less.
    return MathUtils.lerp(Math.abs(gsAngleError), 0, 0.7, 0, 0.1, true, true);
  }
}

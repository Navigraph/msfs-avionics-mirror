import {
  APAltCapDirector, APAltDirector, APBackCourseDirector, APConfig, APFLCDirector, APGPDirector, APGSDirector, APHdgDirector, APLateralModes, APLvlDirector,
  APNavDirector, APRollDirector, APTogaPitchDirector, APTrkDirector, APValues, APVerticalModes, APVNavPathDirector, APVSDirector, ClockEvents, ConsumerSubject,
  EventBus, FacilityLoader, FlightPlanner, LNavDirector, MathUtils, NavMath, PlaneDirector, PluginSystem, SimVarValueType, SmoothingPathCalculator,
  Subscribable, UnitType
} from '@microsoft/msfs-sdk';

import { Epic2AvionicsPlugin, Epic2PluginBinder } from '../Epic2AvionicsPlugin';
import { FlightPlanStore } from '../FlightPlan';
import { Epic2FlightPlans } from '../Fms';
import { Epic2PerformancePlan } from '../Performance';
import { Epic2ApPitchDirector } from './directors/Epic2ApPitchDirector';
import { Epic2ApVorDirector } from './directors/Epic2ApVorDirector';
import { Epic2GaDirector } from './directors/Epic2GaDirector';
import { Epic2OverspeedProtectedDirector } from './directors/Epic2OverspeedProtectedDirector';
import { Epic2NavToNavManager } from './Epic2NavToNavManager';
import { Epic2VariableBankManager } from './Epic2VariableBankManager';
import { Epic2VNavManager } from './Epic2VNavManager';
import { Epic2VnavUtils } from './Epic2VnavUtils';

/**
 * An Epic 2 autopilot configuration.
 */
export class Epic2APConfig implements APConfig {
  public defaultLateralMode = APLateralModes.ROLL;
  public defaultVerticalMode = APVerticalModes.PITCH;
  public defaultMaxNoseUpPitchAngle = 20;
  public defaultMaxNoseDownPitchAngle = 20;
  public defaultMaxBankAngle = 35;
  // we manage this ourselves independently of fpl sync
  public initializeStateManagerOnFirstFlightPlanSync = false;

  private readonly verticalPredictionFunctions = Epic2VnavUtils.getVerticalPredictionFunctions(this.pluginSystem);

  private readonly simRate = ConsumerSubject.create<number>(null, 1);

  /**
   * Instantiates the AP Config for the Autopilot.
   * @param bus is an instance of the Event Bus.
   * @param facLoader The facility loader.
   * @param flightPlanner is an instance of the flight planner.
   * @param flightPlanStore The flight plan store.
   * @param selectedFmsPosIndex The selected FMS pos system.
   * @param verticalPathCalculator The instance of the vertical path calculator to use for the vnav director.
   * @param activePerformancePlan The instance of the active performance plan to use for the vnav director.
   * @param pluginSystem The upper mfd plugin system
   */
  constructor(
    private readonly bus: EventBus,
    private readonly facLoader: FacilityLoader,
    private readonly flightPlanner: FlightPlanner,
    private readonly flightPlanStore: FlightPlanStore,
    private readonly selectedFmsPosIndex: Subscribable<number>,
    private readonly verticalPathCalculator: SmoothingPathCalculator,
    private readonly activePerformancePlan: Epic2PerformancePlan,
    private readonly pluginSystem: PluginSystem<Epic2AvionicsPlugin, Epic2PluginBinder>,
  ) {
    const sub = this.bus.getSubscriber<ClockEvents>();
    this.simRate.setConsumer(sub.on('simRate'));
  }


  /** @inheritdoc */
  public createHeadingDirector(apValues: APValues): APHdgDirector {
    return new APHdgDirector(this.bus, apValues, { turnReversalThreshold: 360 });
  }

  /** @inheritdoc */
  public createTrackDirector(apValues: APValues): APTrkDirector {
    return new APTrkDirector(this.bus, apValues, { turnReversalThreshold: 360 });
  }

  /** @inheritdoc */
  public createRollDirector(apValues: APValues): APRollDirector {
    return new APRollDirector(apValues);
  }

  /** @inheritdoc */
  public createWingLevelerDirector(apValues: APValues): APLvlDirector {
    return new APLvlDirector(this.bus, apValues);
  }

  /** @inheritdoc */
  public createGpssDirector(apValues: APValues): LNavDirector {
    return new LNavDirector(this.bus, apValues, this.flightPlanner, undefined, {
      lateralInterceptCurve: this.lnavInterceptCurve.bind(this),
      hasVectorAnticipation: true,
      minimumActivationAltitude: 401
    });
  }

  /** @inheritdoc */
  public createVorDirector(apValues: APValues): APNavDirector {
    return new Epic2ApVorDirector(this.bus, apValues, APLateralModes.VOR, { lateralInterceptCurve: this.navInterceptCurve.bind(this) });
  }

  /** @inheritdoc */
  public createLocDirector(apValues: APValues): APNavDirector {
    return new APNavDirector(this.bus, apValues, APLateralModes.LOC, { lateralInterceptCurve: this.navInterceptCurve.bind(this) });
  }

  /** @inheritdoc */
  public createBcDirector(apValues: APValues): APBackCourseDirector {
    return new APBackCourseDirector(this.bus, apValues, {
      lateralInterceptCurve: (distanceToSource: number, deflection: number, xtk: number, tas: number) => this.localizerInterceptCurve(deflection, xtk, tas)
    });
  }

  /** @inheritdoc */
  public createPitchDirector(apValues: APValues): PlaneDirector {
    const pitDirector = new Epic2ApPitchDirector(this.bus, apValues);
    return new Epic2OverspeedProtectedDirector(this.bus, pitDirector);
  }

  /** @inheritdoc */
  public createVsDirector(apValues: APValues): PlaneDirector {
    const vsDirector = new APVSDirector(apValues);
    return new Epic2OverspeedProtectedDirector(this.bus, vsDirector);
  }

  /** @inheritdoc */
  public createFlcDirector(apValues: APValues): PlaneDirector {
    const flcDirector = new APFLCDirector(apValues, { maxPitchUpAngle: 25, maxPitchDownAngle: 25 });
    return new Epic2OverspeedProtectedDirector(this.bus, flcDirector);
  }

  /** @inheritdoc */
  public createAltHoldDirector(apValues: APValues): APAltDirector {
    return new APAltDirector(apValues);
  }

  /** @inheritdoc */
  public createAltCapDirector(apValues: APValues): APAltCapDirector {
    return new APAltCapDirector(apValues, {
      shouldActivate: this.shouldActivateAltitudeCapture.bind(this),
      captureAltitude: this.captureAltitude.bind(this)
    });
  }

  private vnavManager?: Epic2VNavManager;

  /** @inheritdoc */
  public createVNavManager(apValues: APValues): Epic2VNavManager {
    return this.vnavManager ??= new Epic2VNavManager(
      this.bus,
      this.flightPlanner,
      this.verticalPathCalculator,
      this.activePerformancePlan,
      apValues,
      Epic2FlightPlans.Active,
      this.facLoader,
      this.verticalPredictionFunctions
    );
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public createVNavPathDirector(apValues: APValues): APVNavPathDirector | undefined {
    return new APVNavPathDirector(this.bus);
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public createGpDirector(apValues: APValues): APGPDirector {
    return new APGPDirector(this.bus, apValues);
  }

  /** @inheritdoc */
  public createGsDirector(apValues: APValues): APGSDirector {
    return new APGSDirector(this.bus, apValues);
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public createNavToNavManager(apValues: APValues): Epic2NavToNavManager {
    return new Epic2NavToNavManager(this.bus, apValues, this.flightPlanStore, this.facLoader, this.selectedFmsPosIndex);
  }

  /** @inheritdoc */
  public createVariableBankManager(apValues: APValues): Epic2VariableBankManager {
    return new Epic2VariableBankManager(this.bus, apValues);
  }

  /** @inheritdoc */
  public createToVerticalDirector(): APTogaPitchDirector {
    return new Epic2GaDirector(this.bus);
  }

  /** @inheritdoc */
  public createGaVerticalDirector(): APTogaPitchDirector {
    return new Epic2GaDirector(this.bus);
  }

  /**
   * Calculates intercept angles for radio nav.
   * @param distanceToSource The distance from the plane to the source of the navigation signal, in nautical miles.
   * @param deflection The lateral deflection of the desired track relative to the plane, normalized from `-1` to `1`.
   * Positive values indicate that the desired track is to the right of the plane.
   * @param xtk The cross-track error of the plane from the desired track, in nautical miles. Positive values indicate
   * indicate that the plane is to the right of the track.
   * @param tas The true airspeed of the plane, in knots.
   * @param isLoc Whether the source of the navigation signal is a localizer. Defaults to `false`.
   * @returns The intercept angle, in degrees, to capture the desired track from the navigation signal.
   */
  private navInterceptCurve(distanceToSource: number, deflection: number, xtk: number, tas: number, isLoc?: boolean): number {
    if (isLoc) {
      return this.localizerInterceptCurve(deflection, xtk, tas);
    } else {
      return this.defaultInterceptCurve(xtk, tas);
    }
  }

  /**
   * Calculates intercept angles for LNAV.
   * @param dtk The desired track, in degrees true.
   * @param xtk The cross-track error, in nautical miles. Negative values indicate that the plane is to the left of the
   * desired track.
   * @param tas The true airspeed of the plane, in knots.
   * @returns The intercept angle, in degrees, to capture the desired track from the navigation signal.
   */
  private lnavInterceptCurve(dtk: number, xtk: number, tas: number): number {
    return this.defaultInterceptCurve(xtk, tas);
  }

  /**
   * Calculates intercept angles for localizers.
   * @param deflection The lateral deflection of the desired track relative to the plane, normalized from `-1` to `1`.
   * Negative values indicate that the desired track is to the left of the plane.
   * @param xtk The cross-track error of the plane from the desired track, in nautical miles. Positive values indicate
   * indicate that the plane is to the right of the track.
   * @param tas The true airspeed of the plane, in knots.
   * @returns The intercept angle, in degrees, to capture the localizer course.
   */
  private localizerInterceptCurve(deflection: number, xtk: number, tas: number): number {
    const xtkMeters = UnitType.NMILE.convertTo(xtk, UnitType.METER);
    const xtkMetersAbs = Math.abs(xtkMeters);

    if (Math.abs(deflection) < .02 || xtkMetersAbs < 4) {
      return 0;
    } else if (xtkMetersAbs < 200) {
      return NavMath.clamp(Math.abs(xtk * 75), 1, 5);
    }

    const turnRadiusMeters = NavMath.turnRadius(tas, 22.5);
    const interceptAngle = this.calculateTurnBasedInterceptAngle(turnRadiusMeters, xtkMeters);

    return NavMath.clamp(interceptAngle, 0, 20);
  }

  /**
   * Calculates non-localizer intercept angles.
   * @param xtk The cross-track error, in nautical miles. Negative values indicate that the plane is to the left of the
   * desired track.
   * @param tas The true airspeed of the plane, in knots.
   * @returns The intercept angle, in degrees, to capture the desired track.
   */
  private defaultInterceptCurve(xtk: number, tas: number): number {
    const xtkMeters = UnitType.NMILE.convertTo(xtk, UnitType.METER);
    const xtkMetersAbs = Math.abs(xtkMeters);

    if (xtkMetersAbs < 250) {
      return NavMath.clamp(Math.abs(xtk * 75), 0, 5);
    }

    const turnRadiusMeters = NavMath.turnRadius(tas, 22.5);
    const interceptAngle = this.calculateTurnBasedInterceptAngle(turnRadiusMeters, xtkMeters);

    return NavMath.clamp(interceptAngle, 0, 45);
  }

  /**
   * Calculates an intercept angle to a track such that the intercept course, projected forward from the plane's
   * position, intercepts the desired track at the same point as a constant-radius turn overlapping the plane's
   * position configured to be tangent to the desired track. This has the effect of producing an intercept angle which
   * guarantees a no-overshoot intercept for all initial ground tracks for which a no-overshoot intercept is possible
   * given the specified turn radius and cross-track error.
   *
   * If the magnitude of the cross-track error is greater than twice the turn radius, no constant-radius turn
   * overlapping the plane's position will be tangent to the desired track; in this case the maximum possible intercept
   * angle of 90 degrees is returned.
   * @param turnRadius The turn radius, in the same units as `xtk`.
   * @param xtk The cross-track error, in the same units as `turnRadius`.
   * @returns The calculated intercept angle, in degrees.
   */
  private calculateTurnBasedInterceptAngle(turnRadius: number, xtk: number): number {
    // The following formula is derived by solving for the intercept angle in Euclidean rather than spherical space.
    // The error from this simplification is negligible when turn radius and cross-track are small (less than 1% of
    // earth radius, or ~63km).
    // The Euclidean solution is chosen over the spherical one: asin(sin(xtk) / sqrt(1 - (1 - sin(xtk) * tan(radius))^2))
    // for performance reasons.
    return Math.asin(Math.min(Math.sqrt(Math.abs(xtk) / (2 * turnRadius)), 1)) * Avionics.Utils.RAD2DEG;
  }

  private static dVsNominal = 100; // Rate, at which altitudes shall be captured [ft/min/s], 200 translates to 0.104g, 100 to 0.052g
  private lastDesiredVs = 0;
  private previousTimestamp = 0;  // [msec] Timestamp when the capturing will end
  private previousVelY = 0;

  /**
   * A function which returns true if the capturing shall be activated
   * @param currentVs Current vertical speed in [ft/min]
   * @param targetAltitude Target altitude [ft]
   * @param currentAltitude Current altitude [ft]
   * @returns True if the capturing shall be activated
   */
  private shouldActivateAltitudeCapture(currentVs: number, targetAltitude: number, currentAltitude: number): boolean {
    // Determine the altitude capture range, i.e. the altitude deviation from target altitude at which the
    // capturing shall begin to achieve a steady capturing with an average nominal vs-rate of dVsNominal.
    const altCapturingRange = Math.min(((currentVs / 60) ** 2) / (2 * (Epic2APConfig.dVsNominal / 60)) + (Math.abs(currentVs) / 20), 1100);
    const deviationFromTarget = Math.abs(targetAltitude - currentAltitude);
    if (deviationFromTarget <= altCapturingRange) {
      this.lastDesiredVs = currentVs;
      this.previousTimestamp = Date.now();
      this.previousVelY = SimVar.GetSimVarValue('VELOCITY WORLD Y', 'feet per second');
      return true;
    } else {
      return false;
    }
  }

  /**
   * Method to use for capturing a target altitude.
   * @param targetAltitude is the captured targed altitude
   * @param indicatedAltitude is the current indicated altitude
   * @param initialFpa is the FPA when capture was initiatiated
   * @param tas The current true airspeed of the airplane, in knots.
   * @returns The target pitch value to set.
   */
  private captureAltitude(
    targetAltitude: number,
    indicatedAltitude: number,
    initialFpa: number,
    tas: number
  ): number {
    const newTimestamp = Date.now();
    const cycleDuration = (newTimestamp - this.previousTimestamp) / 1000.0;
    this.previousTimestamp = newTimestamp;

    const currentVs = SimVar.GetSimVarValue('VERTICAL SPEED', SimVarValueType.FPM);
    const deltaAltitude = targetAltitude - indicatedAltitude;

    // If active pause is switched on we want to pause the capturing logic as well. The only simvar
    // that reliably freezes in active pause is world velocity Y:
    const newVelY = SimVar.GetSimVarValue('VELOCITY WORLD Y', 'feet per second');
    if (newVelY !== this.previousVelY) {
      // For the actual capturing, we freshly calculate dVsAdaptive in each cycle. For any given delta altitude and vs,
      // dVsAdaptive is the steady decceleration, that would bring us exactly to the target altitude:
      const dVsAdaptive = 60 * ((currentVs / 60) ** 2) / (2 * Math.abs(deltaAltitude));  // [ft/min/s] !

      // We want desiredVs to only converge towards zero, therefore we apply the sign of lastDesiredVs:
      const thisCycleVsReduction = dVsAdaptive * cycleDuration * this.simRate.get() * Math.sign(this.lastDesiredVs);
      if (Math.abs(this.lastDesiredVs) > Math.abs(thisCycleVsReduction)) {
        // Apply the the reduction for this cycle as long as it is smaller than desiredVs:
        this.lastDesiredVs -= thisCycleVsReduction;
      } else {
        // Otherwise set desiredVs like the alt director does:
        this.lastDesiredVs = MathUtils.clamp(10 * deltaAltitude, -500, 500);
      }
    } else {
      this.lastDesiredVs = currentVs;
    }
    this.previousVelY = newVelY;

    return Math.asin(this.lastDesiredVs / UnitType.KNOT.convertTo(tas, UnitType.FPM)) * Avionics.Utils.RAD2DEG;
  }

}

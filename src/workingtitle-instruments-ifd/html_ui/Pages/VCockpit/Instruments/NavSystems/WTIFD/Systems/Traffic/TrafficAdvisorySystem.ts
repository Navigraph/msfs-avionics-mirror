import {
  AdsbOperatingMode, EventBus, LNavUtils, MappedSubject, MathUtils, NumberUnitInterface, Subject, Tcas, TcasAdvisoryParameters, TcasAlertLevel,
  TcasOperatingMode, TcasSensitivity, TcasSensitivityParameters, TcasTcaParameters, TrafficContact, TrafficInstrument, UnitFamily, UnitType
} from '@microsoft/msfs-sdk';

import { IfdOptions } from '../../IfdOptions';
import { IfdCdiScaleLabel, LNavDataEvents } from '../../Navigation/LNavDataEvents';
import { TrafficOperatingModeSetting, TrafficUserSettings } from '../../Settings/TrafficUserSettings';
import { AdsbSensitivityParameters } from './AdsbSensitivityParameters';
import { IfdAdsb } from './IfdAdsb';
import { IfdTcasIntruder } from './IfdTcasIntruder';
import { TrafficSystem } from './TrafficSystem';
import { TrafficSystemType } from './TrafficSystemType';

/**
 * IFD Traffic Advisory System (TAS).
 */
export class TrafficAdvisorySystem extends Tcas<IfdTcasIntruder, TasSensitivity> implements TrafficSystem {
  public static readonly DEFAULT_MAX_INTRUDER_COUNT = 30;
  public static readonly DEFAULT_REAL_TIME_UPDATE_FREQ = 2; // hz
  public static readonly DEFAULT_SIM_TIME_UPDATE_FREQ = 1; // hz

  private static readonly TA_ON_HYSTERESIS = 2000; // ms
  private static readonly TA_OFF_HYSTERESIS = 8000; // ms

  public readonly type = TrafficSystemType.Tas;

  private readonly _isPowered = Subject.create(true);
  private readonly operatingModeSetting = TrafficUserSettings.getManager(this.bus).getSetting('trafficOperatingMode');
  private readonly operatingModeState = MappedSubject.create(this._isPowered, this.operatingModeSetting);

  private cdiScalingLabel = IfdCdiScaleLabel.Enroute;

  /**
   * Constructor.
   * @param bus The event bus.
   * @param tfcInstrument The traffic instrument which provides traffic contacts for this TAS.
   * @param adsb The ADS-B system associated with this TAS, or `null` if this TAS does not support ADS-B.
   * @param supportsRadarAltitude Whether this TAS supports radar altitude.
   * @param ifdOptions The IFD instrument config.
   * @param maxIntruderCount The maximum number of intruders tracked at any one time by this TAS. Defaults to
   * {@link TrafficAdvisorySystem.DEFAULT_MAX_INTRUDER_COUNT}.
   * @param realTimeUpdateFreq The maximum update frequency (Hz) in real time. Defaults to
   * {@link TrafficAdvisorySystem.DEFAULT_REAL_TIME_UPDATE_FREQ}.
   * @param simTimeUpdateFreq The maximum update frequency (Hz) in sim time. Defaults to
   * {@link TrafficAdvisorySystem.DEFAULT_SIM_TIME_UPDATE_FREQ}.
   */
  constructor(
    bus: EventBus,
    tfcInstrument: TrafficInstrument,
    public readonly adsb: IfdAdsb | null,
    private readonly supportsRadarAltitude: boolean,
    private readonly ifdOptions: IfdOptions,
    maxIntruderCount = TrafficAdvisorySystem.DEFAULT_MAX_INTRUDER_COUNT,
    realTimeUpdateFreq = TrafficAdvisorySystem.DEFAULT_REAL_TIME_UPDATE_FREQ,
    simTimeUpdateFreq = TrafficAdvisorySystem.DEFAULT_SIM_TIME_UPDATE_FREQ
  ) {
    super(bus, tfcInstrument, {
      maxIntruderCount,
      realTimeUpdateFreq,
      simTimeUpdateFreq,
      hasActiveSurveillance: true,
    });
  }

  /** @inheritdoc */
  protected createSensitivity(): TasSensitivity {
    return new TasSensitivity();
  }

  /** @inheritdoc */
  public init(): void {
    super.init();

    this.bus.getSubscriber<LNavDataEvents>().on(`lnavdata_cdi_scale_label${LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex)}`).whenChanged().handle(label => { this.cdiScalingLabel = label; });

    this.operatingModeState.sub(([isPowered, operatingModeSetting]) => {
      if (!isPowered) {
        this.operatingModeSub.set(TcasOperatingMode.Off);
      } else {
        switch (operatingModeSetting) {
          case TrafficOperatingModeSetting.Operating:
          case TrafficOperatingModeSetting.Auto:
          case TrafficOperatingModeSetting.TAOnly:
            this.operatingModeSub.set(TcasOperatingMode.TAOnly);
            break;
          default:
            this.operatingModeSub.set(TcasOperatingMode.Standby);
        }
      }
    }, true);

    this.adsb?.init();
  }

  /** @inheritdoc */
  public isPowered(): boolean {
    return this._isPowered.get();
  }

  /** @inheritdoc */
  public setPowered(isPowered: boolean): void {
    this._isPowered.set(isPowered);
  }

  /** @inheritdoc */
  protected createIntruderEntry(contact: TrafficContact): IfdTcasIntruder {
    return new IfdTcasIntruder(contact, this.simTime);
  }

  /** @inheritdoc */
  protected updateSensitivity(): void {
    if (this.adsb) {
      this.sensitivity.update(
        this.adsb.getOperatingMode(),
        this.ownAirplaneDataProvider.pressureAltitude.get(),
        this.ownAirplaneDataProvider.groundSpeed.get(),
        this.cdiScalingLabel,
        this.supportsRadarAltitude ? this.ownAirplaneDataProvider.radarAltitude.get() : undefined
      );
    } else {
      this.sensitivity.update(
        this.ownAirplaneDataProvider.groundSpeed.get(),
        this.supportsRadarAltitude ? this.ownAirplaneDataProvider.radarAltitude.get() : undefined
      );
    }
  }

  /** @inheritdoc */
  protected canIssueTrafficAdvisory(simTime: number, intruder: IfdTcasIntruder): boolean {
    if (this.ownAirplaneDataProvider.isOnGround.get()) {
      return false;
    }

    if (intruder.alertLevel.get() !== TcasAlertLevel.TrafficAdvisory) {
      const dt = simTime - intruder.taOffTime;
      return dt < 0 || dt >= TrafficAdvisorySystem.TA_ON_HYSTERESIS;
    }

    return true;
  }

  /** @inheritdoc */
  protected canCancelTrafficAdvisory(simTime: number, intruder: IfdTcasIntruder): boolean {
    if (this.ownAirplaneDataProvider.isOnGround.get()) {
      return true;
    }

    const dt = simTime - intruder.taOnTime;
    return dt < 0 || dt >= TrafficAdvisorySystem.TA_OFF_HYSTERESIS;
  }
}

/**
 * Garmin TAS sensitivity settings.
 */
export class TasSensitivityParameters {
  private static readonly PA = {
    protectedRadius: UnitType.NMILE.createNumber(6),
    protectedHeight: UnitType.FOOT.createNumber(1200)
  };

  private static readonly TA_LEVELS = [
    {
      tau: UnitType.SECOND.createNumber(20),
      protectedRadius: UnitType.NMILE.createNumber(0.2),
      protectedHeight: UnitType.FOOT.createNumber(600)
    },
    {
      tau: UnitType.SECOND.createNumber(30),
      protectedRadius: UnitType.NMILE.createNumber(0.55),
      protectedHeight: UnitType.FOOT.createNumber(800)
    }
  ];

  /**
   * Selects a sensitivity level for a specified environment.
   * @param groundSpeed The ground speed of the own airplane, or `NaN` if the ground speed is not known.
   * @param radarAltitude The radar altitude of the own airplane, or `NaN` if the radar altitude is not known. Defaults
   * to `NaN`.
   * @returns The sensitivity level for the specified environment.
   */
  public selectLevel(
    groundSpeed: NumberUnitInterface<UnitFamily.Speed>,
    radarAltitude?: NumberUnitInterface<UnitFamily.Distance>
  ): number {
    const radarAltFeet = !radarAltitude || radarAltitude.isNaN() ? undefined : radarAltitude.asUnit(UnitType.FOOT);
    const groundSpeedKnots = groundSpeed.isNaN() ? undefined : groundSpeed.asUnit(UnitType.KNOT);

    if (
      (radarAltFeet !== undefined && radarAltFeet < 2000)
      || (groundSpeedKnots !== undefined && groundSpeedKnots < 120)
    ) {
      return 0;
    } else {
      return 1;
    }
  }

  /**
   * Selects Proximity Advisory sensitivity settings for a specified environment.
   * @param groundSpeed The ground speed of the own airplane, or `NaN` if the ground speed is not known.
   * @param radarAltitude The radar altitude of the own airplane, or `NaN` if the radar altitude is not known. Defaults
   * to `NaN`.
   * @returns Proximity Advisory sensitivity settings for the specified environment.
   */
  public selectPA(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    groundSpeed: NumberUnitInterface<UnitFamily.Speed>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    radarAltitude?: NumberUnitInterface<UnitFamily.Distance>
  ): TcasAdvisoryParameters {
    return TasSensitivityParameters.PA;
  }

  /**
   * Selects Traffic Advisory sensitivity settings for a specified environment.
   * @param groundSpeed The ground speed of the own airplane, or `NaN` if the ground speed is not known.
   * @param radarAltitude The radar altitude of the own airplane, or `NaN` if the radar altitude is not known. Defaults
   * to `NaN`.
   * @returns Traffic Advisory sensitivity settings for the specified environment.
   */
  public selectTA(
    groundSpeed: NumberUnitInterface<UnitFamily.Speed>,
    radarAltitude?: NumberUnitInterface<UnitFamily.Distance>
  ): TcasTcaParameters {
    return TasSensitivityParameters.TA_LEVELS[this.selectLevel(groundSpeed, radarAltitude)];
  }

  /**
   * Gets Proximity Advisory sensitivity parameters for a given sensitivity level.
   * @param level A sensitivity level.
   * @returns Proximity Advisory sensitivity parameters for the given sensitivity level.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getPA(level: number): TcasAdvisoryParameters {
    return TasSensitivityParameters.PA;
  }

  /**
   * Gets Traffic Advisory sensitivity parameters for a given sensitivity level.
   * @param level A sensitivity level.
   * @returns Traffic Advisory sensitivity parameters for the given sensitivity level.
   */
  public getTA(level: number): TcasTcaParameters {
    return TasSensitivityParameters.TA_LEVELS[MathUtils.clamp(level, 0, TasSensitivityParameters.TA_LEVELS.length - 1)];
  }
}

/**
 * An implementation of {@link TcasSensitivity} which provides sensitivity parameters for the Garmin Traffic Advisory
 * System (TAS). When ADS-B is operating, Traffic Advisory sensitivity is selected based on the ADS-B Conflict
 * Situational Awareness (CSA) algorithm. When ADS-B is not operating, Traffic Advisory sensitivity is selected based
 * on the TAS algorithm.
 */
export class TasSensitivity implements TcasSensitivity {
  private readonly adsbTASensitivity = new AdsbSensitivityParameters();
  private readonly tasSensitivity = new TasSensitivityParameters();

  private readonly tasParams = {
    parametersPA: this.tasSensitivity.getPA(0),

    parametersTA: this.tasSensitivity.getTA(0),

    parametersRA: {
      tau: UnitType.SECOND.createNumber(NaN),
      protectedRadius: UnitType.NMILE.createNumber(NaN),
      protectedHeight: UnitType.FOOT.createNumber(NaN),
      alim: UnitType.FOOT.createNumber(NaN)
    }
  };

  private readonly adsbParams = {
    parametersPA: this.tasSensitivity.getPA(0),

    parametersTA: this.adsbTASensitivity.getTA(0),

    parametersRA: {
      tau: UnitType.SECOND.createNumber(NaN),
      protectedRadius: UnitType.NMILE.createNumber(NaN),
      protectedHeight: UnitType.FOOT.createNumber(NaN),
      alim: UnitType.FOOT.createNumber(NaN)
    }
  };

  private activeParams = this.tasParams;

  /** @inheritdoc */
  public selectParameters(): TcasSensitivityParameters {
    return this.activeParams;
  }

  /** @inheritdoc */
  public selectRAAlim(): NumberUnitInterface<UnitFamily.Distance> {
    return this.tasParams.parametersRA.alim;
  }

  /**
   * Updates the sensitivity without ADS-B support.
   * @param groundSpeed The ground speed of the own airplane, or `NaN` if the ground speed is not known.
   * @param radarAltitude The radar altitude of the own airplane, or `NaN` if the radar altitude is not known. Defaults
   * to `NaN`.
   */
  public update(
    groundSpeed: NumberUnitInterface<UnitFamily.Speed>,
    radarAltitude?: NumberUnitInterface<UnitFamily.Distance>
  ): void;
  /**
   * Updates the sensitivity with ADS-B support.
   * @param adsbMode The ADS-B operating mode.
   * @param altitude The pressure altitude of the own airplane, or `NaN` if the pressure altitude is not known.
   * @param groundSpeed The ground speed of the own airplane, or `NaN` if the ground speed is not known.
   * @param cdiScalingLabel The CDI scaling sensitivity of the own airplane.
   * @param radarAltitude The radar altitude of the own airplane, or `NaN` if the radar altitude is not known. Defaults
   * to `NaN`.
   */
  public update(
    adsbMode: AdsbOperatingMode,
    altitude: NumberUnitInterface<UnitFamily.Distance>,
    groundSpeed: NumberUnitInterface<UnitFamily.Speed>,
    cdiScalingLabel?: IfdCdiScaleLabel,
    radarAltitude?: NumberUnitInterface<UnitFamily.Distance>
  ): void;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public update(
    arg1: AdsbOperatingMode | NumberUnitInterface<UnitFamily.Speed>,
    arg2: NumberUnitInterface<UnitFamily.Distance>,
    arg3?: NumberUnitInterface<UnitFamily.Speed>,
    arg4?: IfdCdiScaleLabel,
    arg5?: NumberUnitInterface<UnitFamily.Distance>
  ): void {
    let groundSpeed: NumberUnitInterface<UnitFamily.Speed>;
    let radarAltitude: NumberUnitInterface<UnitFamily.Distance> | undefined;
    let supportAdsb: boolean;

    if (typeof arg1 === 'object') {
      groundSpeed = arg1;
      radarAltitude = arg2;
      supportAdsb = false;
    } else {
      groundSpeed = arg3 as NumberUnitInterface<UnitFamily.Speed>;
      radarAltitude = arg5;
      supportAdsb = true;
    }

    const tisLevel = this.tasSensitivity.selectLevel(groundSpeed, radarAltitude);
    this.tasParams.parametersPA = this.tasSensitivity.getPA(tisLevel);
    this.tasParams.parametersTA = this.tasSensitivity.getTA(tisLevel);

    if (supportAdsb) {
      const adsbLevel = this.adsbTASensitivity.selectLevel(arg2, arg4, radarAltitude);
      this.adsbParams.parametersPA = this.tasSensitivity.getPA(tisLevel);
      this.adsbParams.parametersTA = this.adsbTASensitivity.getTA(adsbLevel);

      // Right now we just assume every intruder is tracked by ADS-B if ADS-B is operating
      this.activeParams = arg1 === AdsbOperatingMode.Standby ? this.tasParams : this.adsbParams;
    } else {
      this.activeParams = this.tasParams;
    }
  }
}

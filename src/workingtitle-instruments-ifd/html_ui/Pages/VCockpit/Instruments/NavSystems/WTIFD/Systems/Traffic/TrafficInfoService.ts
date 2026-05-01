import {
  AdsbOperatingMode, EventBus, LNavUtils, MappedSubject, MappedSubscribable, MathUtils, NumberUnitInterface, Subject, Subscribable, Tcas,
  TcasAdvisoryParameters, TcasAlertLevel, TcasOperatingMode, TcasSensitivity, TcasSensitivityParameters, TcasTcaParameters, TrafficContact, TrafficInstrument,
  UnitFamily, UnitType, UserSetting, Vec2Math
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
 * Configuration options for {@link TrafficInfoService}.
 */
export type TrafficInfoServiceOptions = {
  /** Whether the TIS supports TIS-A. */
  supportTisA?: boolean;

  /** Whether the TIS supports radar altitude. Defaults to `false`. */
  supportRadarAltitude?: boolean;

  /**
   * The maximum number of intruders tracked at any one time by the TIS when ADS-B is not available. Defaults to
   * {@link TrafficInfoService.DEFAULT_MAX_INTRUDER_COUNT}.
   */
  maxIntruderCount?: number;

  /**
   * The maximum update frequency (Hz) in real time when ADS-B is not available. Defaults to
   * {@link TrafficInfoService.DEFAULT_REAL_TIME_UPDATE_FREQ}.
   */
  realTimeUpdateFreq?: number;

  /**
   * The maximum update frequency (Hz) in sim time when ADS-B is not available. Defaults to
   * {@link TrafficInfoService.DEFAULT_SIM_TIME_UPDATE_FREQ}.
   */
  simTimeUpdateFreq?: number;

  /**
   * The ADS-B system associated with the TIS, or `null` if the TIS does not support ADS-B.
   */
  adsb?: IfdAdsb | null;

  /**
   * The maximum number of intruders tracked at any one time by the TIS when ADS-B is available. Defaults to
   * {@link TrafficInfoService.DEFAULT_ADSB_MAX_INTRUDER_COUNT}.
   */
  adsbMaxIntruderCount?: number;

  /**
   * The maximum update frequency (Hz) in real time when ADS-B is available. Defaults to
   * {@link TrafficInfoService.DEFAULT_ADSB_REAL_TIME_UPDATE_FREQ}.
   */
  adsbRealTimeUpdateFreq?: number;

  /**
   * The maximum update frequency (Hz) in sim time when ADS-B is available. Defaults to
   * {@link TrafficInfoService.DEFAULT_ADSB_SIM_TIME_UPDATE_FREQ}.
   */
  adsbSimTimeUpdateFreq?: number;

  /**
   * Whether the ADS-B traffic alerting algorithm supports using GPS phase of flight information to select sensitivity
   * levels. Ignored if ADS-B is not supported. Defaults to `false`.
   */
  supportGpsFlightPhase?: boolean;
};

/**
 * IFD Traffic Information Service.
 */
export class TrafficInfoService extends Tcas<IfdTcasIntruder, TisSensitivity> implements TrafficSystem {
  public static readonly DEFAULT_MAX_INTRUDER_COUNT = 8;
  public static readonly DEFAULT_REAL_TIME_UPDATE_FREQ = 2; // hz
  public static readonly DEFAULT_SIM_TIME_UPDATE_FREQ = 0.2; // hz

  public static readonly DEFAULT_ADSB_MAX_INTRUDER_COUNT = 30;
  public static readonly DEFAULT_ADSB_REAL_TIME_UPDATE_FREQ = 2; // hz
  public static readonly DEFAULT_ADSB_SIM_TIME_UPDATE_FREQ = 1; // hz

  private static readonly MAX_INTRUDER_ALTITUDE_BELOW = UnitType.FOOT.createNumber(3000);
  private static readonly MAX_INTRUDER_ALTITUDE_ABOVE = UnitType.FOOT.createNumber(3500);
  private static readonly MAX_INTRUDER_DISTANCE = UnitType.NMILE.createNumber(7.5);

  private static readonly TA_ON_HYSTERESIS = 2000; // ms
  private static readonly TA_OFF_HYSTERESIS = 8000; // ms

  /** @inheritdoc */
  public readonly type: TrafficSystemType;

  /** @inheritdoc */
  public readonly adsb: IfdAdsb | null;

  private readonly supportsTisA: boolean;

  private readonly supportsRadarAltitude: boolean;

  private readonly _isPowered: Subject<boolean>;
  private readonly operatingModeSetting: UserSetting<TrafficOperatingModeSetting>;
  private readonly operatingModeState: MappedSubscribable<readonly [boolean, TrafficOperatingModeSetting]>;

  private readonly supportsGpsFlightPhase: boolean;
  private cdiScalingLabel?: IfdCdiScaleLabel;

  /**
   * Creates a new instance of TrafficInfoService.
   * @param bus The event bus.
   * @param tfcInstrument The traffic instrument which provides traffic contacts for the TIS.
   * @param ifdOptions The IFD instrument config.
   * @param options Options with which to configure the TIS.
   */
  public constructor(
    bus: EventBus,
    tfcInstrument: TrafficInstrument,
    private readonly ifdOptions: IfdOptions,
    options?: Readonly<TrafficInfoServiceOptions>
  ) {
    let maxIntruderCount: number | Subscribable<number>;
    let realTimeUpdateFreq: number | Subscribable<number>;
    let simTimeUpdateFreq: number | Subscribable<number>;

    const supportsTisA = options?.supportTisA ?? true;

    const noAdsbMaxIntruderCount = options?.maxIntruderCount ?? TrafficInfoService.DEFAULT_MAX_INTRUDER_COUNT;
    const noAdsbRealTimeUpdateFreq = options?.realTimeUpdateFreq ?? TrafficInfoService.DEFAULT_REAL_TIME_UPDATE_FREQ;
    const noAdsbSimTimeUpdateFreq = options?.simTimeUpdateFreq ?? TrafficInfoService.DEFAULT_SIM_TIME_UPDATE_FREQ;

    if (options?.adsb) {
      const adsbMaxIntruderCount = options?.adsbMaxIntruderCount ?? TrafficInfoService.DEFAULT_ADSB_MAX_INTRUDER_COUNT;
      const adsbRealTimeUpdateFreq = options?.adsbRealTimeUpdateFreq ?? TrafficInfoService.DEFAULT_ADSB_REAL_TIME_UPDATE_FREQ;
      const adsbSimTimeUpdateFreq = options?.adsbSimTimeUpdateFreq ?? TrafficInfoService.DEFAULT_ADSB_SIM_TIME_UPDATE_FREQ;

      maxIntruderCount = Subject.create(noAdsbMaxIntruderCount);
      realTimeUpdateFreq = Subject.create(noAdsbRealTimeUpdateFreq);
      simTimeUpdateFreq = Subject.create(noAdsbSimTimeUpdateFreq);

      options.adsb.getEventSubscriber().on('adsb_operating_mode').handle(mode => {
        if (mode === AdsbOperatingMode.Standby) {
          (maxIntruderCount as Subject<number>).set(noAdsbMaxIntruderCount);
          (realTimeUpdateFreq as Subject<number>).set(noAdsbRealTimeUpdateFreq);
          (simTimeUpdateFreq as Subject<number>).set(noAdsbSimTimeUpdateFreq);
        } else {
          (maxIntruderCount as Subject<number>).set(adsbMaxIntruderCount);
          (realTimeUpdateFreq as Subject<number>).set(adsbRealTimeUpdateFreq);
          (simTimeUpdateFreq as Subject<number>).set(adsbSimTimeUpdateFreq);
        }
      });
    } else {
      maxIntruderCount = noAdsbMaxIntruderCount;
      realTimeUpdateFreq = noAdsbRealTimeUpdateFreq;
      simTimeUpdateFreq = noAdsbSimTimeUpdateFreq;
    }


    super(bus, tfcInstrument, {
      maxIntruderCount,
      realTimeUpdateFreq,
      simTimeUpdateFreq,
      hasActiveSurveillance: supportsTisA,
    });

    this.type = TrafficSystemType.Tis;

    this.supportsTisA = supportsTisA;

    this.adsb = options?.adsb ?? null;
    this.supportsRadarAltitude = options?.supportRadarAltitude ?? false;
    this.supportsGpsFlightPhase = options?.supportGpsFlightPhase ?? false;

    this._isPowered = Subject.create<boolean>(true);

    this.operatingModeSetting = TrafficUserSettings.getManager(this.bus).getSetting('trafficOperatingMode');
    this.operatingModeState = MappedSubject.create(this._isPowered, this.operatingModeSetting);
  }

  /** @inheritdoc */
  protected createSensitivity(): TisSensitivity {
    return new TisSensitivity();
  }

  /** @inheritdoc */
  public init(): void {
    super.init();

    if (this.adsb && this.supportsGpsFlightPhase) {
      this.bus.getSubscriber<LNavDataEvents>().on(`lnavdata_cdi_scale_label${LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex)}`).whenChanged().handle(label => { this.cdiScalingLabel = label; });
    }

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
  protected filterIntruder(intruder: IfdTcasIntruder): boolean {
    if (this.adsb && this.adsb.getOperatingMode() !== AdsbOperatingMode.Standby) {
      return true;
    }

    // If ADS-B is not available, then TIS-A is the only source from which we can track intruders. Therefore, if we
    // don't support TIS-A, then no intruders can be tracked.
    if (!this.supportsTisA) {
      return false;
    }

    // TIS-A only tracks intruders within a certain volume of the own airplane.

    const relativePosVec = intruder.relativePositionVec;

    return TrafficInfoService.MAX_INTRUDER_ALTITUDE_BELOW.compare(-relativePosVec[2], UnitType.METER) >= 0
      && TrafficInfoService.MAX_INTRUDER_ALTITUDE_ABOVE.compare(relativePosVec[2], UnitType.METER) >= 0
      && TrafficInfoService.MAX_INTRUDER_DISTANCE.compare(Vec2Math.abs(relativePosVec), UnitType.METER) >= 0;
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
      return dt < 0 || dt >= TrafficInfoService.TA_ON_HYSTERESIS;
    }

    return true;
  }

  /** @inheritdoc */
  protected canCancelTrafficAdvisory(simTime: number, intruder: IfdTcasIntruder): boolean {
    if (this.ownAirplaneDataProvider.isOnGround.get()) {
      return true;
    }

    const dt = simTime - intruder.taOnTime;
    return dt < 0 || dt >= TrafficInfoService.TA_OFF_HYSTERESIS;
  }
}

/**
 * IFD TIS sensitivity settings.
 */
export class TisSensitivityParameters {
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
    // TODO: I couldn't find any specific details on how TIS determines sensitivity levels, so for now this is
    // identical to the TAS algorithm.

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
    return TisSensitivityParameters.PA;
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
    return TisSensitivityParameters.TA_LEVELS[this.selectLevel(groundSpeed, radarAltitude)];
  }

  /**
   * Gets Proximity Advisory sensitivity parameters for a given sensitivity level.
   * @param level A sensitivity level.
   * @returns Proximity Advisory sensitivity parameters for the given sensitivity level.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getPA(level: number): TcasAdvisoryParameters {
    return TisSensitivityParameters.PA;
  }

  /**
   * Gets Traffic Advisory sensitivity parameters for a given sensitivity level.
   * @param level A sensitivity level.
   * @returns Traffic Advisory sensitivity parameters for the given sensitivity level.
   */
  public getTA(level: number): TcasTcaParameters {
    return TisSensitivityParameters.TA_LEVELS[MathUtils.clamp(level, 0, TisSensitivityParameters.TA_LEVELS.length - 1)];
  }
}

/**
 * An implementation of {@link TcasSensitivity} which provides sensitivity parameters for the Garmin Traffic
 * Information Service.
 */
export class TisSensitivity implements TcasSensitivity {
  private readonly adsbTASensitivity = new AdsbSensitivityParameters();
  private readonly tisSensitivity = new TisSensitivityParameters();

  private readonly tisParams = {
    parametersPA: this.tisSensitivity.getPA(0),

    parametersTA: this.tisSensitivity.getTA(0),

    parametersRA: {
      tau: UnitType.SECOND.createNumber(NaN),
      protectedRadius: UnitType.NMILE.createNumber(NaN),
      protectedHeight: UnitType.FOOT.createNumber(NaN),
      alim: UnitType.FOOT.createNumber(NaN)
    }
  };

  private readonly adsbParams = {
    parametersPA: this.tisSensitivity.getPA(0),

    parametersTA: this.adsbTASensitivity.getTA(0),

    parametersRA: {
      tau: UnitType.SECOND.createNumber(NaN),
      protectedRadius: UnitType.NMILE.createNumber(NaN),
      protectedHeight: UnitType.FOOT.createNumber(NaN),
      alim: UnitType.FOOT.createNumber(NaN)
    }
  };

  private activeParams = this.tisParams;

  /** @inheritdoc */
  public selectParameters(): TcasSensitivityParameters {
    return this.activeParams;
  }

  /** @inheritdoc */
  public selectRAAlim(): NumberUnitInterface<UnitFamily.Distance> {
    return this.tisParams.parametersRA.alim;
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
   * @param altitude The indicated altitude of the own airplane.
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

    const tisLevel = this.tisSensitivity.selectLevel(groundSpeed, radarAltitude);
    this.tisParams.parametersPA = this.tisSensitivity.getPA(tisLevel);
    this.tisParams.parametersTA = this.tisSensitivity.getTA(tisLevel);

    if (supportAdsb) {
      const adsbLevel = this.adsbTASensitivity.selectLevel(arg2, arg4, radarAltitude);
      this.adsbParams.parametersPA = this.tisSensitivity.getPA(tisLevel);
      this.adsbParams.parametersTA = this.adsbTASensitivity.getTA(adsbLevel);

      // Right now we just assume every intruder is tracked by ADS-B if ADS-B is operating
      this.activeParams = arg1 === AdsbOperatingMode.Standby ? this.tisParams : this.adsbParams;
    } else {
      this.activeParams = this.tisParams;
    }
  }
}

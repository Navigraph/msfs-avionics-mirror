import { ClockEvents, ConsumerValue, EventBus, MappedSubject, SimVarValueType, Subject, SubscribableUtils, Subscription } from '@microsoft/msfs-sdk';

import {
  WeightBalanceConfig, WeightBalanceLoadStationType, G3000WeightBalanceSimVars, WeightBalanceUserSettingManager, WeightFuelEvents, WeightFuelUserSettings
} from '@microsoft/msfs-wtg3000-common';

/**
 * A computer for weight and balance calculations.
 */
export class WeightBalanceComputer {
  private readonly weightFuelSettingManager = WeightFuelUserSettings.getManager(this.bus);

  private readonly emptyMoment = this.config.aircraftEmptyWeight * this.config.aircraftEmptyArm;

  private readonly basicEmptyWeightSetting = this.weightFuelSettingManager.getSetting('weightFuelBasicEmpty');
  private readonly crewWeightSetting = this.weightFuelSettingManager.getSetting('weightFuelCrewStores');
  private readonly passengerWeightSetting = this.weightFuelSettingManager.getSetting('weightFuelTotalPassenger');
  private readonly cargoWeightSetting = this.weightFuelSettingManager.getSetting('weightFuelCargo');
  private readonly basicOperatingWeightSetting = this.weightFuelSettingManager.getSetting('weightFuelBasicOperating');
  private readonly zeroFuelWeightSetting = this.weightFuelSettingManager.getSetting('weightFuelZeroFuel');
  private readonly takeoffWeightSetting = this.weightFuelSettingManager.getSetting('weightFuelTakeoff');

  private readonly basicEmptyArmSetting = this.weightBalanceSettingManager.getSetting('weightBalanceBasicEmptyArm');
  private readonly zeroFuelMomentSetting = this.weightBalanceSettingManager.getSetting('weightBalanceZeroFuelMoment');
  private readonly takeoffArmSetting = this.weightBalanceSettingManager.getSetting('weightBalanceTakeoffArm');

  private readonly fobWeight = ConsumerValue.create(null, -1);
  private readonly landingFuelWeight = ConsumerValue.create(null, -1);

  private readonly loadStationSettings = this.weightBalanceSettingManager.loadStationDefs.map(def => {
    return {
      def,
      emptyWeight: this.weightBalanceSettingManager.getSetting(`weightBalanceLoadStationEmptyWeight_${def.id}`),
      emptyArm: this.weightBalanceSettingManager.getSetting(`weightBalanceLoadStationEmptyArm_${def.id}`),
      loadArm: this.weightBalanceSettingManager.getSetting(`weightBalanceLoadStationLoadArm_${def.id}`),
      isEnabled: this.weightBalanceSettingManager.getSetting(`weightBalanceLoadStationEnabled_${def.id}`),
      loadWeight: this.weightBalanceSettingManager.getSetting(`weightBalanceLoadStationLoadWeight_${def.id}`)
    };
  });

  private readonly takeoffArm = MappedSubject.create(
    ([zeroFuelWeight, zeroFuelMoment, takeoffWeight]) => {
      if (takeoffWeight < 0) {
        return Number.MIN_SAFE_INTEGER - 1;
      } else {
        return (zeroFuelMoment + Math.max(takeoffWeight - zeroFuelWeight, 0) * this.config.fuelStationDef.arm) / takeoffWeight;
      }
    },
    this.zeroFuelWeightSetting,
    this.zeroFuelMomentSetting,
    this.takeoffWeightSetting
  ).pause();

  private readonly aircraftArm = Subject.create(NaN, SubscribableUtils.NUMERIC_NAN_EQUALITY);
  private readonly landingArm = Subject.create(NaN, SubscribableUtils.NUMERIC_NAN_EQUALITY);

  private isAlive = true;
  private isInit = false;
  private isResumed = false;

  private updateStaticSub?: Subscription;
  private takeoffArmPipe?: Subscription;
  private updateDynamicSub?: Subscription;

  /**
   * Creates a new instance of WeightBalanceComputer.
   * @param bus The event bus.
   * @param config A weight and balance configuration object.
   * @param weightBalanceSettingManager A manager for weight and balance user settings.
   */
  public constructor(
    private readonly bus: EventBus,
    private readonly config: WeightBalanceConfig,
    private readonly weightBalanceSettingManager: WeightBalanceUserSettingManager
  ) {
  }

  /**
   * Initializes this computer.
   * @param paused Whether to initialize this computer as paused. Defaults to `false`.
   * @throws Error if this computer has been destroyed.
   */
  public init(paused = false): void {
    if (!this.isAlive) {
      throw new Error('WeightBalanceComputer: cannot initialize a dead computer');
    }

    if (this.isInit) {
      return;
    }

    this.isInit = true;

    const sub = this.bus.getSubscriber<ClockEvents & WeightFuelEvents>();

    this.fobWeight.setConsumer(sub.on('weightfuel_fob_weight'));
    this.landingFuelWeight.setConsumer(sub.on('weightfuel_landing_fuel'));

    this.updateStaticSub = sub.on('realTime').atFrequency(1).handle(this.updateStatic.bind(this), true);
    this.updateDynamicSub = sub.on('realTime').handle(this.updateDynamic.bind(this), true);

    this.takeoffArmPipe = this.takeoffArm.pipe(this.takeoffArmSetting, true);

    this.aircraftArm.sub(arm => { SimVar.SetSimVarValue(G3000WeightBalanceSimVars.AircraftCgArm, SimVarValueType.Inches, isNaN(arm) ? Number.MIN_SAFE_INTEGER - 1 : arm); }, true);
    this.landingArm.sub(arm => { SimVar.SetSimVarValue(G3000WeightBalanceSimVars.LandingCgArm, SimVarValueType.Inches, isNaN(arm) ? Number.MIN_SAFE_INTEGER - 1 : arm); }, true);

    if (!paused) {
      this.resume();
    }
  }

  /**
   * Resumes this computer. Once resumed, this computer will perform calculations and updates as necessary until it is
   * paused or destroyed.
   * @throws Error if this computer has been destroyed.
   */
  public resume(): void {
    if (!this.isAlive) {
      throw new Error('WeightBalanceComputer: cannot resume a dead computer');
    }

    if (!this.isInit || this.isResumed) {
      return;
    }

    this.isResumed = true;

    this.takeoffArm.resume();

    this.updateStaticSub!.resume(true);
    this.takeoffArmPipe!.resume(true);
    this.updateDynamicSub!.resume(true);
  }

  /**
   * Pauses this computer. Once paused, this computer will not perform any calculations or updates until it is resumed.
   * @throws Error if this computer has been destroyed.
   */
  public pause(): void {
    if (!this.isAlive) {
      throw new Error('WeightBalanceComputer: cannot pause a dead computer');
    }

    if (!this.isInit || !this.isResumed) {
      return;
    }

    this.isResumed = false;

    this.takeoffArm.pause();

    this.updateStaticSub!.pause();
    this.takeoffArmPipe!.pause();
    this.updateDynamicSub!.pause();
  }

  /**
   * Resets all load station load weights to zero.
   * @throws Error if this computer has been destroyed.
   */
  public reset(): void {
    if (!this.isAlive) {
      throw new Error('WeightBalanceComputer: cannot reset a dead computer');
    }

    for (let i = 0; i < this.loadStationSettings.length; i++) {
      const settings = this.loadStationSettings[i];
      settings.loadWeight.resetToDefault();
    }
  }

  /**
   * Updates weight and balance data that only depend on user-selected values.
   */
  private updateStatic(): void {
    let loadStationsEmptyWeight = 0;
    let operatingLoadWeight = 0;
    let passengerLoadWeight = 0;
    let cargoLoadWeight = 0;

    let emptyLoadMoment = 0;
    let loadMoment = 0;

    for (let i = 0; i < this.loadStationSettings.length; i++) {
      const settings = this.loadStationSettings[i];

      if (settings.isEnabled.value) {
        const emptyWeight = settings.emptyWeight.value;
        const loadWeight = settings.loadWeight.value;

        loadStationsEmptyWeight += emptyWeight;

        switch (settings.def.type) {
          case WeightBalanceLoadStationType.Passenger:
            passengerLoadWeight += loadWeight;
            break;
          case WeightBalanceLoadStationType.Cargo:
            cargoLoadWeight += loadWeight;
            break;
          default:
            operatingLoadWeight += loadWeight;
        }

        emptyLoadMoment += emptyWeight * settings.emptyArm.value;
        loadMoment += loadWeight * settings.loadArm.value;
      }
    }

    const basicEmptyWeight = this.config.aircraftEmptyWeight + loadStationsEmptyWeight;
    this.basicEmptyWeightSetting.value = basicEmptyWeight;

    this.crewWeightSetting.value = operatingLoadWeight;
    this.passengerWeightSetting.value = passengerLoadWeight;
    this.cargoWeightSetting.value = cargoLoadWeight;

    const basicOperatingWeight = basicEmptyWeight + operatingLoadWeight;
    this.basicOperatingWeightSetting.value = basicOperatingWeight;

    const zeroFuelWeight = basicOperatingWeight + passengerLoadWeight + cargoLoadWeight;
    this.zeroFuelWeightSetting.value = zeroFuelWeight;

    const basicEmptyMoment = this.emptyMoment + emptyLoadMoment;

    this.basicEmptyArmSetting.value = basicEmptyMoment / basicEmptyWeight;
    this.zeroFuelMomentSetting.value = basicEmptyMoment + loadMoment;
  }

  /**
   * Updates weight and balance data that depend on dynamically computed values.
   */
  private updateDynamic(): void {
    const zeroFuelWeight = this.zeroFuelWeightSetting.value;
    const zeroFuelMoment = this.zeroFuelMomentSetting.value;

    const fobWeight = this.fobWeight.get();
    if (fobWeight < 0) {
      this.aircraftArm.set(NaN);
    } else {
      const weight = zeroFuelWeight + fobWeight;
      this.aircraftArm.set((zeroFuelMoment + fobWeight * this.config.fuelStationDef.arm) / weight);
    }

    const landingFuelWeight = this.landingFuelWeight.get();
    if (landingFuelWeight < 0) {
      this.landingArm.set(NaN);
    } else {
      const weight = zeroFuelWeight + landingFuelWeight;
      this.landingArm.set((zeroFuelMoment + landingFuelWeight * this.config.fuelStationDef.arm) / weight);
    }
  }

  /**
   * Destroys this computer. Once destroyed, this computer will no longer perform any calculations or updates, and
   * cannot be paused or resumed.
   */
  public destroy(): void {
    this.isAlive = false;

    this.takeoffArm.destroy();

    this.fobWeight.destroy();
    this.landingFuelWeight.destroy();

    this.updateStaticSub?.destroy();
    this.updateDynamicSub?.destroy();
  }
}

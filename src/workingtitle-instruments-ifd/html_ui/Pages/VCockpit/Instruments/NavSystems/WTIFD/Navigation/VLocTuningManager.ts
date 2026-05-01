import {
  BitFlags, ConsumerSubject, EventBus, FacilityType, FixTypeFlags, FlightPlan, FlightPlanSegment, FlightPlanSegmentType, ICAO, IcaoValue, Instrument,
  RegisteredSimVarUtils, SimVarValueType, Subject, Subscribable, VorFacility
} from '@microsoft/msfs-sdk';

import { Fms, FmsFplLegUserDataKey } from '../Fms';
import { IfdOptions } from '../IfdOptions';
import { ActiveNavSourceEvents } from './ActiveNavSourceManager';
import { IfdNavMode } from './Sources/IfdNavSources';

/** Manages automatic tuning of the NAV radio for VLOC. */
export class VLocTuningManager implements Instrument {
  private readonly activeNavMode = ConsumerSubject.create(this.bus.getSubscriber<ActiveNavSourceEvents>().on('pending_or_active_mode'), IfdNavMode.GPS);

  private readonly inVhfApproachSegment = Subject.create(false);

  private currentFacility?: VorFacility;
  private currentFacilityIcao = ICAO.emptyValue();
  private currentFacilityIsApproach = false;

  private readonly isStationReceived = Subject.create(false);

  private readonly tuneActiveEvent = `K:NAV${this.ifdOptions.navIndex}_RADIO_SET`;
  private readonly tuneStandbyEvent = `K:NAV${this.ifdOptions.navIndex}_STBY_SET`;

  private readonly activeFrequencyVar = RegisteredSimVarUtils.create(`NAV ACTIVE FREQUENCY:${this.ifdOptions.navIndex}`, 'frequency bcd16');
  private readonly activeIdentVar = RegisteredSimVarUtils.create(`NAV IDENT:${this.ifdOptions.navIndex}`, SimVarValueType.String);
  private readonly activeSignalStrengthVar = RegisteredSimVarUtils.create(`NAV SIGNAL:${this.ifdOptions.navIndex}`, SimVarValueType.Number);

  private activeFrequency = 0;

  /**
   * Constructs a new instance.
   * @param bus The event bus to use.
   * @param ifdOptions The IFD config options.
   * @param isEnabled Whether auto VLOC tuning is enabled.
   * @param fms The FMS to use.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly ifdOptions: IfdOptions,
    private readonly isEnabled: Subscribable<boolean>,
    private readonly fms: Fms,
  ) { }

  /** @inheritdoc */
  public init(): void {
    this.inVhfApproachSegment.sub((v) => {
      if (v) {
        this.tryTuneApproachNavaid();
      } else {
        this.currentFacilityIsApproach = false;
      }
    });
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isEnabled.get() || !this.fms.isPlanActivated.get() || !this.fms.flightPlanner.hasActiveFlightPlan()) {
      this.isStationReceived.set(false);
      return;
    }

    this.activeFrequency = this.activeFrequencyVar.get();

    const flightPlan = this.fms.flightPlanner.getActiveFlightPlan();
    const activeSegmentIndex = flightPlan.getSegmentIndex(flightPlan.activeLateralLeg);
    if (activeSegmentIndex < 0) {
      return;
    }
    const activeSegment = flightPlan.getSegment(activeSegmentIndex);
    this.inVhfApproachSegment.set(activeSegment.segmentType === FlightPlanSegmentType.Approach && this.isVhfApproach(activeSegment));

    if (!this.inVhfApproachSegment.get()) {
      const icao = this.tryFindLegNavaid(flightPlan);
      if (!ICAO.valueEquals(icao, this.currentFacilityIcao)) {
        this.tryTuneFacility(icao);
      }
    }

    this.updateStationReceived();
  }

  /**
   * Updates whether the desired station is currently received and identified.
   */
  private updateStationReceived(): void {
    if (this.currentFacility === undefined || this.currentFacility.freqMHz !== this.activeFrequency) {
      this.isStationReceived.set(false);
      return;
    }

    const signalStrength = this.activeSignalStrengthVar.get();
    const activeIdent = this.activeIdentVar.get();

    this.isStationReceived.set(
      signalStrength > 0 &&
      this.currentFacility.icaoStruct.ident === activeIdent
    );
  }

  /**
   * Tries to tune the VHF approach navaid if appropriate.
   */
  private tryTuneApproachNavaid(): void {
    const flightPlan = this.fms.flightPlanner.getActiveFlightPlan();
    const activeSegmentIndex = flightPlan.getSegmentIndex(flightPlan.activeLateralLeg);
    if (activeSegmentIndex < 0) {
      return;
    }
    const activeSegment = flightPlan.getSegment(activeSegmentIndex);

    if (activeSegment.segmentType === FlightPlanSegmentType.Approach) {
      const faf = activeSegment.legs.find((v) => BitFlags.isAny(v.leg.fixTypeFlags, FixTypeFlags.FAF));
      if (faf) {
        this.tryTuneFacility(faf.leg.originIcaoStruct);
        this.currentFacilityIsApproach = true;
      }
    }
  }

  /**
   * Tries to tune the VHF navaid from its ICAO if appropriate.
   * @param icao The navaid ICAO.
   */
  private async tryTuneFacility(icao: IcaoValue): Promise<void> {
    if (icao === this.currentFacilityIcao) {
      return;
    }

    this.currentFacilityIcao = icao;

    if (ICAO.isValueEmpty(icao) || icao.type !== 'V') {
      this.currentFacility = undefined;
      return;
    }

    this.currentFacility = await this.fms.facLoader.tryGetFacility(FacilityType.VOR, icao) ?? undefined;

    if (this.currentFacility) {
      const activeMode = this.activeNavMode.get();

      if (activeMode === IfdNavMode.VLOC && this.activeFrequency !== this.currentFacility.freqBCD16) {
        SimVar.SetSimVarValue(this.tuneStandbyEvent, SimVarValueType.Number, this.currentFacility.freqBCD16);
      } else if (activeMode !== IfdNavMode.VLOC) {
        SimVar.SetSimVarValue(this.tuneActiveEvent, SimVarValueType.Number, this.currentFacility.freqBCD16);
      }
    }
  }

  /**
   * Tries to find a recommended navaid for legs successively further from the active leg, both forward and ahead.
   * @param flightPlan The flightplan to use.
   * @returns The first navaid found, or empty ICAO if none.
   */
  private tryFindLegNavaid(flightPlan: FlightPlan): IcaoValue {
    const activeLegIndex = flightPlan.activeLateralLeg;
    const activeLeg = flightPlan.tryGetLeg(activeLegIndex);

    if (activeLeg && !ICAO.isValueEmpty(activeLeg.leg.originIcaoStruct) && activeLeg.leg.originIcaoStruct.type === 'V') {
      return activeLeg.leg.originIcaoStruct;
    }

    for (let i = 1; ; i++) {
      const legAhead = flightPlan.tryGetLeg(activeLegIndex + i);
      const legBehind = flightPlan.tryGetLeg(activeLegIndex - i);
      if (!legAhead && !legBehind) {
        break;
      }

      if (legAhead && !ICAO.isValueEmpty(legAhead.leg.originIcaoStruct) && legAhead.leg.originIcaoStruct.type === 'V') {
        return legAhead.leg.originIcaoStruct;
      }
      if (legBehind && !ICAO.isValueEmpty(legBehind.leg.originIcaoStruct) && legBehind.leg.originIcaoStruct.type === 'V') {
        return legBehind.leg.originIcaoStruct;
      }
    }

    return ICAO.emptyValue();
  }

  /**
   * Checks if the approach in an approach segment is a "VHF approach" based on localizer.
   * @param approachSegment The approach segment to check.
   * @returns true if the approach is VHF
   */
  private isVhfApproach(approachSegment: FlightPlanSegment): boolean {
    const faf = approachSegment.legs.find((v) => BitFlags.isAny(v.leg.fixTypeFlags, FixTypeFlags.FAF));
    if (faf === undefined || ICAO.isValueEmpty(faf.leg.originIcaoStruct) || faf.leg.originIcaoStruct.type !== 'V') {
      return false;
    }

    switch (faf.userData[FmsFplLegUserDataKey.ApproachType]) {
      case ApproachType.APPROACH_TYPE_ILS:
      case ApproachType.APPROACH_TYPE_LDA:
      case ApproachType.APPROACH_TYPE_LOCALIZER:
      case ApproachType.APPROACH_TYPE_LOCALIZER_BACK_COURSE:
      case ApproachType.APPROACH_TYPE_SDF:
        return true;
      default:
        return false;
    }
  }

  /**
   * Checks if VLOC can be automatically armed.
   * @returns true if VLOC can be automatically armed.
   */
  public canArmVLoc(): boolean {
    return this.currentFacilityIsApproach && this.isStationReceived.get();
  }
}

import {
  BitFlags, ConsumerSubject, ConsumerValue, EventBus, FixTypeFlags, Instrument, MagVar, NavMath, SimVarValueType, Subscribable
} from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';
import { GnssReceiverEvents } from '../Systems/Gnss/GnssTypes';
import { ActiveNavSourceEvents } from './ActiveNavSourceManager';
import { IfdNavControlEvents } from './IfdNavControlEvents';
import { IfdNavMode } from './Sources/IfdNavSources';
import { NavRadioNavSource } from './Sources/NavRadioNavSource';
import { VLocTuningManager } from './VLocTuningManager';

/** Manages automatic activation of the VLOC mode. */
export class VLocActivationManager implements Instrument {
  private static readonly VLOC_ACTIVATION_MAX_DOTS = 0.5;

  private readonly navPublisher = this.bus.getPublisher<IfdNavControlEvents>();

  private readonly activeNavMode = ConsumerSubject.create(this.bus.getSubscriber<ActiveNavSourceEvents>().on('pending_or_active_mode'), IfdNavMode.GPS);

  private readonly acTrueTrack = ConsumerValue.create(this.bus.getSubscriber<GnssReceiverEvents>().on('gnss_track_true_deg'), null);

  /**
   * Constructs a new instance.
   * @param bus The instrument event bus.
   * @param isEnabled Whether auto VLOC tuning is enabled.
   * @param vlocTuningManager The VLOC tuning manager to use.
   * @param fms The FMS to use.
   * @param vlocSource The VLOC nav source to use.
   * @param armedMode The current armed mode.
   * @param autoSlew Whether the enable auto-slewing CDI on activation.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly isEnabled: Subscribable<boolean>,
    private readonly vlocTuningManager: VLocTuningManager,
    private readonly fms: Fms,
    private readonly vlocSource: NavRadioNavSource<any>,
    private readonly armedMode: Subscribable<IfdNavMode | null>,
    private readonly autoSlew: boolean,
  ) { }

  /** @inheritdoc */
  init(): void {
    // noop
  }

  /** @inheritdoc */
  onUpdate(): void {
    if (
      !this.isEnabled.get() || !this.fms.isPlanActivated.get() || !this.fms.flightPlanner.hasActiveFlightPlan() ||
      this.activeNavMode.get() === IfdNavMode.VLOC || !this.vlocTuningManager.canArmVLoc()) {
      return;
    }

    if (this.armedMode.get() !== IfdNavMode.VLOC) {
      this.navPublisher.pub('ifd_nav_arm_mode', IfdNavMode.VLOC);
      return;
    }

    const acTrueTrack = this.acTrueTrack.get();
    if (acTrueTrack === null) {
      return;
    }

    const flightPlan = this.fms.flightPlanner.getActiveFlightPlan();
    const activeLeg = flightPlan.tryGetLeg(flightPlan.activeLateralLeg);
    const nexLeg = flightPlan.tryGetLeg(flightPlan.activeLateralLeg + 1);
    const fafLeg = activeLeg && BitFlags.isAny(activeLeg.leg.fixTypeFlags, FixTypeFlags.FAF) ? activeLeg :
      (nexLeg && BitFlags.isAny(nexLeg.leg.fixTypeFlags, FixTypeFlags.FAF) ? nexLeg : undefined);

    if (!fafLeg || !fafLeg.calculated || fafLeg.calculated.initialDtk === undefined) {
      return;
    }

    const magVar = MagVar.get(this.fms.ppos.lat, this.fms.ppos.lon);
    const finalTrueTrack = MagVar.magneticToTrue(fafLeg.calculated.initialDtk, magVar);

    if (Math.abs(NavMath.diffAngle(acTrueTrack, finalTrueTrack)) > 15) {
      return;
    }

    const cdiDeviation = this.vlocSource.lateralDeviation.get();
    if (cdiDeviation === null || Math.abs(cdiDeviation * 2) > VLocActivationManager.VLOC_ACTIVATION_MAX_DOTS) {
      return;
    }

    this.navPublisher.pub('ifd_nav_activate_mode', IfdNavMode.VLOC);

    if (this.autoSlew) {
      SimVar.SetSimVarValue('K:VOR1_SET', SimVarValueType.Number, fafLeg.calculated.initialDtk);
    }
  }
}

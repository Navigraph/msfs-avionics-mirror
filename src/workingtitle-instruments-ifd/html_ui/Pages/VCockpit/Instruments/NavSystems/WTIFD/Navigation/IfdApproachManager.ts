import { ConsumerValue, EventBus, Instrument, Subject } from '@microsoft/msfs-sdk';

import { Fms, FmsFlightPhase, FmsUtils } from '../Fms';
import { GnssNavigationMode, GnssReceiverControlEvents } from '../Systems/Gnss/GnssTypes';
import { IfdApproachNavModes as IfdApproachNavMode } from './Sources/IfdNavSources';
import { IfdGlidePathComputer } from './Vnav/IfdGlidePathComputer';
import { GlidepathServiceLevel } from './Vnav/IfdVnavTypes';

/** Data events for IFD Approach Navigation. */
export interface IfdApproachEvents {
  /** The currently armable approach nav mode, or null. */
  armed_approach_mode: IfdApproachNavMode | null;
  /** The currently active approach nav mode, or null. */
  active_approach_mode: IfdApproachNavMode | null;
  /** Whether the approach prompt is active. */
  approach_prompt: boolean;
}

/** Events to control IFD approach navigation. */
export interface IfdApproachControlEvents {
  /** Acknowledges the approach prompt if it is active. */
  approach_prompt_acknowledge: unknown;
}

/**
 * Approach Navigation Manager
 */
export class IfdApproachManager implements Instrument {
  private static readonly ENROUTE_VAL = null;
  private static readonly LPV_VAL = 50; // metres. Should be 35 for LPV200, but our navdata doesn't tell us LPV type

  private readonly armedApproachType = Subject.create<IfdApproachNavMode | null>(null);
  private readonly activeApproachType = Subject.create<IfdApproachNavMode | null>(null);
  private readonly approachPrompt = Subject.create(false);

  private readonly navMode = Subject.create(GnssNavigationMode.Enroute);
  private readonly desiredVal = Subject.create<number | null>(IfdApproachManager.ENROUTE_VAL);

  private readonly gnssControlPublisher = this.bus.getPublisher<GnssReceiverControlEvents>();

  private readonly fmsFlightPhase = ConsumerValue.create<Readonly<FmsFlightPhase>>(
    FmsUtils.onFmsEvent(this.fms.flightPlanner.id, this.bus, 'fms_flight_phase'),
    {
      isApproachActive: false,
      isToFaf: false,
      isPastFaf: false,
      isInMissedApproach: false
    }
  );

  private readonly onGpApproach = Subject.create(false);

  /**
   * Constructs a new instance.
   * @param bus The instrument event bus.
   * @param gpComputer The glide path computer.
   * @param fms The FMS to use.
   */
  constructor(private readonly bus: EventBus, private readonly gpComputer: IfdGlidePathComputer, private readonly fms: Fms) { }

  /** @inheritdoc */
  public init(): void {
    const publisher = this.bus.getPublisher<IfdApproachEvents>();
    this.armedApproachType.sub((v) => publisher.pub('armed_approach_mode', v, false, true), true);
    this.activeApproachType.sub((v) => publisher.pub('active_approach_mode', v, false, true), true);
    this.approachPrompt.sub((v) => publisher.pub('approach_prompt', v, false, true), true);

    const sub = this.bus.getSubscriber<IfdApproachControlEvents>();
    sub.on('approach_prompt_acknowledge').handle(() => this.approachPrompt.set(false));

    this.gpComputer.glidepathGuidance.sub((v) => this.onGpApproach.set((this.onGpApproach.get() && v.isValid) || v.canCapture));
    this.onGpApproach.sub((v) => this.approachPrompt.set(v));

    this.navMode.sub((v) => this.gnssControlPublisher.pub('gnss_receiver_set_navigation_mode', v), true);
    this.desiredVal.sub((v) => this.gnssControlPublisher.pub('gnss_receiver_set_desired_val_m', v), true);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const approachType = this.getApproachType(this.gpComputer.gpServiceLevel.get());

    this.navMode.set(this.getDesiredNavMode());

    if (!this.fms.isPlanActivated.get() || !this.fmsFlightPhase.get().isApproachActive || approachType === null) {
      this.armedApproachType.set(null);
      this.activeApproachType.set(null);
      this.desiredVal.set(IfdApproachManager.ENROUTE_VAL);
      return;
    }

    const gpGuidance = this.gpComputer.glidepathGuidance.get();

    const isLpv = gpGuidance.approachHasGlidepath && this.gpComputer.gpNominalServiceLevel.get() === GlidepathServiceLevel.Lpv;
    this.desiredVal.set(isLpv ? IfdApproachManager.LPV_VAL : IfdApproachManager.ENROUTE_VAL);

    if ((this.activeApproachType.get() === approachType && gpGuidance.isValid) || gpGuidance.canCapture) {
      this.activeApproachType.set(approachType);
      this.armedApproachType.set(null);
    } else {
      this.activeApproachType.set(null);
      this.armedApproachType.set(approachType);
    }
  }

  /**
   * Gets the target navigation mode.
   * @returns the desired nav mode.
   */
  private getDesiredNavMode(): GnssNavigationMode {
    const flightPhase = this.fmsFlightPhase.get();
    if (flightPhase.isInMissedApproach) {
      return GnssNavigationMode.Terminal;
    }
    if (flightPhase.isApproachActive) {
      return GnssNavigationMode.Approach;
    }
    return GnssNavigationMode.Enroute;
  }

  /**
   * Maps the glide path computer service level to an IFD approach type.
   * @param gpServiceLevel The glide path service level from the GP computer.
   * @returns The IFD approach type.
   */
  private getApproachType(gpServiceLevel: GlidepathServiceLevel): IfdApproachNavMode | null {
    switch (gpServiceLevel) {
      case GlidepathServiceLevel.LNavPlusV:
      case GlidepathServiceLevel.LNavPlusVBaro:
        return IfdApproachNavMode.LNAV_V;
      case GlidepathServiceLevel.LNavVNav:
      case GlidepathServiceLevel.LNavVNavBaro:
        return IfdApproachNavMode.LVNAV;
      case GlidepathServiceLevel.LpPlusV:
        return IfdApproachNavMode.LP_V;
      case GlidepathServiceLevel.Lpv:
        return IfdApproachNavMode.LPV;
      default:
        return null;
    }
  }
}

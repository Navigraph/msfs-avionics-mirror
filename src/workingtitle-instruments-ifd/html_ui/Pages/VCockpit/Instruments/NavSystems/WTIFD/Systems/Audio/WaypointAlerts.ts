import {
  ActiveLegType, BitFlags, DebounceTimer, EventBus, FixTypeFlags, FlightPlanActiveLegEvent, FlightPlanner, Instrument, MappedSubject, SoundServerController,
  Subscribable, SubscribableMapFunctions
} from '@microsoft/msfs-sdk';

import { IfdAudioOptions } from '../../IfdOptions';
import { AlertUserSettings } from '../../Settings/AlertUserSettings';

/** The waypoint sequence alert. */
export class WaypointAlerts implements Instrument {
  private static readonly FPL_EDIT_INHIBIT_MS = 500;

  private readonly isEnabled = MappedSubject.create(
    SubscribableMapFunctions.and(),
    AlertUserSettings.getManager(this.bus).getSetting('waypointAurals'),
    this.isPowered,
  );

  private isInit = false;

  private readonly inhibitTimer = new DebounceTimer();

  /**
   * Ctor.
   * @param bus The event bus to use.
   * @param soundController The sound server controller to use.
   * @param isPowered Whether the instrument is powered.
   * @param options The audio configuration options.
   * @param flightPlanner The flight planner to use.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly soundController: SoundServerController,
    private readonly isPowered: Subscribable<boolean>,
    private readonly options: Readonly<IfdAudioOptions>,
    private readonly flightPlanner: FlightPlanner,
  ) { }

  /** @inheritdoc */
  public init(): void {
    if (this.options.finalApproachEvent && this.options.missedApproachEvent && this.options.waypointEvent) {
      this.flightPlanner.onEvent('fplSegmentChange').handle(this.inhibitAfterEdit);
      this.flightPlanner.onEvent('fplLegChange').handle(this.inhibitAfterEdit);
      this.flightPlanner.onEvent('fplOriginDestChanged').handle(this.inhibitAfterEdit);
      this.flightPlanner.onEvent('fplProcDetailsChanged').handle(this.inhibitAfterEdit);
      this.flightPlanner.onEvent('fplLoaded').handle(this.inhibitAfterEdit);

      this.flightPlanner.onEvent('fplCopied').handle((e) => this.inhibitAfterEdit({ planIndex: e.targetPlanIndex }));

      this.flightPlanner.onEvent('fplActiveLegChange').handle(this.handleActiveLegChange);

      this.isInit = true;
    }
  }

  /** @inheritdoc */
  public onUpdate(): void { }

  /**
   * Handles inhibiting the alerts for a short time during plan edits to avoid spurious alerts.
   * @param e The edit event.
   * @param e.planIndex The plan being edited.
   */
  private inhibitAfterEdit = (e: {
    /** The plan being edited. */
    readonly planIndex: number
  }): void => {
    if (e.planIndex === this.flightPlanner.activePlanIndex && this.isEnabled.get()) {
      this.inhibitTimer.schedule(EmptyCallback.Void, WaypointAlerts.FPL_EDIT_INHIBIT_MS);
    }
  };

  /**
   * Handles changes to the active leg.
   * @param e The leg change event.
   */
  private handleActiveLegChange = (e: FlightPlanActiveLegEvent): void => {
    if (
      !this.isEnabled.get() || !this.isInit ||
      e.planIndex !== this.flightPlanner.activePlanIndex ||
      e.type !== ActiveLegType.Lateral ||
      this.inhibitTimer.isPending() ||
      !this.flightPlanner.hasActiveFlightPlan()
    ) {
      return;
    }

    const plan = this.flightPlanner.getActiveFlightPlan();
    const sequencedLeg = plan.tryGetLeg(e.previousSegmentIndex, e.previousLegIndex);
    if (!sequencedLeg) {
      return;
    }

    let wwise: string;
    if (BitFlags.isAll(sequencedLeg.leg.fixTypeFlags, FixTypeFlags.MAP)) {
      wwise = this.options.missedApproachEvent!;
    } else if (BitFlags.isAll(sequencedLeg.leg.fixTypeFlags, FixTypeFlags.FAF)) {
      wwise = this.options.finalApproachEvent!;
    } else {
      wwise = this.options.waypointEvent!;
    }

    this.soundController.playSound(wwise);
  };
}

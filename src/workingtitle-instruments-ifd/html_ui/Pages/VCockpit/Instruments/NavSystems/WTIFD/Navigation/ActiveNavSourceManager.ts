/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  BitFlags, CdiEvents, CdiUtils, ControlEvents, DebounceTimer, EventBus, FixTypeFlags, FlightPlanSegmentType, FlightPlanUtils, KeyEventData, KeyEventManager,
  KeyEvents, LNavEvents, LNavObsControlEvents, LNavUtils, NavRadioIndex, NavSourceType, RegisteredSimVarUtils, SimVarValueType, Subject, Subscribable, Subscription
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent, IfdInteractions } from '../Events/IfdInteractionEvent';
import { Fms } from '../Fms';
import { IfdNavControlEvents } from './IfdNavControlEvents';
import { IfdNavMode, IfdNavSources } from './Sources/IfdNavSources';
import { NavSources } from './Sources/NavSourceBase';

/** Active nav source data events. */
export interface ActiveNavSourceEvents {
  /** The currently pending active mode if any, else the active mode. */
  pending_or_active_mode: IfdNavMode;
  /** The currently pending armed mode if any, else the armed mode. */
  pending_or_armed_mode: IfdNavMode | null;
  /** Whether the active CDI is valid. */
  active_cdi_valid: boolean;
}

/**
 * Configuration options for {@link ActiveNavSourceManager}.
 */
export type ActiveNavSourceManagerOptions = {
  /** Whether to auto-slew the OBS course when in GPS mode. */
  autoSlewGpsCourse: boolean;

  /** The CDI ID managed by this manager. */
  cdiId: string,

  /** The LNAV index used by this manager. */
  lnavIndex: number;

  /** The VLOC nav index used by this manager. */
  navIndex: NavRadioIndex | undefined;

  /**
   * Whether to keep the active navigation source synchronized with the sim's `GPS DRIVES NAV1` and
   * `AUTOPILOT NAV SELECTED` SimVars.
   */
  syncWithSim: boolean;

  /** Whether to allow the active navigation source to be set using key events. */
  setFromKeyEvents: boolean;
};

/**
 * A manager for the active navigation source. Changes the active navigation source in response to control events and
 * keeps various data in sync with the active nav source.
 */
export class ActiveNavSourceManager {
  /** The time to ms to wait after setting a nav source with the CDI knob. */
  private static readonly NAV_SOURCE_CONFIRM_TIME = 5_000;

  private readonly publisher = this.bus.getPublisher<ActiveNavSourceEvents & CdiEvents & LNavObsControlEvents>();

  private readonly obsSetActiveTopic: keyof LNavObsControlEvents;

  private readonly cdiSelectTopic: keyof CdiEvents;

  private keyEventManager?: KeyEventManager;

  // eslint-disable-next-line jsdoc/require-jsdoc
  private readonly keyEventManagerReadyPromises: { resolve: () => void, reject: (reason?: any) => void }[] = [];

  private readonly _armedMode = Subject.create<IfdNavMode | null>(null);
  public readonly armedMode: Subscribable<IfdNavMode | null> = this._armedMode;
  private readonly pendingOrArmedSource = Subject.create<IfdNavMode | null>(null);

  private readonly _activeMode = Subject.create<IfdNavMode>(IfdNavMode.GPS);
  public readonly activeMode: Subscribable<IfdNavMode> = this._activeMode;
  private readonly pendingOrActiveSource = Subject.create(IfdNavMode.GPS);

  private readonly pendingSourceTimer = new DebounceTimer();

  private readonly cdiValid = Subject.create(false);

  private readonly gpsDrivesNav1 = RegisteredSimVarUtils.createBoolean('GPS DRIVES NAV1');
  private readonly apNavSelected = RegisteredSimVarUtils.create('AUTOPILOT NAV SELECTED', SimVarValueType.Number);

  private readonly autoSlewGpsCourse: boolean;
  private readonly navIndex: NavRadioIndex | undefined;
  private readonly syncWithSim: boolean;
  private readonly setFromKeyEvents: boolean;

  private autoSlewPipe?: Subscription;
  private srcSetSub?: Subscription;
  private srcSwitchSub?: Subscription;

  private isAlive = true;
  private isInit = false;

  private keyEventSub?: Subscription;
  private activeSourceSetSub?: Subscription;
  private armedSourceSetSub?: Subscription;
  private hEventSub?: Subscription;
  private cdiSub?: Subscription;

  /**
   * Constructor.
   * @param bus The event bus.
   * @param fms The FMS to use.
   * @param navSources The nav sources to use.
   * @param options The options for this manager.
   */
  public constructor(
    private readonly bus: EventBus,
    private readonly fms: Fms,
    private readonly navSources: NavSources<IfdNavSources>,
    options: Readonly<ActiveNavSourceManagerOptions>,
  ) {
    this.autoSlewGpsCourse = options.autoSlewGpsCourse;
    this.navIndex = options.navIndex;
    this.syncWithSim = options.syncWithSim;
    this.setFromKeyEvents = options.setFromKeyEvents;

    this.cdiSelectTopic = `cdi_select${CdiUtils.getEventBusTopicSuffix(options.cdiId)}`;
    this.obsSetActiveTopic = `lnav_obs_set_active${LNavUtils.getEventBusTopicSuffix(options.lnavIndex)}`;

    KeyEventManager.getManager(this.bus).then(manager => {
      this.keyEventManager = manager;
      while (this.isAlive && this.keyEventManagerReadyPromises.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.keyEventManagerReadyPromises.shift()!.resolve();
      }
    });
  }

  /**
   * Waits for this manager's key event manager to be ready.
   * @returns A Promise which will be fulfilled when this manager's key event manager is ready, or rejected if this
   * manager is destroyed before then.
   */
  private awaitKeyEventManagerReady(): Promise<void> {
    if (this.keyEventManager !== undefined) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => { this.keyEventManagerReadyPromises.push({ resolve, reject }); });
  }

  /**
   * Initializes this manager. Once this manager is initialized, it will manage the active navigation source in
   * response to control events and keep various data in sync with the active nav source.
   * @throws Error if this manager has been destroyed.
   */
  public async init(): Promise<void> {
    if (!this.isAlive) {
      throw new Error('ActiveNavSourceManager: cannot initialize a dead manager');
    }

    if (this.isInit) {
      return;
    }

    if (this.setFromKeyEvents) {
      try {
        await this.awaitKeyEventManagerReady();
      } catch {
        return;
      }
    }

    this.isInit = true;

    const sub = this.bus.getSubscriber<ControlEvents & IfdInteractions & IfdNavControlEvents & KeyEvents & LNavEvents>();

    if (this.setFromKeyEvents) {
      this.keyEventManager!.interceptKey('AP_NAV_SELECT_SET', false);
      this.keyEventManager!.interceptKey('TOGGLE_GPS_DRIVES_NAV1', false);

      this.keyEventSub = sub.on('key_intercept').handle(this.onKeyIntercepted.bind(this));
    }

    if (this.autoSlewGpsCourse) {
      const roundedCourse = Subject.create<number | null>(null);
      this.autoSlewPipe = this.navSources.get(IfdNavMode.GPS)?.course.pipe(roundedCourse, (v) => v === null ? null : Math.round(v), true);
      roundedCourse.sub(this.onAutoSlewGpsCourse.bind(this));
    }

    // Initialize the state based on the sim state so that we respect what was set in the .FLT files.
    // We will later update the sim state in the activeMode sub below.
    if (this.gpsDrivesNav1.get() || this.navIndex === undefined) {
      this._activeMode.set(IfdNavMode.GPS);
    } else {
      this._activeMode.set(IfdNavMode.VLOC);
    }

    this.activeSourceSetSub = sub.on('ifd_nav_activate_mode').handle((v) => this._activeMode.set(v));
    this.armedSourceSetSub = sub.on('ifd_nav_arm_mode').handle((v) => this._armedMode.set(v));

    this.activeMode.sub(this.onActiveModeChanged.bind(this), true);

    this.armedMode.sub((v) => {
      this.pendingSourceTimer.clear();
      this.pendingOrArmedSource.set(v);
    });

    this.pendingOrActiveSource.sub((v) => this.publisher.pub('pending_or_active_mode', v, false, true), true);
    this.pendingOrArmedSource.sub((v) => this.publisher.pub('pending_or_armed_mode', v, false, true), true);

    this.cdiValid.sub((v) => this.publisher.pub('active_cdi_valid', v, false, true), true);

    this.hEventSub = sub.on('ifd_interaction_event').handle(this.onIfdInteractionEvent.bind(this));
  }

  /**
   * Handles changes to the active mode.
   * @param mode The active mode.
   */
  private onActiveModeChanged(mode: IfdNavMode): void {
    this.pendingSourceTimer.clear();
    this.pendingOrActiveSource.set(mode);

    const sourceType = mode === IfdNavMode.GPS || mode === IfdNavMode.OBS || mode === IfdNavMode.VLOC ? mode : IfdNavMode.GPS;
    const source = this.navSources.get(sourceType);

    this.cdiSub?.destroy();
    this.cdiSub = source.lateralDeviation.sub((cdi) => this.cdiValid.set(cdi !== null), true);

    if (mode !== IfdNavMode.VLOC) {
      this.publisher.pub(this.cdiSelectTopic, { index: 1, type: NavSourceType.Gps }, true, true);
    } else if (this.navIndex !== undefined) {
      this.publisher.pub(this.cdiSelectTopic, { index: this.navIndex, type: NavSourceType.Nav }, true, true);
    } else {
      console.warn('[ActiveNavSourceManager::onActiveModeChanged] Tried to select VLOC mode but VLOC is disabled on this IFD!');
      this.publisher.pub(this.cdiSelectTopic, { index: 1, type: NavSourceType.Gps }, true, true);
    }

    if (this.syncWithSim) {
      this.gpsDrivesNav1.set(mode !== IfdNavMode.VLOC);
      if (this.navIndex !== undefined) {
        this.apNavSelected.set(this.navIndex);
      }
    }

    if (mode === IfdNavMode.GPS) {
      this.autoSlewPipe?.resume(true);
    } else {
      this.autoSlewPipe?.pause();
    }
  }

  /**
   * Handles LNAV DTK changing.
   * @param dtk The DTK in degrees magnetic, or null if invalid.
   */
  private onAutoSlewGpsCourse(dtk: number | null): void {
    if (this.syncWithSim && dtk !== null && this.activeMode.get() === IfdNavMode.GPS) {
      SimVar.SetSimVarValue('K:GPS_OBS_SET', SimVarValueType.Number, dtk);
      SimVar.SetSimVarValue('K:VOR1_SET', SimVarValueType.Number, dtk);
    }
  }

  /**
   * Responds to when a key event is intercepted.
   * @param data The data for the intercepted key event.
   */
  private onKeyIntercepted(data: KeyEventData): void {
    switch (data.key) {
      case 'AP_NAV_SELECT_SET':
        if (data.value0 !== undefined && (data.value0 === this.navIndex)) {
          this._activeMode.set(IfdNavMode.VLOC);
        }
        break;
      case 'TOGGLE_GPS_DRIVES_NAV1': {
        const activeSource = this._activeMode.get();
        switch (activeSource) {
          case IfdNavMode.VLOC:
            this._activeMode.set(IfdNavMode.GPS);
            break;
          default:
            this.navIndex !== undefined && this._activeMode.set(IfdNavMode.VLOC);
        }
        break;
      }
    }
  }

  private readonly confirmPendingSource = (): void => {
    const pendingActiveSource = this.pendingOrActiveSource.get();
    if (pendingActiveSource === this.activeMode.get()) {
      return;
    }

    this._activeMode.set(pendingActiveSource);
    this._armedMode.set(this.pendingOrArmedSource.get());
  };

  /**
   * Handles IFD interactions.
   * @param event The interaction event to handle.
   */
  private onIfdInteractionEvent(event: IfdInteractionEvent): void {
    switch (event) {
      case IfdInteractionEvent.CDIKnobDec:
        this.onCdiIncrement(-1);
        break;
      case IfdInteractionEvent.CDIKnobInc:
        this.onCdiIncrement(1);
        break;
      case IfdInteractionEvent.CDIKnobPush:
        this.onCdiPush();
        break;
    }
  }

  /**
   * Handles rotation of CDI knob.
   * @param sign The direction of rotation.
   */
  private onCdiIncrement(sign: 1 | -1): void {
    if (this.activeMode.get() !== IfdNavMode.OBS) {
      if (this.navIndex !== undefined) {
        const newMode = this.pendingOrActiveSource.get() === IfdNavMode.VLOC ? IfdNavMode.GPS : IfdNavMode.VLOC;
        this.pendingOrActiveSource.set(newMode);
        if (newMode !== IfdNavMode.GPS) {
          this.pendingOrArmedSource.set(null);
        }
        this.pendingSourceTimer.schedule(this.confirmPendingSource, ActiveNavSourceManager.NAV_SOURCE_CONFIRM_TIME);
      }
    } else {
      if (sign > 0) {
        SimVar.SetSimVarValue('K:GPS_OBS_INC', SimVarValueType.Number, 0);
      } else {
        SimVar.SetSimVarValue('K:GPS_OBS_DEC', SimVarValueType.Number, 0);
      }
    }
  }

  /**
   * Handles push of CDI knob (toggle OBS).
   */
  private onCdiPush(): void {
    const activeMode = this.activeMode.get();
    if (activeMode === IfdNavMode.VLOC) {
      return;
    }

    if (activeMode === IfdNavMode.OBS) {
      this._activeMode.set(IfdNavMode.GPS);
      this.publisher.pub(this.obsSetActiveTopic, false);
    } else if (this.isObsAvailable()) {
      this._activeMode.set(IfdNavMode.OBS);
      this.publisher.pub(this.obsSetActiveTopic, true);
    }
  }

  /**
   * Checks if OBS is available.
   * @returns true if it is.
   */
  private isObsAvailable(): boolean {
    if (!this.fms.flightPlanner.hasActiveFlightPlan() || !this.fms.isPlanActivated.get()) {
      return false;
    }

    const flightPlan = this.fms.flightPlanner.getActiveFlightPlan();
    const activeSegmentIndex = flightPlan.getSegmentIndex(flightPlan.activeLateralLeg);
    if (activeSegmentIndex < 0) {
      return false;
    }
    const activeSegment = flightPlan.getSegment(activeSegmentIndex);
    // in the approach OBS is only available prior to reaching the FAF
    if (activeSegment.segmentType === FlightPlanSegmentType.Approach) {
      const fafIndex = activeSegment.legs.findIndex((v) => BitFlags.isAny(v.leg.fixTypeFlags, FixTypeFlags.FAF));
      if (fafIndex && flightPlan.getSegmentLegIndex(flightPlan.activeLateralLeg) > fafIndex) {
        return false;
      }
    }

    const activeLeg = flightPlan.tryGetLeg(flightPlan.activeLateralLeg);
    return activeLeg !== null && FlightPlanUtils.isToFixLeg(activeLeg.leg.type);
  }

  /**
   * Destroys this manager.
   */
  public destroy(): void {
    this.isAlive = false;

    this.keyEventManagerReadyPromises.forEach(promise => { promise.reject('ActiveNavSourceManager: manager was destroyed'); });

    this.srcSetSub?.destroy();
    this.srcSwitchSub?.destroy();
    this.keyEventSub?.destroy();
    this.armedSourceSetSub?.destroy();
    this.activeSourceSetSub?.destroy();
    this.hEventSub?.destroy();
    this.cdiSub?.destroy();
  }
}

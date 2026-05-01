import {
  AdcEvents, ConsumerSubject, DebounceTimer, EventBus, FacilityType, GameStateProvider, IcaoValue, Instrument, NearestContext, Subject, Subscribable, Wait
} from '@microsoft/msfs-sdk';

import { Fms } from '../Fms';
import { GnssNavigationState, GnssReceiverEvents } from '../Systems/Gnss/GnssTypes';
import { IfdIlluminationManager } from './IfdIlluminationManager';
import { IfdPowerEvents } from './IfdPowerMonitor';

/** Control events for IFD startup. */
export interface IfdStartupEvents {
  /** Event sent when a hot startup/spawn is detected. It is not published for normal starts. */
  ifd_startup_hot_start: boolean;
}

export enum StartupState {
  Splash = 1,
  Software = 2,
  Completed = 3
}

/** Manages IFD startup process. */
export class IfdStartupManager implements Instrument {
  private static readonly GPS_WAIT_TIME = 2 * 60;
  private static readonly LANDING_DEBOUNCE_TIME_MS = 2000;

  private readonly _startupState = Subject.create(StartupState.Splash);
  public readonly startupState: Subscribable<StartupState> = this._startupState;

  private splashDurationSeconds = this.getSplashScreenDuration();

  private readonly sub = this.bus.getSubscriber<AdcEvents & GnssReceiverEvents & IfdPowerEvents>();

  private readonly fmsPositionMode = ConsumerSubject.create(this.sub.on('gnss_navigation_state'), GnssNavigationState.Init);
  private readonly poweredOnTime = ConsumerSubject.create(this.sub.on('ifd_powered_on_time'), -1);

  private isInit = false;
  private didFirstUpdateAfterInit = false;

  private isWaitingForGps = true;

  private readonly landingDebounceTimer = new DebounceTimer();
  private lastAirport?: IcaoValue;

  private isFlightPlanInitialised = false;

  /**
   * Manages IFD startup process.
   * @param bus The instrument event bus.
   * @param fms The FMS.
   * @param isPrimary Whether this is running on the primary instrument.
   * @param ifdIlluminationManager The illumination manager
   */
  constructor(private readonly bus: EventBus, private readonly fms: Fms, private readonly isPrimary: boolean, private readonly ifdIlluminationManager: IfdIlluminationManager,) { }

  /** @inheritdoc */
  public init(): void {
    Wait.awaitSubscribable(GameStateProvider.get(), (v) => v === GameState.ingame, true).then(() => {
      Wait.awaitCondition(() => NearestContext.isInitialized, 500).then(() => {
        // no initial sub, as we only want this on landing
        this.sub.on('on_ground').handle((v) => {
          if (v) {
            this.landingDebounceTimer.schedule(this.updateLastAirport, IfdStartupManager.LANDING_DEBOUNCE_TIME_MS);
          } else {
            this.landingDebounceTimer.clear();
          }
        });
      });

      this.isInit = true;
    });

    this._startupState.sub((v) => {
      switch (v) {
        case StartupState.Completed:
          this.ifdIlluminationManager.setPageKeyIllumination(true);
          this.ifdIlluminationManager.setBezelKeyIllumination(true);
          break;
        case StartupState.Software:
          this.ifdIlluminationManager.setBezelKeyIllumination(true);
          this.ifdIlluminationManager.setPageKeyIllumination(false);
          break;
        default:
          this.ifdIlluminationManager.setPageKeyIllumination(false);
          this.ifdIlluminationManager.setBezelKeyIllumination(false);
          break;
      }
    });
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isInit) {
      return;
    }

    const poweredOnTime = this.poweredOnTime.get();

    if (!this.didFirstUpdateAfterInit) {
      this.didFirstUpdateAfterInit = true;

      const isHotStart = poweredOnTime >= 0;
      if (isHotStart) {
        // skip startup screens if spawning with power already on
        this._startupState.set(StartupState.Completed);
        this.bus.getPublisher<IfdStartupEvents>().pub('ifd_startup_hot_start', true);
      }
    }

    if (poweredOnTime < 0) {
      // we are powered off
      this.isWaitingForGps = true;
      this._startupState.set(StartupState.Splash);
      this.splashDurationSeconds = this.getSplashScreenDuration();
      return;
    } else if (this._startupState.get() === StartupState.Splash && poweredOnTime >= this.splashDurationSeconds) {
      this._startupState.set(StartupState.Software);
    }

    if (this.isWaitingForGps && this.hasGps()) {
      this.isWaitingForGps = false;
      this.onGpsAcquired();
    } else if (this.isWaitingForGps && poweredOnTime > IfdStartupManager.GPS_WAIT_TIME) {
      this.isWaitingForGps = false;
      this.onGpsAcquisitionFailed();
    }
  }

  /** Handles the flightplan being initialised. */
  public onFlightPlanInitialised(): void {
    this.isFlightPlanInitialised = true;
  }

  /**
   * Gets the duration, in seconds, required for this instrument to boot on power up.
   * @returns The duration, in seconds, required for this instrument to boot on power up.
   */
  private getSplashScreenDuration(): number {
    return 1.5 + Math.random() * 2;
  }

  /**
   * Checks if a GPS position is available.
   * @returns True if we are in GPS position mode.
   */
  private hasGps(): boolean {
    switch (this.fmsPositionMode.get()) {
      case GnssNavigationState.BasicNav:
      case GnssNavigationState.FdeNav:
      case GnssNavigationState.SbasNav:
        return true;
      default:
        return false;
    }
  }

  /** Handles actions on first GPS position acquisition. */
  private onGpsAcquired(): void {
    // Set initial origin from ppos.
    if (this.isPrimary) {
      NearestContext.onInitialized(async () => {
        // give it time to fill with data
        await Wait.awaitDelay(1_000);

        await Wait.awaitCondition(() => this.isFlightPlanInitialised);

        const airport = this.fms.setInitialOrigin(true);
        if (airport) {
          this.lastAirport = airport;
        }
      });
    }
  }

  /** Handles actions when first GPS acquisition times out. */
  private onGpsAcquisitionFailed(): void {
    // Set initial origin from last airport.
    if (this.isPrimary && this.lastAirport) {
      Wait.awaitCondition(() => this.isFlightPlanInitialised).then(() => {
        this.fms.setInitialOrigin(false, this.lastAirport);
      });
    }
  }

  private updateLastAirport = (): void => {
    this.lastAirport = NearestContext.getInstance().getNearest(FacilityType.Airport)?.icaoStruct;
  };

  /**
   * Acknowledges the software disclaimer on the splash screen.
   */
  public onAcknowledgeSoftware(): void {
    if (this._startupState.get() === StartupState.Software) {
      this._startupState.set(StartupState.Completed);
    }
  }
}

import { EventBus, LNavObsControlEvents, Subject, Subscribable, SubscribableUtils, Subscription, Wait } from '@microsoft/msfs-sdk';

import { DefaultObsSuspDataProvider, ObsSuspDataProvider, ObsSuspModes } from '@microsoft/msfs-garminsdk';

import { G3XFplSourceDataProviderSourceDef } from '../FlightPlan/G3XFplSourceDataProvider';
import { G3XFplSource } from '../FlightPlan/G3XFplSourceTypes';
import { G3XTouchNavSource, G3XTouchNavSources } from '../NavReference/G3XTouchNavReference';

/**
 * A provider of data related to flight plan source for a {@link G3XObsController}.
 */
export interface G3XObsControllerFplSourceDataProvider {
  /** The definition describing the internal flight plan source. */
  readonly internalSourceDef: Readonly<G3XFplSourceDataProviderSourceDef>;

  /**
   * Definitions describing the external flight plan sources. The index of each definition corresponds to the index
   * of the source's parent external navigator.
   */
  readonly externalSourceDefs: readonly (Readonly<G3XFplSourceDataProviderSourceDef> | undefined)[];

  /** The number of supported external flight plan sources. */
  readonly externalSourceCount: 0 | 1 | 2;
}

/**
 * A controller of GPS OBS state for the G3X Touch.
 */
export class G3XObsController {
  private readonly fplSource: Subscribable<G3XFplSource>;

  private readonly lnavIndex = Subject.create(-1);
  private readonly lnavTopicSuffix: Subscribable<'' | `_${number}`>;

  private readonly navSource = Subject.create<G3XTouchNavSource | null>(null);

  /** A provider of OBS data for this controller's flight plan source. */
  public readonly obsSuspDataProvider: ObsSuspDataProvider;

  private readonly fplSourceSub: Subscription;

  /**
   * Creates a new instance of G3XObsController.
   * @param bus The event bus.
   * @param fplSourceDataProvider A provider of flight plan source data.
   * @param navSources A collection of all navigation sources.
   * @param fplSource The flight plan source to control.
   */
  public constructor(
    private readonly bus: EventBus,
    private readonly fplSourceDataProvider: G3XObsControllerFplSourceDataProvider,
    private readonly navSources: G3XTouchNavSources,
    fplSource: G3XFplSource | Subscribable<G3XFplSource>
  ) {
    this.fplSource = SubscribableUtils.toSubscribable(fplSource, true);

    this.fplSourceSub = this.fplSource.sub(this.onFplSourceChanged.bind(this), true);

    this.lnavTopicSuffix = this.lnavIndex.map(index => {
      return index === 0
        ? ''
        : `_${index}` as const;
    });

    const obsSuspDataProvider = new DefaultObsSuspDataProvider(this.bus, { lnavIndex: this.lnavIndex });
    obsSuspDataProvider.init();

    this.obsSuspDataProvider = obsSuspDataProvider;
  }

  /**
   * Responds to when this controller's flight plan source changes.
   * @param fplSource The new flight plan source.
   */
  private onFplSourceChanged(fplSource: G3XFplSource): void {
    switch (fplSource) {
      case G3XFplSource.External1:
        if (this.fplSourceDataProvider.externalSourceDefs[1]) {
          this.lnavIndex.set(this.fplSourceDataProvider.externalSourceDefs[1].lnavIndex);
          this.navSource.set(this.navSources.get('GPS1'));
        } else {
          this.lnavIndex.set(-1);
          this.navSource.set(null);
        }
        break;
      case G3XFplSource.External2:
        if (this.fplSourceDataProvider.externalSourceDefs[2]) {
          this.lnavIndex.set(this.fplSourceDataProvider.externalSourceDefs[2].lnavIndex);
          this.navSource.set(this.navSources.get('GPS2'));
        } else {
          this.lnavIndex.set(-1);
          this.navSource.set(null);
        }
        break;
      default: // internal source
        this.lnavIndex.set(this.fplSourceDataProvider.internalSourceDef.lnavIndex);
        this.navSource.set(this.navSources.get('GPSInt'));
        break;
    }
  }

  /**
   * Sends commands to activates OBS mode and optionally sets an initial OBS course. This has no effect if OBS mode is
   * not available for this controller's flight plan source.
   * @param course The OBS course to set after OBS mode has been activated, in degrees. If not defined, then the OBS
   * course will be set to the bearing to the OBS fix.
   * @returns A Promise which will fulfill after this method has finished sending all commands to change OBS state.
   * Note that there is no guarantee that OBS state will have been successfully changed as a result of the commands
   * that were sent when the Promise fulfills.
   */
  public async activateObs(course?: number): Promise<void> {
    if (!this.obsSuspDataProvider.isObsAvailable.get()) {
      return;
    }

    if (this.obsSuspDataProvider.mode.get() !== ObsSuspModes.OBS) {
      this.bus.getPublisher<LNavObsControlEvents>().pub(`lnav_obs_set_active${this.lnavTopicSuffix.get()}`, true, true, false);

      if (course !== undefined) {
        // Wait until OBS has been activated before attempting to set the OBS course. When OBS is activated, the
        // OBS course is automatically set based on the bearing to the OBS fix. So if we want to set the OBS course
        // we need to wait until after this happens in order for our course to not be overridden.
        try {
          const lnavIndex = this.lnavIndex.get();

          await Wait.awaitSubscribable(this.obsSuspDataProvider.mode, mode => mode === ObsSuspModes.OBS, true, 1000);

          // Abort if the flight plan source changed.
          if (lnavIndex !== this.lnavIndex.get()) {
            return;
          }
        } catch {
          // Abort if we timed out.
          return;
        }
      }
    }

    if (course !== undefined) {
      this.setObsCourse(course);
    }
  }

  /**
   * Sends commands to set the OBS course. This has no effect if OBS mode is not active.
   * @param course The course to set, in degrees.
   * @returns A Promise which will fulfill after this method has finished sending all commands to change OBS state.
   * Note that there is no guarantee that OBS state will have been successfully changed as a result of the commands
   * that were sent when the Promise fulfills.
   */
  public async setObsCourse(course: number): Promise<void> {
    if (this.obsSuspDataProvider.mode.get() !== ObsSuspModes.OBS) {
      return;
    }

    this.bus.getPublisher<LNavObsControlEvents>().pub(`lnav_obs_set_course${this.lnavTopicSuffix.get()}`, course, true, false);
  }

  /**
   * Sends commands to increment the OBS course. This has no effect if OBS mode is not active.
   * @returns A Promise which will fulfill after this method has finished sending all commands to change OBS state.
   * Note that there is no guarantee that OBS state will have been successfully changed as a result of the commands
   * that were sent when the Promise fulfills.
   */
  public async incObsCourse(): Promise<void> {
    if (this.obsSuspDataProvider.mode.get() !== ObsSuspModes.OBS) {
      return;
    }

    this.bus.getPublisher<LNavObsControlEvents>().pub(`lnav_obs_inc_course${this.lnavTopicSuffix.get()}`, undefined, true, false);
  }

  /**
   * Sends commands to decrement the OBS course. This has no effect if OBS mode is not active.
   * @returns A Promise which will fulfill after this method has finished sending all commands to change OBS state.
   * Note that there is no guarantee that OBS state will have been successfully changed as a result of the commands
   * that were sent when the Promise fulfills.
   */
  public async decObsCourse(): Promise<void> {
    if (this.obsSuspDataProvider.mode.get() !== ObsSuspModes.OBS) {
      return;
    }

    this.bus.getPublisher<LNavObsControlEvents>().pub(`lnav_obs_dec_course${this.lnavTopicSuffix.get()}`, undefined, true, false);
  }

  /**
   * Sends commands to sync the OBS course to the current bearing to the OBS fix. This has no effect if OBS mode is not
   * active or if the bearing to the OBS fix cannot be retrieved.
   * @returns A Promise which will fulfill after this method has finished sending all commands to change OBS state.
   * Note that there is no guarantee that OBS state will have been successfully changed as a result of the commands
   * that were sent when the Promise fulfills.
   */
  public async syncObsCourse(): Promise<void> {
    if (this.obsSuspDataProvider.mode.get() !== ObsSuspModes.OBS) {
      return;
    }

    const bearing = this.navSource.get()?.bearing.get();
    if (bearing !== null && bearing !== undefined) {
      this.setObsCourse(bearing);
    }
  }

  /**
   * Sends commands to deactivate OBS mode.
   * @returns A Promise which will fulfill after this method has finished sending all commands to change OBS state.
   * Note that there is no guarantee that OBS state will have been successfully changed as a result of the commands
   * that were sent when the Promise fulfills.
   */
  public async deactivateObs(): Promise<void> {
    if (this.obsSuspDataProvider.mode.get() !== ObsSuspModes.OBS) {
      return;
    }

    this.bus.getPublisher<LNavObsControlEvents>().pub(`lnav_obs_set_active${this.lnavTopicSuffix.get()}`, false, true, false);
  }

  /**
   * Destroys this controller.
   */
  public destroy(): void {
    this.fplSourceSub.destroy();
    (this.obsSuspDataProvider as DefaultObsSuspDataProvider).destroy();
  }
}

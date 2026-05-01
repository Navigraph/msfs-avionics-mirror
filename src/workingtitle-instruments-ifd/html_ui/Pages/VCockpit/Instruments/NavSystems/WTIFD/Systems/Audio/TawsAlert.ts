import { Accessible, AccessibleUtils, ClockEvents, ConsumerValue, EventBus, Instrument, SoundServerController, Subscribable, Value } from '@microsoft/msfs-sdk';

import { IfdAirframeType, IfdOptions } from '../../IfdOptions';
import { TerrainUserSettings } from '../../Settings/TerrainUserSettings';
import { GpwsEvents } from '../GPWS/GpwsEvents';

/** TAWs audio alert implementation. */
export class TawsAlert implements Instrument {
  private readonly fltaCautionEvent: Accessible<string | undefined>;
  private readonly fltaWarningEvent: Accessible<string | undefined>;

  private readonly repeatingAurals: RepeatingAural[] = [];

  private readonly simDuration = ConsumerValue.create(this.bus.getSubscriber<ClockEvents>().on('activeSimDuration'), 0);

  /**
   * Ctor.
   * @param bus The event bus to use.
   * @param soundController The sound server controller to use.
   * @param isPowered Whether the instrument is powered.
   * @param ifdOptions The IFD configuration options.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly soundController: SoundServerController,
    private readonly isPowered: Subscribable<boolean>,
    private readonly ifdOptions: Readonly<IfdOptions>,
  ) {
    const tawsSettings = TerrainUserSettings.getManager(this.bus);

    if (this.ifdOptions.audio.cautionTerrainEvent && this.ifdOptions.audio.terrainAheadEvent) {
      this.fltaCautionEvent = tawsSettings.getSetting('terrainCautionAlternateAural').map((v) => v ? this.ifdOptions.audio.terrainAheadEvent : this.ifdOptions.audio.cautionTerrainEvent);
    } else if (this.ifdOptions.audio.terrainAheadEvent) {
      this.fltaCautionEvent = Value.create(this.ifdOptions.audio.terrainAheadEvent);
    } else {
      this.fltaCautionEvent = Value.create(this.ifdOptions.audio.cautionTerrainEvent);
    }

    if (this.ifdOptions.audio.terrainPullUpEvent && this.ifdOptions.audio.terrainTerrainEvent) {
      this.fltaWarningEvent = tawsSettings.getSetting('terrainWarningAlternateAural').map((v) => v ? this.ifdOptions.audio.terrainTerrainEvent : this.ifdOptions.audio.terrainPullUpEvent);
    } else if (this.ifdOptions.audio.terrainTerrainEvent) {
      this.fltaWarningEvent = Value.create(this.ifdOptions.audio.terrainTerrainEvent);
    } else {
      this.fltaWarningEvent = Value.create(this.ifdOptions.audio.terrainPullUpEvent);
    }
  }

  /** @inheritdoc */
  public init(): void {
    const sub = this.bus.getSubscriber<GpwsEvents>();

    if (this.ifdOptions.enableFlta) {
      const fltaCautionEvent = this.fltaCautionEvent.get();
      if (fltaCautionEvent) {
        sub.on('gpws_terrain_caution').handle((v) => v && this.isPowered.get() && this.soundController.playSound(fltaCautionEvent));
      }

      const fltaWarningEvent = this.fltaWarningEvent.get();
      if (fltaWarningEvent) {
        sub.on('gpws_terrain_warning').handle((v) => v && this.isPowered.get() && this.soundController.playSound(fltaWarningEvent));
      }
    }

    if (this.ifdOptions.enableTaws && this.ifdOptions.airframeType !== IfdAirframeType.Helicopter) {
      if (this.ifdOptions.audio.sinkRateEvent) {
        const sinkRateActive = ConsumerValue.create(sub.on('gpws_sink_rate'), false);
        this.repeatingAurals.push(new RepeatingAural(this.soundController, this.isPowered, this.ifdOptions.audio.sinkRateEvent, sinkRateActive));
      }

      if (this.ifdOptions.audio.dontSinkEvent) {
        const dontSinkActive = ConsumerValue.create(sub.on('gpws_dont_sink'), false);
        this.repeatingAurals.push(new RepeatingAural(this.soundController, this.isPowered, this.ifdOptions.audio.dontSinkEvent, dontSinkActive));
      }

      if (this.ifdOptions.audio.pullUpPullUpEvent) {
        const pullUpActive = ConsumerValue.create(sub.on('gpws_excessive_descent_rate'), false);
        this.repeatingAurals.push(new RepeatingAural(this.soundController, this.isPowered, this.ifdOptions.audio.pullUpPullUpEvent, pullUpActive));
      }

      if (this.ifdOptions.audio.tooLowTerrainEvent) {
        const tooLowTerrain = ConsumerValue.create(sub.on('gpws_premature_descent'), false);
        this.repeatingAurals.push(new RepeatingAural(this.soundController, this.isPowered, this.ifdOptions.audio.tooLowTerrainEvent, tooLowTerrain));
      }
    }
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const simDuration = this.simDuration.get();

    for (let i = 0; i < this.repeatingAurals.length; i++) {
      this.repeatingAurals[i].onUpdate(simDuration);
    }
  }
}

/** An aural that repeats at regular intervals when active. */
class RepeatingAural {
  private lastPlayed = 0;

  /**
   * Constructs a new instance.
   * @param soundController The sound controller to use.
   * @param isEnabled Whether audio output is enabled.
   * @param wwiseEvent The wwise event to play.
   * @param isActive Whether the event is active.
   * @param period The period to repeat the aural in ms.
   */
  constructor(
    private readonly soundController: SoundServerController,
    private readonly isEnabled: Subscribable<boolean>,
    private readonly wwiseEvent: string | Accessible<string>,
    private readonly isActive: Accessible<boolean>,
    private readonly period = 6_000,
  ) { }

  /**
   * Updates the repeating aural.
   * @param timestamp The current monotonic timestamp.
   */
  public onUpdate(timestamp: number): void {
    if (this.isActive.get() && this.isEnabled.get()) {
      if (this.lastPlayed + this.period <= timestamp) {
        this.lastPlayed = timestamp;
        this.soundController.playSound(AccessibleUtils.isAccessible(this.wwiseEvent) ? this.wwiseEvent.get() : this.wwiseEvent);
      }
    } else {
      this.lastPlayed = 0;
    }
  }
}

// TODO prio?
/** Enum documenting the priority of various GPWS alert aurals. Lower numbers are higher priority. */
// export enum GpwsAlertPriority {
//   Mode1PullUp = 1,
//   // Mode2PullUp = 2,
//   TerrainAwarenessPullUp = 3,
//   // Mode2Terrain = 4,
//   // Mode6Minimums = 5,
//   TerrainAwarenessCaution = 6,
//   // Mode4TooLowTerrain = 7,
//   // TerrainClearanceFloorTooLowTerrain = 8,
//   // Mode6AltitudeCallouts = 9,
//   Mode1Sinkrate = 12,
//   Mode3DontSink = 13,
//   Mode5Glideslope = 14,
// }

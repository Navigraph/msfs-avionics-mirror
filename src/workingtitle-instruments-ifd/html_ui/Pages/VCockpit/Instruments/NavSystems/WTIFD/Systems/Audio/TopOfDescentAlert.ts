import {
  EventBus, Instrument, MappedSubject, SoundServerController, Subscribable, SubscribableMapFunctions, VNavEvents, VNavPathMode, VNavUtils
} from '@microsoft/msfs-sdk';

import { IfdAudioOptions } from '../../IfdOptions';
import { AlertUserSettings } from '../../Settings/AlertUserSettings';

/** The top of descent chime alert. */
export class TopOfDescentAlert implements Instrument {
  private readonly isEnabled = MappedSubject.create(
    SubscribableMapFunctions.and(),
    AlertUserSettings.getManager(this.bus).getSetting('topOfDescentChime'),
    this.isPowered,
  );

  /**
   * Ctor.
   * @param bus The event bus to use.
   * @param soundController The sound server controller to use.
   * @param isPowered Whether the instrument is powered.
   * @param options The audio configuration options.
   * @param vnavIndex The VNAV index to use.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly soundController: SoundServerController,
    private readonly isPowered: Subscribable<boolean>,
    private readonly options: Readonly<IfdAudioOptions>,
    private readonly vnavIndex: number,
  ) { }

  /** @inheritdoc */
  public init(): void {
    if (this.options.topOfDescentEvent) {
      this.bus.getSubscriber<VNavEvents>().on(`vnav_path_mode${VNavUtils.getEventBusTopicSuffix(this.vnavIndex)}`).handle(this.handleVnavPathModeChange);
    }
  }

  /** @inheritdoc */
  public onUpdate(): void { }

  /**
   * Handles changes to the VNAV path mode.
   * @param mode The new path mode.
   */
  private handleVnavPathModeChange = (mode: VNavPathMode): void => {
    if (this.isEnabled.get() && mode === VNavPathMode.PathActive) {
      this.soundController.playSound(this.options.topOfDescentEvent!);
    }
  };
}

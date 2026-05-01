import { ConsumerSubject, EventBus, FSComponent, MappedSubject, Subject, Subscribable } from '@microsoft/msfs-sdk';

import { IfdOptions } from '../../IfdOptions';
import { SvsUserSettings } from '../../Settings/SvsUserSettings';
import { DataSidebar } from '../../Sidebar/DataSidebar';
import { ArsSystemEvents } from '../../Systems/ArsSystem';
import { IfdViewService } from '../../ViewService';
import { SvsMode } from './SvsTypes';

/**
 * Controls screen size, screen-related ratios, and projections
 * of the IFD SVS screen.
 */
export class IfdSvsController {
  public static readonly ARTIFICIAL_HORIZON_WIDTH = 494;
  public static readonly ARTIFICIAL_HORIZON_WIDTH_FULLSCREEN = 640;
  public static readonly ARTIFICIAL_HORIZON_WIDTH_NARROW = 353; // pixels, to account for the right DATA sidebar
  public static readonly ARTIFICIAL_HORIZON_HEIGHT = 450;
  public static readonly ARTIFICIAL_HORIZON_HEIGHT_FULLSCREEN = 480;

  public static readonly SVS_OFF_FIXED_FOV = 80;
  public static readonly SYN_VIS_MAX_FOV = 120;
  public static readonly SYN_VIS_MIN_FOV = 10;

  public static readonly CLAMP_PITCH_MAX = 85;
  public static readonly CLAMP_PITCH_MIN = -85;

  /** Co-efficient that can be multiplied by FOV to get the max pitch up before SVS mode switches off. */
  public static readonly MAX_SVS_MODE_PITCH_UP_COEF = -17.5 / 45;
  /** Co-efficient that can be multiplied by FOV to get the max pitch down before SVS mode switches off. */
  public static readonly MAX_SVS_MODE_PITCH_DOWN_COEF = 20 / 45;

  public readonly isSvsFullscreen = this.viewService.isSvsFullscreen as Subscribable<boolean>;
  public readonly synVisMode = Subject.create<SvsMode>(SvsMode.Off);
  public readonly fieldOfView: Subscribable<number> = SvsUserSettings.getManager(this.bus).getSetting('svsFieldOfView');

  private readonly pitch = ConsumerSubject.create(this.bus.getSubscriber<ArsSystemEvents>().on('ars_actual_pitch_deg'), 0);

  public readonly svsEnabled: Subscribable<boolean> = this.synVisMode.map((mode) => mode === SvsMode.On || mode === SvsMode.Fpl);

  // SVS disables when pitching above a certain angle (depending on FoV) to keep the ground in view on the normal AHI.
  // It does not do this when pitching down, but instead clamps the sky/blue overlay so it doesn't go out of view,
  // but the bing component doesn't support that so we don't do it.

  /** Whether SVS is actually active. It is de-activated at extreme pitch up attitudes to keep the ground in view. */
  public readonly svsActive: Subscribable<boolean> = MappedSubject.create(
    ([mode, pitch, fov]) => (mode === SvsMode.On || mode === SvsMode.Fpl) && pitch >= IfdSvsController.MAX_SVS_MODE_PITCH_UP_COEF * fov,
    this.synVisMode,
    this.pitch,
    this.fieldOfView,
  );

  public readonly dataSidebarRef = FSComponent.createRef<DataSidebar>();

  public readonly isSidebarVisible = Subject.create(false);
  public readonly isSidebarVisibleDelayed = Subject.create(false);
  public readonly isSidebarVisibleDelayedAndNotFullscreen = MappedSubject.create(
    ([isSidebarVisibleDelayed, isFullscreen]): boolean => isSidebarVisibleDelayed && !isFullscreen,
    this.isSidebarVisibleDelayed,
    this.viewService.isSvsFullscreen
  );
  public readonly isSidebarVisibleAndNotFullscreen = MappedSubject.create(
    ([isSidebarVisible, isFullscreen]): boolean => isSidebarVisible && !isFullscreen,
    this.isSidebarVisible,
    this.viewService.isSvsFullscreen
  );

  public readonly ifdHorizonWidth = MappedSubject.create(
    ([isFullscreen, isNarrowWithSidebar]) => {
      if (isFullscreen) {
        return IfdSvsController.ARTIFICIAL_HORIZON_WIDTH_FULLSCREEN;
      }

      if (isNarrowWithSidebar) {
        return IfdSvsController.ARTIFICIAL_HORIZON_WIDTH_NARROW;
      }

      return IfdSvsController.ARTIFICIAL_HORIZON_WIDTH;
    },
    this.isSvsFullscreen,
    this.isSidebarVisibleDelayed,
  );

  public readonly ifdHorizonHeight = MappedSubject.create(
    ([isFullscreen]) => isFullscreen
      ? IfdSvsController.ARTIFICIAL_HORIZON_HEIGHT_FULLSCREEN
      : IfdSvsController.ARTIFICIAL_HORIZON_HEIGHT,
    this.isSvsFullscreen,
  );

  /**
   * The constructor
   * @param bus The event bus to use.
   * @param options The IfdOptions
   * @param viewService The IfdViewService
   */
  constructor(
    private readonly bus: EventBus,
    private readonly options: IfdOptions,
    private readonly viewService: IfdViewService,
  ) {
    this.options.svsFullScreen && this.synVisMode.set(SvsMode.On);
  }
}

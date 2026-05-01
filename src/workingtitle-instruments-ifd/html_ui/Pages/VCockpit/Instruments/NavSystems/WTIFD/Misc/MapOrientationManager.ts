import { ConsumerValue, EventBus, Subject } from '@microsoft/msfs-sdk';

import { MapOrientationSettingMode, MapUserSettings } from '../Settings/MapUserSettings';
import { ExternalHeadingSystemEvents } from '../Systems/ExternalHeadingSystem';
import { IfdPowerEvents } from './IfdPowerMonitor';

/** Events for the map orientation manager. */
export interface MapOrientationManagerEvents {
  /** Whether heading up mode is available. */
  map_orientation_heading_up_available: boolean;
}

/** Manages the availability of heading up map mode. */
export class MapOrientationManager {
  private headingBecameValidTime = 0;

  private readonly headingValid = ConsumerValue.create(null, false);

  /**
   * Contructor.
   * @param bus The event bus to use.
   */
  constructor(bus: EventBus) {
    const sub = bus.getSubscriber<ExternalHeadingSystemEvents & IfdPowerEvents>();

    this.headingValid.setConsumer(sub.on('ext_hdg_heading_data_valid'));

    const headingUpAvail = Subject.create(true);

    // If heading up is unavail and the map is set to that, change to track up.
    const setting = MapUserSettings.getManager(bus).getSetting('mapOrientation');
    headingUpAvail.sub((v) => !v && setting.get() === MapOrientationSettingMode.HeadingUp && setting.set(MapOrientationSettingMode.TrackUp));

    // Heading up is available for the first 30 seconds after power on (while waiting for a heading input),
    // and then after any time a valid heading input has been present for 10 seconds or more.
    // Hint: it's never available after the first 30 seconds if no heading source is connected in the installation.
    sub.on('ifd_powered_on_time').handle((time) => {
      if (this.headingValid.get()) {
        if (!this.headingBecameValidTime) {
          this.headingBecameValidTime = time;
        }
      } else {
        this.headingBecameValidTime = 0;
      }

      headingUpAvail.set((this.headingBecameValidTime && time > (this.headingBecameValidTime + 10)) || time < 30);
    });

    const publisher = bus.getPublisher<MapOrientationManagerEvents>();
    headingUpAvail.sub((v) => publisher.pub('map_orientation_heading_up_available', v, false, true));
  }
}

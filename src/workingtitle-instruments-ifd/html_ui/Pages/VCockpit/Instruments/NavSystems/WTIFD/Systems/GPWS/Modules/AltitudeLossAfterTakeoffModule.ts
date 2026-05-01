import { EventBus, LerpLookupTable } from '@microsoft/msfs-sdk';

import { GpwsEvents } from '../GpwsEvents';
import { GpwsData, GpwsModule } from '../GpwsModule';
import { GpwsOperatingMode } from '../GpwsTypes';

/**
 * A GPWS module which handles Mode 3 Altitude Loss after Takeoff alerts.
 */
export class AltitudeLossAfterTakeoffModule implements GpwsModule {
  /** Mapping accumulated altitude loss (ft) to min AGL height (ft). */
  private static readonly ALTITUDE_LOSS_REGION = new LerpLookupTable([[50, 25], [600, 80], [600, 300], [Infinity, 600.1]]);

  /** Mapping AGL altitude (feet) to max sink rate (FPM). */
  private static readonly NEGATIVE_CLIMB_RATE_REGION = new LerpLookupTable([[-100, 0], [-100, 50], [-500, 600], [-Infinity, 600.1]]);

  private readonly publisher = this.bus.getPublisher<GpwsEvents>();

  private isModeActive = false;
  private peakAltitude: number | null = null;

  private warningActive = false;
  private prevTakeoffState = false;

  /**
   * Creates a new instance of AltitudeLossAfterTakeoffModule.
   * @param bus The event bus.
   */
  constructor(private readonly bus: EventBus) {
  }

  /** @inheritdoc */
  public onInit(): void { }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onUpdate(operatingMode: GpwsOperatingMode, data: Readonly<GpwsData>, realTime: number): void {
    if (data.isOnGround || (data.isTakeoff && this.prevTakeoffState !== data.isTakeoff)) {
      this.isModeActive = true;
    }

    if (data.aglAltitude > 600) {
      this.isModeActive = false;
      this.peakAltitude = null;
    }

    this.prevTakeoffState = data.isTakeoff;
    if (operatingMode !== GpwsOperatingMode.Normal || data.isOnGround || !data.isAglAltitudeValid || data.aglAltitude < 50 || data.aglAltitude > 600 || !this.isModeActive) {
      this.publisher.pub('gpws_dont_sink', false, false, true);

      return;
    }

    this.peakAltitude = Math.max(data.aglAltitude, this.peakAltitude ?? 0);

    const minAglHeight = AltitudeLossAfterTakeoffModule.ALTITUDE_LOSS_REGION.get(this.peakAltitude - data.aglAltitude);

    const shouldTrigger = data.geoVerticalSpeed < AltitudeLossAfterTakeoffModule.NEGATIVE_CLIMB_RATE_REGION.get(data.aglAltitude) || data.aglAltitude < minAglHeight;

    this.warningActive = shouldTrigger || (this.warningActive && data.aglAltitude < this.peakAltitude);

    this.publisher.pub('gpws_dont_sink', this.warningActive, false, true);
  }

  /** @inheritdoc */
  public onDestroy(): void {
    // noop
  }
}

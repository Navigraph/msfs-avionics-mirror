import { EventBus, LerpLookupTable } from '@microsoft/msfs-sdk';

import { GpwsEvents } from '../GpwsEvents';
import { GpwsData, GpwsModule } from '../GpwsModule';
import { GpwsOperatingMode } from '../GpwsTypes';

/**
 * A GPWS module which handles Mode 1 Excessive Descent Rate callouts.
 */
export class ExcessiveDescentRateModule implements GpwsModule {
  /** Mapping AGL altitude (ft) to VS (fpm). */
  private static readonly SINKRATE_WARNING_REGION = new LerpLookupTable([[-1400, 100], [-2200, 1300], [-12000, 4500], [-Infinity, 4500.1]]);
  /** Mapping AGL altitude (ft) to VS (fpm). */
  private static readonly PULL_UP_WARNING_REGION = new LerpLookupTable([[-1600, 100], [-2400, 1000], [-12000, 4000], [-Infinity, 4000.1]]);

  private readonly publisher = this.bus.getPublisher<GpwsEvents>();

  private lastSinkrateTimeToImpact: number | null = null;

  /**
   * Creates a new instance of TouchdownCalloutModule.
   * @param bus The event bus.
   */
  constructor(private readonly bus: EventBus) { }

  /** @inheritdoc */
  public onInit(): void { }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onUpdate(operatingMode: GpwsOperatingMode, data: Readonly<GpwsData>, realTime: number): void {
    if (operatingMode !== GpwsOperatingMode.Normal || data.isOnGround || !data.isAglAltitudeValid || data.aglAltitude < 100 || data.aglAltitude > 4500) {
      this.publisher.pub('gpws_excessive_descent_rate', false, false, true);
      this.publisher.pub('gpws_sink_rate', false, false, true);
      return;
    }

    const pullUpActive = this.getWarningActive(ExcessiveDescentRateModule.PULL_UP_WARNING_REGION, data);
    this.publisher.pub('gpws_excessive_descent_rate', pullUpActive, false, true);

    if (!pullUpActive) {
      const sinkrateActive = this.getWarningActive(ExcessiveDescentRateModule.SINKRATE_WARNING_REGION, data);

      if (sinkrateActive) {
        const timeToImpact = Math.abs(data.aglAltitude / data.geoVerticalSpeed);
        if (this.lastSinkrateTimeToImpact === null || timeToImpact < 0.8 * this.lastSinkrateTimeToImpact) {
          this.publisher.pub('gpws_sink_rate', false, false, true);
          this.publisher.pub('gpws_sink_rate', true, false, true);

          this.lastSinkrateTimeToImpact = timeToImpact;
        }
      } else {
        this.publisher.pub('gpws_sink_rate', false, false, true);
      }
    } else {
      this.publisher.pub('gpws_sink_rate', false, false, true);
    }
  }

  /**
   * Determines if a warning should be active
   * @param warningRegion The region in which the warning is activated
   * @param data The GPWS data
   * @returns True if the warning is active
   */
  private getWarningActive(warningRegion: LerpLookupTable, data: Readonly<GpwsData>): boolean {
    const sinkrateFpm = warningRegion.get(data.aglAltitude);

    return data.geoVerticalSpeed < sinkrateFpm;
  }

  /** @inheritdoc */
  public onDestroy(): void {
    // noop
  }
}

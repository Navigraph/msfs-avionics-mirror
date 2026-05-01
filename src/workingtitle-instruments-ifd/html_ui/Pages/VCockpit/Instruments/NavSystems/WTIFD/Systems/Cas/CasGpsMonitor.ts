import { ConsumerSubject, EventBus, Instrument, MappedSubject } from '@microsoft/msfs-sdk';

import { FmsPositionMode, FmsPositionSystemEvents } from '../FmsPositionSystem';
import { GnssNavigationState, GnssReceiverEvents } from '../Gnss/GnssTypes';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** CAS GPS alert monitor. */
export class CasGpsMonitor implements Instrument {
  private static readonly VALID_GNSS_STATES = [GnssNavigationState.BasicNav, GnssNavigationState.FdeNav, GnssNavigationState.SbasNav];

  private readonly gnssFailedTransporter = casTransporterFactory(this.bus, CasUuid.GpsFault);
  private readonly gnssIntegrityTransporter = casTransporterFactory(this.bus, CasUuid.GpsIntegrityLost);
  private readonly noPositionTransporter = casTransporterFactory(this.bus, CasUuid.NoPosition);
  private readonly deadReckoningTranspoter = casTransporterFactory(this.bus, CasUuid.DeadReckoning);

  private gnssStateWasHealthy = false;
  private readonly gnssState = ConsumerSubject.create<GnssNavigationState | null>(null, null);

  private gnssIntegrityWasHealthy = false;
  private readonly gnssHal = ConsumerSubject.create<number | null>(null, null);
  private readonly gnssHpl = ConsumerSubject.create<number | null>(null, null);

  private readonly fmsPosMode = ConsumerSubject.create<FmsPositionMode>(null, FmsPositionMode.None);

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   */
  constructor(private readonly bus: EventBus) { }

  /** @inheritdoc */
  public init(): void {
    const sub = this.bus.getSubscriber<FmsPositionSystemEvents & GnssReceiverEvents>();

    this.gnssState.setConsumer(sub.on('gnss_navigation_state'));
    this.gnssState.sub((v) => {
      const gnssIsHealthy = v !== null && CasGpsMonitor.VALID_GNSS_STATES.includes(v);
      if (gnssIsHealthy) {
        this.gnssFailedTransporter.set(false);
      } else if (this.gnssStateWasHealthy) {
        this.gnssFailedTransporter.set(true);
      }
      this.gnssStateWasHealthy = gnssIsHealthy;
    }, true);

    MappedSubject.create(this.gnssHal, this.gnssHpl).sub(([hal, hpl]) => {
      const gnssIntegrityIsHealthy = hal !== null && hpl !== null && hal > hpl;
      if (gnssIntegrityIsHealthy) {
        this.gnssIntegrityTransporter.set(false);
      } else if (this.gnssIntegrityWasHealthy) {
        this.gnssIntegrityTransporter.set(true);
      }
      this.gnssStateWasHealthy = gnssIntegrityIsHealthy;
    }, true);

    this.gnssHal.setConsumer(sub.on('gnss_hal_m'));
    this.gnssHpl.setConsumer(sub.on('gnss_hpl_m'));

    this.noPositionTransporter.bind(this.fmsPosMode, (m) => m === FmsPositionMode.DeadReckoningExpired);
    this.deadReckoningTranspoter.bind(this.fmsPosMode, (m) => m === FmsPositionMode.DeadReckoning);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    // noop
  }
}

import { EventBus, Instrument, Subject, UnitType } from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../FlightPlan';
import { IfdVnavManager, IfdVnavState } from '../../Navigation/Vnav/IfdVnavManager';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** Monitors vertical navigation data and triggers CAS events. */
export class CasVerticalNavigationMonitor implements Instrument {
  private static readonly BEGIN_DESCENT_TIME = 10;

  private readonly beginDescentMonitor = casTransporterFactory(this.bus, CasUuid.BeginDescent);
  private readonly suspendedXtkLimitMonitor = casTransporterFactory(this.bus, CasUuid.VnavSuspendedXtkLimit);
  private readonly suspendedDtkLimitMonitor = casTransporterFactory(this.bus, CasUuid.VnavSuspendedCourseLimit);
  private readonly terminatedAltiConstraintMonitor = casTransporterFactory(this.bus, CasUuid.VnavTerminatedAltiConstraint);

  private readonly beginDescentState = Subject.create(false);
  private readonly suspendedXtkLimitState = Subject.create(false);
  private readonly suspendedDtkLimitState = Subject.create(false);
  private readonly terminatedAltiConstraintState = Subject.create(false);

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param store The flight plan store to use.
   * @param vnavManager The VNAV manager to use.
   */
  constructor(private readonly bus: EventBus, private readonly store: FlightPlanStore, private readonly vnavManager: IfdVnavManager) { }

  /** @inheritdoc */
  init(): void {
    this.beginDescentMonitor.bind(this.beginDescentState);
    this.suspendedXtkLimitMonitor.bind(this.suspendedXtkLimitState);
    this.suspendedDtkLimitMonitor.bind(this.suspendedDtkLimitState);
    this.terminatedAltiConstraintMonitor.bind(this.terminatedAltiConstraintState);
  }

  /** @inheritdoc */
  onUpdate(): void {
    const vnavState = this.vnavManager.getState();
    if (vnavState === IfdVnavState.Inactive || vnavState === IfdVnavState.Active) {
      this.beginDescentState.set(false);
      this.suspendedDtkLimitState.set(false);
      this.suspendedXtkLimitState.set(false);
      this.terminatedAltiConstraintState.set(false);
    } else if (vnavState === IfdVnavState.Armed) {
      this.suspendedDtkLimitState.set(false);
      this.suspendedXtkLimitState.set(false);
      this.terminatedAltiConstraintState.set(false);

      const todTimeToGo = this.store.todTimeToGo.get().asUnit(UnitType.SECOND);
      this.beginDescentState.set(todTimeToGo > 0 && Math.round(todTimeToGo) <= CasVerticalNavigationMonitor.BEGIN_DESCENT_TIME);
    } else if (vnavState === IfdVnavState.Flagged) {
      this.beginDescentState.set(false);
      this.terminatedAltiConstraintState.set(false);

      this.suspendedXtkLimitState.set(!this.vnavManager.isWithinXtkLimit.get());
      this.suspendedDtkLimitState.set(!this.suspendedXtkLimitState.get() && !this.vnavManager.isWithinDtkLimit.get());
    } else if (vnavState === IfdVnavState.Terminated) {
      this.beginDescentState.set(false);
      this.suspendedDtkLimitState.set(false);
      this.suspendedXtkLimitState.set(false);

      this.terminatedAltiConstraintState.set(true);
    }
  }
}

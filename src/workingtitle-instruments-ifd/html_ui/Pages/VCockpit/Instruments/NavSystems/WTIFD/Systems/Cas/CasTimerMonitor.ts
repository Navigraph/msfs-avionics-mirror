import { EventBus, Instrument } from '@microsoft/msfs-sdk';

import { TimerManager } from '../Timer/TimerManager';
import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** CAS custom timer system alert monitor. */
export class CasTimerMonitor implements Instrument {
  private static readonly casUuidMap = [
    CasUuid.TimerCustom1Expired,
    CasUuid.TimerCustom2Expired,
    CasUuid.TimerCustom3Expired,
    CasUuid.TimerCustom4Expired,
    CasUuid.TimerCustom5Expired,
    CasUuid.TimerCustom6Expired,
    CasUuid.TimerCustom7Expired,
    CasUuid.TimerCustom8Expired,
    CasUuid.TimerCustom9Expired,
    CasUuid.TimerCustom10Expired,
  ] as const;

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param timerManager The timer manager to use.
   */
  constructor(private readonly bus: EventBus, private readonly timerManager: TimerManager) { }

  /** @inheritdoc */
  public init(): void {
    for (let i = 0; i < this.timerManager.customTimers.length; i++) {
      const uuid = CasTimerMonitor.casUuidMap[i];
      if (uuid) {
        const transporter = casTransporterFactory(this.bus, uuid, true);
        this.timerManager.customTimers[i].isExpired.sub((v) => transporter.set(v));
      } else {
        console.error('Timer manager custom timer list doesn\'t match with CasTimerMonitor');
      }
    }
  }

  /** @inheritdoc */
  public onUpdate(): void { }
}

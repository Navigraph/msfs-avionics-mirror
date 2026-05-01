import { ConsumerSubject, EventBus, LNavUtils, MathUtils, Subject, Subscribable, UnitType } from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../FlightPlan';
import { IfdOptions } from '../../IfdOptions';
import { LNavDataEvents } from '../../Navigation/LNavDataEvents';
import { FmsUserSettings } from '../../Settings/FmsUserSettings';
import { TimerManager } from '../Timer/TimerManager';
import { CasAirspaceMonitorEvents } from './CasAirspaceMonitor';
import { CasMessageDataSources } from './CasMessages';

/** Data sources used for formatting CAS messages. */
export class CasMessageDataSource implements CasMessageDataSources {
  private readonly sub = this.bus.getSubscriber<CasAirspaceMonitorEvents & LNavDataEvents>();

  // TODO
  public readonly powerDownTimer = Subject.create(60);

  // fms data
  private readonly fmsSettings = FmsUserSettings.getManager(this.bus);

  public readonly transitionAltitude: Subscribable<number> = this.fmsSettings.getSetting('transitionAltitude');
  public readonly transitionLevel: Subscribable<number> = this.fmsSettings.getSetting('transitionLevel');

  // navigation data
  private readonly _activeLegDesiredTrack = ConsumerSubject.create(this.sub.on(`lnavdata_dtk_mag${LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex)}`), NaN);
  public readonly activeLegDesiredTrack: Subscribable<number> = this._activeLegDesiredTrack.map((v) => MathUtils.round(v, 1));
  private readonly _activeLegEgressEte = ConsumerSubject.create(this.sub.on(`lnavdata_egress_ete${LNavUtils.getEventBusTopicSuffix(this.ifdOptions.lnavIndex)}`), NaN);
  public readonly activeLegEgressEte: Subscribable<number> = this._activeLegEgressEte.map((v) => MathUtils.round(v, 1));

  private readonly _nextLegDesiredTrack = Subject.create(NaN);
  public readonly nextLegDesiredTrack: Subscribable<number> = this._nextLegDesiredTrack;

  private readonly _todTimeToGoSeconds = Subject.create(0);
  public readonly todTimeToGoSeconds: Subscribable<number> = this._todTimeToGoSeconds;

  private readonly _airspaceAheadLowerAlt = ConsumerSubject.create(this.sub.on('cas_airspace_monitor_min_alt'), undefined);
  public readonly airspaceAheadLowerAlt: Subscribable<number | undefined> = this._airspaceAheadLowerAlt;
  private readonly _airspaceaheadUpperAlt = ConsumerSubject.create<number | undefined>(this.sub.on('cas_airspace_monitor_max_alt'), undefined);
  public readonly airspaceaheadUpperAlt: Subscribable<number | undefined> = this._airspaceaheadUpperAlt;
  private readonly _airspaceAheadClass = ConsumerSubject.create(this.sub.on('cas_airspace_monitor_class'), 'Airspace');
  public readonly airspaceAheadClass: Subscribable<string> = this._airspaceAheadClass;
  private readonly _airspaceAheadName = ConsumerSubject.create(this.sub.on('cas_airspace_monitor_name'), 'Airspace');
  public readonly airspaceAheadName: Subscribable<string> = this._airspaceAheadName;

  // timer data
  public readonly customTimerName1 = this.timerManager.customTimers[0].name;
  public readonly customTimerName2 = this.timerManager.customTimers[1].name;
  public readonly customTimerName3 = this.timerManager.customTimers[2].name;
  public readonly customTimerName4 = this.timerManager.customTimers[3].name;
  public readonly customTimerName5 = this.timerManager.customTimers[4].name;
  public readonly customTimerName6 = this.timerManager.customTimers[5].name;
  public readonly customTimerName7 = this.timerManager.customTimers[6].name;
  public readonly customTimerName8 = this.timerManager.customTimers[7].name;
  public readonly customTimerName9 = this.timerManager.customTimers[8].name;
  public readonly customTimerName10 = this.timerManager.customTimers[9].name;

  // traffic data
  /** TODO implement traffic advisories. */
  public readonly trafficAdvisoryDescription: Subscribable<string> = Subject.create('Traffic 4NM -200FT');
  public readonly trafficAdvisoryMessage: Subscribable<string> = Subject.create('Traffic\nLow 4NM');

  /**
   * Constructors a new instance of CasMessageDataSource.
   * @param bus The event bus.
   * @param store The flight plan store to use.
   * @param timerManager The timer manager to use.
   * @param ifdOptions The instrument config to use.
   */
  constructor(private readonly bus: EventBus, private readonly store: FlightPlanStore, private readonly timerManager: TimerManager, private readonly ifdOptions: IfdOptions) {
    this.store.nextLegDtkMag.pipe(this._nextLegDesiredTrack, (v) => v.asUnit(this.store.aircraftNavAngleMagneticUnit));

    this.store.todTimeToGo.pipe(this._todTimeToGoSeconds, (v) => v.asUnit(UnitType.SECOND));
  }
}

import { EventBus, Instrument, RegisteredSimVarUtils, SimVarValueType } from '@microsoft/msfs-sdk';

import { CasUuid } from './CasUuid';
import { casTransporterFactory } from './IfdCasAlertTransporter';

/** CAS radio alert monitor. */
export class CasRadioMonitor implements Instrument {
  private readonly noCommVhfTransporter = casTransporterFactory(this.bus, CasUuid.NoCommWithVhf);
  private readonly noCommXpdrTransporter = casTransporterFactory(this.bus, CasUuid.NoCommWithXpdr);

  private readonly vhfComStatusVar = RegisteredSimVarUtils.create(`COM STATUS:${this.comIndex}`, SimVarValueType.Enum);
  private readonly xpdrPowerOn = RegisteredSimVarUtils.createBoolean('CIRCUIT TRANSPONDER ON:1');

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param comIndex The COM radio index to monitor.
   */
  constructor(private readonly bus: EventBus, private readonly comIndex: number) { }

  /** @inheritdoc */
  public init(): void {
    // noop
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.noCommVhfTransporter.set(this.vhfComStatusVar.get() !== 0); // 0 = OK
    this.noCommXpdrTransporter.set(!this.xpdrPowerOn.get());
  }
}

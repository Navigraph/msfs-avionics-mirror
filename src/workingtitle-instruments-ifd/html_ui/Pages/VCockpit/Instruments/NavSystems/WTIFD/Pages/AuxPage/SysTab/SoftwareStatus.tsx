import { ClassProp, ClockEvents, ConsumerSubject, DateTimeFormatter, DisplayComponent, EventBus, FSComponent, MappedSubject, VNode } from '@microsoft/msfs-sdk';

import { IfdAirframeType, IfdInstrumentType, IfdOptions } from '../../../IfdOptions';

import './SysTab.css';

export enum SoftwareOptions {
  /** VIDEO tab on the map subsystem. */
  VID = 'VID',
  /** SVS (standard on IFD550). */
  SVS = 'SVS',
  /** 16W comm radio (28 V aircraft only). */
  _16W = '16W',
  /** Helicopter. */
  HELO = 'HELO',
  /** Weather radar. */
  RDR = 'RDR',
  /** FLTA + 500 callout. */
  F500 = 'F500',
  /** Search and rescue patterns. */
  SAR = 'SAR',
  /** GPS legacy avionics supports for bizjets. */
  GLAS = 'GLAS',
  /** Terrain awareness and warning (class B). */
  TAWS = 'TAWS',
  /** WiFi. */
  ENET_IO = 'ENET/IO',
  /** Bluetooth. */
  BT = 'BT',
  /** Wifi connected ADS-B input. */
  PORTS = 'PORTS',
}

/** The properties for the {@link SoftwareStatus} component. */
interface SoftwareStatusProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The IFD configuration options. */
  readonly ifdOptions: IfdOptions;
  /** CSS classes to apply. */
  readonly class?: ClassProp,
}

/** The SoftwareStatus component. */
export class SoftwareStatus extends DisplayComponent<SoftwareStatusProps> {
  private readonly softwareVersion = '__IFD_PACKAGE_VERSION__';
  private readonly swPartNumber = 'WT IFD Simulation';
  private readonly serialNumber = '';
  private readonly systemId = this.props.ifdOptions.instrumentIndex.toFixed(0);

  private readonly simTimeMs = ConsumerSubject.create(this.props.bus.getSubscriber<ClockEvents>().on('simTime').atFrequency(1), 0);
  private readonly systemTime = MappedSubject.create(
    ([simTimeMs]) => DateTimeFormatter.create('{month} {d}, {YYYY} {HH}:{mm}:{ss}z')(simTimeMs),
    this.simTimeMs
  );

  private options: SoftwareOptions[] = [
    SoftwareOptions.VID,
    SoftwareOptions.SVS,
    SoftwareOptions._16W,
    SoftwareOptions.HELO,
    SoftwareOptions.RDR,
    SoftwareOptions.F500,
    SoftwareOptions.SAR,
    SoftwareOptions.GLAS,
    SoftwareOptions.TAWS,
    SoftwareOptions.ENET_IO,
    SoftwareOptions.BT,
    SoftwareOptions.PORTS,
  ];

  private activeOptions: SoftwareOptions[] = [
    SoftwareOptions._16W,
  ];

  /** @inheritdoc */
  public render(): VNode {
    if (this.props.ifdOptions.enableWxRadar) {
      this.activeOptions.push(SoftwareOptions.RDR);
    }

    if (
      this.props.ifdOptions.instrumentType === IfdInstrumentType.IFD550 ||
      this.props.ifdOptions.instrumentType === IfdInstrumentType.IFD550Custom
    ) {
      this.activeOptions.push(SoftwareOptions.SVS);
    }

    if (this.props.ifdOptions.enableFlta) {
      this.activeOptions.push(SoftwareOptions.F500);
    }
    if (this.props.ifdOptions.enableTaws) {
      this.activeOptions.push(SoftwareOptions.TAWS);
    }

    if (this.props.ifdOptions.airframeType === IfdAirframeType.Helicopter) {
      this.activeOptions.push(SoftwareOptions.HELO);
    }

    if (this.props.ifdOptions.enableWxRadar) {
      this.activeOptions.push(SoftwareOptions.RDR);
    }

    return (
      <div class={FSComponent.mergeCssClasses('sys-tab-sys-tab-software', this.props.class)}>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">S/W Ver:</div>
          <div class="sys-tab-column-data">{this.softwareVersion}</div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">S/W Part#:</div>
          <div class="sys-tab-column-data">{this.swPartNumber}</div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Sys Time:</div>
          <div class="sys-tab-column-data">{this.systemTime}</div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Serial#:</div>
          <div class="sys-tab-column-data">{this.serialNumber}</div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Sys ID:</div>
          <div class="sys-tab-column-data">{this.systemId}</div>
        </div>
        <div class="sys-tab-column-row">
          <div class="sys-tab-column-label sys-tab-sw-column-label">Options:</div>
          <div class="sys-tab-options-area">
            <div class="sys-tab-options-column">
              {this.options.map((opt, index) => {
                return index < 4 ? (
                  <div
                    class={{
                      'sys-tab-option': true,
                      'sys-tab-option-selected': this.activeOptions.includes(opt),
                    }}
                  >
                    {opt}
                  </div>
                ) : null;
              })}
            </div>
            <div class="sys-tab-options-column">
              {this.options.map((opt, index) => {
                return index > 3 && index < 8 ? (
                  <div
                    class={{
                      'sys-tab-option': true,
                      'sys-tab-option-selected': this.activeOptions.includes(opt),
                    }}
                  >
                    {opt}
                  </div>
                ) : null;
              })}
            </div>
            <div class="sys-tab-options-column">
              {this.options.map((opt, index) => {
                return index > 7 ? (
                  <div
                    class={{
                      'sys-tab-option': true,
                      'sys-tab-option-selected': this.activeOptions.includes(opt),
                    }}
                    style={{ 'font-family': opt === SoftwareOptions.ENET_IO ? 'Arial Narrow Bold' : 'Arial Bold' }}
                  >
                    {opt}
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>
        <div class="sys-tab-sw-disclaimer">Simulator is for system familiarization only and is not an approved training tool. Actual system behavior may vary.</div>
      </div>
    );
  }
}

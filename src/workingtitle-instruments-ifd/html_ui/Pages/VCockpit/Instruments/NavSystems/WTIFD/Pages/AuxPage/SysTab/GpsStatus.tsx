import {
  ArraySubject, ClassProp, ComponentProps, ConsumerSubject, DmsFormatter2, EventBus, FSComponent, LatLongInterface, LifecycleComponent, MappedSubject,
  MathUtils, MutableSubscribable, SortedMappedSubscribableArray, Subject, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { DynamicList } from '../../../Components/List';
import { FlightPlanStore } from '../../../FlightPlan';
import { GnssNavigationMode, GnssNavigationState, GnssReceiverEvents, GnssSatelliteData } from '../../../Systems/Gnss/GnssTypes';

import './GpsStatus.css';

/** Properties for the GPS Status page. */
interface GpsStatusProps {
  /** The event bus. */
  readonly bus: EventBus;
  /** The flight plan store to use */
  readonly flightPlanStore: FlightPlanStore,
  /** CSS classes to apply. */
  readonly class?: ClassProp,
}

/** List item data for a satellite. */
interface GnssSatelliteListData {
  /** The PRN number for this satellite. */
  readonly prn: number;
  /** The current satellite signal strength. */
  readonly signalStrength: MutableSubscribable<number>;
  /** Needed by DynamicList but unused. */
  readonly heightPx: number;
}

/** The GpsStatus component. */
export class GpsStatus extends LifecycleComponent<GpsStatusProps> {
  private readonly satelliteGraphRef = FSComponent.createRef<HTMLDivElement>();

  private readonly latFormatter = DmsFormatter2.create('{+[N]-[S]}{dd}°{mm}\'{ss}"', UnitType.ARC_SEC, 0.1, '---°--\'--"');
  private readonly lonFormatter = DmsFormatter2.create(' {+[E]-[W]}{ddd}°{mm}\'{ss}"', UnitType.ARC_SEC, 0.1, ' ----°--\'--"');

  private readonly navMode = ConsumerSubject.create<GnssNavigationMode | null>(null, null);
  private readonly halMeters = ConsumerSubject.create<number | null>(null, null);
  private readonly halNm = this.halMeters.map(
    (v) => v !== null && Number.isFinite(v) ? MathUtils.round(UnitType.NMILE.convertFrom(v, UnitType.METER), 0.1) : null,
  ).withLifecycle(this.defaultLifecycle);
  private readonly valMeters = ConsumerSubject.create<number | null>(null, null);
  private readonly valFeet = this.valMeters.map(GpsStatus.mapToFeetRounded).withLifecycle(this.defaultLifecycle);
  private readonly status = ConsumerSubject.create<GnssNavigationState | null>(null, null);
  private readonly position = ConsumerSubject.create<LatLongInterface>(null, { lat: NaN, long: NaN });
  private readonly positionString = this.position.map(
    (v) => this.latFormatter(v.lat !== null ? v.lat * 3600 : NaN) + this.lonFormatter(v.long !== null ? v.long * 3600 : NaN),
  ).withLifecycle(this.defaultLifecycle);
  private readonly gpsAltitudeFeet = ConsumerSubject.create<number | null>(null, null);
  private readonly gpsAltitudeFeetRounded = this.gpsAltitudeFeet.map((v) => v !== null ? Math.round(v) : v).withLifecycle(this.defaultLifecycle);
  private readonly hplMeters = ConsumerSubject.create<number | null>(null, null);
  private readonly hplFeet = this.hplMeters.map(GpsStatus.mapToFeetRounded).withLifecycle(this.defaultLifecycle);
  private readonly vplMeters = ConsumerSubject.create<number | null>(null, null);
  private readonly vplFeet = this.vplMeters.map(GpsStatus.mapToFeetRounded).withLifecycle(this.defaultLifecycle);
  private readonly hfomMeters = ConsumerSubject.create<number | null>(null, null);
  private readonly hfomFeet = this.hfomMeters.map(GpsStatus.mapToFeetRounded).withLifecycle(this.defaultLifecycle);
  private readonly vfomMeters = ConsumerSubject.create<number | null>(null, null);
  private readonly vfomFeet = this.vfomMeters.map(GpsStatus.mapToFeetRounded).withLifecycle(this.defaultLifecycle);

  private readonly referencePath = MappedSubject.create(
    ([airportFacility, app, apptransition]) => {
      const airportIdent = airportFacility?.icaoStruct.ident;
      return `${airportIdent ?? '----'} ${apptransition?.name ?? '-----'}.${app?.name ?? '-----'}            ---`;
    },
    this.props.flightPlanStore.destinationFacility,
    this.props.flightPlanStore.approachProcedure,
    this.props.flightPlanStore.approachTransition,
  ).withLifecycle(this.defaultLifecycle);


  /**
   * Maps a length in metres to feet, rounded to the nearest 1 feet.
   * @param value The value in metres, or null if invalid.
   * @returns The value to the nearest 1 feet if not null and finite, else null.
   */
  private static mapToFeetRounded(value: number | null): number | null {
    return value !== null && Number.isFinite(value) ? MathUtils.round(UnitType.FOOT.convertFrom(value, UnitType.METER), 1) : null;
  }

  private readonly satelliteData = ArraySubject.create<GnssSatelliteListData>();
  private readonly sortedSatelliteData = SortedMappedSubscribableArray.create(this.satelliteData, (a, b) => a.prn - b.prn);

  private satelliteList?: DynamicList<GnssSatelliteListData>;

  /**
   * Renders a segment label component.
   * @param data The segment label data.
   * @param index The index of the list item.
   * @returns The rendered label.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private renderSatelliteBar(data: GnssSatelliteListData, index: number): VNode {
    return <SatelliteBar data={data} />;
  }


  /** @inheritdoc */
  public onAfterRender(): void {
    this.satelliteList = new DynamicList(
      this.sortedSatelliteData,
      this.satelliteGraphRef.instance,
      this.renderSatelliteBar.bind(this),
      0,
    );
    this.satelliteList.init();

    const sub = this.props.bus.getSubscriber<GnssReceiverEvents>();
    this.navMode.setConsumer(sub.on('gnss_navigation_mode'));
    this.halMeters.setConsumer(sub.on('gnss_hal_m'));
    this.valMeters.setConsumer(sub.on('gnss_val_m'));
    this.status.setConsumer(sub.on('gnss_navigation_state'));
    this.position.setConsumer(sub.on('gnss_position'));
    this.gpsAltitudeFeet.setConsumer(sub.on('gnss_altitude_ft'));
    this.hplMeters.setConsumer(sub.on('gnss_hpl_m'));
    this.vplMeters.setConsumer(sub.on('gnss_vpl_m'));
    this.hfomMeters.setConsumer(sub.on('gnss_hfom_m'));
    this.vfomMeters.setConsumer(sub.on('gnss_vfom_m'));

    sub.on('gnss_satellite_data').handle(this.onSatelliteData.bind(this)).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Handles changes to satellite data.
   * @param data The new sat data.
   */
  private onSatelliteData(data: readonly GnssSatelliteData[]): void {
    const existingData = this.satelliteData.getArray();

    for (let i = existingData.length - 1; i >= 0; i--) {
      if (!data.find((v) => v.prn === existingData[i].prn && v.signalStrength > 0)) {
        this.satelliteData.removeAt(i);
      }
    }

    for (let i = 0; i < data.length; i++) {
      const existingItem = existingData.find((v) => v.prn === data[i].prn);
      if (existingItem) {
        existingItem.signalStrength.set(data[i].signalStrength);
      } else if (data[i].signalStrength > 0) {
        this.satelliteData.insert({
          prn: data[i].prn,
          signalStrength: Subject.create(data[i].signalStrength),
          heightPx: 0,
        });
      }
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={FSComponent.mergeCssClasses('sys-tab-gps', this.props.class)}>
        <div style={{ 'display': 'flex', 'margin-top': '15px', 'margin-left': '9px' }}>
          <div style={{ 'width': '49%' }}>
            <span style={{ 'margin-right': '14px' }}>Nav Mode</span>
            <span class="sys-tab-light-cyan-text">{this.navMode.map((v) => v !== null ? v : '---').withLifecycle(this.defaultLifecycle)}</span>
          </div>
          <div style={{ 'margin-right': '20px' }}>
            <span style={{ 'margin-right': '16px' }}>HAL</span>
            <span class="sys-tab-light-cyan-text">{this.halNm.map((v) => v !== null ? v.toFixed(1) : '---').withLifecycle(this.defaultLifecycle)}</span>
            <span class="sys-tab-unit-text"> NM</span>
          </div>
          <div>
            <span style={{ 'margin-right': '22px' }}>VAL</span>
            <span class="sys-tab-light-cyan-text" style={{ 'margin-right': '8px' }}>{this.valFeet.map((v) => v !== null ? v.toFixed(0) : '---').withLifecycle(this.defaultLifecycle)}</span>
            <span class="sys-tab-unit-text">Ft</span>
          </div>
        </div>
        <div style={{ 'display': 'flex', 'margin-top': '4px' }}>
          <div style={{ 'width': '60%', 'min-width': '60%' }}>
            <div class="sys-tab-column-row">
              <div class="sys-tab-column-label sys-tab-gps-left-column-label">Status</div>
              <div class="sys-tab-column-data">{this.status.map((v) => v !== null ? v : '---').withLifecycle(this.defaultLifecycle)}</div>
            </div>
            <div class="sys-tab-column-row">
              <div
                class="sys-tab-column-label sys-tab-gps-left-column-label"
                style={{ 'margin-top': 'auto', 'margin-bottom': 'auto' }}>
                Position
              </div>
              <div class="sys-tab-column-data" style={{ 'line-height': '35px' }}>{this.positionString}</div>
            </div>
            <div class="sys-tab-column-row">
              <div class="sys-tab-column-label sys-tab-gps-left-column-label">GPS Altitude</div>
              <div class="sys-tab-column-data">{this.gpsAltitudeFeetRounded.map((v) => v !== null ? v.toFixed(0) : '---').withLifecycle(this.defaultLifecycle)}<span class="sys-tab-big-unit-text ">Ft MSL</span></div>
            </div>
          </div>
          <div style={{ 'flex-grow': '1' }}>
            <div class="sys-tab-column-row">
              <div class="sys-tab-column-label sys-tab-gps-right-column-label">HPL</div>
              <div class="sys-tab-column-data">{this.hplFeet.map((v) => v !== null ? v.toFixed(0) : '---').withLifecycle(this.defaultLifecycle)}<span class="sys-tab-big-unit-text ">Ft</span></div>
            </div>
            <div class="sys-tab-column-row">
              <div class="sys-tab-column-label sys-tab-gps-right-column-label">VPL</div>
              <div class="sys-tab-column-data">{this.vplFeet.map((v) => v !== null ? v.toFixed(0) : '---').withLifecycle(this.defaultLifecycle)}<span class="sys-tab-big-unit-text ">Ft</span></div>
            </div>
            <div class="sys-tab-column-row">
              <div class="sys-tab-column-label sys-tab-gps-right-column-label">HFOM</div>
              <div class="sys-tab-column-data">{this.hfomFeet.map((v) => v !== null ? v.toFixed(0) : '---').withLifecycle(this.defaultLifecycle)}<span class="sys-tab-big-unit-text ">Ft</span></div>
            </div>
            <div class="sys-tab-column-row">
              <div class="sys-tab-column-label sys-tab-gps-right-column-label">VFOM</div>
              <div class="sys-tab-column-data">{this.vfomFeet.map((v) => v !== null ? v.toFixed(0) : '---').withLifecycle(this.defaultLifecycle)}<span class="sys-tab-big-unit-text ">Ft</span></div>
            </div>
          </div>
        </div>

        <div class="sys-tab-divider" style={{ 'margin-top': '-4px' }} />

        <div style={{ 'text-align': 'center', 'margin-top': '6px' }}>Reference Path ID</div>
        <div class="sys-tab-column-row" style={{ 'margin-left': '8px', 'margin-bottom': '7px', 'margin-top': '1px' }}>
          <div class="sys-tab-column-label" style={{ 'margin-right': '18px' }}>Approach</div>
          <div class="sys-tab-light-cyan-text">{this.referencePath}</div>
        </div>

        <div class="sys-tab-divider" />

        <div style={{ 'text-align': 'center' }}>Satellite Signals</div>
        <div class="satellite-graph-container">
          <div class="satellite-graph" ref={this.satelliteGraphRef} />
        </div>
      </div>
    );
  }
}

/** Properties for a satellite bar item. */
interface SatelliteBarProps extends ComponentProps {
  /** The satellite data. */
  readonly data: GnssSatelliteListData,
}

/** A satellite bar item. */
class SatelliteBar extends LifecycleComponent<SatelliteBarProps> {
  private barHeight = this.props.data.signalStrength.map((v) => MathUtils.round(v * 100, 0.1)).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override render(): VNode | null {
    return (
      <div class="satellite-item">
        <div class="satellite-bar-container">
          <div class="satellite-bar" style={{ 'height': this.barHeight.map((v) => `${v}%`).withLifecycle(this.defaultLifecycle) }} />
        </div>
        <div class="satellite-divider" />
        <div class="satellite-label">{this.props.data.prn.toFixed(0).padStart(2, '0')}</div>
      </div>
    );
  }
}

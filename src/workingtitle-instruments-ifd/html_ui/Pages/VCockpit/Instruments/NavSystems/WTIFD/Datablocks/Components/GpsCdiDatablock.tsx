import { ConsumerSubject, FSComponent, GNSSEvents, LNavEvents, LNavUtils, MagVar, MappedSubject, MathUtils, VNode } from '@microsoft/msfs-sdk';

import { LNavDataEvents } from '../../Navigation/LNavDataEvents';
import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';
import { BearingFormatter } from '../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

import './GpsCdiDatablock.css';

/** Props for the CDI data block. */
export interface GpsCdiDatablockProps extends BaseDatablockProps {
  /** the LNAV index to use. */
  lnavIndex: number;
}

/** Datablock for displaying the GPS CDI */
export class GpsCdiDatablock extends Datablock<GpsCdiDatablockProps> {
  private static readonly MAX_NEEDLE_DEFLECTION = 47; // px

  private readonly magvar =
    ConsumerSubject.create(this.props.bus.getSubscriber<GNSSEvents>().on('magvar').atFrequency(0.1, true), 0)
      .withLifecycle(this.defaultLifecycle);
  private readonly track =
    ConsumerSubject.create(this.props.bus.getSubscriber<GnssReceiverEvents>().on('gnss_track_true_deg').withPrecision(1), NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly dtk =
    ConsumerSubject.create(null, NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly isTracking =
    ConsumerSubject.create(null, false)
      .withLifecycle(this.defaultLifecycle);

  private readonly xtrkDistance =
    ConsumerSubject.create(null, NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly cdiScale = ConsumerSubject.create(null, 2)
    .withLifecycle(this.defaultLifecycle);

  private readonly trkDisplay = MappedSubject.create(
    ([track, magvar, navAngle]) => BearingFormatter.format(
      navAngle === UnitsNavAngleSettingMode.True || track === null
        ? track
        : MagVar.trueToMagnetic(track, magvar),
      navAngle,
    ),
    this.track,
    this.magvar,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
  ).withLifecycle(this.defaultLifecycle);

  private readonly dtkDisplay = MappedSubject.create(
    ([dtk, magvar, isTracking, navAngle]) => BearingFormatter.format(
      isTracking
        ? navAngle === UnitsNavAngleSettingMode.True
          ? dtk
          : MagVar.trueToMagnetic(dtk, magvar)
        : null,
      navAngle,
    ),
    this.dtk,
    this.magvar,
    this.isTracking,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
  ).withLifecycle(this.defaultLifecycle);

  private readonly needleRef = FSComponent.createRef<SVGElement>();

  /**
   * Gets the datablock info for this GpsCdiDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'GPD CDI',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<LNavEvents & LNavDataEvents>();
    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.props.lnavIndex);

    this.dtk.setConsumer(sub.on(`lnav_dtk${lnavSuffix}`).withPrecision(1));
    this.isTracking.setConsumer(sub.on(`lnav_is_tracking${lnavSuffix}`));
    this.xtrkDistance.setConsumer(sub.on(`lnav_xtk${lnavSuffix}`));
    this.cdiScale.setConsumer(sub.on(`lnavdata_cdi_scale${lnavSuffix}`));

    MappedSubject.create(
      ([xtrk, fullScaleValue]) => {
        const needleDeflection = MathUtils.clamp(
          GpsCdiDatablock.MAX_NEEDLE_DEFLECTION * (-xtrk / fullScaleValue),
          -GpsCdiDatablock.MAX_NEEDLE_DEFLECTION,
          GpsCdiDatablock.MAX_NEEDLE_DEFLECTION,
        );
        this.needleRef.instance.style.transform = `translate3d(${needleDeflection}px, 0, 0)`;
        this.needleRef.instance.classList.toggle('full-deflection', Math.abs(xtrk) >= fullScaleValue);
      },
      this.xtrkDistance,
      this.cdiScale,
    ).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-gps-cdi" ref={this.datablockRef}>
        <div class="datablock-content-row between">
          <div class="datablock-font-small datablock-text-mint">Trk</div>
          <div class="datablock-font-large datablock-text-cyan">{this.trkDisplay}</div>
        </div>
        <div class="datablock-content-row between">
          <div class="datablock-font-small datablock-text-mint">Dtk</div>
          <div class="datablock-font-large datablock-text-cyan">{this.dtkDisplay}</div>
        </div>
        <div class="gps-cdi-container">
          <svg class="gps-cdi-scale" viewBox="0 2 100 20">
            <path d="M 49.5 2 l 0 20" stroke="var(--wtdyne-color-light-cyan)" stroke-width="3" fill="none" />
            <path d="M 16.5 2 l 0 13 M 33.25 2 l 0 13 M 66.5 2 l 0 13 M 83 2 l 0 13" stroke="var(--wtdyne-color-light-cyan)" stroke-width="2" fill="none" />
          </svg>
          <svg class="gps-cdi-needle" viewBox="0 0 15 16" ref={this.needleRef}>
            <path d="M 7.5 1 l 6.5 9 l -4.5 0 l 0 5 l -4 0 l 0 -5 l -4.5 0 l 6.5 -9 z" />
          </svg>
        </div>
      </div>
    );
  }
}

import { ConsumerSubject, FSComponent, GNSSEvents, LNavEvents, LNavUtils, MagVar, MappedSubject, VNode } from '@microsoft/msfs-sdk';

import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

/** Props for the dtk data block. */
export interface DesiredTrackDatablockProps extends BaseDatablockProps {
  /** the LNAV index to use. */
  lnavIndex: number;
}

/** Datablock for displaying the Desired Track */
export class DesiredTrackDatablock extends Datablock<DesiredTrackDatablockProps> {
  private readonly magvar =
    ConsumerSubject.create(this.props.bus.getSubscriber<GNSSEvents>().on('magvar').atFrequency(0.1, true), NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly dtk =
    ConsumerSubject.create(null, NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly isTracking =
    ConsumerSubject.create(null, false)
      .withLifecycle(this.defaultLifecycle);

  private readonly dtkDisplay = MappedSubject.create(
    ([magvar, dtk, isTracking, navAngle]) => BearingFormatter.format(
      isTracking
        ? navAngle === UnitsNavAngleSettingMode.True
          ? dtk
          : MagVar.trueToMagnetic(dtk, magvar)
        : null,
      navAngle,
    ),
    this.magvar,
    this.dtk,
    this.isTracking,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this DesiredTrackDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Desired Track',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<LNavEvents>();
    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.props.lnavIndex);

    this.dtk.setConsumer(sub.on(`lnav_dtk${lnavSuffix}`).withPrecision(1));
    this.isTracking.setConsumer(sub.on(`lnav_is_tracking${lnavSuffix}`));
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-desired-track" ref={this.datablockRef}>
        <div class="datablock-content-row between space-below">
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dtk</div>
          <div class="datablock-indent datablock-font-large" style="margin-right: 12px;">{this.dtkDisplay}</div>
        </div>
      </div>
    );
  }
}

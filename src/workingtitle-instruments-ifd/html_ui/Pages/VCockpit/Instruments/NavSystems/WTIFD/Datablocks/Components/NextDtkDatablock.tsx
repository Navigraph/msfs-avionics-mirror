import { ConsumerSubject, FSComponent, GNSSEvents, LNavUtils, MagVar, MappedSubject, VNode } from '@microsoft/msfs-sdk';

import { LNavDataEvents } from '../../Navigation/LNavDataEvents';
import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

/** Props for the next dtk data block. */
export interface NextDtkDatablockProps extends BaseDatablockProps {
  /** the LNAV index to use. */
  lnavIndex: number;
}

/** Datablock for displaying the Next Desired Track */
export class NextDtkDatablock extends Datablock<NextDtkDatablockProps> {
  private readonly magvar =
    ConsumerSubject.create(this.props.bus.getSubscriber<GNSSEvents>().on('magvar').atFrequency(0.1, true), NaN)
      .withLifecycle(this.defaultLifecycle);
  private readonly nextDtk =
    ConsumerSubject.create(this.props.bus.getSubscriber<LNavDataEvents>().on(`lnavdata_next_dtk_true${LNavUtils.getEventBusTopicSuffix(this.props.lnavIndex)}`).withPrecision(1), NaN)
      .withLifecycle(this.defaultLifecycle);

  private readonly nextDtkDisplay = MappedSubject.create(
    ([magvar, ndtk, navAngle]) => BearingFormatter.format(
      navAngle === UnitsNavAngleSettingMode.True
        ? ndtk
        : MagVar.trueToMagnetic(ndtk, magvar),
      navAngle,
    ),
    this.magvar,
    this.nextDtk,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
  ).withLifecycle(this.defaultLifecycle);

  /**
   * Gets the datablock info for this NextDtkDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Next Desired Track',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-row datablock-next-desired-track" ref={this.datablockRef}>
        <div class="datablock-content-row between space-below">
          <div class="datablock-indent datablock-font-small datablock-text-mint">Nxt Dtk</div>
          <div class="datablock-indent datablock-font-large" style="margin-right: 12px;">{this.nextDtkDisplay}</div>
        </div>
      </div>
    );
  }
}

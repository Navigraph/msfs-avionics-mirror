import { ConsumerSubject, FSComponent, NumberFormatter, UnitType, VNavEvents, VNavUtils, VNode } from '@microsoft/msfs-sdk';

import { NumberUnitDisplay } from '../../Components/NumberDisplays';
import { UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

/** Props for the next dtk data block. */
export interface VerticalSpeedRequiredDatablockProps extends BaseDatablockProps {
  /** the VNAV index to use. */
  vnavIndex: number;
}

/** Datablock for displaying the Vertical Speed Required */
export class VerticalSpeedRequiredDatablock extends Datablock<VerticalSpeedRequiredDatablockProps> {
  private readonly vsrFormatter = NumberFormatter.create({
    precision: 1,
    pad: 0,
    nanString: '---',
  });

  private readonly vsr = ConsumerSubject.create(this.props.bus.getSubscriber<VNavEvents>().on(`vnav_required_vs${VNavUtils.getEventBusTopicSuffix(this.props.vnavIndex)}`).withPrecision(1), NaN);

  /**
   * Gets the datablock info for this VerticalSpeedRequiredDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Vertical Speed Required',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-vertical-speed-required" ref={this.datablockRef}>
        <div class="datablock-content-row between">
          <div class="datablock-indent datablock-font-small datablock-text-mint">VSR</div>
          <NumberUnitDisplay
            class="datablock-numberunit"
            value={this.vsr.map(v => UnitType.FPM.createNumber(v)).withLifecycle(this.defaultLifecycle)}
            formatter={this.vsrFormatter}
            displayUnit={UnitsUserSettings.getManager(this.props.bus).verticalSpeedUnits}
          />
        </div>
      </div>
    );
  }
}

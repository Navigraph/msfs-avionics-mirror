import {FSComponent, MathUtils, NumberUnitSubject, UnitType, VNode} from '@microsoft/msfs-sdk';

import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { WptDatablock } from './WptDatablock';
import { FlightPlanStore } from '../../../FlightPlan';

/** Datablock for displaying the Destination Direct Distance */
export class DestDirectDistanceDatablock extends WptDatablock {
  protected readonly distance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  private readonly distanceDisplay = this.distance.map(this.formatDistance.bind(this)).withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.flightPlanStore.destinationWaypointDirectDistance.sub((distance) => {
      this.distance.set(MathUtils.round(distance.asUnit(UnitType.NMILE), FlightPlanStore.DISTANCE_QUANTUM_METER));
    }).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for this DestDirectDistanceDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Destination Direct Distance',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-dest-direct-distance" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-mint">LWM</div>
        <div>
          <div class="datablock-indent datablock-font-large datablock-text-cyan">{this.distanceDisplay}</div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">NM</div>
        </div>
      </div>
    );
  }
}

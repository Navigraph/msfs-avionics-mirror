import { FSComponent, MathUtils, NumberUnitSubject, UnitType, VNode } from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../../FlightPlan';
import { UnitsUserSettings } from '../../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { WptDatablock } from './WptDatablock';

/** Datablock for displaying the Destination Direct Information */
export class DestDirectInfoDatablock extends WptDatablock {
  protected readonly distance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  private readonly distanceDisplay = this.distance.map(this.formatDistance.bind(this))
    .withLifecycle(this.defaultLifecycle);

  private readonly brgDisplay = BearingFormatter.createFromNavAngle(
    this.props.flightPlanStore.destinationWaypointDirectBearing,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
    this.props.flightPlanStore,
  ).withLifecycle(this.defaultLifecycle).fullLabel;

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.flightPlanStore.destinationWaypointDirectDistance.sub((distance) => {
      this.distance.set(MathUtils.round(distance.asUnit(UnitType.NMILE), FlightPlanStore.DISTANCE_QUANTUM_METER));
    }).withLifecycle(this.defaultLifecycle);

    this.props.flightPlanStore.destinationWaypointIdent.sub((ident: string | undefined) => {
      this.ident.set(ident ?? '');
    }).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for DestDirectInfoDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Destination Direct Information',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-dest-direct-info" ref={this.datablockRef}>
        <div class="datablock-content-row between">
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dest</div>
          <div class="datablock-font-large datablock-text-cyan">{this.ident}</div>
        </div>
        <div>
          <div class="datablock-content-row">
            <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">Brg</div>
            <div class="datablock-font-large datablock-text-cyan" style="padding-left: 20px;">{this.brgDisplay}</div>
          </div>
        </div>
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">Dist</div>
          <div class="datablock-font-large datablock-text-cyan" style="width: 49px; text-align: right;">{this.distanceDisplay}</div>
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">NM</div>
        </div>
      </div>
    );
  }
}

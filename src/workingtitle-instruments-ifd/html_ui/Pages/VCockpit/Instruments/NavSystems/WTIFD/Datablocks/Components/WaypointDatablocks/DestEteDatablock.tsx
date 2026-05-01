import { FSComponent, NumberUnitSubject, SimpleUnit, Subscription, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { FlightPlanLegData } from '../../../FlightPlan';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { ETE_HH_MM_FORMATTER, ETE_MM_SS_FORMATTER, WptDatablock } from './WptDatablock';

/** Datablock for displaying the Destination ETE */
export class DestEteDatablock extends WptDatablock {
  private readonly destLegEte = NumberUnitSubject.create<UnitFamily.Duration, SimpleUnit<UnitFamily.Duration>>(UnitType.MILLISECOND.createNumber(NaN));
  private destLegEtePipe?: Subscription;
  private readonly destLegEteUnit = this.destLegEte.map((v) => v.asUnit(UnitType.MINUTE) < 10 ? 'M:S' : 'H:M').withLifecycle(this.defaultLifecycle);
  private readonly destLegEteDisplay = this.destLegEte.map((legEte) => {
    if (!legEte) {
      return ETE_HH_MM_FORMATTER(NaN);
    }

    if (legEte.asUnit(UnitType.MINUTE) < 10) {
      return ETE_MM_SS_FORMATTER(legEte.asUnit(UnitType.MILLISECOND));
    }

    return ETE_HH_MM_FORMATTER(legEte.asUnit(UnitType.MILLISECOND));
  }).withLifecycle(this.defaultLifecycle);


  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.flightPlanStore.destinationWaypointLegData.sub((destLegData: FlightPlanLegData | undefined) => {
      this.destLegEtePipe?.destroy();
      if (destLegData) {
        this.destLegEtePipe = destLegData.estimatedTimeEnrouteCumulative.pipe(this.destLegEte);
      } else {
        this.destLegEte.set(NaN);
      }
    }).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for this DestEteDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Destination ETE',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  // NOTE ETE seems to be just along track dist/current gs.
  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-dest-ete" ref={this.datablockRef}>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dest ETE</div>
        </div>
        <div>
          <div class="datablock-indent datablock-font-large datablock-text-mint">{this.destLegEteDisplay}</div>
          <div class="datablock-font-small datablock-text-mint">{this.destLegEteUnit}</div>
        </div>
      </div>
    );
  }
}

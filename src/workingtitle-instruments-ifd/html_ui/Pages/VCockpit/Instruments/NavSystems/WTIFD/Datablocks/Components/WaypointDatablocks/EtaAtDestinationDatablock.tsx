import {
  FSComponent, MappedSubject,
  NumberUnitSubject,
  SimpleUnit,
  Subscription,
  UnitFamily,
  UnitType,
  VNode
} from '@microsoft/msfs-sdk';

import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { ETE_HH_MM_FORMATTER, WptDatablock } from './WptDatablock';
import { FlightPlanLegData } from '../../../FlightPlan';

/** Datablock for displaying the ETA at Destination */
export class EtaAtDestinationDatablock extends WptDatablock {
  private readonly destLegEta = NumberUnitSubject.create<UnitFamily.Duration, SimpleUnit<UnitFamily.Duration>>(UnitType.MILLISECOND.createNumber(NaN));
  private destLegEtaPipe?: Subscription;
  private readonly destLegEtaDisplay = MappedSubject.create(
    ([activeLegEte]) => {
      if (!activeLegEte) {
        return ETE_HH_MM_FORMATTER(NaN);
      }

      return ETE_HH_MM_FORMATTER(activeLegEte.asUnit(UnitType.MILLISECOND));
    },
    this.destLegEta
  );

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.flightPlanStore.destinationWaypointLegData.sub((destLegData: FlightPlanLegData | undefined) => {
      this.destLegEtaPipe?.destroy();
      if (destLegData) {
        this.destLegEtaPipe = destLegData.estimatedTimeOfArrival.pipe(this.destLegEta);
      } else {
        this.destLegEta.set(NaN);
      }
    }).withLifecycle(this.defaultLifecycle);

    this.props.flightPlanStore.destinationIdent.sub((ident: string | undefined) => {
      this.ident.set(ident || '---');
    }).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for this EtaAtDestinationDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'ETA at Destination',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  // NOTE: We can only do UTC time for now... pending timezone offset function in SU5
  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-eta-at-dest" ref={this.datablockRef}>
        <div>
          <div class="datablock-indent datablock-font-small datablock-text-mint">ETA at Dest</div>
        </div>
        <div>
          <div class="datablock-indent datablock-font-large datablock-text-mint">{this.destLegEtaDisplay}</div>
          {/* TODO update the time suffix to also include AM/PM LCL when timezone is implemented. */}
          <div class="datablock-font-small datablock-text-mint">Z</div>
        </div>
      </div>
    );
  }
}

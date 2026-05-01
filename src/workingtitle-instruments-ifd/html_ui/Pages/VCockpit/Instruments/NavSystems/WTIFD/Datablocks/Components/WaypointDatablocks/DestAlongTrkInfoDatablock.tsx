import { FSComponent, NumberUnitSubject, SimpleUnit, Subscription, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { FlightPlanLegData } from '../../../FlightPlan';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { ETE_HH_MM_FORMATTER, ETE_MM_SS_FORMATTER, WptDatablock } from './WptDatablock';

/** Datablock for displaying the Destination Along Track Information */
export class DestAlongTrkInfoDatablock extends WptDatablock {
  protected readonly distance = this.props.flightPlanStore.destinationWaypointAlongTrackDistance
    .map(this.formatDistance.bind(this))
    .withLifecycle(this.defaultLifecycle);

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

    this.props.flightPlanStore.destinationIdent.sub((ident: string | undefined) => {
      this.ident.set(ident || '---');
    }).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for this DestAlongTrkInfoDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Destination Along Track Information',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-dest-along-trk-info" ref={this.datablockRef}>
        <div class="datablock-content-row between">
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dest</div>
          <div class="datablock-font-large datablock-text-cyan">{this.ident}</div>
        </div>
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">TkDist</div>
          <div class="datablock-font-large datablock-text-cyan" style="width: 49px; text-align: right;">{this.distance}</div>
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">NM</div>
        </div>
        {/* Conditional, if there's fuel flow system connected */}
        {/*<div>*/}
        {/*  <div class="datablock-indent datablock-font-small datablock-text-mint">At</div>*/}
        {/*</div>*/}
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-small datablock-font-narrow datablock-text-mint">ETE</div>
          <div class="datablock-font-large datablock-text-magenta" style="width: 65px; text-align: right;">{this.destLegEteDisplay}</div>
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">{this.destLegEteUnit}</div>
        </div>
      </div>
    );
  }
}

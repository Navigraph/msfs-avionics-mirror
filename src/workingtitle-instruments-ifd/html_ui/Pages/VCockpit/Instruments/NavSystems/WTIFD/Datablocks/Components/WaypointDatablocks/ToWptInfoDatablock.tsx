import { FSComponent, LegDefinition, NumberUnitSubject, SimpleUnit, Subscription, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { UnitsUserSettings } from '../../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { ETE_HH_MM_FORMATTER, ETE_MM_SS_FORMATTER, WptDatablock } from './WptDatablock';

/** Datablock for displaying the To Waypoint Information */
export class ToWptInfoDatablock extends WptDatablock {
  // TODO need '---' for DTK and dist when not tracking
  protected readonly dtk = BearingFormatter.createFromNavAngle(
    this.props.flightPlanStore.destinationWaypointDirectBearing,
    UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle'),
    this.props.flightPlanStore,
  ).withLifecycle(this.defaultLifecycle).fullLabel;
  protected readonly distance = this.props.flightPlanStore.activeLegDistance.map(this.formatDistance.bind(this))
    .withLifecycle(this.defaultLifecycle);

  private readonly activeLegEte = NumberUnitSubject.create<UnitFamily.Duration, SimpleUnit<UnitFamily.Duration>>(UnitType.MILLISECOND.createNumber(NaN));
  private activeLegEtePipe?: Subscription;
  private readonly activeLegEteUnit = this.activeLegEte.map((v) => v.asUnit(UnitType.MINUTE) < 10 ? 'M:S' : 'H:M').withLifecycle(this.defaultLifecycle);
  private readonly activeLegEteDisplay = this.activeLegEte.map((legEte) => {
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

    this.props.flightPlanStore.activeLegData.sub(activeLegListData => {
      this.activeLegEtePipe?.destroy();
      if (activeLegListData) {
        this.activeLegEtePipe = activeLegListData.estimatedTimeEnroute.pipe(this.activeLegEte);
      } else {
        this.activeLegEte.set(NaN);
      }
    }).withLifecycle(this.defaultLifecycle);

    this.props.flightPlanStore.activeLeg.sub((leg: LegDefinition | undefined) => {
      this.ident.set(leg?.leg.fixIcaoStruct.ident || leg?.name || '---');
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for this ToWptInformationDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'To Waypoint Information',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-to-wpt-info" ref={this.datablockRef}>
        <div class="datablock-font-large datablock-text-magenta">{this.ident}</div>
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">Dtk</div>
          <div class="datablock-font-large datablock-text-magenta" style="padding-left: 46px;">{this.dtk}</div>
        </div>
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-small datablock-font-narrow datablock-text-mint">TkDist</div>
          <div class="datablock-font-large datablock-text-magenta" style="width: 49px; text-align: right;">{this.distance}</div>
          <div class="datablock-indent datablock-font-small datablock-font-narrow datablock-text-mint">NM</div>
        </div>
        {/* TODO connect fuel flow system */}
        {/* Conditional, if there's fuel flow system connected */}
        {/*<div>*/}
        {/*  <div class="datablock-indent datablock-font-small datablock-text-mint">At</div>*/}
        {/*</div>*/}
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-small datablock-font-narrow datablock-text-mint">ETE</div>
          <div class="datablock-font-large datablock-text-magenta" style="width: 65px; text-align: right;">{this.activeLegEteDisplay}</div>
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">{this.activeLegEteUnit}</div>
        </div>
      </div>
    );
  }
}

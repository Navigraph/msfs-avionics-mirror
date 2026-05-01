import {
  BasicNavAngleSubject, BasicNavAngleUnit, FSComponent, MappedSubject, MathUtils, NumberUnitSubject, SimpleUnit, Subscription, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { UnitFormatter } from '../../../Components/NumberDisplays';
import { FlightPlanStore } from '../../../FlightPlan';
import { UnitsUserSettings } from '../../../Settings/UnitsUserSettings';
import { BearingFormatter, FormatUtils } from '../../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { ETE_HH_MM_FORMATTER, ETE_MM_SS_FORMATTER, WptDatablock } from './WptDatablock';

/** Datablock for displaying the Next Waypoint Information */
export class NextWptInfoDatablock extends WptDatablock {
  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.bus);

  protected readonly dtk = BasicNavAngleSubject.create(BasicNavAngleUnit.create(true).createNumber(NaN));
  private readonly dtkDisplay = BearingFormatter.createFromNavAngle(
    this.dtk,
    this.unitsSettingManager.getSetting('unitsNavAngle'),
    this.props.flightPlanStore,
  ).withLifecycle(this.defaultLifecycle).fullLabel;

  protected readonly distance = NumberUnitSubject.create(UnitType.NMILE.createNumber(NaN));
  private distanceDisplay = MappedSubject.create(
    ([dist, unit]) => isNaN(dist.number) ?
      '---' : FormatUtils.showTenthsUnderOneHundred(dist.asUnit(unit)),
    this.distance,
    this.unitsSettingManager.distanceUnitsLarge,
  ).withLifecycle(this.defaultLifecycle);
  private readonly distanceUnits = this.unitsSettingManager.distanceUnitsLarge
    .map(UnitFormatter.unitLabel<UnitFamily.Distance>)
    .withLifecycle(this.defaultLifecycle);

  private dtkPipe?: Subscription;
  private distancePipe?: Subscription;

  private readonly nextLegEte = NumberUnitSubject.create<UnitFamily.Duration, SimpleUnit<UnitFamily.Duration>>(UnitType.MILLISECOND.createNumber(NaN));
  private nextLegEtePipe?: Subscription;
  private readonly nextLegEteUnit = this.nextLegEte.map((v) => v.asUnit(UnitType.MINUTE) < 10 ? 'M:S' : 'H:M').withLifecycle(this.defaultLifecycle);
  private readonly nextLegEteDisplay = this.nextLegEte.map((legEte) => {
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

    this.props.flightPlanStore.nextLegData.sub(nextLegListData => {
      this.dtkPipe?.destroy();
      this.distancePipe?.destroy();
      this.nextLegEtePipe?.destroy();

      this.ident.set(nextLegListData?.leg.leg.fixIcaoStruct.ident || nextLegListData?.leg.name || '---');

      if (nextLegListData) {
        this.nextLegEtePipe = nextLegListData.estimatedTimeEnroute.pipe(this.nextLegEte);
      } else {
        this.nextLegEte.set(NaN);
      }

      // TODO needs to show --- when not tracking
      if (nextLegListData?.initialDtk !== undefined) {
        this.dtkPipe = nextLegListData.initialDtk.pipe(this.dtk);
      } else {
        this.dtk.set(NaN);
      }

      // TODO needs to show --- when not tracking
      if (nextLegListData?.distance !== undefined) {
        this.distancePipe = nextLegListData.distance
          .map((distance) => MathUtils.round(distance.asUnit(UnitType.NMILE), FlightPlanStore.DISTANCE_QUANTUM_METER))
          .pipe(this.distance);
      } else {
        this.distance.set(NaN);
      }
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for this NextWptInfoDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Next Waypoint Information',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-next-wpt-info" ref={this.datablockRef}>
        <div class="datablock-content-row between">
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">Next</div>
          <div class="datablock-font-large datablock-text-cyan">{this.ident}</div>
        </div>
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">Nxt Dtk</div>
          <div class="datablock-font-large datablock-text-cyan" style="padding-left: 14px;">{this.dtkDisplay}</div>
        </div>
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">TkDist</div>
          <div class="datablock-font-large datablock-text-cyan" style="width: 49px; text-align: right;">{this.distanceDisplay}</div>
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">{this.distanceUnits}</div>
        </div>
        {/* TODO Conditional, if there's fuel flow system connected */}
        {/*<div>*/}
        {/*  <div class="datablock-indent datablock-font-small datablock-text-mint">At</div>*/}
        {/*</div>*/}
        <div class="datablock-content-row">
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">ETE</div>
          <div class="datablock-font-large datablock-text-cyan" style="width: 65px; text-align: right;">{this.nextLegEteDisplay}</div>
          <div class="datablock-indent datablock-font-narrow datablock-font-small datablock-text-mint">{this.nextLegEteUnit}</div>
        </div>
      </div>
    );
  }
}

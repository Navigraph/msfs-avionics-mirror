import { AirportFacility, ConsumerSubject, FSComponent, GeoPoint, MagVar, MappedSubject, NearestContext, Subject, UnitType, VNode } from '@microsoft/msfs-sdk';

import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { FmsPositionSystemEvents } from '../../Systems/FmsPositionSystem';
import { BearingFormatter } from '../../Utilities/FormatUtils';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { Datablock } from './Datablock';

/** Datablock for displaying the Nearest Airport */
export class NearestAirportDatablock extends Datablock {
  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.bus);

  private readonly nearestIdent = Subject.create('----');
  private readonly nearestBrg = Subject.create('---°');
  private readonly nearestDist = Subject.create('--.-');

  /**
   * Gets the datablock info for NearestAirportDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Nearest Airport',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  private ppos = ConsumerSubject.create(
    this.props.bus.getSubscriber<FmsPositionSystemEvents>().on('fms_pos_position_1').atFrequency(1 / 2),
    { lat: NaN, long: NaN },
  );

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const ppos = new GeoPoint(0, 0);

    NearestContext.onInitialized((context) => {
      MappedSubject.create(
        this.ppos,
        this.unitsSettingManager.getSetting('unitsNavAngle')
      ).sub(([v, navAngleUnit]) => {
        ppos.set(v.lat, v.long);

        let nearestIdent = '----';
        let nearestBrg = BearingFormatter.format(NaN, navAngleUnit);
        let nearestDist = '--.-';

        if (!isNaN(v.lat) && !isNaN(v.long)) {
          const nearestAirports = context.airports.getArray() as AirportFacility[];

          const nearestAirport = nearestAirports.sort((a, b) => ppos.distance(a.lat, a.lon) - ppos.distance(b.lat, b.lon))[0] as AirportFacility | undefined;

          if (nearestAirport) {
            const nearestDistNm = UnitType.GA_RADIAN.convertTo(ppos.distance(nearestAirport.lat, nearestAirport.lon), UnitType.NMILE);
            nearestDist = nearestDistNm < 10 ? nearestDistNm.toFixed(1) : nearestDistNm.toFixed(1) + ' ';
            nearestIdent = nearestAirport?.icaoStruct.ident;
            const trueBearing: number = ppos.bearingTo(nearestAirport.lat, nearestAirport.lon);
            nearestBrg = BearingFormatter.format(
              navAngleUnit === UnitsNavAngleSettingMode.True
                ? trueBearing
                : MagVar.trueToMagnetic(trueBearing, ppos),
              navAngleUnit
            );
          }
        }

        this.nearestIdent.set(nearestIdent);
        this.nearestBrg.set(nearestBrg);
        this.nearestDist.set(nearestDist);
      }).withLifecycle(this.defaultLifecycle);
    });
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-nearest-airport" ref={this.datablockRef}>
        <div class='datablock-content-row between'>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Nrst</div>
          <div class="datablock-font-large">{this.nearestIdent}</div>
        </div>
        <div class='datablock-content-row between'>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Brg</div>
          <div class="datablock-font-large" style="margin-right: 12px;">{this.nearestBrg}</div>
        </div>
        <div class='datablock-content-row between space-below'>
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dist</div>
          <div class="datablock-font-large" style="margin-right: 10px; text-align: right;">{this.nearestDist}<span class='datablock-font-small datablock-text-mint'>NM</span></div>
        </div>
      </div>
    );
  }
}

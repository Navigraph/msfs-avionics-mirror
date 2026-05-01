import { ConsumerSubject, DmsFormatter2, FSComponent, UnitType, VNode } from '@microsoft/msfs-sdk';

import { Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';

import './AircraftPositionDatablock.css';

/** Datablock for displaying the aircraft position */
export class AircraftPositionDatablock extends Datablock {
  private readonly gnssSub = this.props.bus.getSubscriber<GnssReceiverEvents>();
  private readonly position =
    ConsumerSubject.create(this.gnssSub.on('gnss_position').atFrequency(3), new LatLongAlt(NaN, NaN))
      .withLifecycle(this.defaultLifecycle);

  private readonly latFormatter = DmsFormatter2.create('{+[N]-[S]} {d}°{mm}\'{ss}"', UnitType.DEGREE, 0.0001, '- --°--\'--"');
  private readonly lonFormatter = DmsFormatter2.create('{+[E]-[W]} {d}°{mm}\'{ss}"', UnitType.DEGREE, 0.0001, '- --°--\'--"');

  /**
   * Gets the datablock info for this AircraftPosition instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Aircraft Position',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Current altitude above ground level using GPS'
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={{ 'datablock': true, 'datablock-aircraft-position': true }} ref={this.datablockRef}>
        <div class='datablock-font-large datablock-text-cyan'>
          {this.position.map(p => this.latFormatter(p.lat)).withLifecycle(this.defaultLifecycle)}
        </div>
        <div class='datablock-font-large datablock-text-cyan'>
          {this.position.map(p => this.lonFormatter(p.long)).withLifecycle(this.defaultLifecycle)}
        </div>
      </div>
    );
  }
}

import { FSComponent, VNode } from '@microsoft/msfs-sdk';

import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../../DatablockTypes';
import { WptDatablock } from './WptDatablock';

/** Datablock for displaying the Destination Waypoint */
export class DestWptDatablock extends WptDatablock {
  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.flightPlanStore.destinationWaypointIdent.sub((ident: string | undefined) => {
      this.ident.set(ident ?? '');
    }).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Gets the datablock info for this DestWptDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Destination Waypoint',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-row datablock-dest-wpt" ref={this.datablockRef}>
        <div class="datablock-content-row between">
          <div class="datablock-indent datablock-font-small datablock-text-mint">Dest</div>
          <div class="datablock-font-large datablock-text-cyan">{this.ident}</div>
        </div>
      </div>
    );
  }
}

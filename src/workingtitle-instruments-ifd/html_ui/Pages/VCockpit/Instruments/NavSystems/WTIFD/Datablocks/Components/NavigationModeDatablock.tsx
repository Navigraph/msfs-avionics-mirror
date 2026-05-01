import { ConsumerSubject, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { GnssNavigationMode, GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';

/** Datablock for displaying the Navigation Mode */
export class NavigationModeDatablock extends Datablock {
  private readonly sub = this.props.bus.getSubscriber<GnssReceiverEvents>();

  private readonly navMode = ConsumerSubject.create<GnssNavigationMode | null>(this.sub.on('gnss_navigation_mode'), null);

  /**
   * Gets the datablock info for this NavigationModeDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Navigation Mode',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /**
   * Determines the display label for the given navigation mode.
   * @param mode The navigation mode.
   * @returns The label for the given navigation mode.
   */
  private getNavModeLabel(mode: GnssNavigationMode | null): string {
    switch (mode) {
      case GnssNavigationMode.Approach:
        return 'Approach';
      case GnssNavigationMode.Terminal:
        return 'Terminal';
      case GnssNavigationMode.Enroute:
      default:
        return 'Enroute';
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-nav-mode" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small title-padding datablock-text-mint">Nav Mode</div>
        <div class="datablock-indent datablock-font-large datablock-text-cyan">
          {this.navMode.map(this.getNavModeLabel.bind(this)).withLifecycle(this.defaultLifecycle)}
        </div>
      </div>
    );
  }
}

import { ConsumerSubject, FSComponent, MappedSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { BaseDatablockProps, Datablock } from './Datablock';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { FmsEvents, FmsUtils } from '../../Fms';
import { FlightPlanStore } from '../../FlightPlan';

/** Props for the {@link ActiveGpsApproachDatablock} component. */
interface ActiveGpsApproachDatablockProps extends BaseDatablockProps {
  /** The flight plan store. */
  flightPlanStore: FlightPlanStore;
}

/** Datablock for displaying the Active GPS Approach */
export class ActiveGpsApproachDatablock extends Datablock<ActiveGpsApproachDatablockProps> {
  private fmsSub = this.props.bus.getSubscriber<FmsEvents>();

  private readonly flightPhase = ConsumerSubject.create(FmsUtils.onFmsEvent(this.props.flightPlanStore.flightPlannerId, this.fmsSub, 'fms_flight_phase'), FmsUtils.createEmptyFlightPhase());

  private readonly approachDisplay = Subject.create('---');
  private readonly airportDisplay = Subject.create('---');

  /**
   * Gets the datablock info for this ActiveGpsApproachDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Active GPS Approach',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    MappedSubject.create(
      ([phase, approachName, destination]) => {
        if (phase.isApproachActive) {
          this.approachDisplay.set(approachName || '---');
          this.airportDisplay.set(destination || '---');
        } else {
          this.approachDisplay.set('---');
          this.airportDisplay.set('---');
        }
      },
      this.flightPhase,
      this.props.flightPlanStore.approachName,
      this.props.flightPlanStore.destinationIdent,
    ).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-active-gps-app" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small title-padding datablock-text-mint">Active GPS App</div>
        <div class="datablock-indent datablock-font-large datablock-text-cyan">
          {this.approachDisplay}
        </div>
        <div class="datablock-indent datablock-font-large datablock-text-cyan">
          {this.airportDisplay}
        </div>
      </div>
    );
  }
}

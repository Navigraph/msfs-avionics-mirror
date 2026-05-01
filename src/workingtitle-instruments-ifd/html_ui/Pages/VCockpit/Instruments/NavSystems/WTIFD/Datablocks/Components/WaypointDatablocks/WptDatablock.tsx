import {
  ClockEvents, ConsumerSubject, DurationFormatter, FlightPlanner, NumberUnitInterface, SimpleUnit, Subject, UnitFamily, UnitType
} from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../../FlightPlan';
import { BaseDatablockProps, Datablock } from '../Datablock';

/**
 * Shared interface for all waypoint-related data blocks
 */
export interface WptDatablockProps extends BaseDatablockProps {
  /** An instance of the flight plan store. */
  readonly flightPlanStore: FlightPlanStore;
  /** An instance of the flight planner */
  readonly flightPlanner?: FlightPlanner;
}

export const ETE_HH_MM_FORMATTER = DurationFormatter.create('{hh}:{mm}', UnitType.MILLISECOND, 6000, '--:--');
export const ETE_MM_SS_FORMATTER = DurationFormatter.create('{m}:{ss}', UnitType.MILLISECOND, 500, '--:--');

/**
 * The abstract basic WptDatablock.
 */
export abstract class WptDatablock extends Datablock<WptDatablockProps> {
  protected readonly simTime = ConsumerSubject.create(this.props.bus.getSubscriber<ClockEvents>().on('simTime').atFrequency(1), 0);
  protected readonly ident = Subject.create<string>('');
  protected readonly date = new Date(0);

  /**
   * Format the distance value
   * @param v The distance number unit interface
   * @returns The formatted string
   */
  protected formatDistance(v: NumberUnitInterface<UnitFamily.Distance, SimpleUnit<UnitFamily.Distance>>): string {
    const nm = v.asUnit(UnitType.NMILE);

    if (nm === 0) {
      return '0.0';
    }

    if (nm) {
      return nm.toFixed(nm >= 100 ? 0 : 1);
    }

    return '---';
  }
}

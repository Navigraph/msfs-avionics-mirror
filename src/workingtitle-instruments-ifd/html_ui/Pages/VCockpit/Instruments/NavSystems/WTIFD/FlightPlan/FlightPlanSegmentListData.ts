import { FlightPlan, FlightPlanSegment, FlightPlanSegmentType, MappedSubject, NumberUnitSubject, Subject, Subscribable, UnitType } from '@microsoft/msfs-sdk';

import { FlightPlanBaseData, FlightPlanBaseListData } from './FlightPlanDataTypes';
import { FlightPlanListManager } from './FlightPlanListManager';
import { FlightPlanStore } from './FlightPlanStore';

/**
 * Represents a flight plan segment in a list.
 * Wraps a {@link FlightPlanSegmentData} object.
 * Contains fields specific to flight plan lists.
 */
export class FlightPlanSegmentListData implements FlightPlanBaseListData {
  /** @inheritdoc */
  public readonly type = 'segment';

  /** @inheritdoc */
  public readonly isVisible = Subject.create(true);

  public readonly heightPx = Subject.create(0);

  /**
   * Creates a new segment list data object.
   * @param segmentData The flight plan segment data to wrap.
   * @param store The flight plan store this belongs to.
   * @param listManager The list manager that this belongs to.
   */
  public constructor(
    public readonly segmentData: FlightPlanSegmentData,
    private readonly store: FlightPlanStore,
    private readonly listManager: FlightPlanListManager,
  ) { }

  /** Call when this segment is rmoved from the plan. */
  public destroy(): void { }
}

/**
 * Represents a flight plan segment data object.
 * It stores lots of useful info about the segment in handy dandy subscribables.
 */
export class FlightPlanSegmentData implements FlightPlanBaseData {
  /** @inheritdoc */
  public readonly type = 'segment';

  private readonly _airway = Subject.create<string | undefined>(undefined);
  /** The airway name of the segment, or `undefined` if the segment is not an airway. */
  public readonly airway = this._airway as Subscribable<string | undefined>;

  /** Whether the segment is an airway. */
  public readonly isAirway = this._airway.map(airway => airway !== undefined) as Subscribable<boolean>;

  private readonly _segmentIndex = Subject.create<number>(-1);
  /** The index of the segment in the flight plan. */
  public readonly segmentIndex = this._segmentIndex as Subscribable<number>;

  /** The total distance of all legs in the segment. */
  public readonly distance = NumberUnitSubject.create(UnitType.METER.createNumber(NaN));

  /** The total estimated time enroute of all legs in the segment. */
  public readonly estimatedTimeEnroute = NumberUnitSubject.create(UnitType.SECOND.createNumber(NaN));

  /** Whether the plan's active leg is in this segment. */
  public readonly isActiveSegment = MappedSubject.create(
    ([activeSegmentIndex, segmentIndex]) => activeSegmentIndex !== undefined
      && activeSegmentIndex >= 0
      && activeSegmentIndex === segmentIndex,
    this.store.activeLegSegmentIndex,
    this.segmentIndex
  );

  /**
   * The long procedure name for this segment, or `undefined` if the segment has no procedure name.
   * If a procedure, it contains the transition. Or it could be the airway name.
   */
  public readonly procedureNameLong = this.getProcedureNameLong();

  /**
   * Creates a new leg list data object.
   * @param segment The containing segment.
   * @param planIndex The index of the flight plan that this leg belongs to.
   * @param store The flight plan store.
   * @param plan The flight plan that this leg exists in.
   */
  public constructor(
    /** A reference to the segment in the flight plan. */
    public readonly segment: FlightPlanSegment,
    public readonly planIndex: number,
    private readonly store: FlightPlanStore,
    public readonly plan: FlightPlan,
  ) {
    this._airway.set(segment.airway);

    this._segmentIndex.set(segment.segmentIndex);
  }

  /**
   * Gets the procedure name for this segment.
   * @returns A subscribable that provides the procedure name for this segment, or `undefined` if the segment has no procedure name.
   */
  private getProcedureNameLong(): Subscribable<string | undefined> {
    switch (this.segment.segmentType) {
      case FlightPlanSegmentType.Departure:
        return this.store.departureNameWithTransition;
      case FlightPlanSegmentType.Arrival:
        return this.store.arrivalNameWithTransition;
      case FlightPlanSegmentType.Approach:
        return this.store.approachNameWithTransition;
      case FlightPlanSegmentType.MissedApproach:
        return Subject.create('Missed Approach');
      default:
        return this.airway !== undefined ? this.airway : Subject.create(undefined);
    }
  }

  /**
   * Sets the new segment index.
   * @param segmentIndex The new segment index.
   */
  public updateSegmentIndex(segmentIndex: number): void {
    this._segmentIndex.set(segmentIndex);
  }

  /**
   * Handles the airway changing.
   * @param airway The new airway.
   */
  public onAirwayChanged(airway: string | undefined): void {
    this._airway.set(airway);
  }

  /** Call when this leg is rmoved from the plan. */
  public destroy(): void { }
}

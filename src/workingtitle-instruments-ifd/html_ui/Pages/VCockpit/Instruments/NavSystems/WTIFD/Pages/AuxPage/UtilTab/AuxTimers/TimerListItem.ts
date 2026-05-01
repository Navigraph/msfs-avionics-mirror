import { MutableSubscribable } from '@microsoft/msfs-sdk';

import { DynamicListData } from '../../../../Components/List';
import { CustomTimer } from '../../../../Systems/Timer/CustomTimer';
import { EventTimer } from '../../../../Systems/Timer/EventTimer';
import { GenericTimer } from '../../../../Systems/Timer/GenericTimer';
import { TripTimer } from '../../../../Systems/Timer/TripTimer';

export enum IfdAuxTimerType {
  Generic,
  Trip,
  Event,
  Custom,
}

/** Base ype for the timer list items. */
interface BaseTimerListItemData extends DynamicListData {
  /** The label for the timer. If mutable it will be settable in the UI. */
  readonly label: string | MutableSubscribable<string>;

  /** The type of timer. */
  readonly type: IfdAuxTimerType;
}

/** Data for the generic timer. */
export interface GenericTimerListItemData extends BaseTimerListItemData {
  /** @inheritdoc */
  readonly type: IfdAuxTimerType.Generic;
  /** The timer to use. */
  readonly timer: GenericTimer;
}

/** Data for the trip timer. */
export interface TripTimerListItemData extends BaseTimerListItemData {
  /** @inheritdoc */
  readonly type: IfdAuxTimerType.Trip;
  /** The timer to use. */
  readonly timer: TripTimer;
}

/** Data for the event timer. */
export interface EventTimerListItemData extends BaseTimerListItemData {
  /** @inheritdoc */
  readonly type: IfdAuxTimerType.Event;
  /** The timer to use. */
  readonly timer: EventTimer;
}

/** Data for the custom timers. */
export interface CustomTimerListItemData extends BaseTimerListItemData {
  /** @inheritdoc */
  readonly type: IfdAuxTimerType.Custom;
  /** The timer to use. */
  readonly timer: CustomTimer;
}

/** Type for the timer list items. */
export type TimerListItemData = GenericTimerListItemData | TripTimerListItemData | EventTimerListItemData | CustomTimerListItemData;

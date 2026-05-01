import { ExtractSubjectType, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../Events/IfdInteractionEvent';
import { LineSelectKeyButtonType } from './LineSelectKeyButton';

/** A IFD line select key state. */
export type LskButtonState = {
  /** The type of button (Action or State). */
  readonly type: Subject<LineSelectKeyButtonType>;

  /** The label for the button. */
  readonly label: Subject<string | (() => VNode) | undefined>;

  /** The value for the button (only used in State type buttons). */
  readonly value: Subject<string | (() => VNode) | undefined>;

  /** Whether the button is visible. */
  readonly isVisible: Subject<boolean>;

  /** Callback function for button click (triggered on mouseup). */
  readonly onClick: Subject<(() => void) | undefined>;

  /** Callback function for knob events. Return true if handled, else false to allow the event to go to the active view. */
  readonly onKnobEvent: Subject<((event: IfdInteractionEvent) => boolean) | undefined>;
}

/** A IFD line select key state. */
export interface LskState {
  /** The state of LSK 1. */
  readonly lsk1?: LskButtonState;
  /** The state of LSK 2. */
  readonly lsk2: LskButtonState;
  /** The state of LSK 3. */
  readonly lsk3: LskButtonState;
  /** The state of LSK 4. */
  readonly lsk4: LskButtonState;
  /** The currently selected button (1, 2, 3, or 4), if any. */
  readonly selectedButton: Subject<1 | 2 | 3 | 4 | undefined>;
  /** Whether the LSK buttons are visible. */
  readonly isVisible: Subject<boolean>;
}

/** LSK state without LSK 1. */
export type Lsk234State = Omit<LskState, 'lsk1'>;

/** LSK state with all 4 LSKs. */
export type Lsk1234State = Required<LskState>;

/** Readonly version of IfdLskStateState. */
export type LskButtonStateReadonly = {
  [Item in keyof LskButtonState]: Subscribable<ExtractSubjectType<LskButtonState[Item]>>;
};

/** A IFD line select key state. */
export type LskStateReadonly = {
  /** The state of LSK 1. */
  readonly lsk1?: LskButtonStateReadonly;
  /** The state of LSK 2. */
  readonly lsk2: LskButtonStateReadonly;
  /** The state of LSK 3. */
  readonly lsk3: LskButtonStateReadonly;
  /** The state of LSK 4. */
  readonly lsk4: LskButtonStateReadonly;
  /** The currently selected button (1, 2, 3, or 4), if any. */
  readonly selectedButton: Subscribable<1 | 2 | 3 | 4 | undefined>;
  /** Whether the LSK buttons are visible. */
  readonly isVisible: Subscribable<boolean>;
}

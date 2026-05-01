import { ExtractSubjectType, ExtractSubjectTypes, MutableSubscribable, Subject, Subscribable, Subscription, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../Events/IfdInteractionEvent';
import { LineSelectKeyButtonType } from './LineSelectKeyButton';
import { Lsk1234State, Lsk234State, LskButtonState, LskState } from './LskState';

/** An Object of subscribables. */
type ObjectOfSubs = {
  readonly [key: string]: Subscribable<any>;
}

/** An Object of mutable subscribables. */
type MutableObjectOfSubs = {
  readonly [key: string]: MutableSubscribable<any>;
}

/** Collection of functions for working with the LSK Buttons. */
export class LskUtils {
  /**
   * Creates an instance of the sidebar state to be used by IfdViews.
   * @returns new sidebar state without LSK 1.
   */
  public static createState(): Lsk234State;
  /**
   * Creates an instance of the sidebar state to be used by IfdViews.
   * @param withLsk1 whether the LskState should include lsk1.
   * @returns new sidebar state.
   */
  public static createState(withLsk1: false): Lsk234State;
  /**
   * Creates an instance of the sidebar state to be used by IfdViews.
   * @param withLsk1 whether the LskState should include lsk1.
   * @returns new sidebar state.
   */
  public static createState(withLsk1: true): Lsk1234State;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public static createState(withLsk1?: boolean): LskState {
    if (withLsk1) {
      return {
        lsk1: this.createLskButtonState(),
        lsk2: this.createLskButtonState(),
        lsk3: this.createLskButtonState(),
        lsk4: this.createLskButtonState(),
        selectedButton: Subject.create<ExtractSubjectType<LskState['selectedButton']>>(undefined),
        isVisible: Subject.create<boolean>(false),
      } satisfies Lsk1234State;
    }

    return {
      lsk2: this.createLskButtonState(),
      lsk3: this.createLskButtonState(),
      lsk4: this.createLskButtonState(),
      selectedButton: Subject.create<ExtractSubjectType<LskState['selectedButton']>>(undefined),
      isVisible: Subject.create<boolean>(false),
    } satisfies Lsk234State;
  }
  /**
   * Creates an instance of the sidebar state to be used by GtcViews.
   * @param initialState The optional initial state for the button.
   * @returns new sidebar state.
   */
  public static createLskButtonState(initialState?: Partial<ExtractSubjectTypes<LskButtonState>>): LskButtonState {
    return {
      type: Subject.create(initialState?.type ?? LineSelectKeyButtonType.Action),
      label: Subject.create<string | (() => VNode) | undefined>(initialState?.label ?? ''),
      value: Subject.create<string | (() => VNode) | undefined>(initialState?.value ?? ''),
      isVisible: Subject.create(initialState?.isVisible ?? false),
      onClick: Subject.create<(() => void) | undefined>(initialState?.onClick ?? (() => { })),
      onKnobEvent: Subject.create<((event: IfdInteractionEvent) => boolean) | undefined>(initialState?.onKnobEvent ?? (() => false)),
    };
  }

  /**
   * Pipes all the subscribables from one ObjectOfSubjects to another.
   * @param from Object to pipe from.
   * @param to Object to pipe to.
   * @returns All the subscriptions made from the pipes.
   */
  public static pipeObjectOfSubs(from: ObjectOfSubs, to: MutableObjectOfSubs): Subscription[] {
    return Object.keys(from).map(x => {
      return from[x].pipe(to[x]);
    });
  }
}

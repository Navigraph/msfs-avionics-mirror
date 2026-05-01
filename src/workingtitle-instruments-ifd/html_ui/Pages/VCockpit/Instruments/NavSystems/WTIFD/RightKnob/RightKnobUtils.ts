import { MutableSubscribable, Subject, Subscribable, Subscription } from '@microsoft/msfs-sdk';

import { KnobLabelColor, KnobLabelStyle, RightKnobState } from './RightKnobState';

/** An Object of subscribables. */
type ObjectOfSubs = {
  readonly [key: string]: Subscribable<any>;
}

/** An Object of mutable subscribables. */
type MutableObjectOfSubs = {
  readonly [key: string]: MutableSubscribable<any>;
}

/** Collection of functions for working with the IfdRightKnob. */
export class RightKnobUtils {
  /**
   * Creates an instance of the sidebar state to be used by GtcViews.
   * @returns new sidebar state.
   */
  public static createState(): RightKnobState {
    return {
      labelStyle: Subject.create<KnobLabelStyle>('solid'),
      leftText: Subject.create(''),
      leftColor: Subject.create<KnobLabelColor>('mint'),
      rightText: Subject.create(''),
      rightColor: Subject.create<KnobLabelColor>('mint'),
      isVisible: Subject.create<boolean>(true),
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

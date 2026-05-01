import { ExtractSubjectType, Subject, Subscribable } from '@microsoft/msfs-sdk';

/**
 * Colors for the inner and outer knob labels.
 */
export type KnobLabelColor = 'mint' | 'green';

/**
 * Styles for the inner and outer knob labels.
 */
export type KnobLabelStyle = 'solid' | 'translucent';

/** A IFD right knob state. */
export type RightKnobState = {
  /** The style of the label. */
  readonly labelStyle: Subject<KnobLabelStyle>;
  /** The text for the left label. */
  readonly leftText: Subject<string>;
  /** The color of the left label. */
  readonly leftColor: Subject<KnobLabelColor>;
  /** The text for the right label. */
  readonly rightText: Subject<string>;
  /** The color of the right label. */
  readonly rightColor: Subject<KnobLabelColor>;
  /** Whether the knob label is visible. */
  readonly isVisible: Subject<boolean>;
}

/** Readonly version of IfdRightKnobStateState. */
export type RightKnobStateReadonly = {
  [Item in keyof RightKnobState]: Subscribable<ExtractSubjectType<RightKnobState[Item]>>;
};

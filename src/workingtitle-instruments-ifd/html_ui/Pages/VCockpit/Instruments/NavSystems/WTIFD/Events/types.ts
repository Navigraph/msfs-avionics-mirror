import {IfdInteractionEvent} from './IfdInteractionEvent';

/** The type of the HEvent **/
export enum InteractionEventType {
  KEvent,
  HEvent,
}

/** The type of the radio source **/
export enum RadioTypeEnum {
  Com,
  Nav
}

/** Interface for the InteractionEventMapItem */
export interface InteractionEventMapItem {
  /** The IfdInteractionEvent name to be mapped */
  interactionEvent: IfdInteractionEvent;
  /** The KEvent name mapped to the IfdInteractionEvent */
  event: string;
  /** The type of event being mapped */
  eventType?: InteractionEventType;
}

/** The available modes of radio tuning controls */
export enum RadioTuningControlModes {
  COM = 0,
  NAV,
  XPDR
}
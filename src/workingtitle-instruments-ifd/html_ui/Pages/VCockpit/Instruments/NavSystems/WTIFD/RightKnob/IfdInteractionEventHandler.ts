import { IfdInteractionEvent } from '../Events/IfdInteractionEvent';

/**
 * A handler which can respond to and optionally handle instances of {@link IfdInteractionEvent}.
 */
export interface IfdInteractionEventHandler {
  /**
   * Handles IFD interaction events: {@link IfdInteractionEvent}.
   * @param event The event to handle.
   * @returns Whether the event was handled.
   */
  onInteractionEvent(event: IfdInteractionEvent): boolean
}

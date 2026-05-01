import { EventBus } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent, IFDInteractionEventMap, IfdInteractions } from './IfdInteractionEvent';

/**
 * Turns H events into IFD interaction events.
 */
export class IfdInteractionEventPublisher {
  /**
   * Ctor
   * @param bus The event bus.
   * @param ifdIndex The index of this IFD unit.
   */
  public constructor(private readonly bus: EventBus, private readonly ifdIndex: number) {
  }

  private static readonly IFD_EVENT_REGEX = /^WT_IFD_(\d)_(.+)$/;
  /**
   * Turns H events into IFD interaction events.
   * @param hEvent The H event that was received.
   */
  public handleHEvent(hEvent: string): void {
    let ifdInteractionEvent: IfdInteractionEvent | undefined;

    const match = hEvent.match(IfdInteractionEventPublisher.IFD_EVENT_REGEX);

    if (match !== null) {
      const unitIndex = parseInt(match[1]);
      if (unitIndex !== this.ifdIndex) {
        return;
      }
      ifdInteractionEvent = IFDInteractionEventMap[match[2]];
    }

    if (!ifdInteractionEvent) {
      return;
    }

    this.bus.getPublisher<IfdInteractions>().pub('ifd_interaction_event', ifdInteractionEvent, false, false);
  }
}

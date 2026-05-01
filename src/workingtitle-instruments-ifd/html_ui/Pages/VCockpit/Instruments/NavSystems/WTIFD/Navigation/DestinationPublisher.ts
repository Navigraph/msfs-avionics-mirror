import { EventBus, Instrument, OneWayRunway } from '@microsoft/msfs-sdk';
import { FlightPlanStore } from '../FlightPlan';

/** Data events for the DestinationPublisher. */
export interface IfdDestinationEvents {
  /** Destination airport ident, if set. */
  ifd_destination_airport: string | null;
  /** Destination runway object, if set. */
  ifd_destination_runway: OneWayRunway | null;
}

/** Publishes the destination airport and runway. */
export class DestinationPublisher implements Instrument {
  /**
   * Constructs a new instance.
   * @param bus The instrument event bus.
   * @param flightPlanStore The flight plan store to use.
   */
  constructor(private readonly bus: EventBus, private readonly flightPlanStore: FlightPlanStore) {}

  /** @inheritDoc */
  init(): void {
    this.flightPlanStore.destinationIdent.sub(destIdent =>
      this.bus.getPublisher<IfdDestinationEvents>().pub('ifd_destination_airport', destIdent ?? null, true, true));
    this.flightPlanStore.destinationRunway.sub(runway =>
      this.bus.getPublisher<IfdDestinationEvents>().pub('ifd_destination_runway', runway ?? null, true, true));
  }

  /** @inheritDoc */
  onUpdate(): void {
    // noop
  }
}

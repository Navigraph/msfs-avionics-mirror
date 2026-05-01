import { AdcEvents, ConsumerSubject, EventBus, GameStateProvider, SimVarValueType, Subject, Wait } from '@microsoft/msfs-sdk';
import { GnssReceiverEvents } from '../Systems/Gnss/GnssTypes';

/** Air-ground monitor events. */
export interface AirGroundEvents {
  /** Whether the aircraft is considered on ground. */
  air_ground_on_ground: boolean;
}

/** An air-ground monitor for fixed-wing applications. */
export class FixedWingAirGroundMonitor {
  private readonly groundSpeed = ConsumerSubject.create(this.bus.getSubscriber<GnssReceiverEvents>().on('gnss_ground_speed_kts'), null);

  /**
   * IFD fixed wing logic = on ground when at or below 30 knots, in air when at or above 50 knots.
   * We initialise with sim state the first time to support different spawn states.
   */
  private readonly onGround = Subject.create(true);

  /**
   * Constructs a new instance.
   * @param bus The event bus to use.
   */
  constructor(private readonly bus: EventBus) {
    Wait.awaitSubscribable(GameStateProvider.get(), (s) => s === GameState.ingame, true).then(() => {
      this.onGround.set(SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0);

      this.groundSpeed.sub((v) => {
        if (v === null) {
          return;
        }
        if (v >= 50) {
          this.onGround.set(false);
        } else if (v <= 30) {
          this.onGround.set(true);
        }
      }, true);

      const publisher = this.bus.getPublisher<AirGroundEvents>();
      this.onGround.sub((v) => publisher.pub('air_ground_on_ground', v, false, true), true);
    });
  }
}

/** An air-ground monitor for helicopter applications. */
export class HelicopterAirGroundMonitor {
  /**
   * IFD helicopter logic = weight on wheels switch.
   */
  private readonly onGround = ConsumerSubject.create(this.bus.getSubscriber<AdcEvents>().on('on_ground'), true);

  /**
   * Constructs a new instance.
   * @param bus The event bus to use.
   */
  constructor(private readonly bus: EventBus) {
    Wait.awaitSubscribable(GameStateProvider.get(), (s) => s === GameState.ingame, true).then(() => {
      const publisher = this.bus.getPublisher<AirGroundEvents>();

      this.onGround.sub((v) => publisher.pub('air_ground_on_ground', v, false, true), true);
    });
  }
}

import { AdcEvents, APEvents, ConsumerSubject, EngineEvents, EventBus, GameStateProvider, LNavDataEvents, MappedSubject, Wait } from '@microsoft/msfs-sdk';

import { FmsMessageKey, FmsMessageTransmitter } from '../FmsMessageSystem';
import { FuelTotalizerEvents } from '../Fuel';
import { Epic2PerformancePlan } from '../Performance';
import { AdahrsSystemEvents, AdahrsSystemSelectorEvents, FmsPositionSystemEvents } from '../Systems';

/**
 * Manager for FMS fuel messages
 */
export class FmsMessageManager {
  private readonly sub = this.bus.getSubscriber<FuelTotalizerEvents & EngineEvents & AdcEvents>();
  private readonly fmsMessageTransmitter = new FmsMessageTransmitter(this.bus);

  private readonly adahrsIndex = ConsumerSubject.create(this.bus.getSubscriber<AdahrsSystemSelectorEvents>().on('adahrs_selector_selected_index_1'), 0);

  private isOnGround = ConsumerSubject.create(this.sub.on('on_ground'), true);

  /** Fuel Variables */

  private readonly acftFuelWeight = ConsumerSubject.create(this.sub.on('fuel_total_weight'), 0);
  private readonly fmsFuelWeight = ConsumerSubject.create(this.sub.on('fuel_totalizer_remaining'), 0);
  private readonly isFmsFuelWeightIncorrect = MappedSubject.create(
    ([acftFuelWeight, fmsFuelWeight, onGround]) => !onGround && Math.abs(acftFuelWeight - fmsFuelWeight) > 50,
    this.acftFuelWeight, this.fmsFuelWeight, this.isOnGround
  );

  /** Position Variables */

  private readonly currentBaroSetting = ConsumerSubject.create(this.bus.getSubscriber<AdcEvents>().on('altimeter_baro_setting_mb'), 0);
  private readonly currentAltitude = ConsumerSubject.create(this.bus.getSubscriber<AdcEvents>().on('indicated_alt'), 0);
  private readonly currentVertSpeed = ConsumerSubject.create(this.bus.getSubscriber<AdcEvents>().on('vertical_speed').whenChangedBy(10), 0);
  private readonly preselectAltitude = ConsumerSubject.create(this.bus.getSubscriber<APEvents>().on('ap_altitude_selected'), 0);
  private readonly cruiseAltitude = this.perfPlan.cruiseAltitude;

  private readonly isCruiseLessThanPresel = MappedSubject.create(
    ([preselAlt, cruiseAlt]) => cruiseAlt !== null && cruiseAlt < preselAlt,
    this.preselectAltitude, this.cruiseAltitude
  );

  private readonly isBaroIncorrect = MappedSubject.create(([transitionAlt, altitude, vertSpeed, baro]) => {
    const transAltError = altitude - transitionAlt;
    return (
      Math.round(baro) !== 1013 && ((vertSpeed > 100 && transAltError >= 1000) || (vertSpeed > -100 && vertSpeed < 100 && transAltError > 250)) ||
      Math.round(baro) === 1013 && ((vertSpeed < -100 && transAltError <= -1000) || (vertSpeed > -100 && vertSpeed < 100 && transAltError < -250))
    );
  },
  this.perfPlan.transitionAltitude, this.currentAltitude, this.currentVertSpeed, this.currentBaroSetting);

  /** GPS Variables */

  private readonly epu = ConsumerSubject.create(this.bus.getSubscriber<FmsPositionSystemEvents>().on('fms_pos_epu_1'), 0);
  private readonly rnp = ConsumerSubject.create(this.bus.getSubscriber<LNavDataEvents>().on('lnavdata_cdi_scale'), 0);

  private readonly isGpsDegraded = MappedSubject.create(([epu, rnp]) => epu > rnp, this.epu, this.rnp);

  /** @inheritdoc */
  constructor (private readonly bus: EventBus, private readonly perfPlan: Epic2PerformancePlan) {
    this.adahrsIndex.sub((adahrsIndex) => {
      this.currentBaroSetting.setConsumer(this.bus.getSubscriber<AdahrsSystemEvents>().on(`adahrs_left_altimeter_baro_setting_inhg_${adahrsIndex}`));
      this.currentAltitude.setConsumer(this.bus.getSubscriber<AdahrsSystemEvents>().on(`adahrs_left_indicated_alt_${adahrsIndex}`));
      this.currentVertSpeed.setConsumer(this.bus.getSubscriber<AdahrsSystemEvents>().on(`adahrs_vertical_speed_${adahrsIndex}`));
    }, true);

    // delay the messages until everything has a chance to setup, to avoid spurious message on spawn
    Wait.awaitSubscribable(GameStateProvider.get(), s => s === GameState.ingame, true).then(() => {
      Wait.awaitFrames(5).then(() => {
        this.setupFuelMessages();
        this.setupGpsMessages();
        this.setupPositionMessages();
      });
    });
  }

  /** Handles fuel related messages */
  private setupFuelMessages(): void {
    this.isFmsFuelWeightIncorrect.sub((sendMessage) => sendMessage && this.fmsMessageTransmitter.sendMessage(FmsMessageKey.CompareFuelQty));
  }

  /** Handles position related messages */
  private setupPositionMessages(): void {
    this.isCruiseLessThanPresel.sub((sendMessage) => sendMessage && this.fmsMessageTransmitter.sendMessage(FmsMessageKey.ResetAltSel));

    this.isBaroIncorrect.sub((sendMessage) => sendMessage && this.fmsMessageTransmitter.sendMessage(FmsMessageKey.CheckBaroSet));
  }

  /** Handles GPS related messages */
  private setupGpsMessages(): void {
    this.isGpsDegraded.sub((sendMessage) => sendMessage && this.fmsMessageTransmitter.sendMessage(FmsMessageKey.UnableRnp));
  }
}

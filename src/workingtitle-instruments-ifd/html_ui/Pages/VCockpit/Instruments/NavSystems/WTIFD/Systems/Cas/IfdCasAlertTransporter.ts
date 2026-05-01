import { EventBus, MutableSubscribable, Subject, Subscribable, SubscribableUtils } from '@microsoft/msfs-sdk';

import { CAS_MESSAGES, CasMessageDefinition } from './CasMessages';
import { CasUuid } from './CasUuid';
import { IfdCasControlEvents } from './IfdCasControlEvents';

/** A transporter for IFD cas messages, simplified but akin to the SDK CasAlertTransporter. */
export class IfdCasAlertTransporter {
  private readonly pub = this.bus.getPublisher<IfdCasControlEvents>();

  private readonly isActive: MutableSubscribable<boolean>;

  /**
   * Constructs a new instance.
   * @param bus The event bus.
   * @param uuid UUID of the alert to control.
   * @param def Definition of the alert to control.
   * @param alwaysNotify Whether to always notify the alert when set, even if the state didn't change.
   */
  private constructor(private readonly bus: EventBus, private readonly uuid: CasUuid, def: CasMessageDefinition, alwaysNotify: boolean) {
    this.isActive = alwaysNotify ? Subject.create(false, SubscribableUtils.NEVER_EQUALITY) : Subject.create(false);

    this.isActive.sub((v) => {
      if (v) {
        this.pub.pub('ifd_cas_activate_alert', this.uuid, !!def.isGlobal, false);
      } else {
        this.pub.pub('ifd_cas_deactivate_alert', this.uuid, !!def.isGlobal, false);
      }
    });
  }

  /**
   * Creates a new transporter.
   * @param bus The event bus.
   * @param uuid UUID of the alert to control.
   * @param alwaysNotify Whether to always notify the alert when set, even if the state didn't change.
   * @returns the new transporter.
   * @throws If the UUID is invalid (has no definition).
   */
  public static create(bus: EventBus, uuid: CasUuid, alwaysNotify = false): IfdCasAlertTransporter {
    const def = CAS_MESSAGES[uuid];
    if (!def) {
      throw new Error(`[IfdCasAlertTransporter] Invalid UUID "${uuid}"!`);
    }
    return new IfdCasAlertTransporter(bus, uuid, def, alwaysNotify);
  }

  /**
   * Sets the current state of the alert.
   * @param state The new state to set.
   */
  public set(state: boolean): void {
    this.isActive.set(state);
  }

  /**
   * The default map function for a bound subscribable.
   * @param value The value to map.
   * @returns true if the value is truthy.
   */
  private static defaultMap(value: any): boolean {
    return !!value;
  }

  /**
   * Binds a subscribable to the state of the alert.
   * @param sub The subscribable to bind.
   * @param map A map function that transforms the subscribable to a boolean state.
   */
  public bind<T>(sub: Subscribable<T>, map: (value: T) => boolean = IfdCasAlertTransporter.defaultMap): void {
    sub.pipe(this.isActive, map);
  }
}

/**
 * Factory for IFD CAS alert transporters.
 * @param bus The event bus.
 * @param uuid The CAS alert UUID.
 * @param alwaysNotify Whether to always notify the alert when set, even if the state didn't change.
 * @returns A shiny new transporter.
 */
export function casTransporterFactory(bus: EventBus, uuid: CasUuid, alwaysNotify = false): IfdCasAlertTransporter {
  return IfdCasAlertTransporter.create(bus, uuid, alwaysNotify);
}

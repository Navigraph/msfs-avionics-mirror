import {
  Accessible, AdcEvents, AhrsEvents, APGpsSteerDirectorSteerCommand, ConsumerSubject, EventBus, LerpLookupTable, LNavComputer, Subject,
} from '@microsoft/msfs-sdk';

import { UnsLnavHeadingSteerCommand } from './UnsLnavHeadingSteerCommand';

/**
 * Events to control a {@link UnsLnavSteeringController}
 */
export interface UnsLnavControlEvents {
  /** Sets the current active LNAV mode */
  'unslnav_set_mode': UnsLnavMode,

  /** Sets the current commanded heading */
  'unslnav_set_commanded_heading': [number, 'left' | 'right'],
}

/**
 * UNS-1 LNAV steering events
 */
export interface UnsLnavSteeringStateEvents extends APGpsSteerDirectorSteerCommand {
  /** the LNAV mode */
  mode: UnsLnavMode,

  /** the current commanded heading */
  commandedHeading: number | null,

  /** the current commanded turn direction */
  commandedTurnDirection: 'left' | 'right' | null,
}

export enum UnsLnavMode {
  FlightPlanTracking = 'FP_TRACKING',
  Heading = 'HDG',
  HeadingIntercept = 'HDG_INTCPT',
}

/**
 * UNS-1 LNAV steering provider
 */
export class UnsLnavSteeringController {
  public static readonly NULL_COMMAND: APGpsSteerDirectorSteerCommand = { isValid: true, desiredBankAngle: 0, dtk: 0, xtk: 0, tae: 0 };

  private readonly lnavMode = Subject.create<UnsLnavMode>(UnsLnavMode.FlightPlanTracking);

  private readonly commandedHeadingSub = Subject.create<number | null>(null);

  private readonly commandedTurnDirectionSub = Subject.create<'left' | 'right' | null>(null);

  private readonly planeHeadingSub = ConsumerSubject.create<number | null>(null, null);

  private readonly planeAltitudeSub = ConsumerSubject.create<number | null>(null, null);

  private readonly headingSteerCommand = new UnsLnavHeadingSteerCommand(
    this.commandedHeadingSub,
    this.commandedTurnDirectionSub,
    this.planeHeadingSub,
    this.planeAltitudeSub,
    this.maxBankAngleTable,
  );

  public readonly steerCommand: Accessible<Readonly<APGpsSteerDirectorSteerCommand>> = {
    get: (): Readonly<APGpsSteerDirectorSteerCommand> => {
      let command = UnsLnavSteeringController.NULL_COMMAND;

      switch (this.lnavMode.get()) {
        case UnsLnavMode.FlightPlanTracking:
          command = this.getFlightPlanTrackingCommand();
          break;
        case UnsLnavMode.Heading:
          command = this.headingSteerCommand.get();
          break;
        case UnsLnavMode.HeadingIntercept:
          // noop;
          break;
      }

      this.publishCommandDetails(command);

      return command;
    }
  };

  /**
   * Constructor
   *
   * @param bus the event bus
   * @param lnavComputer the LNAV computer
   * @param maxBankAngleTable a lookup table, if applicable, of altitudes to bank angle limits.
   * If not specified, only the 30 degree limit is used.
   */
  constructor(private readonly bus: EventBus, private readonly lnavComputer: LNavComputer, private readonly maxBankAngleTable: LerpLookupTable | undefined) {
    // TODO simulate heading/altitude source?
    this.planeHeadingSub.setConsumer(bus.getSubscriber<AhrsEvents>().on('hdg_deg').whenChanged());
    this.planeAltitudeSub.setConsumer(bus.getSubscriber<AdcEvents>().on('pressure_alt').whenChanged());

    this.setupControlEvents();
  }

  /**
   * Sets up the LNAV control events
   */
  private setupControlEvents(): void {
    const controlEventsSub = this.bus.getSubscriber<UnsLnavControlEvents>();

    controlEventsSub.on('unslnav_set_mode').handle((mode) => this.lnavMode.set(mode));
    controlEventsSub.on('unslnav_set_commanded_heading').handle(([heading, turnDirection]) => {
      this.commandedHeadingSub.set(heading);
      this.commandedTurnDirectionSub.set(turnDirection);
    });
  }

  /**
   * Publishes details of the GPS steering command
   *
   * @param command the command
   */
  private publishCommandDetails(command: APGpsSteerDirectorSteerCommand): void {
    const pub = this.bus.getPublisher<UnsLnavSteeringStateEvents>();

    pub.pub('mode', this.lnavMode.get());
    pub.pub('commandedHeading', this.commandedHeadingSub.get());
    pub.pub('commandedTurnDirection', this.commandedTurnDirectionSub.get());
    pub.pub('isValid', command.isValid);
    pub.pub('desiredBankAngle', command.desiredBankAngle);
    pub.pub('dtk', command.dtk);
    pub.pub('xtk', command.xtk);
    pub.pub('tae', command.tae);
  }

  /**
   * Returns the steering command for the FlightPlanTracking LNAV mode
   *
   * @returns a GPS steering command
   */
  private getFlightPlanTrackingCommand(): APGpsSteerDirectorSteerCommand {
    return this.lnavComputer.steerCommand.get();
  }
}

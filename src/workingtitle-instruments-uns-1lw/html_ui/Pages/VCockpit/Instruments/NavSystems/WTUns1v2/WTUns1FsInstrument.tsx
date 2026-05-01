import {
  ActiveLegType, AdcPublisher, AhrsPublisher, AirportFacility, APRadioNavInstrument, Autopilot, AutopilotInstrument, ClockPublisher,
  DefaultFlightPathAnticipatedDataCalculator, EISPublisher, EventBus, FacilityLoader, FacilityRepository, FacilityType, FacilityUtils,
  FlightPathAirplaneSpeedMode, FlightPathAirplaneWindMode, FlightPathCalculator, FlightPlanner, FlightPlannerEvents, FlightPlanRouteManager,
  FlightPlanRouteUtils, FlightTimerInstrument, FlightTimerPublisher, FSComponent, FsInstrument, GNSSPublisher, GpsSynchronizer, HEventPublisher, ICAO,
  InstrumentBackplane, NavComSimVarPublisher, NearestContext, SimVarValueType, SmoothingPathCalculator, Subject, UnitType, VNode, Wait
} from '@microsoft/msfs-sdk';

import { UnsAPConfig } from './Autopilot/UnsAPConfig';
import { UnsAPStateManager } from './Autopilot/UnsAPStateManager';
import { UnsAutopilot } from './Autopilot/UnsAutopilot';
import { UnsCduDisplay } from './CduDisplay/UnsCduDisplay';
import {
  CJ4_CONTROL_KEYS, CJ4_CONTROL_KEYS_TO_UNS_EVENTS, CJ4_FUNCTION_KEYS, CJ4_FUNCTION_KEYS_TO_UNS_EVENTS, CJ4ControlKeyNames, CJ4FunctionKeyNames,
  UnsCduHEventMap, UnsFmcEvents
} from './CduDisplay/UnsFmcEvents';
import { FmsConfigBuilder, UnsFmsConfigInterface } from './Config/FmsConfigBuilder';
import { UnsApproachStateController } from './Fms/Navigation/UnsApproachStateController';
import { UnsExternalGuidancePublisher } from './Fms/Navigation/UnsExternalGuidancePublisher';
import { UnsFlightAreaComputer } from './Fms/Navigation/UnsFlightAreaComputer';
import { UnsLNavComputer } from './Fms/Navigation/UnsLNavComputer';
import { UnsLnavSteeringController } from './Fms/Navigation/UnsLnavSteeringController';
import { UnsNavDataComputer } from './Fms/Navigation/UnsNavDataComputer';
import { UnsNearestContext } from './Fms/Navigation/UnsNearestContext';
import { UnsPositionSystem } from './Fms/Navigation/UnsPositionSystems';
import { UnsRadioNavaidManager } from './Fms/Navigation/UnsRadioNavaidManager';
import { UnsElapsedFlightTimeInstrument } from './Fms/Performance/UnsElapsedFlightTimeInstrument';
import { UnsFuelComputerInstrument, UnsFuelComputerSimVarPublisher } from './Fms/Performance/UnsFuelComputerInstrument';
import { UnsFlightPlanRouteLoader } from './Fms/Route/UnsFlightPlanRouteLoader';
import { UnsFlightPlanRouteSyncManager } from './Fms/Route/UnsFlightPlanRouteSyncManager';
import { UnsFlightPlanPredictor } from './Fms/UnsFlightPlanPredictor';
import { UnsFms } from './Fms/UnsFms';
import { UnsFlightPlans } from './Fms/UnsFmsTypes';
import { UnsFmsUtils } from './Fms/UnsFmsUtils';
import { WTUns1 } from './WTUns1';

import './WTUns1.css';

/**
 * UNS instrument index
 */
export type UnsIndex = 1 | 2 | 3

/** Events for whether the UNS has been set to on/off */
export interface UnsPowerEvents {
  /** Sets whether the UNS should be turned on or off */
  set_uns_power: boolean;

  /** Fired when the UNS reboots from a power fail over 7 seconds - causes power fail page to be displayed */
  uns_power_fail: number
}

/**
 * UNS-1b FsInstrument
 */
export class WTUns1FsInstrument implements FsInstrument {
  private readonly bus = new EventBus();

  public readonly fmsConfig: UnsFmsConfigInterface;
  public readonly fmsConfigErrors: ReadonlyMap<string, boolean>;

  private readonly backplane = new InstrumentBackplane();

  private readonly clockPublisher = new ClockPublisher(this.bus);
  private readonly hEventPublisher = new HEventPublisher(this.bus);
  private readonly gnssPublisher = new GNSSPublisher(this.bus);
  private readonly adcPublisher = new AdcPublisher(this.bus);
  private readonly ahrsPublisher = new AhrsPublisher(this.bus);
  private readonly eisPublisher: EISPublisher = new EISPublisher(this.bus);
  private readonly powerPublisher = this.bus.getPublisher<UnsPowerEvents>();
  private readonly fuelPublisher = new UnsFuelComputerSimVarPublisher(this.bus);
  private readonly navComPublisher = new NavComSimVarPublisher(this.bus);

  private readonly apInstrument = new AutopilotInstrument(this.bus);
  private readonly apRadioNavInstrument = new APRadioNavInstrument(this.bus);
  private readonly fuelComputer: UnsFuelComputerInstrument;
  private readonly radioNavaidManager: UnsRadioNavaidManager;
  private readonly positionSystem: UnsPositionSystem;
  private readonly flightTimerInstrument = new FlightTimerInstrument(this.bus, 3);
  private readonly flightTimerPublisher = new FlightTimerPublisher(this.bus, -1);
  private readonly elapsedFlightTimer: UnsElapsedFlightTimeInstrument;

  private readonly navdataComputer: UnsNavDataComputer;

  private readonly facLoader = new FacilityLoader(FacilityRepository.getRepository(this.bus));
  private nearestContext = new UnsNearestContext(this.bus, this.facLoader);

  private readonly flightPathCalculator = new FlightPathCalculator(
    this.facLoader,
    {
      defaultClimbRate: 2000,
      defaultSpeed: 180,
      bankAngle: [
        [15, 0],
        [25, 100],
        [25, 375],
        [19, 450],
      ],
      holdBankAngle: null,
      courseReversalBankAngle: null,
      turnAnticipationBankAngle: null,
      maxBankAngle: 25,
      airplaneSpeedMode: FlightPathAirplaneSpeedMode.TrueAirspeedPlusWind,
      airplaneWindMode: FlightPathAirplaneWindMode.Automatic,
      anticipatedDataCalculator: new DefaultFlightPathAnticipatedDataCalculator(this.bus,
        {
          descentSpeedProfileKtsBelow10k: 220, descentSpeedProfileKtsAbove10k: 260, typicalVRef: 130
        })
    },
    this.bus,
  );

  private readonly flightPlanner: FlightPlanner;

  private readonly gpsSynchronizer: GpsSynchronizer;

  private readonly lnavComputer: UnsLNavComputer | undefined;

  private readonly lnavSteeringController: UnsLnavSteeringController | undefined;

  private readonly flightPlanPredictor: UnsFlightPlanPredictor;

  private readonly flightPlanRouteSyncManager?: UnsFlightPlanRouteSyncManager;

  private readonly apStateManager: UnsAPStateManager | undefined;

  private readonly autopilot: Autopilot | undefined;

  private readonly verticalPathCalculator: SmoothingPathCalculator;

  private readonly fms: UnsFms;

  private readonly approachStateController: UnsApproachStateController;

  private readonly flightAreaComputer: UnsFlightAreaComputer;

  private readonly externalGuidancePublisher?: UnsExternalGuidancePublisher;

  private lastCalculate = 0;

  private readonly activeLegIndex = Subject.create(-1);

  private readonly destinationFacility = Subject.create<AirportFacility | null>(null);

  private maxBankAngleFn = (): number => {
    if (this.fmsConfig.lnav.bankAngleLimits) {
      const altitude = SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Feet);

      const tableValue = this.fmsConfig.lnav.bankAngleLimits.get(altitude);
      return Math.min(30, tableValue);
    }

    return 30;
  };

  /**
   * Ctor
   *
   * @param instrument the base instrument
   */
  constructor(public readonly instrument: WTUns1) {
    if (instrument.instrumentXmlConfig === undefined) {
      throw new Error(`[WTUns1] The Instrument configuration cannot be found. Ensure there is an <Instrument> config object with a child "<Name>${instrument.instrumentIdentifier}</Name>" in panel.xml`);
    }

    SimVar.SetSimVarValue('L:XMLVAR_NEXTGEN_FLIGHTPLAN_ENABLED', SimVarValueType.Bool, true);

    const fmsConfigBuilder = new FmsConfigBuilder(instrument.instrumentXmlConfig, instrument);
    this.fmsConfig = fmsConfigBuilder.getConfig();
    this.fmsConfigErrors = fmsConfigBuilder.getErrors();

    this.flightPlanner = FlightPlanner.getPlanner(
      this.fmsConfig.flightPlanner.id,
      this.bus,
      {
        calculator: this.flightPathCalculator,
        getLegName: UnsFmsUtils.buildUnsLegName,
      },
    );

    this.gpsSynchronizer = new GpsSynchronizer(this.bus, this.flightPlanner, this.facLoader, { lnavIndex: this.fmsConfig.lnav.index });

    if (this.fmsConfig.index === 1) {
      this.lnavComputer = new UnsLNavComputer(
        this.fmsConfig.lnav.index,
        this.bus,
        this.flightPlanner,
        this.maxBankAngleFn
      );

      this.lnavSteeringController = new UnsLnavSteeringController(
        this.bus,
        this.lnavComputer.steerCommand,
        this.fmsConfig.lnav.bankAngleLimits,
      );

      if (this.fmsConfig.lnav.publishLnavGuidance) {
        this.externalGuidancePublisher = new UnsExternalGuidancePublisher(this.fmsConfig.lnav.index);
      }
    }

    this.flightPlanPredictor = new UnsFlightPlanPredictor(
      this.bus,
      this.flightPlanner,
      Subject.create(UnsFlightPlans.Active),
      this.activeLegIndex,
      {
        minimumPredictionsGroundSpeed: 150,
        predictMissedApproachLegs: true,
        considerTurnAsLegTermination: false,
      },
      this.destinationFacility,
    );

    if (this.fmsConfig.index === 1 && this.fmsConfig.autopilot && this.lnavComputer && this.lnavSteeringController) {
      const unsAPConfig = new UnsAPConfig(
        this.bus,
        this.lnavSteeringController.steerCommand,
        this.fmsConfig.autopilot
      );

      this.apStateManager = new UnsAPStateManager(this.bus, unsAPConfig);
      this.autopilot = new UnsAutopilot(this.bus, this.flightPlanner, unsAPConfig, this.apStateManager);
    } else if (this.fmsConfig.autopilot) {
      console.error('WTUns1: Cannot instantiate autopilot on any FMS other than FMS 1');
    }

    this.verticalPathCalculator = new SmoothingPathCalculator(this.bus, this.flightPlanner, UnsFlightPlans.Active);
    this.fms = new UnsFms(
      this.bus,
      this.fmsConfig,
      this.flightPlanner,
      this.verticalPathCalculator,
      this.nearestContext,
      true,
      this.fmsConfig,
      this.flightPlanPredictor,
    );

    // Initialize route sync manager if we are the main UNS
    if (this.fmsConfig.index === 1) {
      this.flightPlanRouteSyncManager = new UnsFlightPlanRouteSyncManager(this.fms);
    }

    this.fuelComputer = new UnsFuelComputerInstrument(this.bus, this.fmsConfig.sensors.fuelFlow);
    this.radioNavaidManager = new UnsRadioNavaidManager(this.bus);
    this.positionSystem = new UnsPositionSystem(
      this.bus,
      this.fmsConfig.sensors.navSensors,
      this.radioNavaidManager,
    );
    this.navdataComputer = new UnsNavDataComputer(this.bus, this.flightPlanner, this.fmsConfig.lnav.index, this.fms);
    this.elapsedFlightTimer = new UnsElapsedFlightTimeInstrument(this.bus, this.fmsConfig.index);
    this.approachStateController = new UnsApproachStateController(this.bus, this.fms, this.fmsConfig);
    this.flightAreaComputer = new UnsFlightAreaComputer(this.bus, this.fms);

    this.backplane.addPublisher('clock', this.clockPublisher);
    this.backplane.addPublisher('hEvent', this.hEventPublisher);
    this.backplane.addPublisher('gnss', this.gnssPublisher);
    this.backplane.addPublisher('adc', this.adcPublisher);
    this.backplane.addPublisher('ahrs', this.ahrsPublisher);
    this.backplane.addPublisher('eis', this.eisPublisher);
    this.backplane.addPublisher('fuel', this.fuelPublisher);
    this.backplane.addPublisher('flightTimer', this.flightTimerPublisher);
    this.backplane.addPublisher('navCom', this.navComPublisher);
    this.backplane.addInstrument('autopilot', this.apInstrument);
    this.backplane.addInstrument('apRadioNav', this.apRadioNavInstrument);
    this.backplane.addInstrument('fuelComputer', this.fuelComputer);
    this.backplane.addInstrument('navaidManager', this.radioNavaidManager);
    this.backplane.addInstrument('flightTimer', this.flightTimerInstrument);
    this.backplane.addInstrument('elapsedFlightTimer', this.elapsedFlightTimer);
    this.backplane.addInstrument('approachState', this.approachStateController);
    this.backplane.addInstrument('flightAreaComputer', this.flightAreaComputer);

    this.bus.getSubscriber<UnsPowerEvents>().on('set_uns_power').handle((powered) => powered ? this.instrument.powerOn() : this.instrument.powerOff());

    this.doInit().catch(console.error);
  }

  /**
   * Initializes the instrument
   */
  private async doInit(): Promise<void> {
    this.backplane.init();

    const [, routeManager] = await Promise.all([
      this.fms.initFlightPlans(),
      FlightPlanRouteManager.getManager()
    ]);

    if (this.flightPlanRouteSyncManager) {
      this.flightPlanRouteSyncManager.init(routeManager, new UnsFlightPlanRouteLoader(this.fms));

      // Always load the synced avionics route, or the EFB route if a synced route does not exist, on flight start.
      const routeToLoad = routeManager.syncedAvionicsRoute.get() ?? routeManager.efbRoute.get();

      if (!FlightPlanRouteUtils.isRouteEmpty(routeToLoad, false)) {
        await this.flightPlanRouteSyncManager.loadRoute(routeToLoad);
      } else {
        // If the synced route is empty, then try and insert the nearest airport as origin
        this.tryInsertNearestAirportAsOrigin();
      }
    }

    this.nearestContext.init();

    this.initFlightPlanSubs();

    this.autopilot?.stateManager.initialize();

    if (this.flightPlanRouteSyncManager) {
      this.flightPlanRouteSyncManager.replyToAllPendingRequests();
      this.flightPlanRouteSyncManager.startAutoReply();
      this.flightPlanRouteSyncManager.startAutoSync();
    }

    FSComponent.render(
      this.renderComponents(),
      document.getElementById('Electricity'),
    );
  }

  /**
   * Tries to insert the nearest airport as the flight plan origin
   */
  private tryInsertNearestAirportAsOrigin(): void {
    // When the nearest context is initialized, wait for nearest airport to be available and then insert it into the plan
    // if it's less than 3NM away
    NearestContext.onInitialized(async (instance) => {
      await Wait.awaitCondition(() => instance.airports.length !== 0, 500, 15_000).catch(() => {
        console.error('[WTUns1FsInstrument](tryInsertNearestAirportAsOrigin) Wait for nearest airports took longer than 15s and timed out');
      });

      // ...but if by that time an airport was manually selected, don't bother
      if (this.fms.getPrimaryFlightPlan().originAirportIcao !== undefined) {
        return;
      }

      const nearestAirport = instance.getNearest(FacilityType.Airport);

      if (!nearestAirport) {
        return;
      }

      const distanceToArp = this.fms.pposSub.get().distance(nearestAirport);

      if (UnitType.NMILE.convertFrom(distanceToArp, UnitType.GA_RADIAN) < 3) {
        this.fms.setOrigin(nearestAirport);
      }
    });
  }

  /**
   * Sets up flight plan subs
   */
  private initFlightPlanSubs(): void {
    this.bus.getSubscriber<FlightPlannerEvents>().on('fplActiveLegChange').handle((event) => {
      if (event.planIndex !== UnsFlightPlans.Active || event.type !== ActiveLegType.Lateral) {
        return;
      }

      this.activeLegIndex.set(event.index);
    });

    this.bus.getSubscriber<FlightPlannerEvents>().on('fplOriginDestChanged').handle((event) => {
      if (event.planIndex !== UnsFlightPlans.Active) {
        return;
      }

      const destinationIcao = this.flightPlanner.getFlightPlan(UnsFlightPlans.Active).destinationAirport;

      if (!destinationIcao) {
        this.destinationFacility.set(null);
        return;
      }

      this.facLoader
        .getFacility(ICAO.getFacilityType(destinationIcao), destinationIcao)
        .then((fac) => {
          if (FacilityUtils.isFacilityType(fac, FacilityType.Airport)) {
            this.destinationFacility.set(fac);
          }
        });
    });
  }

  /**
   * Renders the UNS-1b components
   *
   * @returns the component tree
   */
  private renderComponents(): VNode {
    return (
      <UnsCduDisplay bus={this.bus} fms={this.fms} fmsConfig={this.fmsConfig} fmsConfigErrors={this.fmsConfigErrors} />
    );
  }

  /** @inheritDoc */
  public Update(): void {
    this.backplane.onUpdate();
    this.gpsSynchronizer.update();
    this.lnavComputer?.update();
    this.navdataComputer.update();
    this.autopilot?.update();
    this.externalGuidancePublisher?.update(this.lnavComputer!.steerCommand);

    const now = Date.now();

    if (now - this.lastCalculate > 3000) {
      if (this.flightPlanner.hasFlightPlan(UnsFlightPlans.Active)) {
        this.flightPlanner.getFlightPlan(UnsFlightPlans.Active).calculate();
      }

      this.flightPlanPredictor.update();

      this.lastCalculate = now;
    }
  }

  /**
   * Converts an H event array from CJ4 keys to UNS keys TODO temporary
   *
   * @param _args the H event array
   *
   * @returns a new H event array
   */
  private mapCJ4InteractionEvent(_args: string[]): [keyof UnsFmcEvents, string?] | undefined {
    const fmcButtonPrefix = `CJ4_FMC_${this.fmsConfig.index}_BTN_`;

    const evt = _args[0];

    if (evt.startsWith(fmcButtonPrefix)) {
      const lskMatch = /CJ4_FMC_\d_BTN_([LR])([1-5])/.exec(evt);
      const strippedName = evt.replace(fmcButtonPrefix, '');

      if (lskMatch) {
        const [, side, index] = lskMatch as string[];

        return [`lsk_${index as '1' | '2' | '3' | '4' | '5'}_${side.toLowerCase() as 'l' | 'r'}`];
      } else if (evt.includes('EXEC')) {
        return ['scratchpad_enter'];
      } else if (evt.includes('PREVPAGE')) {
        return ['prev_page'];
      } else if (evt.includes('NEXTPAGE')) {
        return ['next_page'];
      } else if (CJ4_CONTROL_KEYS.includes(strippedName as CJ4ControlKeyNames)) {
        return CJ4_CONTROL_KEYS_TO_UNS_EVENTS[strippedName as CJ4ControlKeyNames];
      } else if (CJ4_FUNCTION_KEYS.includes(strippedName as CJ4FunctionKeyNames)) {
        return CJ4_FUNCTION_KEYS_TO_UNS_EVENTS[strippedName as CJ4FunctionKeyNames];
      } else {
        return ['scratchpad_type', strippedName];
      }
    }

    return undefined;
  }

  /** @inheritDoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onInteractionEvent(_args: Array<string>): void {
    const evt = _args[0];

    // TODO temporary
    if (evt.startsWith('CJ4')) {
      const mappedEvent = this.mapCJ4InteractionEvent(_args);

      if (mappedEvent) {
        this.bus.getPublisher<UnsFmcEvents>().pub(mappedEvent[0], mappedEvent[1]);
        return;
      }
    }

    const [matchingEvent, matchingEventArgument] = UnsCduHEventMap.forIndex(this.fmsConfig.index).getFmcEventFromHEvent(evt);

    if (matchingEvent) {
      this.bus.getPublisher<UnsFmcEvents>().pub(matchingEvent, matchingEventArgument);
    }
  }

  /**
   * Runs when the UNS has a power failure occur for longer than 7 seconds
   * @param timeElapsed Duration of failure
   */
  public onPowerFail(timeElapsed: number): void {
    this.powerPublisher.pub('uns_power_fail', timeElapsed);
  }

  /** @inheritDoc */
  public onFlightStart(): void {
    // noop
  }

  /** @inheritDoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onGameStateChanged(oldState: GameState, newState: GameState): void {
    // noop
  }

  /** @inheritDoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onSoundEnd(soundEventId: Name_Z): void {
    // noop
  }
}

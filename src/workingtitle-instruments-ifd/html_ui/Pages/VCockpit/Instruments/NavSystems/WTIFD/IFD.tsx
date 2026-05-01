/// <reference types="@microsoft/msfs-types/js/common" />
/// <reference types="@microsoft/msfs-types/pages/vcockpit/core/vcockpit" />
/// <reference types="@microsoft/msfs-types/pages/vcockpit/instruments/shared/baseinstrument" />
/// <reference types="@microsoft/msfs-types/js/simvar" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" />

import {
  AdcPublisher, AhrsPublisher, AutopilotInstrument, AvionicsSystem, BaseInstrumentPublisher, Clock, ClockEvents, ConsumerSubject,
  DefaultFlightPathAnticipatedDataCalculator, DefaultLNavComputerDataProvider, ElectricalPublisher, EventBus, FacilityLoader, FacilityRepository,
  FlightPathAirplaneSpeedMode, FlightPathAirplaneWindMode, FlightPathCalculator, FlightPlanCalculatedEvent, FlightPlanner, FlightPlanRouteManager,
  FlightPlanRouteUtils, FlightTimerInstrument, FlightTimerPublisher, FsBaseInstrument, FSComponent, FsInstrument, GameStateProvider, GNSSPublisher,
  GpsSynchronizer, InstrumentBackplane, LNavComputer, LNavObsManager, MappedValue, NavComInstrument, NavComSimVarPublisher, NavRadioIndex, PluginSystem,
  SoundServer, TrafficInstrument, Wait, XPDRInstrument, XPDRSimVarPublisher
} from '@microsoft/msfs-sdk';

import { IfdAPConfig } from './Autopilot/IfdAPConfig';
import { IfdAPStateManager } from './Autopilot/IfdAPStateManager';
import { IfdAutopilot } from './Autopilot/IfdAutopilot';
import { IfdObsLNavModule } from './Autopilot/lnav/IfdObsLNavModule';
import { IfdChartsManager } from './Charts/IfdChartsManager';
import { IfdMapPresetService } from './Components/Map/IfdMapPresetService';
import { IfdInteractionEventPublisher } from './Events/IfdInteractionEventPublisher';
import { IfdTuningControlsManager } from './Events/IfdTuningControlsManager';
import { FlightPlanListManager, FlightPlanStore } from './FlightPlan';
import { Fms } from './Fms';
import { IfdFlightPlanRouteSyncManager } from './Fms/IfdFlightPlanRouteSyncManager';
import { IfdPrimaryFlightPlanRouteLoader } from './Fms/IfdPrimaryFlightPlanRouteLoader';
import { IfdPrimaryFlightPlanRouteProvider } from './Fms/IfdPrimaryFlightPlanRouteProvider';
import { TransitionAltitudeManager } from './Fms/TransitionAltitudeManager';
import { IfdContainer, IfdIndex } from './IfdContainer';
import { IfdAirframeType, IfdInstrumentType, IfdOptionsUtils } from './IfdOptions';
import { IfdPlugin, IfdPluginBinder } from './IfdPlugin';
import { InstrumentBackplaneNames } from './InstrumentBackplaneNames';
import { IfdIlluminationManager } from './Misc/IfdIlluminationManager';
import { IfdPowerEvents, IfdPowerMonitor } from './Misc/IfdPowerMonitor';
import { IfdStartupManager } from './Misc/IfdStartupManager';
import { IfdStartupScreen } from './Misc/IfdStartupScreen';
import { MapOrientationManager } from './Misc/MapOrientationManager';
import { ActiveNavSourceManager } from './Navigation/ActiveNavSourceManager';
import { FixedWingAirGroundMonitor, HelicopterAirGroundMonitor } from './Navigation/AirGroundMonitor';
import { DestinationPublisher } from './Navigation/DestinationPublisher';
import { FmsHooksManager } from './Navigation/FmsHooksManager';
import { IfdApproachManager } from './Navigation/IfdApproachManager';
import { IfdCdiScaleManager } from './Navigation/IfdCdiScaleManager';
import { IfdFacilityUtils } from './Navigation/IfdFacilityUtils';
import { IfdNavDataComputer } from './Navigation/IfdNavDataComputer';
import { IfdNearestContext } from './Navigation/IfdNearestContext';
import { NavEventsPublisher } from './Navigation/NavEventsPublisher';
import { GpsSource } from './Navigation/Sources/GpsNavSource';
import { IfdNavMode, IfdNavSources } from './Navigation/Sources/IfdNavSources';
import { NavRadioNavSource } from './Navigation/Sources/NavRadioNavSource';
import { NavSources } from './Navigation/Sources/NavSourceBase';
import { ObsSource } from './Navigation/Sources/ObsNavSource';
import { VLocActivationManager } from './Navigation/VLocActivationManager';
import { VLocTuningManager } from './Navigation/VLocTuningManager';
import { IfdGlidePathComputer } from './Navigation/Vnav/IfdGlidePathComputer';
import { IfdVnavManager } from './Navigation/Vnav/IfdVnavManager';
import { MapDataProvider } from './Providers/Map/MapDataProvider';
import { AlertUserSettings } from './Settings/AlertUserSettings';
import { ChartsUserSettings } from './Settings/ChartsUserSettings';
import { ComRadioUserSettings } from './Settings/ComRadioUserSettings';
import { DatablockUserSettings } from './Settings/DatablockUserSettings';
import { DisplayUserSettings } from './Settings/DisplayUserSettings';
import { FmsUserSettings } from './Settings/FmsUserSettings';
import { IfdMapUserSettingSaveManager } from './Settings/IfdMapUserSettingSaveManager';
import { IfdUserSettingSaveManager } from './Settings/IfdUserSettingSaveManager';
import { IlluminationUserSettings } from './Settings/IlluminationUserSettings';
import { MapUserSettings } from './Settings/MapUserSettings';
import { NavigationUserSettings } from './Settings/NavigationUserSettings';
import { SvsUserSettings } from './Settings/SvsUserSettings';
import { TerrainUserSettings } from './Settings/TerrainUserSettings';
import { TimerUserSettings } from './Settings/TimerUserSettings';
import { TimeUserSettings } from './Settings/TimeUserSettings';
import { TrafficOperatingModeSetting, TrafficUserSettings } from './Settings/TrafficUserSettings';
import { UnitsUserSettings } from './Settings/UnitsUserSettings';
import { VnavUserSettings } from './Settings/VnavUserSettings';
import { ArsSystem } from './Systems/ArsSystem';
import { AudioSystem } from './Systems/Audio/AudioSystem';
import { CasAlertMonitorCollection } from './Systems/Cas/CasAlertMonitorCollection';
import { IfdCasAlertManager } from './Systems/Cas/IfdCasAlertManager';
import { ExternalAdcSystem } from './Systems/ExternalAdcSystem';
import { ExternalHeadingSystem } from './Systems/ExternalHeadingSystem';
import { FmsPositionSystem } from './Systems/FmsPositionSystem';
import { IfdFuelComputer } from './Systems/FuelComputer/IfdFuelComputer';
import { GnssReceiver } from './Systems/Gnss/GnssReceiver';
import { GnssNavigationState } from './Systems/Gnss/GnssTypes';
import { Gpws } from './Systems/GPWS/Gpws';
import { AltitudeLossAfterTakeoffModule } from './Systems/GPWS/Modules/AltitudeLossAfterTakeoffModule';
import { ExcessiveDescentRateModule } from './Systems/GPWS/Modules/ExcessiveDescentRateModule';
import { ForwardLookingTerrainAlertModule } from './Systems/GPWS/Modules/ForwardLookingTerrainAlertModule';
import { PrematureDescentModule } from './Systems/GPWS/Modules/PrematureDescentModule';
import { TimerManager } from './Systems/Timer/TimerManager';
import { IfdAdsb } from './Systems/Traffic/IfdAdsb';
import { TrafficAdvisorySystem } from './Systems/Traffic/TrafficAdvisorySystem';
import { TrafficAvionicsSystem } from './Systems/Traffic/TrafficAvionicsSystem';
import { TrafficInfoService } from './Systems/Traffic/TrafficInfoService';
import { TrafficSystemType } from './Systems/Traffic/TrafficSystemType';
import { IfdDataProvider } from './Utilities/IfdDataProvider';
import { IFD_INITIAL_EVENT_VALUES } from './Utilities/IfdDataProviderConfig';
import { IfdViewService } from './ViewService';

import './IFD.css';

/**
 * Instrument Flight Display 550 and 540 (IFD).
 */
class IFD implements FsInstrument {
  /** The amount of time between periodic active flight plan calculations, in milliseconds. */
  private static readonly ACTIVE_FLIGHT_PLAN_CALC_PERIOD = 3000;

  private readonly bus = new EventBus();

  private readonly pluginSystem = new PluginSystem<IfdPlugin, IfdPluginBinder>();

  private readonly options = IfdOptionsUtils.createOptions(this.instrument);

  private readonly facRepo = FacilityRepository.getRepository(this.bus);

  private readonly facLoader = new FacilityLoader(this.facRepo, undefined, { sharedFacilityCacheId: 'wtifd' });

  private readonly isFmsPrimary = this.options.isFmsPrimary;

  private readonly cdiId = `wtifd_${this.options.instrumentIndex}`;
  private readonly flightPlannerId = this.options.flightPlannerIndex ? `wtifd_${this.options.flightPlannerIndex}` : 'wtifd';

  private readonly flightPathCalculator = new FlightPathCalculator(this.facLoader, {
    id: this.flightPlannerId,
    initSyncRole: this.options.isFmsPrimary ? 'primary' : 'replica',
    defaultClimbRate: this.options.flightPathCalculator.defaultClimbRate,
    defaultSpeed: this.options.flightPathCalculator.defaultSpeed,
    bankAngle: this.options.flightPathCalculator.bankAngle,
    holdBankAngle: null,
    courseReversalBankAngle: null,
    turnAnticipationBankAngle: null,
    maxBankAngle: this.options.flightPathCalculator.bankAngle,
    airplaneSpeedMode: FlightPathAirplaneSpeedMode.TrueAirspeedPlusWind,
    airplaneWindMode: FlightPathAirplaneWindMode.Automatic,
    anticipatedDataCalculator: new DefaultFlightPathAnticipatedDataCalculator(
      this.bus,
      {
        descentSpeedProfileKtsBelow10k: this.options.flightPathCalculator.anticipatedSpeedBelow10k,
        descentSpeedProfileKtsAbove10k: this.options.flightPathCalculator.anticipatedSpeedAbove10k,
        typicalVRef: this.options.flightPathCalculator.anticipatedApproachSpeed,
      },
    ),
  }, this.bus);

  private lastActiveFplCalcTime = 0;

  private readonly flightPlanner = FlightPlanner.getPlanner(this.flightPlannerId, this.bus, {
    calculator: this.flightPathCalculator,
  });

  private readonly navDataComputer = new IfdNavDataComputer(this.bus, this.flightPlanner, this.facLoader, this.options.lnavIndex);

  private readonly gpsSynchronizer = this.isFmsPrimary ?
    new GpsSynchronizer(this.bus, this.flightPlanner, this.facLoader, { lnavIndex: this.options.lnavIndex, vnavIndex: this.options.vnavIndex }) :
    undefined;

  private readonly flightPlanRouteSyncManager = new IfdFlightPlanRouteSyncManager();

  private readonly glidePathComputer = new IfdGlidePathComputer(this.bus, this.flightPlanner, this.options, this.isFmsPrimary);
  private readonly vnavManager = new IfdVnavManager(this.bus, this.flightPlanner, this.options, this.isFmsPrimary);

  private readonly fms = new Fms(
    this.isFmsPrimary,
    this.bus,
    this.flightPlanner,
    this.vnavManager,
    {
      cdiId: this.cdiId,
      lnavIndex: this.options.lnavIndex,
    }
  );

  private readonly chartsManager = new IfdChartsManager(this.bus);

  private readonly flightPlanStore = new FlightPlanStore(this.bus, this.fms, Fms.PRIMARY_PLAN_INDEX, this.vnavManager, this.chartsManager, this.options);

  private readonly flightPlanListManager = new FlightPlanListManager(
    this.bus,
    this.flightPlanStore,
    this.fms,
    Fms.PRIMARY_PLAN_INDEX,
  );

  private readonly nearestContext = new IfdNearestContext(this.bus, this.facLoader, this.options);
  private readonly powerMonitor = new IfdPowerMonitor(this.bus, this.options.instrumentIndex);
  private readonly isPowered = ConsumerSubject.create(this.bus.getSubscriber<IfdPowerEvents>().on('ifd_powered'), false);

  private readonly systems: AvionicsSystem[] = [];
  private gnssReceiver?: GnssReceiver;
  private fmsPositionSystem?: FmsPositionSystem;

  private readonly gpws?: Gpws;

  private readonly backplane = new InstrumentBackplane();

  private readonly flightTimerId = `wt_ifd_${this.options.instrumentIndex}`;

  // Instruments
  private readonly clock = new Clock(this.bus);
  private readonly flightTimerInstrument = new FlightTimerInstrument(this.bus, {
    count: 13,
    id: this.flightTimerId,
    useSimDuration: true,
  });
  private readonly navComInstrument = new NavComInstrument(this.bus, undefined, 2, 2, false);
  protected readonly fuelComputer = this.options.fuelFlow ? new IfdFuelComputer(this.bus, this.options.fuelFlow) : undefined;
  protected readonly trafficInstrument = this.createTrafficInstrument();
  // Navigation
  private readonly vlocSource = this.options.navIndex !== undefined
    ? new NavRadioNavSource<IfdNavSources>(this.bus, IfdNavMode.VLOC, this.options.navIndex as NavRadioIndex)
    : undefined;
  private readonly navSources = new NavSources<IfdNavSources>(...[
    new GpsSource<IfdNavSources>(this.bus, IfdNavMode.GPS, 1, this.flightPlanner, this.fms, this.options.lnavIndex, this.options.vnavIndex),
    new ObsSource<IfdNavSources>(this.bus, IfdNavMode.OBS, 1, this.flightPlanner, this.fms, this.options.lnavIndex),
    this.vlocSource,
  ].filter((v) => v !== undefined));
  private readonly cdiScaleManager = new IfdCdiScaleManager(this.bus, this.flightPlanner, this.instrument.instrumentIndex, this.options.lnavIndex);
  private readonly activeNavSourceManager = new ActiveNavSourceManager(
    this.bus,
    this.fms,
    this.navSources,
    {
      autoSlewGpsCourse: this.options.enableAutoSlew,
      cdiId: this.cdiId,
      lnavIndex: this.options.lnavIndex,
      navIndex: this.options.navIndex,
      syncWithSim: this.options.autopilot !== undefined,
      setFromKeyEvents: this.options.autopilot !== undefined,
    }
  );
  private readonly ifdApproachManager = new IfdApproachManager(this.bus, this.glidePathComputer, this.fms);
  private readonly navEventsPublisher = new NavEventsPublisher(this.bus);
  private readonly obsManager = new LNavObsManager(this.bus, this.options.lnavIndex, true);
  private readonly fmsHooksManager = new FmsHooksManager(this.bus, this.fms, this.flightPlanner, this.options);
  private lnavComputer?: LNavComputer;

  // Publishers
  private readonly flightTimerPublisher = new FlightTimerPublisher(this.bus, {
    id: this.flightTimerId,
  });
  private readonly baseInstrumentPublisher = new BaseInstrumentPublisher(this.instrument, this.bus);
  private readonly adcPublisher = new AdcPublisher(this.bus);
  private readonly ahrsPublisher = new AhrsPublisher(this.bus);
  private readonly gnssPublisher = new GNSSPublisher(this.bus);
  private readonly ifdInteractionEventPublisher = new IfdInteractionEventPublisher(this.bus, this.instrument.instrumentIndex);
  private readonly navComSimVarPublisher = new NavComSimVarPublisher(this.bus);

  // Misc
  private readonly timerManager = new TimerManager(this.bus, this.flightTimerId);
  private readonly casAlertManager = new IfdCasAlertManager(this.bus, this.options, this.flightPlanStore, this.timerManager);
  private readonly ifdStartupManager: IfdStartupManager;
  private readonly tuningControlsManager = new IfdTuningControlsManager(this.bus, this.options, this.facLoader);
  private readonly dataProvider = new IfdDataProvider(this.bus, IFD_INITIAL_EVENT_VALUES);
  private trafficAvionicsSystem: TrafficAvionicsSystem | null = null;
  private readonly viewService = new IfdViewService(this.bus, this.options);
  private readonly mapSettings = MapUserSettings.getManager(this.bus);
  private readonly mapDataProvider = new MapDataProvider(
    this.bus,
    this.flightPlanner,
    this.fms,
    this.flightPlanStore,
    this.viewService,
    this.mapSettings,
  );
  private readonly illuminationManager: IfdIlluminationManager;

  private readonly audioSystem = new AudioSystem(this.bus, this.options, this.flightPlanner, this.casAlertManager);
  private readonly soundServer = new SoundServer(this.bus);

  private readonly ifdSettingSaveManager: IfdUserSettingSaveManager;
  private readonly ifdMapSettingSaveManager: IfdMapUserSettingSaveManager;
  private readonly ifdMapPresetService: IfdMapPresetService;
  private readonly airGroundMonitor = this.options.airframeType === IfdAirframeType.Helicopter ? new HelicopterAirGroundMonitor(this.bus) : new FixedWingAirGroundMonitor(this.bus);

  private readonly transitionAltitudeManager = new TransitionAltitudeManager(this.bus, this.flightPlanStore);

  private readonly mapOrientationManager = new MapOrientationManager(this.bus);

  /** Whether this instrument has started updating. */
  protected haveUpdatesStarted = false;

  /**
   * Ctor
   * @param instrument the base instrument
   */
  constructor(
    public readonly instrument: BaseInstrument,
  ) {
    if (![1, 2, 3, 4].includes(this.instrument.urlConfig.index)) {
      throw new Error('[IFD] Invalid IFD index. Must be present in the url as `Index` and be 1, 2, 3 or 4.');
    }
    this.illuminationManager = new IfdIlluminationManager(
      this.bus,
      this.instrument.instrumentIndex,
      this.options.dimming,
      IlluminationUserSettings.getManager(this.bus),
      this.viewService.activePage.map((v) => v?.name),
      this.casAlertManager,
    );
    this.ifdStartupManager = new IfdStartupManager(this.bus, this.fms, this.isFmsPrimary, this.illuminationManager);

    this.ifdSettingSaveManager = new IfdUserSettingSaveManager(
      this.bus,
      {
        alertSettingManager: AlertUserSettings.getManager(this.bus),
        chartsSettingManager: ChartsUserSettings.getManager(this.bus),
        comRadioSettingManager: ComRadioUserSettings.getManager(this.bus),
        datablockSettingManager: DatablockUserSettings.getManager(this.bus, this.options),
        displayUserSettingManager: DisplayUserSettings.getManager(this.bus),
        fmsSettingManager: FmsUserSettings.getManager(this.bus),
        illuminationSettingManager: IlluminationUserSettings.getManager(this.bus),
        navigationSettingManager: NavigationUserSettings.getManager(this.bus),
        svsSettingManager: SvsUserSettings.getManager(this.bus),
        terrainSettingManager: TerrainUserSettings.getManager(this.bus),
        timeSettingManager: TimeUserSettings.getManager(this.bus),
        timerSettingManager: TimerUserSettings.getManager(this.bus),
        trafficSettingManager: TrafficUserSettings.getManager(this.bus),
        unitsSettingManager: UnitsUserSettings.getManager(this.bus),
        vnavSettingManager: VnavUserSettings.getManager(this.bus)
      },
    );
    const profileKey = `${SimVar.GetSimVarValue('ATC MODEL', 'string')}_ifd-${this.options.instrumentIndex}-default-profile`;
    this.ifdSettingSaveManager.load(profileKey);
    this.ifdSettingSaveManager.startAutoSave(profileKey);

    this.ifdMapSettingSaveManager = new IfdMapUserSettingSaveManager(this.bus, profileKey + '-map', MapUserSettings.getManager(this.bus));
    this.ifdMapSettingSaveManager.load(this.ifdMapSettingSaveManager.KEY);
    this.ifdMapPresetService = new IfdMapPresetService(this.bus, this.ifdMapSettingSaveManager);

    this.flightPlanStore?.init();

    this.backplane.addPublisher(InstrumentBackplaneNames.FlightTimer, this.flightTimerPublisher);
    this.backplane.addPublisher(InstrumentBackplaneNames.NavCom, this.navComSimVarPublisher);

    this.backplane.addPublisher(InstrumentBackplaneNames.Base, this.baseInstrumentPublisher);
    this.backplane.addPublisher(InstrumentBackplaneNames.Electrical, new ElectricalPublisher(this.bus));
    this.backplane.addPublisher(InstrumentBackplaneNames.Gnss, this.gnssPublisher);
    this.backplane.addPublisher(InstrumentBackplaneNames.Adc, this.adcPublisher);
    this.backplane.addPublisher(InstrumentBackplaneNames.Ahrs, this.ahrsPublisher);
    this.backplane.addPublisher(InstrumentBackplaneNames.NavEventsPublisher, this.navEventsPublisher);

    this.backplane.addInstrument(InstrumentBackplaneNames.Clock, this.clock);
    this.backplane.addInstrument(InstrumentBackplaneNames.FlightTimer, this.flightTimerInstrument);
    this.backplane.addInstrument(InstrumentBackplaneNames.NavCom, this.navComInstrument);
    this.backplane.addInstrument(InstrumentBackplaneNames.IfdStartupManager, this.ifdStartupManager);
    this.backplane.addInstrument(InstrumentBackplaneNames.IlluminationManager, this.illuminationManager);
    this.backplane.addInstrument(InstrumentBackplaneNames.CasAlertMonitors, new CasAlertMonitorCollection(
      this.bus,
      this.options,
      this.flightPlanStore,
      this.vnavManager,
      this.glidePathComputer,
      this.timerManager,
    ));
    if (this.trafficInstrument) {
      this.backplane.addInstrument(InstrumentBackplaneNames.Traffic, this.trafficInstrument);
    }
    this.backplane.addInstrument(InstrumentBackplaneNames.CdiScaleManager, this.cdiScaleManager);
    this.backplane.addInstrument(InstrumentBackplaneNames.IfdApproachManager, this.ifdApproachManager);
    this.backplane.addInstrument(InstrumentBackplaneNames.VnavManager, this.vnavManager);
    this.backplane.addInstrument(InstrumentBackplaneNames.FmsHooksManager, this.fmsHooksManager);
    this.backplane.addInstrument(InstrumentBackplaneNames.Audio, this.audioSystem);
    this.backplane.addInstrument(InstrumentBackplaneNames.MapData, this.mapDataProvider);
    this.backplane.addInstrument(InstrumentBackplaneNames.TimerManager, this.timerManager);

    if (this.options.enableTransponder) {
      this.backplane.addPublisher(
        InstrumentBackplaneNames.Xpdr,
        new XPDRSimVarPublisher(this.bus, undefined, 1)
      );

      this.backplane.addInstrument(
        InstrumentBackplaneNames.Xpdr,
        new XPDRInstrument(this.bus, 1),
      );
    }

    if (this.options.instrumentIndex === 1) {
      if (this.fuelComputer) {
        this.backplane.addInstrument(InstrumentBackplaneNames.FuelComputer, this.fuelComputer);
      }

      if (this.options.instrumentType === IfdInstrumentType.IFD550Custom) {
        this.backplane.addInstrument(
          InstrumentBackplaneNames.DestinationPublisher,
          new DestinationPublisher(this.bus, this.flightPlanStore),
        );
      }
    }

    if (this.options.navIndex !== undefined) {
      this.vlocSource = new NavRadioNavSource(this.bus, IfdNavMode.VLOC, this.options.navIndex as NavRadioIndex);

      const navigationUserSettingsManager = NavigationUserSettings.getManager(this.bus);
      const vlocTuningManager = new VLocTuningManager(this.bus, this.options, navigationUserSettingsManager.getSetting('autoVLocTuning'), this.fms);
      const vlocActivationManager = new VLocActivationManager(this.bus, navigationUserSettingsManager.getSetting('autoVLocCapture'), vlocTuningManager, this.fms, this.vlocSource, this.activeNavSourceManager.armedMode, this.options.enableAutoSlew);
      this.backplane.addInstrument(InstrumentBackplaneNames.VLocActivationManager, vlocActivationManager);
      this.backplane.addInstrument(InstrumentBackplaneNames.VLocTuningManager, vlocTuningManager);
    }

    if (this.options.enableFlta || this.options.enableTaws) {
      this.gpws = new Gpws(this.bus, this.facLoader, this.options);
      if (this.options.enableTaws && this.options.airframeType !== IfdAirframeType.Helicopter) {
        this.gpws.addModule(new ExcessiveDescentRateModule(this.bus));
        this.gpws.addModule(new AltitudeLossAfterTakeoffModule(this.bus));
        this.gpws.addModule(new PrematureDescentModule(this.bus, this.flightPlanStore));
      }
      if (this.options.enableFlta) {
        this.gpws.addModule(new ForwardLookingTerrainAlertModule(this.bus));
      }
    }

    this.doInit();
  }

  /** @inheritDoc */
  public Update(): void {
    this.haveUpdatesStarted = true;
    this.powerMonitor.onUpdate();
    this.backplane.onUpdate();
    this.updateSystems();
    this.gpsSynchronizer?.update();

    if (this.isFmsPrimary) {
      const realTime = Date.now();
      if (this.flightPlanner.hasActiveFlightPlan() && realTime - this.lastActiveFplCalcTime >= IFD.ACTIVE_FLIGHT_PLAN_CALC_PERIOD) {
        this.flightPlanner.getActiveFlightPlan().calculate();
      }
    }
  }

  /** @inheritDoc */
  public onInteractionEvent(args: string[]): void {
    this.ifdInteractionEventPublisher.handleHEvent(args[0]);
  }

  /** @inheritDoc */
  public onFlightStart(): void {
    // noop
  }

  /** @inheritDoc */
  public onGameStateChanged(): void {
    // noop
  }

  /** @inheritDoc */
  public onSoundEnd(id: Name_Z): void {
    this.soundServer.onSoundEnd(id);
  }

  /** Handles power on events. */
  public onPowerOn(): void {
    this.powerMonitor.onPowerOn();
  }

  /** Handles power off events. */
  public onPowerOff(): void {
    this.powerMonitor.onPowerOff();
  }

  /** Init instrument. */
  protected async doInit(): Promise<void> {
    this.createSystems();

    try {
      await this.initFlightPlanAndAp();
    } catch (e) {
      console.error(e);
    }

    if (this.trafficInstrument) {
      this.trafficInstrument.init();
      const trafficSettingManager = TrafficUserSettings.getManager(this.bus);
      trafficSettingManager.getSetting('trafficOperatingMode').set(TrafficOperatingModeSetting.Operating);
      this.trafficAvionicsSystem?.trafficSystem.init();
    }
    this.nearestContext.init();
    this.activeNavSourceManager.init();
    this.obsManager.init();
    this.gpws?.init();
    this.fuelComputer?.init();

    // We need to render and init anything plugins might want to touch after plugins are loaded.
    this.initPlugins().then(() => {
      this.chartsManager.initChartSources(this.pluginSystem);
      this.chartsManager.init();

      this.renderDisplayUnit(this.options.instrumentIndex);
      this.renderBootScreen();
    });

    this.backplane.init();
  }

  /**
   * Renders the boot/startup screen and wires it to StartupManager.
   */
  private renderBootScreen(): void {
    FSComponent.render(<IfdStartupScreen
      startupManager={this.ifdStartupManager}
      ifdPageName={this.options.defaultPageName}
      viewService={this.viewService}
      bus={this.bus}
      ifdOptions={this.options}
    />,
      document.getElementById('Bootup')
    );
  }

  /**
   * Initialises the IFD plugins.
   * @returns A promise that resolves when the plugin system has finished starting.
   */
  private async initPlugins(): Promise<void> {
    await this.pluginSystem.addScripts(
      this.instrument.xmlConfig,
      `${this.instrument.templateID}_${this.instrument.instrumentIndex}`,
      target => target === this.instrument.templateID
    );

    const pluginBinder: IfdPluginBinder = {
      bus: this.bus,
      backplane: this.backplane,
      options: this.options,
    };

    return this.pluginSystem.startSystem(pluginBinder);
  }

  /**
   * Initializes the primary flight plan, navigation loop, and autopilot.
   */
  private async initFlightPlanAndAp(): Promise<void> {
    const [, manager] = await Promise.all([
      this.initPrimaryFlightPlan(),
      this.isFmsPrimary ? FlightPlanRouteManager.getManager() : Promise.resolve(),
    ]);

    this.initActiveFplCalcListener();

    // Wait for the game to finish loading.
    await Wait.awaitSubscribable(GameStateProvider.get(), state => state === GameState.ingame, true);

    if (this.isFmsPrimary) {
      await this.initFlightPlanRouteSync(manager!);

      // Re-enable if you need the dev plan
      // new DevPlan(this.fms).setupDevPlan();
    }

    await this.initNavigationLoop();

    // Activate the flightplan immediately for a hot spawn
    if (this.powerMonitor.isPoweredOn() && this.fms.canActivatePrimaryFlightPlan()) {
      this.fms.activatePrimaryFlightPlan();
    }

    this.ifdStartupManager.onFlightPlanInitialised();
  }

  /**
   * Initializes the primary flight plan.
   */
  private async initPrimaryFlightPlan(): Promise<void> {
    // Request a sync from any other instrument in case of an instrument reload
    this.fms.flightPlanner.requestSync();

    await Wait.awaitDelay(500);

    // Initialize the primary plan in case one was not synced.
    await this.fms.initPrimaryFlightPlan();
  }

  /**
   * Initializes flight plan route sync with the sim.
   * @param manager A flight plan route manager.
   */
  private async initFlightPlanRouteSync(manager: FlightPlanRouteManager): Promise<void> {
    // Wait 2 seconds because trying to load the sim flight plan too early sometimes ends up with missing waypoints.
    await Wait.awaitDelay(2000);

    this.flightPlanRouteSyncManager!.init(
      manager,
      new IfdPrimaryFlightPlanRouteLoader(this.fms, {
        userFacilityScope: IfdFacilityUtils.USER_FACILITY_SCOPE,
        allowRnpArApproaches: false,
      }),
      new IfdPrimaryFlightPlanRouteProvider(this.fms),
    );

    // Always load the synced avionics route, or the EFB route if a synced route does not exist, on flight start.
    const routeToLoad = manager.syncedAvionicsRoute.get() ?? manager.efbRoute.get();
    if (!FlightPlanRouteUtils.isRouteEmpty(routeToLoad)) {
      await this.flightPlanRouteSyncManager!.loadRoute(routeToLoad);
    }

    this.flightPlanRouteSyncManager!.replyToAllPendingRequests();
    this.flightPlanRouteSyncManager!.startAutoReply();

    this.flightPlanRouteSyncManager!.startAutoSync();
  }

  /**
   * Initializes this instrument's navigation loop. Also initializes the autopilot if one is configured.
   */
  private async initNavigationLoop(): Promise<void> {
    const lnavComputerDataProvider = new DefaultLNavComputerDataProvider({
      isPositionDataValid: MappedValue.create(
        // If the plan is not activated, we don't want LNAV to track/advance the state
        ([navState, isPlanActivated]) => isPlanActivated &&
          (navState === GnssNavigationState.BasicNav || navState === GnssNavigationState.FdeNav || navState === GnssNavigationState.SbasNav),
        this.gnssReceiver!.navigationState,
        this.fms.isPlanActivated,
      ),
    });

    this.lnavComputer = new LNavComputer(
      this.options.lnavIndex,
      this.bus,
      this.flightPlanner,
      new IfdObsLNavModule(this.options.lnavIndex, this.bus, this.flightPlanner),
      {
        dataProvider: lnavComputerDataProvider,
        hasVectorAnticipation: true,
        disableAutoSuspendAtMissedApproachPoint: true,
      },
    );

    this.glidePathComputer.init();

    this.initAutopilot();

    let prevActiveSimDuration: number | undefined;
    this.bus.getSubscriber<ClockEvents>().on('activeSimDurationHiFreq').handle(activeSimDuration => {
      const isPaused = prevActiveSimDuration !== undefined && (activeSimDuration - prevActiveSimDuration === 0);

      if (!isPaused) {
        this.fms.checkActiveLeg();
        lnavComputerDataProvider.update();
        this.lnavComputer!.update();
        this.glidePathComputer.update();
        this.autopilot?.apValues.approachHasGP.set(this.glidePathComputer.glidepathGuidance.get().approachHasGlidepath);
        this.autopilot?.update();
      }

      prevActiveSimDuration = activeSimDuration;
    });
  }

  /**
   * Initializes a listener which records the most recent time the active flight plan was calculated.
   */
  private initActiveFplCalcListener(): void {
    this.flightPlanner.onEvent('fplCalculated').handle((e: FlightPlanCalculatedEvent) => {
      if (e.planIndex === this.flightPlanner.activePlanIndex) {
        this.lastActiveFplCalcTime = Date.now();
      }
    });
  }

  private autopilot?: IfdAutopilot;
  private autopilotInstrument?: AutopilotInstrument;

  /** Initialises the autopilot if it is configured. */
  private initAutopilot(): void {
    if (!this.options.autopilot) {
      return;
    }

    this.autopilotInstrument = new AutopilotInstrument(this.bus);
    this.backplane.addInstrument(InstrumentBackplaneNames.Autopilot, this.autopilotInstrument);

    // this.apCdiSourceManager = new GNSAPCdiSourceManager(this.props.bus);

    const apConfig = new IfdAPConfig(
      this.bus,
      this.lnavComputer!.steerCommand,
      this.glidePathComputer.glidepathGuidance,
      this.cdiId,
      this.options.autopilot,
    );

    this.autopilot = new IfdAutopilot(
      this.bus,
      this.flightPlanner,
      apConfig,
      new IfdAPStateManager(this.bus, apConfig),
    );

    this.autopilot.stateManager.initialize();
  }

  /**
   * Creates this instrument's avionics systems.
   */
  private createSystems(): void {
    // The IFD has just a single built-in GNSS receiver.
    this.gnssReceiver = new GnssReceiver(this.instrument.instrumentIndex, this.bus, this.isPowered, this.options.enableSbas);
    this.systems.push(this.gnssReceiver);

    this.fmsPositionSystem = new FmsPositionSystem(1, this.bus, this.isPowered);
    this.systems.push(this.fmsPositionSystem!);

    this.systems.push(new ArsSystem(this.bus, this.isPowered));

    if (this.options.airData !== undefined) {
      this.systems.push(new ExternalAdcSystem(this.bus, this.options.airData?.airspeedIndex, this.options.airData?.altimeterIndex, this.options.airData.electricalLogic));
    }

    if (this.options.heading) {
      this.systems.push(new ExternalHeadingSystem(this.bus, this.options.heading.electricalLogic));
    }

    if (this.options.traffic) {
      const adsB = this.options.traffic.hasAdsB ? new IfdAdsb(this.bus) : null;

      switch (this.options.traffic.type) {
        case TrafficSystemType.Tas:
          this.trafficAvionicsSystem = new TrafficAvionicsSystem(
            this.bus,
            new TrafficAdvisorySystem(this.bus, this.trafficInstrument!, adsB, false, this.options),
            this.options.traffic.electricalLogic,
          );
          break;
        case TrafficSystemType.Tis:
          this.trafficAvionicsSystem = new TrafficAvionicsSystem(
            this.bus,
            new TrafficInfoService(this.bus, this.trafficInstrument!, this.options, {
              supportTisA: true,
              adsb: adsB,
            }),
            this.options.traffic.electricalLogic,
          );
          break;
      }

      if (this.trafficAvionicsSystem) {
        this.systems.push(this.trafficAvionicsSystem);
      }
    }
  }

  /**
   * Creates an instance of TrafficInstrument for this instrument.
   * @returns An instance of TrafficInstrument.
   */
  protected createTrafficInstrument(): TrafficInstrument | undefined {
    if (this.options.traffic) {
      return new TrafficInstrument(this.bus, {
        syncRole: this.instrument.instrumentIndex === 1 ? 'primary' : 'replica',
        syncId: 'wt-ifd',
        realTimeUpdateFreq: 2,
        simTimeUpdateFreq: 1,
        contactDeprecateTime: 10,
      });
    }
  }

  /**
   * Updates this instrument's systems.
   */
  private updateSystems(): void {
    for (let i = 0; i < this.systems.length; i++) {
      this.systems[i].onUpdate();
    }
  }

  /**
   * Renders the display unit to the DOM
   * @param index the index of the IFD
   */
  private renderDisplayUnit(index: IfdIndex): void {
    FSComponent.render(
      <IfdContainer
        bus={this.bus}
        viewService={this.viewService}
        index={index}
        ifdOptions={this.options}
        facilityLoader={this.facLoader}
        ifdTuningControlManager={this.tuningControlsManager}
        fms={this.fms}
        trafficSystem={this.trafficAvionicsSystem?.trafficSystem}
        flightPlanStore={this.flightPlanStore}
        flightPlanListManager={this.flightPlanListManager}
        flightPlanner={this.flightPlanner}
        casAlertManager={this.casAlertManager}
        dataProvider={this.dataProvider}
        mapDataProvider={this.mapDataProvider}
        nearestContext={this.nearestContext}
        timerManager={this.timerManager}
        fmsHooks={this.fmsHooksManager}
        chartsManager={this.chartsManager}
        vlocSource={this.vlocSource}
        mapPresetService={this.ifdMapPresetService}
      />,
      document.getElementById('InstrumentsContainer'),
    );
  }
}

/**
 * BaseInstrument wrapper for {@link IFD}
 */
class IfdInstrument extends FsBaseInstrument<IFD> {
  /** @inheritDoc */
  public get templateID(): string {
    return 'wt-ifd';
  }

  /** @inheritDoc */
  public get isInteractive(): boolean {
    return true;
  }

  /** @inheritDoc */
  constructInstrument(): IFD {
    return new IFD(this);
  }

  /** @inheritdoc */
  public onPowerOn(): void {
    super.onPowerOn();
    this.fsInstrument?.onPowerOn();
  }

  /** @inheritdoc */
  public onShutDown(): void {
    super.onShutDown();
    this.fsInstrument?.onPowerOff();
  }
}

registerInstrument('wt-ifd', IfdInstrument);

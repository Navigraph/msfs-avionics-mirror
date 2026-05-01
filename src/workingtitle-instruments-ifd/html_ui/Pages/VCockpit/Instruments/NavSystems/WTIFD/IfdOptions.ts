import { ComRadioIndex, LNavUtils, MathUtils, NavRadioIndex, NumberUnit, SimVarValueType, UnitFamily, UnitType, VNavUtils } from '@microsoft/msfs-sdk';

import { DatablockPresetType } from './Datablocks/DatablockPresets';
import { IfdPageName } from './Pages/IfdPage';
import { TrafficSystemType } from './Systems/Traffic/TrafficSystemType';

export enum IfdInstrumentType {
  IFD550 = 'IFD550',
  IFD540 = 'IFD540',
  IFD550Custom = 'IFD550Custom'
}

export enum IfdAirframeType {
  FixedWing = 'fixed-wing',
  Helicopter = 'helicopter',
  HighSpeed = 'high-speed',
  Canard = 'canard',
}

export enum DimmingCurve {
  /**
   * A special curve that outputs maximum brightness during the day at low potentiometer inputs,
   * and jumps to minimum then proportional in night mode.
   */
  AviCurve = 'avicurve',
  /** A linear curve from min to max with a given slope. */
  Proportional = 'proportional',
}

/** Configuration parameters for a lighting type. */
export interface DimmerParameters {
  /** The speed at which the brightness changes when the photocell is the source, in the range 1-5, default 3. */
  photoResponseTime: number;
  /** The sensitivity to changes in input when the photocell is the source, in the range 15-100, default 80. */
  photoSlope: number;
  /** The minimum brightness when the photocell is the source, in the range 1-50, default 1. */
  photoMinimum: number;
  /** The maximum brightness when the photocell is the source, in the range 50-100, default 100. */
  photoMaximum: number;

  /**
   * The threshold where the dimming input (potentiometer) takes over from the photocell, in the range 0-100, default 0.
   * Below the threshold the potentiometer controls the lighting.
   */
  busTransition: number;
  /** The sensitivity to changes in input when the dimming input (potentiometer) is the source, in the range 15-100, default 60. */
  busSlope: number;
  /** The minmum brightness when the dimming input (potentiometer) is the source, in the range 1-50, default 1. */
  busMinimum: number;
  /** The maximum brightness when the dimming input (potentiometer) is the source, in the range 50-100, default 100. */
  busMaximum: number;
  /** The curve to map brightness input to output, default Proportional. */
  busCurve: DimmingCurve;
}

/** The light dimming options for the bezel and display. */
export interface DimmingOptions {
  /** The potentiometer index for lighting brightness (equivalent of the dimming bus input on the real unit). */
  dimmingPotentiometerIndex: number;

  /** The bezel lighting configuration. */
  bezel: DimmerParameters;

  /** The display lighting configuration. */
  display: DimmerParameters;
}

/** Options for the flight path calculator. */
export interface IfdFlightPathCalculatorOptions {
  /** The default climb rate, in feet per minute, if the plane is not yet at flying speed. Defaults to 2000 fpm. */
  defaultClimbRate?: number;
  /**
   * The default airplane speed, in knots. This speed is used if the airplane speed mode is `Default` or if the
   * airplane speed calculated through other means is slower than this speed. It is also used as the airplane's true
   * airspeed if the true airspeed obtained through other means is slower than this speed.
   * Defaults to 220 knots.
   */
  defaultSpeed?: number;
  /**
   * The bank angle, in degrees, with which to calculate turns.
   * Defaults to 25°.
   */
  bankAngle?: number;
  /** The speed used for anticipating turns when above 10000 feet, in knots. Defaults to 260 knots. */
  anticipatedSpeedAbove10k?: number;
  /** The speed used for anticipating turns when below 10000 feet, in knots. Defaults to 220 knots. */
  anticipatedSpeedBelow10k?: number;
  /** The speed used for anticipating the final approach turns, in knots. Defaults to 130 knots. */
  anticipatedApproachSpeed?: number;
}

/** Options for IFD audio. */
export interface IfdAudioOptions {
  /** The wwise event for the 100 foot voice callout, or undefined if not enabled. */
  altitude100Event?: string;
  /** The wwise event for the 200 foot voice callout, or undefined if not enabled. */
  altitude200Event?: string;
  /** The wwise event for the 300 foot voice callout, or undefined if not enabled. */
  altitude300Event?: string;
  /** The wwise event for the 400 foot voice callout, or undefined if not enabled. */
  altitude400Event?: string;
  /** The wwise event for the 500 foot voice callout, or undefined if not enabled. */
  altitude500Event?: string;
  /** The wwise event for the 1000 foot voice callout, or undefined if not enabled. */
  altitude1000Event?: string;

  /** The wwise event for the top of descent chime, or undefined if not enabled. */
  topOfDescentEvent?: string;

  /** The wwise event for the airspace ahead aural, or undefined if not enabled. */
  airspaceAheadEvent?: string;

  /** The wwise event for the waypoint aural, or undefined if not enabled. */
  waypointEvent?: string;
  /** The wwise event for the final approach aural, or undefined if not enabled. */
  finalApproachEvent?: string;
  /** The wwise event for the missed approach aural, or undefined if not enabled. */
  missedApproachEvent?: string;

  /** FLTA terrain caution primary callout wwise event "Caution Terrain", or undefined to disable. */
  cautionTerrainEvent?: string;
  /** FLTA terrain caution alternate callout wwise event "Terrain Ahead", or undefined to disable. */
  terrainAheadEvent?: string;

  /** FLTA terrain warning primary callout wwise event "Terrain, Pull Up", or undefined to disable. */
  terrainPullUpEvent?: string;
  /** FLTA terrain warning alternate callout wwise event "Terrain, Terrain", or undefined to disable. */
  terrainTerrainEvent?: string;

  /** EDR excessive descent rate caution wwise event "Sink Rate", or undefined to disable. */
  sinkRateEvent?: string;
  /** NCR descent after takeoff wwise event "Don't Sink", or undefined to disable. */
  dontSinkEvent?: string;
  /** EDR excessive descent rate warning wwise event "Pull Up, Pull Up", or undefined to disable. */
  pullUpPullUpEvent?: string;
  /** PDA premature descent into terrain caution wwise event "Too Low, Terrain*, or undefined to disable. */
  tooLowTerrainEvent?: string;
}

/** Configuration for an external fuel flow sensor. */
export interface IfdFuelFlowSensorConfig {
  /** The sensor index (1-2). */
  index: 1 | 2;
  /** The engine index for retrieving fuel flow data. */
  engineIndex: number;
}

/** External fuel flow system options. */
export interface ExternalFuelFlowOptions {
  /** Whether the external fuel system has a fuel quantity totalizer. */
  hasTotalizer: boolean;
  /** The electrical logic for the fuel flow system. Defaults to always powered. */
  electricalLogic?: CompositeLogicXMLElement;
  /** Individual fuel flow sensors. */
  sensors: IfdFuelFlowSensorConfig[];
}

/** Options for an external heading system. */
interface ExternalHeadingOptions {
  /** The electricity supply for the external heading system. Defaults to always powered. */
  electricalLogic?: CompositeLogicXMLElement;
}

/** Options for an external air data computer. */
interface ExternalAirDataOptions {
  /** The electricity supply for the external air data computer. Defaults to always powered. */
  electricalLogic?: CompositeLogicXMLElement;

  /** The airspeed indicator to use, or undefined for no airspeed source. Defaults to undefined. */
  airspeedIndex?: number | undefined;

  /** The altimeter to use, or undefined for no altitude source and no enroute VNAV. Defaults to undefined. */
  altimeterIndex?: number | undefined;
}

/** Options for external traffic system. */
interface ExternalTrafficOptions {
  /** The type of traffic system connected. */
  type: TrafficSystemType;
  /** Whether the system has ADS-B. */
  hasAdsB: boolean;
  /** The electricity supply for the external traffic system. Defaults to always powered. */
  electricalLogic?: CompositeLogicXMLElement;
}

/** Installation options present in the real IFD. */
interface RealIfdOptions {
  /**
   * The type of airframe the IFD is installed on.
   * This causes some changes such as: Showing helipads on the NRST page.
   */
  airframeType: IfdAirframeType;

  /** External heading system options. Defaults to undefined (no air data input). */
  airData?: ExternalAirDataOptions;

  /** The basic empty weight of the aircraft. */
  basicEmptyWeight: NumberUnit<UnitFamily.Weight>;

  /** Dimming options for the display and bezel lighting. */
  dimming: DimmingOptions;

  /** Whether to enable auto-slewing of the CDI course in GPS nav mode for electronic CDI displays. Defaults to false. */
  enableAutoSlew: boolean;

  /** Whether the approach prompt is enabled for KAP140/KFC225. Should only be on the main IFD. Defaults to false. */
  enableApproachPrompt: boolean;

  /** Whether the forward-looking terrain awareness function (F500) is enabled. Defaults to true. */
  enableFlta: boolean;

  /** Whether radio remote tuning is enabled. Defaults to false. */
  enableRemoteTuning: boolean;

  /** Whether RF legs are enabled (the aircraft must be certified). Defaults to false. */
  enableRfLegs: boolean;

  /** Whether an SBAS antenna is fitted. Defaults to true. */
  enableSbas: boolean;

  /** Whether to enable the set course alerts when the CDI course does not match DTK. Defaults to true. */
  enableSetCourseAlert: boolean;

  /** Whether the TAWS functions are enabled. Defaults to true. */
  enableTaws: boolean;

  /** Whether transponder control is supported. */
  enableTransponder: boolean;

  /** Whether VNAV is enabled. Defaults to false. */
  enableVerticalNavigation: boolean;

  /** Whether a WxR is connected to the IFD. Defaults to false. */
  enableWxRadar: boolean;

  /** External fuel flow system options. Undefined if no fuel flow system is configured. */
  fuelFlow?: ExternalFuelFlowOptions;

  // TODO fuelType (Avgas - 5.967 lb/gal, JetA - 6.843 lb/gal, JetB - 6.467 lb/gal)

  /** External heading system options. Defaults to undefined (no heading input). */
  heading?: ExternalHeadingOptions;

  /** Whether the IFD has a heading select input to show the bug, defaults to false. */
  headingSelectEnabled: boolean;

  /** The instrument type. */
  instrumentType: IfdInstrumentType

  /** The instrument index. */
  instrumentIndex: number;

  /** The basic empty weight of the aircraft. */
  maxLandingWeight: NumberUnit<UnitFamily.Weight>;

  /** The basic empty weight of the aircraft. */
  maxTakeoffWeight: NumberUnit<UnitFamily.Weight>;

  /** Whether the aircraft is multi (two) engined, for fuel and weight calculators. */
  multiEngine: boolean;

  /** The NAV radio index to use, or undefined to disable VLOC. */
  navIndex: NavRadioIndex | undefined;

  /** The external traffic system config, if there is one connected. */
  traffic?: ExternalTrafficOptions;
}

/**
 * Options for the a separate autopilot that runs in the IFD instrument.
 * The IFD itself does not include an autopilot.
 */
export interface IfdAutopilotOptions {
  /** Electrical logic for the autopilot power supply. Defaults to always powered. */
  electricalLogic?: LogicXMLElement;
  /** Whether the AP will fly the back course on localizers. Defaults to true. */
  enableBackCourse: boolean;
  /** Whether GPSS NAV mode can be armed. Defaults to true. */
  enableNavArming: boolean;
  /** Whether to allow the flight director to be on independently of the autopilot. Defaults to false. */
  independentFlightDirector: boolean;
  /** The maximum bank angle allowed by the AP. Defaults to 25°. */
  maxBankAngle: number;
}

/** Additional options for MSFS interaction. */
interface SimIfdOptions {
  /** Audio options for the IFD. */
  audio: IfdAudioOptions;

  /** Options for an external autopilot that runs in the IFD instrument, or undefined if no AP configured. Defaults to undefined (no AP). */
  autopilot?: IfdAutopilotOptions;

  /** The COM radio index to use. The COM radio is built into the IFD IRL. */
  comIndex: ComRadioIndex;

  /**
   * When given, in the absence of a last used preset in the save file, this preset will be loaded on initialization.
   * Defaults to Factory Settings.
   */
  defaultDatablockPreset: DatablockPresetType;

  /** The default IfdPageName of the instrument, defaults to SVS if available, otherwise FMS. */
  defaultPageName: IfdPageName;

  /** Options for the flight path calculator. */
  flightPathCalculator: Required<IfdFlightPathCalculatorOptions>;

  /**
   * Whether the instrument hosts a primary FMS instance. If not defined, then the instrument hosts a primary FMS
   * instance if and only if its index is 1.
   */
  isFmsPrimary: boolean;

  /** The index of the IFD flight planner to use. If IFDs use different indexes, they will not be synced. Defaults to 0. */
  flightPlannerIndex: number;

  /** The LNAV index to use for internal navigation. Defaults to 0. */
  lnavIndex: number;

  /** The VNAV index to use for internal navigation. Defaults to 0. */
  vnavIndex: number;
}

/** Options for the XB-1 custom IFD. */
interface BoomIfdOptions {
  /** When true, there will be an LSK on the SVS page for changing the baro setting. */
  enableBaroSettingFeature: boolean;

  /**
   * Whether the instrument should display the SVS page in fullscreen mode.
   */
  svsFullScreen: boolean;
}

/**
 * IFD Options
 */
export type IfdOptions = RealIfdOptions & SimIfdOptions & BoomIfdOptions;

/**
 * Utility class for creating and managing IFD options.
 */
export class IfdOptionsUtils {
  private static maxLandingWeightPounds: number = 0;
  private static maxTakeoffWeightPounds: number = 0;

  private static readonly massAndBalanceListener: ViewListener.ViewListener = RegisterViewListener(
    'JS_LISTENER_MASS_AND_BALANCE',
    async () => {
      const maxMassData = await IfdOptionsUtils.massAndBalanceListener.call('GET_MAX_MASS_DATA');
      IfdOptionsUtils.maxLandingWeightPounds = maxMassData.max_landing_lbs;
      IfdOptionsUtils.maxTakeoffWeightPounds = maxMassData.max_takeoff_lbs;
    },
    true,
  );

  /**
   * Gets and sets the options for this instrument from the panel.xml
   * @param instrument The base instrument.
   * @returns The IFD options.
   */
  public static createOptions(
    instrument: BaseInstrument,
  ): Readonly<IfdOptions> {
    const defaultDimmingParams: DimmerParameters = {
      photoResponseTime: 3,
      photoSlope: 80,
      photoMinimum: 1,
      photoMaximum: 100,
      busTransition: 0, // factory default is 10, but that causes weirdness if the aircraft is not configured well
      busSlope: 60,
      busMinimum: 1,
      busMaximum: 100,
      busCurve: DimmingCurve.Proportional,
    };

    const defaultFlightPathCalculatorOptions: Record<IfdAirframeType, Required<IfdFlightPathCalculatorOptions>> = {
      [IfdAirframeType.FixedWing]: {
        defaultClimbRate: 800,
        defaultSpeed: 100,
        bankAngle: 25,
        anticipatedSpeedAbove10k: 100,
        anticipatedSpeedBelow10k: 100,
        anticipatedApproachSpeed: 80,
      },
      [IfdAirframeType.HighSpeed]: {
        defaultClimbRate: 2000,
        defaultSpeed: 220,
        bankAngle: 25,
        anticipatedSpeedAbove10k: 280,
        anticipatedSpeedBelow10k: 250,
        anticipatedApproachSpeed: 130,
      },
      [IfdAirframeType.Helicopter]: {
        defaultClimbRate: 1000,
        defaultSpeed: 80,
        bankAngle: 25,
        anticipatedSpeedAbove10k: 80,
        anticipatedSpeedBelow10k: 80,
        anticipatedApproachSpeed: 40,
      },
      [IfdAirframeType.Canard]: {
        defaultClimbRate: 2000,
        defaultSpeed: 220,
        bankAngle: 25,
        anticipatedSpeedAbove10k: 260,
        anticipatedSpeedBelow10k: 220,
        anticipatedApproachSpeed: 130,
      }
    };

    const instrumentType = IfdOptionsUtils.getIfdType(instrument);
    const options: IfdOptions = {
      instrumentType,
      instrumentIndex: instrument.urlConfig.index,
      airframeType: IfdAirframeType.FixedWing,
      isFmsPrimary: instrument.urlConfig.index === 1,
      comIndex: 1,
      navIndex: undefined,
      svsFullScreen: false,
      enableAutoSlew: false,
      enableFlta: true,
      enableSetCourseAlert: true,
      enableTaws: true,
      enableTransponder: false,
      enableRemoteTuning: false,
      dimming: {
        dimmingPotentiometerIndex: 1,
        bezel: defaultDimmingParams,
        display: defaultDimmingParams,
      },
      flightPathCalculator: defaultFlightPathCalculatorOptions[IfdAirframeType.FixedWing],
      defaultDatablockPreset: DatablockPresetType.FactorySettings,
      audio: {},
      defaultPageName: instrumentType === IfdInstrumentType.IFD540 ? IfdPageName.FMS : IfdPageName.SVS,
      headingSelectEnabled: false,
      enableApproachPrompt: false,
      enableBaroSettingFeature: false,
      enableVerticalNavigation: false,
      enableRfLegs: false,
      enableSbas: true,
      multiEngine: SimVar.GetSimVarValue('NUMBER OF ENGINES', SimVarValueType.Number) > 1,
      basicEmptyWeight: UnitType.POUND.createNumber(SimVar.GetSimVarValue('EMPTY WEIGHT', SimVarValueType.LBS)),
      // These two are slightly dodgy as we rely on the listener loading and the call returning before createOptions is ever called...
      // In practice it works, but we should consider making IfdOptions an object that can update it's values later.
      maxLandingWeight: UnitType.POUND.createNumber(IfdOptionsUtils.maxLandingWeightPounds),
      maxTakeoffWeight: UnitType.POUND.createNumber(IfdOptionsUtils.maxTakeoffWeightPounds),
      enableWxRadar: false,
      flightPlannerIndex: 0,
      lnavIndex: 0,
      vnavIndex: 0,
    };

    const node = instrument.instrumentXmlConfig;

    if (node !== undefined) {
      const airframeType = node.querySelector('AirframeType')?.textContent?.toLowerCase();
      switch (airframeType) {
        case IfdAirframeType.FixedWing:
        case IfdAirframeType.Helicopter:
        case IfdAirframeType.HighSpeed:
        case IfdAirframeType.Canard:
          options.airframeType = airframeType;
          break;
        case null:
        case undefined:
          console.warn('AirframeType not configured. Defaulting to fixed-wing.');
          break;
        default:
          console.warn(`Invalid AirframeType "${airframeType}" configured. Defaulting to fixed-wing. Options are fixed-wing, helicopter, high-speed, or canard.`);
          break;
      }
      options.flightPathCalculator = defaultFlightPathCalculatorOptions[options.airframeType];

      options.isFmsPrimary = node.querySelector('IsFMSPrimary') !== null
        ? node.querySelector('IsFMSPrimary')?.textContent?.toLowerCase() === 'true'
        : options.instrumentIndex === 1;

      options.comIndex = MathUtils.clamp(parseInt(node.querySelector('ComIndex')?.textContent ?? '1'), 1, 3) as ComRadioIndex;

      const navIndex = parseInt(node.querySelector('NavIndex')?.textContent ?? '0');
      switch (navIndex) {
        case 1:
        case 2:
        case 3:
        case 4:
          options.navIndex = navIndex;
          break;
        case 0: // VLOC disabled by default
          break;
        default:
          console.warn(`Invalid NavIndex "${node.querySelector('NavIndex')?.textContent}" provided. Must be 1, 2, 3, 4, or not defined to disable VLOC.`);
          break;
      }

      options.enableTransponder = node.querySelector('Transponder')?.textContent?.toLowerCase() === 'true';

      options.enableVerticalNavigation = node.querySelector('VerticalNavigation')?.textContent?.toLowerCase() === 'true';

      options.enableRemoteTuning = node.querySelector('RemoteTuningEnabled')?.textContent?.toLowerCase() === 'true';

      options.enableWxRadar = node.querySelector('WxRadar')?.textContent?.toLowerCase() === 'true';

      options.enableAutoSlew = node.querySelector('EnableAutoSlew')?.textContent?.toLowerCase() === 'true';
      options.enableSetCourseAlert = node.querySelector('EnableSetCourseAlert')?.textContent?.toLowerCase() !== 'false';

      const defaultPageName = node.querySelector(':scope>DefaultPageName')?.textContent?.toUpperCase();
      if (defaultPageName && Object.values(IfdPageName).includes(defaultPageName as IfdPageName)) {
        options.defaultPageName = defaultPageName as IfdPageName;
      } else if (defaultPageName) {
        console.warn(`Invalid value "${defaultPageName}" for 'DefaultPageName'. Valid options are: ${Object.values(IfdPageName).join(', ')}`);
      }

      options.headingSelectEnabled = node.querySelector(':scope>HeadingSelectEnabled')?.textContent?.toLowerCase() === 'true';

      options.enableRfLegs = node.querySelector(':scope>EnableRfLegs')?.textContent?.toLowerCase() === 'true';

      options.enableSbas = node.querySelector(':scope>EnableSbas')?.textContent?.toLowerCase() !== 'false';

      options.enableApproachPrompt = node.querySelector(':scope>EnableApproachPrompt')?.textContent?.toLowerCase() === 'true';

      options.enableFlta = node.querySelector(':scope>EnableFlta')?.textContent?.toLowerCase() !== 'false';
      options.enableTaws = node.querySelector(':scope>EnableTaws')?.textContent?.toLowerCase() !== 'false';

      options.fuelFlow = IfdOptionsUtils.parseFuelFlowOptions(instrument, node.querySelector(':scope>ExternalFuelFlowSystem'));

      options.airData = IfdOptionsUtils.parseAirDataOptions(instrument, node.querySelector(':scope>ExternalAirDataSystem'));
      options.heading = IfdOptionsUtils.parseHeadingOptions(instrument, node.querySelector(':scope>ExternalHeadingSystem'));
      options.traffic = IfdOptionsUtils.parseTrafficOptions(instrument, node.querySelector(':scope>ExternalTrafficSystem'));

      options.defaultDatablockPreset = IfdOptionsUtils.getDefaultDatablock(node.querySelector('DefaultDatablockPreset')?.textContent?.toLowerCase());

      IfdOptionsUtils.parseDimmingOptions(node.querySelector('Dimming'), options.dimming);
      IfdOptionsUtils.parseFlightPathOptions(node.querySelector('FlightPathCalculator'), options.flightPathCalculator);
      IfdOptionsUtils.parseAudioOptions(node.querySelector(':scope>Audio'), options.audio);
      options.autopilot = IfdOptionsUtils.parseAutopilotOptions(instrument, node.querySelector(':scope>Autopilot'));

      // Disable configuring flight planner ID for now... consider if we need it
      // const flightPlannerIndex = node.querySelector(':scope>FlightPlannerIndex')?.textContent;
      // if (flightPlannerIndex) {
      //   options.flightPlannerIndex = parseInt(flightPlannerIndex);
      //   if (!LNavUtils.isValidLNavIndex(options.flightPlannerIndex)) {
      //     console.error(`Invalid FlightPlannerIndex '${options.flightPlannerIndex}'. Defaulting to 0.`);
      //     options.flightPlannerIndex = 0;
      //   }
      // }

      const lnavIndex = node.querySelector(':scope>LnavIndex')?.textContent;
      if (lnavIndex) {
        options.lnavIndex = parseInt(lnavIndex);
        if (!LNavUtils.isValidLNavIndex(options.lnavIndex)) {
          console.error(`Invalid LnavIndex '${options.lnavIndex}'. Defaulting to 0.`);
          options.lnavIndex = 0;
        }
      }

      const vnavIndex = node.querySelector(':scope>VnavIndex')?.textContent;
      if (vnavIndex) {
        options.vnavIndex = parseInt(vnavIndex);
        if (!VNavUtils.isValidVNavIndex(options.vnavIndex)) {
          console.error(`Invalid VnavIndex '${options.vnavIndex}'. Defaulting to 0.`);
          options.vnavIndex = 0;
        }
      }
    } else {
      console.warn(`The Instrument configuration cannot be found. Ensure there is an <Instrument> config object with a child "<Name>${instrument.instrumentIdentifier}</Name>" in panel.xml`);
    }

    // XB-1 specific config
    if (options.instrumentType === IfdInstrumentType.IFD550Custom) {
      options.enableBaroSettingFeature = true;
      options.svsFullScreen = true;

      IfdOptionsUtils.migrateXb1Options(options);
    }

    IfdOptionsUtils.checkErrors(options);

    return options as IfdOptions;
  }

  /**
   * Gets the IFD type from the URL params.
   * @param baseInstrument The base instrument to use.
   * @returns The IFD type, defaulting to IFD550 if not valid/provided.
   */
  private static getIfdType(baseInstrument: BaseInstrument): IfdInstrumentType {
    const parsedUrl = new URL(baseInstrument.getAttribute('Url')?.toLowerCase() ?? '');
    let ifdType = parsedUrl.searchParams.get('ifdtype');
    if (ifdType === null && baseInstrument.instrumentXmlConfig.querySelector('IfdType')) {
      // Fallback to legacy panel.xml config for now. This can be removed when the XB-1 is updated.
      console.warn('"IfdType" URL parameter is missing but the legacy parameter in panel.xml is present. This fallback will be removed in a future version!');
      ifdType = baseInstrument.instrumentXmlConfig.querySelector('IfdType')?.textContent?.toLowerCase() ?? null;
    }

    switch (ifdType) {
      case 'ifd540':
        return IfdInstrumentType.IFD540;
      case 'ifd550':
        return IfdInstrumentType.IFD550;
      case 'ifd550custom':
        return IfdInstrumentType.IFD550Custom;
      default:
        console.warn('"ifdType" URL parameter is missing or invalid! Make sure you are using the sim attachment correctly. Defaulting to IFD550');
        return IfdInstrumentType.IFD550;
    }
  }

  /**
   * Checks for any errors/inconsistencies in the options, and disables incompatible options where required.
   * @param options The options object to check.
   */
  private static checkErrors(options: IfdOptions): void {
    if (options.enableBaroSettingFeature && options.airData?.altimeterIndex === undefined) {
      console.warn('[IfdOptions] EnableBaroSettingFeature is true, but AltimeterIndex is not set to a valid altimeter! Disabling EnableBaroSettingFeature.');
      options.enableBaroSettingFeature = false;
    }

    if (options.enableVerticalNavigation && options.airData?.altimeterIndex === undefined) {
      console.warn('[IfdOptions] VerticalNavigation is true, but AltimeterIndex is not set to a valid altimeter! Disabling VerticalNavigation.');
      options.enableVerticalNavigation = false;
    }
  }

  /**
   * Parses the FlightPathCalculatorOptions from an XML node structure.
   * @param node The parent node.
   * @param out The options object to put the parsed values into.
   */
  private static parseFlightPathOptions(node: Element | null, out: Required<IfdFlightPathCalculatorOptions>): void {
    if (node === null) {
      return;
    }

    const numberKeys = new Map<keyof IfdFlightPathCalculatorOptions, string>([
      ['defaultClimbRate', 'DefaultClimbRate'],
      ['defaultSpeed', 'DefaultSpeed'],
      ['bankAngle', 'BankAngle'],
      ['anticipatedSpeedAbove10k', 'AnticipatedSpeedAbove10k'],
      ['anticipatedSpeedBelow10k', 'AnticipatedSpeedBelow10k'],
      ['anticipatedApproachSpeed', 'AnticipatedApproachSpeed'],
    ]);

    for (const [key, nodeName] of numberKeys.entries()) {
      const valueNode = node.querySelector(nodeName);
      if (valueNode && valueNode.textContent) {
        out[key] = parseInt(valueNode.textContent);
      }
    }
  }

  /**
   * Parses the dimming from an XML node structure.
   * @param node The parent node.
   * @param out The options object to put the parsed values into.
   */
  private static parseDimmingOptions(node: Element | null, out: DimmingOptions): void {
    if (node === null) {
      return;
    }

    const potNode = node.querySelector('DimmingPotentiometerIndex');
    if (potNode && potNode.textContent) {
      out.dimmingPotentiometerIndex = parseInt(potNode.textContent);
    }

    IfdOptionsUtils.parseDimmerParameters(node.querySelector('Bezel'), out.bezel);
    IfdOptionsUtils.parseDimmerParameters(node.querySelector('Display'), out.display);
  }

  /**
   * Parses the dimming parameters from an XML node structure.
   * @param node The parent node.
   * @param out The options object to put the parsed values into.
   */
  private static parseDimmerParameters(node: Element | null, out: DimmerParameters): void {
    if (node === null) {
      return;
    }

    const numberKeys = new Map<Exclude<keyof DimmerParameters, 'busCurve'>, string>([
      ['photoResponseTime', 'PhotoResponseTime'],
      ['photoSlope', 'PhotoSlope'],
      ['photoMinimum', 'PhotoMinimum'],
      ['photoMaximum', 'PhotoMaximum'],
      ['busTransition', 'BusTransition'],
      ['busSlope', 'BusSlope'],
      ['busMinimum', 'BusMinimum'],
      ['busMaximum', 'BusMaximum'],
    ]);

    for (const [key, nodeName] of numberKeys.entries()) {
      const valueNode = node.querySelector(nodeName);
      if (valueNode && valueNode.textContent) {
        out[key] = parseInt(valueNode.textContent);
      }
    }

    const curve = node.querySelector('BusCurve')?.textContent?.toLowerCase();
    switch (curve) {
      case DimmingCurve.AviCurve:
      case DimmingCurve.Proportional:
        out.busCurve = curve;
        break;
      default:
        break;
    }
  }

  /**
   * Gets the default datablock preset by name.
   * @param preset The preset name in lowercase, or undefined if not set.
   * @returns The default datablock preset to use.
   */
  private static getDefaultDatablock(preset: string | undefined): DatablockPresetType {
    switch (preset) {
      case 'factorysettings':
        return DatablockPresetType.FactorySettings;
      case 'leftsidefactory':
        return DatablockPresetType.LeftSideFactory;
      case 'leftsidetraffic':
        return DatablockPresetType.LeftSideTraffic;
      case 'leftsidetransponder':
        return DatablockPresetType.LeftSideTransponder;
      default:
        return DatablockPresetType.FactorySettings;
    }
  }

  /**
   * Parses the audio parameters from an XML node structure.
   * @param node The parent node.
   * @param out The options object to put the parsed values into.
   */
  private static parseAudioOptions(node: Element | null, out: IfdAudioOptions): void {
    if (node === null) {
      return;
    }

    out.altitude1000Event = out.airspaceAheadEvent = node.querySelector(':scope>Altitude1000')?.textContent ?? undefined;
    out.altitude100Event = out.airspaceAheadEvent = node.querySelector(':scope>Altitude100')?.textContent ?? undefined;
    out.altitude200Event = out.airspaceAheadEvent = node.querySelector(':scope>Altitude200')?.textContent ?? undefined;
    out.altitude300Event = out.airspaceAheadEvent = node.querySelector(':scope>Altitude300')?.textContent ?? undefined;
    out.altitude400Event = out.airspaceAheadEvent = node.querySelector(':scope>Altitude400')?.textContent ?? undefined;
    out.altitude500Event = out.airspaceAheadEvent = node.querySelector(':scope>Altitude500')?.textContent ?? undefined;

    out.finalApproachEvent = node.querySelector(':scope>FinalApproach')?.textContent ?? undefined;
    out.missedApproachEvent = node.querySelector(':scope>MissedApproach')?.textContent ?? undefined;
    out.waypointEvent = node.querySelector(':scope>Waypoint')?.textContent ?? undefined;

    const waypointAlertCount = (out.finalApproachEvent ? 1 : 0) + (out.missedApproachEvent ? 1 : 0) + (out.waypointEvent ? 1 : 0);
    if (waypointAlertCount > 0 && waypointAlertCount < 3) {
      console.error('All of Audio.FinalApproach, Audio.MissedApproach, and Audio.Waypoint must be configured to enable waypoint alerts, but one is missed. Disabling waypoint alerts.');
      out.finalApproachEvent = undefined;
      out.missedApproachEvent = undefined;
      out.waypointEvent = undefined;
    }

    out.airspaceAheadEvent = node.querySelector(':scope>AirspaceAhead')?.textContent ?? undefined;

    out.topOfDescentEvent = node.querySelector(':scope>TopOfDescent')?.textContent ?? undefined;

    out.cautionTerrainEvent = node.querySelector(':scope>CautionTerrain')?.textContent ?? undefined;
    out.terrainAheadEvent = node.querySelector(':scope>TerrainAhead')?.textContent ?? undefined;

    out.terrainPullUpEvent = node.querySelector(':scope>TerrainPullUp')?.textContent ?? undefined;
    out.terrainTerrainEvent = node.querySelector(':scope>TerrainTerrain')?.textContent ?? undefined;

    out.sinkRateEvent = node.querySelector(':scope>SinkRate')?.textContent ?? undefined;
    out.dontSinkEvent = node.querySelector(':scope>DontSink')?.textContent ?? undefined;
    out.pullUpPullUpEvent = node.querySelector(':scope>PullUpPullUp')?.textContent ?? undefined;
    out.tooLowTerrainEvent = node.querySelector(':scope>TooLowTerrain')?.textContent ?? undefined;
  }

  /**
   * Parses the external heading system options.
   * @param baseInstrument The base instrument we are on.
   * @param node The ExternalHeadingSystem node to parse, or null if none.
   * @returns The heading options.
   */
  private static parseHeadingOptions(baseInstrument: BaseInstrument, node: Element | null): ExternalHeadingOptions | undefined {
    if (node) {
      const options: ExternalHeadingOptions = {};

      const electricLogicElement = node.querySelector(':scope>Electric');
      if (electricLogicElement) {
        options.electricalLogic = new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
      }

      return options;
    }

    return undefined;
  }

  /**
   * Parses the external air data computer options.
   * @param baseInstrument The base instrument we are on.
   * @param node The ExternalAirDataSystem node to parse, or null if none.
   * @returns The air data computer options.
   */
  private static parseAirDataOptions(baseInstrument: BaseInstrument, node: Element | null): ExternalAirDataOptions | undefined {
    if (node) {
      const options: ExternalAirDataOptions = {};

      const electricLogicElement = node.querySelector(':scope>Electric');
      if (electricLogicElement) {
        options.electricalLogic = new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
      }

      const airspeedIndex = parseInt(node.querySelector(':scope>AirspeedIndex')?.textContent ?? '0');
      if (airspeedIndex) {
        options.airspeedIndex = airspeedIndex;
      }

      const altimeterIndex = parseInt(node.querySelector(':scope>AltimeterIndex')?.textContent ?? '0');
      if (altimeterIndex) {
        options.altimeterIndex = altimeterIndex;
      }

      return options;
    }

    return undefined;
  }

  /**
   * Parses the external traffic system options.
   * @param baseInstrument The base instrument we are on.
   * @param node The ExternalTrafficOptions node to parse, or null if none.
   * @returns The traffic options.
   */
  private static parseTrafficOptions(baseInstrument: BaseInstrument, node: Element | null): ExternalTrafficOptions | undefined {
    if (node) {
      const options: ExternalTrafficOptions = {
        type: TrafficSystemType.Tas,
        hasAdsB: false,
      };

      const type = node.querySelector(':scope>Type');

      switch (type?.textContent?.toLowerCase()) {
        case 'tas':
          options.type = TrafficSystemType.Tas;
          break;
        case 'tis':
          options.type = TrafficSystemType.Tis;
          break;
        default:
          console.warn(`[IfdOptions::parseTrafficOptions] Invalid ExternalTrafficSystem Type ${type?.textContent}. Valid options are TAS or TIS.`);
          return undefined;
      }

      options.hasAdsB = type.getAttribute('ads-b')?.toLowerCase() === 'true';

      const electricLogicElement = node.querySelector(':scope>Electric');
      if (electricLogicElement) {
        options.electricalLogic = new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
      }

      return options;
    }

    return undefined;
  }

  private static DEFAULT_AUTOPILOT_OPTIONS: IfdAutopilotOptions = {
    enableBackCourse: true,
    enableNavArming: true,
    independentFlightDirector: false,
    maxBankAngle: 25,
  };

  /**
   * Parses the autopilot parameters from an XML node structure.
   * @param baseInstrument The base instrument we are running on.
   * @param node The <Autopilot /> parent node, or null if no AP is configured.
   * @returns The autopilot options if an AP is configured, else undefined.
   */
  private static parseAutopilotOptions(baseInstrument: BaseInstrument, node: Element | null): IfdAutopilotOptions | undefined {
    if (node === null) {
      return;
    }

    const options = { ...IfdOptionsUtils.DEFAULT_AUTOPILOT_OPTIONS };

    const electricLogicElement = node.querySelector(':scope>Electric');
    if (electricLogicElement) {
      options.electricalLogic = new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
    }

    if (node.querySelector(':scope>EnableBackCourse')?.textContent?.toLowerCase() === 'false') {
      options.enableBackCourse = false;
    }

    if (node.querySelector(':scope>EnableNavArming')?.textContent?.toLowerCase() === 'false') {
      options.enableNavArming = false;
    }

    if (node.querySelector(':scope>IndependentFlightDirector')?.textContent?.toLowerCase() === 'true') {
      options.independentFlightDirector = true;
    }

    const maxBank = node.querySelector(':scope>MaxBankAngle')?.textContent;
    if (maxBank) {
      options.maxBankAngle = parseInt(maxBank);
    }

    return IfdOptionsUtils.DEFAULT_AUTOPILOT_OPTIONS;
  }

  /**
   * Parses the external fuel flow system options.
   * @param baseInstrument The base instrument we are on.
   * @param node The ExternalFuelFlowSystem node to parse, or null if none.
   * @returns The fuel flow options.
   */
  private static parseFuelFlowOptions(
    baseInstrument: BaseInstrument,
    node: Element | null
  ): ExternalFuelFlowOptions | undefined {
    if (!node) {
      return undefined;
    }

    const options: ExternalFuelFlowOptions = {
      hasTotalizer: node.querySelector(':scope>HasTotalizer')?.textContent?.toLowerCase() === 'true',
      sensors: [],
    };

    const electricLogicElement = node.querySelector(':scope>Electric');
    if (electricLogicElement) {
      options.electricalLogic = new CompositeLogicXMLElement(baseInstrument, electricLogicElement);
    }

    const sensorElements = node.querySelectorAll(':scope>Sensors>Sensor');
    for (const sensorElement of sensorElements) {
      const index = parseInt(sensorElement.getAttribute('index') ?? '0');
      const engineIndex = parseInt(sensorElement.getAttribute('engine-index') ?? '0');

      if ((index === 1 || index === 2) && engineIndex >= 1) {
        options.sensors.push({ index: index as 1 | 2, engineIndex });
      }
    }

    if (options.sensors.length > 2) {
      console.warn('[IfdOptions] More than 2 fuel flow sensors configured. Only the first 2 will be used.');
      options.sensors = options.sensors.slice(0, 2);
    }

    if (options.sensors.length === 0) {
      console.warn('[IfdOptions] ExternalFuelFlowSystem configured but no valid sensors found. Fuel management will be disabled.');
      return undefined;
    }

    return options;
  }

  /**
   * Migrates XB-1 panel.xml config to current IFD build.
   * @param options The IFD options to migrate.
   */
  private static migrateXb1Options(options: IfdOptions): void {
    if (!options.airData) {
      console.warn('[IfdOptions] ExternalAirDataSystem is not present! Defaulting to altimeter 1 and airspeed indicator 1. This will be removed in a future version.');

      options.airData = {
        airspeedIndex: 1,
        altimeterIndex: 1,
      };
    }

    if (!options.heading) {
      console.warn('[IfdOptions] ExternalHeadingSystem is not present! Defaulting to enabled. This will be removed in a future version.');

      options.heading = {};
    }
  }
}

import { Subscribable } from '@microsoft/msfs-sdk';

import { FormatUtils } from '../../Utilities/FormatUtils';
import { CasUuid } from './CasUuid';

/** Data used to fill CAS messages. */
export interface CasMessageDataSources {
  /** The desired track for the active leg, in degrees magnetic. */
  readonly activeLegDesiredTrack: Subscribable<number>;
  /** The active leg ETE in seconds. */
  readonly activeLegEgressEte: Subscribable<number>;
  /** The class name of airspace ahead. */
  readonly airspaceAheadClass: Subscribable<string>;
  /** The name of airspace ahead. */
  readonly airspaceAheadName: Subscribable<string>;
  /** The lower altitude of the airspace ahead in feet, or undefined if surface. */
  readonly airspaceAheadLowerAlt: Subscribable<number | undefined>;
  /** The upper altitude of the airspace ahead in feet, or undefined if there is no limit. */
  readonly airspaceaheadUpperAlt: Subscribable<number | undefined>;
  /** The name of the custom timer. */
  readonly customTimerName1: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName2: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName3: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName4: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName5: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName6: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName7: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName8: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName9: Subscribable<string>;
  /** The name of the custom timer. */
  readonly customTimerName10: Subscribable<string>;
  /** The desired track for the next leg, in degrees magnetic. */
  readonly nextLegDesiredTrack: Subscribable<number>;
  /** The time remaining for power down due to low volts warning. */
  readonly powerDownTimer: Subscribable<number>;
  /** The time remaining to reach ToD in seconds. */
  readonly todTimeToGoSeconds: Subscribable<number>
  /** The active traffic advisory message. */
  readonly trafficAdvisoryMessage: Subscribable<string>;
  /** The active traffic advisory description. */
  readonly trafficAdvisoryDescription: Subscribable<string>;
  /** The transition altitude in feet. */
  readonly transitionAltitude: Subscribable<number>;
  /** The transition level in feet. */
  readonly transitionLevel: Subscribable<number>;
}

export enum IfdCasMessagePriority {
  /** Red warning. */
  Warning,
  /** Yellow caution. */
  Caution,
  /** Cyan advisory. */
  Advisory,
  /** Green notice. */
  Notice,
}

/** Definition of an individual CAS message. */
export interface CasMessageDefinition {
  /**
   * The priority of this message.
   */
  priority: IfdCasMessagePriority,
  /**
   * The (short) message shown in the alert pop-up.
   * If callable, and dataSubs is defined, the description will be updated any time
   * a data sub notifies.
   */
  message: ((data: CasMessageDataSources) => string) | string;
  /**
   * Extended description for display on the alert page.
   * Defaults to the same as message.
   * If callable, and dataSubs is defined, the description will be updated any time
   * a data sub notifies.
   */
  description?: ((data: CasMessageDataSources) => string) | string;
  /**
   * Data subscibables to watch for message updating while this message is active.
   * This is only relevant for messages with a callable {@link description}. In that case,
   * `message` will be called every time one of the subs notifies.
   */
  dataSubs?: (keyof CasMessageDataSources)[];
  /** Whether the alert is global (will be acknowledged on the other unit as well). */
  isGlobal?: true;
  /** Whether the alert should be deleted upon ack. */
  deleteOnAck?: true;
}

/** An active IFD CAS message. */
export interface IfdCasActiveMessage {
  /** The UUID of this message. */
  uuid: CasUuid;
  /** The definition of this message. */
  def: Readonly<CasMessageDefinition>;
  /** The time since the start of the sim session that this alert was last activated, in ms. */
  lastActivated: number;
  /** Whether the message has been acknowledged since it was last activated. */
  acknowledged: boolean;
}

export const CAS_MESSAGES: Record<CasUuid, CasMessageDefinition> = {
  // Red Warnings
  [CasUuid.PullUp]: {
    priority: IfdCasMessagePriority.Warning,
    message: 'Pull Up',
    description: 'Excessive Descent Rate',
  },
  [CasUuid.TerrainPullUp]: {
    priority: IfdCasMessagePriority.Warning,
    message: 'Terrain\nPull Up',
    description: 'Terrain Pull Up',
    isGlobal: true,
  },

  // Yellow Cautions
  [CasUuid.CautionTerrain]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'Caution\nTerrain',
    description: 'Caution Terrain',
    isGlobal: true,
  },
  [CasUuid.CheckAltitudeTooLow]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'Check Altitude\nToo Low',
    description: 'Aircraft is below the glide slope altitude at FAF',
  },
  [CasUuid.DontSink]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'Don\'t\nSink',
    description: 'Negative climb rate or altitude loss',
  },
  [CasUuid.GpsFault]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'GPS Fault',
  },
  [CasUuid.GpsIntegrityLost]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'GPS Integrity\nLost',
    description: 'GPS Integrity Lost Crosscheck Nav',
  },
  [CasUuid.HeadingLost]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'Heading\nLost',
    description: 'Using ground track for SVS',
  },
  [CasUuid.LpUnavailableUseLnavMda]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'LP Unavailable\nUse LNAV MDA',
    description: 'GPS integrity is insufficient for LP Approach',
  },
  [CasUuid.LpvUnavailableUseLVnavDa]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'LPV Unavailable\nUse L/VNAV DA',
    description: 'GPS integrity is insufficient for LPV Approach',
  },
  [CasUuid.LpvUnavailableUseLnavMda]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'LPV Unavailable\nUse LNAV MDA',
    description: 'GPS integrity is insufficient for LPV Approach',
  },
  [CasUuid.LVNavUnavailableUseLnavMda]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'L/VNAV Unavail.\nUse LNAV MDA',
    description: 'GPS integrity is insufficient for L/VNAV Approach',
  },
  [CasUuid.ManualSequenceReqd]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'Manual\nSequence Req\'d',
    description: 'Altitude Invalid - leg will not auto sequence',
  },
  [CasUuid.NoCommWithVhf]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'No Comm\nwith VHF',
    description: 'No communication with the VHF radio',
  },
  [CasUuid.NoCommWithXpdr]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'No Comm\nwith Xpdr',
    description: 'No communication with Remote Transponder',
  },
  [CasUuid.NoPosition]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'No Position',
    description: 'No position available',
  },
  [CasUuid.SinkRate]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'Sink Rate',
    description: 'Excessive Descent Rate',
  },
  [CasUuid.TawsFail]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'TAWS Fail',
    description: 'Invalid GPS Position/Velocity',
  },
  [CasUuid.TooLowTerrain]: {
    priority: IfdCasMessagePriority.Caution,
    message: 'Too Low,\nTerrain',
    description: 'Premature Descent, below glide path',
  },
  [CasUuid.Traffic]: {
    priority: IfdCasMessagePriority.Caution,
    message: (data) => data.trafficAdvisoryMessage.get(),
    description: (data) => data.trafficAdvisoryDescription.get(),
    dataSubs: ['trafficAdvisoryDescription', 'trafficAdvisoryMessage'],
    isGlobal: true,
  },

  // Cyan Advisories
  [CasUuid.AirspaceAhead]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.airspaceAheadClass.get()}\nAhead`,
    description: (data) => `${data.airspaceAheadName.get()} ${data.airspaceAheadLowerAlt.get()?.toFixed(0) ?? 'Sfc'} -\n${data.airspaceaheadUpperAlt.get()?.toFixed(0) ?? 'Unltd'} FT`,
    dataSubs: ['airspaceAheadLowerAlt', 'airspaceAheadClass', 'airspaceAheadName', 'airspaceaheadUpperAlt'],
    isGlobal: true,
  },
  [CasUuid.BeginDescent]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => {
      const ttg = data.todTimeToGoSeconds.get();
      return `Begin Descent\n${ttg < 0.5 ? 'Now' : `In ${ttg.toFixed(0)} Seconds`}`;
    },
    description: 'Approaching Top Of Descent',
    dataSubs: ['todTimeToGoSeconds'],
  },
  [CasUuid.CheckInitFuel]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Check Init\nFuel',
    description: 'Fuel Used reset. Check initial fuel setting.',
  },
  [CasUuid.CheckNavaidIdentifier]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Check Navaid\nIdentifier',
    description: 'Decoded navaid identifier did not match approach navaid',
  },
  [CasUuid.CheckNavFrequency]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Check Nav\nFrequency',
    description: 'Tuned frequency does not match approach navaid',
  },
  [CasUuid.DeadReckoning]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Dead\nReckoning',
    description: 'Position updated using dead reckoning',
  },
  [CasUuid.EnableApApr]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Enable A/P\nAPR',
    description: 'Use bottom LSK on FPL tab before A/P APR',
  },
  [CasUuid.ExitingHoldAtFix]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Exiting Hold\nAt Fix',
    description: 'Exiting Hold At Fix',
    deleteOnAck: true,
  },
  [CasUuid.ExitingHoldAtIntercept]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Exiting Hold\nAt Intercept',
    description: 'Exiting Hold At Intercept',
    deleteOnAck: true,
  },
  [CasUuid.FltaOff]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'FLTA Off',
    description: 'Disabled in Setup Options',
    deleteOnAck: true,
  },
  [CasUuid.FltaUnavailable]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'FLTA\nUnavailable',
    description: 'Invalid GPS Position/Velocity',
    deleteOnAck: true,
  },
  [CasUuid.GapInRouteAhead]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Gap In Route\nAhead',
    description: 'Gap In Route Ahead',
    deleteOnAck: true,
  },
  [CasUuid.HoldCourseXXX]: {
    priority: IfdCasMessagePriority.Advisory,
    // TODO double check initialDtk does the right thing here
    message: (data) => `Hold Course\n${FormatUtils.formatCourse(data.nextLegDesiredTrack.get())}°`,
    description: (data) => `Hold Course ${FormatUtils.formatCourse(data.nextLegDesiredTrack.get())}°`,
    dataSubs: ['nextLegDesiredTrack'],
    deleteOnAck: true,
  },
  [CasUuid.InterceptTooSharp]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Intercept\nToo Sharp',
    description: 'Must Intercept Within 45° of Final Approach Course',
    isGlobal: true,
  },
  [CasUuid.NextLegCCCinXXSec]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => {
      const ete = data.activeLegEgressEte.get();
      return `Next Leg ${FormatUtils.formatCourse(data.nextLegDesiredTrack.get())}°\n${ete < 0.5 ? 'Now' : `in ${ete.toFixed(0)} sec`}`;
    },
    description: (data) => `Next Leg ${FormatUtils.formatCourse(data.nextLegDesiredTrack.get())}°`,
    dataSubs: ['activeLegEgressEte', 'nextLegDesiredTrack'],
    deleteOnAck: true,
    isGlobal: true,
  },
  [CasUuid.ParallelEntry]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Parallel\nEntry',
    description: 'Parallel Entry',
    deleteOnAck: true,
  },
  [CasUuid.SetCourseToX]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `Set course\nto ${data.activeLegDesiredTrack.get().toFixed(0)}°`,
    description: 'Selected course / DTK mismatch',
    dataSubs: ['activeLegDesiredTrack'],
  },
  [CasUuid.SwitchTanks]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Switch\nTanks',
    description: 'Switch fuel tanks',
    deleteOnAck: true,
    isGlobal: true,
  },
  [CasUuid.TeardropEntry]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Teardrop\nEntry',
    description: 'Teardrop Entry',
    deleteOnAck: true,
  },
  [CasUuid.TimerCustom1Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName1.get()}\nTimer`,
    description: (data) => `${data.customTimerName1.get()} Timer Expired`,
    dataSubs: ['customTimerName1'],
  },
  [CasUuid.TimerCustom2Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName2.get()}\nTimer`,
    description: (data) => `${data.customTimerName2.get()} Timer Expired`,
    dataSubs: ['customTimerName2'],
  },
  [CasUuid.TimerCustom3Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName3.get()}\nTimer`,
    description: (data) => `${data.customTimerName3.get()} Timer Expired`,
    dataSubs: ['customTimerName3'],
  },
  [CasUuid.TimerCustom4Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName4.get()}\nTimer`,
    description: (data) => `${data.customTimerName4.get()} Timer Expired`,
    dataSubs: ['customTimerName4'],
  },
  [CasUuid.TimerCustom5Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName5.get()}\nTimer`,
    description: (data) => `${data.customTimerName5.get()} Timer Expired`,
    dataSubs: ['customTimerName5'],
  },
  [CasUuid.TimerCustom6Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName6.get()}\nTimer`,
    description: (data) => `${data.customTimerName6.get()} Timer Expired`,
    dataSubs: ['customTimerName6'],
  },
  [CasUuid.TimerCustom7Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName7.get()}\nTimer`,
    description: (data) => `${data.customTimerName7.get()} Timer Expired`,
    dataSubs: ['customTimerName7'],
  },
  [CasUuid.TimerCustom8Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName8.get()}\nTimer`,
    description: (data) => `${data.customTimerName8.get()} Timer Expired`,
    dataSubs: ['customTimerName8'],
  },
  [CasUuid.TimerCustom9Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName9.get()}\nTimer`,
    description: (data) => `${data.customTimerName9.get()} Timer Expired`,
    dataSubs: ['customTimerName9'],
  },
  [CasUuid.TimerCustom10Expired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `${data.customTimerName10.get()}\nTimer`,
    description: (data) => `${data.customTimerName10.get()} Timer Expired`,
    dataSubs: ['customTimerName10'],
  },
  [CasUuid.TimerExpired]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'Timer\nExpired',
    description: 'Timer Expired',
  },
  [CasUuid.TransAltXXX]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `Trans Alt\n${data.transitionAltitude.get().toFixed(0)}FT`,
    description: (data) => `Trans Alt ${data.transitionAltitude.get().toFixed(0)}FT`,
    dataSubs: ['transitionAltitude'],
    deleteOnAck: true,
  },
  [CasUuid.TransLevelXXX]: {
    priority: IfdCasMessagePriority.Advisory,
    message: (data) => `Trans Level\nFL${(data.transitionLevel.get() / 100).toFixed(0).padStart(3, '0')}`,
    description: (data) => `Trans Level FL${(data.transitionLevel.get() / 100).toFixed(0).padStart(3, '0')}`,
    dataSubs: ['transitionLevel'],
    deleteOnAck: true,
  },
  [CasUuid.VnavSuspendedCourseLimit]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'VNAV\nSuspended',
    description: 'Course error limit exceeded',
  },
  [CasUuid.VnavSuspendedXtkLimit]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'VNAV\nSuspended',
    description: 'Cross track error limit exceeded',
  },
  [CasUuid.VnavTerminatedAltiConstraint]: {
    priority: IfdCasMessagePriority.Advisory,
    message: 'VNAV\nTerminated',
    description: 'Unable to meet altitude constraint',
  },
};

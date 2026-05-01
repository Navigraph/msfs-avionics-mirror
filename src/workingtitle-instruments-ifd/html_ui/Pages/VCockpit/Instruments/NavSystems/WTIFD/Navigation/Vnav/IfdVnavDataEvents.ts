import { BaseVNavDataEvents } from '@microsoft/msfs-sdk';

/**
 * Events related to IFD VNAV data keyed by base topic names.
 */
export interface BaseIfdVNavDataEvents extends BaseVNavDataEvents {
  /**
   *
   */
  gp_can_capture: boolean;
}

/**
 * Events related to IFD VNAV keyed by indexed topic names.
 */
export type IndexedIfdVNavDataEvents<Index extends number = number> = {
  [P in keyof BaseIfdVNavDataEvents as `${P}_${Index}`]: BaseIfdVNavDataEvents[P];
};

/**
 * Events related to IFD VNAV.
 */
export interface IfdVNavDataEvents extends BaseIfdVNavDataEvents, IndexedIfdVNavDataEvents { }

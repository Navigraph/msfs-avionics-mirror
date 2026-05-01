import { AirportFacility, Facility, MutableSubscribable, NdbFacility, Subscribable, VorFacility } from '@microsoft/msfs-sdk';

import { DynamicListData } from '../../../../Components/List';

/** Base interface for facility list data. */
export interface FacilityBaseListData extends DynamicListData {
  /** The type of facility list item. */
  readonly type: string;
  /** The facility */
  readonly facility: Facility;
  /** The distance from PPOS to the facility */
  readonly facilityDistance: MutableSubscribable<number>;
  /** The heading from PPOS to the facility */
  readonly facilityHeading: MutableSubscribable<number>;
  /** @inheritdoc */
  readonly isVisible: Subscribable<boolean>;
  /** Whether the facility is the active waypoint in the flight plan. */
  readonly isActiveWaypoint: MutableSubscribable<boolean>;
}

/** Represents a standard facility on the nearest page. */
export interface StdFacilityListData extends FacilityBaseListData {
  /** The type of flight plan list item. */
  readonly type: 'standard',
}

/** Represents an airport facility on the nearest page. */
export interface AirportFacilityListData extends FacilityBaseListData {
  /** The type of flight plan list item. */
  readonly type: 'airport',
  /** The facility */
  readonly facility: AirportFacility;
  /** The METAR category, if applicable */
  readonly metarCategory: () => Promise<IfdMetarCategory | undefined>
  /** The in-air airport frequency, if applicable */
  readonly frequency?: number;
  /** Whether the airport is in the flight plan. */
  readonly isFlightplanAirport: MutableSubscribable<boolean>;
}

/** Represents a VOR facility on the nearest page. */
export interface VorFacilityListData extends FacilityBaseListData {
  /** The type of flight plan list item. */
  readonly type: 'vor' | 'ndb',
  /** The facility */
  readonly facility: VorFacility | NdbFacility;
}

/** Represents an NDB facility on the nearest page. */
export interface NdbFacilityListData extends FacilityBaseListData {
  /** The type of flight plan list item. */
  readonly type: 'ndb',
  /** The facility */
  readonly facility: NdbFacility;
}

/**
 * Facility list data
 */
export type FacilityListData = AirportFacilityListData | StdFacilityListData | VorFacilityListData | NdbFacilityListData

/**
 * METAR CATEGORIES:
 * VFR: >5SM & >3000ft
 * MVFR:  3-5SM or 1000-3000ft
 * IFR: 1-3SM or 500-1000ft
 * LIFR: 0.5-1SM or 200-500ft
 * CAT1: <0.5SM or  <200ft
 */
export enum IfdMetarCategory {
  VFR = 'vfr',
  MVFR = 'mvfr',
  IFR = 'ifr',
  LIFR = 'lifr',
  CAT1 = 'cat1'
}

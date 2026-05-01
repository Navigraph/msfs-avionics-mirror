/** InfoTab focusable IDs */
export const InfoTabFocusableId = {
  HeaderTerminus: 'header-terminus',
  HeaderProcedureIcon: 'header-procedure-icon',
  General: 'general',
  Communications: 'communications',
  RunwayInfo: 'runway-info',
  NearbyNavaids: 'nearby-navaids',
  Departures: 'departures',
  Approaches: 'approaches',
  Arrivals: 'arrivals',
  Weather: 'weather',
} as const;

/** The type of a focusable ID. */
export type InfoTabFocusableId = typeof InfoTabFocusableId[keyof typeof InfoTabFocusableId];

/** Only the collapsible groups (no header focuses). */
export type InfoTabGroupId = Exclude<
  InfoTabFocusableId,
  typeof InfoTabFocusableId.HeaderTerminus | typeof InfoTabFocusableId.HeaderProcedureIcon
>;

/** The order the knob will walk through. */
export const INFO_TAB_FOCUS_ORDER: readonly InfoTabFocusableId[] = [
  InfoTabFocusableId.HeaderTerminus,
  InfoTabFocusableId.HeaderProcedureIcon,
  InfoTabFocusableId.General,
  InfoTabFocusableId.Communications,
  InfoTabFocusableId.RunwayInfo,
  InfoTabFocusableId.NearbyNavaids,
  InfoTabFocusableId.Departures,
  InfoTabFocusableId.Approaches,
  InfoTabFocusableId.Arrivals,
  InfoTabFocusableId.Weather,
] as const;

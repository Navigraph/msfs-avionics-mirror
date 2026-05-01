export enum IfdNavMode {
  VLOC = 'VLOC',
  GPS = 'GPS',
  OBS = 'OBS',
}

/** Approach modes available when the GPS mode is active. */
export enum IfdApproachNavModes {
  LPV = 'LPV',
  LVNAV = 'L/VNAV',
  LP = 'LP',
  LP_V = 'LP+V',
  LNAV = 'LNAV',
  LNAV_V = 'LNAV+V',
  Visual = 'Visual',
}

export const ifdNavSources = [
  IfdNavMode.VLOC,
  IfdNavMode.GPS,
  IfdNavMode.OBS,
] as const;

/**
 * The IFD nav sources.
 */
export type IfdNavSources = typeof ifdNavSources;

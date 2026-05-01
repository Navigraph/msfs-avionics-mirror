import { IfdNavMode as IfdNavMode } from './Sources/IfdNavSources';

/**
 * Events to control the internal IFD navigation.
 */
export interface IfdNavControlEvents {
  /** Arms an IFD navigation mode, or null for no armed mode. */
  ifd_nav_arm_mode: IfdNavMode | null;

  /** Activates an IFD navigation mode. */
  ifd_nav_activate_mode: IfdNavMode;
}

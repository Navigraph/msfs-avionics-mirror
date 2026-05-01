export enum IfdIlluminationMode {
  Day,
  Night,
}

/** Events relating to illumination management. */
export interface IfdIlluminationEvents {
  /** The active illumination mode using the dimming bus. */
  ifd_illumination_mode_dimbus: IfdIlluminationMode;
  /** The active illumination mode using the photocell. */
  ifd_illumination_mode_photocell: IfdIlluminationMode;
}

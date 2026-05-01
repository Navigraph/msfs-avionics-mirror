/**
 * An event that is published when an interaction event is received.
 */
export interface IfdInteractions {
  /**
   * The name of the event.
   */
  readonly ifd_interaction_event: IfdInteractionEvent;
}

/**
 * Interaction events available on the GNS430/530 bezel.
 */
export enum IfdInteractionEvent {
  // Left side
  VolumePush = 'VolumePush',
  VolumeDec = 'VolumeDec',
  VolumeInc = 'VolumeInc',
  FrequencySwap = 'FrequencySwap',
  LineSelectKey1 = 'LineSelectKey1',
  LineSelectKey2 = 'LineSelectKey2',
  LineSelectKey3 = 'LineSelectKey3',
  LineSelectKey4 = 'LineSelectKey4',
  LeftKnobPush = 'LeftKnobPush',
  LeftKnobInnerDec = 'LeftKnobInnerDec',
  LeftKnobInnerInc = 'LeftKnobInnerInc',
  LeftKnobOuterDec = 'LeftKnobOuterDec',
  LeftKnobOuterInc = 'LeftKnobOuterInc',

  // Page buttons
  SVSLeft = 'SVSLeft',
  SVSHeldLeft = 'SVSLeftHeld',
  SVSRight = 'SVSRight',
  SVSHeldRight = 'SVSRightHeld',
  FMSLeft = 'FMSLeft',
  FMSHeldLeft = 'FMSLeftHeld',
  FMSRight = 'FMSRight',
  FMSHeldRight = 'FMSRightHeld',
  MAPLeft = 'MAPLeft',
  MAPHeldLeft = 'MAPLeftHeld',
  MAPRight = 'MAPRight',
  MAPHeldRight = 'MAPRightHeld',
  AUXLeft = 'AUXLeft',
  AUXHeldLeft = 'AUXLeftHeld',
  AUXRight = 'AUXRight',
  AUXHeldRight = 'AUXRightHeld',

  // Right side
  CDIKnobPush = 'CDIKnobPush',
  CDIKnobDec = 'CDIKnobDec',
  CDIKnobInc = 'CDIKnobInc',
  DirectTo = 'DirectTo',
  PROC = 'PROC',
  NRST = 'NRST',
  FREQ = 'FREQ',
  ENTR = 'ENTR',
  CLR = 'CLR',
  RightKnobPush = 'RightKnobPush',
  RightKnobInnerDec = 'RightKnobInnerDec',
  RightKnobInnerInc = 'RightKnobInnerInc',
  RightKnobOuterDec = 'RightKnobOuterDec',
  RightKnobOuterInc = 'RightKnobOuterInc',

  // COM radio presets
  ComPresetInc = 'ComPresetInc',
  ComPresetDec = 'ComPresetDec',
}

/**
 * A map of interaction event strings to the event enumeration.
 */
export const IFDInteractionEventMap: Record<string, IfdInteractionEvent> = {
  // Left side
  'VOLUME_PUSH': IfdInteractionEvent.VolumePush,
  'VOLUME_DEC': IfdInteractionEvent.VolumeDec,
  'VOLUME_INC': IfdInteractionEvent.VolumeInc,
  'FREQUENCY_SWAP': IfdInteractionEvent.FrequencySwap,
  'LINE_SELECT_KEY1': IfdInteractionEvent.LineSelectKey1,
  'LINE_SELECT_KEY2': IfdInteractionEvent.LineSelectKey2,
  'LINE_SELECT_KEY3': IfdInteractionEvent.LineSelectKey3,
  'LINE_SELECT_KEY4': IfdInteractionEvent.LineSelectKey4,
  'LEFT_KNOB_PUSH': IfdInteractionEvent.LeftKnobPush,
  'LEFT_KNOB_INNER_DEC': IfdInteractionEvent.LeftKnobInnerDec,
  'LEFT_KNOB_INNER_INC': IfdInteractionEvent.LeftKnobInnerInc,
  'LEFT_KNOB_OUTER_DEC': IfdInteractionEvent.LeftKnobOuterDec,
  'LEFT_KNOB_OUTER_INC': IfdInteractionEvent.LeftKnobOuterInc,

  // Page buttons
  'SVS_LEFT': IfdInteractionEvent.SVSLeft,
  'SVS_HELD_LEFT': IfdInteractionEvent.SVSHeldLeft,
  'SVS_RIGHT': IfdInteractionEvent.SVSRight,
  'SVS_HELD_RIGHT': IfdInteractionEvent.SVSHeldRight,
  'FMS_LEFT': IfdInteractionEvent.FMSLeft,
  'FMS_HELD_LEFT': IfdInteractionEvent.FMSHeldLeft,
  'FMS_RIGHT': IfdInteractionEvent.FMSRight,
  'FMS_HELD_RIGHT': IfdInteractionEvent.FMSHeldRight,
  'MAP_LEFT': IfdInteractionEvent.MAPLeft,
  'MAP_HELD_LEFT': IfdInteractionEvent.MAPHeldLeft,
  'MAP_RIGHT': IfdInteractionEvent.MAPRight,
  'MAP_HELD_RIGHT': IfdInteractionEvent.MAPHeldRight,
  'AUX_LEFT': IfdInteractionEvent.AUXLeft,
  'AUX_HELD_LEFT': IfdInteractionEvent.AUXHeldLeft,
  'AUX_RIGHT': IfdInteractionEvent.AUXRight,
  'AUX_HELD_RIGHT': IfdInteractionEvent.AUXHeldRight,

  // Right side
  'CDI_KNOB_PUSH': IfdInteractionEvent.CDIKnobPush,
  'CDI_KNOB_DEC': IfdInteractionEvent.CDIKnobDec,
  'CDI_KNOB_INC': IfdInteractionEvent.CDIKnobInc,
  'DIRECT_TO': IfdInteractionEvent.DirectTo,
  'PROC': IfdInteractionEvent.PROC,
  'NRST': IfdInteractionEvent.NRST,
  'FREQ': IfdInteractionEvent.FREQ,
  'ENTR': IfdInteractionEvent.ENTR,
  'CLR': IfdInteractionEvent.CLR,
  'RIGHT_KNOB_PUSH': IfdInteractionEvent.RightKnobPush,
  'RIGHT_KNOB_INNER_DEC': IfdInteractionEvent.RightKnobInnerDec,
  'RIGHT_KNOB_INNER_INC': IfdInteractionEvent.RightKnobInnerInc,
  'RIGHT_KNOB_OUTER_DEC': IfdInteractionEvent.RightKnobOuterDec,
  'RIGHT_KNOB_OUTER_INC': IfdInteractionEvent.RightKnobOuterInc,

  // COM radio presets
  'COM_PRESET_INC': IfdInteractionEvent.ComPresetInc,
  'COM_PRESET_DEC': IfdInteractionEvent.ComPresetDec,
};

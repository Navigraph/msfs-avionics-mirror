/**
 * The type of virtual keyboard to display
 */
export enum VirtualKeyboardType {
  /** Standard alphanumeric keyboard */
  Alphanumeric = 'alphanumeric',
  /** Symbol keyboard */
  Symbol = 'symbol',
  /** XPDR Transponder keyboard */
  XPDR = 'xpdr'
}

/**
 * Interface for suggestion handler types
 */
export enum KeyboardInputType {
  Facility,
  Com_Frequency_Spacing25Khz,
  Com_Frequency_Spacing833Khz,
  Nav,
  NavText,
  FreeText,
  ClimbAltitudeOrFlightLevel,
  DescentAltitudeOrFlightLevel,
  Altitude,
  FlightLevel,
  Angle,
  DescentAngle,
  DescentRate,
  NM,
  Duration,
  Ident,
  Temperature,
  Pressure,
  LatLon,
  LocalTimeOffset,
  HoursMinutesSeconds,
  TimeOfDay,
  Date,
  HoursDecimal,
}

/**
 * Event data for text edit keyboard interactions
 */
export interface NumericEditRowKeyboardEvent {
  /** Initial value to show in the keyboard */
  initialValue: string;
  /** Callback when value changes */
  onValueChanged: (value: string) => void;
  /** Callback for when enter button is pressed */
  onEnter: () => void;
  /** Callback for when close button (x) is pressed */
  onClose?: () => void;
  /** Flag indicating that only the numpad should be allowed, alpha mode disabled */
  numpadOnly: boolean;
}

/**
 * Event data for text edit keyboard interactions
 */
export interface TextEditRowKeyboardEvent {
  /** The type of keyboard to display */
  type?: VirtualKeyboardType;
  /** Keyboard Input type */
  keyboardInputType: KeyboardInputType;
  /** Whether to disable the keyboard mode switch (e.g. for numpad-only) */
  disableModeSwitch?: boolean;
  /** Whether to initially show numpad (true) or alpha keyboard (false) */
  initialShowNumpad?: boolean;
  /** The initial value to display in the keyboard */
  initialValue: string;
  /** Callback when the keyboard value changes */
  onValueChanged?: (value: string) => void;
  /** Callback when the keyboard caret position changes. */
  onCaretPositionChanged?: (position: number) => void;
  /** Callback for when enter button is pressed */
  onEnter: (value: string) => void;
  /** Callback for when close button (x) is pressed */
  onClose?: () => void;
  /** Reference to the row element */
  rowRef: any;
  /** The instrument index */
  instrumentIndex: number;
  /** Whether should we skip the facility search */
  disableFacilitySearch?: boolean
  /** The maximum length of the input text */
  maxLength?: number;
  /** The input characters that are allowed. */
  allowedCharacters?: string[];
}

/** Event types for IFD virtual keyboard events. */
export interface IfdKeyboardControlEvents {
  /** Text edit row keyboard event */
  'text_edit_row_keyboard_open': TextEditRowKeyboardEvent;
  /** Numeric edit row keyboard event */
  'numeric_edit_row_keyboard_open': NumericEditRowKeyboardEvent;
  /** Keyboard close event */
  'keyboard_close': undefined;
}

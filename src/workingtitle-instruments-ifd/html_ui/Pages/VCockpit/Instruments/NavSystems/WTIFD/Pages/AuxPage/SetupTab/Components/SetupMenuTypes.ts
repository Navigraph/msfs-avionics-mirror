import { MutableSubscribable, Subscribable, UserSetting } from '@microsoft/msfs-sdk';

import { DynamicListData } from '../../../../Components/List';
import { KeyboardInputType, VirtualKeyboardType } from '../../../../Keyboard/KeyboardTypes';

/** The possible rows in the setup menu. */
export type SetupMenuRowTypes = 'Alerts' | 'Charts' | 'Datablocks' | 'Display' | 'FMS' | 'Map' | 'Radio' | 'SVS' | 'Terrain' | 'Time' | 'Units' | 'User Profile'

/** The base data for a setup menu list item */
export interface SetupMenuListBaseRowData {
  /** The type of setup row. */
  readonly type: string;
  /** The label to use for this row */
  readonly label: string;
  /** Whether the row is enabled. Defaults to true */
  readonly isEnabled?: boolean | Subscribable<boolean>;
  /** Whether the item should be visible. Defaults to always visible. */
  readonly isVisible?: Subscribable<boolean>;
}

/** The data for a stateable menu row */
export interface SetupMenuStateRowData extends SetupMenuListBaseRowData {
  /** @inheritdoc */
  readonly type: 'state';
  /** The possible states for the row */
  readonly states: string[]
  /**
   * The current state index.
   * If this is a mutable subscribable then it will update when the state changes.
   * If this is not set then it will default to a mutable subscribable the first item.
   */
  readonly currentStateIndex?: MutableSubscribable<number> | Subscribable<number>;
  /** Callback when the new state is confirmed. */
  readonly onStateConfirmed?: (stateIndex: number, stateName: string) => void;
}

/** The data for a brightness menu row */
export interface SetupMenuBrightnessRowData extends SetupMenuListBaseRowData {
  /** @inheritdoc */
  readonly type: 'brightness';
  /** The possible states for the row */
  readonly states: string[]
  /**
   * The current state index.
   * If this is a mutable subscribable then it will update when the state changes.
   * If this is not set then it will default to a mutable subscribable the first item.
   */
  readonly currentStateIndex?: MutableSubscribable<number> | Subscribable<number>;
  /** Callback when the new state is confirmed. */
  readonly onStateConfirmed?: (stateIndex: number, stateName: string) => void;
  /** Callback when the CLR key is pressed while the field is selected but not in editing mode. */
  readonly onStateCleared?: () => void;
  /** The current manual brightness setting corresponding to the row */
  readonly currentManualBrightness: UserSetting<number>;
}

/** The data for a text entry setup row */
export interface SetupMenuTextEntryRowData extends SetupMenuListBaseRowData {
  /** @inheritdoc */
  readonly type: 'textEdit';
  /** The current value. Defaults to a subject with an empty string. */
  readonly value?: MutableSubscribable<any> | Subscribable<any>;
  /** Callback when the new value is confirmed. */
  readonly onValueConfirmed?: (value: any) => void;
  /** Callback when the CLR key is pressed while the field is selected but not in editing mode. */
  readonly onValueCleared?: () => void;
  /** Function to format the display value. */
  readonly format: (value: any) => string;
  /** Function to parse the input value. */
  readonly parse: (input: string) => any;

  /** Custom text color (when not selected) */
  readonly color?: string | Subscribable<string>;
  /** The unit to show after this value. */
  readonly prefixUnit?: string;
  /** The unit to show after this value. */
  readonly postfixUnit?: string | Subscribable<string>;
  /** Maximum length of the text */
  readonly maxLength?: number;

  /** The type of keyboard to display. Defaults to alphanumeric. */
  readonly keyboardType?: VirtualKeyboardType;
  /** Keyboard input type. Defaults to free text */
  readonly keyboardInputType?: KeyboardInputType;
  /** Whether to disable the keyboard mode switch (e.g. for numpad-only). Defaults to false */
  readonly keyboardDisableModeSwitch?: boolean;
  /** Whether to initially show numpad (true) or alpha keyboard (false). Defaults to the alpha keyboard. */
  readonly keyboardInitialShowNumpad?: boolean;
}

/** The base data for a collapsible row. */
export interface SetupMenuCollapsibleRowData extends SetupMenuListBaseRowData {
  /** The child items of this row */
  readonly items: SetupMenuRowListItems[];
  /** A function to run if the row is expanded or collapsed */
  onExpandedChanged?: (isExpanded: boolean) => void;
}

/** The data for a setup menu title row */
export interface SetupMenuTitleRowData extends SetupMenuCollapsibleRowData {
  /** @inheritdoc */
  readonly type: 'title';
}

/** The data for a menu row which displays a label and value. */
export interface SetupMenuValueRowData extends SetupMenuListBaseRowData {
  /** @inheritdoc */
  readonly type: 'value';
  /** The text value for this row. */
  readonly value: Subscribable<string>;
}

/** The data for a menu row which displays a label and value. */
export interface SetupMenuButtonRowData extends SetupMenuListBaseRowData {
  /** @inheritdoc */
  readonly type: 'button';
  /** Function to run if the button is clicked. */
  readonly onClick?: () => void;
}

/** The data for a checkbox row. */
export interface SetupMenuCheckboxRowData extends SetupMenuListBaseRowData {
  /** @inheritdoc */
  readonly type: 'checkbox';
  /** Whether the checkbox is checked. If the value is mutable, it will be set by the checkbox row. */
  readonly checked: Subscribable<boolean> | MutableSubscribable<boolean>;
  /**
   * Function that is called when this row is pressed.
   * isChecked will be true if the checkbox should be checked (ENTR/knob push), or false if not (CLR).
   */
  readonly onPressed?: (isChecked: boolean) => void;
}

/** The data for a collapsible menu title row */
export type SetupMenuRowListItems =
  SetupMenuTitleRowData | SetupMenuStateRowData | SetupMenuBrightnessRowData | SetupMenuTextEntryRowData | SetupMenuValueRowData | SetupMenuCheckboxRowData | SetupMenuButtonRowData

/** The data for a setup menu list item. */
export interface SetupMenuRowListItemData<Item extends SetupMenuRowListItems = SetupMenuRowListItems> extends DynamicListData {
  /** The item */
  item: Item;
  /** The collapse level. */
  collapseLevel: number;
}

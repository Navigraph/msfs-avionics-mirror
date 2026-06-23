import * as _microsoft_msfs_sdk from '@microsoft/msfs-sdk';
import { EventBus, FsInstrument, InstrumentBackplane, HEventPublisher, NavComSimVarPublisher, ElectricalPublisher, XPDRInstrument, AvionicsSystem, Subject, ComSpacing, DisplayComponent, ComponentProps, XPDRSimVarEvents, VNode, NodeReference, NavComEvents, Subscribable, MutableSubscribable, SubscribableSet, ToggleableClassNameRecord, SetSubject, MappedSubject, SubscribableType, Subscription } from '@microsoft/msfs-sdk';
import { AvionicsConfig, Epic2InputControlPublisher, NavComUserSettingManager, Tab, TouchButton, TouchButtonProps, Epic2KeyboardControlHEvents, Epic2KeyboardCharHEvents, DisplayUnitIndices, TabContentProps, TabContent, Epic2CockpitEvents, AdfSystemEvents, XpdrSystemEvents } from '@microsoft/msfs-epic2-shared';

/** Handles the TSC bezel buttons interface. */
declare class Epic2TscController {
    private readonly bus;
    private readonly isMFDSwapped;
    /**
     * Constructs a new TSC controller.
     * @param bus An instance of the EventBus.
     */
    constructor(bus: EventBus);
    /** Handler for when `MFD Swap` button is pressed. */
    private handleMFDSwapBezelButton;
}

/**
 * The Tsc instrument.
 */
declare class Epic2TscInstrument implements FsInstrument {
    readonly instrument: BaseInstrument;
    protected readonly config: AvionicsConfig;
    protected readonly bus: EventBus;
    protected readonly backplane: InstrumentBackplane;
    protected readonly hEventPublisher: HEventPublisher;
    protected readonly navComSimVarPublisher: NavComSimVarPublisher;
    protected readonly electricalPublisher: ElectricalPublisher;
    protected readonly xpdrInstrument: XPDRInstrument;
    protected readonly duControlPublisher: Epic2InputControlPublisher;
    protected readonly tscController: Epic2TscController;
    protected readonly systems: AvionicsSystem[];
    protected readonly navComUserSettingsManager: NavComUserSettingManager;
    private readonly tscService;
    /** @inheritdoc */
    constructor(instrument: BaseInstrument, config: AvionicsConfig);
    /**
     * Creates this instrument's avionics systems.
     */
    protected createSystems(): void;
    /** @inheritdoc */
    protected renderComponents(): void;
    /** @inheritdoc */
    Update(): void;
    /**
     * Updates this instrument's systems.
     */
    protected updateSystems(): void;
    /** @inheritdoc */
    onInteractionEvent(_args: string[]): void;
    /** @inheritdoc */
    onFlightStart(): void;
    /** @inheritdoc */
    onGameStateChanged(oldState: GameState, newState: GameState): void;
    /** @inheritdoc */
    onSoundEnd(soundEventId: Name_Z): void;
    /** Init instrument. */
    protected doInit(): void;
}

/** TSC Window Tabs, */
type TscWindowTabs = 'home' | 'duandccd' | 'com' | 'nav' | 'xpdr' | 'tawsPage';

/** Tsc Service */
declare class TscService {
    private readonly bus;
    private readonly navComUserSettingsManager;
    readonly tabIndexSubject: Subject<number>;
    readonly navScrollLabel: Subject<string>;
    readonly comScrollLabel: Subject<string>;
    private readonly menuTabs;
    /** @inheritdoc */
    constructor(bus: EventBus, navComUserSettingsManager: NavComUserSettingManager);
    /** Go Back to Home Page */
    goToHomePage(): void;
    /** Go to last viewed tab */
    goToLastViewedTab(): void;
    /**
     * Formats COM frequencies to strings.
     * @param root0 Inputs
     * @param root0."0" The frequency.
     * @param root0."1" The channel spacing.
     * @param root0."2" If it's powered
     * @returns A formatted string.
     */
    FrequencyFormatter([freq, spacing, powered]: readonly [number, ComSpacing, boolean]): string;
    readonly tabs: Readonly<Record<TscWindowTabs, Tab>>;
    lastViewedTab: Subject<Tab>;
    readonly activeTab: Subject<Tab>;
}

/** Props for dummy bottom row. */
interface BottomRowProps extends ComponentProps {
    /** The instrument event bus. */
    bus: EventBus;
    /** tab subject */
    tscService: TscService;
}
/** A bottom row. */
declare class BottomRow extends DisplayComponent<BottomRowProps> {
    private readonly Scroll1LabelRef;
    private readonly Scroll2LabelRef;
    private homeLabelRef;
    private duAndCcdLabelRef;
    private comLabelRef;
    private navLabelRef;
    private xpdrLabelRef;
    private homeLabel2Ref;
    private duAndCcdLabel2Ref;
    private comLabel2Ref;
    private navLabel2Ref;
    private xpdrLabel2Ref;
    private readonly eventName;
    private readonly showIcons;
    private readonly hideKnobIcons;
    protected readonly radioSub: _microsoft_msfs_sdk.EventSubscriber<XPDRSimVarEvents>;
    private readonly xpdrCode;
    /**
     * Toggle the Scroll Label.
     * @param n the tab index.
     */
    private toggleScrollLabelVisibility;
    private mapLabelToFreqName;
    private handleKnobEvents;
    /**
     * Sets a new transponder code.
     * @param increment Whether to make coarse or fine adjustments
     * @param sign Whether to increment or decrement the code.
     */
    private handleXpdrCodeChange;
    /** @inheritdoc */
    onAfterRender(): void;
    /** @inheritdoc */
    render(): VNode | null;
}

/** The tab props. */
interface TabProps extends ComponentProps {
    /** An instance of the event bus. */
    bus: EventBus;
    /** label */
    tabLabel: string;
    /** assigned label class */
    tabLabelClass: string;
    /** svg image */
    tabSvg?: string | VNode;
    /** assigned SVG class */
    tabSvgClass?: string;
}
/** The TSC tab menu section container. */
declare class MenuTab extends DisplayComponent<TabProps> {
    private readonly tabRootRef;
    private readonly tabLabelRef;
    /** @inheritdoc */
    onAfterRender(): void;
    /** @inheritdoc */
    render(): VNode | null;
}

/** The Divider Line props. */
interface DividerLineProps extends ComponentProps {
    /** Active Input Class passed in from parent */
    class: string;
}
/** The Divider Line Component. */
declare class DividerLine extends DisplayComponent<DividerLineProps> {
    /** @inheritdoc */
    render(): VNode | null;
}

/** The properties for the {@link DuAndCcdIcon} component. */
interface DuAndCcdIconProps extends ComponentProps {
    /** An instance of the event bus. */
    readonly bus: EventBus;
    /** The CSS style string applied to the <svg> tags. */
    readonly style?: string;
}
/** The DuAndCcdIcon component. */
declare class DuAndCcdIcon extends DisplayComponent<DuAndCcdIconProps> {
    private readonly subscriber;
    private readonly upperMfdRef;
    private readonly copilotPfdRef;
    private readonly lowerMfdRef;
    private readonly pilotPfdRef;
    private sub;
    /** @inheritdoc */
    onAfterRender(): void;
    /** @inheritdoc */
    destroy(): void;
    /** @inheritdoc */
    render(): VNode;
}

declare const TSC_ICONS: {
    checklist: string;
    com: string;
    dataLink: string;
    directTo: string;
    duAndCcd: string;
    home: string;
    inhibits: string;
    mfdFormat: string;
    nav: string;
    settings: string;
    showInfo: string;
    timers: string;
    wxLxTaws: string;
    xpdr: string;
};

/** Num Pad Button props. */
interface NumButtonProps {
    /** Button node ref */
    ref: NodeReference<HTMLElement>;
    /** Button value */
    value: string;
}
/** The TSC Number Pad props. */
interface NumberPadProps extends ComponentProps {
    /** Pad Buttons */
    numButtons: NumButtonProps[];
}
/** The TSC Content Tabs. */
declare class NumberPad extends DisplayComponent<NumberPadProps> {
    /** @inheritdoc */
    render(): VNode | null;
}

/** Common radio sub props. */
interface RadioSubProps extends ComponentProps {
    /** An EventBus. */
    bus: EventBus;
}
/** A base class for radio sub-window classes. */
declare abstract class RadioSub<P extends RadioSubProps = RadioSubProps> extends DisplayComponent<P> {
    readonly radioSub: _microsoft_msfs_sdk.EventSubscriber<NavComEvents & XPDRSimVarEvents>;
    /**
     * Formats COM frequencies to strings.
     * @param root0 Inputs
     * @param root0."0" The frequency.
     * @param root0."1" The channel spacing.
     * @returns A formatted string.
     */
    static FrequencyFormatter([freq, spacing]: readonly [number, ComSpacing]): string;
    /**
     * Appends a number to another number.
     * @param originalNumber The number to append to.
     * @param numberToAppend The number to append.
     * @returns The result of appending the second number to the first.
     */
    static appendNumber(originalNumber: number, numberToAppend: number): number;
}

/** TSC Button styles. */
interface TscButtonStyles {
    [key: string]: string | undefined;
    /** The button height. */
    height?: string | undefined;
    /** The button width. */
    width?: string | undefined;
    /** The button font size. */
    fontSize?: string | undefined;
    /** The button text's line height. */
    lineHeight?: string | undefined;
    /** The button background color. */
    backgroundColor?: string | undefined;
    /** The button color. */
    color?: string | undefined;
    /** The button border. */
    border?: string | undefined;
    /** The button margin. */
    margin?: string | undefined;
}
/** TSC Button props. */
interface TscButtonProps extends TouchButtonProps {
    /** Button node ref */
    ref?: NodeReference<HTMLElement>;
    /** The button label. */
    label: string | Subject<string> | VNode;
    /** The button styles. */
    styles?: TscButtonStyles;
    /** A callback function which will be called every time a mouse down event happens. */
    onMouseDown?: () => void;
    /** A callback function which will be called every time a mouse up event happens. */
    onMouseUp?: () => void;
    /** Within the scope of this keyboard, Whether the mouse is currently pressed down.*/
    mouseIsDown?: Subscribable<boolean>;
    /** Whether the popup of this key will be displayed. */
    showPopup?: MutableSubscribable<boolean>;
}
/** The TSC Button. */
declare class TscButton extends TouchButton<TscButtonProps> {
    /** @inheritdoc */
    private setStyles;
    /** @inheritdoc */
    onBeforeRender(): void;
    /** @inheritdoc */
    protected onMouseDown(e: MouseEvent): void;
    /** @inheritdoc */
    protected onMouseUp(): void;
    /** @inheritdoc */
    protected onMouseEnter(): void;
    /** @inheritdoc */
    protected onMouseLeave(e: MouseEvent): void;
}

/** Nav Button Config props. */
interface NavButtonConfigProps {
    /** Active toogle boolean */
    isActive: Subject<boolean>;
    /** Button node ref */
    ref: NodeReference<HTMLElement>;
    /** Button styles */
    btnClass: string;
    /** Button text styles */
    textClass: string;
    /** Button circle styles */
    circleClass: string;
    /** Button text */
    text: string;
}
/** TSC Icon Button props. */
interface TscIconButtonProps extends ComponentProps {
    /** Button attributes */
    config: NavButtonConfigProps;
}
/** The TSC Icon Button. */
declare class TscIconButton extends DisplayComponent<TscIconButtonProps> {
    /** @inheritdoc */
    render(): VNode | null;
}

/**
 * A type of character selection mode for a {@link CursorInputSlot}.
 */
type CursorInputCharSelectionMode = 'none' | 'blink' | 'highlight';
/** A slot for a scrolling cursor input. */
interface CursorInputSlot<T> {
    /** Flags this object as a CursorInputSlot. */
    readonly isCursorInputSlot: true;
    /** Whether this slot supports backfill operations. */
    readonly allowBackfill: boolean;
    /** The number of characters contained in this slot. */
    readonly characterCount: number;
    /** The value of this slot's characters, in order. */
    readonly characters: Subscribable<readonly (string | null)[]>;
    /** The current value of this slot. */
    readonly value: Subscribable<T>;
    /**
     * Sets the value of this slot. The value of this slot after the operation is complete may be different from the
     * requested value, depending on whether this slot can accurately represent the requested value.
     * @param value The new value.
     * @returns The value of this slot after the operation is complete.
     */
    setValue(value: T): T;
    /**
     * Increments this slot's value.
     * @returns Whether the operation was accepted.
     */
    incrementValue(): boolean;
    /**
     * Decrements this slot's value.
     * @returns Whether the operation was accepted.
     */
    decrementValue(): boolean;
    /**
     * Sets the value of one of this slot's characters.
     * @param index The index of the character to set.
     * @param char The value to set.
     * @param force Whether to force the character to accept a value that would normally be invalid. Defaults to `false`.
     * @returns Whether the operation was accepted.
     * @throws RangeError if `index` is out of bounds.
     */
    setChar(index: number, char: string | null, force?: boolean): boolean;
    /**
     * Checks if one of this slot's characters can accept a value.
     * @param index The index of the character to query.
     * @param char The value to query.
     * @param force Whether the character should be forced to accept a value that would normally be invalid. Defaults to
     * `false`.
     * @returns Whether the character can accept the specified value.
     * @throws RangeError if `index` is out of bounds.
     */
    canSetChar(index: number, char: string | null, force?: boolean): boolean;
    /**
     * Sets the selection mode for one of this slot's characters.
     * @param index The index of the character for which to set a selection mode.
     * @param mode A character selection mode.
     * @throws RangeError if `index` is out of bounds.
     */
    setCharSelected(index: number, mode: CursorInputCharSelectionMode): void;
    /**
     * Populates all of this slot's characters with non-empty values, if possible, using this slot's current value as a
     * template.
     */
    populateCharsFromValue(): void;
    /**
     * Gets the x coordinate, in pixels, of the left edge of this slot's border box, relative to its nearest positioned
     * ancestor.
     * @returns The x coordinate, in pixels, of the left edge of this slot's border box, relative to its nearest
     * positioned ancestor.
     */
    getLeft(): number;
    /**
     * Gets the x coordinate, in pixels, of the right edge of this slot's border box, relative to its nearest positioned
     * ancestor.
     * @returns The x coordinate, in pixels, of the right edge of this slot's border box, relative to its nearest
     * positioned ancestor.
     */
    getRight(): number;
    /**
     * Gets the width, in pixels, of this slot's border box.
     * @returns The width, in pixels, of this slot's border box.
     */
    getWidth(): number;
    /**
     * Gets the y coordinate, in pixels, of the top edge of this slot's border box, relative to its nearest positioned
     * ancestor.
     * @returns The y coordinate, in pixels, of the top edge of this slot's border box, relative to its nearest
     * positioned ancestor.
     */
    getTop(): number;
    /**
     * Gets the y coordinate, in pixels, of the bottom edge of this slot's border box, relative to its nearest positioned
     * ancestor.
     * @returns The y coordinate, in pixels, of the bottom edge of this slot's border box, relative to its nearest
     * positioned ancestor.
     */
    getBottom(): number;
    /**
     * Gets the height, in pixels, of this slot's border box.
     * @returns The height, in pixels, of this slot's border box.
     */
    getHeight(): number;
    /**
     * Gets the x coordinate, in pixels, of the left edge of the border box of one of this slot's characters, relative
     * to this slot's nearest positioned ancestor.
     * @param index The index of the character to query.
     * @returns The x coordinate, in pixels, of the left edge of the border box of one of the specified character,
     * relative to this slot's nearest positioned ancestor.
     * @throws RangeError if `index` is out of bounds.
     */
    getCharLeft(index: number): number;
    /**
     * Gets the x coordinate, in pixels, of the right edge of the border box of one of this slot's characters, relative
     * to this slot's nearest positioned ancestor.
     * @param index The index of the character to query.
     * @returns The x coordinate, in pixels, of the right edge of the border box of one of the specified character,
     * relative to this slot's nearest positioned ancestor.
     * @throws RangeError if `index` is out of bounds.
     */
    getCharRight(index: number): number;
    /**
     * Gets the width, in pixels, of one of this slot's characters.
     * @param index The index of the character to query.
     * @returns The width, in pixels, of one of the specified character.
     * @throws RangeError if `index` is out of bounds.
     */
    getCharWidth(index: number): number;
}
/**
 * Component props for GenericCursorInputSlot.
 */
interface GenericCursorInputSlotProps<T> extends ComponentProps {
    /** Whether the slot supports backfill operations. */
    allowBackfill: boolean | Subscribable<boolean>;
    /** The number of characters contained in the slot. */
    characterCount: number;
    /**
     * A function which parses a slot value from individual character values.
     * @param characters An array of character values. The order of the values is the same as the order of the characters
     * in the slot (from left to right).
     * @returns The slot value parsed from the specified character values.
     */
    parseValue: (characters: readonly (string | null)[]) => T;
    /**
     * A function which assigns values to individual characters from a slot value.
     * @param value A slot value.
     * @param setCharacters An array of functions which set the values of the slot's character values. The order of
     * the functions is the same as order of their associated characters in the slot (from left to right).
     * @param characters An array containing the slot's current character values. The order of the values is the same as
     * the order of the characters in the slot (from left to right).
     */
    digitizeValue: (value: T, setCharacters: readonly ((char: string | null) => void)[], characters: readonly (string | null)[]) => void;
    /**
     * A function which checks if two slot values are equal. If not defined, equality is checked using the strict
     * equality operator (`===`).
     */
    valueEquals?: (a: T, b: T) => boolean;
    /**
     * A function which renders a character value into a string.
     * @param charToRender The character to render.
     * @param index The index of the character to render.
     * @param characters An array of the slot's character values.
     */
    renderChar: (charToRender: string | null, index: number, characters: readonly (string | null)[]) => string;
    /**
     * A function which increments the slot value.
     * @param value The slot's current value.
     * @param setValue A function which sets the slot's value.
     * @param characters An array containing the slot's current character values. The order of the values is the same as
     * the order of the characters in the slot (from left to right).
     * @param setCharacters An array of functions which set the values of the slot's character values. The order of
     * the functions is the same as order of their associated characters in the slot (from left to right).
     * @returns Whether the operation was accepted.
     */
    incrementValue: (value: T, setValue: (value: T) => void, characters: readonly (string | null)[], setCharacters: readonly ((char: string | null) => void)[]) => boolean;
    /**
     * A function which decrements the slot value.
     * @param value The slot's current value.
     * @param setValue A function which sets the slot's value.
     * @param characters An array containing the slot's current character values. The order of the values is the same as
     * the order of the characters in the slot (from left to right).
     * @param setCharacters An array of functions which set the values of the slot's character values. The order of
     * the functions is the same as order of their associated characters in the slot (from left to right).
     * @returns Whether the operation was accepted.
     */
    decrementValue: (value: T, setValue: (value: T) => void, characters: readonly (string | null)[], setCharacters: readonly ((char: string | null) => void)[]) => boolean;
    /**
     * A function which sets the value of a slot character, and returns whether the operation was accepted.
     */
    setChar: (characters: readonly MutableSubscribable<string | null>[], index: number, charToSet: string | null, force: boolean) => boolean;
    /**
     * A function which checks if a slot character can accept a value.
     */
    canSetChar: (characters: readonly (string | null)[], index: number, charToSet: string | null, force: boolean) => boolean;
    /** CSS class(es) to apply to the component's root element. */
    class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
}
/**
 * A generic implementation of {@link CursorInputSlot} whose behavior is largely defined though props.
 */
declare class GenericCursorInputSlot<T, P extends GenericCursorInputSlotProps<T> = GenericCursorInputSlotProps<T>> extends DisplayComponent<P> implements CursorInputSlot<T> {
    private static readonly RESERVED_CSS_CLASSES;
    /** @inheritdoc */
    readonly isCursorInputSlot = true;
    /** @inheritdoc */
    get allowBackfill(): boolean;
    /** @inheritdoc */
    readonly characterCount: number;
    protected readonly rootRef: _microsoft_msfs_sdk.NodeReference<HTMLDivElement>;
    protected readonly characterRefs: _microsoft_msfs_sdk.NodeReference<HTMLDivElement>[];
    protected readonly characterCssClasses: SetSubject<string>[];
    protected readonly characterArray: Subject<string | null>[];
    protected readonly characterSetFuncs: ((value: string | null) => void)[];
    protected readonly _characters: MappedSubject<(string | null)[], readonly (string | null)[]>;
    /** @inheritdoc */
    readonly characters: Subscribable<readonly (string | null)[]>;
    protected readonly charactersText: _microsoft_msfs_sdk.MappedSubscribable<string>[];
    protected readonly isEmpty: _microsoft_msfs_sdk.MappedSubscribable<boolean>[];
    protected readonly selectionMode: Subject<CursorInputCharSelectionMode>[];
    protected readonly valueEqualsFunc: (a: T, b: T) => boolean;
    protected readonly _value: _microsoft_msfs_sdk.MappedSubscribable<T>;
    /** @inheritdoc */
    readonly value: Subscribable<T>;
    protected readonly setValueFunc: (value: T) => T;
    private cssClassSub?;
    /** @inheritdoc */
    onAfterRender(): void;
    /** @inheritdoc */
    setValue(value: T): T;
    /** @inheritdoc */
    incrementValue(): boolean;
    /** @inheritdoc */
    decrementValue(): boolean;
    /** @inheritdoc */
    setChar(index: number, char: string | null, force?: boolean): boolean;
    /** @inheritdoc */
    canSetChar(index: number, char: string | null, force?: boolean): boolean;
    /** @inheritdoc */
    setCharSelected(index: number, mode: CursorInputCharSelectionMode): void;
    /** @inheritdoc */
    populateCharsFromValue(): void;
    /** @inheritdoc */
    getLeft(): number;
    /** @inheritdoc */
    getRight(): number;
    /** @inheritdoc */
    getWidth(): number;
    /** @inheritdoc */
    getTop(): number;
    /** @inheritdoc */
    getBottom(): number;
    /** @inheritdoc */
    getHeight(): number;
    /** @inheritdoc */
    getCharLeft(index: number): number;
    /** @inheritdoc */
    getCharRight(index: number): number;
    /** @inheritdoc */
    getCharWidth(index: number): number;
    /**
     * Recomputes this slot's value from its characters and re-renders all characters.
     */
    refreshFromChars(): void;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

/**
 * Component props for CursorInput.
 */
interface CursorInputProps<M extends MutableSubscribable<any>> extends ComponentProps {
    /**
     * A mutable subscribable to bind to the input's composite value. The binding is one-way: changes in the input value
     * will be piped to the subscribable, but changes in the subscribable's value will not trigger any changes to the
     * input.
     */
    value: M;
    /**
     * A function which parses the input's individual slot values to generate a composite value.
     * @param slotValues An array of the bound values of the input's individual slots. The order of the values is the
     * same as the order of the slots in the input (from left to right).
     * @returns The composite value parsed from the specified slot values.
     */
    parseValue: (slotValues: readonly any[]) => SubscribableType<M>;
    /**
     * A function which assigns values to the input's individual slots based on a composite value.
     * @param value A composite value.
     * @param setSlotValues An array of functions which set the values of the input's individual slots. The order of the
     * functions is the same as the order of the their associated slots in the input (from left to right).
     * @param slotValues An array containing the current values of the input's individual slots. The order of the values
     * is the same as the order of the slots in the input (from left to right).
     */
    digitizeValue: (value: SubscribableType<M>, setSlotValues: readonly ((slotValue: any) => void)[], slotValues: readonly any[]) => void;
    /**
     * A function which checks if two composite values are equal.
     */
    valueEquals?: (a: SubscribableType<M>, b: SubscribableType<M>) => boolean;
    /**
     * Whether to allow backfill of character positions. If `true`, when directly inserting values into the last
     * character position, any existing values will be shifted to the left as long as there are empty positions to
     * accommodate them.
     */
    allowBackFill: boolean;
    /**
     * Checks whether the designated character slot into which characters will shift during a backfill operation can
     * accept shifted characters. Ignored if `allowBackFill` is `false`. If not defined, the designated character slot
     * will accept shifted characters if and only if its current character value is `null`.
     * @param char The current character in the designated character slot.
     * @param slot The designated character slot's parent input slot.
     * @returns Whether the designated character slot into which characters will shift during a backfill operation can
     * accept shifted characters.
     */
    canShiftForBackfill?: (char: string | null, slot: CursorInputSlot<any>) => boolean;
    /**
     * The character index to initially select with the cursor when editing is activated. If not defined, the initial
     * index will default to the last index if backfill is allowed and cursor selection is in per-character mode, or
     * the first index (`0`) otherwise.
     */
    initialEditIndex?: number | Subscribable<number>;
    /**
     * A function or {@link VNode} which renders the input's value when editing is not active. If defined, the rendered
     * inactive value replaces all rendered child components when editing is not active.
     */
    renderInactiveValue?: VNode | ((value: SubscribableType<M>) => string | VNode);
    /** CSS class(es) to apply to the component's root element. */
    class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
}
/**
 * An input display with a scrolling cursor.
 *
 * Each input has zero or more child slots of type {@link CursorInputSlot} (though to be practically useful, at least
 * one slot is required). When editing is active, the input's cursor selects either one slot or one character (a slot
 * may have more than one character) at a time. The input supports incrementing or decrementing the value of a
 * selected slot, or directly setting/deleting the value of a selected character.
 *
 * Each input is bound to a composite value. This value is computed from the values of the input's individual slots,
 * and vice versa, so that changes in either will be reflected in the other.
 */
declare class CursorInput<M extends MutableSubscribable<any>> extends DisplayComponent<CursorInputProps<M>> {
    private static readonly RESERVED_CLASSES;
    private readonly slotsContainerRef;
    private readonly cursorRef;
    private readonly inactiveRef;
    private readonly activeStyle;
    private readonly inactiveStyle;
    private readonly cursorStyle;
    private readonly rootCssClass;
    private readonly initialEditIndex;
    private slotsRootNode?;
    private readonly charPositions;
    private readonly slots;
    private readonly slotValueArray;
    private slotValueSetFuncs?;
    private readonly valueEqualsFunc;
    private slotsState?;
    private value?;
    private readonly canShiftForBackfillFunc;
    private readonly renderInactiveValueFunc;
    private renderedInactiveValue;
    /** -1 When it should highlight the whole input. */
    private readonly _cursorPosition;
    /** The index of the character position currently selected by this input's cursor. */
    readonly cursorPosition: Subscribable<number>;
    private readonly _isEditingActive;
    /** Whether editing is active for this input. */
    readonly isEditingActive: Subscribable<boolean>;
    private readonly _isSelectionPerSlot;
    /** Whether this input's cursor selection mode is per-slot. */
    readonly isSelectionPerSlot: Subscribable<boolean>;
    private readonly selectedCharIndexes;
    private readonly cursorUpdateTimer;
    private isInit;
    private cssClassSub?;
    private valuePipeOut?;
    private inactiveValueSub?;
    /** @inheritDoc */
    onAfterRender(): void;
    /**
     * Checks whether this input is initialized.
     * @returns Whether this input is initialized.
     */
    isInitialized(): boolean;
    /**
     * Sets the composite value of this input. As part of the operation, all of this input's child slots will have their
     * values set according to this input's value digitizer, and all slot characters will be set to non-null
     * representations of their slot's value, if possible. The composite value of this input after the operation is
     * complete may differ from the requested value depending on whether the requested value can be accurately
     * represented by this input.
     * @param value The new composite value.
     * @returns The composite value of this input after the operation is complete.
     * @throws Error if this input is not initialized.
     */
    setValue(value: SubscribableType<M>): SubscribableType<M>;
    /**
     * Updates this input's rendered editing-inactive value. If editing is currently active, the rendered editing-
     * inactive value will be hidden. If editing is not active, it will be displayed and updated to reflect this input's
     * current value.
     */
    private updateInactiveDisplay;
    /**
     * Cleans up this input's rendered editing-inactive value, destroying any top-level DisplayComponents that are part
     * of the rendered value's VNode tree.
     */
    private cleanUpRenderedInactiveValue;
    /**
     * Activates editing for this input.
     * @param isSelectionPerSlot Whether cursor selection should be initialized to per-slot mode. If `false`, cursor
     * selection will be initialized to per-character mode instead.
     * @param charToSet The value to set at the cursor's selected character position as the initial edit. If defined
     * and the character position cannot accept the value, editing will not be activated. Ignored if `isSelectionPerSlot`
     * is `true`.
     * @returns Whether editing is active.
     * @throws Error if this input is not initialized.
     */
    activateEditing(isSelectionPerSlot: boolean, charToSet?: string | null): boolean;
    /**
     * Deactivates editing for this input.
     * @throws Error if this input is not initialized.
     */
    deactivateEditing(): void;
    /**
     * Moves the cursor.
     * @param direction The direction in which to move (`1` = to the right, `-1` = to the left).
     * @param forceSelectionPerSlot Whether to force cursor selection to per slot mode.
     * @throws Error if this input is not initialized.
     */
    moveCursor(direction: 1 | -1, forceSelectionPerSlot: boolean): void;
    /**
     * Moves the cursor right, if possible.
     * @param forceSelectionPerSlot Whether to force cursor selection to per slot mode.
     */
    private moveCursorRight;
    /**
     * Moves the cursor left, if possible.
     * @param forceSelectionPerSlot Whether to force cursor selection to per slot mode.
     */
    private moveCursorLeft;
    /**
     * Places the cursor at a specific character position.
     * @param index The index of the character position at which to place the cursor.
     * @param forceSelectionPerSlot Whether to force cursor selection to per slot mode.
     * @throws Error if this input is not initialized.
     * @throws RangeError if `index` does not point to a valid character position.
     */
    placeCursor(index: number, forceSelectionPerSlot: boolean): void;
    /**
     * Increments or decrements the value of the slot currently selected by the cursor. If editing is not active, it
     * will be activated instead of changing any slot value. If cursor selection is in per-character mode, it will be
     * forced to per-slot mode. If the cursor is past the last slot, this method does nothing.
     * @param direction The direction in which to change the slot value (`1` = increment, `-1` = decrement).
     * @returns Whether the value of the slot was changed.
     * @throws Error if this input is not initialized.
     */
    changeSlotValue(direction: 1 | -1): boolean;
    /**
     * Sets the value of the slot character currently selected by the cursor. If editing is not active, it will be
     * activated before setting the value (unless the selected character cannot accept the value, in which case the
     * operation will be aborted). If cursor selection is in per-slot mode, it will be forced to per-character mode,
     * and the first character of the slot will be selected before setting the value. If the cursor is past the last
     * slot, this method does nothing.
     * @param value The value to set.
     * @returns Whether the operation was accepted.
     * @throws Error if this input is not initialized.
     */
    setSlotCharacterValue(value: string): boolean;
    /**
     * Inserts a value into a character position and starts a backfill operation. Any existing character values are
     * shifted one position to the left as long as there is room.
     * @param charPosIndex The character position at which to insert the value.
     * @param valueToInsert The value to insert.
     * @returns Whether after the current operation is complete, a backfill operation will still be possible when
     * inserting a value into the same character position.
     */
    private backfillValues;
    /**
     * Removes the character at the cursor's current position. If backfill is allowed, this will also shift all non-empty
     * characters to the left of the cursor's current position one position to the right. If backfill is not allowed,
     * this will shift the cursor one position to the left after the character is removed.
     * @param selectionPerSlot The selection per slot state to apply before carrying out the backspace operation. If not
     * defined, the selection per slot state will remain unchanged from its current value.
     * @throws Error if this input is not initialized.
     */
    backspace(selectionPerSlot?: boolean): void;
    /**
     * Finds the index of the left-most character position that is connected to a given character position (including
     * itself) by an unbroken chain of positions supporting backfill.
     * @param fromCharPosIndex The index of the query character position.
     * @returns The index of the left-most character position that is connected to a given character position (including
     * itself) by an unbroken chain of positions supporting backfill.
     */
    private findLeftMostBackfillCharPosIndex;
    /**
     * Populates all of this input's character positions with non-empty values, if possible, using this input's value
     * digitizer function and the current composite value as a template.
     */
    populateCharsFromValue(): void;
    /**
     * Refreshes this input, updating the size and position of the cursor.
     */
    refresh(): void;
    /**
     * Moves the cursor to the correct position.
     */
    private updateCursorPosition;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

/**
 * Component props for CharInput.
 */
interface CharInputProps extends ComponentProps {
    /**
     * A mutable subscribable to bind to the input's composite value. The binding is one-way: changes in the input value
     * will be piped to the subscribable, but changes in the subscribable's value will not trigger any changes to the
     * input.
     */
    value: MutableSubscribable<string>;
    /** The character index to initially select with the cursor when editing is activated. Defaults to `0`. */
    initialEditIndex?: number;
    /**
     * A function or {@link VNode} which renders the input's value when editing is not active. If defined, the rendered
     * inactive value replaces all rendered child components when editing is not active.
     */
    renderInactiveValue?: VNode | ((value: string) => string | VNode);
    /** CSS class(es) to apply to the root of the component. */
    class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
    /**
     * Whether to allow backfill of character positions. If `true`, when directly inserting values into the last
     * character position, any existing values will be shifted to the left as long as there are empty positions to
     * accommodate them.
     */
    allowBackFill?: boolean;
    /**
     * Checks whether the designated character slot into which characters will shift during a backfill operation can
     * accept shifted characters. Ignored if `allowBackFill` is `false`. If not defined, the designated character slot
     * will accept shifted characters if and only if its current character value is `null`.
     * @param char The current character in the designated character slot.
     * @param slot The designated character slot's parent input slot.
     * @returns Whether the designated character slot into which characters will shift during a backfill operation can
     * accept shifted characters.
     */
    canShiftForBackfill?: (char: string | null, slot: CursorInputSlot<any>) => boolean;
}
/**
 * An input with a scrolling cursor that allows users to select an arbitrary string. The composite value bound to the
 * input is derived from the in-order concatenation of the values of all child `CharInputSlot` components.
 */
declare class CharInput extends DisplayComponent<CharInputProps> {
    private static readonly LAST_NON_EMPTY_SLOT_INDEX;
    private readonly inputRef;
    private readonly value;
    private readonly slots;
    /** The index of the character position currently selected by this input's cursor. */
    get cursorPosition(): Subscribable<number>;
    /** Whether editing is active for this input. */
    get isEditingActive(): Subscribable<boolean>;
    /** Whether this input's cursor selection mode is per-slot. */
    get isSelectionPerSlot(): Subscribable<boolean>;
    private isInit;
    private valuePipeOut?;
    /** @inheritdoc */
    onAfterRender(thisNode: VNode): void;
    /**
     * Updates whether each of this input's slots should allow empty values.
     * @param lastNonEmptySlotIndex The index of the last slot with a non-empty value.
     */
    private updateAllowEmptySlotValues;
    /**
     * Checks whether this input is initialized.
     * @returns Whether this input is initialized.
     */
    isInitialized(): boolean;
    /**
     * Sets the composite value of this input. As part of the operation, all of this input's child slots will have their
     * values set according to this input's value digitizer, and all slot characters will be set to non-null
     * representations of their slot's value, if possible. The composite value of this input after the operation is
     * complete may differ from the requested value depending on whether the requested value can be accurately
     * represented by this input.
     * @param value The new composite value.
     * @returns The composite value of this input after the operation is complete.
     * @throws Error if this input is not initialized.
     */
    setValue(value: string): string;
    /**
     * Activates editing for this input.
     * @param isSelectionPerSlot Whether cursor selection should be initialized to per-slot mode. If `false`, cursor
     * selection will be initialized to per-character mode instead.
     * @throws Error if this input is not initialized.
     */
    activateEditing(isSelectionPerSlot: boolean): void;
    /**
     * Deactivates editing for this input.
     * @throws Error if this input is not initialized.
     */
    deactivateEditing(): void;
    /**
     * Moves the cursor.
     * @param direction The direction in which to move (`1` = to the right, `-1` = to the left).
     * @param forceSelectionPerSlot Whether to force cursor selection to per slot mode.
     * @throws Error if this input is not initialized.
     */
    moveCursor(direction: 1 | -1, forceSelectionPerSlot: boolean): void;
    /**
     * Places the cursor at a specific character position.
     * @param index The index of the character position at which to place the cursor.
     * @param forceSelectionPerSlot Whether to force cursor selection to per slot mode.
     * @throws Error if this input is not initialized.
     * @throws RangeError if `index` does not point to a valid character position.
     */
    placeCursor(index: number, forceSelectionPerSlot: boolean): void;
    /**
     * Increments or decrements the value of the slot currently selected by the cursor. If editing is not active, then it
     * will be activated instead of changing any slot value. If cursor selection is in per-character mode, it will be
     * forced to per-slot mode. If the cursor is past the last slot, then this method does nothing.
     * @param direction The direction in which to change the slot value (`1` = increment, `-1` = decrement).
     * @param eraseCharsToRightOnEdit Whether to erase (set to `null`) all characters to the right of the edited
     * character. Defaults to `false`.
     * @throws Error if this input is not initialized.
     */
    changeSlotValue(direction: 1 | -1, eraseCharsToRightOnEdit?: boolean): void;
    /**
     * Sets the value of the slot character currently selected by the cursor. If editing is not active, then it will be
     * activated before setting the value. If the cursor is past the last slot, then this method does nothing.
     * @param value The value to set.
     * @param eraseCharsToRightOnEdit Whether to erase (set to `null`) all characters to the right of the edited
     * character. Defaults to `false`.
     * @throws Error if this input is not initialized.
     */
    setSlotCharacterValue(value: string, eraseCharsToRightOnEdit?: boolean): void;
    /**
     * Removes the character at the cursor's current position and shifts the cursor one position to the left after the
     * character is removed.
     * @throws Error if this input is not initialized.
     */
    backspace(): void;
    /**
     * Populates all of this input's character positions with non-empty values, if possible, using this input's value
     * digitizer function and the current composite value as a template.
     */
    populateCharsFromValue(): void;
    /**
     * Refreshes this input, updating the size and position of the cursor.
     */
    refresh(): void;
    /**
     * Parses a composite value from this input's individual slots.
     * @returns The composite value represented by this input's individual slots.
     */
    private parseValue;
    /**
     * Digitizes a composite value into individual slot values to assign to this input's slots.
     * @param value The value to digitize.
     */
    private digitizeValue;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

/**
 * Component props for CharInputSlot.
 */
interface CharInputSlotProps extends ComponentProps {
    /**
     * An array of valid character values for the slot. The order of characters in the array determines the order in
     * which the slot will cycle through characters when incrementing/decrementing its value.
     */
    charArray: readonly string[];
    /**
     * Whether the slot should wrap from the last valid character to the first valid character and vice-versa when
     * incrementing/decrementing its value.
     */
    wrap: boolean | Subscribable<boolean>;
    /** The default character value for the slot when the character value is `null`. */
    defaultCharValue: string | Subscribable<string>;
    /**
     * A function which renders slot characters into string. If not defined, non-null characters will be rendered as-is,
     * and null characters will be rendered according to the default value assigned to that character.
     */
    renderChar?: (character: string | null, index: number) => string;
    /** CSS class(es) to apply to the slot's root element. */
    class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
}
/**
 * A cursor input slot which allows the user to select a single arbitrary character.
 */
declare class CharInputSlot extends DisplayComponent<CharInputSlotProps> {
    private static readonly RESERVED_CSS_CLASSES;
    private readonly slotRef;
    private readonly defaultCharValue;
    private readonly parseValue;
    private readonly digitizeValue;
    private readonly renderChar;
    private readonly wrap;
    /** The value bound to this slot. */
    get value(): Subscribable<string>;
    private allowEmptyValue;
    private readonly subscriptions;
    /** @inheritdoc */
    onAfterRender(): void;
    /**
     * Sets whether this slot should allow its value to be set to the empty string. Disallowing empty string values will
     * not cause this slot's current value to change, even if the current value is the empty string.
     * @param allow Whether this slot should allow its value to be set to the empty string.
     */
    setAllowEmptyValue(allow: boolean): void;
    /**
     * Sets the value of this slot. As part of the operation, this slot's character will be set to a non-null
     * representation of the new value, if possible. The value of this slot after the operation is complete may differ
     * from the requested value depending on whether the requested value can be accurately represented by this slot.
     * @param value The new value.
     * @returns The value of this slot after the operation is complete.
     */
    setValue(value: string): string;
    /**
     * Increments this slot's value.
     * @returns Whether the increment operation was accepted.
     */
    incrementValue(): boolean;
    /**
     * Decrements this slot's value.
     * @returns Whether the decrement operation was accepted.
     */
    decrementValue(): boolean;
    /**
     * Sets the value of this slot's character.
     * @param char The value to set.
     * @param force Whether to force the character to accept a value that would normally be invalid. Defaults to `false`.
     * @returns Whether the operation was accepted.
     */
    setChar(char: string | null, force?: boolean): boolean;
    /**
     * Changes this slot's value in a specified direction.
     * @param direction The direction in which to change the value.
     * @param value This slot's current value.
     * @param setValue A function which sets this slot's value.
     * @returns Whether the value was successfully changed.
     */
    private changeValue;
    /**
     * Sets the value of one of this slot's characters.
     * @param characters An array of characters.
     * @param index The index of the character to set.
     * @param charToSet The value to set.
     * @param force Whether to force the character to accept a value that would normally be invalid. Defaults to `false`.
     * @returns Whether the operation was accepted.
     */
    private _setChar;
    /**
     * Checks whether one of this slot's characters can be set to a given value.
     * @param index The index of the character to set.
     * @param character The value to set.
     * @param force Whether the character should accept a value that would normally be invalid.
     * @returns Whether the specified character can be set to the specified value.
     */
    private canSetChar;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

/** The possible TSC keyboard key display values.*/
type KeyValues = 'ENTER/NEXT' | 'SPACE' | 'DELETE' | 'CLEAR' | '.' | '/' | '+/-' | 'LEFT_ARROW' | 'RIGHT_ARROW' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
/** Object index signature for keyPressToKeyEventMap */
type KeyValueMapType = {
    [k in KeyValues]: Epic2KeyboardControlHEvents | Epic2KeyboardCharHEvents;
};
/** Controls:
 * - How the TSC keyboard sends input to `InputField`s by emitting HEvents on each key press.
 * - How the TSC keyboard scrathpad receives its value from `InputField`s values by listening to a topic.
 */
declare class KeyboardController {
    private readonly bus;
    private readonly keyboard;
    private readonly publisher;
    private readonly subscriber;
    private readonly keyPressToKeyEventMap;
    /**
     * The constructor of `KeyboardController`.
     * @param bus An instance of the EventBus.
     * @param keyboard An instance of the TSC Keyboard.
     */
    constructor(bus: EventBus, keyboard: Keyboard);
    /**
     * Populates the slot entries with a string.
     * @param input The input string.
     */
    private populateSlotEntries;
    /**
     * Sets the TSC keyboard cursor position to `InputBox` cursor.
     * @param pos The cursor position in the `InputBox`.
     */
    private mirrorInputBoxCursor;
    /**
     * Callback on key press that publishes an HEvent.
     * @param key The value of the key pressed.
     */
    onKeyPress(key: KeyValues): void;
    /** Callback on closing the keyboard. */
    onClose(): void;
}

/** An entry for a single character input slot. */
type CharInputSlotEntry = {
    /** A reference to the input slot. */
    ref: NodeReference<CharInputSlot>;
    /** The input slot's default character value. */
    defaultCharValue: Subject<string>;
};
/** Component props for Keyboard. */
interface KeyboardProps extends ComponentProps {
    /** The instrument event bus. */
    bus: EventBus;
    /** CSS class(es) to apply to the number pad's root element. */
    class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
    /** The TSC Service */
    tscService: TscService;
}
/**
 * A keyboard with buttons for all alphanumeric characters and the space character, a Clear button,
 * an Enter/Next button, a Delete button, and 2 Left/Right arrow buttons.
 */
declare class Keyboard extends DisplayComponent<KeyboardProps> {
    private static readonly RESERVED_CSS_CLASSES;
    private static readonly CHAR_ARRAY;
    private thisNode?;
    private readonly controller;
    private readonly rootRef;
    private readonly closeButtonRef;
    private readonly rootCssClass;
    private readonly subscriber;
    private readonly showNumpad;
    private readonly mouseIsDown;
    private cssClassSub?;
    readonly inputText: Subject<string>;
    readonly inputSlotEntries: CharInputSlotEntry[];
    private readonly keyboardHeader;
    private lastTabIndex;
    readonly inputRef: NodeReference<CharInput>;
    private readonly isDeleteKeyEnabled;
    private subscriptions;
    /** @inheritDoc */
    onAfterRender(thisNode: VNode): void;
    /**
     * Sets whether the keyboard shows the numpad keys instead of the alphabet keys.
     * @param show Whether to show the numpad keys.
     */
    setShowNumpad(show: boolean): void;
    /**
     * Responds to when one of this keyboard's character keys is pressed.
     * @param char The character of the key that was pressed.
     */
    private onKeyPressed;
    /** Sets cursor position to 0 when this keyboard's CLEAR button is pressed. */
    private onClearPressed;
    /** Moves cursors 1 slot to the left when this keyboard's LEFT ARROW button is pressed. */
    private onMoveCursorLeftPressed;
    /** Moves cursors 1 slot to the right when this keyboard's RIGHT ARROW button is pressed. */
    private onMoveCursorRightPressed;
    /** A callback function which will be called every time a mouse down event happens. */
    private onMouseDown;
    /** A callback function which will be called every time a mouse down event happens. */
    private onMouseUp;
    /** A callback function which will be called when the Close button is pressed. */
    private onCloseButtonPressed;
    /**
     * Renders a character key.
     * @param cssClass CSS class(es) to apply to the key's root element.
     * @param value The string value of this key.
     * @param label The character or VNode to display on the key.
     * @param isEnabled Whether this key is enabled. Defaults to true.
     * @param popUpLabel The label to display in the key's popup.
     * @returns A key for the specified character, as a VNode.
     */
    protected renderKey(cssClass: string, value: KeyValues, label: string | VNode, isEnabled: boolean | Subscribable<boolean>, popUpLabel?: string): VNode;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

/** The properties for the {@link KeyboardAlphaKeyPopup} component. */
interface KeyboardAlphaKeyPopupProps extends ComponentProps {
    /** The label to display inside this popup. */
    readonly label: string;
    /** Whether this popup is displayed */
    readonly show: Subscribable<boolean>;
}
/** The KeyboardAlphaKeyPopup component. */
declare class KeyboardAlphaKeyPopup extends DisplayComponent<KeyboardAlphaKeyPopupProps> {
    private readonly popupRef;
    private sub;
    /** @inheritdoc */
    onAfterRender(): void;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

/** Keeps track of the currently selected DU, which is selected using the buttons in TSC's DU & CCD tab. */
declare class DuAndCcdSelectManager {
    private readonly bus;
    private readonly subscriber;
    /**
     * To be used in `DuAndCcdTabContent`. Not to be confused with `trueDuIndex`
     * which is the index of the selected DU with MFD swap taken into account.
     */
    private readonly _selectedDu;
    private readonly isMFDSwapped;
    /** The index of the selected DU with MFD swap taken into account. */
    private readonly _trueDuIndex;
    /**
     * To be used in `DuAndCcdTabContent`. Not to be confused with `trueDuIndex`
     * which is the index of the selected DU with MFD swap taken into account.
     */
    readonly selectedDu: Subscribable<DisplayUnitIndices>;
    /** The index of the selected DU with MFD swap taken into account. */
    readonly trueDuIndex: Subscribable<DisplayUnitIndices>;
    /**
     * The constructor of `DuAndCcdSelectManager`
     * @param bus An instance of the event bus.
     */
    constructor(bus: EventBus);
    /** Destroys this manager. */
    destroy(): void;
}

/** TscTabContentProps */
interface TscTabContentProps extends TabContentProps {
    /** tsc service */
    tscService: TscService;
}
/** TscTabContent */
declare class TscTabContent<T extends TscTabContentProps> extends TabContent<T> {
    protected readonly rootRef: _microsoft_msfs_sdk.NodeReference<HTMLDivElement>;
    protected readonly subscriber: _microsoft_msfs_sdk.EventSubscriber<Epic2CockpitEvents>;
    protected subs: Subscription[];
    /** @inheritdoc */
    onAfterRender(): void;
    /** @inheritdoc */
    destroy(): void;
}

/** The COM Tab Content props. */
interface ComTabContentProps extends TscTabContentProps {
    /** com scroll label */
    comScrollLabel: Subject<string>;
    /** com radio index. */
    index: 1 | 2;
}
/** The COM Tab Content. */
declare class ComTabContent extends TscTabContent<ComTabContentProps> {
    private readonly radioSelection;
    readonly radioSub: _microsoft_msfs_sdk.EventSubscriber<NavComEvents & XPDRSimVarEvents & Omit<_microsoft_msfs_sdk.BaseElectricalEvents, "elec_bus_v" | "elec_bus_a" | "elec_bus_main_v" | "elec_bus_main_a" | "elec_bus_genalt_v" | "elec_bus_genalt_a" | "elec_circuit_on" | "elec_circuit_switch_on" | "elec_circuit_v" | "elec_circuit_a" | "elec_circuit_avionics_on" | "elec_circuit_com_on" | "elec_circuit_nav_on" | "elec_line_connection_on" | "elec_line_breaker_pulled" | "elec_gen_switch_on" | "elec_gen_active" | "elec_gen_v" | "elec_gen_a"> & {
        [x: `elec_bus_v_${number}`]: number;
        [x: `elec_bus_a_${number}`]: number;
        [x: `elec_bus_main_v_${number}`]: number;
        [x: `elec_bus_main_a_${number}`]: number;
        [x: `elec_bus_genalt_v_${number}`]: number;
        [x: `elec_bus_genalt_a_${number}`]: number;
        [x: `elec_circuit_on_${number}`]: boolean;
        [x: `elec_circuit_switch_on_${number}`]: boolean;
        [x: `elec_circuit_v_${number}`]: number;
        [x: `elec_circuit_a_${number}`]: number;
        [x: `elec_circuit_avionics_on_${number}`]: boolean;
        [x: `elec_circuit_com_on_${number}`]: boolean;
        [x: `elec_circuit_nav_on_${number}`]: boolean;
        [x: `elec_line_connection_on_${number}`]: boolean;
        [x: `elec_line_breaker_pulled_${number}`]: boolean;
        [x: `elec_gen_switch_on_${number}`]: boolean;
        [x: `elec_gen_active_${number}`]: boolean;
        [x: `elec_gen_v_${number}`]: number;
        [x: `elec_gen_a_${number}`]: number;
        [x: `elec_master_battery_${number}`]: boolean;
        [x: `elec_bat_v_${number}`]: number;
        [x: `elec_bat_load_${number}`]: number;
        [x: `elec_bat_soc_${number}`]: number;
        [x: `elec_eng_gen_switch_${number}`]: boolean;
        [x: `elec_apu_gen_switch_${number}`]: boolean;
        [x: `elec_apu_gen_active_${number}`]: boolean;
        [x: `elec_ext_power_available_${number}`]: boolean;
        [x: `elec_ext_power_on_${number}`]: boolean;
        [x: `elec_ext_power_v_${number}`]: number;
        [x: `elec_ext_power_a_${number}`]: number;
    }>;
    private readonly activeCom1Freq;
    private readonly stbyCom1Freq;
    private readonly activeCom2Freq;
    private readonly stbyCom2Freq;
    private readonly com1Powered;
    private readonly com2Powered;
    private readonly selectedPowered;
    private readonly spacingCom1;
    private readonly spacingCom2;
    private readonly activeCom1FreqFormatted;
    private readonly activeCom2FreqFormatted;
    private readonly stbyCom1FreqFormatted;
    private readonly stbyCom2FreqFormatted;
    private readonly numpadOptionButtonStyles;
    private readonly swapButtonStyles;
    private readonly numButtons;
    private readonly stbyInputRef;
    private readonly activeInputXIconRef;
    private readonly com1ButtonRef;
    private readonly com2ButtonRef;
    private swapButtonText;
    private isActiveCom1;
    private isActiveCom2;
    private tempStbyCom1Data;
    private tempStbyCom2Data;
    private activeDisplay;
    private stbyDisplay;
    private readonly comButtonConfigs;
    private handleClickOnXIcon;
    /**
     * Gets the standby data subject for a given radio selection
     * @returns The standby data subject
     */
    private getStandbyDataForRadio;
    /** Swaps the active and standby frequencies*/
    private swapActiveStandby;
    private numPadClickSetup;
    /**
     * Swaps or enters the frequencies depending on button state
     * @returns nothing
     */
    private handleSwapEnterPress;
    private swapAndEnterButtonTextToggle;
    /** Clears the standby input */
    private clearStbyInput;
    /** Backspaces the standby input */
    private backspaceStbyInput;
    /**
     * Handles any input from the standby entry tab
     * @param input The input
     * @returns true
     */
    private handleStbyInput;
    private activeToggleComButtons;
    /** @inheritdoc */
    onAfterRender(): void;
    private readonly frequencyFormat;
    /** @inheritdoc */
    render(): VNode;
}

/** The DuAndCcd Tab Content props. */
interface DuAndCcdTabContentProps extends TscTabContentProps {
    /** An instance of the event bus. */
    bus: EventBus;
}
/** The DuAndCcd Tab Content. */
declare class DuAndCcdTabContent extends TscTabContent<DuAndCcdTabContentProps> {
    private readonly selectManager;
    private readonly selectedDisplay;
    private readonly selectedDisplayClass;
    private selectedDisplaySub;
    /** @inheritdoc */
    onAfterRender(): void;
    /** Handler for when the page button is pressed */
    private pagePressed;
    /**
     * Send an HTML event.
     * @param event The HTML event name.
     */
    private sendHEvent;
    /**
     * Handler for when a display button is pressed
     * @param display The selected display unit index.
     */
    private onPressed;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

/** The Home Tab Content props. */
interface HomeTabContentProps extends ComponentProps {
    /** An instance of the event bus. */
    bus: EventBus;
    /** The TSC service */
    tscService: TscService;
}
/** The Home Tab Content. */
declare class HomeTabContent extends DisplayComponent<HomeTabContentProps> {
    private readonly rootRef;
    private readonly subscriber;
    private readonly publisher;
    private subs;
    /** Home Button Info */
    private homeButtonInfo;
    /**
     * Function called when any home tab button is called
     * @param buttonLabel the label of the button pressed
     */
    private onButtonPress;
    /** @inheritdoc */
    onAfterRender(): void;
    /** @inheritdoc */
    render(): VNode | null;
    /** @inheritdoc */
    destroy(): void;
}

/** The NAV Tab Content props. */
interface NavTabContentProps extends TscTabContentProps {
    /** nav scroll label */
    navScrollLabel: Subject<string>;
    /** Nav radio index. */
    index: 1 | 2;
}
/** The Nav Tab Content. */
declare class NavTabContent extends TscTabContent<NavTabContentProps> {
    private radioSelection;
    readonly radioSub: _microsoft_msfs_sdk.EventSubscriber<NavComEvents & XPDRSimVarEvents & Omit<_microsoft_msfs_sdk.BaseElectricalEvents, "elec_bus_v" | "elec_bus_a" | "elec_bus_main_v" | "elec_bus_main_a" | "elec_bus_genalt_v" | "elec_bus_genalt_a" | "elec_circuit_on" | "elec_circuit_switch_on" | "elec_circuit_v" | "elec_circuit_a" | "elec_circuit_avionics_on" | "elec_circuit_com_on" | "elec_circuit_nav_on" | "elec_line_connection_on" | "elec_line_breaker_pulled" | "elec_gen_switch_on" | "elec_gen_active" | "elec_gen_v" | "elec_gen_a"> & {
        [x: `elec_bus_v_${number}`]: number;
        [x: `elec_bus_a_${number}`]: number;
        [x: `elec_bus_main_v_${number}`]: number;
        [x: `elec_bus_main_a_${number}`]: number;
        [x: `elec_bus_genalt_v_${number}`]: number;
        [x: `elec_bus_genalt_a_${number}`]: number;
        [x: `elec_circuit_on_${number}`]: boolean;
        [x: `elec_circuit_switch_on_${number}`]: boolean;
        [x: `elec_circuit_v_${number}`]: number;
        [x: `elec_circuit_a_${number}`]: number;
        [x: `elec_circuit_avionics_on_${number}`]: boolean;
        [x: `elec_circuit_com_on_${number}`]: boolean;
        [x: `elec_circuit_nav_on_${number}`]: boolean;
        [x: `elec_line_connection_on_${number}`]: boolean;
        [x: `elec_line_breaker_pulled_${number}`]: boolean;
        [x: `elec_gen_switch_on_${number}`]: boolean;
        [x: `elec_gen_active_${number}`]: boolean;
        [x: `elec_gen_v_${number}`]: number;
        [x: `elec_gen_a_${number}`]: number;
        [x: `elec_master_battery_${number}`]: boolean;
        [x: `elec_bat_v_${number}`]: number;
        [x: `elec_bat_load_${number}`]: number;
        [x: `elec_bat_soc_${number}`]: number;
        [x: `elec_eng_gen_switch_${number}`]: boolean;
        [x: `elec_apu_gen_switch_${number}`]: boolean;
        [x: `elec_apu_gen_active_${number}`]: boolean;
        [x: `elec_ext_power_available_${number}`]: boolean;
        [x: `elec_ext_power_on_${number}`]: boolean;
        [x: `elec_ext_power_v_${number}`]: number;
        [x: `elec_ext_power_a_${number}`]: number;
    } & AdfSystemEvents>;
    private readonly activeNav1Freq;
    private readonly stbyNav1Freq;
    private readonly activeNav2Freq;
    private readonly stbyNav2Freq;
    private readonly activeAdfFreq;
    private readonly nav1Powered;
    private readonly nav2Powered;
    private readonly adfState;
    private readonly adfPowered;
    private readonly selectedPowered;
    private readonly spacing;
    private readonly activeNav1FreqFormatted;
    private readonly activeNav2FreqFormatted;
    private readonly activeAdfFreqFormatted;
    private readonly stbyNav1FreqFormatted;
    private readonly stbyNav2FreqFormatted;
    private readonly numpadOptionButtonStyles;
    private readonly swapButtonStyles;
    private readonly numButtons;
    private readonly stbyInputRef;
    private readonly activeInputXIconRef;
    private readonly plusMinusButtonRef;
    private readonly nav1ButtonRef;
    private readonly nav2ButtonRef;
    private readonly adfButtonRef;
    private swapButtonText;
    private isActiveNav1;
    private isActiveNav2;
    private isActiveAdf;
    private tempStbyNav1Data;
    private tempStbyNav2Data;
    private tempActiveAdfData;
    private activeDisplay;
    private stbyDisplay;
    private readonly navButtonConfigs;
    private handleClickOnXIcon;
    /**
     * Handles any input from the standby entry tab
     * @param input The input
     * @returns true
     */
    private handleStbyInput;
    /** Swaps the active and standby frequencies */
    private swapActiveStandby;
    /**
     * Gets the standby data subject for a given radio selection
     * @returns The standby data subject
     */
    private getStandbyDataForRadio;
    private numPadClickSetup;
    /**
     * Swaps or enters the frequencies depending on button state
     * @returns nothing
     */
    private handleSwapEnterPress;
    private swapAndEnterButtonTextToggle;
    /** Clears standby input */
    private clearStbyInput;
    /**
     * Backspaces the standby input
     */
    private backspaceStbyInput;
    private activeToggleNavButtons;
    /** @inheritdoc */
    onAfterRender(): void;
    private readonly frequencyFormat;
    /** @inheritdoc */
    render(): VNode;
}

/** The XPDR Tab Content props. */
interface XpdrTabContentProps extends TscTabContentProps {
    /** Xpdr index. */
    index: 1 | 2;
    /** The NAV/COM user settings. */
    navComSettings: NavComUserSettingManager;
}
/** The XPDR Tab Content. */
declare class XpdrTabContent extends TscTabContent<XpdrTabContentProps> {
    readonly radioSub: _microsoft_msfs_sdk.EventSubscriber<NavComEvents & XPDRSimVarEvents & XpdrSystemEvents>;
    private readonly xpdrState;
    private readonly xpdrPowered;
    private readonly xpdrCode;
    private readonly xpdrCodeFormatted;
    private readonly numpadOptionButtonStyles;
    private readonly enterButtonStyle;
    private readonly identAndVfrButtonStyles;
    private readonly numButtons;
    private readonly stbyInputRef;
    private readonly activeInputXIconRef;
    private readonly plusMinusButtonRef;
    private activeInputLabel;
    private tempStbyXpdrData;
    private stbyDisplay;
    readonly rootRef: _microsoft_msfs_sdk.NodeReference<HTMLDivElement>;
    readonly subscriber: _microsoft_msfs_sdk.EventSubscriber<Epic2CockpitEvents>;
    subs: Subscription[];
    private handleClickOnXIcon;
    /** Sets the standby to the active and closes the tab */
    private setStandbyToActiveAndClose;
    private numPadClickSetup;
    /** Swaps or enters the frequencies depending on button state */
    private handleEnterPress;
    /** @inheritdoc */
    onAfterRender(): void;
    private readonly xpdrFormat;
    /** @inheritdoc */
    render(): VNode;
    /** @inheritdoc */
    destroy(): void;
}

export { BottomRow, CharInput, CharInputSlot, ComTabContent, CursorInput, DividerLine, DuAndCcdIcon, DuAndCcdSelectManager, DuAndCcdTabContent, Epic2TscInstrument, GenericCursorInputSlot, HomeTabContent, Keyboard, KeyboardAlphaKeyPopup, KeyboardController, MenuTab, NavTabContent, NumberPad, RadioSub, TSC_ICONS, TscButton, TscIconButton, TscService, XpdrTabContent };
export type { BottomRowProps, CharInputProps, CharInputSlotProps, CursorInputCharSelectionMode, CursorInputProps, CursorInputSlot, GenericCursorInputSlotProps, KeyValueMapType, KeyValues, KeyboardProps, NavButtonConfigProps, NavTabContentProps, NumButtonProps, RadioSubProps, TscButtonStyles };

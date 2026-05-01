import {
  DebounceTimer, FacilityLoader, FacilityType, FSComponent, MappedSubject, MappedSubscribable, MutableSubscribable, Subject, Subscribable, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../Events/IfdInteractionEvent';
import { IfdTransponderManager } from '../Events/IfdTransponderManager';
import { Fms } from '../Fms';
import { EditableFieldRef } from '../Pages/FmsPage/FplTab/Components/KeyboardFields/AbstractField';
import { IfdDialog, IfdDialogProps } from '../ViewService/IfdDialog';
import { AlphanumericKeyboard } from './AlphanumericKeyboard';
import { KeyboardInputDisplay } from './KeyboardInputDisplay';
import { VirtualKeyboardState } from './KeyboardState';
import { KeyboardInputType, VirtualKeyboardType } from './KeyboardTypes';
import { NumpadKeyboard } from './NumpadKeyboard';
import { SymbolKeyboard } from './SymbolKeyboard';
import { XpdrKeyboard } from './XpdrKeyboard';

import './VirtualKeyboard.css';

/**
 * Props for the VirtualKeyboard component
 */
export interface VirtualKeyboardProps extends IfdDialogProps {
  /** Whether the keyboard is visible */
  isVisible: MutableSubscribable<boolean>;
  /** The type of keyboard to display */
  type: Subject<VirtualKeyboardType>;
  /** Whether to disable the keyboard mode switch (e.g. for numpad-only) */
  disableModeSwitch?: Subject<boolean>;
  /** Whether to initially show numpad (true) or alpha keyboard (false) */
  initialShowNumpad?: Subject<boolean>;
  /** Callback for when a key is pressed */
  onKeyPressed?: (char: string) => void;
  /** Callback for when backspace is pressed */
  onBackspacePressed?: () => void;
  /** Callback for when enter is pressed */
  onEnterPressed?: (value: string) => void;
  /** Callback for when close button (x) is pressed */
  onClosePressed?: () => void;
  /** The current input type (facility, frequency, or null for regular input) */
  inputType: Subject<KeyboardInputType>;
  /** Facility loader for suggestion service */
  facilityLoader: FacilityLoader;
  /** Specific facility types to search for when using suggestion service */
  suggestFacilityTypes?: FacilityType[];
  /** Whether suggestions are visible */
  suggestValues?: Subject<boolean>;
  /** When the keyboard becomes visible, this value (if provided) is copied into the input field */
  initialValue?: Subject<string>;
  /** The Flight Management System to use */
  fms: Fms;
  /** Care Position **/
  caretPosition: Subject<number>;
  /** The keyboard state */
  keyboardState: VirtualKeyboardState;
  /** An instance of the IfdTransponderManager */
  xpdrManager: IfdTransponderManager;
}

/**
 * Virtual Alpha Keyboard component for IFD
 */
export class VirtualKeyboard extends IfdDialog<VirtualKeyboardProps> {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  private containerRef = FSComponent.createRef<HTMLDivElement>();

  private currentField: EditableFieldRef | null = null;

  // Tracks whether we're showing the numpad or alphabet
  private readonly showNumpad = Subject.create(false);

  // Current input value
  private readonly inputValue = Subject.create<string>('');

  // Subscriptions
  private readonly subs: Subscription[] = [];

  // Pre-computed mapped subjects for CSS classes
  private readonly modeAlphaSubject: MappedSubject<[VirtualKeyboardType, boolean], boolean>;
  private readonly modeSymbolSubject: MappedSubscribable<boolean>;
  private readonly modeNumpadSubject: MappedSubject<[VirtualKeyboardType, boolean], boolean>;
  private readonly modeXpdrSubject: MappedSubscribable<boolean>;

  private readonly invalidMessageTimeout = new DebounceTimer();

  /** @inheritdoc */
  public isVisible: Subscribable<boolean> = this.props.isVisible;

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (!this.isVisible.get() || !this.currentField) {
      return false;
    }

    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
      case IfdInteractionEvent.ENTR:
        this.onEnterPressed();
        return true;

      case IfdInteractionEvent.CLR:
        this.onBackspacePressed();
        return true;
    }

    return !!this.currentField.onInteractionEvent?.(event);
  }

  /**
   * Toggle between alphabet and numpad display
   */
  private onModePressed(): void {
    // Only toggle if mode switch is not disabled
    const isDisabled = this.props.disableModeSwitch?.get() ?? false;
    if (!isDisabled) {
      this.showNumpad.set(!this.showNumpad.get());
    }
  }

  /** @inheritdoc */
  constructor(props: VirtualKeyboardProps) {
    super(props);

    // Create mapped subjects for class conditions once
    this.modeAlphaSubject = MappedSubject.create(
      ([type, showNumpad]) => type === VirtualKeyboardType.Alphanumeric && !showNumpad,
      this.props.type,
      this.showNumpad
    );

    this.modeNumpadSubject = MappedSubject.create(
      ([type, showNumpad]) => type === VirtualKeyboardType.Alphanumeric && showNumpad,
      this.props.type,
      this.showNumpad
    );

    this.modeSymbolSubject = this.props.type.map((type) => type === VirtualKeyboardType.Symbol);

    this.modeXpdrSubject = this.props.type.map(type => type === VirtualKeyboardType.XPDR);

    // this.subs.push(this.props.inputType.sub(type => {
    //   if (type === KeyboardInputType.Frequency) {
    //     this.showNumpad.set(true);
    //   } else {
    //     this.showNumpad.set(false);
    //   }
    // }, true));
  }

  /**
   * Handle character key press
   * @param char The character that was pressed
   */
  private onKeyPressed(char: string): void {
    if (!this.currentField) { return; }

    this.currentField.onKeyPressed(char);
    this.inputValue.set(this.currentField.getValue());
    this.props.keyboardState.setInput(this.currentField.getValue());

    // Call the callback if provided
    if (this.props.onKeyPressed) {
      this.props.onKeyPressed(char);
    }
  }

  /**
   * Handle backspace key press
   */
  private onBackspacePressed(): void {
    if (!this.currentField) { return; }

    const inputValue = this.inputValue.get();

    // If suggestions are not visible, remove the character at the caret position
    this.inputValue.set(inputValue.substring(0, inputValue.length - 1));
    this.currentField.onBackspacePressed();

    // Call the callback if provided
    if (this.props.onBackspacePressed) {
      this.props.onBackspacePressed();
    }
  }

  /**
   * Handle enter key press
   */
  private onEnterPressed(): void {
    if (!this.currentField) { return; }

    if (this.props.onEnterPressed) {


      const value = this.currentField.onEnterPressed();
      this.inputValue.set(value);
      this.props.onEnterPressed(value);
    }
  }

  /**
   * Triggered when there is an invalid input entry via the keyboard
   * @param message the message to show
   */
  private onInvalidEntry(message: string): void {
    this.props.keyboardState.invalidEntryMessage.set('');
    this.invalidMessageTimeout.clear();
    this.props.keyboardState.invalidEntryMessage.set(message);
    this.invalidMessageTimeout.schedule(() => {
      this.props.keyboardState.invalidEntryMessage.set('');
    }, 2000);
  }

  /**
   * Manual enter callback
   * @param value the input value
   */
  private onEnterCallback(value: string): void {
    if (!this.currentField) { return; }

    if (value) {
      this.inputValue.set(value);
      this.props.onEnterPressed?.(value);
    }
  }

  /** @inheritdoc */
  public close(): void {
    this.onClosePressed();
  }

  /**
   * Handle close key press
   */
  private onClosePressed(): void {
    this.inputValue.set('');
    this.currentField = null;
    this.props.isVisible.set(false);
    if (this.props.onClosePressed) {
      this.props.onClosePressed();
    }
  }

  /**
   * Handle when input field is ready
   * @param field EditableFieldRef
   */
  private onFieldReady = (field: EditableFieldRef): void => {
    this.currentField = field;

    // Set initial value if available
    if (this.props.initialValue) {
      const seed = this.props.initialValue.get() ?? '';
      this.inputValue.set(seed);
    }
  };

  /** @inheritDoc */
  public onAfterRender(): void {
    // Set up subscriptions
    if (this.props.initialShowNumpad) {
      // Add to subs for cleanup
      this.subs.push(this.props.isVisible.sub((isVisible) => {
        if (isVisible) {
          // When keyboard becomes visible, apply initial numpad setting
          this.showNumpad.set(this.props.initialShowNumpad?.get() ?? false);
        }
      }));
    }

    this.subs.push(this.props.isVisible.sub((isVisible) => {
      if (isVisible) {
        // Clear existing content and field reference
        this.containerRef.instance.innerHTML = '';
        this.currentField = null;

        FSComponent.render(
          <KeyboardInputDisplay
            inputType={this.props.inputType.get()}
            bus={this.props.bus}
            fms={this.props.fms}
            showNumpad={this.showNumpad}
            facilityLoader={this.props.facilityLoader}
            initialValue={this.props.initialValue?.get()}
            caretPosition={this.props.caretPosition}
            onFieldReady={this.onFieldReady}
            onEnterPressed={this.onEnterCallback?.bind(this)}
            onInvalidEntry={this.onInvalidEntry.bind(this)}
            disableFacilitySearch={this.props.keyboardState.disableFacilitySearch}
          />,
          this.containerRef.instance
        );
      }
    }));

    this.viewService.registerDialog(this);
  }

  /** @inheritDoc */
  public destroy(): void {
    this.subs.forEach(sub => sub.destroy());
    this.currentField = null;
  }

  /**
   * Renders the virtual keyboard
   * @returns VNode The rendered keyboard
   */
  public render(): VNode {
    return (
      <div ref={this.rootRef} class={{
        'vkb-container': true,
        'vkb-hidden': this.props.isVisible.map(isVisible => !isVisible),
        'vkb-mode-alpha': this.modeAlphaSubject,
        'vkb-mode-symbol': this.modeSymbolSubject,
        'vkb-mode-numpad': this.modeNumpadSubject,
        'vkb-mode-xpdr': this.modeXpdrSubject
      }}>
        {/* Alphanumeric keyboard */}
        <AlphanumericKeyboard
          onKeyPressed={this.onKeyPressed.bind(this)}
          onBackspacePressed={this.onBackspacePressed.bind(this)}
          onEnterPressed={this.onEnterPressed.bind(this)}
          onClosePressed={this.onClosePressed.bind(this)}
          onModePressed={this.onModePressed.bind(this)}
          disableModeSwitch={this.props.disableModeSwitch}
        />

        {/* Symbol keyboard */}
        <SymbolKeyboard
          onKeyPressed={this.onKeyPressed.bind(this)}
          onBackspacePressed={this.onBackspacePressed.bind(this)}
          onEnterPressed={this.onEnterPressed.bind(this)}
          onClosePressed={this.onClosePressed.bind(this)}
          onModePressed={this.onModePressed.bind(this)}
          disableModeSwitch={this.props.disableModeSwitch}
        />

        {/* Numpad keyboard */}
        <NumpadKeyboard
          onKeyPressed={this.onKeyPressed.bind(this)}
          onBackspacePressed={this.onBackspacePressed.bind(this)}
          onEnterPressed={this.onEnterPressed.bind(this)}
          onClosePressed={this.onClosePressed.bind(this)}
          onModePressed={this.onModePressed.bind(this)}
          disableModeSwitch={this.props.disableModeSwitch}
        />

        {/* XPDR keyboard layout */}
        <div class="vkb-display-none vkb-layout-xpdr">
          <XpdrKeyboard
            onKeyPressed={this.onKeyPressed.bind(this)}
            onBackspacePressed={this.onBackspacePressed.bind(this)}
            onEnterPressed={this.onEnterPressed.bind(this)}
            onClosePressed={this.onClosePressed.bind(this)}
            onEnterCallback={this.onEnterCallback.bind(this)}
            bus={this.props.bus}
            xpdrManager={this.props.xpdrManager}
          />
        </div>
        <div class={{
          'vkb-input-wrapper': true,
          'reverse-color': true,
          'invalid-color': this.props.keyboardState.invalidEntryMessage.map(msg => !!msg).withLifecycle(this.defaultLifecycle)
        }} ref={this.containerRef} />
        <div class={{
          'vkb-invalid-entry': true,
          'hidden': this.props.keyboardState.invalidEntryMessage.map(msg => !msg).withLifecycle(this.defaultLifecycle),
        }}><span>{this.props.keyboardState.invalidEntryMessage}</span></div>
      </div>
    );
  }
}

import { ComponentProps, EventBus, Facility, FacilityLoader, FSComponent, Subject, Subscribable, SubscribableMapFunctions, VNode } from '@microsoft/msfs-sdk';

import { LegBlockArrowIcon } from '../../../../../Assets/SVGs/LegBlockArrowIcon';
import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../../Components/List/IfdListItemComponent';
import { IfdInteractionEvent } from '../../../../../Events/IfdInteractionEvent';
import { TemporaryWaypointListData } from '../../../../../FlightPlan/TemporaryWaypointListData';
import { Fms } from '../../../../../Fms';
import { IfdOptions } from '../../../../../IfdOptions';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../../../Keyboard/KeyboardTypes';
import { FplSelectionMenuController } from '../../FplSelectionMenu/FplSelectionMenuController';
import { CharInput, CharInputSlot } from '../CharInput';
import { InsertWptController } from './InsertWptController';
import { InsertWptStore } from './InsertWptStore';

import './InsertWptBlock.css';

/** The properties for the {@link InsertWptBlock} component. */
export interface InsertWptBlockProps extends IfdListItemComponentProps, ComponentProps {
  /** The temporary waypoint block data. */
  readonly data: TemporaryWaypointListData;
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The fms instance. */
  readonly fms: Fms;
  /** The IFD config options to use. */
  readonly ifdOptions: IfdOptions;
  /** The selection menu controller. */
  readonly menuController: FplSelectionMenuController;
  /** A callback which handles removing the temporary waypoint. */
  handleRemoveTempWpt: () => void;
  /** A callback which handles Insert Wpt Enter (same behavior as LSK3). */
  handleInsertWptEnter: () => void;
  /** The initial facility to prefill the block with. */
  readonly initialFacility: Subscribable<Facility | null>;
}

/** The {@link InsertWptBlock} component. */
export class InsertWptBlock extends IfdListItemComponent<InsertWptBlockProps> {

  private readonly textInputFieldRef = FSComponent.createRef<CharInput>();
  private readonly staticIdentFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly textInputFieldContainerRef = FSComponent.createRef<HTMLDivElement>();

  private readonly store = new InsertWptStore(this.defaultLifecycle);
  private readonly controller = new InsertWptController(
    this.store,
    this.props.bus,
    this.props.fms,
    this.props.menuController,
    this.textInputFieldRef,
    this.props.facLoader,
    this.defaultLifecycle
  );

  private readonly keyboardState = VirtualKeyboardState.getInstance();
  private readonly isEditingActive = Subject.create(true);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.textInputFieldContainerRef.instance.addEventListener('click', this.onTextInputClicked);
    this.staticIdentFieldRef.instance.addEventListener('click', this.onTextInputClicked);

    this.store.referencePosition.set(this.props.data.fromLat ?? NaN, this.props.data.fromLon ?? NaN);

    const initialFacility = this.props.initialFacility.get();
    if (initialFacility && !this.store.textInput.get()) {
      this.controller.setData(initialFacility, true);
      // Move caret to the last character of the ident
      const ident = initialFacility.icaoStruct.ident ?? '';
      const pos = Math.min(ident.length - 1, 4);

      const field = this.textInputFieldRef.getOrDefault();
      if (field) {
        field.placeCursor(pos, true);
      }
    }

    // Mirror the keyboard's input string into this block.
    this.keyboardState.input.sub((value: string): void => {
      if (!this.keyboardState.isEditingActive.get()) {
        return;
      }

      // Use the keyboard's current text as our ident.
      this.pushTextInput(value);
    }, true).withLifecycle(this.defaultLifecycle);

    this.keyboardState.isEditingActive
      .sub((keyboardOpen: boolean): void => {
        this.isEditingActive.set(!keyboardOpen);
      }, true)
      .withLifecycle(this.defaultLifecycle);

    if (this.props.data.keyboardOpenOnInit) {
      this.onTextInputClicked();
    }
  }

  /**
   * Pushes a new ident text into the UI and store immediately.
   * @param next The next uppercase ident value.
   */
  private pushTextInput(next: string): void {
    const value = (next ?? '').toUpperCase();

    this.store.textInput.set(value);

    const field = this.textInputFieldRef.getOrDefault();
    if (field) {
      field.setValue(value);
    }
  }

  private onTextInputClicked = (): void => {
    const textInputField = this.textInputFieldRef.getOrDefault();
    if (!textInputField) {
      return;
    }

    this.openIdentKeyboard();
  };

  /**
   * Returns true if there are duplicate facilities pending resolution.
   * @returns True if there are duplicate facilities; otherwise false.
   */
  public hasDuplicates(): boolean {
    return this.store.duplicates.get().length > 0;
  }

  /**
   * Resolves duplicates via the controller and returns the chosen facility (if any).
   * @returns A promise which resolves to the chosen facility, or undefined if none was chosen.
   */
  public async resolveDuplicates(): Promise<Facility | undefined> {
    return this.controller.resolveDuplicates();
  }

  /** Handles press of ENTR button from keyboard or bezel. */
  private onEnterPressed(): void {
    if (this.store.duplicates.get().length > 0) {
      this.controller.resolveDuplicates()
        .then((fac) => fac && this.props.handleInsertWptEnter())
        .catch(() => this.props.handleRemoveTempWpt());
    } else if (this.store.data) {
      this.props.handleInsertWptEnter();
    }
  }

  /**
   * Handles right-knob events while the block is visible.
   * @param event The knob event to handle.
   * @returns True if this dialog consumed the event; otherwise false.
   */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const textInputField = this.textInputFieldRef.getOrDefault();

    if (!textInputField) {
      return false;
    }

    const cursorPos = textInputField.cursorPosition.get();
    const maxIndex = 4; // 5 character slots, indexed 0-4

    switch (event) {
      case IfdInteractionEvent.ENTR:
      case IfdInteractionEvent.RightKnobPush:
        this.onEnterPressed();
        return true;

      case IfdInteractionEvent.RightKnobOuterInc: {
        // Always try to commit the suggestion first, regardless of cursor position.
        const handled = this.controller.tryAcceptSuggestion();
        if (handled) {
          return true;
        }

        if (cursorPos < maxIndex) {
          const currentText = this.store.textInput.get() ?? '';
          const isAtEnd = cursorPos >= currentText.length - 1;

          // Only allow moving past the last typed character if we know
          // there is at least one longer ident starting with this prefix.
          if (!isAtEnd || this.store.canMoveCaretPastEnd) {
            textInputField.moveCursor(1, false);
            this.controller.updateDataForCaretPrefix();
          }
        }
        return true;
      }

      case IfdInteractionEvent.RightKnobOuterDec:
        if (cursorPos > 0) {
          textInputField.moveCursor(-1, false);
          this.controller.updateDataForCaretPrefix();
        }
        return true;

      case IfdInteractionEvent.RightKnobInnerDec:
        this.store.searchDirection = -1;
        textInputField.changeSlotValue(-1, true);
        return true;

      case IfdInteractionEvent.RightKnobInnerInc:
        this.store.searchDirection = 1;
        textInputField.changeSlotValue(1, true);
        return true;

      case IfdInteractionEvent.CLR:
        if (cursorPos === 0) {
          this.props.handleRemoveTempWpt();
        } else {
          this.controller.backspace();
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Opens the shared IFD text keyboard to edit the ident.
   * On close, resolves the entered ident through the controller.
   */
  private openIdentKeyboard(): void {
    const publisher = this.props.bus.getPublisher<IfdKeyboardControlEvents>();

    let pendingValue = (this.store.textInput.get() ?? '').toUpperCase();
    this.pushTextInput(pendingValue);

    let keyboardClosed = false;

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: KeyboardInputType.FreeText,
      disableModeSwitch: false,
      initialShowNumpad: false,
      initialValue: pendingValue,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      onValueChanged: (value: string): void => {
        // we need this hack because the keyboard always clears the value when it closes (either by ENTR or otherwise)
        if (!keyboardClosed) {
          pendingValue = value.toUpperCase();
          this.pushTextInput(pendingValue);
        }
      },
      onClose: () => {
        keyboardClosed = true;
      },
      onEnter: () => {
        this.onEnterPressed();
        const field = this.textInputFieldRef.getOrDefault();

        if (field?.getIsEditingActive().get()) {
          field.deactivateEditing();
        }
      },
      onCaretPositionChanged: (pos: number) => {
        const field = this.textInputFieldRef.getOrDefault();
        if (field) {
          const clamped = Math.min(Math.max(pos, 0), 4);
          field.placeCursor(clamped, true);
          this.controller.updateDataForCaretPrefix();
        }
      },
      rowRef: null
    };

    publisher.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /**
   * Gets the currently resolved facility for this temporary waypoint.
   * @returns The resolved facility, or undefined if no single facility is selected.
   */
  public getSelectedFacility(): Facility | undefined {
    return this.store.data;
  }


  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class='insert-wpt-block'
      >
        <div class="insert-wpt-search">
          <div class="search-top-row">Direct</div>
          <div class="insert-wpt-input">
            <div class="leg-block-arrow-icon">
              <LegBlockArrowIcon fillColor="333333" />
            </div>
            <div class={{ 'details-black-field': true, 'ident-input-field': true, 'hidden': this.isEditingActive.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle) }} ref={this.textInputFieldContainerRef}>
              <CharInput
                ref={this.textInputFieldRef}
                value={this.store.textInput}
              >
                <CharInputSlot
                  defaultCharValue={''}
                  wrap
                />
                <CharInputSlot
                  defaultCharValue={''}
                  wrap
                />
                <CharInputSlot
                  defaultCharValue={''}
                  wrap
                />
                <CharInputSlot
                  defaultCharValue={''}
                  wrap
                />
                <CharInputSlot
                  defaultCharValue={''}
                  wrap
                />
              </CharInput>
            </div>
            <div
              ref={this.staticIdentFieldRef}
              class={{ 'details-black-field': true, hidden: this.isEditingActive }}
            >
              {this.store.textInput}
            </div>
          </div>
        </div>
        <div class="insert-wpt-data">
          <div class="text-data">{this.store.name}</div>
          <div class={{ 'text-data': true, hidden: this.store.type.map(v => !v).withLifecycle(this.defaultLifecycle) }}>{this.store.type}</div>
          <div class={{ 'text-data': true, hidden: this.store.location.map(v => !v).withLifecycle(this.defaultLifecycle) }}>{this.store.location}</div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.textInputFieldContainerRef.getOrDefault()?.removeEventListener('click', this.onTextInputClicked);
    this.staticIdentFieldRef.getOrDefault()?.removeEventListener('click', this.onTextInputClicked);
  }
}

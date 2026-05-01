import {
  EventBus, FacilityLoader, FSComponent, MappedSubject, Subject, Subscribable, SubscribableMapFunctions, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { Fms } from '../../Fms';
import { IfdOptions } from '../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../Keyboard/KeyboardTypes';
import { LineSelectKeyButtonType } from '../../LineSelectKeyButtons';
import { LskStateReadonly } from '../../LineSelectKeyButtons/LskState';
import { FmsPageEvents } from '../../Pages/FmsPage/FmsPageEvents';
import { CharInput, CharInputSlot } from '../../Pages/FmsPage/FplTab/Components/CharInput';
import { FplSelectionMenuController } from '../../Pages/FmsPage/FplTab/FplSelectionMenu/FplSelectionMenuController';
import { UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { FormatUtils } from '../../Utilities/FormatUtils';
import { IfdViewService } from '../../ViewService';
import { IfdDialog, IfdDialogProps } from '../../ViewService/IfdDialog';
import { UnitFormatter } from '../NumberDisplays';
import { DirectToController } from './DirectToController';
import { DirectToStore, DirToFacilityTypes } from './DirectToStore';

import './DirectToDialog.css';

/** Props for the direct to dialog. */
export interface DirectToDialogProps extends IfdDialogProps {
  /** The instrument event bus. */
  readonly bus: EventBus;

  /** A facility loader. */
  readonly facLoader: FacilityLoader;

  /** The FMS. */
  readonly fms: Fms;

  /** The instrument configuration for the IFD. */
  readonly ifdOptions: IfdOptions;

  /** The selection menu controller. */
  readonly menuController: FplSelectionMenuController;

  /** The view service to use. */
  readonly viewService: IfdViewService;
}

/** The direct to dialog. */
export class DirectToDialog extends IfdDialog<DirectToDialogProps> {
  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.bus);

  private readonly textInputFieldRef = FSComponent.createRef<CharInput>();
  private readonly staticIdentFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly textInputFieldContainerRef = FSComponent.createRef<HTMLDivElement>();

  private readonly store = new DirectToStore(this.defaultLifecycle);
  private readonly controller = new DirectToController(
    this.store,
    this.props.bus,
    this.props.facLoader,
    this.props.fms,
    this.props.menuController,
    this.textInputFieldRef,
    this.defaultLifecycle,
  );

  private readonly isEditingActive = Subject.create(false);

  private readonly dialogHidden = Subject.create(true);
  /** Indicates whether the dialog is currently visible. */
  public readonly isVisible: Subscribable<boolean> = this.dialogHidden.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle);

  public readonly lskState: LskStateReadonly = {
    lsk2: {
      type: Subject.create(LineSelectKeyButtonType.Action),
      label: Subject.create('Cancel'),
      value: Subject.create(undefined),
      isVisible: Subject.create(true),
      onClick: Subject.create(this.close.bind(this)),
      onKnobEvent: Subject.create(undefined),
    },
    lsk3: {
      type: Subject.create(LineSelectKeyButtonType.Action),
      label: Subject.create('Enter'),
      value: Subject.create(undefined),
      isVisible: Subject.create(true),
      onClick: Subject.create(this.onEnterPressed.bind(this)),
      onKnobEvent: Subject.create(undefined),
    },
    lsk4: {
      type: Subject.create(LineSelectKeyButtonType.State),
      label: Subject.create(undefined),
      value: Subject.create(undefined),
      isVisible: Subject.create(false),
      onClick: Subject.create(undefined),
      onKnobEvent: Subject.create(undefined),
    },
    selectedButton: Subject.create(undefined),
    isVisible: Subject.create(true),
  };

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    this.dialogHidden.sub((hidden) => {
      if (hidden) {
        this.controller.pause();
      } else {
        this.store.canActivate.set(false);
        this.controller.resume();
      }
      this.props.bus.getPublisher<FmsPageEvents>().pub('fms_page_direct_to_open', !hidden, false, true);
    }, true).withLifecycle(this.defaultLifecycle);

    this.textInputFieldContainerRef.instance.addEventListener('click', this.onTextInputClicked);
    this.staticIdentFieldRef.instance.addEventListener('click', this.onTextInputClicked);

    this.store.canActivate.sub((v) => {
      if (v) {
        this.props.viewService.requestConfirmation(`Activate Direct To ${this.store.ident.get()}`, 'mint', 155).then(this.activateDirectTo).catch(this.close.bind(this));
      }
    });

    this.textInputFieldRef.instance.getIsEditingActive().pipe(this.isEditingActive).withLifecycle(this.defaultLifecycle);

    this.props.viewService.registerDialog(this);
  }

  /**
   * Pushes a new ident text into the Direct-To UI and store immediately.
   * @param next The next uppercase ident value.
   */
  private pushTextInput(next: string): void {
    const value = (next ?? '').toUpperCase();

    this.store.textInput.set(value);
    this.store.canActivate.set(false);

    const field = this.textInputFieldRef.getOrDefault();
    if (field) {
      field.setValue(value);
    }
  }

  private onTextInputClicked = (): void => {
    const textInputField = this.textInputFieldRef.getOrDefault();
    if (!this.isVisible.get() || !textInputField || this.store.canActivate.get()) {
      return;
    }

    if (!textInputField.getIsEditingActive().get()) {
      textInputField.activateEditing(true);
      textInputField.placeCursor(0, true);
    }

    this.openIdentKeyboard();
  };

  /** Closes the dialog. */
  public close(): void {
    if (this.isVisible.get()) {
      this.dialogHidden.set(true);
      this.controller.clearPreview();
      const textInputField = this.textInputFieldRef.getOrDefault();
      if (textInputField && textInputField.getIsEditingActive().get()) {
        textInputField.deactivateEditing();
      }
    }
  }

  private activateDirectTo = (): void => {
    this.controller.activate();
    this.close();
  };

  /**
   * Opens the direct-to dialog box and primes candidates.
   * @param facility An optional facility associated with the active view.
   * @returns A promise that resolves when the dialog is shown.
   */
  public async open(facility?: DirToFacilityTypes): Promise<void> {
    const dirToData = await this.controller.getInitialData(facility);

    if (dirToData) {
      this.controller.setData(dirToData, true);
    }

    this.dialogHidden.set(false);
  }

  /** Handles press of ENTR button from KB or bezel. */
  private onEnterPressed(): void {
    if (this.store.data) {
      this.store.canActivate.set(true);
      this.textInputFieldRef.getOrDefault()?.deactivateEditing();
    } else if (this.store.duplicates) {
      this.controller.resolveDuplicates();
    }
  }

  /**
   * Handles right-knob events while the dialog is visible.
   * Outer knob cycles through candidate facilities; knob push confirms (same as 2xENTR).
   * @param event The knob event to handle.
   * @returns True if this dialog consumed the event; otherwise false.
   */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const hidden = this.dialogHidden.get();

    const textInputField = this.textInputFieldRef.getOrDefault();

    // no edits can be made after the d-to is ready to activate
    if (hidden || this.store.canActivate.get()) {
      return false;
    } else if (textInputField?.getIsEditingActive().get()) {
      switch (event) {
        case IfdInteractionEvent.ENTR:
        case IfdInteractionEvent.RightKnobPush:
          this.onEnterPressed();
          return true;
        case IfdInteractionEvent.RightKnobOuterInc:
          textInputField?.moveCursor(1, true);
          return true;
        case IfdInteractionEvent.RightKnobOuterDec:
          textInputField?.moveCursor(-1, true);
          return true;
        case IfdInteractionEvent.RightKnobInnerDec:
          textInputField?.changeSlotValue(-1, true);
          return true;
        case IfdInteractionEvent.RightKnobInnerInc:
          textInputField?.changeSlotValue(1, true);
          return true;
        case IfdInteractionEvent.CLR:
          if (textInputField?.cursorPosition.get() === 0 && this.isVisible.get()) {
            this.close();
          } else {
            textInputField?.backspace();
          }
          return true;
        default:
          return false;
      }
    } else {
      switch (event) {
        case IfdInteractionEvent.RightKnobPush:
          textInputField?.activateEditing(true);
          textInputField?.placeCursor(0, true);
          return true;
        case IfdInteractionEvent.ENTR:
          this.onEnterPressed();
          return true;
        case IfdInteractionEvent.CLR:
          if (this.isVisible.get()) {
            this.close();
            return true;
          } else {
            return false;
          }
        default:
          return false;
      }
    }
  }

  /**
   * Opens the shared IFD text keyboard to edit the Direct-To ident.
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
        this.close.bind(this);
      },
      onEnter: () => {
        this.onEnterPressed();
        const field = this.textInputFieldRef.getOrDefault();

        if (field?.getIsEditingActive().get()) {
          field.deactivateEditing();
        }
      },
      onCaretPositionChanged: (pos: number) => {
        this.textInputFieldRef.getOrDefault()?.placeCursor(pos, true);
      },
      rowRef: null
    };

    publisher.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  private brgDisp = this.store.bearing.map((v) =>
    v !== null ? v.toFixed(0).padStart(3, '0') : '---'
  ).withLifecycle(this.defaultLifecycle);

  private distDisp = MappedSubject.create(
    ([dist, unit]) => dist === null ?
      '---' : FormatUtils.showTenthsUnderOneHundred(UnitType.NMILE.convertTo(dist, unit)),
    this.store.distance,
    this.unitsSettingManager.distanceUnitsLarge,
  ).withLifecycle(this.defaultLifecycle);

  private readonly distanceUnits = this.unitsSettingManager.distanceUnitsLarge
    .map(UnitFormatter.unitLabel<UnitFamily.Distance>)
    .withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public override render(): VNode {
    return (
      <div class='direct-to-dialog'>
        {/* The transform (+CSS) provides the transition effect for the dialog to slide onto the screen. */}
        <div
          class='details'
          style={{ 'transform': this.dialogHidden.map((v) => v ? 'translate3d(300px, 0px, 0px)' : 'translate3d(0px, 0px, 0px)') }}
        >
          <div class='details-section'>
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
            <div class='details-location-texts'>
              <div>{this.store.name}</div>
              <div>{this.store.type}</div>
              <div>{this.store.location}</div>
              <div>{this.store.towerText}</div>
            </div>
            <div>
              Brg: <span class="details-white-text">{this.brgDisp}°</span>
              &nbsp;
              Dist: <span class="details-white-text">{this.distDisp}</span><span class="details-unit-text">{this.distanceUnits}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.textInputFieldContainerRef.getOrDefault()?.removeEventListener('click', this.onTextInputClicked);
    this.staticIdentFieldRef.getOrDefault()?.removeEventListener('click', this.onTextInputClicked);

    super.destroy();
  }
}

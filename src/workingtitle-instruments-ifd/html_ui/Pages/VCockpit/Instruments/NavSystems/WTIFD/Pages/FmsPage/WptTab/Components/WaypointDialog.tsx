import {
  ComponentProps, DebounceTimer, EventBus, FacilitySearchType, FSComponent, ICAO, IcaoValue, LatLongInterface, LifecycleComponent, MutableSubscribable,
  NodeReference, Subject, UserFacilityType, UserFacilityUtils, VNode
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { Fms } from '../../../../Fms';
import { IfdOptions } from '../../../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../../Keyboard/KeyboardTypes';
import { LineSelectKeyButtonType } from '../../../../LineSelectKeyButtons';
import { Lsk234State } from '../../../../LineSelectKeyButtons/LskState';
import { IfdFacilityUtils } from '../../../../Navigation/IfdFacilityUtils';
import { FormatUtils } from '../../../../Utilities/FormatUtils';
import { ParserUtils } from '../../../../Utilities/ParserUtils';
import { CharInput, CharInputSlot } from '../../FplTab/Components/CharInput';
import { WaypointListData } from '../WptTabTypes';

import './WaypointDialog.css';

/** Props for the direct to dialog. */
export interface WaypointDialogProps extends ComponentProps {
  /** The instrument event bus. */
  readonly bus: EventBus;
  /** The FMS. */
  readonly fms: Fms;
  /** The LSK state */
  lskState: Lsk234State;
  /** The function to run on closing this dialog */
  onClose: () => void;
  /** The instrument configuration for the IFD. */
  readonly ifdOptions: IfdOptions;
}

/** Data for a field contained on the waypoint dialog page */
interface WaypointDialogFieldData {
  /** The name of the field */
  name: WaypointFieldNames;
  /** A reference to the field */
  ref: NodeReference<CharInput>;
  /** A reference to the field container */
  containerRef: NodeReference<HTMLDivElement>;
  /** The mouse event listener for the field */
  listener: (field: WaypointDialogFieldData) => void;
  /** A subject containing the input of this field */
  input: MutableSubscribable<string>;
  /** The default input value */
  defaultInput: string;
  /** Whether to erase all characters to the right */
  eraseRightCharsOnEdit: boolean;
  /** The characters that are allowed for input. Defaults to the CharInputSlot default set. */
  allowedCharacters?: string[];
}

/** The formats that can be used for selecting the waypoint location */
type WaypointDialogFormats = 'Lat/Lon' | 'Rad/Dis' | 'Rad/Rad'

/** The names used to identify the waypoint fields. */
type WaypointFieldNames = 'ident' | 'name' | 'latLon' | 'fix1' | 'fix2' | 'rad1' | 'rad2' | 'dis1'

/** The direct to dialog. */
export class WaypointDialog extends LifecycleComponent<WaypointDialogProps> {
  private static readonly NUMBER_INPUTS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  private static readonly LAT_LON_INPUTS = [
    ['N', 'S'], WaypointDialog.NUMBER_INPUTS, WaypointDialog.NUMBER_INPUTS, ['°'], WaypointDialog.NUMBER_INPUTS, WaypointDialog.NUMBER_INPUTS, ['\''], WaypointDialog.NUMBER_INPUTS, WaypointDialog.NUMBER_INPUTS, ['"'],
    [' '],
    ['E', 'W'], WaypointDialog.NUMBER_INPUTS, WaypointDialog.NUMBER_INPUTS, WaypointDialog.NUMBER_INPUTS, ['°'], WaypointDialog.NUMBER_INPUTS, WaypointDialog.NUMBER_INPUTS, ['\''], WaypointDialog.NUMBER_INPUTS, WaypointDialog.NUMBER_INPUTS, ['"']
  ];

  private static readonly FORMAT_TYPES: WaypointDialogFormats[] = ['Lat/Lon', 'Rad/Dis', 'Rad/Rad'];

  private readonly fields: Record<WaypointFieldNames, WaypointDialogFieldData> = {
    ident: this.createFieldData('ident', undefined, undefined, CharInputSlot.IDENT_CHARS),
    name: this.createFieldData('name', undefined, undefined, CharInputSlot.WAYPOINT_NAME_CHARS),
    latLon: this.createFieldData('latLon', 'N00°00\'00" W000°00\'00"', false),
    fix1: this.createFieldData('fix1'),
    rad1: this.createFieldData('rad1', undefined, undefined, WaypointDialog.NUMBER_INPUTS),
    dis1: this.createFieldData('dis1', undefined, undefined, WaypointDialog.NUMBER_INPUTS),
    fix2: this.createFieldData('fix2'),
    rad2: this.createFieldData('rad2', undefined, undefined, WaypointDialog.NUMBER_INPUTS),
  };

  /**
   * Creates the boilerplate data used for an input field
   * @param name The name of the field.
   * @param defaultInput The default input to use.
   * @param eraseRightCharsOnEdit Whether to erase characters on the right when editing.
   * @param allowedCharacters The characters that are allowed for input. Defaults to the CharInputSlot default set.
   * @returns Boilerplate data for an input field
   */
  private createFieldData(name: WaypointFieldNames, defaultInput = '', eraseRightCharsOnEdit = false, allowedCharacters?: string[]): WaypointDialogFieldData {
    const ref = FSComponent.createRef<CharInput>();
    const containerRef = FSComponent.createRef<HTMLDivElement>();
    const input = Subject.create(defaultInput);

    const listener = (field: WaypointDialogFieldData): void => {
      const textInputField = ref.getOrDefault();
      if (!this.isVisible() || !textInputField) {
        return;
      }

      if (this.selectedField) {
        this.selectedField.deactivateEditing();
        this.selectedField.refresh();
        this.selectedField = undefined;
      }

      this.selectedFieldData.set(field);

      if (!textInputField.getIsEditingActive().get()) {
        textInputField.activateEditing(true);
        this.selectedField = textInputField;
      }

      this.openKeyboard(field !== this.fields.fix1 && field !== this.fields.fix2);
    };

    return { name, ref, containerRef, listener, input, defaultInput, eraseRightCharsOnEdit, allowedCharacters };
  }

  private readonly dialogHidden = Subject.create(true);

  private selectedFormat = Subject.create<WaypointDialogFormats>(WaypointDialog.FORMAT_TYPES[0]);
  private selectedField?: CharInput;
  private selectedFieldData = Subject.create<WaypointDialogFieldData | undefined>(undefined);

  private readonly fix1Facility = Subject.create<IcaoValue | false | undefined>(undefined); // If set to false, the input is invalid. If set to undefined there is no input.
  private readonly fix2Facility = Subject.create<IcaoValue | false | undefined>(undefined); // If set to false, the input is invalid. If set to undefined there is no input.

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    for (const field of Object.values(this.fields)) {
      field.containerRef.getOrDefault()?.addEventListener('click', () => field.listener(field));

      field.ref.getOrDefault()?.setValue(field.defaultInput);
    }

    this.handleFixInput(this.fields.fix1.input, this.fix1Facility);
    this.handleFixInput(this.fields.fix2.input, this.fix2Facility);
  }

  /**
   * Sets the LSK state for this dialog
   */
  private setLskState(): void {
    this.props.lskState.lsk2.label.set('Format');
    this.props.lskState.lsk2.value.set(this.selectedFormat.get());
    this.props.lskState.lsk3.label.set('Enter');
    this.props.lskState.lsk4.label.set('Cancel');
    this.props.lskState.lsk2.type.set(LineSelectKeyButtonType.State);
    this.props.lskState.lsk3.type.set(LineSelectKeyButtonType.Action);
    this.props.lskState.lsk4.type.set(LineSelectKeyButtonType.Action);
    this.props.lskState.lsk2.isVisible.set(true);
    this.props.lskState.lsk3.isVisible.set(true);
    this.props.lskState.lsk4.isVisible.set(true);

    this.props.lskState.lsk2.onClick.set(() => {
      const index = WaypointDialog.FORMAT_TYPES.indexOf(this.selectedFormat.get());
      const newIndex = index === WaypointDialog.FORMAT_TYPES.length - 1 ? 0 : index + 1;
      this.selectedFormat.set(WaypointDialog.FORMAT_TYPES[newIndex]);
      this.props.lskState.lsk2.value.set(WaypointDialog.FORMAT_TYPES[newIndex]);
      if (this.selectedFieldData.get() !== this.fields.ident && this.selectedFieldData.get() !== this.fields.name) {
        this.selectFirstCoordinateInputField();
      }
    });
    this.props.lskState.lsk3.onClick.set(() => {
      this.createWaypoint();
      this.close();
    });
    this.props.lskState.lsk4.onClick.set(() => this.close());
  }

  /**
   * Handles input to a fix field, detecting if the facility is valid.
   * @param input The fix that has been input
   * @param facSubject The facility subject to use
   */
  private handleFixInput(input: MutableSubscribable<string>, facSubject: MutableSubscribable<IcaoValue | false | undefined>): void {
    const inputDebounce = new DebounceTimer();

    input.sub((v) => {
      if (v.length < 2) {
        facSubject.set(undefined);
      } else {
        inputDebounce.schedule(async () => {
          const facs = await this.props.fms.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.All, v, 10);
          const matchingFac = facs.find((icao) => icao.ident === v.toUpperCase());

          facSubject.set(matchingFac ?? false);
        }, 800);
      }
    });
  }

  /** Creates the user waypoint. */
  private async createWaypoint(): Promise<void> {
    const name = this.fields.name.input.get().trim();
    const ident = this.fields.ident.input.get();
    const icao = ICAO.value('U', '', IfdFacilityUtils.USER_FACILITY_SCOPE, ident.length === 0 ? this.props.fms.getDefaultUserFacName() : ident);

    switch (this.selectedFormat.get()) {
      case 'Lat/Lon': {
        const latLon = ParserUtils.parseLatLong(this.fields.latLon.input.get());
        const fac = UserFacilityUtils.createFromLatLon(icao, latLon.lat, latLon.long, false, name);

        this.props.fms.addUserFacility(fac);
        break;
      }
      case 'Rad/Dis': {
        const refFacIcao = this.fix1Facility.get();
        const radial = Number(this.fields.rad1.input.get());
        const dist = Number(this.fields.dis1.input.get());

        if (refFacIcao && isFinite(radial) && isFinite(dist)) {
          const refFac1 = await this.props.fms.facLoader.getFacility(ICAO.getFacilityTypeFromValue(refFacIcao), refFacIcao);

          const fac = UserFacilityUtils.createFromRadialDistance(icao, refFac1, radial, dist, false, name);
          this.props.fms.addUserFacility(fac);
        }
        break;
      }
      case 'Rad/Rad': {
        const refFac1Icao = this.fix1Facility.get();
        const refFac2Icao = this.fix2Facility.get();
        const rad1 = Number(this.fields.rad1.input.get());
        const rad2 = Number(this.fields.rad2.input.get());

        if (refFac1Icao && refFac2Icao && isFinite(rad1) && isFinite(rad2)) {
          const refFac1 = await this.props.fms.facLoader.getFacility(ICAO.getFacilityTypeFromValue(refFac1Icao), refFac1Icao);
          const refFac2 = await this.props.fms.facLoader.getFacility(ICAO.getFacilityTypeFromValue(refFac2Icao), refFac2Icao);

          const fac = UserFacilityUtils.createFromRadialRadial(icao, refFac1, rad1, refFac2, rad2, false, name);
          fac && this.props.fms.addUserFacility(fac);
        }
        break;
      }
    }
  }

  /**
   * Indicates whether the dialog is currently visible.
   * @returns True when the dialog is visible; otherwise false.
   */
  public isVisible(): boolean {
    return !this.dialogHidden.get();
  }

  /**
   * Handles interaction events while the dialog is visible.
   * @param event The knob event to handle.
   * @returns True if this dialog consumed the event; otherwise false.
   */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    let handled = true;

    if (event === IfdInteractionEvent.RightKnobPush) {
      // Handle right knob push
      if (this.selectedField && this.selectedFieldData.get()) {
        // If a field is already selected, toggle editing state
        if (this.selectedField.getIsEditingActive().get()) {
          this.onEnterPressed();
        } else {
          this.selectedField.activateEditing(true);
        }
      } else {
        // No field selected - enable cursor by selecting the first visible field
        this.selectFirstAvailableField();
      }
    } else {
      const isEditingActive = this.selectedField?.getIsEditingActive().get();
      switch (event) {
        case IfdInteractionEvent.RightKnobOuterInc:
          if (this.selectedField && isEditingActive) {
            this.selectedField.moveCursor(1, true);
          } else {
            this.selectNextField();
          }
          break;
        case IfdInteractionEvent.RightKnobOuterDec:
          if (this.selectedField && isEditingActive) {
            this.selectedField.moveCursor(-1, true);
          } else {
            this.selectPreviousField();
          }
          break;
        case IfdInteractionEvent.RightKnobInnerDec:
          if (this.selectedField && isEditingActive) {
            this.selectedField.changeSlotValue(-1, this.selectedFieldData.get()?.eraseRightCharsOnEdit);
          } else {
            this.selectNextField();
          }
          break;
        case IfdInteractionEvent.RightKnobInnerInc:
          if (this.selectedField && isEditingActive) {
            this.selectedField.changeSlotValue(1, this.selectedFieldData.get()?.eraseRightCharsOnEdit);
          } else {
            this.selectPreviousField();
          }
          break;
        case IfdInteractionEvent.ENTR:
          this.onEnterPressed();
          break;
        case IfdInteractionEvent.CLR:
          if (this.selectedField && isEditingActive) {
            this.selectedField.backspace();
          } else {
            this.close();
          }
          break;
        default:
          handled = false;
      }
    }

    return handled;
  }

  /**
   * Selects the first available field based on the current format.
   */
  private selectFirstAvailableField(): void {
    // Start with ident field (always visible)
    const fieldToSelect = this.fields.ident;

    // Select the field
    const textInputField = fieldToSelect.ref.getOrDefault();
    if (textInputField) {
      this.selectedField = textInputField;
      this.selectedFieldData.set(fieldToSelect);
    }
  }


  /** Selects the first coordinate input field based on the current format. */
  private selectFirstCoordinateInputField(): void {
    let fieldToSelect: WaypointDialogFieldData;
    switch (this.selectedFormat.get()) {
      case 'Lat/Lon':
        fieldToSelect = this.fields.latLon;
        break;
      case 'Rad/Dis':
      case 'Rad/Rad':
        fieldToSelect = this.fields.fix1;
        break;
    }

    // Select the field
    const textInputField = fieldToSelect.ref.getOrDefault();
    if (textInputField) {
      this.selectedField = textInputField;
      this.selectedFieldData.set(fieldToSelect);
    }
  }

  /** Selects the next field based on the current format. */
  private selectNextField(): void {
    const selectedFieldData = this.selectedFieldData.get();
    if (selectedFieldData === undefined) {
      this.selectedFieldData.set(this.fields.ident);
      this.selectedField = this.fields.ident.ref.instance;
      return;
    } else if (selectedFieldData === this.fields.ident) {
      this.selectedFieldData.set(this.fields.name);
      this.selectedField = this.fields.name.ref.instance;
      return;
    }
    switch (this.selectedFormat.get()) {
      case 'Lat/Lon':
        if (this.selectedFieldData.get() === this.fields.name) {
          this.selectedFieldData.set(this.fields.latLon);
          this.selectedField = this.fields.latLon.ref.instance;
        }
        break;
      case 'Rad/Dis':
        if (this.selectedFieldData.get() === this.fields.name) {
          this.selectedFieldData.set(this.fields.fix1);
          this.selectedField = this.fields.fix1.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.fix1) {
          this.selectedFieldData.set(this.fields.rad1);
          this.selectedField = this.fields.rad1.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.rad1) {
          this.selectedFieldData.set(this.fields.dis1);
          this.selectedField = this.fields.dis1.ref.instance;
        }
        break;
      case 'Rad/Rad':
        if (this.selectedFieldData.get() === this.fields.name) {
          this.selectedFieldData.set(this.fields.fix1);
          this.selectedField = this.fields.fix1.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.fix1) {
          this.selectedFieldData.set(this.fields.rad1);
          this.selectedField = this.fields.rad1.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.rad1) {
          this.selectedFieldData.set(this.fields.fix2);
          this.selectedField = this.fields.fix2.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.fix2) {
          this.selectedFieldData.set(this.fields.rad2);
          this.selectedField = this.fields.rad2.ref.instance;
        }
        break;
    }
  }

  /** Selects the previous field based on the current format. */
  private selectPreviousField(): void {
    if (this.selectedFieldData.get() === this.fields.name) {
      this.selectedFieldData.set(this.fields.ident);
      this.selectedField = this.fields.ident.ref.instance;
      return;
    }
    switch (this.selectedFormat.get()) {
      case 'Lat/Lon':
        if (this.selectedFieldData.get() === this.fields.latLon) {
          this.selectedFieldData.set(this.fields.name);
          this.selectedField = this.fields.name.ref.instance;
        }
        break;
      case 'Rad/Dis':
        if (this.selectedFieldData.get() === this.fields.fix1) {
          this.selectedFieldData.set(this.fields.name);
          this.selectedField = this.fields.name.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.rad1) {
          this.selectedFieldData.set(this.fields.fix1);
          this.selectedField = this.fields.fix1.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.dis1) {
          this.selectedFieldData.set(this.fields.rad1);
          this.selectedField = this.fields.rad1.ref.instance;
        }
        break;
      case 'Rad/Rad':
        if (this.selectedFieldData.get() === this.fields.fix1) {
          this.selectedFieldData.set(this.fields.name);
          this.selectedField = this.fields.name.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.rad1) {
          this.selectedFieldData.set(this.fields.fix1);
          this.selectedField = this.fields.fix1.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.fix2) {
          this.selectedFieldData.set(this.fields.rad1);
          this.selectedField = this.fields.rad1.ref.instance;
        } else if (this.selectedFieldData.get() === this.fields.rad2) {
          this.selectedFieldData.set(this.fields.fix2);
          this.selectedField = this.fields.fix2.ref.instance;
        }
        break;
    }
  }

  /** Handles press of ENTR button from KB or bezel. */
  public onEnterPressed(): void {
    if (this.selectedField && this.selectedField.getIsEditingActive().get()) {
      this.selectedField.deactivateEditing();
      this.selectedField.refresh();
    } else {
      this.createWaypoint();
      this.close();
    }
  }

  /**
   * Opens this dialog to create a new waypoint.
   * @param ppos The present position of the aircraft, if available
   */
  public openNewWaypointDialog(ppos?: LatLongInterface): void {
    for (const field of Object.values(this.fields)) {
      field.ref.getOrDefault()?.setValue(field.defaultInput);
    }

    if (ppos && !isNaN(ppos.lat) && !isNaN(ppos.long)) {
      const pposInput = FormatUtils.formatLatLon(ppos.lat, ppos.long);
      this.fields.latLon.input.set(pposInput);
      this.fields.latLon.ref.getOrDefault()?.setValue(pposInput);
    }

    const defaultIdent = this.props.fms.getDefaultUserFacName();
    this.fields.ident.input.set(defaultIdent);
    this.fields.ident.ref.getOrDefault()?.setValue(defaultIdent);

    this.dialogHidden.set(false);
    this.setLskState();

    this.selectFirstAvailableField();
  }

  /**
   * Opens this dialog to edit an existing waypoint.
   * @param data The data of the waypoint to edit
   */
  public openEditWaypointDialog(data: WaypointListData): void {
    let posInput = '';
    let fix1Input = '';
    let dis1Input = '';
    let rad1Input = '';
    let fix2Input = '';
    let rad2Input = '';

    switch (data.facility.userFacilityType) {
      case UserFacilityType.LAT_LONG:
        this.selectedFormat.set('Lat/Lon');
        posInput = FormatUtils.formatLatLon(data.facility.lat, data.facility.lon);
        break;
      case UserFacilityType.RADIAL_DISTANCE:
        this.selectedFormat.set('Rad/Dis');
        fix1Input = data.facility.reference1IcaoStruct?.ident ?? '';
        rad1Input = data.facility.reference1Radial?.toFixed() ?? '';
        dis1Input = data.facility.reference1Distance?.toFixed() ?? '';
        break;
      case UserFacilityType.RADIAL_RADIAL:
        this.selectedFormat.set('Rad/Rad');
        fix1Input = data.facility.reference1IcaoStruct?.ident ?? '';
        fix2Input = data.facility.reference2IcaoStruct?.ident ?? '';
        rad1Input = data.facility.reference1Radial?.toFixed() ?? '';
        rad2Input = data.facility.reference2Radial?.toFixed() ?? '';
    }

    this.fields.ident.input.set(data.facility.icaoStruct.ident);
    this.fields.ident.ref.getOrDefault()?.setValue(data.facility.icaoStruct.ident);
    this.fields.name.input.set(data.facility.name);
    this.fields.name.ref.getOrDefault()?.setValue(data.facility.name);
    this.fields.latLon.input.set(posInput);
    this.fields.latLon.ref.getOrDefault()?.setValue(posInput);
    this.fields.fix1.input.set(fix1Input);
    this.fields.fix1.ref.getOrDefault()?.setValue(fix1Input);
    this.fields.dis1.input.set(dis1Input);
    this.fields.dis1.ref.getOrDefault()?.setValue(dis1Input);
    this.fields.rad1.input.set(rad1Input);
    this.fields.rad1.ref.getOrDefault()?.setValue(rad1Input);
    this.fields.fix2.input.set(fix2Input);
    this.fields.fix2.ref.getOrDefault()?.setValue(fix2Input);
    this.fields.rad2.input.set(rad2Input);
    this.fields.rad2.ref.getOrDefault()?.setValue(rad2Input);

    this.dialogHidden.set(false);
    this.setLskState();

    this.selectFirstCoordinateInputField();
  }

  /**
   * Closes this dialog
   */
  public close(): void {
    this.dialogHidden.set(true);

    this.props.onClose();
  }

  /**
   * Opens the shared IFD text keyboard to edit the selected field.
   * On close, resolves the entered ident through the controller.
   * @param disableFacilitySearch Whether to disable the facility search mode in the keyboard.
   */
  private openKeyboard(disableFacilitySearch: boolean = true): void {
    const publisher = this.props.bus.getPublisher<IfdKeyboardControlEvents>();

    if (!this.selectedField || !this.selectedFieldData) {
      return;
    }

    const selectedFieldData = this.selectedFieldData.get();

    const isLatLonField = selectedFieldData === this.fields.latLon;
    const isNumericField =
      selectedFieldData === this.fields.rad1
      || selectedFieldData === this.fields.dis1
      || selectedFieldData === this.fields.rad2;

    const initialValue = selectedFieldData?.input.get() ?? '';

    /**
     * Applies a new value to the CharInput, the backing Subject, and the underlying
     * DOM input rendered by {@link CharInput}.
     *
     * @param value The value to apply.
     */
    const applyValue = (value: string): void => {
      const v = value ?? '';
      this.selectedField?.setValue(v);
      this.selectedFieldData.get()?.input.set(v);
      this.selectedFieldData.get()?.ref.getOrDefault()?.setValue(v);
    };

    const keyboardInputType = isLatLonField ? KeyboardInputType.LatLon : KeyboardInputType.FreeText;
    const initialShowNumpad = !isLatLonField && isNumericField;

    let committed = false;

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType,
      disableModeSwitch: false,
      disableFacilitySearch,
      initialShowNumpad,
      initialValue,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      maxLength: this.selectedFieldData.get() === this.fields.ident ? 6 : 20,
      allowedCharacters: this.selectedFieldData.get()?.allowedCharacters,

      /**
       * Called whenever the keyboard reports that its current value has changed.
       * For {@link KeyboardInputType.LatLon}, this value is already the full,
       * masked lat/lon string produced by {@link LatLonField}. For other types it
       * is the free text value from the scratchpad.
       *
       * @param value The current keyboard value.
       */
      onValueChanged: (value: string): void => {
        // Keyboard owns validation/masking; we only mirror and normalize case.
        const v = (value ?? '').toUpperCase();
        applyValue(v);
      },

      /**
       * Called when the user presses the keyboard ENTR/Enter key. Commits the
       * current keyboard value into this dialog's field and deactivates editing.
       *
       * @param value The keyboard value at the time Enter was pressed.
       */
      onEnter: (value: string): void => {
        committed = true;
        const v = (value ?? '').toUpperCase();
        applyValue(v);

        if (this.selectedField?.getIsEditingActive().get()) {
          this.selectedField.deactivateEditing();
        }
      },

      /**
       * Called when the keyboard close (X) button is pressed. If Enter was not
       * previously pressed, the field is reverted to its initial value.
       */
      onClose: (): void => {
        if (!committed) {
          applyValue(initialValue);
        }

        if (this.selectedField?.getIsEditingActive().get()) {
          this.selectedField.deactivateEditing();
        }
      },

      rowRef: null
    };

    publisher.pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /**
   * Renders a field based on a function that defines the possible character slots.
   * @param fieldData The data of the field
   * @param containerClass The class to assign the container
   * @param charSlotFunc The function to use for rendering char slots. If not defined then this will default to
   */
  private renderField(fieldData: WaypointDialogFieldData, containerClass: string, charSlotFunc: () => VNode): VNode;
  /**
   * Renders a field with a given number of character slots that accept the same array of characters.
   * @param fieldData The data of the field
   * @param containerClass The class to assign the container
   * @param charSlotLength The number of character slots to create
   */
  private renderField(fieldData: WaypointDialogFieldData, containerClass: string, charSlotLength: number): VNode;
  /**
   * Renders a field.
   * @param fieldData The data of the field
   * @param containerClass The class to assign the container
   * @param arg3 The function that defines the character slots created, or the number of character slots created.
   * @returns A field
   */
  private renderField(fieldData: WaypointDialogFieldData, containerClass: string, arg3: (() => VNode) | number): VNode {
    const hasCharSlotFunction = typeof arg3 === 'function';
    const charSlotLength = !hasCharSlotFunction ? arg3 : 0;

    return (
      <div class={{ 'new-waypoint-info-container': true, [containerClass]: true, selected: this.selectedFieldData.map(v => v === fieldData) }} ref={fieldData.containerRef} >
        <CharInput
          ref={fieldData.ref}
          value={fieldData.input}
          renderInactiveValue={(v) => v}
        >
          {hasCharSlotFunction ? arg3() : Array.from({ length: charSlotLength }).map(() => <CharInputSlot
            defaultCharValue={''}
            charArray={fieldData.allowedCharacters}
            wrap
          />)}
        </CharInput>
      </div>
    );
  }

  /** @inheritdoc */
  public override render(): VNode {
    return (
      <div class={{ 'new-waypoint-dialog-background': true, 'hidden': this.dialogHidden }}>
        <div
          class='new-waypoint-dialog'
          style={{ 'transform': this.dialogHidden.map((v) => v ? 'translate3d(460px, 0px, 0px)' : 'translate3d(0px, 0px, 0px)') }}
        >
          <div class='new-waypoint-dialog-content'>
            {this.renderField(this.fields.ident, 'ident', 5)}
            <p class='new-waypoint-field-title'>Name</p>
            {this.renderField(this.fields.name, 'name', 20)}

            <div class='new-waypoint-loc-container'>
              <div class={{ 'hidden': this.selectedFormat.map((v) => v !== 'Lat/Lon') }}>
                <p class='new-waypoint-field-title'>Latitude / Longitude</p>
                {this.renderField(this.fields.latLon, 'lat', (): VNode => {
                  return <>
                    {WaypointDialog.LAT_LON_INPUTS.map((allowedChars): VNode => <CharInputSlot
                      defaultCharValue={allowedChars[0]}
                      charArray={allowedChars}
                      wrap
                    />)}
                  </>;
                }
                )}
              </div>
              <div class={{ 'hidden': this.selectedFormat.map((v) => v !== 'Rad/Dis' && v !== 'Rad/Rad'), 'wpt-input-invalid': this.fix1Facility.map((v) => v === false).withLifecycle(this.defaultLifecycle) }}>
                <p class='new-waypoint-field-title'>Fix</p>
                {this.renderField(this.fields.fix1, 'fix', 5)}
              </div>
              <div class={{ 'hidden': this.selectedFormat.map((v) => v !== 'Rad/Dis' && v !== 'Rad/Rad') }}>
                <p class='new-waypoint-field-title'>Radial</p>
                {this.renderField(this.fields.rad1, 'rad', 3)}
              </div>

              <div class={{ 'hidden': this.selectedFormat.map((v) => v !== 'Rad/Dis') }}>
                <p class='new-waypoint-field-title'>Distance</p>
                {this.renderField(this.fields.dis1, 'dist', 3)}
              </div>

              <div class={{ 'hidden': this.selectedFormat.map((v) => v !== 'Rad/Rad'), 'wpt-input-invalid': this.fix2Facility.map((v) => v === false).withLifecycle(this.defaultLifecycle) }}>
                <p class='new-waypoint-field-title'>Fix</p>
                {this.renderField(this.fields.fix2, 'fix', 5)}
              </div>
              <div class={{ 'hidden': this.selectedFormat.map((v) => v !== 'Rad/Rad') }}>
                <p class='new-waypoint-field-title'>Radial</p>
                {this.renderField(this.fields.rad2, 'rad', 3)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    for (const field of Object.values(this.fields)) {
      field.containerRef.getOrDefault()?.removeEventListener('click', () => field.listener(field));
    }
  }
}

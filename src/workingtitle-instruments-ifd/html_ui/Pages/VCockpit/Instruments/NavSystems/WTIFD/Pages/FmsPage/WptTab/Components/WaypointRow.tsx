import {
  ComponentProps, EventBus, FSComponent, ICAO, LifecycleComponent, Subject, Subscribable, UnitFamily, UnitType, UserFacilityType, VNode
} from '@microsoft/msfs-sdk';

import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../Components/List/IfdListItemComponent';
import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { Fms } from '../../../../Fms';
import { IfdOptions } from '../../../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, TextEditRowKeyboardEvent, VirtualKeyboardType } from '../../../../Keyboard/KeyboardTypes';
import { IfdInteractionEventHandler } from '../../../../RightKnob';
import { UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { FormatUtils } from '../../../../Utilities/FormatUtils';
import { IfdViewService } from '../../../../ViewService';
import { CharInputSlot } from '../../FplTab/Components/CharInput';
import { WaypointListData } from '../WptTabTypes';

import './WaypointRow.css';

/** The items that can be displayed in the waypoint row */
enum WaypointRowItem {
  None,
  Ident,
  Loc,
  Name,
}

/** The properties for the {@link WaypointRow} component. */
export interface WaypointRowProps extends IfdListItemComponentProps {
  /** The data for the row */
  readonly data: WaypointListData;
  /** The view service */
  readonly viewService: IfdViewService;
  /** Callback to open the edit waypoint dialog */
  readonly openEditDialog: (data: WaypointListData) => void;
  /** The event bus */
  readonly bus: EventBus;
  /** The FMS */
  readonly fms: Fms;
  /** The IFD options */
  readonly ifdOptions: IfdOptions;
}

/** The WaypointRow component. */
export class WaypointRow extends IfdListItemComponent<WaypointRowProps> {
  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.bus);

  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  private readonly selectedItem = Subject.create<WaypointRowItem>(WaypointRowItem.None);

  private readonly waypointIdentRef = FSComponent.createRef<WaypointInfo>();
  private readonly waypointLocRef = FSComponent.createRef<WaypointInfo>();
  private readonly waypointNameRef = FSComponent.createRef<WaypointInfo>();

  private readonly isRowSelected = Subject.create(false);

  private readonly radialDistance = this.unitsSettingManager.distanceUnitsLarge
    .map(unit => this.props.data.facility.reference1Distance === undefined ?
      '---' : UnitType.NMILE.convertTo(this.props.data.facility.reference1Distance, unit))
    .withLifecycle(this.defaultLifecycle);

  private readonly distanceUnits = this.unitsSettingManager.distanceUnitsLarge
    .map(UnitFormatter.unitLabel<UnitFamily.Distance>)
    .withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public async onAfterRender(node: VNode): Promise<void> {
    super.onAfterRender(node);
    this.ref.instance.addEventListener('click', this.onClick.bind(this));
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (this.selectedItem.get()) {
      case WaypointRowItem.Ident:
        if (this.waypointIdentRef.instance.onInteractionEvent(event)) {
          return true;
        }
        break;
      case WaypointRowItem.Loc:
        if (this.waypointLocRef.instance.onInteractionEvent(event)) {
          return true;
        }
        break;
      case WaypointRowItem.Name:
        if (this.waypointNameRef.instance.onInteractionEvent(event)) {
          return true;
        }
        break;
    }

    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        this.props.openEditDialog(this.props.data);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        return this.incrementSelectedItem(-1);
      case IfdInteractionEvent.RightKnobInnerInc:
        return this.incrementSelectedItem(1);
    }

    return false;
  }

  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    super.onFocus(event);

    this.isRowSelected.set(true);
    if (event === 'click') {
      this.selectedItem.set(WaypointRowItem.Ident);
    }
  }

  /** @inheritdoc */
  public onBlur(): void {
    super.onBlur();

    this.isRowSelected.set(false);
  }

  /** Handles the click event on the component. */
  private onClick(): void {
    this.focus();
  }

  /**
   * Opens the keyboard for editing.
   * @param item The item to edit.
   */
  private openKeyboard(item: WaypointRowItem): void {
    const initialValue = item === WaypointRowItem.Ident
      ? this.props.data.facility.icaoStruct.ident
      : this.props.data.facility.name;

    let allowedCharacters: string[] | undefined;
    switch (item) {
      case WaypointRowItem.Ident:
        allowedCharacters = CharInputSlot.IDENT_CHARS;
        break;
      case WaypointRowItem.Name:
        allowedCharacters = CharInputSlot.WAYPOINT_NAME_CHARS;
        break;
      default:
    }

    const payload: TextEditRowKeyboardEvent = {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: KeyboardInputType.FreeText,
      disableFacilitySearch: true,
      disableModeSwitch: false,
      initialShowNumpad: false,
      initialValue: initialValue,
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      onEnter: (value: string) => {
        this.saveChanges(item, value);
      },
      rowRef: null,
      maxLength: item === WaypointRowItem.Ident ? 6 : 20,
      allowedCharacters,
    };

    this.props.bus.getPublisher<IfdKeyboardControlEvents>().pub('text_edit_row_keyboard_open', payload, true, false);
  }

  /**
   * Saves the changes to the facility.
   * @param item The item that was edited.
   * @param value The new value.
   */
  private saveChanges(item: WaypointRowItem, value: string): void {
    const facility = this.props.data.facility;
    if (item === WaypointRowItem.Ident) {
      const newIdent = value.trim().toUpperCase();
      if (newIdent === facility.icaoStruct.ident || !newIdent) {
        return;
      }

      const newIcao = ICAO.value(facility.icaoStruct.type, facility.region, facility.icaoStruct.airport, newIdent);
      const newFac = { ...facility, icaoStruct: newIcao, icao: ICAO.tryValueToStringV2(newIcao) };

      this.props.fms.removeUserFacility(facility);
      this.props.fms.addUserFacility(newFac);
    } else if (item === WaypointRowItem.Name) {
      const newName = value.trim();
      if (newName === facility.name) {
        return;
      }

      const newFac = { ...facility, name: newName };
      this.props.fms.addUserFacility(newFac);
    }
  }

  /**
   * Increments the selected item in the selected direction. If the item is already at the maximum, it does nothing.
   * @param direction The direction to increment the selected item. -1 to decrement, 1 to increment.
   * @returns true, if the selected item has landed on a valid option; or false, if the selected item has landed not on a valid option.
   */
  private incrementSelectedItem(direction: 1 | -1): boolean {
    const currentSelectedItem = this.selectedItem.get();
    if (direction === -1 && currentSelectedItem === WaypointRowItem.None || direction === 1 && currentSelectedItem === WaypointRowItem.Name) {
      return false;
    }

    this.selectedItem.set(currentSelectedItem + direction);
    return true;
  }

  /**
   * Sets the selected item to the specified value.
   * @param item The item to set as selected.
   */
  private setSelectedItem(item: WaypointRowItem): void {
    this.selectedItem.set(item);
  }

  /**
   * Gets the location string to display for this facility
   * @returns A string
   */
  private getLocationString(): string {
    switch (this.props.data.facility.userFacilityType) {
      case UserFacilityType.RADIAL_RADIAL:
        return `${this.props.data.facility.reference1IcaoStruct?.ident} ${this.props.data.facility.reference1Radial}° / ${this.props.data.facility.reference2IcaoStruct?.ident} ${this.props.data.facility.reference2Radial}°`;
      case UserFacilityType.RADIAL_DISTANCE:
        return `${this.props.data.facility.reference1IcaoStruct?.ident} ${this.props.data.facility.reference1Radial}° / ${this.radialDistance.get()}${this.distanceUnits.get()}`;
      case UserFacilityType.LAT_LONG:
        return FormatUtils.formatLatLon(this.props.data.facility.lat, this.props.data.facility.lon);
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'waypoint-row': true,
          'waypoint-row-selected': this._isSelected,
        }}
        ref={this.ref}
      >
        <div class='waypoint-top-row'>
          <WaypointInfo
            ref={this.waypointIdentRef}
            class="waypoint-ident"
            data={this.props.data.facility.icaoStruct.ident}
            callback={() => this.openKeyboard(WaypointRowItem.Ident)}
            isItemSelected={this.selectedItem.map(v => v === WaypointRowItem.Ident).withLifecycle(this.defaultLifecycle)}
            isRowSelected={this.isRowSelected}
            selectItem={() => this.setSelectedItem(WaypointRowItem.Ident)}
          />
          <WaypointInfo
            ref={this.waypointLocRef}
            class="waypoint-loc"
            data={this.getLocationString()}
            callback={() => this.props.openEditDialog(this.props.data)}
            isItemSelected={this.selectedItem.map(v => v === WaypointRowItem.Loc).withLifecycle(this.defaultLifecycle)}
            isRowSelected={this.isRowSelected}
            selectItem={() => this.setSelectedItem(WaypointRowItem.Loc)}
          />
        </div>
        <WaypointInfo
          ref={this.waypointNameRef}
          class="waypoint-name"
          data={Utils.Translate(this.props.data.facility.name)}
          callback={() => this.openKeyboard(WaypointRowItem.Name)}
          isItemSelected={this.selectedItem.map(v => v === WaypointRowItem.Name).withLifecycle(this.defaultLifecycle)}
          isRowSelected={this.isRowSelected}
          selectItem={() => this.setSelectedItem(WaypointRowItem.Name)}
        />
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.ref.instance.removeEventListener('click', this.onClick.bind(this));

    super.destroy();
  }
}

/** The properties for the {@link WaypointInfo} component. */
interface WaypointInfoProps extends ComponentProps {
  /** The data to display */
  data: string;
  /** The class to apply to the component */
  class: string;
  /** A callback to invoke when the component is interacted with */
  callback: () => void;
  /** Whether the component is selected */
  isItemSelected: Subscribable<boolean>;
  /** Whether the row is selected */
  isRowSelected: Subscribable<boolean>;
  /** A function to select the item */
  selectItem: () => void;
}

/** A component that displays a waypoint info field. */
class WaypointInfo extends LifecycleComponent<WaypointInfoProps> implements IfdInteractionEventHandler {
  private readonly ref = FSComponent.createRef<HTMLParagraphElement>();

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.ref.instance.addEventListener('click', this.onClick.bind(this));
  }

  /** @inheritDoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.props.isRowSelected.get() && this.props.isItemSelected.get()) {
      switch (event) {
        case IfdInteractionEvent.RightKnobPush:
          this.props.callback();
          return true;
      }
    }

    return false;
  }

  /**
   * Handles the click event on the component.
   * @param event The mouse event.
   */
  private onClick(event: MouseEvent): void {
    if (this.props.isRowSelected.get()) {
      event.stopPropagation();
      this.props.selectItem();
      this.props.callback();
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <p class={{ 'waypoint-info-item': true, [this.props.class]: true, selected: this.props.isItemSelected }} ref={this.ref}>
        {this.props.data}
      </p>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.ref.instance.removeEventListener('click', this.onClick.bind(this));

    super.destroy();
  }
}

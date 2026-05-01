import {
  ArraySubject, ConsumerSubject, EventBus, FacilityRepositoryEvents, FacilityType, FSComponent, ICAO, MappedSubject, Subject, Subscription, UserFacility,
  UserFacilityUtils, VNode
} from '@microsoft/msfs-sdk';

import { DynamicListData, IfdList } from '../../../Components/List';
import { TabContent, TabContentProps } from '../../../Components/Tabs/TabContent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { Fms } from '../../../Fms';
import { IfdOptions } from '../../../IfdOptions';
import { LineSelectKeyButtonType } from '../../../LineSelectKeyButtons';
import { IfdFacilityUtils } from '../../../Navigation/IfdFacilityUtils';
import { FmsPositionSystemEvents } from '../../../Systems/FmsPositionSystem';
import { WaypointDialog } from './Components/WaypointDialog';
import { WaypointRow } from './Components/WaypointRow';
import { WaypointListData } from './WptTabTypes';

import './WptTab.css';

/** The properties for the {@link WptTab} component. */
interface WptTabProps extends TabContentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;

  /** The FMS. */
  readonly fms: Fms;

  /** The instrument configuration for the IFD. */
  readonly ifdOptions: IfdOptions;
}

/** The WptTab component. */
export class WptTab extends TabContent<WptTabProps> {
  public readonly title: string = 'WPT';
  private readonly listRef = FSComponent.createRef<IfdList<DynamicListData>>();
  private readonly dialogRef = FSComponent.createRef<WaypointDialog>();

  private readonly ppos = ConsumerSubject.create(this.props.bus.getSubscriber<FmsPositionSystemEvents>().on('fms_pos_position_1').atFrequency(1 / 2), new LatLong(0, 0));

  private readonly data = ArraySubject.create<WaypointListData>([]);
  private readonly listIsEmpty = Subject.create(true);

  private activeDeleteIndex = Subject.create<number | null>(null);

  private lskStateSub: Subscription | undefined;

  /** @inheritdoc */
  public onAfterRender(): void {
    // TODO Context sensitive
    this._knobState.leftText.set('Scroll');
    this._knobState.rightText.set('Select');

    const facRepoSub = this.props.bus.getSubscriber<FacilityRepositoryEvents>();

    facRepoSub.on('facility_added').handle((facility) => ICAO.getFacilityTypeFromValue(facility.icaoStruct) === FacilityType.USR && this.insertItem(facility as UserFacility));
    facRepoSub.on('facility_changed').handle((facility) => ICAO.getFacilityTypeFromValue(facility.icaoStruct) === FacilityType.USR && this.updateItem(facility as UserFacility));
    facRepoSub.on('facility_removed').handle((facility) => ICAO.getFacilityTypeFromValue(facility.icaoStruct) === FacilityType.USR && this.removeItem(facility as UserFacility));

    for (const fac of this.props.fms.getUserFacilities()) {
      this.insertItem(fac.facility.get());
    }

    this.data.sub((_index, _type, _item, array) => {
      this.listIsEmpty.set(array.length === 0);
    }, true).withLifecycle(this.defaultLifecycle);

    this.lskStateSub = MappedSubject.create(
      this.listIsEmpty,
      this.activeDeleteIndex,
    ).sub(([listIsEmpty, activeDeleteIndex]) => {
      this._lskState.lsk2.isVisible.set(!activeDeleteIndex);
      this._lskState.lsk4.isVisible.set(activeDeleteIndex !== null || !listIsEmpty);
      if (activeDeleteIndex !== null) {
        this._lskState.lsk3.label.set('Enter');
        this._lskState.lsk4.label.set('Cancel');
        this._lskState.lsk3.onClick.set(() => {
          this.props.viewService.confirmPopupRef.instance.confirm();
        });
        this._lskState.lsk4.onClick.set(() => {
          this.props.viewService.confirmPopupRef.instance.reject();
        });
      } else {
        this._lskState.lsk3.label.set('PPOS');
        this._lskState.lsk4.label.set('Delete Waypoint');
        this._lskState.lsk3.onClick.set(() => {
          const latLon = this.ppos.get();
          const fac = UserFacilityUtils.createFromLatLon(ICAO.value('U', '', IfdFacilityUtils.USER_FACILITY_SCOPE, this.props.fms.getDefaultUserFacName()), latLon.lat, latLon.long);
          this.props.fms.addUserFacility(fac);
        });
        this._lskState.lsk4.onClick.set(() => {
          void this.confirmAndDeleteWpt();
        });
      }
    }, true);

    this.setLsks();
  }

  /**
   * Inserts an item into the list
   * @param facility The user facility to insert
   */
  private insertItem(facility: UserFacility): void {
    this.data.insert({
      heightPx: 55,
      facility: facility as UserFacility
    });
  }

  /**
   * Updates an item in the list
   * @param facility The user facility to update
   */
  private updateItem(facility: UserFacility): void {
    const currentItems = this.data.getArray();
    const itemIndex = currentItems.findIndex(v => ICAO.valueEquals(facility.icaoStruct, v.facility.icaoStruct));
    if (itemIndex >= 0) {
      const newItem = { ...currentItems[itemIndex], facility };
      this.data.removeAt(itemIndex);
      this.data.insert(newItem, itemIndex);
    }
  }

  /**
   * Removes an item into the list
   * @param facility The user facility to remove
   */
  private removeItem(facility: UserFacility): void {
    const currentItems = this.data.getArray();
    const item = currentItems.find(v => ICAO.valueEquals(facility.icaoStruct, v.facility.icaoStruct));
    item && this.data.removeItem(item);
  }

  /**
   * Opens the confirmation dialog and when confirmed, deletes the selected user waypoint
   */
  private async confirmAndDeleteWpt(): Promise<void> {
    const selectedIndex = this.listRef.instance.activeIndex.get();
    const activeDeleteIndex = this.activeDeleteIndex.get();
    if (selectedIndex >= 0) {
      if (activeDeleteIndex !== null && activeDeleteIndex !== selectedIndex) {
        this.props.viewService.confirmPopupRef.instance.reject();
      }
      const dataItem = this.data.get(selectedIndex);
      if (dataItem) {
        try {
          this.activeDeleteIndex.set(selectedIndex);
          await this.props.viewService.requestConfirmation(`Delete ${dataItem.facility.icaoStruct.ident}`, 'mint', 155, 200);
          this.removeItem(dataItem.facility);
          this.props.fms.removeUserFacility(dataItem.facility);
          this.activeDeleteIndex.set(null);
        } catch (e) {
          // User canceled the confirmation.
          if (this.activeDeleteIndex.get() === selectedIndex) {
            this.activeDeleteIndex.set(null);
          }
        }
      } else {
        this.activeDeleteIndex.set(null);
      }
    }
  }

  /** Sets the LSKs */
  private setLsks(): void {
    this._lskState.lsk2.label.set('New');
    this._lskState.lsk2.type.set(LineSelectKeyButtonType.Action);
    this._lskState.lsk3.type.set(LineSelectKeyButtonType.Action);
    this._lskState.lsk4.type.set(LineSelectKeyButtonType.Action);

    this._lskState.lsk3.isVisible.set(true);

    this._lskState.lsk2.value.set(undefined);

    this._lskState.lsk2.onClick.set(() => {
      this.lskStateSub?.pause();
      this.dialogRef.instance.openNewWaypointDialog(this.ppos.get());
    });

    this.lskStateSub?.resume(true);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.dialogRef.getOrDefault()?.isVisible()) {
      return this.dialogRef.instance.onInteractionEvent(event);
    }

    return this.listRef.getOrDefault()?.onInteractionEvent(event) ?? false;
  }

  /** @inheritDoc */
  public pause(): void {
    super.pause();
    this.lskStateSub?.pause();
  }

  /** @inheritDoc */
  public resume(): void {
    super.resume();
    this.lskStateSub?.resume(true);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="ifd-wpt-tab">
        <IfdList
          bus={this.props.bus}
          listItemSpacingPx={5}
          heightPx={440}
          ref={this.listRef}
          data={this.data}
          renderItem={
            (data, _index, focusFunc) => {
              return (
                <WaypointRow
                  data={data}
                  focus={focusFunc}
                  viewService={this.viewService}
                  openEditDialog={(wptData): void => this.dialogRef.instance.openEditWaypointDialog(wptData)}
                  bus={this.props.bus}
                  fms={this.props.fms}
                  ifdOptions={this.props.ifdOptions}
                />
              );
            }
          }
        />
        <div class={{ 'ifd-wpt-tab-no-wpt': true, 'hidden': this.listIsEmpty.map(v => !v).withLifecycle(this.defaultLifecycle) }}>
          No user waypoints defined
        </div>
        <WaypointDialog
          ref={this.dialogRef}
          onClose={() => this.setLsks()}
          bus={this.props.bus}
          fms={this.props.fms}
          lskState={this._lskState}
          ifdOptions={this.props.ifdOptions}
        />
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.lskStateSub?.destroy();
    super.destroy();
  }
}

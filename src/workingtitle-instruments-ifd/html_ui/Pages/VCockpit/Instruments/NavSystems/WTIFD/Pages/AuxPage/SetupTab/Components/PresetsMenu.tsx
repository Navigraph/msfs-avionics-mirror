import { ArraySubject, ComponentProps, EventBus, FSComponent, LifecycleComponent, Subject, Subscribable, SubscribableUtils, VNode } from '@microsoft/msfs-sdk';

import { IfdList } from '../../../../Components/List';
import { IfdMapPresetService } from '../../../../Components/Map/IfdMapPresetService';
import { DatablockPresetType } from '../../../../Datablocks/DatablockPresets';
import { DatablockService } from '../../../../Datablocks/DatablocksService';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdOptions } from '../../../../IfdOptions';
import { DatablockUserSettings } from '../../../../Settings/DatablockUserSettings';
import { MapPresetType } from '../../../../Settings/MapUserSettings';
import { IfdViewService } from '../../../../ViewService';
import { ButtonRow } from './Rows/ButtonRow';
import { CollapsibleRow } from './Rows/CollapsibleRow';
import { SetupMenu } from './SetupMenu';
import { SetupMenuRowListItemData, SetupMenuRowListItems } from './SetupMenuTypes';

import './PresetsMenu.css';

/** Props for the {@link PresetsMenu} component. */
interface PresetsMenuProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** An instance of the datablock service. */
  readonly datablockService: DatablockService;
  /** The map preset service. */
  readonly mapPresetService: IfdMapPresetService;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
  /** The IFD view service. */
  readonly ifdViewService: IfdViewService;
}

const DatablockPresetSet: ReadonlySet<string> = new Set(Object.values(DatablockPresetType));
const MapPresetSet: ReadonlySet<string> = new Set(Object.values(MapPresetType));

/** The menu page for the presets */
export class PresetsMenu extends LifecycleComponent<PresetsMenuProps> {
  private readonly listRef = FSComponent.createRef<IfdList<SetupMenuRowListItemData>>();

  private readonly _touchbuttonActive = Subject.create(false);
  public readonly touchbuttonActive = this._touchbuttonActive as Subscribable<boolean>;

  private selectedPresetType: DatablockPresetType | MapPresetType | 'all-factory-settings' | undefined;

  public confirmDialogActive = Subject.create(false);

  /**
   * Changes the preset in the datablock service.
   */
  public changePreset(): void {
    if (typeof this.selectedPresetType === 'string' && DatablockPresetSet.has(this.selectedPresetType)) {
      this.loadDatablockPreset(this.selectedPresetType as DatablockPresetType);
    } else if (typeof this.selectedPresetType === 'string' && MapPresetSet.has(this.selectedPresetType)) {
      this.loadMapPreset(this.selectedPresetType as MapPresetType);
    } else if (this.selectedPresetType === 'all-factory-settings') {
      this.setAllFactory();
    }
    this.selectedPresetType = undefined;
  }

  /**
   * Confirms the preset change
   */
  public confirmSelection(): void {
    this.props.ifdViewService.confirmPopupRef.getOrDefault()?.confirm();
  }

  /**
   * Cancels the preset change
   */
  public cancelSelection(): void {
    this.props.ifdViewService.confirmPopupRef.getOrDefault()?.reject();
  }

  /**
   * Set a preset to display in the confirmation touch button
   * @param type The type of preset to set
   */
  private async setPresetTouchbutton(type: DatablockPresetType | MapPresetType | 'all-factory-settings'): Promise<void> {
    if (this.confirmDialogActive.get() && type === this.selectedPresetType) {
      // Don't do anything if we select the same menu item multiple times
      return;
    }
    let message: string;
    let minWidth;
    switch (type) {
      case DatablockPresetType.LeftSideFactory:
        message = 'Set Factory Left\nSide Datablocks';
        minWidth = 220;
        break;
      case DatablockPresetType.LeftSideTraffic:
        message = 'Set Traffic Left\nSide Datablocks';
        minWidth = 220;
        break;
      case DatablockPresetType.LeftSideTransponder:
        message = 'Set Transponder Left\nSide Datablocks';
        minWidth = 250;
        break;
      case DatablockPresetType.CustomSettings:
        message = 'Set Custom\nDatablocks';
        minWidth = 180;
        break;
      case DatablockPresetType.FactorySettings:
        message = 'Set Factory\nDatablocks';
        minWidth = 180;
        break;
      case MapPresetType.FactorySettings:
        message = 'Set Factory\nMap Settings';
        minWidth = 200;
        break;
      case MapPresetType.IfrSettings:
        message = 'Set IFR\nMap Settings';
        minWidth = 200;
        break;
      case MapPresetType.VfrSettings:
        message = 'Set VFR\nMap Settings';
        minWidth = 200;
        break;
      case MapPresetType.CustomSettings:
        message = 'Set Custom\nMap Settings';
        minWidth = 200;
        break;
      case 'all-factory-settings':
        message = 'Set All Factory\nSettings';
        minWidth = 210;
        break;
    }

    try {
      this.selectedPresetType = type;
      this.confirmDialogActive.set(true);
      await this.props.ifdViewService.requestConfirmation(message, undefined, 80, minWidth);
      this.confirmDialogActive.set(false);
      this.changePreset();
    } catch (e) {
      // Promise rejects if user cancels
      // To avoid the previous request resetting our current request,
      // we check if the selected preset is the same as the one we are trying to set.
      if (this.selectedPresetType === type) {
        this.selectedPresetType = undefined;
        this.confirmDialogActive.set(false);
      }
      return;
    }
  }

  /** Loads factory settings in the datablock and map settings */
  private setAllFactory(): void {
    this.loadDatablockPreset(DatablockPresetType.FactorySettings);
    this.loadMapPreset(MapPresetType.FactorySettings);
  }

  /**
   * Loads a datablock preset by type
   * @param type The datablock preset type to load
   */
  private loadDatablockPreset(type: DatablockPresetType): void {
    const settings = DatablockUserSettings.getManager(this.props.bus, this.props.ifdOptions);
    const currentPreset = settings.getSetting('selectedPreset').get();
    if (currentPreset === type) {
      this.props.datablockService.reloadPresetByType(type);
    } else {
      settings.getSetting('selectedPreset').set(type);
    }
  }

  /**
   * Loads a map preset by type
   * @param type The map preset type to load
   */
  private loadMapPreset(type: MapPresetType): void {
    this.props.mapPresetService.loadPreset(type);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    return this.listRef.instance.onInteractionEvent(event);
  }

  /**
   * Gets the rows to display in the preset menu
   * @returns The rows.
   */
  private getRows(): SetupMenuRowListItems[] {
    const datablockPresetItems: SetupMenuRowListItems[] = [
      {
        type: 'button',
        label: 'Left Side Factory Settings',
        onClick: () => this.setPresetTouchbutton(DatablockPresetType.LeftSideFactory),
      },
      {
        type: 'button',
        label: 'Left Side Traffic',
        onClick: () => this.setPresetTouchbutton(DatablockPresetType.LeftSideTraffic),
      },
      {
        type: 'button',
        label: 'Custom Settings',
        onClick: () => this.setPresetTouchbutton(DatablockPresetType.CustomSettings),
      },
      {
        type: 'button',
        label: 'Factory Settings',
        onClick: () => this.setPresetTouchbutton(DatablockPresetType.FactorySettings),
      },
    ];

    if (this.props.ifdOptions.enableTransponder) {
      datablockPresetItems.splice(2, 0, {
        type: 'button',
        label: 'Left Side Transponder',
        onClick: () => this.setPresetTouchbutton(DatablockPresetType.LeftSideTransponder),
      });
    }

    return [
      {
        type: 'title',
        label: 'Datablock Presets',
        items: datablockPresetItems
      },
      {
        type: 'title',
        label: 'Map Detail Presets',
        items: [
          {
            type: 'button',
            label: 'Factory Settings',
            onClick: () => this.setPresetTouchbutton(MapPresetType.FactorySettings),
          },
          {
            type: 'button',
            label: 'IFR Settings',
            onClick: () => this.setPresetTouchbutton(MapPresetType.IfrSettings),
          },
          {
            type: 'button',
            label: 'VFR Settings',
            onClick: () => this.setPresetTouchbutton(MapPresetType.VfrSettings),
          },
          {
            type: 'button',
            label: 'Custom Settings',
            onClick: () => this.setPresetTouchbutton(MapPresetType.CustomSettings),
          }
        ],
      },
      {
        type: 'button',
        label: 'All Factory Settings',
        onClick: () => this.setPresetTouchbutton('all-factory-settings')
      }
    ];
  }

  private readonly data = ArraySubject.create<SetupMenuRowListItemData>(SetupMenu.getListDataFromRows(this.getRows(), 1));

  /**
   * Renders a setting row to the list page
   * @param data The data for an IFD list
   * @param focus The row focus function.
   * @returns A row to render
   */
  private renderRow(data: SetupMenuRowListItemData, focus: () => void): VNode {
    switch (data.item.type) {
      case 'title':
        return <CollapsibleRow
          label={data.item.label}
          onExpandedChanged={data.item.onExpandedChanged}
          collapseLevel={data.collapseLevel}
          isEnabled={data.item.isEnabled ?? true}

          data={data}
          focus={focus}
        />;
      case 'button':
        return <ButtonRow
          label={data.item.label}
          onClick={data.item.onClick}
          isEnabled={data.item.isEnabled}
          collapseLevel={data.collapseLevel}

          data={data}
          focus={focus}
        />;
      default:
        return <></>;
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="settings-page presets">
        <div class="settings-page-content">
          <IfdList<SetupMenuRowListItemData>
            bus={this.props.bus}
            ref={this.listRef}
            renderItem={(data, _index, focus) => this.renderRow(data, focus)}
            data={this.data}
            heightPx={418}
            listItemSpacingPx={5}
            keepSpaceAfterLastItem={true}
            canSelectItem={(item) => item !== undefined && (SubscribableUtils.isSubscribable(item.item.isEnabled) ? item.item.isEnabled.get() !== false : item.item.isEnabled !== false) && item.item.type !== 'value'}
          />
        </div>
      </div>
    );
  }
}

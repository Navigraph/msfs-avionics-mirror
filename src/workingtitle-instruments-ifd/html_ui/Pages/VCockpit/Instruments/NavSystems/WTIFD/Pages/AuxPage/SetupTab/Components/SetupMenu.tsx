import {
  ArraySubject, ComponentProps, EventBus, FSComponent, LifecycleComponent, MappedSubject, Subject, Subscribable, SubscribableMapFunctions, SubscribableUtils,
  VNode
} from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';
import { IfdList } from '../../../../Components/List';
import { IfdMapPresetService } from '../../../../Components/Map/IfdMapPresetService';
import { DatablockService } from '../../../../Datablocks/DatablocksService';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdOptions } from '../../../../IfdOptions';
import { KeyboardInputType, VirtualKeyboardType } from '../../../../Keyboard/KeyboardTypes';
import { MapDataProvider } from '../../../../Providers/Map/MapDataProvider';
import { ChartsUserSettings } from '../../../../Settings/ChartsUserSettings';
import { ComRadioUserSettings } from '../../../../Settings/ComRadioUserSettings';
import { DisplayUserSettings } from '../../../../Settings/DisplayUserSettings';
import { FmsUserSettings } from '../../../../Settings/FmsUserSettings';
import { IlluminationUserSettings } from '../../../../Settings/IlluminationUserSettings';
import { MapUserSettings } from '../../../../Settings/MapUserSettings';
import { NavigationUserSettings } from '../../../../Settings/NavigationUserSettings';
import { SvsUserSettings } from '../../../../Settings/SvsUserSettings';
import { TimeUserSettings } from '../../../../Settings/TimeUserSettings';
import { UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { VnavUserSettings } from '../../../../Settings/VnavUserSettings';
import { CollapsibleRow, StateRow, TextEditRow, ValueRow } from './Rows';
import { BrightnessRow } from './Rows/BrightnessRow';
import { ButtonRow } from './Rows/ButtonRow';
import { CheckboxRow } from './Rows/CheckboxRow';
import { AlertsRow } from './Sections/AlertsRow';
import { ChartsRow } from './Sections/ChartsRow';
import { DatablockRow } from './Sections/DatablockRow';
import { DisplayRow } from './Sections/DisplayRow';
import { FmsRow } from './Sections/FmsRow';
import { MapRow } from './Sections/MapRow';
import { RadioRow } from './Sections/RadioRow';
import { SvsRow } from './Sections/SvsRow';
import { TerrainRow } from './Sections/TerrainRow';
import { TimeRow } from './Sections/TimeRow';
import { UnitsRow } from './Sections/UnitsRow';
import { SetupMenuRowListItemData, SetupMenuRowListItems } from './SetupMenuTypes';

import './SetupMenu.css';

/**
 * Props for the SetupMenu component.
 */
export interface SetupPageProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** An instance of the IFD options. */
  readonly ifdOptions: IfdOptions;
  /** An instance of the datablock service. */
  readonly datablockService: DatablockService;
  /** The map preset service. */
  readonly mapPresetService: IfdMapPresetService;
  /** The charts manager */
  readonly chartsManager: IfdChartsManager;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
}

/**
 * A setup page component.
 */
export class SetupMenu extends LifecycleComponent<SetupPageProps> {
  private readonly chartSettings = ChartsUserSettings.getManager(this.props.bus);
  private readonly comRadioSettings = ComRadioUserSettings.getManager(this.props.bus);
  private readonly displaySettings = DisplayUserSettings.getManager(this.props.bus);
  private readonly illuminationSettings = IlluminationUserSettings.getManager(this.props.bus);
  private readonly navigationSettings = NavigationUserSettings.getManager(this.props.bus);
  private readonly vnavSettings = VnavUserSettings.getManager(this.props.bus);
  private readonly fmsSettings = FmsUserSettings.getManager(this.props.bus);
  private readonly svsSettings = SvsUserSettings.getManager(this.props.bus);
  private readonly mapSettings = MapUserSettings.getManager(this.props.bus);
  private readonly unitsSettings = UnitsUserSettings.getManager(this.props.bus);
  private readonly timeSettings = TimeUserSettings.getManager(this.props.bus);

  private readonly listRef = FSComponent.createRef<IfdList<SetupMenuRowListItemData>>();

  public readonly datablockSection = new DatablockRow(this.props.datablockService, this.listRef, this.props.ifdOptions);

  private readonly datablockRowClosed = this.datablockSection.isExpanded.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle);

  private readonly data = ArraySubject.create<SetupMenuRowListItemData>([
    ...SetupMenu.getListDataFromRows(AlertsRow.getRows(this.props.bus, this.props.ifdOptions), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(ChartsRow.getRows(this.chartSettings, this.props.chartsManager), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(this.datablockSection.getRows(), 1),
    ...SetupMenu.getListDataFromRows(DisplayRow.getRows(this.displaySettings, this.illuminationSettings), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(FmsRow.getRows(this.props.bus, this.defaultLifecycle, this.vnavSettings, this.fmsSettings), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(new MapRow(this.props.bus, this.mapSettings, this.props.mapPresetService).getRows(), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(RadioRow.getRows(this.navigationSettings, this.comRadioSettings), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(SvsRow.getRows(this.svsSettings), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(TerrainRow.getRows(this.props.bus, this.props.ifdOptions), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(TimeRow.getRows(this.props.bus, this.timeSettings), 1, this.datablockRowClosed),
    ...SetupMenu.getListDataFromRows(UnitsRow.getRows(this.unitsSettings), 1, this.datablockRowClosed),
  ]);

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);
  }

  /**
   * Gets the data for a list from a set of rows, and flattens it recursively into one list of items.
   * @param rows The rows to iterate through
   * @param level The collapse level. 1 is the base.
   * @param areRowsVisible Whether the rows provided are visible. If undefined they will always be visible.
   * @returns An array of setup rows compatible with the list.
   */
  public static getListDataFromRows(rows: SetupMenuRowListItems[], level: number, areRowsVisible?: Subscribable<boolean>): SetupMenuRowListItemData[] {
    const newRows: SetupMenuRowListItemData[] = [];

    for (const row of rows) {
      let isVisible: Subscribable<boolean> | undefined;
      if (row.isVisible && areRowsVisible) {
        isVisible = MappedSubject.create(SubscribableMapFunctions.and(), row.isVisible, areRowsVisible);
      } else {
        isVisible = row.isVisible ? row.isVisible : areRowsVisible;
      }

      switch (row.type) {
        case 'title': {
          const isParentExpanded = Subject.create(false);

          const originalExpandedFunction = row.onExpandedChanged;
          row.onExpandedChanged = (isExpanded: boolean): void => {
            if (originalExpandedFunction) {
              originalExpandedFunction(isExpanded);
            }
            isParentExpanded.set(isExpanded);
          };

          const childrenVisible = areRowsVisible
            ? MappedSubject.create(SubscribableMapFunctions.and(), isParentExpanded, areRowsVisible)
            : isParentExpanded;

          newRows.push(
            {
              heightPx: 41,
              collapseLevel: level,
              item: row,
              isVisible,
            },
            ...this.getListDataFromRows(row.items, level + 1, childrenVisible)
          );
          break;
        }
        case 'state':
        case 'textEdit':
        case 'checkbox':
        case 'button':
        case 'value':
          newRows.push({
            heightPx: 41,
            collapseLevel: level,
            item: row,
            isVisible,
          });
          break;
        case 'brightness':
          newRows.push({
            heightPx: row.currentStateIndex?.map(v => v === 2 ? 70 : 41) ?? 41,
            collapseLevel: level,
            item: row,
            isVisible,
          });
      }
    }

    return newRows;
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    return this.listRef.instance.onInteractionEvent(event);
  }

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
      case 'state':
        return <StateRow
          label={data.item.label}
          states={data.item.states}
          currentStateIndex={data.item.currentStateIndex ?? Subject.create(0)}
          onStateConfirmed={data.item.onStateConfirmed}
          isEnabled={data.item.isEnabled ?? true}
          collapseLevel={data.collapseLevel}

          data={data}
          focus={focus}
        />;
      case 'brightness':
        return (
          <BrightnessRow
            label={data.item.label}
            states={data.item.states}
            currentStateIndex={data.item.currentStateIndex ?? Subject.create(0)}
            onStateConfirmed={data.item.onStateConfirmed}
            onStateCleared={data.item.onStateCleared}
            isEnabled={data.item.isEnabled ?? true}
            collapseLevel={data.collapseLevel}
            doubleRow={data.item.currentStateIndex?.map(v => v === 2) ?? undefined}
            manualBrightnessSetting={data.item.currentManualBrightness}

            data={data}
            focus={focus}
          />
        );
      case 'textEdit':
        return <TextEditRow
          bus={this.props.bus}
          label={data.item.label}
          instrumentIndex={this.props.ifdOptions.instrumentIndex}
          value={data.item.value ?? Subject.create('')}
          parse={data.item.parse}
          format={data.item.format}
          postfixUnit={data.item.postfixUnit}
          prefixUnit={data.item.prefixUnit}
          keyboardType={data.item.keyboardType ?? VirtualKeyboardType.Alphanumeric}
          keyboardInputType={data.item.keyboardInputType ?? KeyboardInputType.FreeText}
          keyboardDisableModeSwitch={data.item.keyboardDisableModeSwitch}
          keyboardInitialShowNumpad={data.item.keyboardInitialShowNumpad}
          onValueConfirmed={data.item.onValueConfirmed}
          onValueCleared={data.item.onValueCleared}
          isEnabled={data.item.isEnabled ?? true}
          collapseLevel={data.collapseLevel}
          color={data.item.color}
          data={data}
          focus={focus}
        />;
      case 'value':
        return <ValueRow
          label={data.item.label}
          value={data.item.value}
          isEnabled={data.item.isEnabled}
          collapseLevel={data.collapseLevel}

          data={data}
        />;
      case 'checkbox':
        return <CheckboxRow
          label={data.item.label}
          checked={data.item.checked ?? Subject.create(false)}
          onPressed={data.item.onPressed}
          isEnabled={data.item.isEnabled}
          collapseLevel={data.collapseLevel}

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
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="settings-page">
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
      </div >
    );
  }
}

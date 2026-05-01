import {
  ArraySubject, ComponentProps, EventBus, FacilityLoader, FacilitySearchType, FacilityType, FSComponent, IcaoValue, LifecycleComponent, Subject, VNode
} from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../Charts/IfdChartsManager';
import { IfdList } from '../../../Components/List';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { FlightPlanStore } from '../../../FlightPlan';
import { IfdOptions } from '../../../IfdOptions';
import { IfdKeyboardControlEvents, KeyboardInputType, VirtualKeyboardType } from '../../../Keyboard/KeyboardTypes';
import { LineSelectKeyButtonType } from '../../../LineSelectKeyButtons';
import { Lsk234State } from '../../../LineSelectKeyButtons/LskState';
import { IfdInteractionEventHandler } from '../../../RightKnob';
import { CharInput, CharInputSlot } from '../../FmsPage/FplTab/Components/CharInput';
import { ChartSelectionListItem, ChartSelectionListItemData } from './Components/ChartSelectionListItem';

import './ChartSelectionPage.css';

/** The properties for the {@link ChartTab} component. */
interface ChartSelectionPageProps extends ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The IFD charts manager */
  readonly chartsManager: IfdChartsManager;
  /** An instance of the flight plan store. */
  readonly flightPlanStore: FlightPlanStore;
  /** The instrument configuration for the IFD. */
  readonly ifdOptions: IfdOptions;
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The LSK state */
  readonly lskState: Lsk234State;
}

/** Page used for selecting a chart */
export class ChartSelectionPage extends LifecycleComponent<ChartSelectionPageProps> implements IfdInteractionEventHandler {
  private readonly listRef = FSComponent.createRef<IfdList<ChartSelectionListItemData>>();
  private readonly airportInputContainerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly airportInputRef = FSComponent.createRef<CharInput>();

  private readonly data = ArraySubject.create<ChartSelectionListItemData>([]);

  public readonly isHidden = Subject.create(true);

  private readonly selectedAirportIdent = Subject.create<string>('');
  private readonly selectedAirportName = Subject.create<string>('');

  private readonly airportInputListener = (): void => {
    this.focusAirportIdentInput();
  };

  /** @inheritdoc */
  public onAfterRender(): void {
    this.selectedAirportIdent.sub(async (input) => {
      if (input.length > 2) {
        const facs = await this.props.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Airport, input, 1);
        const icao = facs.find((searchIcao) => searchIcao.ident === input);

        this.props.chartsManager.selectedAirport.set(icao);
      } else {
        this.props.chartsManager.selectedAirport.set(undefined);
      }
    });

    this.props.chartsManager.selectedAirport.sub((icao) => this.handleAirportSelected(icao), true);
    this.props.chartsManager.preferredSource.sub(() => this.handleAirportSelected(this.props.chartsManager.selectedAirport.get()), true);

    this.airportInputContainerRef.instance.addEventListener('mousedown', this.airportInputListener);
  }

  /**
   * Handles interaction events while the selection page is visible.
   * @param event The knob event to handle.
   * @returns True if the event is consumed; otherwise false.
   */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    const inputField = this.airportInputRef.getOrDefault();

    if (inputField && inputField.getIsEditingActive().get()) {
      switch (event) {
        case IfdInteractionEvent.RightKnobOuterInc:
          inputField.moveCursor(1, true);
          return true;
        case IfdInteractionEvent.RightKnobOuterDec:
          inputField.moveCursor(-1, true);
          return true;
        case IfdInteractionEvent.RightKnobInnerDec:
          inputField.changeSlotValue(-1, true);
          return true;
        case IfdInteractionEvent.RightKnobInnerInc:
          inputField.changeSlotValue(1, true);
          return true;
      }

      return false;
    } else {
      return this.listRef.getOrDefault()?.onInteractionEvent(event) ?? false;
    }
  }

  /**
   * Handles an airport being selected and the display of list items.
   * @param icao The new ICAO.
   */
  private handleAirportSelected(icao: IcaoValue | undefined): void {
    this.data.clear();

    if (icao) {
      this.props.chartsManager.selectedAirport.set(icao);
      this.props.facLoader.getFacility(FacilityType.Airport, icao).then((fac) => this.selectedAirportName.set(Utils.Translate(fac.name)));
      this.props.chartsManager.getChartsForAirport(icao).then((charts) => {
        const selectedChart = this.props.chartsManager.selectedChart.get();

        this.data.insertRange(0, charts.map((metadata) => {
          return {
            text: this.props.chartsManager.getChartName(metadata),
            heightPx: 25,
            page: metadata,
          };
        }));

        if (selectedChart) {
          this.listRef.getOrDefault()?.focusIndex(this.data.getArray().findIndex((v) => v.page.guid === selectedChart.guid));
        }
      });
    } else {
      this.selectedAirportName.set('No Airport Selected');
    }
  }

  /**
   * Focusses the airport ident input, and opens the keyboard.
   */
  private focusAirportIdentInput(): void {
    const inputField = this.airportInputRef.getOrDefault();
    if (this.isHidden.get() || !inputField) {
      return;
    }

    if (inputField.getIsEditingActive().get()) {
      this.props.bus.getPublisher<IfdKeyboardControlEvents>().pub('keyboard_close', undefined, false, false);
      inputField.deactivateEditing();
      inputField.refresh();
    } else {
      inputField.activateEditing(true);
    }

    this.props.bus.getPublisher<IfdKeyboardControlEvents>().pub('text_edit_row_keyboard_open', {
      type: VirtualKeyboardType.Alphanumeric,
      keyboardInputType: KeyboardInputType.FreeText,
      disableModeSwitch: false,
      initialShowNumpad: false,
      initialValue: this.selectedAirportIdent.get(),
      instrumentIndex: this.props.ifdOptions.instrumentIndex,
      onValueChanged: (value: string): void => { this.airportInputRef.getOrDefault()?.setValue((value ?? '').toUpperCase()); },
      onEnter: (value: string): void => { this.airportInputRef.getOrDefault()?.setValue((value ?? '').toUpperCase()); },
      onClose: () => {
        const field = this.airportInputRef.getOrDefault();

        if (field?.getIsEditingActive().get()) {
          field.deactivateEditing();
          field.refresh();
        }
      },
      rowRef: null
    }, true, false);
  }

  /** Sets LSK state for this page */
  private setLsks(): void {
    this.props.lskState.lsk2.isVisible.set(false);
    this.props.lskState.lsk3.isVisible.set(false);
    this.props.lskState.lsk4.isVisible.set(true);
    this.props.lskState.lsk4.label.set('Select Airport');
    this.props.lskState.lsk4.type.set(LineSelectKeyButtonType.Action);
    this.props.lskState.lsk4.onClick.set(() => this.focusAirportIdentInput());
  }

  /** Opens the chart selection page */
  public open(): void {
    this.isHidden.set(false);

    this.airportInputRef.getOrDefault()?.setValue(this.props.chartsManager.selectedAirport.get()?.ident ?? '');
    this.setLsks();
  }

  /** Closes the chart selection page */
  public close(): void {
    this.isHidden.set(true);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={{ 'chart-selection-page': true, 'hidden': this.isHidden }}>
        <p class="chart-selection-title">CHART SELECTION</p>
        <div class='chart-selection-airport'>
          <div class='chart-selection-airport-field' ref={this.airportInputContainerRef}>
            <CharInput
              ref={this.airportInputRef}
              value={this.selectedAirportIdent}
              renderInactiveValue={(v) => v}
            >
              {Array.from({ length: 5 }).map(() => <CharInputSlot
                defaultCharValue={''}
                wrap
              />)}
            </CharInput>
          </div>
          <p class='chart-selection-airport-name'>{this.selectedAirportName}</p>
        </div>
        <IfdList<ChartSelectionListItemData>
          bus={this.props.bus}
          data={this.data}
          renderItem={(data, _index, focusFunc) =>
            <ChartSelectionListItem data={data} chartsManager={this.props.chartsManager} onSelected={() => this.close()} focus={focusFunc} />
          }
          listItemSpacingPx={5}
          heightPx={371}
          ref={this.listRef}
        />
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.airportInputContainerRef.instance.removeEventListener('mousedown', this.airportInputListener);
  }
}

import { ArrayUtils, ChartMetadata, FSComponent, MappedSubject, MathUtils, Subject, UnitFamily, UnitType, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';
import { IfdListItemComponent, IfdListItemComponentProps } from '../../../../Components/List/IfdListItemComponent';
import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../../../../Events/IfdTuningControlsManager';
import { FlightPlanStore } from '../../../../FlightPlan';
import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../../../Utilities/FormatUtils';
import { IfdViewService } from '../../../../ViewService';
import { IfdPageName } from '../../../IfdPage';
import { FacilityListData, IfdMetarCategory } from './FacilityRowTypes';

import './FacilityRow.css';

/** The properties for the {@link FacilityRow} component. */
export interface FacilityRowProps extends IfdListItemComponentProps {
  /** The data for the row */
  readonly data: FacilityListData;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** The view service */
  readonly viewService: IfdViewService;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
  /** Charts manager */
  readonly chartsManager: IfdChartsManager;
}

/** The options that the inner cursor can highlight */
type InnerCursorOptions = 'freq' | 'info' | 'chart';

/** The FacilityRow component. */
export class FacilityRow extends IfdListItemComponent<FacilityRowProps> {
  private static readonly METAR_CATEGORY_COLOURS = {
    [IfdMetarCategory.VFR]: '#00FFFF',
    [IfdMetarCategory.MVFR]: '#00FF00',
    [IfdMetarCategory.IFR]: '#CEFF00',
    [IfdMetarCategory.LIFR]: '#CE0000',
    [IfdMetarCategory.CAT1]: '#CE00FF',
  };

  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.viewService.bus);

  private readonly ref = FSComponent.createRef<HTMLDivElement>();
  private readonly freqRef = FSComponent.createRef<HTMLParagraphElement>();
  private readonly metarIconRef = FSComponent.createRef<SVGPathElement>();
  private readonly infoIconRef = FSComponent.createRef<HTMLDivElement>();
  private readonly chartIconRef = FSComponent.createRef<HTMLDivElement>();

  private displayDistance = MappedSubject.create(
    ([dist, unit]) => isFinite(dist) ?
      UnitType.NMILE.convertTo(dist, unit).toFixed(1) : '',
    this.props.data.facilityDistance,
    this.unitsSettingManager.distanceUnitsLarge,
  ).withLifecycle(this.defaultLifecycle);

  private readonly distanceUnits = this.unitsSettingManager.distanceUnitsLarge
    .map(UnitFormatter.unitLabel<UnitFamily.Distance>)
    .withLifecycle(this.defaultLifecycle);

  private readonly displayHeading = BearingFormatter.createFromNumber(
    this.props.data.facilityHeading,
    UnitsNavAngleSettingMode.Magnetic,
    UnitsUserSettings.getManager(this.props.viewService.bus).getSetting('unitsNavAngle'),
    this.props.store,
  ).withLifecycle(this.defaultLifecycle).fullLabel;

  private readonly containerClickListener = (): void => this.focus();
  private readonly freqClickListener = (event: MouseEvent): void => {
    if (this.isSelected.get()) {
      event.stopPropagation();
      this.onFrequencySelected();
    } else {
      this.setInnerCursor('freq');
      this.focus();
    }
  };
  private readonly infoClickListener = (event: MouseEvent): void => {
    if (this.isSelected.get()) {
      event.stopPropagation();
      this.onFacilityInfoSelected();
    } else {
      this.setInnerCursor('info');
      this.focus();
    }
  };
  private readonly chartClickListener = (event: MouseEvent): void => {
    if (this.isSelected.get()) {
      event.stopPropagation();
      this.onChartsSelected();
    } else {
      this.setInnerCursor('chart');
      this.focus();
    }
  };

  private readonly chartsNotAvailable = Subject.create(true);
  private charts: ChartMetadata[] = [];
  private readonly innerCursor = Subject.create<InnerCursorOptions | undefined>(undefined);
  private readonly cursorOptions: InnerCursorOptions[] = [];

  /** @inheritdoc */
  public async onAfterRender(node: VNode): Promise<void> {
    super.onAfterRender(node);
    this.ref.instance.addEventListener('click', this.containerClickListener);
    this.freqRef.instance.addEventListener('click', this.freqClickListener);
    this.infoIconRef.instance.addEventListener('click', this.infoClickListener);
    this.chartIconRef.instance.addEventListener('click', this.chartClickListener);

    const cursorOptions: InnerCursorOptions[] = ['info'];
    switch (this.props.data.type) {
      case 'airport': {
        const metarCat = await this.props.data.metarCategory();
        if (metarCat) {
          this.metarIconRef.instance.style.fill = FacilityRow.METAR_CATEGORY_COLOURS[metarCat];
        } else {
          this.metarIconRef.instance.classList.toggle('no-metar', metarCat === undefined);
        }

        this.props.data.frequency && this.cursorOptions.unshift('freq');
        this.props.chartsManager.getChartsForAirport(this.props.data.facility.icaoStruct).then(chartArray => {
          this.charts = chartArray;
          if (chartArray.length > 0) {
            this.cursorOptions.push('chart');
            this.chartsNotAvailable.set(false);
          } else {
            this.chartsNotAvailable.set(true);
          }
        }).catch(() => {
          this.charts.length = 0;
          this.chartsNotAvailable.set(true);
        });
        break;
      }
      case 'vor':
      case 'ndb':
        this.metarIconRef.instance.classList.toggle('no-metar', true);
        this.cursorOptions.unshift('freq');
        break;
      case 'standard':
      default:
        this.metarIconRef.instance.classList.toggle('no-metar', true);
        break;
    }
    this.cursorOptions.push(...cursorOptions);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        this.onFocus(event);
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        return this.changeInnerCursor(-1);
      case IfdInteractionEvent.RightKnobInnerInc:
        return this.changeInnerCursor(1);
    }

    return false;
  }

  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    if (event !== 'click' && this._isSelected.get()) {
      switch (this.innerCursor.get()) {
        case 'freq':
          this.onFrequencySelected();
          break;
        case 'info':
          this.onFacilityInfoSelected();
          break;
        case 'chart':
          this.onChartsSelected();
          break;
      }
    } else if (this.innerCursor.get() === undefined) {
      if (event === IfdInteractionEvent.RightKnobInnerDec) {
        this.setInnerCursor(this.cursorOptions[this.cursorOptions.length - 1]);
      }
      if (event === IfdInteractionEvent.RightKnobInnerInc || event === IfdInteractionEvent.RightKnobOuterDec || event === IfdInteractionEvent.RightKnobOuterInc) {
        this.setInnerCursor(this.cursorOptions[0]);
      }
    }

    super.onFocus(event);
  }

  /** @inheritDoc */
  public onBlur(): void {
    super.onBlur();

    this.setInnerCursor(undefined);
  }

  /**
   * Decrements/increments the inner cursor. If there is no inner cursor then it just sets it to the first available option
   * @param direction The direction to increment it.
   * @returns true, if the cursor has landed on an option; or false, if the cursor has landed not on an option
   */
  private changeInnerCursor(direction: 1 | -1): boolean {
    const currentCursor = this.innerCursor.get();
    const currentCursorIndex = currentCursor === undefined ? -1 : this.cursorOptions.indexOf(currentCursor);
    let newCursorOption: InnerCursorOptions | undefined;
    if (currentCursorIndex === -1) {
      newCursorOption = this.cursorOptions[0];
    } else {
      const newIndex = currentCursorIndex + direction;
      if (newIndex >= 0) {
        newCursorOption = ArrayUtils.peekAt(this.cursorOptions, currentCursorIndex + direction);
      }
    }

    this.setInnerCursor(newCursorOption);

    return newCursorOption !== undefined;
  }

  /**
   * Sets the inner cursor position.
   * @param pos The position to set
   */
  private setInnerCursor(pos: InnerCursorOptions | undefined): void {
    const isValid = pos === undefined ? false : this.cursorOptions.includes(pos);
    if (isValid || pos === undefined) {
      this.innerCursor.set(pos);
    }

    this.ref.instance.classList.toggle('facility-info-selected', isValid && pos === 'info');
    this.ref.instance.classList.toggle('facility-freq-selected', isValid && pos === 'freq');
    this.ref.instance.classList.toggle('facility-chart-selected', isValid && pos === 'chart');
  }

  /**
   * Gets the frequency for this facility
   * @returns The frequency as a string, or an empty string if no frequency  is attached to the facility.
   */
  private getFrequency(): string {
    switch (this.props.data.type) {
      case 'airport':
        return this.props.data.frequency?.toFixed(3) ?? '';
      case 'vor':
        return this.props.data.facility.freqMHz.toFixed(2) ?? '';
      case 'ndb':
        return this.props.data.facility.freqMHz.toFixed(0) ?? '';
      case 'standard':
        return '';
    }
  }

  /**
   * Handles the facility info button interaction
   * Navigates to the facility information page.
   */
  private onFacilityInfoSelected(): void {
    if (!this.cursorOptions.includes('info')) {
      return;
    }
    if (this.innerCursor.get() !== 'info') {
      this.setInnerCursor('info');
    } else {
      this.props.viewService.openFacilityInfo(this.props.data.facility);
    }
  }

  /**
   * Handles the frequency button interaction
   * Sets the frequency of the selected facility.
   */
  private onFrequencySelected(): void {
    if (!this.cursorOptions.includes('freq')) {
      return;
    }
    if (this.innerCursor.get() !== 'freq') {
      this.setInnerCursor('freq');
    } else {
      if (this.props.data.type === 'airport' && this.props.data.frequency) {
        this.props.tuningControlsManager.setComStandbyFrequency(this.props.data.frequency);
      } else if (this.props.data.type === 'vor') {
        this.props.tuningControlsManager.setNavStandbyFrequency(MathUtils.round(this.props.data.facility.freqMHz, 0.01));
      }
    }
  }

  /**
   * Handles the charts button interaction.
   * Navigates to the charts index.
   */
  private onChartsSelected(): void {
    if (!this.cursorOptions.includes('chart')) {
      return;
    }
    if (this.innerCursor.get() !== 'chart') {
      this.setInnerCursor('chart');
    } else if (!this.chartsNotAvailable.get()) {
      // navigate to chart page and open primary airport chart
      this.props.viewService.openTabOnPage(IfdPageName.MAP, 'CHART');
      this.props.chartsManager.selectedAirport.set(this.props.data.facility.icaoStruct);
      const primaryAirportChart = this.props.chartsManager.getPrimaryAirportChart(this.charts);
      this.props.chartsManager.selectedChart.set(primaryAirportChart);
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    const facName = Utils.Translate(this.props.data.facility.name).split(' ').map((word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase()).join(' ');
    const freq = this.getFrequency();

    return (
      <div
        class={{
          'facility-row': true,
          'facility-row-selected': this._isSelected,
          'active-waypoint': this.props.data.isActiveWaypoint,
          'fpl-airport': this.props.data.type === 'airport' && this.props.data.isFlightplanAirport,
        }}
        ref={this.ref}
      >
        <p class='facility-ident'>{this.props.data.facility.icaoStruct.ident}</p>
        <p class='facility-dist'>
          <span>{this.displayDistance}</span><span class="facility-dist-unit">{this.distanceUnits}</span>
        </p>
        <p class='facility-name'>{facName.length > 27 ? facName.slice(0, 24) + '...' : facName}</p>
        <svg class='facility-metar-icon' width="28" height="17" viewBox="0 0 28 17">
          <path
            d="m6.5517 3.0483c1.3194.72796 3.0275 1.4973 4.1858 1.7289 1.5924.31848 3.3857.14445 5.0502-.45498 1.9239-.69285 2.6602-1.164 4.9138-1.3194 1.3194-.090996 2.3204.77346 2.3204.77346v11.738h-1.8199v-4.3678s-.36398-.72796-1.5014-.50048c-.97846.19569-2.6389.77346-4.4133.77346s-4.9138-1.001-6.2787-2.0929c-1.3649-1.0919-2.0474-1.8199-2.4569-2.9119-.40948-1.0919-.63697-2.8209-1e-7-3.3668z"
            stroke="#000"
            stroke-width=".5"
            ref={this.metarIconRef}
          />
        </svg>
        <p class='facility-freq' ref={this.freqRef}>{freq}</p>
        <p class='facility-hdg'>{this.displayHeading}</p>
        <div class='facility-info-icon' ref={this.infoIconRef}>
          <img src="/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/info.png" alt="Info icon" />
        </div>
        <div class={{ 'facility-chart-icon': true, hidden: this.chartsNotAvailable }} ref={this.chartIconRef}>
          <img src="/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/chart_binder_small.png" alt="Chart icon" />
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.ref.instance.removeEventListener('click', this.containerClickListener);
    this.freqRef.instance.removeEventListener('click', this.freqClickListener);
    this.infoIconRef.instance.removeEventListener('click', this.infoClickListener);
    this.chartIconRef.instance.removeEventListener('click', this.chartClickListener);

    super.destroy();
  }
}

import { FSComponent, MappedSubject, Subject, Subscribable, SubscribableMapFunctions, UnitFamily, VNode } from '@microsoft/msfs-sdk';

import { LegBlockArrowIcon } from '../../../../Assets/SVGs/LegBlockArrowIcon';
import { ProcedureIcon } from '../../../../Assets/SVGs/ProcedureIcon';
import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';
import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { FlightPlanStore } from '../../../../FlightPlan';
import { UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../../../Utilities/FormatUtils';
import { IfdViewService } from '../../../../ViewService';
import { IfdPageName } from '../../../IfdPage';
import { FplSelectionMenuController, Position } from '../FplSelectionMenu/FplSelectionMenuController';
import { AirportFlag } from './AirportFlag';
import { BaseEditableBlock, BaseEditableBlockProps, EditableField } from './BaseEditableBlock';

import './LegBlock.css';

/** Cursor Field indexes for OriginBlock */
enum OriginFieldIndex {
  Airport,
  Runway,
  Departure
}

/** The properties for the {@link OriginBlock} component. */
export interface OriginBlockProps extends BaseEditableBlockProps {
  /** The menu controller */
  readonly menuController: FplSelectionMenuController;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** Callback when origin is changed */
  readonly onReplaceOrigin: (ident: string) => void;
  /** The IFD charts manager */
  readonly chartManager: IfdChartsManager;
  /** The view service */
  readonly viewService: IfdViewService;
  /** Whether this component is in sidebar mode. */
  readonly isInSidebarMode: Subscribable<boolean>;
}

/** The OriginBlock component. */
export class OriginBlock extends BaseEditableBlock<OriginBlockProps> {
  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.viewService.bus);

  private readonly airportFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly runwayFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly departureFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly chartIconRef = FSComponent.createRef<HTMLDivElement>();

  private readonly airportIdent = this.props.store.originIdent.map((v) => v ?? '').withLifecycle(this.defaultLifecycle);
  private readonly airportFacility = this.props.store.originFacility;
  private readonly airportName = MappedSubject.create(([airportFacility]) => Utils.Translate(airportFacility?.name ?? ''), this.airportFacility).withLifecycle(this.defaultLifecycle);
  private readonly runway = this.props.store.originRunwayName.map((v) => v ?? '').withLifecycle(this.defaultLifecycle);

  private readonly bearing = BearingFormatter.createFromNavAngle(
    this.props.store.originBearing,
    this.unitsSettingManager.getSetting('unitsNavAngle'),
    this.props.store,
  ).withLifecycle(this.defaultLifecycle);

  private readonly distance = MappedSubject.create(
    ([dist, unit]) => {
      if (dist.isNaN()) {
        return '---';
      }
      const convertedDist = dist.asUnit(unit);
      return convertedDist.toFixed(convertedDist < 100 ? 1 : 0);
    },
    this.props.store.destinationDistance,
    this.unitsSettingManager.distanceUnitsLarge,
  ).withLifecycle(this.defaultLifecycle);

  private readonly distanceUnits = this.unitsSettingManager.distanceUnitsLarge
    .map(UnitFormatter.unitLabel<UnitFamily.Distance>)
    .withLifecycle(this.defaultLifecycle);

  // FIXME show pending departure selections
  private readonly fullProcedureName = MappedSubject.create(([dep, depTransition]) => {
    if (dep) {
      // FIXME when a departure is pending it should be shown, and with '-----' as transition until one is selected
      // The None case does not show anything for transition.
      if (dep.enRouteTransitions.length > 0 && depTransition) {
        return `${dep.name}.${depTransition.name}`;
      } else {
        return dep.name;
      }
    }
    return '';
  },
    this.props.store.departureProcedure,
    this.props.store.departureTransition,
  ).withLifecycle(this.defaultLifecycle);

  private hideAirportFlag = Subject.create(true);
  private airportFlag = Subject.create('----');
  private airportFlagColor = '00c2db';

  private readonly hasDepartures = MappedSubject.create(
    ([departures]) => departures.length > 0,
    this.props.store.originDepartures,
  ).withLifecycle(this.defaultLifecycle);

  private readonly hasNoChart = this.props.store.originChart.map((v) => !v).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  protected readonly fieldIndexes = {
    airport: OriginFieldIndex.Airport,
    runway: OriginFieldIndex.Runway,
    departure: OriginFieldIndex.Departure
  };

  /** @inheritdoc */
  protected readonly fields: Record<string, EditableField> = {
    airport: {
      ref: this.airportFieldRef,
      getValue: () => this.airportIdent.get(),
      canEdit: Subject.create(true),
      type: 'text',
      onEdit: (value: string) => {
        this.props.onReplaceOrigin(value);
      }
    },
    runway: {
      ref: this.runwayFieldRef,
      getValue: () => this.runway.get(),
      canEdit: Subject.create(true),
      type: 'menu',
      onMenuOpen: () => this.onEditOriginRunway()
    },
    departure: {
      ref: this.departureFieldRef,
      getValue: () => this.fullProcedureName.get(),
      canEdit: this.hasDepartures,
      type: 'menu',
      onMenuOpen: () => this.onEditDeparture()
    }
  };

  private onEditDeparture = (): void => {
    const isInSidebarMode = this.props.isInSidebarMode.get();
    const blockPosition: Position = {
      xCoord: isInSidebarMode ? 295 : 175,
      yCoord: isInSidebarMode ? 5 : 15,
    };
    this.props.menuController.setPosition(blockPosition);
    this.props.menuController.showDepartureMenu();
  };

  private onEditOriginRunway = (): void => {
    const isInSidebarMode = this.props.isInSidebarMode.get();

    const blockPosition: Position = {
      xCoord: isInSidebarMode ? 295 : 175,
      yCoord: isInSidebarMode ? 5 : 15
    };

    this.props.menuController.setPosition(blockPosition);
    this.props.menuController.showOriginRunwayMenu();
  };

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    // Give the cursor after the block a try first (it will return false if not selected).
    if (this.props.data.cursorAfterRef.getOrDefault()?.onInteractionEvent(event)) {
      return true;
    }
    return super.onInteractionEvent(event);
  }

  private readonly onChartClicked = async (): Promise<void> => {
    if (!this._isSelected.get()) {
      return;
    }

    const chart = this.props.store.originChart.get();

    if (chart) {
      this.props.viewService.openTabOnPage(IfdPageName.MAP, 'CHART');
      this.props.chartManager.selectedAirport.set(this.airportFacility.get()?.icaoStruct);
      this.props.chartManager.selectedChart.set(chart);
    }
  };

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.chartIconRef.instance.addEventListener('mousedown', this.onChartClicked);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'wt-ifd-leg-block': true,
          'origin-leg-block': true,
          'leg-block-selected': this.isSelected,
          'mini-leg-format': this.miniFplFormatStyle
        }}
        ref={this.blockRef}
      >
        <div class="leg-block-top-row">Origin</div>
        <div
          class="leg-block-data-row leg-block-airport-row"
        >
          <div class="leg-block-arrow-icon"><LegBlockArrowIcon fillColor="003466" /></div>
          <div
            class={this.createFieldClasses(OriginFieldIndex.Airport, {
              'leg-block-airport-field': true,
            })}
            ref={this.airportFieldRef}
          >
            <span
              class={{
                'mini-fpl-origin': true,
                'hidden': this.miniFplFormatStyle.map((v) => !v)
              }}
            >Origin </span>
            {this.createTextField(OriginFieldIndex.Airport, this.airportIdent)}
          </div>
          <div class="leg-block-info-text leg-block-rwy-text">Rwy:</div>
          <div
            class={this.createFieldClasses(OriginFieldIndex.Runway, {
              'leg-block-rwy-field': true,
            })}
            ref={this.runwayFieldRef}
          >
            {this.runway}
          </div>
          <div class="leg-block-info-text leg-block-bearing-label">
            <span class="mini-fpl-hidden">
              <span class="leg-block-white-text">Brg:   {this.bearing.number}</span>
              {this.bearing.unit}
            </span>
            <span class={{ 'leg-block-white-text': true, 'hidden': this.miniFplFormatStyle.map((v) => !v) }}>---</span>
          </div>
          <div class="leg-block-info-text leg-block-info-dist">
            <span class="mini-fpl-hidden">
              <span class="leg-block-white-text">{this.distance}</span>
              <span class="leg-block-unit-text">{this.distanceUnits}</span>
            </span>
            <span class={{ 'mini-fpl-time-dashes': true, 'leg-block-white-text': true, 'hidden': this.miniFplFormatStyle.map((v) => !v) }}>---</span>
          </div>
        </div>
        <div class="leg-block-airport-name">{this.airportName}</div>
        <div class={{
          'leg-block-procedure-row': true,
          'hidden': this.hasDepartures.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle),
        }}>
          <div class="leg-block-procedure-label leg-block-departure-label">Departure:</div>
          <div
            class={this.createFieldClasses(OriginFieldIndex.Departure, {
              'leg-block-procedure-field': true,
            })}
            ref={this.departureFieldRef}
          >
            {this.fullProcedureName}
          </div>
        </div>
        <div
          class={{
            'leg-block-procedure-button': true,
            'leg-block-black-field': this.isInEditMode,
            'hidden': this.hasNoChart,
          }}
          ref={this.chartIconRef}
        >
          <ProcedureIcon />
        </div>
        <div
          class={{
            'leg-block-airport-flag-container': true,
            'hidden': this.hideAirportFlag
          }}
          style={{ 'top': '7px' }}
        >
          <AirportFlag airportICAO={this.airportFlag} flagColor={this.airportFlagColor} />
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.chartIconRef.instance.removeEventListener('mousedown', this.onChartClicked);
  }
}

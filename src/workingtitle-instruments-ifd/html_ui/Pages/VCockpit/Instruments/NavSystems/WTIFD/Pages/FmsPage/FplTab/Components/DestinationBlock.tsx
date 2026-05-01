import {
  AdditionalApproachType, AltitudeRestrictionType, ComponentProps, EventBus, FSComponent, MappedSubject, Subject, Subscribable, SubscribableMapFunctions,
  UnitFamily, UnitType, VerticalFlightPhase, VNode
} from '@microsoft/msfs-sdk';

import { LegBlockArrowIcon } from '../../../../Assets/SVGs/LegBlockArrowIcon';
import { ProcedureIcon } from '../../../../Assets/SVGs/ProcedureIcon';
import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';
import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { FlightPlanStore } from '../../../../FlightPlan';
import { ApproachTransitionType, Fms, FmsUtils } from '../../../../Fms';
import { FmsUserSettings } from '../../../../Settings/FmsUserSettings';
import { UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../../../Utilities/FormatUtils';
import { IfdApproachUtils } from '../../../../Utilities/IfdApproachUtils';
import { IfdViewService } from '../../../../ViewService';
import { IfdPageName } from '../../../IfdPage';
import { FplSelectionMenuController, Position } from '../FplSelectionMenu/FplSelectionMenuController';
import { AirportFlag } from './AirportFlag';
import { AltitudeField } from './AltitudeField';
import { BaseEditableBlock, BaseEditableBlockProps, EditableField } from './BaseEditableBlock';

import './LegBlock.css';

/** Cursor Field indexes for DestinationBlock */
enum DestinationFieldIndex {
  Unselected = -1,
  Arrival,
  Approach,
  Airport,
  Runway,
  AltConstraintType,
  AltConstraint2,
  AltConstraint1,
}

/** The properties for the {@link DestinationBlock} component. */
export interface DestinationBlockProps extends BaseEditableBlockProps, ComponentProps {
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** The flight plan store to use. */
  readonly store: FlightPlanStore;
  /** The Flight Management System to use */
  readonly fms: Fms;
  /** The class that holds the state of the FplPlanSelectionMenu */
  readonly menuController: FplSelectionMenuController;
  /** The IFD charts manager */
  readonly chartManager: IfdChartsManager;
  /** The view service */
  readonly viewService: IfdViewService;
  /** Callback when destination is changed */
  readonly onReplaceDestination: (ident: string) => void;
  /** Whether this component is in sidebar mode. */
  readonly isInSidebarMode: Subscribable<boolean>;
}

/** The DestinationBlock component. */
export class DestinationBlock extends BaseEditableBlock<DestinationBlockProps> {
  private readonly unitsSettingManager = UnitsUserSettings.getManager(this.props.bus);

  private readonly chartIconRef = FSComponent.createRef<HTMLDivElement>();
  private readonly arrivalFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly approachFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly airportFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly runwayFieldRef = FSComponent.createRef<HTMLDivElement>();
  private readonly altConstraint1Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint2Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint1RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraint2RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraintTypeRef = FSComponent.createRef<HTMLDivElement>();

  public readonly legData = this.props.data.legData;

  private readonly altitude1 = this.legData.altitude1;
  private readonly altitude2 = this.legData.altitude2;
  private readonly altitudeConstraintType = Subject.create(this.legData.altDesc.get());
  public readonly altitudeConstraintTypeText = MappedSubject.create(
    ([label]) => {
      switch (label) {
        case AltitudeRestrictionType.At: return 'at';
        case AltitudeRestrictionType.AtOrAbove: return 'at or above';
        case AltitudeRestrictionType.AtOrBelow: return 'at or below';
        case AltitudeRestrictionType.Between: return 'between';
        case AltitudeRestrictionType.Unused: return '';
      }
    },
    this.altitudeConstraintType
  );

  private readonly verticalInstruction = MappedSubject.create(
    ([altDesc, altitude1, altitude2]) => {
      switch (altDesc) {
        case AltitudeRestrictionType.AtOrAbove:
          return `Cross ${this.legData.leg.leg.fixIcaoStruct.ident} at or above ${altitude1}`;
        case AltitudeRestrictionType.AtOrBelow:
          return `Cross ${this.legData.leg.leg.fixIcaoStruct.ident} at or below ${altitude1}`;
        case AltitudeRestrictionType.Between:
          return `Cross ${this.legData.leg.leg.fixIcaoStruct.ident} between ${altitude2} and ${altitude1}`;
        case AltitudeRestrictionType.At:
          return `Cross ${this.legData.leg.leg.fixIcaoStruct.ident} at ${altitude1}`;
        default:
          return '';
      }
    },
    this.legData.altDesc,
    this.legData.altitude1Display,
    this.legData.altitude2Display,
  ).withLifecycle(this.defaultLifecycle);

  private readonly airportIdent = this.props.store.destinationIdent.map((v) => v ?? '').withLifecycle(this.defaultLifecycle);
  private readonly airportFacility = this.props.store.destinationFacility;
  private readonly airportName = MappedSubject.create(([airportFacility]) => Utils.Translate(airportFacility?.name ?? ''), this.airportFacility).withLifecycle(this.defaultLifecycle);

  private readonly runway = this.props.store.destinationRunwayName.map((v) => v ?? '').withLifecycle(this.defaultLifecycle);

  private readonly hideCrossAltitude = MappedSubject.create(
    ([isInEditMode, altDesc]) => FmsUtils.isAltitudeLeg(this.legData.leg.leg.type) || isInEditMode || altDesc === AltitudeRestrictionType.Unused,
    this.isInEditMode,
    this.legData.altDesc,
  ).withLifecycle(this.defaultLifecycle);

  private readonly isApproachSelected = this.props.store.approachProcedure.map(app => app != null).withLifecycle(this.defaultLifecycle);

  private readonly hasNoArrivals = this.props.store.destinationArrivals.map((v) => v.length < 1).withLifecycle(this.defaultLifecycle);
  private readonly hasNoApproaches = this.props.store.destinationApproaches.map((v) => v.length < 1).withLifecycle(this.defaultLifecycle);

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

  // FIXME show pending arrival selections
  private readonly arrName = MappedSubject.create(
    ([arr, arrTrans]) => {
      if (arr) {
        // FIXME when a departure is pending it should be shown, and with '-----' as transition until one is selected
        // The None case does not show anything for transition.
        if (arr.enRouteTransitions.length > 0 && arrTrans) {
          return `${arrTrans.name}.${arr.name}`;
        } else {
          return arr.name;
        }
      }
      return '';
    },
    this.props.store.arrivalProcedure,
    this.props.store.arrivalTransition
  ).withLifecycle(this.defaultLifecycle);

  /**
   * App label: "Transition.App" for instrument, "Visual XX" for visual.
   */
  // FIXME should show pending app selections
  private readonly appName = MappedSubject.create(
    ([app, transitionIndex]) => {
      if (app) {
        const approachName = IfdApproachUtils.getApproachName(app);
        const isVisual =
          app.approachType === AdditionalApproachType.APPROACH_TYPE_VISUAL;

        // Visual shows ----- for transition until entry chosen, then just the "Visual x(x)" once chosen.
        if (isVisual) {
          return transitionIndex === ApproachTransitionType.NotSelected ? `-----.${approachName}` : approachName;
        }

        switch (transitionIndex) {
          case ApproachTransitionType.NotSelected:
            return `-----.${approachName}`;
          case ApproachTransitionType.VectorsToFinal:
            return `Vectors.${approachName}`;
          default:
            return `${app.transitions[transitionIndex]?.name ?? '-----'}.${approachName}`;
        }
      }
      return '';
    },
    this.props.store.approachProcedure,
    this.props.store.approachTransitionIndex,
  ).withLifecycle(this.defaultLifecycle);

  private readonly hasNoChart = this.props.store.destinationChart.map((v) => !v).withLifecycle(this.defaultLifecycle);

  private hideAirportFlag = Subject.create(false);
  private airportFlag = Subject.create('----');
  private airportFlagColor = '00f502';

  /** @inheritdoc */
  protected readonly fieldIndexes = {
    arrival: DestinationFieldIndex.Arrival,
    approach: DestinationFieldIndex.Approach,
    airport: DestinationFieldIndex.Airport,
    runway: DestinationFieldIndex.Runway,
    altConstraintType: DestinationFieldIndex.AltConstraintType,
    altConstraint2: DestinationFieldIndex.AltConstraint2,
    altConstraint1: DestinationFieldIndex.AltConstraint1,
  };

  private static readonly constraintMenuItems: [AltitudeRestrictionType, string][] = [
    [AltitudeRestrictionType.AtOrBelow, 'at or below'],
    [AltitudeRestrictionType.At, 'at'],
    [AltitudeRestrictionType.AtOrAbove, 'at or above'],
    [AltitudeRestrictionType.Between, 'between'],
  ];

  /**
   * Opens the context menu for choosing the constraint type
   */
  private openConstraintTypeMenu(): void {
    const pos = { xCoord: 175, yCoord: 100 };

    this.props.menuController.clearMenu();
    this.props.menuController.addGroup(undefined, DestinationBlock.constraintMenuItems.map((item) => ({
      name: item[1],
      confirmHandler: () => this.setConstraint(item[0]),
    })));
    const selectedType = this.altitudeConstraintType.get();
    const selectedItemIndex = DestinationBlock.constraintMenuItems.findIndex((item) => item[0] === selectedType);
    if (selectedItemIndex >= 0) {
      this.props.menuController.setSelectedOption(selectedItemIndex);
    }
    this.props.menuController.showAt(pos);
  }

  private readonly canEditAltConstraint = this.isApproachSelected.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle);
  private readonly canEditAltConstraint2 = MappedSubject.create(
    ([altConstraintTypeRef, isApproachSelected]) => altConstraintTypeRef === AltitudeRestrictionType.Between && !isApproachSelected,
    this.altitudeConstraintType,
    this.isApproachSelected,
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  protected readonly fields: Record<string, EditableField> = {
    arrival: {
      ref: this.arrivalFieldRef,
      getValue: () => this.arrName.get(),
      canEdit: Subject.create(true),
      type: 'menu',
      onMenuOpen: () => this.onEditArrival()
    },
    approach: {
      ref: this.approachFieldRef,
      getValue: () => this.appName.get(),
      canEdit: Subject.create(true),
      type: 'menu',
      onMenuOpen: () => this.onEditApproach()
    },
    airport: {
      ref: this.airportFieldRef,
      getValue: () => this.airportIdent.get(),
      canEdit: Subject.create(true),
      type: 'text',
      onEdit: (value: string) => {
        this.props.onReplaceDestination(value);
      }
    },
    runway: {
      ref: this.runwayFieldRef,
      getValue: () => this.runway.get(),
      canEdit: Subject.create(true),
      type: 'menu',
      onMenuOpen: () => this.onEditDestinationRunway()
    },
    altConstraintType: {
      ref: this.altConstraintTypeRef,
      getValue: () => this.altitudeConstraintTypeText.get(),
      canEdit: this.canEditAltConstraint,
      type: 'menu',
      onMenuOpen: () => this.openConstraintTypeMenu()
    },
    altConstraint1: {
      ref: this.altConstraint1RootRef,
      getValue: () => this.altitude1.get().asUnit(UnitType.FOOT).toString(),
      canEdit: this.canEditAltConstraint,
      fieldRef: this.altConstraint1Ref,
      type: 'number',
      onEdit: (value: string) => {
        this.altConstraint1Ref.instance.setKeyboardInputValue(value);
      }
    },
    altConstraint2: {
      ref: this.altConstraint2RootRef,
      getValue: () => this.altitude2.get().asUnit(UnitType.FOOT).toString(),
      canEdit: this.canEditAltConstraint2,
      fieldRef: this.altConstraint2Ref,
      type: 'number',
      onEdit: (value: string) => {
        this.altConstraint2Ref.instance.setKeyboardInputValue(value);
      }
    },
  };

  /** Opens the Arrival menu for this destination. */
  public onEditArrival = (): void => {
    const isInSidebarMode = this.props.isInSidebarMode.get();
    const blockPosition: Position = {
      xCoord: isInSidebarMode ? 295 : 175,
      yCoord: isInSidebarMode ? 5 : 15,
    };
    this.props.menuController.setPosition(blockPosition);
    this.props.menuController.showArrivalMenu();
  };

  /** Opens the Approach menu for this destination. */
  public onEditApproach = (): void => {
    const isInSidebarMode = this.props.isInSidebarMode.get();
    const blockPosition: Position = {
      xCoord: isInSidebarMode ? 295 : 175,
      yCoord: isInSidebarMode ? 5 : 15,
    };
    this.props.menuController.setPosition(blockPosition);
    this.props.menuController.showApproachMenu();
  };

  private onEditDestinationRunway = (): void => {
    const isInSidebarMode = this.props.isInSidebarMode.get();

    const blockPosition: Position = {
      xCoord: isInSidebarMode ? 295 : 175,
      yCoord: isInSidebarMode ? 5 : 15
    };

    this.props.menuController.setPosition(blockPosition);
    this.props.menuController.showDestinationRunwayMenu();
  };

  private readonly onChartClicked = async (): Promise<void> => {
    if (!this._isSelected.get()) {
      return;
    }

    const chart = this.props.store.destinationChart.get();

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

  /**
   * Update the edit mode based on the selected field index.
   * Base implementation - can be overridden by subclasses for custom logic.
   */
  protected updateEditMode(): void {
    if (!this.isSelected.get()) {
      this.isInEditMode.set(false);
      this.isInEntryMode.set(false);
      return;
    }

    this.isInEditMode.set(true);
  }

  /**
   * Sets the constraint on the leg
   * @param constraintType Optionally a new constraint type to set.
   */
  public setConstraint(constraintType?: AltitudeRestrictionType): void {
    if (constraintType !== undefined) {
      this.altitudeConstraintType.set(constraintType);
    }

    let altitude1Meters = this.altitude1.get().asUnit(UnitType.METER);
    let altitude2Meters = this.altitude2.get().number > 0 ? this.altitude2.get().asUnit(UnitType.METER) : undefined;

    if (isNaN(altitude1Meters)) {
      altitude1Meters = 0;
    }
    if (altitude2Meters !== undefined && isNaN(altitude2Meters)) {
      altitude2Meters = undefined;
    }

    const fmsSettingManager = FmsUserSettings.getManager(this.props.bus);
    const transMetres = UnitType.METER.convertFrom(fmsSettingManager.getSetting(this.legData.leg.verticalData.phase === VerticalFlightPhase.Climb ? 'transitionAltitude' : 'transitionLevel').get(), UnitType.FOOT);

    this.props.fms.setUserConstraintAdvanced(
      this.legData.segment.segmentIndex,
      this.legData.segmentLegIndex.get(),
      this.legData.leg.verticalData.phase,
      this.altitudeConstraintType.get(),
      altitude1Meters,
      altitude1Meters >= transMetres,
      altitude2Meters,
      altitude2Meters === undefined ? undefined : altitude2Meters >= transMetres,
    );
    this.props.menuController.hide();
  }

  /**
   * Returns the current global leg index of this destination's leg.
   * @returns The global leg index, or -1 if unavailable.
   */
  public get globalLegIndex(): number {
    const gi = this.legData?.globalLegIndex?.get?.();
    return typeof gi === 'number' ? gi : -1;
  }

  /** @inheritdoc */
  protected override getNextEditableFieldIndex(current: number, delta: 1 | -1): number {
    const next = super.getNextEditableFieldIndex(current, delta);
    // Skip AltConstraint1 when type != Between
    if (next === DestinationFieldIndex.AltConstraint2 && this.altitudeConstraintType.get() !== AltitudeRestrictionType.Between) {
      return super.getNextEditableFieldIndex(next, delta);
    }
    return next;
  }

  /** @inheritdoc */
  public override onInteractionEvent(event: IfdInteractionEvent): boolean {
    // Give the cursor after the block a try first (it will return false if not selected).
    if (this.props.data.cursorAfterRef.getOrDefault()?.onInteractionEvent(event)) {
      return true;
    }
    return super.onInteractionEvent(event);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'wt-ifd-leg-block': true,
          'destination-leg-block': true,
          'leg-block-selected': this.isSelected,
          'mini-leg-format': this.miniFplFormatStyle
        }}
        ref={this.blockRef}
      >
        <div class="leg-block-procedure-row">
          <div style={{ display: 'flex', width: '43%' }} class={{ 'invisible': this.hasNoArrivals }}>
            <div class="leg-block-procedure-label leg-block-arr-app-label">Arr:</div>
            <div
              class={this.createFieldClasses(DestinationFieldIndex.Arrival, {
                'leg-block-arr-app-field': true,
              })}
              ref={this.arrivalFieldRef}
            >
              {this.arrName}
            </div>
          </div>
          <div style={{ display: 'flex', width: '55%', marginLeft: 'auto' }} class={{ 'invisible': this.hasNoApproaches }}>
            <div class="leg-block-procedure-label leg-block-arr-app-label">App:</div>
            <div
              class={this.createFieldClasses(DestinationFieldIndex.Approach, {
                'leg-block-arr-app-field': true,
              })}
              ref={this.approachFieldRef}
            >
              {this.appName}
            </div>
          </div>
        </div>
        <div class="leg-block-top-row">Destination</div>
        <div
          class="leg-block-data-row leg-block-airport-row"
        >
          <div class="leg-block-arrow-icon"><LegBlockArrowIcon fillColor="003466" /></div>
          <div
            class={this.createFieldClasses(DestinationFieldIndex.Airport, {
              'leg-block-airport-field': true,
            })}
            ref={this.airportFieldRef}
          >
            <span
              class={{
                'mini-fpl-origin': true,
                'hidden': this.miniFplFormatStyle.map((v) => !v)
              }}
            >Destination </span>
            {this.airportIdent}
          </div>
          <div class="leg-block-info-text leg-block-rwy-text">Rwy:</div>
          <div
            class={this.createFieldClasses(DestinationFieldIndex.Runway, {
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
          </div>
          <div class="leg-block-info-text leg-block-info-dist">
            <span class="leg-block-white-text">{this.distance}</span>
            <span class="leg-block-unit-text">{this.distanceUnits}</span>
            <span
              class={{ 'mini-fpl-time-dashes': true, 'leg-block-white-text': true, 'hidden': this.miniFplFormatStyle.map((v) => !v) }}
            >---</span>
          </div>
        </div>
        <div class={{ 'leg-block-airport-name': true, 'hidden': this.isApproachSelected.map(it => !it) }}>{this.airportName}</div>
        <div
          class={{
            'leg-block-alt-constraint': true,
            'hidden': MappedSubject.create(([isInEditMode, isApproachSelected]) => !isInEditMode || isApproachSelected, this.isInEditMode, this.isApproachSelected).withLifecycle(this.defaultLifecycle),
          }}
        >
          <div>Cross </div>
          {this.airportIdent}
          <div
            ref={this.altConstraintTypeRef}
            class={this.createFieldClasses(DestinationFieldIndex.AltConstraintType)}
            style={{ 'width': '84px', 'text-align': 'center', 'margin-left': '18px', 'margin-right': '3px' }}
          >
            {this.altitudeConstraintTypeText}
          </div>
          <AltitudeField
            style={{ 'width': '60px', 'padding-left': '7px' }}
            hidden={this.altitudeConstraintType.map((v) => v !== AltitudeRestrictionType.Between)}
            value={this.altitude2}
            ref={this.altConstraint2Ref}
            rootRef={this.altConstraint2RootRef}
            onCommit={(altitude2) => {
              this.altitude2.set(altitude2);
              this.setConstraint();
              this.gotoNextField();
            }}
            bus={this.props.bus}
            isInEntryMode={this.isInEntryMode}
            isSelected={this.selectedFieldIndex.map(v => v === DestinationFieldIndex.AltConstraint2)}
            verticalPhase={this.legData.vnavPhase}
          />
          <span class={{
            'hidden': this.altitudeConstraintType.map((v) => v !== AltitudeRestrictionType.Between),
          }}>and</span>
          <AltitudeField
            style={{ 'width': '60px', 'padding-left': '7px' }}
            value={this.altitude1}
            ref={this.altConstraint1Ref}
            rootRef={this.altConstraint1RootRef}
            onCommit={(altitude1) => {
              this.altitude1.set(altitude1);
              this.setConstraint();
              this.gotoNextField();
            }}
            bus={this.props.bus}
            isInEntryMode={this.isInEntryMode}
            isSelected={this.selectedFieldIndex.map(v => v === DestinationFieldIndex.AltConstraint1)}
            verticalPhase={this.legData.vnavPhase}
          />
        </div>

        <div
          class={{
            'leg-block-alt-constraint': true,
            'leg-block-white-text': true,
            'hidden': MappedSubject.create(([hideCrossAltitude, isApproachSelected]) => hideCrossAltitude || isApproachSelected, this.hideCrossAltitude, this.isApproachSelected).withLifecycle(this.defaultLifecycle),
          }}
        >
          {this.verticalInstruction}
        </div>
        <div
          class={{
            'leg-block-procedure-button': true,
            'leg-block-black-field': this.isInEditMode,
            'hidden': this.hasNoChart,
          }}
          style={{ 'margin-top': '24px' }}
          ref={this.chartIconRef}
        >
          <ProcedureIcon />
        </div>
        <div
          class={{
            'leg-block-airport-flag-container': true,
            'hidden': this.hideAirportFlag
          }}
          style={{ 'top': '35px' }}
        >
          <AirportFlag airportICAO={this.airportFlag} flagColor={this.airportFlagColor} />
        </div>
        <div ref={this.inputPlaceholderRef} class="hidden" />
      </div>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    this.props.data.cursorAfterRef.getOrDefault()?.destroy();
    super.destroy();
  }
}

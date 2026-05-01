import {
  AltitudeRestrictionType, FlightPlanLeg, FSComponent, LegTurnDirection, MappedSubject, NodeReference, NumberUnitSubject, Subject, SubscribableMapFunctions,
  Unit, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { LegBlockArrowIcon } from '../../../../Assets/SVGs/LegBlockArrowIcon';
import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { FlightPlanLegData } from '../../../../FlightPlan';
import { AirportFlag } from './AirportFlag';
import { AltitudeField } from './AltitudeField';
import { EditableField } from './BaseEditableBlock';
import { BaseLegBlock, BaseLegBlockProps } from './BaseLegBlock';
import { HoldField } from './HoldField';
import { LabelField } from './LabelField';
import { LegBlockBottomRowData } from './LegBlockBottomRowData';

import './LegBlock.css';

/** The properties for the {@link HoldBlock} component. */
export interface HoldBlockProps extends BaseLegBlockProps {
  /** Ref to the HoldBlock component. */
  readonly ref: NodeReference<HoldBlock>;
  /** A callback to modify the hold in the flight plan. */
  readonly modifyHold: (
    holdLegDefinition: Partial<FlightPlanLeg>, legData: FlightPlanLegData, nextFieldIndex: number
  ) => void;
}

/** The hold block cursor state **/
export enum LegFieldIndex {
  Unselected = -1,
  HoldTurn,
  HoldDistance,
  HoldDistanceUnit,
  HoldCourse,
  Terminus,
  AltConstraintType,
  AltConstraint2,
  AltConstraint1,
}

/** The HoldBlock component. */
export class HoldBlock extends BaseLegBlock<HoldBlockProps> {
  private readonly altConstraint1Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint2Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint1RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraint2RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraintTypeRef = FSComponent.createRef<HTMLDivElement>();
  private readonly textInputRef = FSComponent.createRef<HTMLDivElement>();
  private readonly holdTurnRef = FSComponent.createRef<LabelField>();
  private readonly holdTurnDivRef = FSComponent.createRef<HTMLDivElement>();
  private readonly holdDistanceRef = FSComponent.createRef<HoldField<UnitFamily.Distance>>();
  private readonly holdDistanceDivRef = FSComponent.createRef<HTMLDivElement>();
  private readonly holdDistanceUnitRef = FSComponent.createRef<LabelField>();
  private readonly holdDistanceUnitDivRef = FSComponent.createRef<HTMLDivElement>();
  private readonly holdCourseRef = FSComponent.createRef<HoldField<UnitFamily.Angle>>();
  private readonly holdCourseDivRef = FSComponent.createRef<HTMLDivElement>();

  private readonly holdLegTurn = Subject.create(this.legData.leg.leg.turnDirection === LegTurnDirection.Left ? 'Left' : 'Right');

  private readonly holdLegDistanceLabel = Subject.create<'MIN' | 'NM'>(this.legData.leg.leg.distanceMinutes ? 'MIN' : 'NM');
  // FIXME fix HoldField to not require a NumberUnitSubject then make this a normal subject rather than this hack of storing minutes as NM
  /** The distance in minutes if holdLegDistanceLabel is 'MIN', or nautical miles if it is 'NM'. */
  private readonly holdLegDistanceValue = NumberUnitSubject.create<UnitFamily.Distance, Unit<UnitFamily.Distance>>(UnitType.NMILE.createNumber(
    this.legData.leg.leg.distanceMinutes ?
      this.legData.leg.leg.distance :
      UnitType.NMILE.convertFrom(this.legData.leg.leg.distance, UnitType.METER)
  ));

  private readonly holdCourse = NumberUnitSubject.create<UnitFamily.Angle, Unit<UnitFamily.Angle>>(
    UnitType.DEGREE.createNumber(this.legData.magneticCourseRounded.get())
  );

  private holdDistanceFieldType = this.holdLegDistanceLabel.map((v) => v === 'NM' ? 'nm' : 'minute');

  private readonly distanceDisplay = MappedSubject.create(
    ([legDistanceM, segmentDistance, unit, isVisibleCollapsedLeg]): string => {
      // Hold leg distance is always NM regardless of unit settings
      const convertedDist = isVisibleCollapsedLeg
        ? segmentDistance.asUnit(unit)
        : UnitType.NMILE.convertFrom(legDistanceM.number, UnitType.METER);
      const decimals = convertedDist < 100 ? 1 : 0;
      const roundedDistanceNM = Math.round(convertedDist * Math.pow(10, decimals)) / Math.pow(10, decimals);
      return isNaN(roundedDistanceNM) ? '-- ' : roundedDistanceNM.toFixed(decimals);
    },
    this.legData.distance,
    this.legData.segmentData.distance,
    this.unitsSettingManager.distanceUnitsLarge,
    this.legData.isVisibleCollapsedLeg,
  ).withLifecycle(this.defaultLifecycle);

  private readonly distanceUnits = MappedSubject.create(([distanceUnitsLarge, isVisibleCollapsedLeg]) => {
    return isVisibleCollapsedLeg
      ? UnitFormatter.unitLabel<UnitFamily.Distance>(distanceUnitsLarge)
      : 'NM';
  },
    this.unitsSettingManager.distanceUnitsLarge,
    this.legData.isVisibleCollapsedLeg
  ).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  protected readonly fieldIndexes = {
    terminus: LegFieldIndex.Terminus,
    holdTurn: LegFieldIndex.HoldTurn,
    holdDistance: LegFieldIndex.HoldDistance,
    holdDistanceUnit: LegFieldIndex.HoldDistanceUnit,
    holdCourse: LegFieldIndex.HoldCourse,
    altConstraintType: LegFieldIndex.AltConstraintType,
    altConstraint1: LegFieldIndex.AltConstraint1,
    altConstraint2: LegFieldIndex.AltConstraint2,
  };

  /** @inheritdoc */
  protected readonly fields: Record<string, EditableField> = {
    terminus: {
      ref: this.textInputRef,
      getValue: () => this.legTerminus.get(),
      canEdit: false,
      type: 'text'
    },
    holdTurn: {
      ref: this.holdTurnDivRef,
      fieldRef: this.holdTurnRef,
      getValue: () => this.holdLegTurn.get(),
      canEdit: true,
      type: 'label',
      onEdit: (value: string, event) => {
        if (!event || !(event instanceof MouseEvent)) {
          this.gotoNextField();
        } else {
          const newDirection = (value) === 'Left' ? 'Right' : 'Left';
          this.holdLegTurn.set(newDirection);
          this._selectedFieldIndex.set(LegFieldIndex.HoldTurn);
        }
        this.updateHoldLeg();
      }
    },
    holdDistance: {
      ref: this.holdDistanceDivRef,
      fieldRef: this.holdDistanceRef,
      getValue: () => this.holdLegDistanceValue.get().number.toFixed(1),
      canEdit: true,
      type: this.holdDistanceFieldType,
      onEdit: (value: string) => {
        this.updateHoldDistance(value);
        this.updateHoldLeg();
      }
    },
    holdDistanceUnit: {
      ref: this.holdDistanceUnitDivRef,
      fieldRef: this.holdDistanceUnitRef,
      getValue: () => this.holdLegDistanceLabel.get(),
      canEdit: true,
      type: 'label',
      onEdit: (value: string, event) => {
        if (!event || !(event instanceof MouseEvent)) {
          this.gotoNextField();
        } else {
          this.holdLegDistanceLabel.set(value === 'MIN' ? 'NM' : 'MIN');
          this._selectedFieldIndex.set(LegFieldIndex.HoldDistanceUnit);
        }
        this.updateHoldLeg();
      }
    },
    holdCourse: {
      ref: this.holdCourseDivRef,
      fieldRef: this.holdCourseRef,
      getValue: () => this.holdCourse.get().number.toString(),
      canEdit: true,
      type: 'degrees',
      onEdit: (value: string) => {
        this.updateHoldCourse(value);
        this.updateHoldLeg();
      }
    },
    altConstraintType: {
      ref: this.altConstraintTypeRef,
      getValue: () => this.altitudeConstraintTypeText.get(),
      canEdit: true,
      type: 'menu',
      onMenuOpen: () => this.openConstraintTypeMenu()
    },
    altConstraint1: {
      ref: this.altConstraint1RootRef,
      fieldRef: this.altConstraint1Ref,
      getValue: () => this.altitude1.get().asUnit(UnitType.FOOT).toString(),
      canEdit: true,
      type: 'number',
      onEdit: (value: string) => {
        this.altConstraint1Ref.instance.setKeyboardInputValue(value);
      }
    },
    altConstraint2: {
      ref: this.altConstraint2RootRef,
      fieldRef: this.altConstraint2Ref,
      getValue: () => this.altitude1.get().asUnit(UnitType.FOOT).toString(),
      canEdit: this.altitudeConstraintType.map((v) => v === AltitudeRestrictionType.Between).withLifecycle(this.defaultLifecycle),
      type: 'number',
      onEdit: (value: string) => {
        this.altConstraint2Ref.instance.setKeyboardInputValue(value);
      }
    },
  };

  /**
   * Update the hold leg
   */
  protected updateHoldLeg(): void {
    const current = this._selectedFieldIndex.get();
    const distanceMinutes = this.holdLegDistanceLabel.get() === 'MIN';

    this.props.modifyHold(
      {
        course: this.holdCourse.get().number,
        turnDirection: (this.holdLegTurn.get() === 'Left') ? LegTurnDirection.Left : LegTurnDirection.Right,
        distance: distanceMinutes
          ? this.holdLegDistanceValue.get().number
          : this.holdLegDistanceValue.get().asUnit(UnitType.METER),
        distanceMinutes,
      },
      this.legData,
      this.getNextEditableFieldIndex(current, 1)
    );
  }

  /**
   * Update the hold distance
   * @param value the hold distance
   */
  protected updateHoldDistance(value: string): void {
    const distance = parseFloat(value);
    if (isFinite(distance)) {
      this.holdLegDistanceValue.set(distance);
    }
  }

  /**
   * Update the hold course
   * @param value the hold course
   */
  protected updateHoldCourse(value: string): void {
    this.holdCourse.set(Number(value ?? 0));
  }

  /** @inheritdoc */
  protected override getNextEditableFieldIndex(current: number, delta: 1 | -1): number {
    const next = super.getNextEditableFieldIndex(current, delta);
    // Skip AltConstraint1 when type != Between
    if (next === LegFieldIndex.AltConstraint2 && this.altitudeConstraintType.get() !== AltitudeRestrictionType.Between) {
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

    // Handle special outer knob navigation for empty blocks
    if (!this.isInEntryMode.get() && !this.keyboardState.keyboardVisible.get()) {

      switch (event) {
        case IfdInteractionEvent.RightKnobInnerDec: {
          const current = this._selectedFieldIndex.get();
          const next = this.getNextEditableFieldIndex(current, -1);
          if (next >= 0) {
            this._selectedFieldIndex.set(next);
            return true;
          }
          // Already at top field, do nothing, list will then go to previous leg
          return false;
        }

        case IfdInteractionEvent.RightKnobInnerInc: {
          const current = this._selectedFieldIndex.get();
          const next = this.getNextEditableFieldIndex(current, +1);
          if (next >= 0) {
            this._selectedFieldIndex.set(next);
            return true;
          }
          // Already at last field, do nothing, list will then go to next leg
          return false;
        }

        /** Handles stepping into before/after empty blocks */
        case IfdInteractionEvent.RightKnobOuterInc:
          // Move to next block, changing field to unselected is handled by onBlur
          return false;

        case IfdInteractionEvent.RightKnobOuterDec:
          // Move to previous block, changing field to unselected is handled by onBlur
          return false;

        default:
          return super.onInteractionEvent(event);
      }
    } else if (this.selectedFieldIndex.get() === LegFieldIndex.AltConstraint1) {
      if (this.altConstraint1Ref.getOrDefault()?.onInteractionEvent(event)) {
        return true;
      }
    } else if (this.selectedFieldIndex.get() === LegFieldIndex.AltConstraint2) {
      if (this.altConstraint2Ref.getOrDefault()?.onInteractionEvent(event)) {
        return true;
      }
    }

    return super.onInteractionEvent(event);
  }

  /**
   * Render distance info
   * @param isTopRow Whether this is for the top row or not.
   * @returns VNode
   */
  public renderLegBlockDistance = (isTopRow: boolean): VNode => {
    // "To:" is never displayed on a hold leg
    const toLabel = this.legData.isVisibleCollapsedLeg.map((isVisibleCollapsedLeg) => {
      return isVisibleCollapsedLeg ? 'Proc:' : '';
    }).withLifecycle(this.defaultLifecycle);

    return (<>
      <div
        class={{
          'leg-block-normal-row': this.legData.isVisibleCollapsedLeg.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle),
          'leg-block-normal-top-row': true,
          'leg-block-row-active': this.legData.isActiveLeg,
          'hidden': isTopRow && this.legData.isVisibleCollapsedLeg.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle)
        }}
      >
        <div style={{ 'width': '50%' }}>
          <span class="leg-block-white-text"><span class="leg-block-to-label">{toLabel}</span> {this.distanceDisplay}</span>
          <span class="leg-block-unit-text">{this.distanceUnits}</span>
        </div>
        <div class="leg-block-ete">
          <div
            class="leg-block-white-text"
            style={{ 'margin-left': 'auto' }}
          >
            {this.eteString}
          </div>
          <div class="leg-block-unit-text">
            {this.eteUnits}
          </div>
        </div>
      </div>
    </>);
  };


  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.legData.magneticCourseRounded.sub((v) => this.holdCourse.set(v)).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public render(): VNode {
    const viaText = MappedSubject.create(([isVisibleCollapsedLeg, viaInstruction, procedureName]) => {
      return isVisibleCollapsedLeg ? procedureName : viaInstruction;
    }, this.legData.isVisibleCollapsedLeg, this.viaInstruction, this.legData.segmentData.procedureNameLong).withLifecycle(this.defaultLifecycle);

    return (
      <>
        <div
          ref={this.blockRef}
          class={{
            'wt-ifd-leg-block': true,
            'normal-leg-block': true,
            'hold-leg-block': this.legData.isVisibleCollapsedLeg.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle),
            'leg-block-selected': this.isSelected,
            'leg-block-active': this.legData.isActiveLeg,
            'mini-leg-format': this.miniFplFormatStyle,
            'collapsed-leg': this.legData.isVisibleCollapsedLeg,
          }}
        >
          <div class="leg-row-distance">
            <div class="leg-block-top-row">{viaText}</div>
            {this.renderLegBlockDistance(true)}
            <div
              class={{
                'leg-block-normal-row': this.legData.isVisibleCollapsedLeg.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle),
                'leg-block-normal-top-row': true,
                'leg-block-row-active': this.legData.isActiveLeg,
                'hidden': this.legData.isVisibleCollapsedLeg,
              }}
            >
              <div style={{ 'width': '30%', 'text-align': 'center' }}>
                <LabelField
                  options={['Left', 'Right']}
                  value={this.holdLegTurn}
                  isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.HoldTurn)}
                  bus={this.props.bus}
                  isInEntryMode={this.isInEntryMode}
                  ref={this.holdTurnRef}
                  divRef={this.holdTurnDivRef}
                  onCommit={(value) => {
                    this.holdLegTurn.set(value);
                    this.updateHoldLeg();
                  }}
                  isInEditMode={this.isInEditMode}
                />
              </div>
              <div class="hold-leg-distance">
                <svg viewBox="0 0 32.05 41.14" xmlns="http://www.w3.org/2000/svg" class="hold-left-end">
                  <g>
                    <polygon class="hold-end"
                      points="31.6 16.4 8.35 16.4 8.35 0 0 0 0 41.14 8.35 41.14 8.35 24.75 31.6 24.75 31.6 16.4" />
                  </g>
                </svg>
                <HoldField
                  value={this.holdLegDistanceValue}
                  minValue={0}
                  maxValue={20}
                  innerIncrement={0.1}
                  outerIncrement={1.0}
                  decimalPlaces={1}
                  isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.HoldDistance)}
                  bus={this.props.bus}
                  isInEntryMode={this.isInEntryMode}
                  divRef={this.holdDistanceDivRef}
                  ref={this.holdDistanceRef}
                  onCommit={(value) => {
                    this.updateHoldDistance(value);
                    this.updateHoldLeg();
                    this.gotoNextField();
                  }}
                  isInEditMode={this.isInEditMode}
                />
                <LabelField
                  options={['MIN', 'NM']}
                  value={this.holdLegDistanceLabel}
                  isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.HoldDistanceUnit)}
                  bus={this.props.bus}
                  isInEntryMode={this.isInEntryMode}
                  ref={this.holdDistanceUnitRef}
                  divRef={this.holdDistanceUnitDivRef}
                  onCommit={(value) => {
                    if (value === 'MIN' || value === 'NM') {
                      this.holdLegDistanceLabel.set(value);
                      this.updateHoldLeg();
                    }
                  }}
                  isInEditMode={this.isInEditMode}
                />
                <svg viewBox="0 0 32.05 41.14" xmlns="http://www.w3.org/2000/svg" class="hold-right-end">
                  <g>
                    <polygon class="hold-end"
                      points="0 16.4 23.25 16.4 23.25 0 31.6 0 31.6 41.14 23.25 41.14 23.25 24.75 0 24.75 0 16.4" />
                  </g>
                </svg>
              </div>
            </div>
          </div>
          <div
            class={{
              'leg-block-data-row': true,
              'leg-block-normal-row': true,
              'leg-block-normal-bottom-row': true,
              'leg-block-row-active': this.legData.isActiveLeg,
            }}
          >
            <div
              class={{
                'leg-block-arrow-icon': true,
                'hidden': this.legData.isActiveLeg,
              }}
            >
              <LegBlockArrowIcon fillColor="333333" />
            </div>
            <div
              class={{
                'leg-block-arrow-icon': true,
                'hidden': this.legData.isActiveLeg.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle),
              }}
            >
              <LegBlockArrowIcon fillColor="660066" />
            </div>
            <div
              class={this.createFieldClasses(LegFieldIndex.Terminus, {
                'leg-block-airport-field': true
              })}
              ref={this.textInputRef}
            >
              <span
                class={{
                  'mini-fpl-origin': true,
                  'hidden': MappedSubject.create(([miniFplFormatStyle, isSelected, isVisibleCollapsedLeg]) => {
                    return !miniFplFormatStyle || isSelected || isVisibleCollapsedLeg;
                  }, this.miniFplFormatStyle, this.isSelected, this.legData.isVisibleCollapsedLeg).withLifecycle(this.defaultLifecycle),
                }}
              >{this.viaInstruction} </span>
              <span class='leg-block-terminus'>{this.legNameDisplay}</span>
            </div>
            <LegBlockBottomRowData
              isVisible={this.legData.isVisibleCollapsedLeg}
              fuelQuantity={this.fuelQty}
              fuelUnitDisplay={this.fuelUnitDisplay}
              eta={this.eta}
              am_pm={this.am_pm}
            />
            <div
              class={{
                'leg-block-normal-bottom-row-data': true,
                'hidden': this.legData.isVisibleCollapsedLeg
              }}
            >
              <div>
                <span>Turns</span>
              </div>
              <div style={{ 'display': 'flex', 'margin-left': 'auto' }}>
                <div
                  class="leg-block-white-text hold-leg-angle"
                  style={{ 'margin-left': 'auto' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88.84 54.01" class={{
                    'hold-turn-indicator': true,
                    'hold-turn-indicator-right': this.holdLegTurn.map((v) => v === 'Right').withLifecycle(this.defaultLifecycle)
                  }}>
                    <g>
                      <polygon class="hold-turn-indicator-icon"
                        points="45.02 11.73 32.34 0 32.34 7.29 0 7.29 0 16.17 32.34 16.17 32.34 23.3 45.02 11.73" />
                      <path class="hold-turn-indicator-icon"
                        d="M65.52,54.01l-6.88-13.76c-.58-1.16-1.52-2.1-2.68-2.68l-13.76-6.88,13.76-6.88c1.16-.58,2.1-1.52,2.68-2.68l6.88-13.76,6.88,13.76c.58,1.16,1.52,2.1,2.68,2.68l13.76,6.88-13.76,6.88c-1.16.58-2.1,1.52-2.68,2.68l-6.88,13.76Z" />
                    </g>
                  </svg>
                  <HoldField<UnitFamily.Angle>
                    value={this.holdCourse}
                    minValue={0}
                    maxValue={360}
                    innerIncrement={1}
                    outerIncrement={10}
                    decimalPlaces={0}
                    isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.HoldCourse)}
                    bus={this.props.bus}
                    unit={'°'}
                    isInEntryMode={this.isInEntryMode}
                    divRef={this.holdCourseDivRef}
                    ref={this.holdCourseRef}
                    wrap
                    onCommit={(value) => {
                      this.updateHoldCourse(value);
                      this.updateHoldLeg();
                      this.gotoNextField();
                    }}
                    isInEditMode={this.isInEditMode}
                  />
                </div>
              </div>
            </div>
            <div class={{
              'hidden': this.miniFplFormatStyle.map((v) => !v).withLifecycle(this.defaultLifecycle),
              'mini-fpl-distance': true
            }}>{this.renderLegBlockDistance(false)}</div>
          </div>

          <div
            class={{
              'leg-block-alt-constraint': true,
              'hidden': this.isInEditMode.map(edit => edit ? false : true).withLifecycle(this.defaultLifecycle),
            }}
          >
            <div>{this.crossingInstruction}</div>
            <div
              ref={this.altConstraintTypeRef}
              class={this.createFieldClasses(LegFieldIndex.AltConstraintType)}
              style={{ 'width': '84px', 'text-align': 'center', 'margin-left': '18px', 'margin-right': '3px' }}
            >
              {this.altitudeConstraintTypeText}
            </div>
            <AltitudeField
              style={{ 'width': '60px', 'padding-left': '7px' }}
              hidden={this.altitudeConstraintType.map((v) => v !== AltitudeRestrictionType.Between).withLifecycle(this.defaultLifecycle)}
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
              isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.AltConstraint2)}
              verticalPhase={this.legData.vnavPhase}
            />
            <span class={{
              'hidden': this.altitudeConstraintType.map((v) => v !== AltitudeRestrictionType.Between).withLifecycle(this.defaultLifecycle),
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
              isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.AltConstraint1).withLifecycle(this.defaultLifecycle)}
              verticalPhase={this.legData.vnavPhase}
            />
          </div>

          <div
            class={{
              'leg-block-alt-constraint': true,
              'leg-block-white-text': true,
              'hidden': this.hideCrossAltitude,
            }}
          >
            {this.verticalInstruction}
          </div>

          <div
            class={{
              'leg-block-airport-flag-container': true,
              'hidden': this.hideAirportFlag
            }}
            style={{ 'top': '7px' }}
          >
            <AirportFlag airportICAO={this.airportFlag} flagColor={BaseLegBlock.airportFlagColor} />
          </div>
        </div >
      </>
    );
  }
}

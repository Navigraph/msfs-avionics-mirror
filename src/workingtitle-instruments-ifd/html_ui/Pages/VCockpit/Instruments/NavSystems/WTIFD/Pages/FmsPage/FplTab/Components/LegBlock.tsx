import {
  AltitudeRestrictionType, FlightPlanSegmentType, FSComponent, MappedSubject, Subject, SubscribableMapFunctions, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { LegBlockArrowIcon } from '../../../../Assets/SVGs/LegBlockArrowIcon';
import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { FlightPlanLegData } from '../../../../FlightPlan';
import { AirportFlag } from './AirportFlag';
import { AltitudeConstraintShort } from './AltitudeConstraintShort';
import { AltitudeField } from './AltitudeField';
import { EditableField } from './BaseEditableBlock';
import { BaseLegBlock, BaseLegBlockProps } from './BaseLegBlock';
import { LegBlockBottomRowData } from './LegBlockBottomRowData';

import './LegBlock.css';

/** The properties for the {@link LegBlock} component. */
export interface LegBlockProps extends BaseLegBlockProps {
  /** Callback invoked when user replaces a fix */
  readonly onReplaceFix: (ident: string, legData: FlightPlanLegData) => void;
}

/** The leg block cursor state **/
export enum LegFieldIndex {
  Unselected = -1,
  Terminus,
  AltConstraintType,
  AltConstraint2,
  AltConstraint1,
}

/** The LegBlock component. */
export class LegBlock extends BaseLegBlock<LegBlockProps> {
  private readonly altConstraint1Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint2Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint1RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraint2RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraintTypeRef = FSComponent.createRef<HTMLDivElement>();
  private readonly textInputRef = FSComponent.createRef<HTMLDivElement>();

  private readonly isProcedureSegment =
    this.legData.segment.segmentType !== FlightPlanSegmentType.Enroute
    && this.legData.segment.segmentType !== FlightPlanSegmentType.Origin
    && this.legData.segment.segmentType !== FlightPlanSegmentType.Destination;

  private readonly canEditIdent = !this.isProcedureSegment;

  /** Shows leg distance normmally, or the segment distance if collapsed in compact mode. */
  private readonly distanceDisplay = MappedSubject.create(
    ([legDistance, segmentDistance, unit, isVisibleCollapsedLeg]): string => {
      const distanceToUse = isVisibleCollapsedLeg ? segmentDistance : legDistance;
      const convertedDist = distanceToUse.asUnit(unit);
      const decimals = convertedDist < 100 ? 1 : 0;
      const roundedDistanceNM = Math.round(convertedDist * Math.pow(10, decimals)) / Math.pow(10, decimals);
      return isNaN(roundedDistanceNM) ? '-- ' : roundedDistanceNM.toFixed(decimals);
    },
    this.legData.distance,
    this.legData.segmentData.distance,
    this.unitsSettingManager.distanceUnitsLarge,
    this.legData.isVisibleCollapsedLeg,
  ).withLifecycle(this.defaultLifecycle);

  protected readonly distanceUnits = this.unitsSettingManager.distanceUnitsLarge
    .map(UnitFormatter.unitLabel<UnitFamily.Distance>)
    .withLifecycle(this.defaultLifecycle);

  private readonly isAltitudeFieldSelected = MappedSubject.create(
    ([isSelected, selectedFieldIndex]) => {
      return isSelected &&
        (selectedFieldIndex === LegFieldIndex.AltConstraint1 || selectedFieldIndex === LegFieldIndex.AltConstraint2 || selectedFieldIndex === LegFieldIndex.AltConstraintType);
    },
    this.isSelected,
    this.selectedFieldIndex
  ).withLifecycle(this.defaultLifecycle);

  private readonly canEditTerminus = this.isSelected.map((v) => v && this.canEditIdent).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  protected readonly fieldIndexes = {
    terminus: LegFieldIndex.Terminus,
    altConstraintType: LegFieldIndex.AltConstraintType,
    altConstraint1: LegFieldIndex.AltConstraint1,
    altConstraint2: LegFieldIndex.AltConstraint2,
  };

  /** @inheritdoc */
  protected readonly fields: Record<string, EditableField> = {
    terminus: {
      ref: this.textInputRef,
      getValue: () => this.legTerminus.get(),
      canEdit: this.canEditTerminus,
      type: 'text',
      onEdit: (value: string) => {
        this.props.onReplaceFix(value, this.legData);
      }
    },
    altConstraintType: {
      ref: this.altConstraintTypeRef,
      getValue: () => this.altitudeConstraintTypeText.get(),
      canEdit: this.props.isInSidebarMode.map(v => !v).withLifecycle(this.defaultLifecycle),
      type: 'menu',
      onMenuOpen: () => this.openConstraintTypeMenu()
    },
    altConstraint1: {
      ref: this.altConstraint1RootRef,
      fieldRef: this.altConstraint1Ref,
      getValue: () => this.altitude1.get().asUnit(UnitType.FOOT).toString(),
      canEdit: this.props.isInSidebarMode.map(v => !v).withLifecycle(this.defaultLifecycle),
      type: 'number',
      onEdit: (value: string) => {
        this.altConstraint1Ref.instance.setKeyboardInputValue(value);
      }
    },
    altConstraint2: {
      ref: this.altConstraint2RootRef,
      fieldRef: this.altConstraint2Ref,
      getValue: () => this.altitude2.get().asUnit(UnitType.FOOT).toString(),
      canEdit: MappedSubject.create(([altConstraintType, inInSidebarMode]) =>
        altConstraintType === AltitudeRestrictionType.Between && !inInSidebarMode,
        this.altitudeConstraintType, this.props.isInSidebarMode).withLifecycle(this.defaultLifecycle),
      type: 'number',
      onEdit: (value: string) => {
        this.altConstraint2Ref.instance.setKeyboardInputValue(value);
      }
    },
  };

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
   * @returns VNode
   */
  public renderLegBlockDistance = (): VNode => {
    const viaText = MappedSubject.create(([isVisibleCollapsedLeg, viaInstruction, procedureName]) => {
      return isVisibleCollapsedLeg ? procedureName : viaInstruction;
    }, this.legData.isVisibleCollapsedLeg, this.viaInstruction, this.legData.segmentData.procedureNameLong).withLifecycle(this.defaultLifecycle);

    const toLabel = this.legData.isVisibleCollapsedLeg.map((isVisibleCollapsedLeg) => {
      return isVisibleCollapsedLeg ? 'Proc:' : 'To:';
    }).withLifecycle(this.defaultLifecycle);

    return (
      <>
        <div class="leg-block-top-row">
          <svg
            class={{
              'direct-to-icon': true,
              'hidden': this.legData.isUserDtoLeg.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle)
            }}
          >
            <path d="M3 12.5h23l-2 4.5 9-5.5-9-5.5 2 4.5h-23z" />
            <path d="M7 18h3v-12h5c5 0 5 12 0 12h-8v3h8c10 0 9-18 0-18h-8z" />
          </svg>
          <span>{viaText}</span>
        </div>
        <div
          class={{
            'leg-block-normal-row': this.legData.isVisibleCollapsedLeg.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle),
            'leg-block-normal-top-row': true,
            'leg-block-row-active': this.legData.isActiveLeg,
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
      </>
    );
  };

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isAltitudeFieldSelected.pipe(this.props.data.isAltitudeFieldSelected).withLifecycle(this.defaultLifecycle);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        <div
          ref={this.blockRef}
          class={{
            'wt-ifd-leg-block': true,
            'normal-leg-block': true,
            'leg-block-selected': this.isSelected,
            'leg-block-active': this.legData.isActiveLeg,
            'mini-leg-format': this.miniFplFormatStyle,
            'collapsed-leg': this.legData.isVisibleCollapsedLeg,
          }}
        >
          <div class="leg-row-distance">
            {this.renderLegBlockDistance()}
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
              {this.createTextField(LegFieldIndex.Terminus,
                <>
                  <span class='leg-block-terminus'>{this.legNameDisplay}</span>
                  {this.fixType &&
                    <span
                      class={{
                        'leg-block-fix-type': true,
                        'hidden': MappedSubject.create(([miniFplFormatStyle, isSelected, isVisibleCollapsedLeg]) => {
                          return miniFplFormatStyle && !isSelected && isVisibleCollapsedLeg;
                        }, this.miniFplFormatStyle, this.isSelected, this.legData.isVisibleCollapsedLeg).withLifecycle(this.defaultLifecycle)
                      }}>
                      {this.fixType}
                    </span>}
                </>
                , 'airport-field-text')}
            </div>
            <LegBlockBottomRowData
              isVisible={Subject.create(true)}
              fuelQuantity={this.fuelQty}
              fuelUnitDisplay={this.fuelUnitDisplay}
              eta={this.eta}
              am_pm={this.am_pm}
            />
            <div class={{ 'hidden': this.miniFplFormatStyle.map((v) => !v), 'mini-fpl-distance': true }}>{this.renderLegBlockDistance()}</div>
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
              isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.AltConstraint2)}
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
              isSelected={this.selectedFieldIndex.map(v => v === LegFieldIndex.AltConstraint1)}
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

          <AltitudeConstraintShort
            isHidden={this.hideCrossAltitude}
            altValue1={this.altitude1}
            altValue2={this.altitude2}
            displayAltitude1AsFl={this.legData.displayAltitude1AsFlightLevel}
            displayAltitude2AsFl={this.legData.displayAltitude2AsFlightLevel}
            altitudeConstraintType={this.altitudeConstraintType}
          />

          <div
            class={{
              'leg-block-airport-flag-container': true,
              'hidden': this.hideAirportFlag
            }}
            style={{ 'top': '7px' }}
          >
            <AirportFlag airportICAO={this.airportFlag} flagColor={BaseLegBlock.airportFlagColor} />
          </div>
        </div>
      </>
    );
  }

  /** @inheritdoc */
  public override destroy(): void {
    super.destroy();
    this.props.data.isAltitudeFieldSelected.set(false);
  }
}

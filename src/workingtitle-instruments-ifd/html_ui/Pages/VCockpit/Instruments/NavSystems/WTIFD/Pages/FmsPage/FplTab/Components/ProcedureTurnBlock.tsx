import {
  AltitudeRestrictionType, FSComponent, LegTurnDirection, MappedSubject, NavMath, SubscribableMapFunctions, UnitFamily, UnitType, VNode
} from '@microsoft/msfs-sdk';

import { LegBlockArrowIcon } from '../../../../Assets/SVGs/LegBlockArrowIcon';
import { UnitFormatter } from '../../../../Components/NumberDisplays';
import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { BearingFormatter } from '../../../../Utilities/FormatUtils';
import { AirportFlag } from './AirportFlag';
import { AltitudeField } from './AltitudeField';
import { EditableField } from './BaseEditableBlock';
import { BaseLegBlock, BaseLegBlockProps } from './BaseLegBlock';

import './LegBlock.css';

/** The intercept block cursor state **/
export enum LegFieldIndex {
  Unselected = -1,
  Terminus,
  AltConstraintType,
  AltConstraint2,
  AltConstraint1,
}

/** The InterceptBlock component. */
export class ProcedureTurnBlock extends BaseLegBlock<BaseLegBlockProps> {
  private readonly unitsNavAngle = UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle');

  private readonly outBoundCourse = BearingFormatter.createFromNumber(
    this.legData.magneticCourseRounded,
    UnitsNavAngleSettingMode.Magnetic,
    this.unitsNavAngle,
    this.props.store,
  ).withLifecycle(this.defaultLifecycle).fullLabel;
  private readonly inboundCourse = BearingFormatter.createFromNumber(
    this.legData.magneticCourseRounded.map(NavMath.reciprocateHeading).withLifecycle(this.defaultLifecycle),
    UnitsNavAngleSettingMode.Magnetic,
    this.unitsNavAngle,
    this.props.store,
  ).withLifecycle(this.defaultLifecycle).fullLabel;

  private readonly altConstraint1Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint2Ref = FSComponent.createRef<AltitudeField>();
  private readonly altConstraint1RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraint2RootRef = FSComponent.createRef<HTMLElement>();
  private readonly altConstraintTypeRef = FSComponent.createRef<HTMLDivElement>();
  private readonly textInputRef = FSComponent.createRef<HTMLDivElement>();

  private readonly distance = MappedSubject.create(
    ([dist, unit]): string => {
      const convertedDist = dist.asUnit(unit);
      const decimals = convertedDist < 100 ? 1 : 0;
      const roundedDistanceNM = Math.round(convertedDist * Math.pow(10, decimals)) / Math.pow(10, decimals);
      return isNaN(roundedDistanceNM) ? '-- ' : roundedDistanceNM.toFixed(decimals);
    },
    this.legData.distance,
    this.unitsSettingManager.distanceUnitsLarge,
  ).withLifecycle(this.defaultLifecycle);

  private readonly distanceUnits = this.unitsSettingManager.distanceUnitsLarge
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
      canEdit: false,
      type: 'text'
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
      getValue: () => this.altitude2.get().asUnit(UnitType.FOOT).toString(),
      canEdit: this.altitudeConstraintType.map((v) => v === AltitudeRestrictionType.Between).withLifecycle(this.defaultLifecycle),
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

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.isAltitudeFieldSelected.pipe(this.props.data.isAltitudeFieldSelected).withLifecycle(this.defaultLifecycle);
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
            'intercept-leg-block': true,
            'leg-block-selected': this.isSelected,
            'leg-block-active': this.legData.isActiveLeg,
            'mini-leg-format': this.miniFplFormatStyle
          }}
        >
          <div style={{ 'display': 'flex' }}>
            <div class="leg-block-top-row">
              <div class="intercept-course-row">
                <span>{this.outBoundCourse}°</span>
                <span class={{ 'intercept-turn': true, 'intercept-turn-reverse': this.legData.leg.leg.turnDirection === LegTurnDirection.Left }}>
                  <svg class="intercept-turn-svg" version="1.1" viewBox="0 0 56.7 18.6" xmlns="http://www.w3.org/2000/svg">
                    <path d="M45.2,4.7l-.2-.2c-.7-.7-1.5-1-2.4-1s-1.7.3-2.4,1l-10.7,10.7h10l5.7-5.7c1.3-1.3,1.3-3.5,0-4.8Z" fill="none" />
                    <path class="turn-icon" d="M47.7,2.2l-.2-.2c-2.7-2.7-7-2.7-9.7,0l-3.2,3.2h0s0,0,0,0l-10,10H0v3.5h41l3.5-3.5,3.2-3.2c1.3-1.3,2-3,2-4.9s-.7-3.6-2-4.9ZM45.2,9.5l-5.7,5.7h-10l10.7-10.7c.7-.7,1.5-1,2.4-1s1.7.3,2.4,1l.2.2c1.3,1.3,1.3,3.5,0,4.8Z" />
                    <polygon class="turn-icon" points="34.6 0.2 29.7 0.3 31.2 1.8 20.2 12.8 22.1 14.6 33.1 3.6 34.6 5.2 34.6 5.2" />
                    <polygon class="turn-icon" points="34.6 5.2 34.6 5.2 34.6 5.2" />
                    <polygon class="turn-icon" points="56.7 10.4 54.8 8.5 48.2 15.1 46.7 13.6 46.7 18.6 51.6 18.5 50.1 17" />
                  </svg>
                </span>
                <span class={{ 'hidden': this.props.isInSidebarMode }}>{this.inboundCourse}°</span>
              </div>
              <span class={{ 'hidden': this.props.isInSidebarMode }}>{viaText}</span>
            </div>
          </div>
          <div
            class={{
              'leg-block-data-row': true,
              'leg-block-normal-row': true,
              'leg-block-normal-bottom-row': true,
              'leg-block-row-active': this.legData.isActiveLeg,
            }}
            style={{
              'margin-left': this.isSelected.map(selected => selected ? '0px' : '-3px').withLifecycle(this.defaultLifecycle),
              'padding-left': this.isSelected.map(selected => selected ? '0px' : '3px').withLifecycle(this.defaultLifecycle),
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
              {this.createTextField(LegFieldIndex.Terminus,
                <>
                  {this.legTerminus}
                  {this.fixType && <span class='leg-block-fix-type'>{this.fixType}</span>}
                </>
              )}
            </div>
            <div class="leg-block-normal-bottom-row-data">
              <div>
                <span class="leg-block-white-text">To: {this.distance}</span><span class="leg-block-unit-text">{this.distanceUnits}</span>
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

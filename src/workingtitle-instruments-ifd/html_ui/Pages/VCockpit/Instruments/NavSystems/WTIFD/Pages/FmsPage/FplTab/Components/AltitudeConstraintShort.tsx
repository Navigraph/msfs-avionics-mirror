import {
  AltitudeRestrictionType, ComponentProps, FSComponent, LifecycleComponent, MappedSubject, NumberUnitInterface, Subject, Subscribable, Unit, UnitFamily,
  UnitType, VNode
} from '@microsoft/msfs-sdk';

/** The properties for the {@link AltitudeConstraintShort} component. */
interface AltitudeConstraintShortProps extends ComponentProps {
  /** The subject of the altitude constraint value 1 */
  altValue1: Subscribable<NumberUnitInterface<UnitFamily.Distance, Unit<UnitFamily.Distance>>>;
  /** Whether altitude 1 should be displayed as a flight level. */
  displayAltitude1AsFl: Subscribable<boolean>;
  /** The subject of the altitude constraint value 2 */
  altValue2: Subscribable<NumberUnitInterface<UnitFamily.Distance, Unit<UnitFamily.Distance>>>;
  /** Whether altitude 2 should be displayed as a flight level. */
  displayAltitude2AsFl: Subscribable<boolean>;
  /** The type of the altitude restriction **/
  altitudeConstraintType: Subject<AltitudeRestrictionType>;
  /** Whether the component should be hidden. */
  isHidden: Subscribable<boolean>;
}

/** The AltitudeConstraintShort component. */
export class AltitudeConstraintShort extends LifecycleComponent<AltitudeConstraintShortProps> {
  // Derived text values
  private readonly display1 = MappedSubject.create(
    ([alt, showFL]) => {
      if (alt.isNaN()) {
        return '';
      }
      const feet = alt.asUnit(UnitType.FOOT);
      return showFL ? Math.round(feet / 100).toString().padStart(3, '0') : feet.toFixed(0);
    },
    this.props.altValue1,
    this.props.displayAltitude1AsFl,
  ).withLifecycle(this.defaultLifecycle);

  private readonly display2 = MappedSubject.create(
    ([alt, showFL]) => {
      if (alt.isNaN()) {
        return '';
      }
      const feet = alt.asUnit(UnitType.FOOT);
      return showFL ? Math.round(feet / 100).toString().padStart(3, '0') : feet.toFixed(0);
    },
    this.props.altValue2,
    this.props.displayAltitude2AsFl,
  ).withLifecycle(this.defaultLifecycle);

  private readonly unit1Prefix = this.props.displayAltitude1AsFl.map(showFL => (showFL ? 'FL' : '')).withLifecycle(this.defaultLifecycle);
  private readonly unit1Suffix = MappedSubject.create(([showFL, txt]) => (txt !== '' && !showFL ? 'FT' : ''), this.props.displayAltitude1AsFl, this.display1).withLifecycle(this.defaultLifecycle);
  private readonly unit2Prefix = this.props.displayAltitude2AsFl.map(showFL => (showFL ? 'FL' : '')).withLifecycle(this.defaultLifecycle);
  private readonly unit2Suffix = MappedSubject.create(([showFL, txt]) => (txt !== '' && !showFL ? 'FT' : ''), this.props.displayAltitude2AsFl, this.display2).withLifecycle(this.defaultLifecycle);

  // Class toggles
  private readonly isBetween = this.props.altitudeConstraintType
    .map(v => v === AltitudeRestrictionType.Between)
    .withLifecycle(this.defaultLifecycle);

  private readonly showTopBorder = this.props.altitudeConstraintType
    .map(v =>
      v === AltitudeRestrictionType.AtOrBelow ||
      v === AltitudeRestrictionType.At ||
      v === AltitudeRestrictionType.Between
    )
    .withLifecycle(this.defaultLifecycle);

  private readonly showBottomBorder = this.props.altitudeConstraintType
    .map(v =>
      v === AltitudeRestrictionType.AtOrAbove ||
      v === AltitudeRestrictionType.At
    )
    .withLifecycle(this.defaultLifecycle);

  private readonly hideSecondLine = this.props.altitudeConstraintType
    .map(v => v !== AltitudeRestrictionType.Between)
    .withLifecycle(this.defaultLifecycle);

  /**
   * @inheritDoc
   */
  public render(): VNode {
    return (
      <div class={{ 'leg-block-alt-constraint-short': true, 'between': this.isBetween, 'hidden': this.props.isHidden }}>
        <div class={{ 'alt-constraint-text': true, 'between': this.isBetween }}>
          <div class={{ 'constraint-wrapper': true, 'top-border': this.showTopBorder, 'bottom-border': this.showBottomBorder }}>
            <span class="leg-block-unit-text">{this.unit1Prefix}</span>
            {this.display1}
            <span class="leg-block-unit-text">{this.unit1Suffix}</span>
          </div>
        </div>

        <div class={{ 'hidden': this.hideSecondLine }}>
          {' / '}
        </div>
        <div class={{ 'alt-constraint-text': true, 'between': true, 'hidden': this.hideSecondLine }}>
          <div class="constraint-wrapper bottom-border">
            <span class="leg-block-unit-text">{this.unit2Prefix}</span>
            {this.display2}
            <span class="leg-block-unit-text">{this.unit2Suffix}</span>
          </div>
        </div>
      </div>
    );
  }
}

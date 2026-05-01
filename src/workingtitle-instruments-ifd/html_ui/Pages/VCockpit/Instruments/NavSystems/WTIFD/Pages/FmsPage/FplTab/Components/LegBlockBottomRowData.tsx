import { ComponentProps, FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

/** The properties for the {@link LegBlockBottomRowData} component. */
interface LegBlockBottomRowDataProps extends ComponentProps {
  /**
   * Whether the bottom row data is visible.
   */
  readonly isVisible: Subscribable<boolean>;
  /**
   * The fuel quantity to display.
   */
  readonly fuelQuantity: Subscribable<string>;
  /**
   * The fuel unit display string.
   */
  readonly fuelUnitDisplay: Subscribable<string>;
  /**
   * The ETA string to display.
   */
  readonly eta: Subscribable<string>;
  /**
   * The AM/PM string to display.
   */
  readonly am_pm: Subscribable<string>;

}

/** The LegBlockBottomRowData component. Displays the "At:"" fields for a leg or hold block. */
export class LegBlockBottomRowData extends LifecycleComponent<LegBlockBottomRowDataProps> {

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'leg-block-normal-bottom-row-data': true,
          'hidden': this.props.isVisible.map(v => !v).withLifecycle(this.defaultLifecycle),
        }}
      >
        <div>
          <span class="leg-block-white-text">At: {this.props.fuelQuantity}</span>
          <span class="leg-block-unit-text">{this.props.fuelUnitDisplay}</span>
        </div>
        <div style={{ 'display': 'flex', 'margin-left': 'auto', 'width': '58px' }}>
          <div
            class="leg-block-white-text"
            style={{ 'margin-left': 'auto' }}
          >
            {this.props.eta}
          </div>
          <div
            class="leg-block-unit-text"
            style={{ 'width': '17px' }}
          >
            {this.props.am_pm}
          </div>
        </div>
      </div>
    );
  }
}

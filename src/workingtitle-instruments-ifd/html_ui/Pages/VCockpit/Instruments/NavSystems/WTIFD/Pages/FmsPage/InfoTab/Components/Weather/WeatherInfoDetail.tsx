import { ComponentProps, FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

/** The properties for the {@link WeatherInfoDetail} component. */
interface WeatherInfoDetailProps extends ComponentProps {
  /** The label */
  label?: string;
  /** The display value */
  displayValue: Subscribable<string>;
  /** The display prefix, if applicable */
  displayPrefix?: Subscribable<string>;
  /** The display unit, if applicable */
  displayUnit?: Subscribable<string>;
  /** The display remark, if applicable */
  displayRemark?: Subscribable<string>;
}

/** A component that displays a weather info detail. */
export class WeatherInfoDetail extends LifecycleComponent<WeatherInfoDetailProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="weather-info-detail">
        {this.props.label && <span class="weather-info-detail-label">{this.props.label}&nbsp;</span>}
        {this.props.displayPrefix && <span class="weather-info-detail-prefix">{this.props.displayPrefix}</span>}
        <span class="weather-info-detail-value">{this.props.displayValue}</span>
        {this.props.displayUnit && <span class="weather-info-detail-unit">{this.props.displayUnit}</span>}
        {this.props.displayRemark && <span class="weather-info-detail-remark">{this.props.displayRemark}</span>}
      </div>
    );
  }
}

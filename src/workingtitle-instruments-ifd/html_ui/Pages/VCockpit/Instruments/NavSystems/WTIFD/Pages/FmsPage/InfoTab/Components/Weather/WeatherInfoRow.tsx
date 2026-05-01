import { ComponentProps, FSComponent, LifecycleComponent, MappedSubject, Metar, Subject, Subscribable, Taf, VNode } from '@microsoft/msfs-sdk';
import { InfoItem } from '../InfoItem';

/** The properties for the {@link WeatherInfoRow} component. */
interface WeatherInfoRowProps<T extends (Metar | Taf)> extends ComponentProps {
  /** The METAR or TAF data */
  weatherInfo: Subscribable<T | undefined>;
  /** The label to show in the header */
  label: string;
  /** The summary string to show in the header */
  summaryString: Subscribable<string>;
  /** Subscribable to disable expanding the row */
  disableExpand?: Subscribable<boolean>;
  /** Whether this row is currently selected by knob navigation. */
  isSelected?: Subscribable<boolean>;
}

/**
 * A generic row in the weather info section.
 */
export class WeatherInfoRow<T extends Metar | Taf> extends LifecycleComponent<WeatherInfoRowProps<T>> {
  private readonly isExpanded = Subject.create(false);
  private readonly expandRef = FSComponent.createRef<HTMLDivElement>();
  private readonly onExpandClicked = (): void => this.toggleExpanded();
  private readonly expandIconHidden = this.props.children === undefined ||
    MappedSubject.create(
      ([weatherInfo, disableExpand]) => disableExpand || weatherInfo === undefined,
      this.props.weatherInfo,
      this.props.disableExpand === undefined ? Subject.create(false) : this.props.disableExpand,
    ).withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.disableExpand?.sub(disableExpand => {
      if (disableExpand) {
        this.isExpanded.set(false);
      }
    });

    this.expandRef.instance.addEventListener('click', this.onExpandClicked);
  }

  /** Toggles the expanded state of the row (public so parent can trigger via knob). */
  public toggleExpanded(): void {
    this.isExpanded.set(!this.isExpanded.get());
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <InfoItem
        class="weather-item"
        isSelected={this.props.isSelected ?? Subject.create(false)}
      >
        <div class="weather-summary">
          <div class="weather-summary-text">
            <span>{this.props.label}</span>
            <span class={{ hidden: this.isExpanded }}> - {this.props.summaryString}</span>
          </div>
          <div class={{ 'weather-expand-icon': true, expanded: this.isExpanded, hidden: this.expandIconHidden }} ref={this.expandRef}>
            <img src="/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/chevron.png" alt="Expand weather information" />
          </div>
        </div>
        {this.props.children && (
          <div class={{ hidden: this.isExpanded.map(v => !v).withLifecycle(this.defaultLifecycle) }}>
            {...this.props.children}
          </div>
        )}
      </InfoItem>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.expandRef.instance.removeEventListener('click', this.onExpandClicked);

    super.destroy();
  }
}

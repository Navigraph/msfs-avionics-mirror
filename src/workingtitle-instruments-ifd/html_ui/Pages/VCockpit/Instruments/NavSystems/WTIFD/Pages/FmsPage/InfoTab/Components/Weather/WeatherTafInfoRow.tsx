import { ClockEvents, ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, Subject, Subscribable, Taf, TafTime, VNode } from '@microsoft/msfs-sdk';
import { WeatherInfoRow } from './WeatherInfoRow';
import { WeatherInfoDetail } from './WeatherInfoDetail';

/** The properties for the {@link WeatherTafInfoRow} component. */
interface WeatherTafInfoRowProps extends ComponentProps {
  /** An instance of the event bus. */
  bus: EventBus;
  /** The TAF info to display */
  taf: Subscribable<Taf | undefined>;
  /** Whether this row is selected by knob navigation. */
  isSelected: Subscribable<boolean>;
}

/** A row of weather information for a TAF. */
export class WeatherTafInfoRow extends LifecycleComponent<WeatherTafInfoRowProps> {
  private readonly summaryString = Subject.create('Not Available');
  private readonly tafStationDisplay = Subject.create('');
  private readonly tafStringFormatted = Subject.create('');
  private readonly tafAgeMinutes = Subject.create<number | null>(null);

  private readonly simTimeMs = ConsumerSubject.create<number>(null, 0).withLifecycle(this.defaultLifecycle);
  private currentTaf?: Taf;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.simTimeMs.setConsumer(this.props.bus.getSubscriber<ClockEvents>().on('simTime').atFrequency(1 / 30));
    this.simTimeMs.sub(() => this.recomputeAgeAndTafDisplay(), true).withLifecycle(this.defaultLifecycle);

    this.props.taf.sub(taf => {
      this.currentTaf = taf;
      this.recomputeAgeAndTafDisplay();
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /** Recomputes the age and display values for the TAF. */
  private recomputeAgeAndTafDisplay(): void {
    const taf = this.currentTaf;
    if (!taf) {
      this.tafAgeMinutes.set(null);
      this.summaryString.set('Not Available');
      this.tafStationDisplay.set('');
      this.tafStringFormatted.set('');
      return;
    }

    const nowMs = this.simTimeMs.get() ?? 0;
    const obsMs = this.tafObsToUtcMs(taf.observationTime, nowMs);
    const ageMin = Math.floor(Math.max(0, nowMs - obsMs) / 60_000);

    if (ageMin > 240) {
      // Too old -> obsolete and treated as not available
      this.currentTaf = undefined;
      this.tafAgeMinutes.set(null);
      this.summaryString.set('Obsolete');
      return;
    }

    this.tafAgeMinutes.set(ageMin);
    this.summaryString.set(`${ageMin} minutes ago`);
    this.tafStationDisplay.set(`${taf.icao} ${ageMin} minutes ago`);
    this.tafStringFormatted.set(this.formatTafString(taf.tafString));
  }

  /**
   * Build observation UTC using current UTC year/month and observation day/hour/min.
   * If the observation day is greater than today's UTC day, treat it as the previous month (handles month-end and New Year's).
   * @param t observation time
   * @param nowMs current UTC time in milliseconds based on sim time
   * @returns UTC time in milliseconds (UNIX timestamp)
   */
  private tafObsToUtcMs(t: TafTime, nowMs: number): number {
    const now = new Date(nowMs);
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth();
    const today = now.getUTCDate();

    // If the report day-of-month is greater than today's day-of-month, it must be from the previous month.
    if (t.day > today) {
      // move to the previous month (handles Jan -> Dec and year rollover)
      if (month === 0) {
        month = 11;
        year -= 1;
      } else {
        month -= 1;
      }
    }

    return Date.UTC(year, month, t.day, t.hour, t.min, 0, 0);
  }

  /**
   * Formats the TAF string for display.
   * @param raw The raw TAF string.
   * @returns The formatted TAF string.
   */
  private formatTafString(raw: string): string {
    let s = raw.trim().replace(/\s+/g, ' ');
    s = s.replace(/^[A-Z0-9]{3,4}\s+\d{6}Z\s+\d{4}\/\d{4}\s*/i, '');
    s = s.replace(/(?=FM\d{6})|\b(?=BECMG|TEMPO|INTER\b)/g, '\n');
    return s.trim();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <WeatherInfoRow<Taf>
        weatherInfo={this.props.taf}
        label="TAF"
        summaryString={this.summaryString}
        disableExpand={this.tafAgeMinutes.map(v => v === null || v > 240).withLifecycle(this.defaultLifecycle)}
        isSelected={this.props.isSelected}
      >
        <div class="weather-info-details-column">
          <WeatherInfoDetail label="Station" displayValue={this.tafStationDisplay} />
          <div class="weather-taf-string">{this.tafStringFormatted}</div>
        </div>
      </WeatherInfoRow>
    );
  }
}

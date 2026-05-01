import {
  ClockEvents, ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, MathUtils, Metar, MetarCloudLayerCoverage, MetarCloudLayerType, MetarVisibilityUnits,
  MetarWindSpeedUnits, Subject, Subscribable, UnitType, VNode,
} from '@microsoft/msfs-sdk';
import { WeatherInfoRow } from './WeatherInfoRow';
import { WeatherInfoDetail } from './WeatherInfoDetail';

/** The properties for the {@link WeatherMetarInfoRow} component. */
interface WeatherMetarInfoRowProps extends ComponentProps {
  /** An instance of the event bus. */
  bus: EventBus;
  /** The METAR info to display */
  metar: Subscribable<Metar | undefined>;
  /** Whether this row is selected by knob navigation. */
  isSelected: Subscribable<boolean>;
}


/** A row of weather information for a METAR. */
export class WeatherMetarInfoRow extends LifecycleComponent<WeatherMetarInfoRowProps> {
  private readonly summaryString = Subject.create<string>('Not Available');
  private readonly metarStationDisplay = Subject.create('');
  private readonly metarWindDisplay = Subject.create('');
  private readonly metarWindUnit = Subject.create('');
  private readonly metarWindRemark = Subject.create('');
  private readonly metarVisibilityDisplay = Subject.create('');
  private readonly metarVisibilityUnit = Subject.create('');
  private readonly metarVisibilityRemark = Subject.create('');
  private readonly metarTempDisplay = Subject.create('');
  private readonly metarTempUnit = Subject.create('');
  private readonly metarDewPtDisplay = Subject.create('');
  private readonly metarDewPtUnit = Subject.create('');
  private readonly metarAltimeterDisplay = Subject.create('');
  private readonly metarAltimeterUnit = Subject.create('');
  private readonly metarCloudsDisplay = Subject.create('');
  private readonly metarCloudsUnit = Subject.create('');
  private readonly metarCloudsRemark = Subject.create('');
  private readonly metarAgeMinutes = Subject.create<number | null>(null);

  private readonly simTimeMs = ConsumerSubject.create<number>(null, 0).withLifecycle(this.defaultLifecycle);
  private currentMetar?: Metar;

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.simTimeMs.setConsumer(this.props.bus.getSubscriber<ClockEvents>().on('simTime').atFrequency(1 / 30));
    this.simTimeMs.sub(() => this.recomputeAge(), true).withLifecycle(this.defaultLifecycle);

    this.props.metar.sub(metar => {
      if (metar?.day === this.currentMetar?.day && metar?.hour === this.currentMetar?.hour && metar?.min === this.currentMetar?.min) {
        return;
      }
      this.currentMetar = metar;
      this.recomputeAge();
      this.updateMetarContents();
    }, true).withLifecycle(this.defaultLifecycle);
  }

  /** Recomputes the age of the METAR and updates the display values if the metar is unavailable or obsolete */
  private recomputeAge(): void {
    const metar = this.currentMetar;
    if (!metar) {
      this.metarAgeMinutes.set(null);
      this.summaryString.set('Not Available');
      this.metarStationDisplay.set('');
      return;
    }

    const nowMs = this.simTimeMs.get() ?? 0;
    const obsMs = this.metarObsToUtcMs(metar.day, metar.hour, metar.min, nowMs);
    const ageMin = Math.floor(Math.max(0, nowMs - obsMs) / 60_000);

    if (ageMin > 180) {
      // Too old -> obsolete and treated as not available
      this.currentMetar = undefined;
      this.metarAgeMinutes.set(ageMin);
      this.summaryString.set('Obsolete');
      return;
    }

    this.metarAgeMinutes.set(ageMin);
  }

  /**
   * Updates the display values for the METAR.
   */
  private updateMetarContents(): void {
    const metar = this.currentMetar;
    if (!metar) {
      return;
    }

    this.summaryString.set(metar.metarString);
    this.metarStationDisplay.set(`${metar.icao} ${this.metarAgeMinutes.get()} minutes ago`);

    if (metar.windSpeed !== undefined) {
      if (metar.windSpeed === 0) {
        this.metarWindDisplay.set('calm');
        this.metarWindUnit.set('');
        this.metarWindRemark.set('');
      } else {
        if (metar.windDir === undefined || (metar.maxWindDir !== undefined && metar.minWindDir !== undefined &&
          MathUtils.angularDistanceDeg(metar.maxWindDir, metar.minWindDir, 0) > 180)) {
          this.metarWindDisplay.set('variable at ' + metar.windSpeed);
        } else {
          const variableBtw = (metar.minWindDir !== undefined && metar.maxWindDir !== undefined)
            ? ` variable ${metar.minWindDir.toFixed().padStart(3, '0')}° to ${metar.maxWindDir.toFixed().padStart(3, '0')}°`
            : '';
          this.metarWindDisplay.set(`${metar.windDir.toFixed().padStart(3, '0')}°${variableBtw} at ${metar.windSpeed}`);
        }
        let unit = '';
        switch (metar.windSpeedUnits) {
          case MetarWindSpeedUnits.MeterPerSecond:
            unit = 'MPS';
            break;
          case MetarWindSpeedUnits.KilometerPerHour:
            unit = 'KPH';
            break;
          case MetarWindSpeedUnits.Knot:
          case MetarWindSpeedUnits.Undefined:
            unit = 'KTS';
            break;
        }
        this.metarWindUnit.set(unit);
        if (metar.gust !== undefined) {
          this.metarWindRemark.set(` gusts ${metar.gust}`);
        } else {
          this.metarWindRemark.set('');
        }
      }
    }

    if (metar.vis === 9999) {
      this.metarVisibilityDisplay.set('10');
      this.metarVisibilityUnit.set('KM');
      this.metarVisibilityRemark.set(' or more');
    } else if (metar.vis !== undefined) {
      this.metarVisibilityDisplay.set(`${metar.visLt ? 'less than ' : ''}${metar.vis}`);
      this.metarVisibilityUnit.set(metar.visUnits === MetarVisibilityUnits.StatuteMile ? 'SM' : 'M');
      this.metarVisibilityRemark.set('');
    } else {
      this.metarVisibilityDisplay.set('unknown');
      this.metarVisibilityUnit.set('');
      this.metarVisibilityRemark.set('');
    }

    this.metarTempUnit.set(`${metar.visUnits === MetarVisibilityUnits.StatuteMile ? 'F' : 'C'}`);
    this.metarDewPtUnit.set(this.metarTempUnit.get());

    if (metar.temp !== undefined) {
      this.metarTempDisplay.set(`${metar.visUnits === MetarVisibilityUnits.StatuteMile ? UnitType.CELSIUS.convertTo(metar.temp, UnitType.FAHRENHEIT).toFixed() : metar.temp.toFixed()}°`);
    } else {
      this.metarTempDisplay.set('unknown');
      this.metarTempUnit.set('');
    }

    if (metar.dew !== undefined) {
      this.metarDewPtDisplay.set(metar.visUnits === MetarVisibilityUnits.StatuteMile ? UnitType.CELSIUS.convertTo(metar.dew, UnitType.FAHRENHEIT).toFixed() : metar.dew.toFixed());
    } else {
      this.metarDewPtDisplay.set('unknown');
      this.metarDewPtUnit.set('');
    }

    if (metar.altimeterA !== undefined) {
      this.metarAltimeterDisplay.set(metar.altimeterA.toFixed());
      this.metarAltimeterUnit.set('inHg');
    } else if (metar.altimeterQ !== undefined) {
      this.metarAltimeterDisplay.set(Math.floor(metar.altimeterQ).toFixed());
      this.metarAltimeterUnit.set('hPa');
    } else {
      this.metarAltimeterDisplay.set('unknown');
      this.metarAltimeterUnit.set('');
    }

    const layer = metar.layers.find(l => l.cover > MetarCloudLayerCoverage.NoSignificant);
    if (metar.cavok || layer === undefined) {
      this.metarCloudsDisplay.set('Clear up to 12000');
      this.metarCloudsUnit.set('FT');
    } else {
      this.metarCloudsDisplay.set(`${layer.alt}00`);
      this.metarCloudsUnit.set('FT');
      let cover = '';
      switch (layer.cover) {
        case MetarCloudLayerCoverage.Few:
          cover = ' Few';
          break;
        case MetarCloudLayerCoverage.Scattered:
          cover = ' Scattered';
          break;
        case MetarCloudLayerCoverage.Broken:
          cover = ' Broken';
          break;
        case MetarCloudLayerCoverage.Overcast:
          cover = ' Overcast';
          break;
      }
      let type = '';
      switch (layer.type) {
        case MetarCloudLayerType.ToweringCumulus:
          type = ' TCU';
          break;
        case MetarCloudLayerType.Cumulonimbus:
          type = ' CB';
          break;
      }
      this.metarCloudsRemark.set(`${cover}${type}`);
    }
  }

  /**
   * Build observation UTC using current UTC year/month and observation day/hour/min.
   * If the observation day is greater than today's UTC day, treat it as the previous month (handles month-end and New Year's).
   * @param day observation day
   * @param hour observation hour
   * @param min observation minute
   * @param nowMs current UTC time in milliseconds based on sim time
   * @returns UTC time in milliseconds (UNIX timestamp)
   */
  private metarObsToUtcMs(day: number, hour: number, min: number, nowMs: number): number {
    const now = new Date(nowMs);
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth();
    const today = now.getUTCDate();

    // If the report day-of-month is greater than today's day-of-month, it must be from the previous month.
    if (day > today) {
      // move to the previous month (handles Jan -> Dec and year rollover)
      if (month === 0) {
        month = 11;
        year -= 1;
      } else {
        month -= 1;
      }
    }

    return Date.UTC(year, month, day, hour, min, 0, 0);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <WeatherInfoRow<Metar>
        weatherInfo={this.props.metar}
        label="METAR"
        summaryString={this.summaryString}
        disableExpand={this.metarAgeMinutes.map(v => v === null || v > 180).withLifecycle(this.defaultLifecycle)}
        isSelected={this.props.isSelected}
      >
        <div class="weather-info-details-column">
          <WeatherInfoDetail label="Station" displayValue={this.metarStationDisplay} />
          <div class="weather-info-details">
            <WeatherInfoDetail label="Winds" displayValue={this.metarWindDisplay} displayUnit={this.metarWindUnit} displayRemark={this.metarWindRemark} />
            <WeatherInfoDetail label="Visibility" displayValue={this.metarVisibilityDisplay} displayUnit={this.metarVisibilityUnit} displayRemark={this.metarVisibilityRemark} />
            <WeatherInfoDetail label="Temp" displayValue={this.metarTempDisplay} displayUnit={this.metarTempUnit} />
            <WeatherInfoDetail label="DewPt" displayValue={this.metarDewPtDisplay} displayUnit={this.metarDewPtUnit} />
            <WeatherInfoDetail label="Altimeter" displayValue={this.metarAltimeterDisplay} displayUnit={this.metarAltimeterUnit} />
          </div>
          <div class="weather-info-details">
            {/* Clouds */}
            <WeatherInfoDetail displayValue={this.metarCloudsDisplay} displayUnit={this.metarCloudsUnit} displayRemark={this.metarCloudsRemark} />
          </div>
        </div>
      </WeatherInfoRow>
    );
  }
}

import {
  AirportFacility, ArraySubject, ClockEvents, ComponentProps, ComSpacing, ConsumerSubject, DateTimeFormatter,
  DisplayComponent,
  FacilityFrequency, FacilityFrequencyType, FacilityLoader, FSComponent, GeoPoint, ICAO, LifecycleComponent,
  MappedSubject, MathUtils, Metar, MetarCloudLayer, MetarCloudLayerCoverage, MetarCloudLayerType, MetarVisibilityUnits,
  MetarWindSpeedUnits, NumberFormatter, RadioFrequencyFormatter, ReadonlyFloat64Array, Subject, Subscribable,
  SubscribableMapFunctions, Subscription, Taf, TafConditionChangeGroup, TafConditionChangeGroupTerminology, Unit,
  UnitFamily, UnitType, UserSettingManager, VNode
} from '@microsoft/msfs-sdk';

import {
  DateTimeFormatSettingMode, DateTimeUserSettingTypes, DynamicList, DynamicListData, TimeDisplayFormat
} from '@microsoft/msfs-garminsdk';

import { G3XTimeDisplay } from '../../../Shared/Components/Common/G3XTimeDisplay';
import { UiList } from '../../../Shared/Components/List/UiList';
import { AbstractTabbedContent } from '../../../Shared/Components/TabbedContainer/AbstractTabbedContent';
import { TabbedContentProps } from '../../../Shared/Components/TabbedContainer/TabbedContent';
import { G3XUnitFormatter } from '../../../Shared/Graphics/Text/G3XUnitFormatter';
import { ComRadioSpacingDataProvider } from '../../../Shared/Radio/ComRadioSpacingDataProvider';
import { G3XUnitsUserSettingManager } from '../../../Shared/Settings/G3XUnitsUserSettings';
import { UiService } from '../../../Shared/UiSystem/UiService';
import { WaypointInfoAirportWeatherData, WaypointInfoAirportWeatherProvider } from './WaypointInfoAirportWeatherProvider';

import './AirportWeatherTab.css';

/**
 * Component props for {@link AirportWeatherTab}.
 */
export interface AirportWeatherTabProps extends TabbedContentProps {
  /** The UI service. */
  uiService: UiService;

  /** The facility loader. */
  facLoader: FacilityLoader;

  /** A provider of airport weather for the waypoint to display. */
  airportWeatherProvider: WaypointInfoAirportWeatherProvider;

  /** The dimensions of the tab's content area, as `[width, height]` in pixels. */
  tabContentDimensions: Subscribable<ReadonlyFloat64Array>;

  /** A provider of COM radio spacing mode data. */
  comRadioSpacingDataProvider: ComRadioSpacingDataProvider;

  /** A manager for date/time user settings. */
  dateTimeSettingManager: UserSettingManager<DateTimeUserSettingTypes>;

  /** A manager for display unit user settings. */
  unitsSettingManager: G3XUnitsUserSettingManager;
}

/**
 * An airport weather tab.
 */
export class AirportWeatherTab extends AbstractTabbedContent<AirportWeatherTabProps> {
  private static readonly METAR_AUTO_REGEXP = /\sAUTO\s/;
  private static readonly METAR_RMK_REGEXP = /RMK[\s]+(.*[^=])=?$/;

  private static readonly DATE_TIME_FORMAT_SETTING_MAP = {
    [DateTimeFormatSettingMode.Local12]: TimeDisplayFormat.Local12,
    [DateTimeFormatSettingMode.Local24]: TimeDisplayFormat.Local24,
    [DateTimeFormatSettingMode.UTC]: TimeDisplayFormat.UTC
  };

  private static readonly DISPLAY_TIME_MAP_FUNC = ([time, timeFormat, localOffset]: readonly [number, TimeDisplayFormat, number]): number => {
    if (timeFormat === TimeDisplayFormat.UTC) {
      return time;
    } else {
      return time + localOffset;
    }
  };

  private static readonly DATE_FORMATTER = DateTimeFormatter.create('{mon} {d}');

  private static readonly AGE_FORMATTER = (ageMinutes: number): string => {
    const ageMinutesRounded = Math.round(ageMinutes);
    const ageMinutesAbs = Math.abs(ageMinutesRounded);

    let durationText: string;

    if (ageMinutesAbs < 120) {
      durationText = `${ageMinutesAbs} minute${ageMinutesAbs === 1 ? '' : 's'}`;
    } else {
      const ageHoursAbs = Math.round(ageMinutesAbs / 60);
      if (ageHoursAbs < 48) {
        durationText = `${ageHoursAbs} hours`;
      } else {
        durationText = `${Math.round(ageHoursAbs / 24)} days`;
      }
    }

    return `${durationText} ${ageMinutesRounded >= 0 ? 'ago' : 'ahead'}`;
  };

  private static readonly FREQ_FORMATTERS: Record<ComSpacing, (freq: number) => string> = {
    [ComSpacing.Spacing25Khz]: RadioFrequencyFormatter.createCom(ComSpacing.Spacing25Khz),
    [ComSpacing.Spacing833Khz]: RadioFrequencyFormatter.createCom(ComSpacing.Spacing833Khz)
  };

  private static readonly TEMPERATURE_UNIT_FORMATTER = G3XUnitFormatter.createBasic();

  private static readonly BARO_PRESSURE_UNIT_FORMATTER = (unit: Unit<UnitFamily.Pressure>): string => {
    switch (unit.name) {
      case UnitType.IN_HG.name:
        return '"';
      case UnitType.HPA.name:
        return ' hPa';
      case UnitType.MB.name:
        return ' mb';
      default:
        return '';
    }
  };

  private readonly listRef = FSComponent.createRef<UiList<any>>();
  private readonly listContentRef = FSComponent.createRef<HTMLDivElement>();

  private readonly listHeight = Subject.create(1);
  private readonly listItemHeight = Subject.create(1);

  private readonly isMetarDataAvailable = Subject.create(false);
  private readonly isTafDataAvailable = Subject.create(false);
  private readonly isWeatherDataNotAvailable = MappedSubject.create(
    SubscribableMapFunctions.nor(),
    this.isMetarDataAvailable,
    this.isTafDataAvailable
  );

  private readonly simTime = ConsumerSubject.create(null, 0).pause();

  private readonly dateTimeFormat = this.props.dateTimeSettingManager.getSetting('dateTimeFormat').map(settingMode => {
    return AirportWeatherTab.DATE_TIME_FORMAT_SETTING_MAP[settingMode] ?? TimeDisplayFormat.UTC;
  });

  private readonly airportNameText = Subject.create('');
  private readonly airportCityText = Subject.create('');
  private readonly airportDistanceText = Subject.create('');
  private readonly airportFreqText = Subject.create('');

  private readonly metarTime = Subject.create(0);
  private readonly metarAgeMinutes = MappedSubject.create(
    ([metarTime, simTime]) => Math.round((simTime - metarTime) / 60000),
    this.metarTime,
    this.simTime
  );

  private readonly metarDisplayTime = MappedSubject.create(
    AirportWeatherTab.DISPLAY_TIME_MAP_FUNC,
    this.metarTime,
    this.dateTimeFormat,
    this.props.dateTimeSettingManager.getSetting('dateTimeLocalOffset')
  ).pause();

  private readonly metarIdentText = Subject.create('');
  private readonly metarTypeText = Subject.create('');
  private readonly metarDateText = this.metarDisplayTime.map(AirportWeatherTab.DATE_FORMATTER);
  private readonly metarAgeText = this.metarAgeMinutes.map(AirportWeatherTab.AGE_FORMATTER);
  private readonly metarAgeTextSub = this.metarAgeText.sub(this.refreshListItemHeight.bind(this), false, true);

  private readonly metarWindLineRef = FSComponent.createRef<WindLine>();

  private readonly metarVisLineRef = FSComponent.createRef<VisibilityLine>();

  private readonly metarCloudsLineRef = FSComponent.createRef<CloudsLine>();

  private readonly metarTempHidden = Subject.create(false);
  private readonly metarDewpointHidden = Subject.create(false);
  private readonly metarTemperatureText = Subject.create('');
  private readonly metarDewpointText = Subject.create('');

  private readonly metarBaroHidden = Subject.create(false);
  private readonly metarBaroText = Subject.create('');

  private readonly metarRemarksHidden = Subject.create(false);
  private readonly metarRemarksText = Subject.create('');

  private readonly tafTime = Subject.create(0);
  private readonly tafAgeMinutes = MappedSubject.create(
    ([tafTime, simTime]) => Math.round((simTime - tafTime) / 60000),
    this.tafTime,
    this.simTime
  );
  private readonly tafValidEndTime = Subject.create(0);

  private readonly tafDisplayTime = MappedSubject.create(
    AirportWeatherTab.DISPLAY_TIME_MAP_FUNC,
    this.tafTime,
    this.dateTimeFormat,
    this.props.dateTimeSettingManager.getSetting('dateTimeLocalOffset')
  ).pause();
  private readonly tafValidEndDisplayTime = MappedSubject.create(
    AirportWeatherTab.DISPLAY_TIME_MAP_FUNC,
    this.tafValidEndTime,
    this.dateTimeFormat,
    this.props.dateTimeSettingManager.getSetting('dateTimeLocalOffset')
  ).pause();

  private readonly tafIdentText = Subject.create('');
  private readonly tafDateText = this.tafDisplayTime.map(AirportWeatherTab.DATE_FORMATTER);
  private readonly tafAgeText = this.tafAgeMinutes.map(AirportWeatherTab.AGE_FORMATTER);
  private readonly tafAgeTextSub = this.tafAgeText.sub(this.refreshListItemHeight.bind(this), false, true);

  private readonly tafChangeGroupContainerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly tafChangeGroups = ArraySubject.create<TafConditionChangeGroup & DynamicListData>();
  private tafChangeGroupList?: DynamicList<TafConditionChangeGroup & DynamicListData>;

  private readonly tafValidEndDateText = this.tafValidEndDisplayTime.map(AirportWeatherTab.DATE_FORMATTER);

  private readonly subscriptions: Subscription[] = [
    this.simTime,
    this.dateTimeFormat,
    this.metarDisplayTime,
    this.metarAgeTextSub,
    this.tafDisplayTime,
    this.tafAgeTextSub,
    this.tafValidEndDisplayTime,
  ];

  private readonly pauseable: Subscription[] = [
    this.simTime,
    this.metarDisplayTime,
    this.tafDisplayTime,
    this.tafValidEndDisplayTime,
  ];

  private readonly displayUnitSubs: Subscription[] = [];

  /** @inheritDoc */
  public onAfterRender(): void {
    this.tafChangeGroupList = new DynamicList(this.tafChangeGroups, this.tafChangeGroupContainerRef.instance, this.renderTafChangeGroup.bind(this));

    this.simTime.setConsumer(this.props.uiService.bus.getSubscriber<ClockEvents>().on('simTime').withPrecision(-3));

    const tabContentDimensionsSub = this.props.tabContentDimensions.sub(this.onTabContentDimensionsChanged.bind(this), false, true);

    const weatherDataSub = this.props.airportWeatherProvider.weatherData.sub(this.onWeatherDataChanged.bind(this), false, true);

    const distanceUnitSub = this.props.unitsSettingManager.distanceUnitsLarge.sub(this.onDistanceUnitChanged.bind(this), false, true);
    const speedUnitSub = this.props.unitsSettingManager.speedUnits.sub(this.onSpeedUnitChanged.bind(this), false, true);
    const temperatureUnitSub = this.props.unitsSettingManager.temperatureUnits.sub(this.onTemperatureUnitChanged.bind(this), false, true);
    const baroUnitSub = this.props.unitsSettingManager.baroPressureUnits.sub(this.onBaroUnitChanged.bind(this), false, true);
    const comSpacingSub = this.props.comRadioSpacingDataProvider.combinedComSpacing.sub(this.onComSpacingChanged.bind(this), false, true);
    const dateTimeFormatSub = this.dateTimeFormat.sub(this.onDateTimeFormattingChanged.bind(this), false, true);
    const localOffsetSub = this.props.dateTimeSettingManager.getSetting('dateTimeLocalOffset').sub(this.onDateTimeFormattingChanged.bind(this), false, true);

    this.subscriptions.push(
      tabContentDimensionsSub,
      weatherDataSub,
      distanceUnitSub,
      speedUnitSub,
      temperatureUnitSub,
      baroUnitSub,
      comSpacingSub,
      localOffsetSub,
    );

    this.pauseable.push(
      tabContentDimensionsSub,
      weatherDataSub,
    );

    this.displayUnitSubs.push(
      distanceUnitSub,
      speedUnitSub,
      temperatureUnitSub,
      baroUnitSub,
      comSpacingSub,
      dateTimeFormatSub,
      localOffsetSub,
    );
  }

  /** @inheritDoc */
  public onOpen(): void {
    this.props.airportWeatherProvider.refresh();

    for (const sub of this.pauseable) {
      sub.resume(true);
    }

    for (const sub of this.displayUnitSubs) {
      sub.resume();
    }
  }

  /** @inheritDoc */
  public onClose(): void {
    for (const sub of this.pauseable) {
      sub.pause();
    }

    for (const sub of this.displayUnitSubs) {
      sub.pause();
    }

    this.metarAgeTextSub.pause();
    this.tafAgeTextSub.pause();
  }

  /**
   * Refreshes the height of this tab's list item.
   */
  private refreshListItemHeight(): void {
    this.listItemHeight.set(this.listContentRef.instance.offsetHeight);
  }

  /**
   * Responds to changes in the dimensions of this tab's content area.
   * @param tabContentDimensions The new dimensions of this tab's content area, as `[width, height]` in pixels.
   */
  private onTabContentDimensionsChanged(tabContentDimensions: ReadonlyFloat64Array): void {
    // TODO: support GDU470 (portrait)

    // The list takes up the entire height of the content area minus 7px margins on each side.
    this.listHeight.set(tabContentDimensions[1] - 7 * 2);
  }

  /**
   * Responds to when this tab's loaded weather data changes.
   * @param weatherData The new weather data.
   */
  private onWeatherDataChanged(weatherData: WaypointInfoAirportWeatherData | null): void {
    this.updateHeader(weatherData);
    this.updateMetar(weatherData?.metar);
    this.updateTaf(weatherData?.taf);

    this.refreshListItemHeight();
  }

  /**
   * Updates this tab's displayed airport weather header.
   * @param weatherData The current weather data.
   */
  private updateHeader(weatherData: WaypointInfoAirportWeatherData | null): void {
    if (!weatherData) {
      return;
    }

    const { facility, weatherFacility } = weatherData;

    const name = Utils.Translate(weatherFacility.name);
    this.airportNameText.set(name ? name.toUpperCase() : '––––');

    const city = weatherFacility.city.split(', ').map(text => Utils.Translate(text)).join(', ');
    this.airportCityText.set(city ? city.toUpperCase() : 'UNKNOWN');

    this.updateAirportDistanceText(facility, weatherFacility);
    this.updateAirportFreqText(weatherFacility, this.props.comRadioSpacingDataProvider.combinedComSpacing.get());
  }

  /**
   * Updates this tab's airport weather reporting frequency display.
   * @param facility The airport facility for which to display the weather reporting frequency.
   * @param comSpacing The COM radio spacing mode.
   */
  private updateAirportFreqText(facility: AirportFacility, comSpacing: ComSpacing): void {
    // Search for ATIS, AWOS, or ASOS frequencies

    let bestFreq: FacilityFrequency | undefined = undefined;
    let bestFreqPriority = 0;

    for (let i = 0; i < facility.frequencies.length; i++) {
      const freq = facility.frequencies[i];
      let freqPriority: number;
      switch (freq.type) {
        case FacilityFrequencyType.ATIS:
          freqPriority = 3;
          break;
        case FacilityFrequencyType.AWOS:
          freqPriority = 2;
          break;
        case FacilityFrequencyType.ASOS:
          freqPriority = 1;
          break;
        default:
          freqPriority = 0;
      }

      if (freqPriority > bestFreqPriority) {
        bestFreq = freq;
        bestFreqPriority = freqPriority;
      }
    }

    if (bestFreq) {
      let typeText: string;

      switch (bestFreq.type) {
        case FacilityFrequencyType.ATIS:
          typeText = 'ATIS';
          break;
        case FacilityFrequencyType.AWOS:
          typeText = 'AWOS';
          break;
        case FacilityFrequencyType.ASOS:
          typeText = 'ASOS';
          break;
        default:
          typeText = '';
      }

      const freqText = AirportWeatherTab.FREQ_FORMATTERS[comSpacing](bestFreq.freqMHz * 1e6);

      this.airportFreqText.set(`${typeText} ${freqText} MHz`);
    } else {
      this.airportFreqText.set('');
    }
  }

  /**
   * Updates this tab's airport weather reporting frequency display.
   * @param facility The airport facility for which to display the weather reporting frequency.
   * @param weatherFacility The COM radio spacing mode.
   */
  private updateAirportDistanceText(facility: AirportFacility, weatherFacility: AirportFacility): void {
    if (ICAO.valueEquals(facility.icaoStruct, weatherFacility.icaoStruct)) {
      this.airportDistanceText.set('');
      return;
    }

    const distanceUnit = this.props.unitsSettingManager.distanceUnitsLarge.get();
    const distance = UnitType.GA_RADIAN.convertTo(GeoPoint.distance(facility.lat, facility.lon, weatherFacility.lat, weatherFacility.lon), distanceUnit);

    const bearing = GeoPoint.initialBearing(facility.lat, facility.lon, weatherFacility.lat, weatherFacility.lon);

    let direction: string;
    if (isFinite(bearing)) {
      switch (Math.floor(((bearing + 22.5) % 360) / 45)) {
        case 1:
          direction = 'NE';
          break;
        case 2:
          direction = 'E';
          break;
        case 3:
          direction = 'SE';
          break;
        case 4:
          direction = 'S';
          break;
        case 5:
          direction = 'SW';
          break;
        case 6:
          direction = 'W';
          break;
        case 7:
          direction = 'NW';
          break;
        default:
          direction = 'N';
      }
    } else {
      direction = 'N';
    }

    const distanceText = `(${Math.round(distance)}${formatDistanceUnit(distanceUnit)} ${direction} of ${facility.icaoStruct.ident})`;
    this.airportDistanceText.set(distanceText);
  }

  /**
   * Updates this tab's displayed METAR information.
   * @param metar The new METAR.
   */
  private updateMetar(metar: Metar | undefined): void {
    if (!metar) {
      this.isMetarDataAvailable.set(false);
      this.metarAgeTextSub.pause();
      return;
    }

    this.metarIdentText.set(metar.icao);

    this.metarTypeText.set(
      AirportWeatherTab.METAR_AUTO_REGEXP.test(metar.metarString)
        ? 'automated observation'
        : 'observation'
    );

    this.metarTime.set(convertPastWeatherDateToTimestamp(Date.now(), metar.day, metar.hour, metar.min));
    this.metarAgeTextSub.resume();

    this.updateMetarWind(metar);
    this.updateMetarVis(metar);
    this.updateMetarCloudLayers(metar);
    this.updateMetarTemperatureDewpoint(metar);
    this.updateMetarBaro(metar);
    this.updateMetarRemarks(metar);

    this.isMetarDataAvailable.set(true);
  }

  /**
   * Updates this tab's displayed METAR wind text.
   * @param metar The METAR data to use for the update.
   */
  private updateMetarWind(metar: Metar): void {
    this.metarWindLineRef.instance.update(metar);
  }

  /**
   * Updates this tab's displayed METAR visibility text.
   * @param metar The METAR data to use for the update.
   */
  private updateMetarVis(metar: Metar): void {
    this.metarVisLineRef.instance.update(metar);
  }

  /**
   * Updates this tab's displayed METAR cloud layers text.
   * @param metar The METAR data to use for the update.
   */
  private updateMetarCloudLayers(metar: Metar): void {
    this.metarCloudsLineRef.instance.update(metar);
  }

  /**
   * Updates this tab's displayed METAR temperature and dewpoint text.
   * @param metar The METAR data to use for the update.
   */
  private updateMetarTemperatureDewpoint(metar: Metar): void {
    if (metar.temp === undefined) {
      this.metarTempHidden.set(true);
      return;
    }

    const displayUnit = this.props.unitsSettingManager.temperatureUnits.get();
    const unitText = AirportWeatherTab.TEMPERATURE_UNIT_FORMATTER(displayUnit);

    const temperature = Math.round(UnitType.CELSIUS.convertTo(metar.temp, displayUnit));

    this.metarTemperatureText.set(`${temperature}${unitText}`);

    if (metar.dew !== undefined) {
      const dewpoint = Math.round(UnitType.CELSIUS.convertTo(metar.dew, displayUnit));
      this.metarDewpointText.set(`${dewpoint}${unitText}`);
      this.metarDewpointHidden.set(false);
    } else {
      this.metarDewpointHidden.set(true);
    }

    this.metarTempHidden.set(false);
  }

  /**
   * Updates this tab's displayed METAR altimeter barometric setting text.
   * @param metar The METAR data to use for the update.
   */
  private updateMetarBaro(metar: Metar): void {
    const displayUnit = this.props.unitsSettingManager.baroPressureUnits.get();

    let baro: number | undefined;
    if (metar.altimeterA !== undefined) {
      baro = UnitType.IN_HG.convertTo(metar.altimeterA, displayUnit);
    } else if (metar.altimeterQ !== undefined) {
      baro = UnitType.HPA.convertTo(metar.altimeterQ, displayUnit);
    }

    if (baro === undefined) {
      this.metarBaroHidden.set(true);
      return;
    }

    const unitText = AirportWeatherTab.BARO_PRESSURE_UNIT_FORMATTER(displayUnit);

    this.metarBaroText.set(`${displayUnit.equals(UnitType.IN_HG) ? baro.toFixed(2) : baro.toFixed(0)}${unitText}`);
  }

  /**
   * Updates this tab's displayed METAR remarks text.
   * @param metar The METAR data to use for the update.
   */
  private updateMetarRemarks(metar: Metar): void {
    const remarks = metar.rmk && metar.metarString.match(AirportWeatherTab.METAR_RMK_REGEXP)?.[1].trim();
    if (remarks) {
      this.metarRemarksText.set(remarks);
      this.metarRemarksHidden.set(false);
    } else {
      this.metarRemarksHidden.set(true);
    }
  }

  /**
   * Updates this tab's displayed TAF information.
   * @param taf The new TAF.
   */
  private updateTaf(taf: Taf | undefined): void {
    if (!taf) {
      this.isTafDataAvailable.set(false);
      this.tafAgeTextSub.pause();
      return;
    }

    this.tafIdentText.set(taf.icao);

    this.tafTime.set(convertPastWeatherDateToTimestamp(Date.now(), taf.observationTime.day, taf.observationTime.hour, taf.observationTime.min));
    this.tafAgeTextSub.resume();

    this.updateTafChangeGroups(taf);

    this.tafValidEndTime.set(convertFutureWeatherDateToTimestamp(this.tafTime.get(), taf.validPeriod.endDate.day, taf.validPeriod.endDate.hour, taf.validPeriod.endDate.min));

    this.isTafDataAvailable.set(true);
  }

  /**
   * Updates this tab's displayed TAF change groups.
   * @param taf The TAF data to use for the update.
   */
  private updateTafChangeGroups(taf: Taf): void {
    this.tafChangeGroups.clear();

    // Treat the initial forecast as a FROM change group.
    this.tafChangeGroups.insert({
      terminology: TafConditionChangeGroupTerminology.FM,
      probability: 0,
      validPeriod: taf.validPeriod,
      windSpeed: taf.windSpeed,
      windDir: taf.windDir,
      windSpeedUnits: taf.windSpeedUnits,
      gust: taf.gust,
      vrb: taf.vrb,
      vis: taf.vis,
      vertVis: taf.vertVis,
      visUnits: taf.visUnits,
      layers: taf.layers,
      phenomena: taf.phenomena,
    });

    this.tafChangeGroups.insertRange(1, taf.conditionChangeGroups);
  }

  /**
   * Renders a TAF condition change group item.
   * @param group The TAF condition change group to render.
   * @param index The index of the group to render.
   * @returns A rendered item for the specified TAF condition change group, as a VNode.
   */
  private renderTafChangeGroup(group: TafConditionChangeGroup, index: number): VNode {
    return (
      <TafChangeGroup
        group={group}
        index={index}
        timeFormat={this.dateTimeFormat}
        timeLocalOffset={this.props.dateTimeSettingManager.getSetting('dateTimeLocalOffset')}
        unitsSettingManager={this.props.unitsSettingManager}
      />
    );
  }

  /**
   * Responds to when the distance display unit type changes.
   */
  private onDistanceUnitChanged(): void {
    const data = this.props.airportWeatherProvider.weatherData.get();
    if (data) {
      this.updateAirportDistanceText(data.facility, data.weatherFacility);
      this.refreshListItemHeight();
    }
  }

  /**
   * Responds to when the speed display unit type changes.
   */
  private onSpeedUnitChanged(): void {
    const data = this.props.airportWeatherProvider.weatherData.get();

    let needRefresh = false;

    if (data?.metar) {
      this.updateMetarWind(data.metar);
      needRefresh = true;
    }

    if (data?.taf && this.tafChangeGroups.length > 0) {
      this.tafChangeGroupList!.forEachComponent<TafChangeGroup>(component => {
        component?.updateWind();
      });
      needRefresh = true;
    }

    if (needRefresh) {
      this.refreshListItemHeight();
    }
  }

  /**
   * Responds to when the temperature display unit type changes.
   */
  private onTemperatureUnitChanged(): void {
    const data = this.props.airportWeatherProvider.weatherData.get();
    if (data?.metar) {
      this.updateMetarTemperatureDewpoint(data.metar);
      this.refreshListItemHeight();
    }
  }

  /**
   * Responds to when the barometric pressure display unit type changes.
   */
  private onBaroUnitChanged(): void {
    const data = this.props.airportWeatherProvider.weatherData.get();
    if (data?.metar) {
      this.updateMetarBaro(data.metar);
      this.refreshListItemHeight();
    }
  }

  /**
   * Responds to when the COM radio spacing mode changes.
   */
  private onComSpacingChanged(): void {
    const data = this.props.airportWeatherProvider.weatherData.get();
    if (data) {
      this.updateAirportFreqText(data.weatherFacility, this.props.comRadioSpacingDataProvider.combinedComSpacing.get());
      this.refreshListItemHeight();
    }
  }

  /**
   * Responds to when date/time formatting changes.
   */
  private onDateTimeFormattingChanged(): void {
    const data = this.props.airportWeatherProvider.weatherData.get();
    if (data) {
      this.refreshListItemHeight();
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='airport-weather-tab'>
        <UiList
          ref={this.listRef}
          bus={this.props.uiService.bus}
          listItemLengthPx={this.listItemHeight}
          lengthPx={this.listHeight}
          autoDisableOverscroll
          class='airport-weather-tab-list'
        >
          <div ref={this.listContentRef} class='airport-weather-tab-list-content'>
            <div
              class={{
                'airport-weather-tab-section': true,
                'airport-weather-tab-header': true,
                'hidden': this.isWeatherDataNotAvailable,
              }}
            >
              <div class='airport-weather-tab-airport-name'>{this.airportNameText}</div>
              <div class='airport-weather-tab-airport-name-sub'>
                <span class='airport-weather-tab-airport-city'>{this.airportCityText}</span>
                <span
                  class={{
                    'airport-weather-tab-airport-distance': true,
                    'hidden': this.airportDistanceText.map(text => text === ''),
                  }}
                >
                  <br />
                  {this.airportDistanceText}
                </span>
                <span class='airport-weather-tab-airport-name-sub-sep'> </span>
                <span class='airport-weather-tab-airport-freq'>{this.airportFreqText}</span>
              </div>
            </div>
            
            <div
              class={{
                'airport-weather-tab-section': true,
                'airport-weather-tab-metar': true,
                'hidden': this.isMetarDataAvailable.map(SubscribableMapFunctions.not()),
              }}
            >
              <div class='airport-weather-tab-section-title'>
                <span>{this.metarIdentText} {this.metarTypeText} {this.metarDateText} </span>
                <G3XTimeDisplay
                  time={this.metarDisplayTime}
                  format={this.dateTimeFormat}
                  localOffset={0}
                  class='airport-weather-tab-time'
                />
                <span> ({this.metarAgeText})</span>
              </div>
              <WindLine
                ref={this.metarWindLineRef}
                unitsSettingManager={this.props.unitsSettingManager}
                class='airport-weather-tab-metar-line'
              />
              <VisibilityLine
                ref={this.metarVisLineRef}
                class='airport-weather-tab-metar-line'
              />
              <CloudsLine
                ref={this.metarCloudsLineRef}
                noDataAsSkyClear={true}
                class='airport-weather-tab-metar-line'
              />
              <div
                class={{
                  'airport-weather-tab-metar-line': true,
                  'airport-weather-tab-metar-temp': true,
                  'hidden': this.metarTempHidden
                }}
              >
                <span class='airport-weather-tab-line-title'>Temperature </span>
                <span>{this.metarTemperatureText}</span>
                <span class={{ 'hidden': this.metarDewpointHidden }}>
                  <span> / </span>
                  <span class='airport-weather-tab-line-title'>Dewpoint </span>
                  <span>{this.metarDewpointText}</span>
                </span>
              </div>
              <div
                class={{
                  'airport-weather-tab-metar-line': true,
                  'airport-weather-tab-metar-baro': true,
                  'hidden': this.metarBaroHidden
                }}
              >
                <span class='airport-weather-tab-line-title'>Altimeter </span>
                <span>{this.metarBaroText}</span>
              </div>
              <div
                class={{
                  'airport-weather-tab-metar-line': true,
                  'airport-weather-tab-metar-remarks': true,
                  'hidden': this.metarRemarksHidden
                }}
              >
                <span class='airport-weather-tab-line-title'>Remarks </span>
                <span>{this.metarRemarksText}</span>
              </div>
            </div>
            <div
              class={{
                'airport-weather-tab-section': true,
                'airport-weather-tab-no-data': true,
                'airport-weather-tab-no-metar': true,
                'hidden': this.isMetarDataAvailable,
              }}
            >
              No METAR Available
            </div>

            <div class='airport-weather-tab-separator' />

            <div
              class={{
                'airport-weather-tab-section': true,
                'airport-weather-tab-taf': true,
                'hidden': this.isTafDataAvailable.map(SubscribableMapFunctions.not()),
              }}
            >
              <div class='airport-weather-tab-section-title'>
                <span>{this.tafIdentText} terminal forecast issued {this.tafDateText} </span>
                <G3XTimeDisplay
                  time={this.tafDisplayTime}
                  format={this.dateTimeFormat}
                  localOffset={0}
                  class='airport-weather-tab-time'
                />
                <span> ({this.tafAgeText})</span>
              </div>

              <div ref={this.tafChangeGroupContainerRef} class='airport-weather-tab-taf-change-group-container' />
              
              <div class='airport-weather-tab-taf-valid-end'>
                <span>Forecast valid until {this.tafValidEndDateText} </span>
                <G3XTimeDisplay
                  time={this.tafValidEndDisplayTime}
                  format={this.dateTimeFormat}
                  localOffset={0}
                  class='airport-weather-tab-time'
                />
              </div>
            </div>
            <div
              class={{
                'airport-weather-tab-section': true,
                'airport-weather-tab-no-data': true,
                'airport-weather-tab-no-taf': true,
                'hidden': this.isTafDataAvailable,
              }}
            >
              No TAF Available
            </div>
          </div>
        </UiList>
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.listRef.getOrDefault()?.destroy();

    this.tafChangeGroupList?.destroy();

    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    super.destroy();
  }
}

/**
 * Weather wind data.
 */
interface WeatherWind {
  /** The wind direction, in degrees relative to true north. */
  readonly windDir?: number;

  /** The min wind direction, in degrees relative to true north. */
  readonly minWindDir?: number;

  /** The max wind direction, in degrees relative to true north. */
  readonly maxWindDir?: number;

  /** The wind speed, expressed in units defined by `windSpeedUnits`. */
  readonly windSpeed?: number;

  /** The wind gust, expressed in units defined by `windSpeedUnits`. */
  readonly gust?: number;

  /** The units in which this METAR's wind speeds are reported. */
  readonly windSpeedUnits: MetarWindSpeedUnits;

  /** Whether winds are variable. */
  readonly vrb: boolean;
}

/**
 * Component props for {@link WindLine}.
 */
interface WindLineProps extends ComponentProps {
  /** A manager for display unit user settings. */
  unitsSettingManager: G3XUnitsUserSettingManager;

  /** CSS class(es) to apply to the line's root element. */
  class?: string;
}

/**
 * A text line that displays wind information.
 */
class WindLine extends LifecycleComponent<WindLineProps> {
  private static readonly SPEED_UNIT_FORMATTER = G3XUnitFormatter.createBasic();

  private readonly hidden = Subject.create(true);
  private readonly text = Subject.create('');

  /**
   * Updates this line's displayed text.
   * @param wind The wind data to use for the update.
   */
  public update(wind: WeatherWind): void {
    if (wind.windSpeed === undefined) {
      this.hidden.set(true);
      return;
    }

    let speedUnit: Unit<UnitFamily.Speed> | undefined = undefined;

    switch (wind.windSpeedUnits) {
      case MetarWindSpeedUnits.Knot:
        speedUnit = UnitType.KNOT;
        break;
      case MetarWindSpeedUnits.KilometerPerHour:
        speedUnit = UnitType.KPH;
        break;
      case MetarWindSpeedUnits.MeterPerSecond:
        speedUnit = UnitType.MPS;
        break;
    }

    if (!speedUnit) {
      this.hidden.set(true);
      return;
    }

    if (wind.windSpeed === 0 && wind.gust === undefined) {
      this.text.set('calm');
      this.hidden.set(false);
      return;
    }

    const windDirRounded = wind.windDir === undefined ? undefined : MathUtils.normalizeAngleDeg(Math.round(wind.windDir));
    const minWindDirRounded = wind.minWindDir === undefined ? undefined : MathUtils.normalizeAngleDeg(Math.round(wind.minWindDir));
    const maxWindDirRounded = wind.maxWindDir === undefined ? undefined : MathUtils.normalizeAngleDeg(Math.round(wind.maxWindDir));

    const windDir = windDirRounded === undefined ? undefined : windDirRounded === 0 ? 360 : windDirRounded;
    const minWindDir = minWindDirRounded === undefined ? undefined : minWindDirRounded === 0 ? 360 : minWindDirRounded;
    const maxWindDir = maxWindDirRounded === undefined ? undefined : maxWindDirRounded === 0 ? 360 : maxWindDirRounded;
    const isVariable = wind.vrb
      || (minWindDir !== undefined && maxWindDir !== undefined)
      || windDir === undefined;

    const displayUnit = this.props.unitsSettingManager.speedUnits.get();

    const windSpeed = Math.round(speedUnit.convertTo(wind.windSpeed, displayUnit));
    const gustSpeed = Math.round(speedUnit.convertTo(wind.gust ?? NaN, displayUnit));

    const directionText = isVariable
      ? `variable${minWindDir !== undefined && maxWindDir !== undefined ? ` from (${minWindDir.toString().padStart(3, '0')}° to ${maxWindDir.toString().padStart(3, '0')}°)` : ''}`
      : `from ${windDir.toString().padStart(3, '0')}°`;
    const displayUnitText = WindLine.SPEED_UNIT_FORMATTER(displayUnit).toLowerCase();
    const speedText = `${windSpeed} ${displayUnitText}${isFinite(gustSpeed) ? ` gusting to ${gustSpeed} ${displayUnitText}` : ''}`;

    this.text.set(`${directionText} at ${speedText}`);
    this.hidden.set(false);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div
        class={FSComponent.addCssClassesToRecord(
          {
            'airport-weather-tab-line': true,
            'airport-weather-tab-wind-line': true,
            'hidden': this.hidden
          },
          this.props.class ?? '',
          false
        )}
      >
        <span class='airport-weather-tab-line-title'>Wind </span>
        <span>{this.text}</span>
      </div>
    );
    
  }
}

/**
 * Weather visibility data.
 */
interface WeatherVisibility {
  /** The visibility, expressed in units defined by `visUnits`. */
  readonly vis?: number;

  /** The vertical visibility, in hundreds of feet. */
  readonly vertVis?: number;

  /** The units in which this METAR's visibility is reported. */
  readonly visUnits: MetarVisibilityUnits;

  /** Whether the observed visibility is less than the reported visibility. */
  readonly visLt?: boolean;
}

/**
 * Component props for {@link VisibilityLine}.
 */
interface VisibilityLineProps extends ComponentProps {
  /** CSS class(es) to apply to the line's root element. */
  class?: string;
}

/**
 * A text line that displays visibility information.
 */
class VisibilityLine extends DisplayComponent<VisibilityLineProps> {
  private static readonly MILE_FORMATTER = NumberFormatter.create({ precision: 0.01, forceDecimalZeroes: false });

  private readonly hidden = Subject.create(true);
  private readonly text = Subject.create('');

  /**
   * Updates this line's displayed text.
   * @param vis The visibility data to use for the update.
   */
  public update(vis: WeatherVisibility): void {
    let unit: Unit<UnitFamily.Distance> | undefined = undefined;

    if (vis.vis === undefined) {
      this.hidden.set(true);
      return;
    }

    switch (vis.visUnits) {
      case MetarVisibilityUnits.StatuteMile:
        unit = UnitType.MILE;
        break;
      case MetarVisibilityUnits.Meter:
        unit = UnitType.METER;
        break;
    }

    if (!unit) {
      this.hidden.set(true);
      return;
    }

    let displayUnit = unit;

    if (unit.equals(UnitType.METER) && vis.vis >= 1000) {
      displayUnit = UnitType.KILOMETER;
    }

    const distance = unit.convertTo(vis.vis, displayUnit);

    const distanceText = displayUnit === UnitType.MILE
      ? `${VisibilityLine.MILE_FORMATTER(distance)}${formatDistanceUnit(displayUnit)}`
      : `${Math.round(distance)}${formatDistanceUnit(displayUnit)}`;

    this.text.set(`${vis.visLt ? 'less than ' : ''}${distanceText}`);
    this.hidden.set(false);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div
        class={FSComponent.addCssClassesToRecord(
          {
            'airport-weather-tab-line': true,
            'airport-weather-tab-vis-line': true,
            'hidden': this.hidden
          },
          this.props.class ?? '',
          false
        )}
      >
        <span class='airport-weather-tab-line-title'>Visibility </span>
        <span>{this.text}</span>
      </div>
    );
  }
}

/**
 * Weather clouds data.
 */
interface WeatherClouds {
  /** Cloud layers. */
  readonly layers: readonly MetarCloudLayer[];
}

/**
 * Component props for {@link CloudsLine}.
 */
interface CloudsLineProps extends ComponentProps {
  /** Whether to interpet a complete lack of cloud layer data as indicating a "sky clear" condition. */
  noDataAsSkyClear: boolean;

  /** CSS class(es) to apply to the line's root element. */
  class?: string;
}

/**
 * A text line that displays cloud layer information.
 */
class CloudsLine extends DisplayComponent<CloudsLineProps> {
  private static readonly CLOUD_COVER_TEXT = {
    [MetarCloudLayerCoverage.Clear]: 'Sky clear below 12000 ft',
    [MetarCloudLayerCoverage.SkyClear]: 'Sky clear',
    [MetarCloudLayerCoverage.NoSignificant]: 'No significant clouds',
    [MetarCloudLayerCoverage.Few]: 'Few',
    [MetarCloudLayerCoverage.Scattered]: 'Scattered',
    [MetarCloudLayerCoverage.Broken]: 'Broken',
    [MetarCloudLayerCoverage.Overcast]: 'Overcast'
  };

  private static readonly CLOUD_TYPE_TEXT = {
    [MetarCloudLayerType.Unspecified]: '',
    [MetarCloudLayerType.AltocumulusCastellanus]: 'altocumulus',
    [MetarCloudLayerType.Cumulonimbus]: 'cumulonimbus',
    [MetarCloudLayerType.ToweringCumulus]: 'towering cumulus',
  };

  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  private readonly layers = ArraySubject.create<MetarCloudLayer & DynamicListData>();
  private layersList?: DynamicList<MetarCloudLayer & DynamicListData>;

  /** @inheritDoc */
  public onAfterRender(): void {
    this.layersList = new DynamicList(this.layers, this.rootRef.instance, this.renderLayer.bind(this));
  }

  /**
   * Updates this line's displayed text.
   * @param clouds The clouds data to use for the update.
   */
  public update(clouds: WeatherClouds): void {
    const clearCondition = clouds.layers.reduce((condition, layer) => {
      switch (layer.cover) {
        case MetarCloudLayerCoverage.NoSignificant:
          if (condition === MetarCloudLayerCoverage.Clear) {
            return condition;
          }
        // fallthrough
        case MetarCloudLayerCoverage.Clear:
          if (condition === MetarCloudLayerCoverage.SkyClear) {
            return condition;
          }
        // fallthrough
        case MetarCloudLayerCoverage.SkyClear:
          return layer.cover;
        default:
          return condition;
      }
    }, undefined as MetarCloudLayerCoverage.SkyClear | MetarCloudLayerCoverage.Clear | MetarCloudLayerCoverage.NoSignificant | undefined);

    const layers = clouds.layers.filter(layer => {
      return layer.cover !== MetarCloudLayerCoverage.SkyClear
        && layer.cover !== MetarCloudLayerCoverage.Clear
        && layer.cover !== MetarCloudLayerCoverage.NoSignificant;
    });

    if (layers.length === 0) {
      this.layers.clear();
      if (this.props.noDataAsSkyClear) {
        this.layers.insert({
          alt: 0,
          cover: clearCondition ?? MetarCloudLayerCoverage.SkyClear,
          type: MetarCloudLayerType.Unspecified
        });
      }
    } else {
      this.layers.set(layers);
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div
        ref={this.rootRef}
        class={`airport-weather-tab-line airport-weather-tab-clouds-line ${this.props.class ?? ''}`}
      />
    );
  }

  /**
   * Renders a cloud layer item.
   * @param layer The cloud layer to render.
   * @param index The index of the layer.
   * @returns A rendered item for the specified cloud layer, as a VNode.
   */
  private renderLayer(layer: MetarCloudLayer, index: number): VNode {
    switch (layer.cover) {
      case MetarCloudLayerCoverage.SkyClear:
      case MetarCloudLayerCoverage.Clear:
      case MetarCloudLayerCoverage.NoSignificant:
        return (
          <span class='airport-weather-tab-cloud-layer'>{CloudsLine.CLOUD_COVER_TEXT[layer.cover]}</span>
        );
      default: {
        const coverText = CloudsLine.CLOUD_COVER_TEXT[layer.cover];
        const typeText = CloudsLine.CLOUD_TYPE_TEXT[layer.type];

        return (
          <span class='airport-weather-tab-cloud-layer'>
            {index > 0 ? <span class='airport-weather-tab-cloud-layer-sep'>, </span> : null}
            {coverText}{typeText.length > 0 ? ` ${typeText}` : ''} at {(layer.alt * 100).toFixed(0)} ft
          </span>
        );
      }
    }
  }

  /** @inheritDoc */
  public destroy(): void {
    this.layersList?.destroy();

    super.destroy();
  }
}

/**
 * Component props for {@link TafChangeGroup}.
 */
interface TafChangeGroupProps extends ComponentProps {
  /** The TAF change group to display. */
  group: TafConditionChangeGroup;

  /** The index of the TAF change group to display. */
  index: number;

  /** The format in which to display times. */
  timeFormat: Subscribable<TimeDisplayFormat>;

  /** The local time offset, in milliseconds. */
  timeLocalOffset: Subscribable<number>;

  /** A manager for display unit user settings. */
  unitsSettingManager: G3XUnitsUserSettingManager;
}

/**
 * A component that displays a formatted TAF change group.
 */
class TafChangeGroup extends LifecycleComponent<TafChangeGroupProps> {
  private readonly windLineRef = FSComponent.createRef<WindLine>();
  private readonly visLineRef = FSComponent.createRef<VisibilityLine>();
  private readonly cloudsLineRef = FSComponent.createRef<CloudsLine>();

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    super.onAfterRender(thisNode);

    this.updateWind();
    this.updateVisibility();
    this.updateClouds();
  }

  /**
   * Updates this component's wind line.
   */
  public updateWind(): void {
    this.windLineRef.getOrDefault()?.update(this.props.group);
  }

  /**
   * Updates this component's visibility line.
   */
  public updateVisibility(): void {
    this.visLineRef.getOrDefault()?.update(this.props.group);
  }

  /**
   * Updates this component's cloud layer line.
   */
  public updateClouds(): void {
    this.cloudsLineRef.getOrDefault()?.update(this.props.group);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='airport-weather-tab-taf-change-group'>
        {this.renderHeader(this.props.group, this.props.index)}
        {this.renderWind(this.props.group)}
        {this.renderVisibility(this.props.group)}
        {this.renderClouds(this.props.group)}
      </div>
    );
  }

  /**
   * Renders this component's header.
   * @param group The TAF change group to display.
   * @param index The index of the TAF change group to display.
   * @returns This component's header, rendered as a VNode.
   */
  private renderHeader(group: TafConditionChangeGroup, index: number): VNode {
    switch (group.terminology) {
      case TafConditionChangeGroupTerminology.TEMPO: {
        // TODO: need to confirm formatting for TEMPO groups.

        const startTime = convertPastWeatherDateToTimestamp(Date.now(), group.validPeriod.startDate.day, group.validPeriod.startDate.hour, group.validPeriod.startDate.min);
        const endTime = convertPastWeatherDateToTimestamp(startTime, group.validPeriod.endDate.day, group.validPeriod.endDate.hour, group.validPeriod.endDate.min);

        return (
          <div class='airport-weather-tab-taf-change-group-header'>
            <span>Temporarily between </span>
            <G3XTimeDisplay
              time={startTime}
              format={this.props.timeFormat}
              localOffset={this.props.timeLocalOffset}
              class='airport-weather-tab-time'
            />
            <span> and </span>
            <G3XTimeDisplay
              time={endTime}
              format={this.props.timeFormat}
              localOffset={this.props.timeLocalOffset}
              class='airport-weather-tab-time'
            />
            <span>:</span>
          </div>
        );
      }

      case TafConditionChangeGroupTerminology.BECMG: {
        const startTime = convertPastWeatherDateToTimestamp(Date.now(), group.validPeriod.startDate.day, group.validPeriod.startDate.hour, group.validPeriod.startDate.min);
        const endTime = convertPastWeatherDateToTimestamp(startTime, group.validPeriod.endDate.day, group.validPeriod.endDate.hour, group.validPeriod.endDate.min);

        return (
          <div class='airport-weather-tab-taf-change-group-header'>
            <span>Becoming between </span>
            <G3XTimeDisplay
              time={startTime}
              format={this.props.timeFormat}
              localOffset={this.props.timeLocalOffset}
              class='airport-weather-tab-time'
            />
            <span> and </span>
            <G3XTimeDisplay
              time={endTime}
              format={this.props.timeFormat}
              localOffset={this.props.timeLocalOffset}
              class='airport-weather-tab-time'
            />
            <span>:</span>
          </div>
        );
      }

      // TODO: PROB case

      default: {
        const startTime = convertPastWeatherDateToTimestamp(Date.now(), group.validPeriod.startDate.day, group.validPeriod.startDate.hour, group.validPeriod.startDate.min);

        return (
          <div class='airport-weather-tab-taf-change-group-header'>
            <span>{index === 0 ? 'From ' : 'Changing at '}</span>
            <G3XTimeDisplay
              time={startTime}
              format={this.props.timeFormat}
              localOffset={this.props.timeLocalOffset}
              class='airport-weather-tab-time'
            />
            <span>{index === 0 ? ':' : ' to:'}</span>
          </div>
        );
      }
    }
  }

  /**
   * Renders this component's wind line.
   * @param group The TAF change group to display.
   * @returns This component's wind line, rendered as a VNode.
   */
  private renderWind(group: TafConditionChangeGroup): VNode | null {
    if (group.windSpeed === undefined) {
      return null;
    }

    return (
      <WindLine
        ref={this.windLineRef}
        unitsSettingManager={this.props.unitsSettingManager}
      />
    );
  }

  /**
   * Renders this component's visibility line.
   * @param group The TAF change group to display.
   * @returns This component's visibility line, rendered as a VNode.
   */
  private renderVisibility(group: TafConditionChangeGroup): VNode | null {
    if (group.vis === undefined) {
      return null;
    }

    return (
      <VisibilityLine
        ref={this.visLineRef}
      />
    );
  }

  /**
   * Renders this component's cloud layer line.
   * @param group The TAF change group to display.
   * @returns This component's cloud layer line, rendered as a VNode.
   */
  private renderClouds(group: TafConditionChangeGroup): VNode {
    return (
      <CloudsLine
        ref={this.cloudsLineRef}
        noDataAsSkyClear={group.terminology === TafConditionChangeGroupTerminology.FM}
      />
    );
  }
}

/**
 * Formats a distance unit to label text.
 * @param unit The unit to format.
 * @returns The formatted label text for the specified distance unit.
 */
function formatDistanceUnit(unit: Unit<UnitFamily.Distance>): string {
  switch (unit.name) {
    case UnitType.NMILE.name:
      return ' nm';
    case UnitType.MILE.name:
      return ' mi';
    case UnitType.KILOMETER.name:
      return ' km';
    case UnitType.METER.name:
      return ' m';
    default:
      return '';
  }
}

const date = new Date();

/**
 * Converts a time found in a METAR or TAF expressed as day/hour/minute to a Javascript timestamp, assuming that the
 * time is before a certain reference time.
 * @param reference The reference time.
 * @param day The day value.
 * @param hour The hour value.
 * @param minute The minute value.
 * @returns The Javascript timestamp corresponding to the specified day/hour/minute time found in a METAR or TAF.
 */
function convertPastWeatherDateToTimestamp(
  reference: number,
  day: number,
  hour: number,
  minute: number
): number {
  date.setTime(reference);
  if (day > date.getUTCDate()) {
    // If the day is greater than the reference day, then we assume that the date is for the previous month.
    date.setUTCMonth(date.getUTCMonth() - 1);
  }
  date.setUTCDate(day);
  date.setUTCHours(hour, minute, 0, 0);
  return date.getTime();
}

/**
 * Converts a time found in a METAR or TAF expressed as day/hour/minute to a Javascript timestamp, assuming that the
 * time is after a certain reference time.
 * @param reference The reference time.
 * @param day The day value.
 * @param hour The hour value.
 * @param minute The minute value.
 * @returns The Javascript timestamp corresponding to the specified day/hour/minute time found in a METAR or TAF.
 */
function convertFutureWeatherDateToTimestamp(
  reference: number,
  day: number,
  hour: number,
  minute: number
): number {
  date.setTime(reference);
  if (day < date.getUTCDate()) {
    // If the day is less than the reference day, then we assume that the date is for the next month.
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  date.setUTCDate(day);
  date.setUTCHours(hour, minute, 0, 0);
  return date.getTime();
}

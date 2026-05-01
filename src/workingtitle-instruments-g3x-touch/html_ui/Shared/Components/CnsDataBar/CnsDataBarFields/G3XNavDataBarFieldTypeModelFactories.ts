import {
  EventBus, FacilityLoader, FacilityType, GeoPoint, GNSSEvents, ICAO, IcaoType, Metar, NumberUnitInterface,
  NumberUnitSubject, Subscribable, Unit, UnitFamily, UnitType
} from '@microsoft/msfs-sdk';

import {
  EventBusNavDataBarFieldTypeModelFactory, NavDataBarFieldConsumerValueModel, NavDataBarFieldModel,
  NavDataFieldGpsValidity, NavDataFieldType
} from '@microsoft/msfs-garminsdk';

/**
 * Creates data models for Weather Altimeter navigation data bar fields.
 * 
 * The models retrieve METAR data from a {@link FacilityLoader} using position data sourced from the `gps-position`
 * event bus topic (defined in {@link GNSSEvents}).
 */
export class G3XNavDataBarFieldWxAltimModelFactory extends EventBusNavDataBarFieldTypeModelFactory<NavDataFieldType.WeatherAltimeter, GNSSEvents> {
  // TODO: need to confirm search distance.
  private static readonly SEARCH_DISTANCE = UnitType.NMILE.convertTo(50, UnitType.GA_RADIAN);
  private static readonly SEARCH_EXPIRE_TIME = 60000; // ms
  private static readonly SEARCH_EXPIRE_DISTANCE = UnitType.NMILE.convertTo(5, UnitType.GA_RADIAN);

  /**
   * Creates a new instance of G3XNavDataBarFieldWxAltimModelFactory.
   * @param bus The event bus.
   * @param facLoader The facility loader to use to fetch METAR data.
   */
  public constructor(bus: EventBus, private readonly facLoader: FacilityLoader) {
    super(bus);
  }

  /** @inheritDoc */
  public create(gpsValidity: Subscribable<NavDataFieldGpsValidity>): NavDataBarFieldModel<NumberUnitInterface<UnitFamily.Pressure>> {
    let opId = 0;
    const lastMetarSearchPos = new GeoPoint(NaN, NaN);
    let lastMetarSearchTime: number | undefined = undefined;

    return new NavDataBarFieldConsumerValueModel(
      NumberUnitSubject.create<UnitFamily.Pressure, Unit<UnitFamily.Pressure>>(UnitType.HPA.createNumber(NaN)),
      gpsValidity,
      [
        this.sub.on('gps-position'),
      ],
      [new LatLongAlt(0, 0, 0)] as [LatLongAlt],
      async (sub, validity, [position]) => {
        const gpsValid = validity.get() === NavDataFieldGpsValidity.DeadReckoning || validity.get() === NavDataFieldGpsValidity.Valid;
        if (gpsValid) {
          const positionVal = position.get();

          const time = Date.now();
          if (
            (
              lastMetarSearchTime === undefined
              || Math.abs(time - lastMetarSearchTime) >= G3XNavDataBarFieldWxAltimModelFactory.SEARCH_EXPIRE_TIME
            )
            || (
              !lastMetarSearchPos.isValid()
              || lastMetarSearchPos.distance(positionVal.lat, positionVal.long) >= G3XNavDataBarFieldWxAltimModelFactory.SEARCH_EXPIRE_DISTANCE
            )
          ) {
            const currentOpId = ++opId;

            lastMetarSearchTime = time;
            lastMetarSearchPos.set(positionVal.lat, positionVal.long);

            const metar = await this.facLoader.searchMetar(positionVal.lat, positionVal.long);

            if (currentOpId !== opId) {
              return;
            }

            if (!metar || metar.icao === '') {
              sub.set(NaN);
              return;
            }

            const facility = await this.facLoader.tryGetFacility(
              FacilityType.Airport,
              ICAO.value(IcaoType.Airport, '', '', metar.icao),
              0
            );

            if (currentOpId !== opId) {
              return;
            }

            if (facility && lastMetarSearchPos.distance(facility) <= G3XNavDataBarFieldWxAltimModelFactory.SEARCH_DISTANCE) {
              G3XNavDataBarFieldWxAltimModelFactory.setAltimeterSettingFromMetar(sub, metar);
            } else {
              sub.set(NaN);
            }
          }
        } else {
          ++opId;
          lastMetarSearchPos.set(NaN, NaN);
          lastMetarSearchTime = undefined;

          sub.set(NaN);
        }
      }
    );
  }

  /**
   * Sets a subject's value to the altimeter setting defined by a METAR. If the METAR does not define an altimeter
   * setting, then the subject's value will be set to `NaN`.
   * @param subject The subject to set.
   * @param metar The METAR from which to get the altimeter setting.
   */
  private static setAltimeterSettingFromMetar(subject: NumberUnitSubject<UnitFamily.Pressure>, metar: Metar): void {
    if (metar.altimeterA !== undefined) {
      subject.set(metar.altimeterA, UnitType.IN_HG);
    } else if (metar.altimeterQ !== undefined) {
      subject.set(metar.altimeterQ, UnitType.HPA);
    } else {
      subject.set(NaN);
    }
  }
}

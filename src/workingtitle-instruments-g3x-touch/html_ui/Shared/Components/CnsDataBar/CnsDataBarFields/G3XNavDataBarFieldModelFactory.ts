import { CompoundableUnit, EventBus, FacilityLoader, Subscribable, UnitFamily, UnitType } from '@microsoft/msfs-sdk';

import {
  DefaultNavDataBarFieldModelFactory, DefaultNavDataBarFieldModelFactoryOptions, NavDataBarFieldAglModelFactory,
  NavDataBarFieldCabinAltitudeModelFactory, NavDataBarFieldClgModelFactory, NavDataBarFieldClmModelFactory,
  NavDataBarFieldDensityAltitudeModelFactory, NavDataBarFieldEcoModelFactory, NavDataBarFieldFlightLevelModelFactory,
  NavDataBarFieldFuelFlowModelFactory, NavDataBarFieldGMeterModelFactory, NavDataBarFieldGpsAltitudeModelFactory,
  NavDataBarFieldMachModelFactory, NavDataBarFieldOatModelFactory, NavDataBarFieldRatModelFactory,
  NavDataBarFieldUtcModelFactory, NavDataFieldGpsValidity, NavDataFieldType
} from '@microsoft/msfs-garminsdk';

import { G3XUnitsFuelType } from '../../../AvionicsConfig/UnitsConfig';
import { G3XUnitType } from '../../../Math/G3XUnitType';
import { G3XNavDataBarFieldWxAltimModelFactory } from './G3XNavDataBarFieldTypeModelFactories';

/**
 * Configuration options for {@link G3XNavDataBarFieldModelFactory}.
 */
export type G3XNavDataBarFieldModelFactoryOptions = Pick<DefaultNavDataBarFieldModelFactoryOptions, 'lnavIndex' | 'vnavIndex'> & {
  /** The type of fuel to use for unit conversions. Defaults to {@link G3XUnitsFuelType.Sim}. */
  fuelType?: G3XUnitsFuelType;
};

/**
 * A G3X implementation of NavDataBarFieldModelFactory.
 */
export class G3XNavDataBarFieldModelFactory extends DefaultNavDataBarFieldModelFactory {
  /**
   * Creates a new instance of G3XNavDataBarFieldModelFactory.
   * @param bus The event bus.
   * @param facilityLoader The facility loader.
   * @param gpsValidity The GPS validity state to pass to the models created by the factory.
   * @param options Options with which to configure the factory.
   */
  public constructor(
    bus: EventBus,
    facilityLoader: FacilityLoader,
    gpsValidity: Subscribable<NavDataFieldGpsValidity>,
    options?: Readonly<G3XNavDataBarFieldModelFactoryOptions>
  ) {
    let fuelUnit: CompoundableUnit<UnitFamily.Weight>;

    switch (options?.fuelType) {
      case G3XUnitsFuelType.Autogas:
        fuelUnit = UnitType.GALLON_AUTOGAS_FUEL;
        break;
      case G3XUnitsFuelType.OneHundredLL:
        fuelUnit = UnitType.GALLON_100LL_FUEL;
        break;
      case G3XUnitsFuelType.JetA:
        fuelUnit = UnitType.GALLON_JET_A_FUEL;
        break;
      default:
        fuelUnit = G3XUnitType.GALLON_SIM_FUEL;
    }

    super(
      bus,
      gpsValidity,
      {
        lnavIndex: options?.lnavIndex,
        vnavIndex: options?.vnavIndex,
        fuelUnit,
      }
    );

    this.factory.register(NavDataFieldType.AboveGroundLevel, new NavDataBarFieldAglModelFactory(bus));
    this.factory.register(NavDataFieldType.CabinAltitude, new NavDataBarFieldCabinAltitudeModelFactory(bus));
    this.factory.register(NavDataFieldType.ClimbGradient, new NavDataBarFieldClgModelFactory(bus));
    this.factory.register(NavDataFieldType.ClimbGradientPerDistance, new NavDataBarFieldClmModelFactory(bus));
    this.factory.register(NavDataFieldType.DensityAltitude, new NavDataBarFieldDensityAltitudeModelFactory(bus));
    this.factory.register(NavDataFieldType.FuelEconomy, new NavDataBarFieldEcoModelFactory(bus, fuelUnit));
    this.factory.register(NavDataFieldType.FlightLevel, new NavDataBarFieldFlightLevelModelFactory(bus));
    this.factory.register(NavDataFieldType.FuelFlow, new NavDataBarFieldFuelFlowModelFactory(bus, fuelUnit));
    this.factory.register(NavDataFieldType.GMeter, new NavDataBarFieldGMeterModelFactory(bus));
    this.factory.register(NavDataFieldType.GpsAltitude, new NavDataBarFieldGpsAltitudeModelFactory(bus));
    this.factory.register(NavDataFieldType.LocalTime, new NavDataBarFieldUtcModelFactory(bus));
    this.factory.register(NavDataFieldType.MachNumber, new NavDataBarFieldMachModelFactory(bus));
    this.factory.register(NavDataFieldType.OutsideTemperature, new NavDataBarFieldOatModelFactory(bus));
    this.factory.register(NavDataFieldType.RamAirTemperature, new NavDataBarFieldRatModelFactory(bus));
    this.factory.register(NavDataFieldType.UtcTime, new NavDataBarFieldUtcModelFactory(bus));
    this.factory.register(NavDataFieldType.WeatherAltimeter, new G3XNavDataBarFieldWxAltimModelFactory(bus, facilityLoader));
  }
}

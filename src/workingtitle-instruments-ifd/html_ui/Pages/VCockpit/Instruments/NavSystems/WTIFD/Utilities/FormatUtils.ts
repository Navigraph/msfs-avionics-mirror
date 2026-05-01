import {
  BasicNavAngleSubject, BasicNavAngleUnit, DateTimeFormatter, DmsFormatter2, DurationFormatter, EventBus, MappedSubject, MappedSubscribable, NavAngleUnit,
  NumberFormatter, NumberUnitInterface, ReadonlyLifecycle, Subject, Subscribable, Subscription, Unit, UnitFamily, UnitType, UserSetting
} from '@microsoft/msfs-sdk';

import { UnitFormatter } from '../Components/NumberDisplays';
import { FlightPlanStore } from '../FlightPlan';
import { TimeFormat, TimeUserSettings } from '../Settings/TimeUserSettings';
import { UnitsFuelSettingMode, UnitsNavAngleSettingMode } from '../Settings/UnitsUserSettings';

/** Formatting utils for UI displays. */
export class FormatUtils {
  /**
   * Format a course for display, with 3 digits and 0 as 360, and "---" for NaN/null/undefined.
   * @param course The course in degrees magnetic.
   * @returns string course degree
   */
  public static formatCourse = (course: number | null | undefined): string => {
    if (course === null || course === undefined || !isFinite(course)) {
      return '---';
    }
    const rounded = Math.round(course);
    return rounded === 0 ? '360' : rounded.toFixed(0).padStart(3, '0');
  };

  /** Latitude formatter using DMS style. */
  private static readonly latFormatter = DmsFormatter2.create(
    '{+[N]-[S]}{dd}°{mm}\'{ss}"',
    UnitType.DEGREE,
    0.0001,
    'N--°--\'--"'
  );

  /** Longitude formatter using DMS style. */
  private static readonly lonFormatter = DmsFormatter2.create(
    '{+[E]-[W]}{ddd}°{mm}\'{ss}"',
    UnitType.DEGREE,
    0.0001,
    'E---°--\'--"'
  );

  /**
   * Formats latitude and longitude into a combined human-readable DMS string.
   * @param lat The latitude in degrees.
   * @param lon The longitude in degrees.
   * @returns A formatted string (e.g. `N52°24'22" E016°55'01"`).
   */
  public static formatLatLon(lat: number, lon: number): string {
    const latText = FormatUtils.latFormatter(lat);
    const lonText = FormatUtils.lonFormatter(lon);

    return `${latText} ${lonText}`;
  }

  public static readonly eteFormatter = DurationFormatter.create('{m}:{ss}', UnitType.MILLISECOND, 1000, '--:--');
  public static readonly eteHoursFormatter = DurationFormatter.create('{h}:{mm}', UnitType.MILLISECOND, 1000, '--:--');

  public static readonly timeOfDay12HFormatter = DateTimeFormatter.create('{hh}:{mm}');
  public static readonly timeOfDay24HFormatter = DateTimeFormatter.create('{HH}:{mm}');

  public static readonly timeOfDayUTCWithSuffixFormatter = DateTimeFormatter.create('{HH}:{mm}z');
  public static readonly timeOfDay12HWithSuffixFormatter = DateTimeFormatter.create('{hh}:{mm}{AM}');

  public static readonly timeOfDaySuffixFormatter = DateTimeFormatter.create('{AM}');

  public static readonly dayMonthFormatter = DateTimeFormatter.create('{d} {MON}');
  public static readonly yearFormatter = DateTimeFormatter.create('{YYYY}');

  public static readonly MONTHS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];

  public static readonly showTenthsUnderOneHundred = NumberFormatter.create({ precision: 0.1, maxDigits: 3, nanString: '---' });

  /**
   * Creates a time value formatter subscribable.
   * @param bus The event bus to use.
   * @param t The timestamp as an offset from the UNIX epoch in ms (i.e. a standard JS timestamp).
   * @returns A subscribable with the formatted time (including AM/PM for H12 format), but without z or LCL suffix.
   */
  public static createTimeValueSubscribable(bus: EventBus, t: Subscribable<number>): MappedSubscribable<string> {
    const settings = TimeUserSettings.getManager(bus);
    return MappedSubject.create(
      ([format, offset, timestamp]) => {
        switch (format) {
          case TimeFormat.H12:
            return FormatUtils.timeOfDay12HWithSuffixFormatter(timestamp + offset * 60_000);
          case TimeFormat.H24:
            return FormatUtils.timeOfDay24HFormatter(timestamp + offset * 60_000);
          case TimeFormat.UTC:
            return FormatUtils.timeOfDay24HFormatter(timestamp);
        }
      },
      settings.getSetting('timeFormat'),
      settings.getSetting('localTimeOffset'),
      t,
    );
  }

  /**
   * Creates a time suffix subscribable.
   * @param bus The event bus to use.
   * @returns A subscribable containing either 'Z' or 'LCL' depending on the time format setting.
   */
  public static createTimeSuffixSubscribable(bus: EventBus): MappedSubscribable<string> {
    const settings = TimeUserSettings.getManager(bus);
    return settings.getSetting('timeFormat').map((v) => v === TimeFormat.UTC ? 'Z' : 'LCL');
  }

  /**
   * Creates a day month formatter subscribable.
   * @param bus The event bus to use.
   * @param t The timestamp as an offset from the UNIX epoch in ms (i.e. a standard JS timestamp).
   * @returns A subscribable with the formatted day number and month (as a 3 letter uppercase abbreviation).
   */
  public static createDayMonthSubscribable(bus: EventBus, t: Subscribable<number>): MappedSubscribable<string> {
    const settings = TimeUserSettings.getManager(bus);
    return MappedSubject.create(
      ([format, offset, timestamp]) => {
        switch (format) {
          case TimeFormat.H12:
          case TimeFormat.H24:
            return FormatUtils.dayMonthFormatter(timestamp + offset * 60_000);
          case TimeFormat.UTC:
            return FormatUtils.dayMonthFormatter(timestamp);
        }
      },
      settings.getSetting('timeFormat'),
      settings.getSetting('localTimeOffset'),
      t,
    );
  }

  /**
   * Creates a year formatter subscribable.
   * @param bus The event bus to use.
   * @param t The timestamp as an offset from the UNIX epoch in ms (i.e. a standard JS timestamp).
   * @returns A subscribable with the formatted day number and month (as a 3 letter uppercase abbreviation).
   */
  public static createYearSubscribable(bus: EventBus, t: Subscribable<number>): MappedSubscribable<string> {
    const settings = TimeUserSettings.getManager(bus);
    return MappedSubject.create(
      ([format, offset, timestamp]) => {
        switch (format) {
          case TimeFormat.H12:
          case TimeFormat.H24:
            return FormatUtils.yearFormatter(timestamp + offset * 60_000);
          case TimeFormat.UTC:
            return FormatUtils.yearFormatter(timestamp);
        }
      },
      settings.getSetting('timeFormat'),
      settings.getSetting('localTimeOffset'),
      t,
    );
  }

  /**
   * Gets the fuel flow unit string based on the selected weight unit.
   * @param weightUnit The fuel unit.
   * @returns The fuel flow unit string.
   */
  public static getFuelUnitString(weightUnit: Unit<UnitFamily.Weight>): string {
    switch (weightUnit) {
      case UnitType.KILOGRAM:
        return 'KG';
      case UnitType.POUND:
        return 'LB';
      case UnitType.LITER_FUEL:
        return 'L';
      case UnitType.IMP_GALLON_FUEL:
        return 'ImG';
      case UnitType.GALLON_FUEL:
      default:
        return 'Gal';
    }
  }

  /**
   * Gets the fuel flow unit string based on the selected units setting.
   * @param unit The fuel unit setting.
   * @returns The fuel flow unit string.
   */
  public static getFuelUnitSettingString(unit: UnitsFuelSettingMode): string {
    switch (unit) {
      case UnitsFuelSettingMode.Kilograms:
        return 'KG';
      case UnitsFuelSettingMode.Pounds:
        return 'LB';
      case UnitsFuelSettingMode.Liters:
        return 'L';
      case UnitsFuelSettingMode.ImpGal:
        return 'ImG';
      case UnitsFuelSettingMode.Gallons:
      default:
        return 'Gal';
    }
  }
}

/** A bearing string formatter that's responsive to angle and angle reference. */
export class BearingFormatter implements Subscription {
  private _isAlive = true;
  /** @inheritDoc */
  public get isAlive(): boolean {
    return this._isAlive;
  }

  private _isPaused = true;
  /** @inheritDoc */
  public get isPaused(): boolean {
    return this._isPaused;
  }

  /** @inheritDoc */
  public readonly canInitialNotify = true;

  private readonly subscriptions: Subscription[] = [];

  public number = Subject.create('');
  public unit = Subject.create('');
  public fullLabel = Subject.create('');

  private readonly navAngleModeToUnit: Record<UnitsNavAngleSettingMode, BasicNavAngleUnit> = {
    [UnitsNavAngleSettingMode.Magnetic]: this.store.aircraftNavAngleMagneticUnit,
    [UnitsNavAngleSettingMode.True]: this.store.aircraftNavAngleTrueUnit,
  };

  /**
   * Creates a BearingFormatter
   * @param currentNavAngleUnit The current nav angle reference in user settings.
   * @param store The flight plan store.
   * @param navAngleSubject The bearing nav angle subject.
   * @param navAngleSubjectSub A reference to the subscription of the `BasicNavAngleSubject` if it was created by this class.
   */
  private constructor(
    protected readonly currentNavAngleUnit: UserSetting<UnitsNavAngleSettingMode>,
    protected readonly store: FlightPlanStore,
    private readonly navAngleSubject: Subscribable<NumberUnitInterface<'navangle', NavAngleUnit>>,
    navAngleSubjectSub?: Subscription,
  ) {
    const mappedSubject = MappedSubject.create(
      this.navAngleSubject,
      this.currentNavAngleUnit,
    );

    const sub: Subscription = mappedSubject.sub(([bearing, navAngleUnit]) => {
      this.number.set(FormatUtils.formatCourse(bearing.asUnit(this.navAngleModeToUnit[navAngleUnit])));
      this.unit.set(UnitFormatter.bearingLabel(navAngleUnit));
      this.fullLabel.set(`${this.number.get()}${this.unit.get()}`);
    }, true);

    this.subscriptions.push(mappedSubject);
    this.subscriptions.push(sub);
    navAngleSubjectSub && this.subscriptions.push(navAngleSubjectSub);
  }

  /**
   * Creates a BearingStringFormatter
   * @param bearingNumericValue The numeric value of the bearing.
   * @param bearingNavAngleMode Whether the numeric value above is referenced to true or magnetic.
   * @param currentNavAngleUnit The current nav angle reference in user settings.
   * @param store The flight plan store.
   * @returns A bearing formatter.
   */
  public static createFromNumber(
    bearingNumericValue: Subscribable<number>,
    bearingNavAngleMode: UnitsNavAngleSettingMode,
    currentNavAngleUnit: UserSetting<UnitsNavAngleSettingMode>,
    store: FlightPlanStore,
  ): BearingFormatter {
    const navAngleSubject = BasicNavAngleSubject.create(
      store.aircraftNavAngleMagneticUnit.createNumber(NaN)
    );

    const sub: Subscription = bearingNumericValue.sub(v =>
      navAngleSubject.set(v, bearingNavAngleMode === UnitsNavAngleSettingMode.Magnetic
        ? store.aircraftNavAngleMagneticUnit
        : store.aircraftNavAngleTrueUnit,
      )
    );

    return new BearingFormatter(
      currentNavAngleUnit,
      store,
      navAngleSubject,
      sub,
    );
  }

  /**
   * Creates a BearingStringFormatter
   * @param navAngleSub The bearing nav angle subject.
   * @param currentNavAngleUnit The current nav angle reference in user settings.
   * @param store The flight plan store.
   * @returns A bearing formatter.
   */
  public static createFromNavAngle(
    navAngleSub: Subscribable<NumberUnitInterface<'navangle', NavAngleUnit>>,
    currentNavAngleUnit: UserSetting<UnitsNavAngleSettingMode>,
    store: FlightPlanStore,
  ): BearingFormatter {
    return new BearingFormatter(
      currentNavAngleUnit,
      store,
      navAngleSub,
    );
  }

  /**
   * Formats a bearing value with the appropriate unit.
   * @param bearing The bearing value to be formatted.
   * @param unit The unit for the bearing (true/magnetic).
   * @returns The formatted bearing string with the appropriate unit label.
   */
  public static format(bearing: number | null | undefined, unit: UnitsNavAngleSettingMode): string {
    return `${FormatUtils.formatCourse(bearing)}${UnitFormatter.bearingLabel(unit)}`;
  }

  /** @inheritDoc */
  public pause(): this {
    if (!this._isAlive) {
      throw new Error('Subscription: cannot pause a dead Subscription.');
    }

    if (this._isPaused) {
      return this;
    }

    this._isPaused = true;

    for (const subscription of this.subscriptions) {
      subscription.pause();
    }

    return this;
  }

  /** @inheritDoc */
  public resume(): this {
    if (!this._isAlive) {
      throw new Error('Subscription: cannot resume a dead Subscription.');
    }

    if (!this._isPaused) {
      return this;
    }

    this._isPaused = false;

    for (const subscription of this.subscriptions) {
      subscription.resume();
    }

    return this;
  }

  /** @inheritDoc */
  public destroy(): void {
    if (!this._isAlive) {
      return;
    }

    this._isAlive = false;

    for (const subscription of this.subscriptions) {
      subscription.destroy();
    }
  }

  /** @inheritdoc */
  public withLifecycle(lifecycle: ReadonlyLifecycle): this {
    lifecycle.register(this);
    return this;
  }

}

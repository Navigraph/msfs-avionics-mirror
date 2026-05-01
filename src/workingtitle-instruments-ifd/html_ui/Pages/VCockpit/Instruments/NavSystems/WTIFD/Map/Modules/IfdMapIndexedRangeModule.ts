import { MathUtils, NumberUnitInterface, NumberUnitSubject, Subject, Subscribable, UnitFamily, UnitType } from '@microsoft/msfs-sdk';


/**
 * A module describing the nominal range of a map, as selected from an array of ranges.
 */
export class IfdMapIndexedRangeModule {
  /** The index of the nominal range. */
  public readonly nominalRangeIndex = Subject.create(0) as Subscribable<number>;

  /** The array of possible map nominal ranges. */
  public readonly nominalRanges: Subject<readonly NumberUnitInterface<UnitFamily.Distance>[]>
    = Subject.create([UnitType.NMILE.createNumber(20)] as readonly NumberUnitInterface<UnitFamily.Distance>[]);

  /** The nominal range. */
  public readonly nominalRange = NumberUnitSubject.create(UnitType.NMILE.createNumber(1)) as Subscribable<NumberUnitInterface<UnitFamily.Distance>>;

  /**
   * Creates a new instance of MapIndexedRangeModule.
   */
  public constructor() {
    this.nominalRanges.sub(this.onNominalRangesChanged.bind(this));
  }

  /**
   * A callback which is called when the nominal range array changes.
   * @param array The new array.
   */
  private onNominalRangesChanged(array: readonly NumberUnitInterface<UnitFamily.Distance>[]): void {
    const currentIndex = this.nominalRangeIndex.get();
    this.setNominalRangeIndex(MathUtils.clamp(currentIndex, 0, array.length - 1));
  }

  /**
   * Sets the nominal range by index.
   * @param index The index of the new nominal range.
   * @returns The value of the new nominal range.
   * @throws Error if index of out of bounds.
   */
  public setNominalRangeIndex(index: number): NumberUnitInterface<UnitFamily.Distance> {
    const rangeArray = this.nominalRanges.get();
    if (index < 0 || index >= rangeArray.length) {
      throw new RangeError('Index out of bounds.');
    }

    const range = rangeArray[index];
    (this.nominalRangeIndex as Subject<number>).set(index);
    (this.nominalRange as Subject<NumberUnitInterface<UnitFamily.Distance>>).set(range);
    return range;
  }

  /**
   * Sets the nominal range to the given number of nautical miles.
   * @param nm The nominal range in nautical miles.
   */
  public setNominalRangeNm(nm: number): void {
    const rangeIndex = this.nominalRanges.get().findIndex(range => range.compare(nm) >= 0);
    this.setNominalRangeIndex(rangeIndex >= 0 ? Math.max(rangeIndex, 4) : 6);
  }

  /**
   * Sets the nominal range to fit the given minimum range given in Great-arc radians.
   * @param minimumRange The minimum range in Great-arc radians.
   */
  public setNominalRangeToFitRadians(minimumRange: number): void {
    const nmRange = UnitType.NMILE.convertFrom(minimumRange / 2, UnitType.GA_RADIAN);
    const rangeIndex = this.nominalRanges.get().findIndex(range => range.compare(nmRange) >= 0);
    this.setNominalRangeIndex(rangeIndex >= 0 ? Math.max(rangeIndex, 4) : 6);
  }
}

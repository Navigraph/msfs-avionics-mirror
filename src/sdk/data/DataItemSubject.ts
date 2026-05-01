import { AbstractSubscribable } from '../sub/AbstractSubscribable';
import { MutableSubscribable } from '../sub/Subscribable';
import { DataItem, DataItemStatus } from './DataItem';
import { DataItemUtils } from './DataItemUtils';

/**
 * A subscribable subject that provides a {@link DataItem} value.
 */
export class DataItemSubject<T> extends AbstractSubscribable<Readonly<DataItem<T>>> implements MutableSubscribable<Readonly<DataItem<T>>> {
  /** @inheritDoc */
  public readonly isMutableSubscribable = true;

  private readonly dataItem: DataItem<T>;

  /**
   * Creates a new instance of DataItemSubject.
   * @param initialValue The subject's initial value.
   * @param valueEqualityFunc The function this subject uses check for equality between data item values.
   */
  private constructor(
    initialValue: DataItem<T>,
    private readonly valueEqualityFunc: (a: T, b: T) => boolean = DataItemUtils.defaultValueEquals
  ) {
    super();

    this.dataItem = initialValue;
  }

  /**
   * Creates a new instance of DataItemSubject.
   * @param initialValue The new subject's initial value.
   * @param valueEqualityFunc The function to use to check for equality between data item values. Defaults to a
   * function that implements default data item value equality semantics: two values `a` and `b` are equal if and only
   * if the strict equality operator (`===`) evaluates to `true` for `a` and `b`, or both `a` and `b` are the numeric
   * value `NaN`.
   * @returns A new instance of DataItemSubject.
   */
  public static create<T>(initialValue: Readonly<DataItem<T>>, valueEqualityFunc?: (a: T, b: T) => boolean): DataItemSubject<T> {
    return new DataItemSubject<T>(initialValue, valueEqualityFunc);
  }

  /** @inheritDoc */
  public get(): Readonly<DataItem<T>> {
    return this.dataItem;
  }

  /**
   * Sets the value of this subject.
   * @param value The value to set.
   */
  public set(value: Readonly<DataItem<T>>): void;
  /**
   * Sets the value of this subject to an empty data item.
   * @param status The data item status to set, which must be `EmptyValue`.
   */
  public set(status: DataItemStatus.EmptyValue): void;
  /**
   * Sets the value of this subject to a filled data item with a given status and value.
   * @param status The data item status to set.
   * @param value The data item value to set.
   */
  public set(status: Exclude<DataItemStatus, DataItemStatus.EmptyValue>, value: T): void;
  /**
   * Sets the value of this subject to a data item with a given status and value.
   * @param status The data item status to set.
   * @param value The data item value to set.
   */
  public set<S extends DataItemStatus>(status: S, value: S extends DataItemStatus.EmptyValue ? undefined : T): void;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public set(arg1: Readonly<DataItem<T>> | DataItemStatus, arg2?: T | undefined): void {
    let status: DataItemStatus;
    let value: T | undefined;

    if (typeof arg1 === 'object') {
      status = arg1.status;
      value = arg1.value;
    } else {
      status = arg1;
      value = arg2;
    }

    if (status === DataItemStatus.EmptyValue) {
      value = undefined;
    }

    if (
      this.dataItem.status !== status
      || (status !== DataItemStatus.EmptyValue && !this.valueEqualityFunc(this.dataItem.value as T, value as T))
    ) {
      this.dataItem.status = status;
      this.dataItem.value = value;

      this.notify();
    }
  }
}

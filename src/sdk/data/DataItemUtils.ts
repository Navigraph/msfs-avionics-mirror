import { DataItem, DataItemOfStatus, DataItemStatus, DataItemStatusGuard, DataItemValueType, EmptyDataItem } from './DataItem';

/**
 * A utility class for working with {@link DataItem | DataItems}.
 */
export class DataItemUtils {
  /**
   * Creates a new empty data item.
   * @returns A new empty data item.
   */
  public static emptyItem(): EmptyDataItem {
    return {
      value: undefined,
      status: DataItemStatus.EmptyValue,
    };
  }

  /**
   * Checks whether two data items are equal using default equality semantics for data item values: values for two data
   * items `a.value` and `b.value` are equal if and only if the strict equality operator (`===`) evaluates to `true`
   * for `a.value` and `b.value`, or both `a.value` and `b.value` are the numeric value `NaN`.
   * @param a The first data item to check.
   * @param b The second data item to check.
   * @returns Whether the two specified data items are equal using default equality semantics for their data item
   * values.
   */
  public static defaultEquals(a: Readonly<DataItem<unknown>>, b: Readonly<DataItem<unknown>>): boolean {
    return a.status === b.status
      && (a.status === DataItemStatus.EmptyValue || DataItemUtils.defaultValueEquals(a.value, b.value));
  }

  /**
   * Creates a function that evaluates the equality of two data items given value equality semantics defined by a
   * supplied function.
   * @param valueEqualityFunc The function to use to check whether two data item values are equal. Defaults to a
   * function that implements default equality semantics: two values `a` and `b` are equal if and only if the strict
   * equality operator (`===`) evaluates to `true` for `a` and `b`, or both `a` and `b` are the numeric value `NaN`.
   * @returns A function that evaluates the equality of two data items given the value equality semantics defined by
   * the specified function.
   * @template T The value type of the data items to compare.
   */
  public static createEquals<T>(
    valueEqualityFunc: (a: T, b: T) => boolean = DataItemUtils.defaultValueEquals
  ): (a: Readonly<DataItem<T>>, b: Readonly<DataItem<T>>) => boolean {
    return (a, b) => {
      return a.status === b.status
        && (a.status === DataItemStatus.EmptyValue || valueEqualityFunc(a.value, b.value as T));
    };
  }

  /**
   * Checks whether two data item values are equal using default equality semantics: two values `a` and `b` are equal
   * if and only if the strict equality operator (`===`) evaluates to `true` for `a` and `b`, or both `a` and `b` are
   * the numeric value `NaN`.
   * @param a The first data item value to check.
   * @param b The second data item value to check.
   * @returns Whether the two specified values are equal using default equality semantics.
   */
  public static defaultValueEquals(a: unknown, b: unknown): boolean {
    return a === b
      || (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b));
  }

  /**
   * Checks if a data item is valid. A valid data item's status is either {@link DataItemStatus.Normal} or
   * {@link DataItemStatus.Testing}.
   * @param dataItem The data item to check.
   * @returns Whether the specified data item's status is either {@link DataItemStatus.Normal} or
   * {@link DataItemStatus.Testing}.
   */
  public static defaultIsValid(dataItem: Readonly<DataItem<unknown>>): dataItem is Readonly<DataItemOfStatus<unknown, DataItemStatus.Normal | DataItemStatus.Testing>> {
    return DataItemUtils.defaultIsStatusValid(dataItem.status);
  }

  /**
   * Checks if a data item status is either {@link DataItemStatus.Normal} or {@link DataItemStatus.Testing}.
   * @param status The data item status to check.
   * @returns Whether the specified data item's status is either {@link DataItemStatus.Normal} or
   * {@link DataItemStatus.Testing}.
   */
  public static defaultIsStatusValid(status: DataItemStatus): status is DataItemStatus.Normal | DataItemStatus.Testing {
    return status === DataItemStatus.Normal || status === DataItemStatus.Testing;
  }

  /**
   * Creates a function that checks whether data items are valid.
   * @param validStatuses An array of data item statuses that should be considered valid. The returned function will
   * consider a data item to be valid if and only if its status is contained in this array.
   * @returns A function that checks whether data items are valid given the specified array of valid statuses.
   * @template S The type of the data item statuses that should be considered valid.
   */
  public static createIsValid<S extends DataItemStatus>(validStatuses: readonly S[]): DataItemStatusGuard<S> {
    return ((dataItem) => (validStatuses as readonly DataItemStatus[]).includes(dataItem.status)) as DataItemStatusGuard<S>;
  }

  /**
   * Creates a function that checks whether data item statuses are valid.
   * @param validStatuses An array of data item statuses that should be considered valid. The returned function will
   * consider a data item status to be valid if and only if it is contained in this array.
   * @returns A function that checks whether data item statuses are valid given the specified array of valid statuses.
   * @template S The type of the data item statuses that should be considered valid.
   */
  public static createIsStatusValid<S extends DataItemStatus>(validStatuses: readonly S[]): (status: DataItemStatus) => status is S {
    return (status): status is S => (validStatuses as readonly DataItemStatus[]).includes(status);
  }

  /**
   * Gets the value of a data item if it is valid or a default value if it is not valid.
   * @param dataItem The data item for which to get a value.
   * @param defaultValue The default value returned when the data item is invalid.
   * @param isValid A function that checks whether the data item is valid. Defaults to a function that considers a data
   * item to be valid if and only if its status is {@link DataItemStatus.Normal} or {@link DataItemStatus.Testing}.
   * @returns The value of the specified data item if it is valid (according to the `isValid` argument), or the
   * specified default value if the item is invalid.
   * @template Item The type of the data item for which to get a value.
   * @template D The type of the default value.
   */
  public static valueOr<Item extends Readonly<DataItem<unknown>>, D = DataItemValueType<Item>>(
    dataItem: Item,
    defaultValue: D,
    isValid: DataItemStatusGuard<Exclude<DataItemStatus, DataItemStatus.EmptyValue>> = DataItemUtils.defaultIsValid
  ): DataItemValueType<Item> | D {
    if (isValid(dataItem)) {
      return dataItem.value as DataItemValueType<Item>;
    }
    return defaultValue;
  }
}

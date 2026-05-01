/**
 * The status of a data item.
 */
export enum DataItemStatus {
  /** The data item has no value. */
  EmptyValue = 0,

  /** The data item value is a normal value. */
  Normal,

  /** The data item is reporting that the value may be unreliable due to a failure. */
  Failed,

  /** The data item is reporting that the value may be unreliable due to a reason other than a failure. */
  NoComputedValue,

  /** The data item value is sourced from a functional test. */
  Testing,
}

/**
 * A data item with a filled value and corresponding status.
 * @template T The type of the data item's value.
 */
export interface FilledDataItem<T> {
  /** The data item value. */
  value: T;

  /** The data item status. */
  status: Exclude<DataItemStatus, DataItemStatus.EmptyValue>;
}

/**
 * A valueless (empty) data item with the `EmptyValue` status.
 */
export interface EmptyDataItem {
  /** The empty value, which is always `undefined`. */
  value: undefined;

  /** The data item status. */
  status: DataItemStatus.EmptyValue;
}

/**
 * A data item, consisting of a value and an associated status.
 * @template T The type of the data item's value.
 */
export type DataItem<T> = FilledDataItem<T> | EmptyDataItem;

/**
 * Gets the value type for a data item type.
 * @template Item The data item type for which to get a value type.
 */
export type DataItemValueType<Item extends Readonly<DataItem<unknown>>> = Item extends Readonly<FilledDataItem<infer T>> ? T : never;

/**
 * A data item with a status that satisifes a given type.
 * @template T The type of the data item's value.
 * @template S The type satisfied by the data item's status.
 */
export type DataItemOfStatus<T, S extends DataItemStatus> = DataItem<T> & {
  // eslint-disable-next-line jsdoc/require-jsdoc
  status: S
};

/**
 * A function that checks whether data items have statuses that satisfy a given type.
 * @template S The status type that the function checks.
 */
export type DataItemStatusGuard<S extends DataItemStatus> = (dataItem: Readonly<DataItem<unknown>>) => dataItem is Readonly<DataItemOfStatus<unknown, S>>;

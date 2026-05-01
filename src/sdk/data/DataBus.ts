import { Subscribable } from '../sub/Subscribable';
import { DataItem, DataItemStatus } from './DataItem';

/**
 * A provider of subscribable {@link DataItem | DataItems}.
 */
export interface DataBusClient {
  /**
   * Retrieves a typed data bus client that provides data items described by a record type.
   * @returns A typed data bus client that provides data items described by the specified record type.
   * @template R A record describing the data items available from the typed client to return. The name of each
   * property in the record defines one label that can be used to retrieve a data item, and the type of the
   * property defines the value type of data items retrieved using the label (under any index).
   * @template I The indexes for which data items are available from the client.
   */
  of<R extends Record<string, any> = Record<never, never>, I extends number = number>(): TypedDataBusClient<R, I>;
}

/**
 * A provider of subscribable {@link DataItem | DataItems}. Each data item is accessed using a combination of a string
 * label and a numeric index. The data item labels available from the provider are defined by its record type
 * parameter.
 * @template R The record describing the data items available from the client. The name of each property in the record
 * defines one label that can be used to retrieve a data item, and the type of the property defines the value type of
 * data items retrieved using the label (under any index).
 * @template I The indexes for which data items are available from the client.
 */
export interface TypedDataBusClient<R extends Record<string, any>, I extends number = number> {
  /**
   * Gets a subscribable for a data item.
   * @param label The label of the data item to get.
   * @param index The index of the data item to get.
   * @returns A subscribable for the requested data item.
   * @template L The label of the data item to get.
   */
  getSubscribable<L extends keyof R & string>(label: L, index: I): Subscribable<Readonly<DataItem<R[L]>>>;
}

/**
 * A provider of subscribable {@link DataItem | DataItems} that also supports publishing changes to the same data
 * items.
 */
export interface DataBusHost extends DataBusClient {
  /**
   * Retrieves a typed data bus host that provides and allows publishing to data items described by a record type.
   * @returns A typed data bus host that provides and allows publishing to data items described by the specified record
   * type.
   * @template R A record describing the data items available from the typed host to return. The name of each property
   * in the record defines one label that can be used to access a data item, and the type of the property defines the
   * value type of data items accessed using the label (under any index).
   * @template I The indexes for which data items are available from the host.
   */
  of<R extends Record<string, any> = Record<never, never>, I extends number = number>(): TypedDataBusHost<R, I>;
}

/**
 * A provider of subscribable {@link DataItem | DataItems} that also supports publishing changes to the same data
 * items. Each data item is accessed using a combination of a string label and a numeric index. The data item labels
 * available from the provider are defined by its record type parameter.
 * @template R The record describing the data items available from the host. The name of each property in the record
 * defines one label that can be used to access a data item, and the type of the property defines the value type of
 * data items accessed using the label (under any index).
 * @template I The indexes for which data items are available from the host.
 */
export interface TypedDataBusHost<R extends Record<string, any>, I extends number = number> extends TypedDataBusClient<R, I> {
  /**
   * Gets a publisher for a data item, which can be used to publish changes to its associated data item.
   * @param label The label of the data item for which to get a publisher.
   * @param index The index of the data item for which to get a publisher.
   * @returns A publisher for the requested data item.
   * @template L The label of the data item for which to get a publisher.
   */
  getPublisher<L extends keyof R & string>(label: L, index: I): DataBusItemPublisherForLabel<R, L>;
}

/**
 * Gets the type of the {@link DataBusItemPublisher} for a data item label.
 * @template R The record describing the available data items.
 * @template L The label of the data item for which to get a publisher type.
 */
export type DataBusItemPublisherForLabel<R extends Record<string, any>, L extends keyof R & string>
  = L extends any ? DataBusItemPublisher<R[L]> : never;

/**
 * A publisher that publishes changes to a {@link DataItem} from a data bus.
 * @template T The value type of the publisher's data item.
 * @see {@link TypedDataBusHost}
 */
export interface DataBusItemPublisher<T> {
  /**
   * Defines equality semantics for this publisher's data item values. The specified equality semantics will be used to
   * determine whether to notify subscribers when an update to the data item is published (subscribers are notified if
   * and only if either the new data item value or status is not equal to the old data item value or status,
   * respectively).
   * @param equalityFunc A function that implements the desired equality semantics by returning whether two data item
   * values are equal. If not defined, then default equality semantics will be used, which state that two values `a`
   * and `b` are equal if and only if the strict equality operator (`===`) evaluates to `true` for `a` and `b`, or both
   * `a` and `b` are the numeric value `NaN`.
   */
  defineEquality(equalityFunc: ((a: T, b: T) => boolean) | undefined): this;

  /**
   * Publishes an empty-value update to this publisher's data item.
   * @param status The status to publish, which must be `EmptyValue`.
   * @param value The value to publish, which must be `undefined`.
   */
  publish(status: DataItemStatus.EmptyValue, value: undefined): void;
  /**
   * Publishes a value and status update to this publisher's data item.
   * @param status The status to publish.
   * @param value The value to publish.
   */
  publish(status: Exclude<DataItemStatus, DataItemStatus.EmptyValue>, value: T): void;
  /**
   * Publishes a value and status update to this publisher's data item.
   * @param status The status to publish.
   * @param value The value to publish.
   * @template S The status to publish.
   */
  publish<S extends DataItemStatus>(status: S, value: S extends DataItemStatus.EmptyValue ? undefined : T): void;

  /**
   * Publishes an empty-value update to this publisher's data item. The data item's status will be set to
   * {@link DataItemStatus.EmptyValue}.
   */
  publishEmpty(): void;
}

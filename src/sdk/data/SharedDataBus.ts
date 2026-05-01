import { AbstractSubscribable } from '../sub/AbstractSubscribable';
import { Subject } from '../sub/Subject';
import { Subscribable } from '../sub/Subscribable';
import { DataBusClient, DataBusItemPublisher, DataBusItemPublisherForLabel, TypedDataBusClient, TypedDataBusHost } from './DataBus';
import { DataItem, DataItemStatus } from './DataItem';
import { DataItemUtils } from './DataItemUtils';
import { SharedGlobal, SharedGlobalObjectRef } from './SharedGlobal';

/**
 * An entry for a data item label in the shared data storage.
 * @template T The value type of the label's data items.
 */
interface LabelEntry<T> {
  /** A map of the label's data items, keyed by index. */
  dataItemEntries: Map<number, DataItemEntry<T>>;
}

/**
 * An entry for a data item in the shared data storage.
 * @template T The type of the value.
 */
interface DataItemEntry<T> {
  /**
   * A number that identifies the version of the current value of the data item. This number should be incremented
   * every time the data item value changes.
   */
  valueId: number;

  /** The value of the data item. */
  current: DataItem<T>;
}

/**
 * An interface that defines the internal shared data structure.
 * @experimental This API is still under development and should not be used for production code.
 */
interface SharedData {
  /** The shared bus data. */
  data?: Map<string, LabelEntry<any>>,
}

/**
 * A subject that delivers shared data values to multiple views.
 * @template T The type of the value in the subject.
 * @experimental This API is still under development and should not be used for production code.
 */
class DistributedSubject<T> extends AbstractSubscribable<Readonly<DataItem<T>>> implements Subscribable<Readonly<DataItem<T>>> {

  private lastUpdatedValueId = 0;

  /**
   * Creates an instance of a DistributedSubject.
   * @param data The data item backing the subject.
   * @experimental This API is still under development and should not be used for production code.
   */
  constructor(private data: DataItemEntry<T>) {
    super();
  }

  /**
   * Sets this subject's backing data item. If the new backing data item is different from the current backing data
   * item, then this will also notify subscribers that the subject's value has changed.
   * @param data The backing data item to set.
   */
  public setData(data: DataItemEntry<T>): void {
    if (data === this.data) {
      return;
    }

    this.data = data;
    this.notify();
  }

  /** @inheritDoc */
  public get(): Readonly<DataItem<T>> {
    return this.data.current;
  }

  /**
   * Updates the subject and notifies subscribers if the value is dirty.
   * @experimental This API is still under development and should not be used for production code.
   */
  public update(): void {
    if (this.lastUpdatedValueId !== this.data.valueId) {
      this.notify();
    }
  }

  /** @inheritDoc */
  protected notify(): void {
    this.lastUpdatedValueId = this.data.valueId;
    super.notify();
  }
}

/**
 * A provider of data that is stored in a global object shared between CoherentGT views. The client requires a
 * corresponding {@link SharedDataBusHost} to function properly.
 * @experimental This API is still under development and should not be used for production code.
 */
export class SharedDataBusClient implements DataBusClient {

  protected data = new Map<string, LabelEntry<any>>();
  protected readonly localSubjects = new Map<string, Map<number, DistributedSubject<any>>>();

  protected readonly _isAlive = Subject.create<boolean>(false);
  /**
   * Signals if the data bus host is alive and available for writing and reading.
   * @experimental This API is still under development and should not be used for production code.
   */
  public readonly isAlive: Subscribable<boolean> = this._isAlive;

  protected readonly typedImplementation = this.createTypedImplementation();

  /**
   * Creates an instance of SharedDataBusClient.
   * @param sharedGlobalName The name of the shared global object that is used to hold the data provided by the client.
   * @experimental This API is still under development and should not be used for production code.
   */
  public constructor(protected readonly sharedGlobalName: string) {
    this.initSharedGlobal();
  }

  /**
   * Waits for the data to be created on the shared object.
   * @param ref The ref to the shared object.
   * @returns The data object.
   */
  private waitDataCreated(ref: SharedGlobalObjectRef<SharedData>): Promise<Map<string, LabelEntry<any>>> {
    return new Promise<Map<string, LabelEntry<any>>>((resolve, reject) => {
      const interval = setInterval(() => {
        if (ref.isDetached.get()) {
          clearInterval(interval);
          reject('Shared global was detached while waiting for data to be created.');
        }

        if (ref.instance.data !== undefined) {
          resolve(ref.instance.data);
        }
      });
    });
  }

  /**
   * Initializes this client from its associated shared global object.
   */
  protected async initSharedGlobal(): Promise<void> {
    try {
      const globalRef = await SharedGlobal.await(this.sharedGlobalName);
      const sharedData = await this.waitDataCreated(globalRef);
      this.setSharedData(sharedData);
      this._isAlive.set(true);

      const sub = globalRef.isDetached.sub(isDestroyed => {
        if (isDestroyed) {
          sub.destroy();
          this._isAlive.set(false);
          this.initSharedGlobal();
        }
      }, false, true);
      sub.resume(true);
    } catch (_) {
      this._isAlive.set(false);
      setTimeout(() => this.initSharedGlobal());
    }
  }

  /**
   * Sets the shared data object used by this client.
   * @param data The shared data object to set.
   */
  protected setSharedData(data: Map<string, LabelEntry<any>>): void {
    this.data = data;

    for (const [key, sourceMap] of this.localSubjects.entries()) {
      for (const [sourceId, sub] of sourceMap.entries()) {
        sub.setData(this.getDataItemEntry<any, string>(key, sourceId));
      }
    }
  }

  /**
   * Creates an object that can access any data item from this client and implements {@link TypedDataBusClient}.
   * @returns An object that can access any data item from this client and implements `TypedDataBusClient`.
   */
  protected createTypedImplementation(): TypedDataBusClient<Record<string, any>> {
    return Object.freeze({
      getSubscribable: <R extends Record<string, any>, L extends (keyof R & string)>(label: L, index: number): Subscribable<Readonly<DataItem<R[L]>>> => {
        return this.getLocalSubject(label, index);
      }
    });
  }

  /** @inheritDoc */
  public of<R extends Record<string, any> = Record<never, never>>(): TypedDataBusClient<R> {
    return this.typedImplementation as TypedDataBusClient<R>;
  }

  /**
   * Gets the entry for a data item label from the shared storage.
   * @param label The label for which to get an entry.
   * @returns The requested data item label entry.
   * @template R A record describing the data item label entry to get. The record should contain a property whose name
   * is equal to the label, and the type of the property defines the value type of the label's data items.
   * @template L The label for which to get an entry.
   */
  protected getLabelEntry<R extends Record<string, any>, L extends (keyof R & string)>(label: L): LabelEntry<R[L]> {
    let labelEntry = this.data.get(label);

    if (labelEntry === undefined) {
      labelEntry = {
        dataItemEntries: new Map<number, DataItemEntry<any>>(),
      };
      this.data.set(label, labelEntry);
    }

    return labelEntry;
  }

  /**
   * Gets the entry for a data item from a label entry.
   * @param labelEntry The label entry from which to get the data item entry.
   * @param index The index of the data item entry to get.
   * @returns The requested data item entry.
   * @template T The type of the data item's value.
   */
  protected getDataItemEntryFromLabelEntry<T>(labelEntry: LabelEntry<T>, index: number): DataItemEntry<T> {
    let dataItemEntry = labelEntry.dataItemEntries.get(index);

    if (dataItemEntry === undefined) {
      dataItemEntry = {
        valueId: 0,
        current: DataItemUtils.emptyItem(),
      };

      labelEntry.dataItemEntries.set(index, dataItemEntry);
    }

    return dataItemEntry;
  }

  /**
   * Gets the entry for a data item from the shared storage.
   * @param label The label of the data item entry to get.
   * @param index The index of the data item entry to get.
   * @returns The requested data item entry.
   * @template R A record describing the data item entry to get. The record should contain a property whose name is
   * equal to the label of the data item entry, and the type of the property defines the value type of the data item
   * entry.
   * @template L The label of the data item entry to get.
   */
  protected getDataItemEntry<R extends Record<string, any>, L extends (keyof R & string)>(label: L, index: number): DataItemEntry<R[L]> {
    return this.getDataItemEntryFromLabelEntry(this.getLabelEntry<R, L>(label), index);
  }

  /**
   * Gets the local subject for a data item. If a local subject does not exist for the specified data item, then one
   * will be created.
   * @param label The label of the data item for which to get a local subject.
   * @param index The index of the data item for which to get a local subject.
   * @returns The local subject for the specified data item.
   * @template R A record describing the data item for which to get a local subject. The record should contain a
   * property whose name is equal to the label of the data item, and the type of the property defines the value type of
   * the data item.
   * @template L The label of the data item for which to get a local subject.
   */
  protected getLocalSubject<R extends Record<string, any>, L extends (keyof R & string)>(label: L, index: number): DistributedSubject<R[L]> {
    let sourceMap = this.localSubjects.get(label);

    if (sourceMap === undefined) {
      sourceMap = new Map<number, DistributedSubject<any>>();
      this.localSubjects.set(label, sourceMap);
    }

    let sub = sourceMap.get(index);

    if (sub === undefined) {
      sub = new DistributedSubject<R[L]>(this.getDataItemEntry(label, index));
      sourceMap.set(index, sub);
    }

    return sub;
  }

  /**
   * Updates the data bus to notify subscribers of updated data items.
   * @experimental This API is still under development and should not be used for production code.
   */
  public update(): void {
    for (const sourceMap of this.localSubjects.values()) {
      for (const sub of sourceMap.values()) {
        sub.update();
      }
    }
  }
}

/**
 * An entry for a data item in the shared data storage.
 * @template T The type of the value.
 */
interface HostDataItemEntry<T> extends DataItemEntry<T> {
  /** The publisher for this entry's data item. */
  publisher?: SharedDataBusItemPublisher<T>;
}

/**
 * Gets the type of the {@link SharedDataBusItemPublisher} for a data item label.
 * @template R The record describing the available data items.
 * @template L The label of the data item for which to get a publisher type.
 */
type SharedDataBusItemPublisherForLabel<R extends Record<string, any>, L extends keyof R & string>
  = L extends any ? SharedDataBusItemPublisher<R[L]> : never;

/**
 * A host of data that is stored in a global object shared between CoherentGT views. Data published to the host can be
 * retrieved by instances of {@link SharedDataBusClient} on the same or different CoherentGT views. The host also acts
 * as a client for its own data.
 * @experimental This API is still under development and should not be used for production code.
 * */
export class SharedDataBusHost extends SharedDataBusClient implements SharedDataBusHost {
  /**
   * Creates an instance of SharedDataBusHost.
   * @param sharedGlobalName The name of the shared global object that is used to hold the data written by the host.
   * There should be at most one instance of SharedDataBusHost across all CoherentGT views for each unique shared
   * global object.
   * @experimental This API is still under development and should not be used for production code.
   */
  public constructor(sharedGlobalName: string) {
    super(sharedGlobalName);
  }

  /**
   * Creates an object that can access any data item from this host and implements {@link TypedDataBusHost}.
   * @returns An object that can access any data item from this host and implements `TypedDataBusHost`.
   */
  protected createTypedImplementation(): TypedDataBusHost<Record<string, any>> {
    return Object.freeze({
      ...super.createTypedImplementation(),

      getPublisher: <R extends Record<string, any>, L extends keyof R & string>(label: L, index: number): DataBusItemPublisherForLabel<R, L> => {
        return this.getItemPublisher(label, index);
      }
    });
  }

  /** @inheritDoc */
  public of<R extends Record<string, any> = Record<never, never>>(): TypedDataBusHost<R> {
    return this.typedImplementation as TypedDataBusHost<R>;
  }

  /**
   * Initializes the shared global object to which this host will write data.
   */
  protected async initSharedGlobal(): Promise<void> {
    let globalRef: SharedGlobalObjectRef<SharedData> | undefined;

    try {
      globalRef = await SharedGlobal.get<SharedData>(this.sharedGlobalName);
    } catch (_) {
      this._isAlive.set(false);
      setTimeout(() => this.initSharedGlobal());
    }

    if (!globalRef) {
      return;
    }

    if (globalRef.instance.data !== undefined) {
      throw new Error('SharedDataBusHost: cannot bind host to a shared global object that is owned by another entity');
    }

    globalRef.instance.data = this.data;

    this._isAlive.set(true);

    const sub = globalRef.isDetached.sub(isDestroyed => {
      if (isDestroyed) {
        sub.destroy();
        this._isAlive.set(false);
        // The host should always be the owner of the shared global object. If the object has been detached, then that
        // can only mean the host's parent view is being destroyed. Therefore we should not try to re-initialize the
        // shared global.
      }
    }, false, true);
    sub.resume(true);
  }

  /**
   * Gets a publisher for a data item.
   * @param label The label of the data item for which to get a publisher.
   * @param index The index of the data item for which to get a publisher.
   * @returns A publisher for the requested data item.
   * @template R A record describing the data item for which to get a publisher. The record should contain a property
   * whose name is equal to the label of the data item, and the type of the property defines the value type of the data
   * item.
   * @template L The label of the data item for which to get a publisher.
   */
  private getItemPublisher<R extends Record<string, any>, L extends keyof R & string>(label: L, index: number): SharedDataBusItemPublisherForLabel<R, L> {
    const labelEntry = this.getLabelEntry<R, L>(label);
    const dataItemEntry = this.getDataItemEntryFromLabelEntry(labelEntry, index) as HostDataItemEntry<R[L]>;

    if (!dataItemEntry.publisher) {
      // NOTE: The equality is function is guaranteed to be defined because getLabelEntry() would have set it to the
      // default function if it was undefined.
      dataItemEntry.publisher = new SharedDataBusItemPublisher(dataItemEntry, this.getLocalSubject(label, index));
    }

    return dataItemEntry.publisher as SharedDataBusItemPublisherForLabel<R, L>;
  }

  /** @inheritDoc */
  public update(): void {
    // The host is guaranteed to immediately notify local subjects of any data item changes when publish() is called,
    // so we don't need to do anything here.
  }
}

/**
 * A publisher that publishes changes to a data item from a shared data bus.
 * @template T The value type of the publisher's data item.
 */
class SharedDataBusItemPublisher<T> implements DataBusItemPublisher<T> {
  private valueEqualityFunc = DataItemUtils.defaultValueEquals;

  /**
   * Creates a new instance of SharedDataBusPublisher.
   * @param dataItemEntry The entry describing this publisher's data item.
   * @param localSubject The local subject for the publisher's data item.
   */
  public constructor(
    private readonly dataItemEntry: DataItemEntry<T>,
    private readonly localSubject: DistributedSubject<T>
  ) {
  }

  /** @inheritDoc */
  public defineEquality(equalityFunc: ((a: T, b: T) => boolean) | undefined = DataItemUtils.defaultValueEquals): this {
    this.valueEqualityFunc = equalityFunc;
    return this;
  }

  /** @inheritDoc */
  public publish(status: DataItemStatus, value: T | undefined): void {
    let isDirty = false;

    const oldStatus = this.dataItemEntry.current.status;

    if (oldStatus !== status) {
      this.dataItemEntry.current.status = status;

      if (status === DataItemStatus.EmptyValue) {
        this.dataItemEntry.current.value = undefined;
      }

      isDirty = true;
    }

    if (this.dataItemEntry.current.status !== DataItemStatus.EmptyValue) {
      // NOTE: if the old status was EmptyValue, then we skip testing equality because the equality function may not
      // handle undefined values. If the data item value type does not include undefined, then the new value is
      // guaranteed to not be equal to the old value. If the data item value type does include undefined, then the new
      // value may be equal to the old value but it does not matter if we replace undefined with itself as the value.
      // In this last case it also doesn't matter that we set isDirty to true because isDirty is guaranteed to already
      // be true if the old status was EmptyValue (the new status is not EmptyValue so there was a status change).
      if (oldStatus === DataItemStatus.EmptyValue || !this.valueEqualityFunc(this.dataItemEntry.current.value, value as T)) {
        this.dataItemEntry.current.value = value as T;
        isDirty = true;
      }
    }

    if (isDirty) {
      // Increment value ID so that client subjects notify their subscribers at the next update.
      ++this.dataItemEntry.valueId;

      // Immediately notify the local subject.
      this.localSubject.update();
    }
  }

  /** @inheritDoc */
  public publishEmpty(): void {
    this.publish(DataItemStatus.EmptyValue, undefined);
  }
}

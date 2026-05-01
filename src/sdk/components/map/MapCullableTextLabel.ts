import { GeoPointInterface } from '../../geo/GeoPoint';
import { MathUtils } from '../../math/MathUtils';
import { ReadonlySubEvent, SubEvent, SubEventInterface } from '../../sub/SubEvent';
import { Subscribable } from '../../sub/Subscribable';
import { SubscribableUtils } from '../../sub/SubscribableUtils';
import { Subscription } from '../../sub/Subscription';
import { ArrayUtils } from '../../utils/datastructures/ArrayUtils';
import { MapProjection } from './MapProjection';
import { MapLocationTextLabel, MapLocationTextLabelOptions, MapTextLabel } from './MapTextLabel';

/**
 * A map text label which can be culled to prevent collision with other labels.
 */
export interface MapCullableTextLabel extends MapTextLabel {
  /** Whether this label is immune to culling. */
  readonly alwaysShow: Subscribable<boolean>;

  /** The bounding box of this label, as [left, top, right, bottom]. */
  readonly bounds: Float64Array;

  /** An invalidation event. */
  readonly invalidation: ReadonlySubEvent<this, void>;

  /**
   * Updates this label's bounding box.
   * @param mapProjection The map projection to use.
   */
  updateBounds(mapProjection: MapProjection): void;
}

/**
 * A cullable (hides labels that collide with other labels) text label associated with a specific geographic location.
 */
export class MapCullableLocationTextLabel extends MapLocationTextLabel implements MapCullableTextLabel {
  /** @inheritdoc */
  public readonly alwaysShow: Subscribable<boolean>;

  /** @inheritdoc */
  public readonly bounds = new Float64Array(4);

  /** @inheritdoc */
  public readonly invalidation: SubEventInterface<this, void> = new SubEvent<this, void>();

  private readonly subs: Subscription[] = [];

  /**
   * Constructor.
   * @param text The text of this label, or a subscribable which provides it.
   * @param priority The priority of this label, or a subscribable which provides it.
   * @param location The geographic location of this label, or a subscribable which provides it.
   * @param alwaysShow Whether this label is immune to culling, or a subscribable which provides it.
   * @param options Options with which to initialize this label.
   */
  constructor(
    text: string | Subscribable<string>,
    priority: number | Subscribable<number>,
    location: GeoPointInterface | Subscribable<GeoPointInterface>,
    alwaysShow: boolean | Subscribable<boolean>,
    options?: MapLocationTextLabelOptions
  ) {
    super(text, priority, location, options);

    this.alwaysShow = SubscribableUtils.toSubscribable(alwaysShow, true);

    const triggerInvalidation = this.triggerInvalidation.bind(this);

    this.subs.push(this.priority.sub(triggerInvalidation));
    this.subs.push(this.alwaysShow.sub(triggerInvalidation));
    this.subs.push(this.location.sub(triggerInvalidation));
    this.subs.push(this.text.sub(triggerInvalidation));
    this.subs.push(this.fontSize.sub(triggerInvalidation));
    this.subs.push(this.anchor.sub(triggerInvalidation));
    this.subs.push(this.offset.sub(triggerInvalidation));
    this.subs.push(this.bgPadding.sub(triggerInvalidation));
    this.subs.push(this.bgOutlineWidth.sub(triggerInvalidation));
  }

  /**
   * Triggers this label's invalidation event.
   */
  private triggerInvalidation(): void {
    this.invalidation.notify(this);
  }

  /** @inheritdoc */
  public updateBounds(mapProjection: MapProjection): void {
    const fontSize = this.fontSize.get();
    const anchor = this.anchor.get();

    const width = 0.6 * fontSize * this.text.get().length;
    const height = fontSize;

    const pos = this.getPosition(mapProjection, MapCullableLocationTextLabel.tempVec2);

    let left = pos[0] - anchor[0] * width;
    let right = left + width;
    let top = pos[1] - anchor[1] * height;
    let bottom = top + height;
    if (this.showBg.get()) {
      const bgPadding = this.bgPadding.get();
      const bgOutlineWidth = this.bgOutlineWidth.get();

      left -= (bgPadding[3] + bgOutlineWidth);
      right += (bgPadding[1] + bgOutlineWidth);
      top -= (bgPadding[0] + bgOutlineWidth);
      bottom += (bgPadding[2] + bgOutlineWidth);
    }

    this.bounds[0] = left;
    this.bounds[1] = top;
    this.bounds[2] = right;
    this.bounds[3] = bottom;
  }

  /**
   * Destroys this label.
   */
  public destroy(): void {
    for (const sub of this.subs) {
      sub.destroy();
    }
  }
}

/**
 * Manages the visibility of a set of {@link MapCullableTextLabel | MapCullableTextLabels}. If culling is enabled, then
 * colliding labels will be culled based on their render priority. Labels with lower priorities will be culled before
 * labels with higher priorities.
 */
export class MapCullableTextLabelManager {
  private static readonly SCALE_UPDATE_THRESHOLD = 1.2;
  private static readonly ROTATION_UPDATE_THRESHOLD = Math.PI / 6;

  private static readonly SORT_FUNC = (a: MapCullableTextLabel, b: MapCullableTextLabel): number => {
    const alwaysShowA = a.alwaysShow.get();
    const alwaysShowB = b.alwaysShow.get();

    if (alwaysShowA && !alwaysShowB) {
      return -1;
    } else if (alwaysShowB && !alwaysShowA) {
      return 1;
    } else {
      return b.priority.get() - a.priority.get();
    }
  };

  private readonly invalidationHandler = (): void => { this.didLabelsInvalidate = true; };

  private readonly registered = new Map<MapCullableTextLabel, Subscription>();

  private readonly registeredLabels: MapCullableTextLabel[] = [];

  /** An array of labels registered with this manager that are visible. */
  public readonly visibleLabels: readonly MapCullableTextLabel[] = [];

  private cullingEnabled: boolean;

  private didCullingEnabledChange = false;
  private didRegisteredLabelsChange = false;
  private didLabelsInvalidate = false;
  private lastScaleFactor = 1;
  private lastRotation = 0;

  private isAlive = true;

  /**
   * Creates a new instance of MapCullableTextLabelManager.
   * @param cullingEnabled Whether culling of labels is enabled. Defaults to `true`.
   */
  public constructor(cullingEnabled = true) {
    this.cullingEnabled = cullingEnabled;
  }

  /**
   * Registers a label with this manager. Newly registered labels will be processed with the next manager update.
   * @param label The label to register.
   * @throws Error if this manager has been destroyed.
   */
  public register(label: MapCullableTextLabel): void {
    if (!this.isAlive) {
      throw new Error('MapCullableTextLabelManager::register(): cannot manipulate a dead manager');
    }

    if (this.registered.has(label)) {
      return;
    }

    this.registered.set(label, label.invalidation.on(this.invalidationHandler));
    this.didRegisteredLabelsChange = true;
  }

  /**
   * Deregisters a label with this manager. Newly deregistered labels will be processed with the next manager update.
   * @param label The label to deregister.
   * @throws Error if this manager has been destroyed.
   */
  public deregister(label: MapCullableTextLabel): void {
    if (!this.isAlive) {
      throw new Error('MapCullableTextLabelManager::deregister(): cannot manipulate a dead manager');
    }

    const sub = this.registered.get(label);

    if (sub === undefined) {
      return;
    }

    sub.destroy();
    this.registered.delete(label);

    this.didRegisteredLabelsChange = true;
  }

  /**
   * Sets whether or not text label culling is enabled.
   * @param enabled Whether or not culling is enabled.
   * @throws Error if this manager has been destroyed.
   */
  public setCullingEnabled(enabled: boolean): void {
    if (!this.isAlive) {
      throw new Error('MapCullableTextLabelManager::setCullingEnabled(): cannot manipulate a dead manager');
    }

    if (enabled === this.cullingEnabled) {
      return;
    }

    this.cullingEnabled = enabled;
    this.didCullingEnabledChange = true;
  }

  /**
   * Updates this manager.
   * @param mapProjection The projection of the map to which this manager's labels are to be drawn.
   * @throws Error if this manager has been destroyed.
   */
  public update(mapProjection: MapProjection): void {
    if (!this.isAlive) {
      throw new Error('MapCullableTextLabelManager::update(): cannot manipulate a dead manager');
    }

    // Check whether we need to update the list of visible labels.

    // If the culling enabled flag changed, if labels were registered/unregistered, or if labels were invalidated, then
    // we must always update the list.
    if (!this.didCullingEnabledChange && !this.didRegisteredLabelsChange && !this.didLabelsInvalidate) {
      // If culling is enabled, then we need to also update the list if the map projection has changed sufficiently
      // since the last update to invalidate the last set of culling calculations.

      if (!this.cullingEnabled) {
        return;
      }

      const scaleFactorRatio = mapProjection.getScaleFactor() / this.lastScaleFactor;
      if (
        scaleFactorRatio < MapCullableTextLabelManager.SCALE_UPDATE_THRESHOLD
        && scaleFactorRatio > 1 / MapCullableTextLabelManager.SCALE_UPDATE_THRESHOLD
      ) {
        const rotationDelta = MathUtils.angularDistanceDeg(mapProjection.getRotation(), this.lastRotation, 0);
        if (rotationDelta < MapCullableTextLabelManager.ROTATION_UPDATE_THRESHOLD) {
          return;
        }
      }
    }

    // If labels were registered or unregistered, then we need to rebuild the registered labels array.
    if (this.didRegisteredLabelsChange) {
      this.registeredLabels.length = this.registered.size;
      let index = 0;
      for (const label of this.registered.keys()) {
        this.registeredLabels[index++] = label;
      }
    }

    // If labels were registered or unregistered, or if labels were invalidated, then we need to re-sort the registered
    // labels array.
    if (this.didRegisteredLabelsChange || this.didLabelsInvalidate) {
      this.registeredLabels.sort(MapCullableTextLabelManager.SORT_FUNC);
    }

    if (this.cullingEnabled) {
      (this.visibleLabels as MapCullableTextLabel[]).length = 0;

      const registeredLabelsCount = this.registeredLabels.length;
      for (let i = 0; i < registeredLabelsCount; i++) {
        const label = this.registeredLabels[i];

        label.updateBounds(mapProjection);

        let show = true;
        if (!label.alwaysShow.get()) {
          const collisionArrayLength = this.visibleLabels.length;
          for (let j = 0; j < collisionArrayLength; j++) {
            const other = this.visibleLabels[j];
            if (MapCullableTextLabelManager.doesCollide(label.bounds, other.bounds)) {
              show = false;
              break;
            }
          }
        }

        if (show) {
          (this.visibleLabels as MapCullableTextLabel[]).push(label);
        }
      }
    } else {
      ArrayUtils.shallowCopy(this.registeredLabels, this.visibleLabels as MapCullableTextLabel[]);
    }

    this.lastScaleFactor = mapProjection.getScaleFactor();
    this.lastRotation = mapProjection.getRotation();
    this.didCullingEnabledChange = false;
    this.didRegisteredLabelsChange = false;
    this.didLabelsInvalidate = false;
  }

  /**
   * Destroys this manager.
   */
  public destroy(): void {
    this.isAlive = false;

    this.registered.clear();
    this.registeredLabels.length = 0;
    (this.visibleLabels as MapCullableTextLabel[]).length = 0;
  }

  /**
   * Checks if two bounding boxes collide.
   * @param a The first bounding box, as a 4-tuple [left, top, right, bottom].
   * @param b The second bounding box, as a 4-tuple [left, top, right, bottom].
   * @returns whether the bounding boxes collide.
   */
  private static doesCollide(a: Float64Array, b: Float64Array): boolean {
    return a[0] < b[2]
      && a[2] > b[0]
      && a[1] < b[3]
      && a[3] > b[1];
  }
}

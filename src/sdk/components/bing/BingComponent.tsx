/// <reference types="@microsoft/msfs-types/js/common" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/types" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" preserve="true" />

import { GameStateProvider } from '../../data/GameStateProvider';
import { SimAltitudeReference } from '../../geo/SimAltitudeReference';
import { BitFlags } from '../../math/BitFlags';
import { ReadonlyFloat64Array, Vec2Math } from '../../math/VecMath';
import { Vec2Subject } from '../../math/VectorSubject';
import { ArraySubject } from '../../sub/ArraySubject';
import { Subject } from '../../sub/Subject';
import { Subscribable } from '../../sub/Subscribable';
import { SubscribableArray } from '../../sub/SubscribableArray';
import { SubscribableSet } from '../../sub/SubscribableSet';
import { Subscription } from '../../sub/Subscription';
import { ArrayUtils } from '../../utils/datastructures/ArrayUtils';
import { DebounceTimer } from '../../utils/time/DebounceTimer';
import { ComponentProps, DisplayComponent, FSComponent, VNode } from '../FSComponent';

/**
 * Weather radar mode data for the BingComponent.
 */
export interface WxrMode {
  /** The weather mode. */
  mode: EWeatherRadar;

  /** The size of the weather radar arc in front of the plane, in radians. */
  arcRadians: number;
}

/**
 * Component props for the MapComponent.
 */
export interface BingComponentProps extends ComponentProps {
  /** The unique ID to assign to this Bing component. */
  id: string;

  /** The mode of the Bing component. */
  mode: EBingMode;

  /** A callback to call when the Bing component is bound. */
  onBoundCallback?: (component: BingComponent) => void;

  /** The internal resolution for the Bing component, as `[width, height]` in pixels. Defaults to 1024x1024 pixels. */
  resolution?: Subscribable<ReadonlyFloat64Array>;

  /**
   * The earth colors for the Bing component. Index 0 defines the water color, and indexes 1 to the end of the array
   * define the terrain colors. Each color should be expressed as `R + G * 256 + B * 256^2`. If not defined, all colors
   * default to black.
   */
  earthColors?: SubscribableArray<number>;

  /**
   * The elevation range over which to assign the earth terrain colors, as `[minimum, maximum]` in feet. The terrain
   * colors are assigned at regular intervals over the entire elevation range, starting with the first terrain color at
   * the minimum elevation and ending with the last terrain color at the maximum elevation. Terrain below and above the
   * minimum and maximum elevation are assigned the first and last terrain colors, respectively. Defaults to
   * `[0, 30000]`.
   */
  earthColorsElevationRange?: Subscribable<ReadonlyFloat64Array>;

  /**
   * The sky color for the Bing component. The sky color is only visible in synthetic vision (`EBingMode.HORIZON`)
   * mode. The color should be expressed as `R + G * 256 + B * 256^2`. Defaults to black.
   */
  skyColor?: Subscribable<number>;

  /** The reference mode for the Bing component. Defaults to `EBingReference.SEA`. */
  reference?: Subscribable<EBingReference>;

  /** The weather radar mode for the Bing component. Defaults to `EWeatherRadar.NONE`. */
  wxrMode?: Subscribable<WxrMode>;

  /**
   * The weather radar colors for the Bing component. Each entry `E_i` of the array is a tuple `[color, rate]` that
   * defines a color stop, where `color` is an RGBA color expressed as `R + G * 256 + B * 256^2 + A * 256^3` and `rate`
   * is a precipitation rate in millimeters per hour.
   *
   * In general, the color defined by `E_i` is applied to precipitation rates ranging from the rate defined by `E_i-1`
   * to the rate defined by `E_i`. There are two special cases. The color defined by `E_0` is applied to the
   * precipitation rates from zero to the rate defined by `E_0`. The color defined by `E_n-1`, where `n` is the length
   * of the array, is applied to the precipitation rates from the rate defined by `E_n-2` to positive infinity.
   *
   * If not defined, the colors default to {@link BingComponent.DEFAULT_WEATHER_COLORS}.
   */
  wxrColors?: SubscribableArray<readonly [number, number]>;

  /** Whether isolines should be shown. Defaults to `false`. */
  isoLines?: Subscribable<boolean>;

  /**
   * The field of view for the Bing component, in degrees. The field of view is measured vertically from the top of the
   * rendered viewport to the bottom. Ignored if `mode` is not `EBingMode.HORIZON` or `EBingMode.TOPVIEW`. Defaults to
   * 50 degrees.
   */
  fov?: Subscribable<number>;

  /**
   * The amount of time, in milliseconds, to delay binding the Bing instance after the component has been rendered.
   * Defaults to 0.
   */
  delay?: number;

  /**
   * Whether to skip unbinding the component's bound Bing instance when the component is destroyed. This option should
   * be set to `true` if other components are sharing the same Bing instance and the other components need the Bing
   * instance to remain bound after the component is destroyed. Defaults to `false`.
   */
  skipUnbindOnDestroy?: boolean;

  /** CSS class(es) to add to the Bing component's image. */
  class?: string | SubscribableSet<string>;
}

/**
 * A FSComponent that displays the MSFS Bing Map, weather radar, and 3D terrain.
 */
export class BingComponent extends DisplayComponent<BingComponentProps> {
  /** The default resolution of the Bing Map along both horizontal and vertical axes, in pixels. */
  public static readonly DEFAULT_RESOLUTION = 1024;

  public static readonly DEFAULT_WEATHER_COLORS: readonly (readonly [number, number])[] = [
    [BingComponent.hexaToRGBAColor('#00000000'), 0.5],
    [BingComponent.hexaToRGBAColor('#004d00ff'), 2.75],
    [BingComponent.hexaToRGBAColor('#cb7300ff'), 12.5],
    [BingComponent.hexaToRGBAColor('#ff0000ff'), 12.5]
  ];

  /** The default field of view for 3D Bing instances (those using `EBingMode.HORIZON` or `EBingMode.TOPVIEW`), in degrees. */
  public static readonly DEFAULT_3D_FOV = 50;

  /** The maximum supported radius, in meters. */
  public static readonly MAX_RADIUS = 5e6;

  private static readonly POSITION_RADIUS_INHIBIT_FRAMES = 10;

  private bingFlags = this.getBingFlags(EBingReference.SEA);

  private mapListener!: ViewListener.ViewListener;
  private isListenerRegistered = false;
  private readonly imgRef = FSComponent.createRef<HTMLImageElement>();

  private readonly mapBoundHandler = this.onMapBound.bind(this);
  private readonly mapUpdateHandler = this.onMapUpdate.bind(this);

  private _isBound = false;
  private uid = -1;

  private _isAwake = true;
  private isDestroyed = false;

  private pos = new LatLong(0, 0);
  private radius = 10;
  private cameraTransform: BingCameraTransform | undefined;

  private readonly resolution = this.props.resolution ?? Vec2Subject.create(Vec2Math.create(BingComponent.DEFAULT_RESOLUTION, BingComponent.DEFAULT_RESOLUTION));
  private readonly earthColors = this.props.earthColors ?? ArraySubject.create(ArrayUtils.create(2, () => BingComponent.hexaToRGBColor('#000000')));
  private readonly earthColorsElevationRange = this.props.earthColorsElevationRange ?? Vec2Subject.create(Vec2Math.create(0, 30000));
  private readonly skyColor = this.props.skyColor ?? Subject.create(BingComponent.hexaToRGBColor('#000000'));
  private readonly reference = this.props.reference ?? Subject.create(EBingReference.SEA);
  private readonly wxrMode = this.props.wxrMode ?? Subject.create<WxrMode>({ mode: EWeatherRadar.OFF, arcRadians: 0.5 });
  private readonly wxrColors = this.props.wxrColors ?? ArraySubject.create(Array.from(BingComponent.DEFAULT_WEATHER_COLORS));
  private readonly isoLines = this.props.isoLines ?? Subject.create<boolean>(false);
  private readonly fov = this.props.fov;

  private readonly wxrColorsArray: number[] = [];
  private readonly wxrRateArray: number[] = [];

  private gameStateSub?: Subscription;

  private resolutionSub?: Subscription;
  private earthColorsSub?: Subscription;
  private earthColorsElevationRangeSub?: Subscription;
  private skyColorSub?: Subscription;
  private referenceSub?: Subscription;
  private wxrModeSub?: Subscription;
  private wxrColorsSub?: Subscription;
  private isoLinesSub?: Subscription;
  private fovSub?: Subscription;

  private setCurrentMapParamsTimer: NodeJS.Timeout | null = null;

  private positionRadiusInhibitFramesRemaining = 0;
  private isPositionRadiusPending = false;
  private readonly positionRadiusInhibitTimer = new DebounceTimer();
  private readonly processPendingPositionRadius = (): void => {
    if (this.isPositionRadiusPending) {
      this.sendPositionRadius();
    }

    if (--this.positionRadiusInhibitFramesRemaining > 0) {
      this.positionRadiusInhibitTimer.schedule(this.processPendingPositionRadius, 0);
    } else {
      this.isPositionRadiusPending = false;
    }
  };

  private hasRadiusExceededLimit = false;

  /**
   * Checks whether this Bing component has been bound.
   * @returns whether this Bing component has been bound.
   */
  public isBound(): boolean {
    return this._isBound;
  }

  /**
   * Checks whether this Bing component is awake.
   * @returns whether this Bing component is awake.
   */
  public isAwake(): boolean {
    return this._isAwake;
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    if ((window as any)['IsDestroying']) {
      this.destroy();
      return;
    }

    const gameStateSubscribable = GameStateProvider.get();
    const gameState = gameStateSubscribable.get();

    if (gameState === GameState.briefing || gameState === GameState.ingame) {
      this.registerListener();
    } else {
      this.gameStateSub = gameStateSubscribable.sub(state => {
        if (this.isDestroyed) {
          return;
        }

        if (state === GameState.briefing || state === GameState.ingame) {
          this.gameStateSub?.destroy();
          this.registerListener();
        }
      });
    }

    window.addEventListener('OnDestroy', this.destroy.bind(this));
  }

  /**
   * Registers this component's Bing map listener.
   */
  private registerListener(): void {
    if ((this.props.delay ?? 0) > 0) {
      setTimeout(() => {
        if (this.isDestroyed) {
          return;
        }

        this.mapListener = RegisterViewListener('JS_LISTENER_MAPS', this.onListenerRegistered.bind(this));
      }, this.props.delay);
    } else {
      this.mapListener = RegisterViewListener('JS_LISTENER_MAPS', this.onListenerRegistered.bind(this));
    }
  }

  /**
   * A callback called when this component's Bing map listener is registered.
   */
  private onListenerRegistered(): void {
    if (this.isDestroyed || this.isListenerRegistered) {
      return;
    }

    this.mapListener.on('MapBinded', this.mapBoundHandler);
    this.mapListener.on('MapUpdated', this.mapUpdateHandler);

    this.isListenerRegistered = true;
    this.mapListener.trigger('JS_BIND_BINGMAP', this.props.id, this.bingFlags);
  }

  /**
   * A callback that is called when a Bing instance is newly bound to a Bing ID or when the instance bound to a Bing ID
   * changes.
   * @param binder An object that identifies the Bing ID to which the Bing instance is bound.
   * @param uid The unique ID of the bound Bing instance.
   */
  private onMapBound(binder: BingMapsBinder, uid: number): void {
    if (this.isDestroyed) {
      return;
    }

    if (binder.friendlyName === this.props.id) {
      if (this._isBound && this.uid === uid) {
        return;
      }

      const isInitialBinding = !this._isBound;

      this._isBound = true;
      this.uid = uid;

      if (isInitialBinding) {
        Coherent.call('SHOW_MAP', uid, true);
      }

      // Even if this is not the first time this component's Bing instance is bound, we want to send all the parameters
      // to the Bing instance again (if this component is awake) because when the Bing instance is re-bound, there is a
      // chance that some previous parameters we sent in were lost while the Bing instance was being switched around.

      const pause = !this._isAwake;

      if (isInitialBinding) {
        this.earthColorsSub = this.earthColors.sub(this.onEarthColorsChanged.bind(this), true, pause);
        this.earthColorsElevationRangeSub = this.earthColorsElevationRange.sub(this.sendEarthColorsElevationRange.bind(this), true, pause);
        this.skyColorSub = this.skyColor.sub(this.onSkyColorChanged.bind(this), true, pause);
        this.referenceSub = this.reference.sub(this.onReferenceChanged.bind(this), true, pause);
        this.wxrModeSub = this.wxrMode.sub(this.onWxrModeChanged.bind(this), true, pause);
        this.wxrColorsSub = this.wxrColors.sub(this.onWxrColorsChanged.bind(this), true, pause);
        this.resolutionSub = this.resolution.sub(this.onResolutionChanged.bind(this), true, pause);
        this.isoLinesSub = this.isoLines.sub(this.onShowIsoLinesChanged.bind(this), true, pause);
      } else if (this._isAwake) {
        // NOTE: we will *not* send in a resolution update if this is not the first time this component's Bing instance
        // is bound. Sending a resolution update (even if the resolution is the same as the current resolution) causes
        // the Bing instance to be re-bound. Therefore, sending a resolution update in response to a re-bind would
        // cause an infinite loop. This does mean that changes to resolution are still vulnerable to being lost around
        // the time of re-binds. However, there is nothing we can do about that until a sim-side change to how
        // resolution updates are handled is made.

        this.onEarthColorsChanged();
        this.sendEarthColorsElevationRange();
        this.onSkyColorChanged(this.skyColor.get());
        this.onReferenceChanged(this.reference.get());
        this.onWxrModeChanged(this.wxrMode.get());
        this.onWxrColorsChanged();
        this.onShowIsoLinesChanged(this.isoLines.get());
      }

      if (BitFlags.isAll(this.bingFlags, BingMapsFlags.FL_BINGMAP_3D)) {
        if (isInitialBinding && this.fov) {
          this.fovSub = this.fov.sub(this.sendFov.bind(this), true, pause);
        } else if (this._isAwake) {
          this.sendFov();
        }
      } else {
        // Only when not SVT, send in initial map params (even if we are asleep), because a bing instance that doesn't
        // have params initialized causes GPU perf issues.
        this.sendPositionRadius();
      }

      if (this._isAwake && this.cameraTransform !== undefined) {
        this.sendCameraTransform();
      }

      if (isInitialBinding && this.props.onBoundCallback) {
        this.props.onBoundCallback(this);
      }
    }
  }

  /**
   * A callback that is called when the image URL of a Bing instance changes.
   * @param uid The unique ID of the Bing instance.
   * @param url The new image URL.
   */
  private onMapUpdate(uid: number, url: string): void {
    if (this._isBound && this.uid === uid && this.imgRef.getOrDefault() !== null) {
      if (this.imgRef.instance.src !== url) {
        this.imgRef.instance.src = url;
      }
    }
  }

  /**
   * Calls the position and radius set function to set map parameters.
   */
  private setCurrentMapParams = (): void => {
    this.setPositionRadius(this.pos, this.radius);
  };

  /**
   * Gets Bing flags for this component's Bing mode and a Bing reference mode.
   * @param reference A Bing reference mode.
   * @returns Bing flags for this component's Bing mode and the specified Bing reference mode.
   */
  private getBingFlags(reference: EBingReference): number {
    let flags = 0;

    if (this.props.mode === EBingMode.HORIZON) {
      flags |= BingMapsFlags.FL_BINGMAP_3D;
    } else if (this.props.mode === EBingMode.TOPVIEW) {
      flags |= BingMapsFlags.FL_BINGMAP_3D | BingMapsFlags.FL_BINGMAP_3D_TOPVIEW;
    }

    if (reference === EBingReference.PLANE) {
      flags |= BingMapsFlags.FL_BINGMAP_REF_PLANE;
    } else if (reference === EBingReference.AERIAL) {
      flags |= BingMapsFlags.FL_BINGMAP_REF_AERIAL;
    }

    return flags;
  }

  /**
   * Responds to when the requested internal resolution of this component changes.
   * @param resolution The new requested internal resolution, as `[width, height]` in pixels.
   */
  private onResolutionChanged(resolution: ReadonlyFloat64Array): void {
    Coherent.call('SET_MAP_RESOLUTION', this.uid, resolution[0], resolution[1]);

    // The sim ignores position/radius updates within a certain number of frames of sending a resolution change, so we
    // will keep trying to send pending updates for a few frames after any resolution change.
    this.positionRadiusInhibitFramesRemaining = BingComponent.POSITION_RADIUS_INHIBIT_FRAMES;
    if (!this.positionRadiusInhibitTimer.isPending()) {
      this.positionRadiusInhibitTimer.schedule(this.processPendingPositionRadius, 0);
    }
  }

  /**
   * Responds to when the requested earth colors for this component change.
   */
  private onEarthColorsChanged(): void {
    this.sendEarthColors();
    this.sendEarthColorsElevationRange();
  }

  /**
   * Responds to when the requested sky color for this component changes.
   * @param color The new requested sky color.
   */
  private onSkyColorChanged(color: number): void {
    Coherent.call('SET_MAP_CLEAR_COLOR', this.uid, color);
  }

  /**
   * Responds to when the requested reference mode for this component changes.
   * @param reference The new requested reference mode.
   */
  private onReferenceChanged(reference: EBingReference): void {
    this.bingFlags = this.getBingFlags(reference);
    this.mapListener.trigger('JS_BIND_BINGMAP', this.props.id, this.bingFlags);
  }

  /**
   * Responds to when the requested weather mode for this component changes.
   * @param wxrMode The new requested weather mode.
   */
  private onWxrModeChanged(wxrMode: WxrMode): void {
    Coherent.call('SHOW_MAP_WEATHER', this.uid, wxrMode.mode, wxrMode.arcRadians);
  }

  /**
   * Responds to when the requested weather colors for this component change.
   */
  private onWxrColorsChanged(): void {
    const array = this.wxrColors.getArray();

    if (array.length === 0) {
      return;
    }

    this.wxrColorsArray.length = array.length;
    this.wxrRateArray.length = array.length;

    for (let i = 0; i < array.length; i++) {
      this.wxrColorsArray[i] = array[i][0];
      this.wxrRateArray[i] = array[i][1];
    }

    Coherent.call('SET_MAP_WEATHER_RADAR_COLORS', this.uid, this.wxrColorsArray, this.wxrRateArray);
  }

  /**
   * Responds to when whether to show isolines for this component changes.
   * @param showIsolines Whether to show isolines.
   */
  private onShowIsoLinesChanged(showIsolines: boolean): void {
    Coherent.call('SHOW_MAP_ISOLINES', this.uid, showIsolines);
  }

  /**
   * Wakes this Bing component. Upon awakening, this component will synchronize its state to the Bing instance to which
   * it is bound.
   */
  public wake(): void {
    this._isAwake = true;

    if (!this._isBound) {
      return;
    }

    this.setCurrentMapParams();

    if (this.cameraTransform !== undefined) {
      this.sendCameraTransform();
    }

    const is3D = BitFlags.isAll(this.bingFlags, BingMapsFlags.FL_BINGMAP_3D);

    // Only when not SVT, periodically send map params to Coherent in case another BingComponent binds to the same
    // bing instance and sends in the initial params set and overrides our params.
    if (!is3D) {
      this.setCurrentMapParamsTimer = setInterval(this.setCurrentMapParams, 200);
    }

    this.earthColorsSub?.resume(true);
    this.earthColorsElevationRangeSub?.resume(true);
    this.skyColorSub?.resume(true);
    this.referenceSub?.resume(true);
    this.wxrModeSub?.resume(true);
    this.wxrColorsSub?.resume(true);
    this.resolutionSub?.resume(true);
    this.isoLinesSub?.resume(true);

    if (is3D) {
      if (this.fovSub) {
        this.fovSub.resume(true);
      } else {
        this.sendFov();
      }
    }
  }

  /**
   * Puts this Bing component to sleep. While asleep, this component cannot make changes to the Bing instance to which
   * it is bound.
   */
  public sleep(): void {
    this._isAwake = false;

    if (!this._isBound) {
      return;
    }

    if (this.setCurrentMapParamsTimer !== null) {
      clearInterval(this.setCurrentMapParamsTimer);
    }

    this.earthColorsSub?.pause();
    this.earthColorsElevationRangeSub?.pause();
    this.skyColorSub?.pause();
    this.referenceSub?.pause();
    this.wxrModeSub?.pause();
    this.wxrColorsSub?.pause();
    this.resolutionSub?.pause();
    this.isoLinesSub?.pause();
  }

  /**
   * Sets the center position and radius of this Bing component.
   * @param pos The center position.
   * @param radius The radius, in meters.
   */
  public setPositionRadius(pos: LatLong, radius: number): void {
    this.pos = pos;
    this.radius = Math.max(radius, 10); // Not sure if bad things happen when radius is 0, so we just clamp it to 10 meters.

    if (this._isBound && this._isAwake) {
      if (this.positionRadiusInhibitFramesRemaining > 0) {
        this.isPositionRadiusPending = true;
      } else {
        this.sendPositionRadius();
      }
    }
  }

  /**
   * Sets this component's 3D map camera transform parameters. This method can only be used for components whose mode
   * is set to `EBingMode.HORIZON`.
   * @param pos The camera's nominal position. If null, then the nominal position will sync to the aircraft's position.
   * @param altitudeRef The altitude reference to use for the camera's nominal position. If null, then the default
   * reference ({@link SimAltitudeReference.Geoid}) is used. Ignored if `pos` is null.
   * @param offset The camera's offset from its nominal position, as `[x, y, z]` in meters in the camera's reference
   * frame after rotation is applied. The positive x axis points to the left. The positive y axis points upward. The
   * positive z axis points forward. If null, then no offset is applied.
   * @param rotation The camera's rotation, whose reference frame depends on the value of `rotationRef`. If null, then
   * the rotation will sync to the aircraft's attitude.
   * @param rotationRef The reference frame for the camera rotation. If null, then the default reference
   * ({@link BingCameraRotationReference.World}) is used. Ignored if `rotation` is null.
   * @throws Error if this component's mode is not `EBingMode.HORIZON`.
   */
  public set3DMapCameraTransform(
    pos: LatLongAlt | null,
    altitudeRef: SimAltitudeReference.Ellipsoid | SimAltitudeReference.Geoid | null,
    offset: ReadonlyFloat64Array | null,
    rotation: PitchBankHeading | null,
    rotationRef: BingCameraRotationReference | null,
  ): void {
    if (!BitFlags.isAll(this.bingFlags, BingMapsFlags.FL_BINGMAP_3D) || BitFlags.isAll(this.bingFlags, BingMapsFlags.FL_BINGMAP_3D_TOPVIEW)) {
      throw new Error(`BingComponent (ID ${this.props.id}): 3D camera transform can only be set on regular 3D maps (not top view).`);
    }

    this.cameraTransform = {
      __Type: 'JS_3DMapCameraTransform',
      lla: pos,
      altitudeRef: altitudeRef,
      offset: offset ? { __Type: 'Vec3', x: offset[0], y: offset[1], z: offset[2] } : null,
      pbh: rotation,
      pbhRef: rotationRef
    };

    if (this._isBound && this._isAwake) {
      this.sendCameraTransform();
    }
  }

  /**
   * Sends this component's earth colors to the sim.
   */
  private sendEarthColors(): void {
    const colors = this.earthColors.getArray();

    if (colors.length < 2) {
      return;
    }

    Coherent.call('SET_MAP_HEIGHT_COLORS', this.uid, colors);
  }

  /**
   * Sends this component's earth colors elevation range to the sim.
   */
  private sendEarthColorsElevationRange(): void {
    const colors = this.earthColors.getArray();

    if (colors.length < 2) {
      return;
    }

    // The way the map assigns colors to elevations is as follows:
    // ----------------------------------------------------------------------------------
    // - altitude range = MIN to MAX
    // - colors = array of length N >= 2 (colors[0] is the water color)
    // - STEP = (MAX - MIN) / N
    // - colors[i] is assigned to elevations from MIN + STEP * i to MIN + STEP * (i + 1)
    // - colors[1] is also assigned to all elevations < MIN + STEP
    // - colors[N - 1] is also assigned to all elevations > MIN + STEP * N
    // ----------------------------------------------------------------------------------

    const range = this.earthColorsElevationRange.get();
    const terrainColorCount = colors.length - 1;
    const desiredElevationStep = (range[1] - range[0]) / Math.max(terrainColorCount - 1, 1);

    const requiredMin = range[0] - desiredElevationStep;
    const requiredMax = range[1] + desiredElevationStep;

    Coherent.call('SET_MAP_ALTITUDE_RANGE', this.uid, requiredMin, requiredMax);
  }

  /**
   * Sends this component's center position and radius to the sim.
   */
  private sendPositionRadius(): void {
    const radiusExceedsLimit = this.radius > BingComponent.MAX_RADIUS;

    if (!this.hasRadiusExceededLimit && radiusExceedsLimit) {
      console.warn(`BingComponent (ID ${this.props.id}): attempting to set a radius that exceeds the maximum supported value of ${BingComponent.MAX_RADIUS} m`);
    }

    this.hasRadiusExceededLimit = radiusExceedsLimit;

    Coherent.call('SET_MAP_PARAMS', this.uid, this.pos, this.radius);
  }

  /**
   * Sends this component's camera transform to the sim.
   */
  private sendCameraTransform(): void {
    Coherent.call('SET_3D_MAP_CAMERA_TRANSFORM', this.uid, this.cameraTransform);
  }

  /**
   * Sends this component's field of view to the sim.
   */
  private sendFov(): void {
    const fov = this.fov ? this.fov.get() : BingComponent.DEFAULT_3D_FOV;
    Coherent.call('SET_3D_MAP_CAMERA_FOV', this.uid, fov);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <img ref={this.imgRef} src='' style='position: absolute; left: 0; top: 0; width: 100%; height: 100%;' class={this.props.class ?? ''} />
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.isDestroyed = true;
    this._isBound = false;

    if (this.setCurrentMapParamsTimer !== null) {
      clearInterval(this.setCurrentMapParamsTimer);
    }

    this.gameStateSub?.destroy();

    this.earthColorsSub?.destroy();
    this.earthColorsElevationRangeSub?.destroy();
    this.skyColorSub?.destroy();
    this.referenceSub?.destroy();
    this.wxrModeSub?.destroy();
    this.wxrColorsSub?.destroy();
    this.resolutionSub?.destroy();
    this.isoLinesSub?.destroy();
    this.fovSub?.destroy();

    this.mapListener?.off('MapBinded', this.mapBoundHandler);
    this.mapListener?.off('MapUpdated', this.mapUpdateHandler);
    if (!this.props.skipUnbindOnDestroy) {
      this.mapListener?.trigger('JS_UNBIND_BINGMAP', this.props.id);
    }
    this.isListenerRegistered = false;

    this.imgRef.instance.src = '';
    this.imgRef.instance.parentNode?.removeChild(this.imgRef.instance);

    super.destroy();
  }

  /**
   * Resets the img element's src attribute.
   */
  public resetImgSrc(): void {
    const imgRef = this.imgRef.getOrDefault();
    if (imgRef !== null) {
      const currentSrc = imgRef.src;
      imgRef.src = '';
      imgRef.src = currentSrc;
    }
  }

  /**
   * Converts an HTML hex color string to a numerical RGB value, as `R + G * 256 + B * 256^2`.
   * @param hexColor The hex color string to convert.
   * @returns The numerical RGB value equivalent of the specified hex color string, as `R + G * 256 + B * 256^2`.
   */
  public static hexaToRGBColor(hexColor: string): number {
    const hexStringColor = hexColor;
    let offset = 0;

    if (hexStringColor[0] === '#') {
      offset = 1;
    }

    const r = parseInt(hexStringColor.substr(0 + offset, 2), 16);
    const g = parseInt(hexStringColor.substr(2 + offset, 2), 16);
    const b = parseInt(hexStringColor.substr(4 + offset, 2), 16);

    return BingComponent.rgbColor(r, g, b);
  }

  /**
   * Converts a numerical RGB value to an HTML hex color string.
   * @param rgb The numerical RGB value to convert, as `R + G * 256 + B * 256^2`.
   * @param poundPrefix Whether to include the pound (`#`) prefix in the converted string. Defaults to `true`.
   * @returns The HTML hex color string equivalent of the specified numerical RGB value.
   */
  public static rgbToHexaColor(rgb: number, poundPrefix = true): string {
    const b = Math.floor((rgb % (256 * 256 * 256)) / (256 * 256));
    const g = Math.floor((rgb % (256 * 256)) / 256);
    const r = rgb % 256;

    return `${poundPrefix ? '#' : ''}${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Converts RGB color components to a numerical RGB value, as `R + G * 256 + B * 256^2`.
   * @param r The red component, from 0 to 255.
   * @param g The green component, from 0 to 255.
   * @param b The blue component, from 0 to 255.
   * @returns The numerical RGB value of the specified components, as `R + G * 256 + B * 256^2`.
   */
  public static rgbColor(r: number, g: number, b: number): number {
    return 256 * 256 * b + 256 * g + r;
  }

  /**
   * Converts an HTML hex color string to a numerical RGBA value, as `R + G * 256 + B * 256^2 + A * 256^3`.
   * @param hexColor The hex color string to convert.
   * @returns The numerical RGBA value equivalent of the specified hex color string, as
   * `R + G * 256 + B * 256^2 + A * 256^3`.
   */
  public static hexaToRGBAColor(hexColor: string): number {
    const hexStringColor = hexColor;
    let offset = 0;

    if (hexStringColor[0] === '#') {
      offset = 1;
    }

    const r = parseInt(hexStringColor.substr(0 + offset, 2), 16);
    const g = parseInt(hexStringColor.substr(2 + offset, 2), 16);
    const b = parseInt(hexStringColor.substr(4 + offset, 2), 16);
    const a = parseInt(hexStringColor.substr(6 + offset, 2), 16);

    return BingComponent.rgbaColor(r, g, b, a);
  }

  /**
   * Converts a numerical RGBA value to an HTML hex color string.
   * @param rgba The numerical RGBA value to convert, as `R + G * 256 + B * 256^2 + A * 256^3`.
   * @param poundPrefix Whether to include the pound (`#`) prefix in the converted string. Defaults to `true`.
   * @returns The HTML hex color string equivalent of the specified numerical RGBA value.
   */
  public static rgbaToHexaColor(rgba: number, poundPrefix = true): string {
    const a = Math.floor((rgba % (256 * 256 * 256 * 256)) / (256 * 256 * 256));
    const b = Math.floor((rgba % (256 * 256 * 256)) / (256 * 256));
    const g = Math.floor((rgba % (256 * 256)) / 256);
    const r = rgba % 256;

    return `${poundPrefix ? '#' : ''}${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a.toString(16).padStart(2, '0')}`;
  }

  /**
   * Converts RGBA color components to a numerical RGBA value, as `R + G * 256 + B * 256^2 + A * 256^3`.
   * @param r The red component, from 0 to 255.
   * @param g The green component, from 0 to 255.
   * @param b The blue component, from 0 to 255.
   * @param a The alpha component, from 0 to 255.
   * @returns The numerical RGBA value of the specified components, as `R + G * 256 + B * 256^2 + A * 256^3`.
   */
  public static rgbaColor(r: number, g: number, b: number, a: number): number {
    return 256 * 256 * 256 * a + 256 * 256 * b + 256 * g + r;
  }

  /**
   * Creates a full Bing component earth colors array. The earth colors array will contain the specified water color
   * and terrain colors (including interpolated values between the explicitly defined ones, as necessary).
   * @param waterColor The desired water color, as a hex string with the format `#hhhhhh`.
   * @param terrainColors An array of desired terrain colors at specific elevations. Elevations should be specified in
   * feet and colors as hex strings with the format `#hhhhhh`.
   * @param minElevation The minimum elevation to which to assign a color, in feet. Defaults to 0.
   * @param maxElevation The maximum elevation to which to assign a color, in feet. Defaults to 30000.
   * @param stepCount The number of terrain color steps. Defaults to 61.
   * @returns a full Bing component earth colors array.
   */
  // eslint-disable-next-line jsdoc/require-jsdoc
  public static createEarthColorsArray(waterColor: string, terrainColors: { elev: number, color: string }[], minElevation = 0, maxElevation = 30000, stepCount = 61): number[] {
    const earthColors = [BingComponent.hexaToRGBColor(waterColor)];

    const curve = new Avionics.Curve<string>();
    curve.interpolationFunction = Avionics.CurveTool.StringColorRGBInterpolation;
    for (let i = 0; i < terrainColors.length; i++) {
      curve.add(terrainColors[i].elev, terrainColors[i].color);
    }

    const elevationStep = (maxElevation - minElevation) / Math.max(stepCount - 1, 1);

    for (let i = 0; i < stepCount; i++) {
      const color = curve.evaluate(minElevation + i * elevationStep);
      earthColors[i + 1] = BingComponent.hexaToRGBColor(color);
    }

    return earthColors;
  }
}

/**
 * A rotation reference to use for Bing 3D camera transformations.
 */
// NOTE: These values must match those defined on the sim-side.
export enum BingCameraRotationReference {
  /**
   * The camera's rotation is world-referenced, meaning that with zero rotation, the camera is pointed towards true
   * north with zero pitch or roll.
   */
  World = 0,

  /**
   * The camera's rotation is aircraft-referenced, meaning that with zero rotation, the camera's rotation is equal to
   * the aircraft's attitude.
   */
  Aircraft,
}

/**
 * A Bing 3D camera transformation which defines the camera's position and orientation.
 */
interface BingCameraTransform {
  /** Coherent C++ object binding type. */
  __Type: 'JS_3DMapCameraTransform';

  /** The camera's LLA position. If null, the camera's position is the aircraft's current position. */
  lla: LatLongAlt | null;

  /**
   * The altitude reference to use for the specified LLA. If null, `AltitudeReference.Geoid` is assumed. Doesn't have any effect
   * if `pos` is null.
   */
  altitudeRef: SimAltitudeReference | null;

  /**
   * The camera's offset from the specified LLA, in meters. The offset is in the camera's reference frame and is applied after the
   * specified rotation. If null, no offset is applied.
   */
  offset: Vec3Interface | null;

  /**
   * The camera's PBH rotation, whose reference frame depends on the value of `pbhRef`. If null, no rotation is applied.
   * If the rotation is world-referenced, no rotation means that the camera is pointed towards the north with no pitch or roll.
   * If the rotation is aircraft-referenced, no rotation means that the camera's rotation is equal to the aircraft's attitude.
   */
  pbh: PitchBankHeading | null;

  /** The reference frame for the specified PBH. If null, `RotationReference.World` is assumed. Doesn't have any effect if `pbh` is null. */
  pbhRef: BingCameraRotationReference | null;
}

/**
 * A 3D vector with x, y, and z components.
 */
interface Vec3Interface {
  /** Coherent C++ object binding type. */
  __Type: 'Vec3';

  /** The x component value. */
  x: number;

  /** The y component value. */
  y: number;

  /** The z component value. */
  z: number;
}

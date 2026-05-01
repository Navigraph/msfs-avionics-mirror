import {
  EventBus, GeoPoint, GeoPointSubject, MagVar, MapFlightPlanModule, MapLayerProps, MapOwnAirplanePropsModule, MapSystemKeys, NavComEvents, NavMath,
  NavRadioIndex, Subscription
} from '@microsoft/msfs-sdk';

import { ActiveNavSourceEvents } from '../../Navigation/ActiveNavSourceManager';
import { IfdNavMode } from '../../Navigation/Sources/IfdNavSources';
import { BaseRadialLayer } from './BaseRadialLayer';

/**
 * Modules required by the layer.
 */
interface RequiredModules {
  /** The flight plan module. */
  [MapSystemKeys.FlightPlan]: MapFlightPlanModule;
  /** The own airplane props module. */
  [MapSystemKeys.OwnAirplaneProps]: MapOwnAirplanePropsModule;
}

/**
 * Props on the VlocLayer component.
 */
interface VlocRadialLayerProps extends MapLayerProps<RequiredModules> {
  /** An instance of the event bus */
  readonly bus: EventBus;

  /** The VLOC radio index, or undefined if VLOC is disabled. */
  readonly vlocIndex: NavRadioIndex | undefined;
}

/**
 * A layer that displays the VLOC radials.
 */
export class VlocRadialLayer extends BaseRadialLayer<VlocRadialLayerProps> {
  private readonly ownAirplaneProps = this.props.model.getModule(MapSystemKeys.OwnAirplaneProps);

  private readonly vorPos = GeoPointSubject.create(new GeoPoint(NaN, NaN));

  private vlocActiveSub?: Subscription;
  private vlocCourseSub?: Subscription;
  private vlocSignalSub?: Subscription;
  private vlocHasNavSub?: Subscription;
  private vlocHasLocalizerSub?: Subscription;
  private vlocMagVarSub?: Subscription;
  private vlocLlaSub?: Subscription;
  private vlocPosSub?: Subscription;

  private isVlocActive = false;
  private magneticCourse = 0;
  private hasNav = false;
  private hasLocalizer = false;
  private magVar = 0;
  private hasSignal = false;
  private isInbound = false;

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();

    if (this.props.vlocIndex !== undefined) {
      const sub = this.props.bus.getSubscriber<ActiveNavSourceEvents & NavComEvents>();

      this.vlocCourseSub = sub.on(`nav_obs_${this.props.vlocIndex}`).whenChanged().handle((v) => {
        this.magneticCourse = v;
        this.needsRender = true;
      }, true);

      this.vlocSignalSub = sub.on(`nav_signal_${this.props.vlocIndex}`).whenChanged().handle((v) => {
        this.hasSignal = v > 0;
        this.needsRender = true;
      }, true);

      this.vlocHasNavSub = sub.on(`nav_has_nav_${this.props.vlocIndex}`).whenChanged().handle((v) => {
        this.hasNav = v;
        this.needsRender = true;
      }, true);

      this.vlocHasLocalizerSub = sub.on(`nav_localizer_${this.props.vlocIndex}`).whenChanged().handle((v) => {
        this.hasLocalizer = v;
        this.needsRender = true;
      }, true);

      this.vlocMagVarSub = sub.on(`nav_magvar_${this.props.vlocIndex}`).whenChanged().handle((v) => {
        this.magVar = -v;
        this.needsRender = true;
      }, true);

      this.vlocLlaSub = sub.on(`nav_lla_${this.props.vlocIndex}`).handle((v) => {
        this.vorPos.set(v.lat, v.long);
      }, true);

      this.vlocPosSub = this.vorPos.sub(() => this.needsRender = true);

      this.vlocActiveSub = sub.on('pending_or_active_mode').whenChanged().handle((v) => {
        this.isVlocActive = v === IfdNavMode.VLOC;

        if (this.isVlocActive) {
          this.vlocCourseSub!.resume(true);
          this.vlocSignalSub!.resume(true);
          this.vlocHasNavSub!.resume(true);
          this.vlocHasLocalizerSub!.resume(true);
          this.vlocMagVarSub!.resume(true);
          this.vlocLlaSub!.resume(true);
        } else {
          this.vlocCourseSub!.pause();
          this.vlocSignalSub!.pause();
          this.vlocHasNavSub!.pause();
          this.vlocHasLocalizerSub!.pause();
          this.vlocMagVarSub!.pause();
          this.vlocLlaSub!.pause();
        }

        this.needsRender = true;
      });
    }
  }

  /** @inheritdoc */
  public onUpdated(time: number, elapsed: number): void {
    super.onUpdated(time, elapsed);

    if (this.props.vlocIndex !== undefined) {
      this.updateFromTo();
      this.drawPath();
    }
  }

  /** Updates the OBS from/to status. */
  private updateFromTo(): void {
    if (!this.shouldDrawRadial()) {
      return;
    }
    const ppos = this.ownAirplaneProps.position.get();

    if (!ppos.isValid()) {
      return;
    }

    const courseToFix = ppos.bearingTo(this.vorPos.get());
    const obsCourseTrue = MagVar.magneticToTrue(this.magneticCourse, this.magVar);

    const isInbound = isFinite(courseToFix) && Math.abs(NavMath.diffAngle(courseToFix, obsCourseTrue)) < 90;
    if (isInbound !== this.isInbound) {
      this.isInbound = isInbound;
      this.needsRender = true;
    }
  }

  /**
   * Checks if we should draw the radials.
   * @returns true if VLOC is active and we're receiving a valid VOR.
   */
  private shouldDrawRadial(): boolean {
    return this.isVlocActive && this.hasNav && !this.hasLocalizer && this.hasSignal && this.vorPos.get().isValid();
  }

  /**
   * Draws the OBS path.
   */
  private drawPath(): void {
    const context = super.tryBeginDraw();

    if (context) {
      this.needsRender = false;

      if (!this.shouldDrawRadial()) {
        return;
      }

      const courseTrue = MagVar.magneticToTrue(this.magneticCourse, this.magVar);

      super.drawRadials(context, this.vorPos.get(), courseTrue, this.isInbound ? 'lime' : 'white', this.isInbound ? 'white' : 'lime');
    }
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.vlocActiveSub?.destroy();
    this.vlocCourseSub?.destroy();
    this.vlocSignalSub?.destroy();
    this.vlocHasNavSub?.destroy();
    this.vlocHasLocalizerSub?.destroy();
    this.vlocMagVarSub?.destroy();
    this.vlocLlaSub?.destroy();
    this.vlocPosSub?.destroy();
  }
}

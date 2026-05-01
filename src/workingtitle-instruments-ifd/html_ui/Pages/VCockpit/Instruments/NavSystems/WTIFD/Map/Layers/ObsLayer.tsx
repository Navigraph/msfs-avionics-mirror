import {
  EventBus, GeoPoint, MagVar, MapFlightPlanModule, MapLayerProps, MapOwnAirplanePropsModule, MapSystemKeys, NavEvents, NavMath, Subscription
} from '@microsoft/msfs-sdk';

import { Fms } from '../../Fms';
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
 * Props on the ObsLayer component.
 */
interface ObsLayerProps extends MapLayerProps<RequiredModules> {
  /** An instance of the event bus */
  readonly bus: EventBus;

  /** The FMS instance. */
  readonly fms: Fms;
}

/**
 * A layer that displays the OBS path.
 */
export class ObsLayer extends BaseRadialLayer<ObsLayerProps> {
  private static readonly obsGeoPointCache = [new GeoPoint(0, 0)];

  private readonly ownAirplaneProps = this.props.model.getModule(MapSystemKeys.OwnAirplaneProps);

  private obsActiveSub?: Subscription;
  private obsCourseSub?: Subscription;
  private activePlanSub?: Subscription;
  private fplCalculateSub?: Subscription;

  private isObsActive = false;
  private obsCourse = 0;
  private isObsTo = false;

  private activePlanIndex = 0;

  /** @inheritdoc */
  public onAttached(): void {
    super.onAttached();

    const sub = this.props.bus.getSubscriber<NavEvents>();

    this.obsActiveSub = sub.on('gps_obs_active').whenChanged().handle(v => {
      this.isObsActive = v;
      this.needsRender = true;
    });

    this.obsCourseSub = sub.on('gps_obs_value').whenChanged().handle(v => {
      this.obsCourse = v;
      this.needsRender = true;
    });

    this.activePlanSub = this.props.fms.flightPlanner.onEvent('fplIndexChanged').handle(v => {
      this.activePlanIndex = v.planIndex;
      this.needsRender = true;
    });

    this.fplCalculateSub = this.props.fms.flightPlanner.onEvent('fplCalculated').handle((ev) => {
      ev.planIndex === this.activePlanIndex && (this.needsRender = true);
    });
  }

  /** @inheritdoc */
  public onUpdated(time: number, elapsed: number): void {
    super.onUpdated(time, elapsed);

    this.updateFromTo();
    this.drawPath();
  }

  /** Updates the OBS from/to status. */
  private updateFromTo(): void {
    if (!this.isObsActive) {
      this.isObsTo = false;
      return;
    }

    const planSubs = this.props.model.getModule(MapSystemKeys.FlightPlan).getPlanSubjects(this.activePlanIndex);
    const leg = planSubs.flightPlan.get()?.tryGetLeg(planSubs.activeLeg.get());

    const ppos = this.ownAirplaneProps.position.get();

    if (!this.isObsActive || !ppos.isValid() || leg === undefined || leg?.calculated?.endLat === undefined || leg?.calculated?.endLon === undefined) {
      return;
    }

    const courseToFix = ppos.bearingTo(leg.calculated.endLat, leg.calculated.endLon);
    const obsCourseTrue = MagVar.magneticToTrue(this.obsCourse, leg.calculated.courseMagVar);

    const isObsTo = isFinite(courseToFix) && Math.abs(NavMath.diffAngle(courseToFix, obsCourseTrue)) < 90;
    if (isObsTo !== this.isObsTo) {
      this.isObsTo = isObsTo;
      this.needsRender = true;
    }
  }

  /**
   * Draws the OBS path.
   */
  private drawPath(): void {
    const context = super.tryBeginDraw();

    if (context) {
      const planSubs = this.props.model.getModule(MapSystemKeys.FlightPlan).getPlanSubjects(this.activePlanIndex);
      const leg = planSubs.flightPlan.get()?.tryGetLeg(planSubs.activeLeg.get());
      this.needsRender = false;

      if (!this.isObsActive || leg === undefined || leg?.calculated?.endLat === undefined || leg?.calculated?.endLon === undefined) {
        return;
      }

      const obsFix = ObsLayer.obsGeoPointCache[0].set(leg.calculated.endLat, leg.calculated.endLon);
      const obsCourseTrue = MagVar.magneticToTrue(this.obsCourse, leg.calculated.courseMagVar);

      super.drawRadials(context, obsFix, obsCourseTrue, 'magenta', this.isObsTo ? 'white' : undefined);
    }
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.obsActiveSub?.destroy();
    this.obsCourseSub?.destroy();
    this.activePlanSub?.destroy();
    this.fplCalculateSub?.destroy();
  }
}

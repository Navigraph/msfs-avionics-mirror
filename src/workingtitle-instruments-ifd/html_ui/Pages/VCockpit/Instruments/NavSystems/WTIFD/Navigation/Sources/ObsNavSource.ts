/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { EventBus, FlightPlanner, LNavEvents, LNavUtils, NavMath, NavSourceType, Subject } from '@microsoft/msfs-sdk';

import { Fms } from '../../Fms';
import { LNavDataEvents } from '../LNavDataEvents';
import { NavSourceBase } from './NavSourceBase';

/** Represents a OBS source, subscribes to the custom FMS LVars. */
export class ObsSource<T extends readonly string[]> extends NavSourceBase<T> {
  private readonly lnavIsTracking = Subject.create(false);
  private readonly lnavBrgMag = Subject.create(0);
  private readonly lnavDis = Subject.create(0);
  private readonly lnavDtkMag = Subject.create(0);
  private readonly lnavXtk = Subject.create(0);

  /** @inheritdoc */
  public constructor(
    bus: EventBus,
    name: T[number],
    index: number,
    private readonly flightPlanner: FlightPlanner,
    private readonly fms: Fms,
    lnavIndex: number,
  ) {
    super(bus, name, index);

    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(lnavIndex);

    const lnav = this.bus.getSubscriber<LNavEvents & LNavDataEvents>();
    lnav.on(`lnav_is_tracking${lnavSuffix}`).whenChanged().handle(this.lnavIsTracking.set.bind(this.lnavIsTracking));
    lnav.on(`lnavdata_waypoint_bearing_mag${lnavSuffix}`).whenChanged().handle(this.lnavBrgMag.set.bind(this.lnavBrgMag));
    lnav.on(`lnavdata_waypoint_distance${lnavSuffix}`).whenChanged().handle(this.lnavDis.set.bind(this.lnavDis));
    lnav.on(`lnavdata_dtk_mag${lnavSuffix}`).whenChanged().handle(this.lnavDtkMag.set.bind(this.lnavDtkMag));
    lnav.on(`lnavdata_xtk${lnavSuffix}`).whenChanged().handle(this.lnavXtk.set.bind(this.lnavXtk));
    lnav.on(`lnavdata_cdi_scale${lnavSuffix}`).whenChanged().handle(this.setters.get('lateralDeviationScaling')!.setter);
    lnav.on(`lnavdata_cdi_scale_label${lnavSuffix}`).whenChanged().handle(this.setters.get('lateralDeviationScalingLabel')!.setter);
    lnav.on(`lnav_tracked_leg_index${lnavSuffix}`).whenChanged().handle(this.handleTrackedLegIndex);

    this.lnavIsTracking.sub(this.updateBearing);
    this.lnavBrgMag.sub(this.updateBearing);

    this.lnavIsTracking.sub(this.updateDistance);
    this.lnavDis.sub(this.updateDistance);

    this.lnavIsTracking.sub(this.updateCourse);
    this.lnavDtkMag.sub(this.updateCourse);

    this.lnavIsTracking.sub(this.updateLateralDeviation);
    this.lnavXtk.sub(this.updateLateralDeviation);
    this.lateralDeviationScaling.sub(this.updateLateralDeviation);
    this.fms.isPlanActivated.sub(() => {
      this.updateLateralDeviation();
    });
  }

  /** @inheritdoc */
  public getType(): NavSourceType {
    return NavSourceType.Gps;
  }

  private readonly updateBearing = (): void => {
    if (!this.lnavIsTracking.get()) {
      this.bearing.set(null);
    } else {
      this.bearing.set(this.lnavBrgMag.get());
    }
  };

  private readonly updateDistance = (): void => {
    if (!this.lnavIsTracking.get()) {
      this.distance.set(null);
    } else {
      this.distance.set(this.lnavDis.get());
    }
  };

  private readonly updateCourse = (): void => {
    if (!this.lnavIsTracking.get()) {
      this.course.set(null);
    } else {
      this.course.set(this.lnavDtkMag.get());
    }
  };

  private readonly updateLateralDeviation = (): void => {
    const scaling = this.lateralDeviationScaling.get();
    if (!this.lnavIsTracking.get() || scaling === null || !this.fms.isPlanActivated.get()) {
      this.lateralDeviation.set(null);
    } else {
      const xtk = this.lnavXtk.get();
      const newDeviation = NavMath.clamp(xtk / scaling, -1, 1);
      this.lateralDeviation.set(-newDeviation);
    }
  };

  private readonly handleTrackedLegIndex = (effectiveLegIndex: number): void => {
    if (this.flightPlanner.hasFlightPlan(0) && effectiveLegIndex >= 0) {
      const plan = this.flightPlanner.getFlightPlan(0);
      const leg = plan.tryGetLeg(effectiveLegIndex);
      this.ident.set(leg?.name || null);
    } else {
      this.ident.set(null);
    }
  };
}

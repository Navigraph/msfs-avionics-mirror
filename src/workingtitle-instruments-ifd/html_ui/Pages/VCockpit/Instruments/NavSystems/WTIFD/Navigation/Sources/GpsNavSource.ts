/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  ApproachGuidanceMode, EventBus, FlightPlanner, LNavEvents, LNavUtils, NavMath, NavSourceType, Subject, VNavEvents, VNavState,
  VNavUtils
} from '@microsoft/msfs-sdk';

import { Fms } from '../../Fms';
import { LNavDataEvents } from '../LNavDataEvents';
import { NavSourceBase } from './NavSourceBase';
import { IfdVerticalDeviationScale } from '../Vnav/IfdVnavTypes';

/** Represents a GPS/FMS source, subscribes to the custom FMS LVars. */
export class GpsSource<T extends readonly string[]> extends NavSourceBase<T> {
  private readonly lnavIsTracking = Subject.create(false);
  private readonly lnavBrgMag = Subject.create(0);
  private readonly lnavDis = Subject.create(0);
  private readonly lnavDtkMag = Subject.create(0);
  private readonly lnavXtk = Subject.create(0);
  private readonly vnavVDev = Subject.create(0);
  private readonly vnavLpvVDev = Subject.create(0);
  private readonly vnavState = Subject.create(VNavState.Disabled);
  private readonly vnavApproachMode = Subject.create(ApproachGuidanceMode.None);
  private readonly vnavPathAvailable = Subject.create(false);

  /** @inheritdoc */
  public constructor(
    bus: EventBus,
    name: T[number],
    index: number,
    private readonly flightPlanner: FlightPlanner,
    private readonly fms: Fms,
    lnavIndex: number,
    vnavIndex: number,
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
      this.updateVerticalDeviation();
    });

    const vnavSuffix = VNavUtils.getEventBusTopicSuffix(vnavIndex);

    const vnav = this.bus.getSubscriber<VNavEvents>();
    vnav.on(`vnav_vertical_deviation${vnavSuffix}`).whenChangedBy(1).handle(this.vnavVDev.set.bind(this.vnavVDev));
    vnav.on(`gp_vertical_deviation${vnavSuffix}`).whenChangedBy(1).handle(this.vnavLpvVDev.set.bind(this.vnavLpvVDev));
    vnav.on(`vnav_state${vnavSuffix}`).whenChanged().handle(this.vnavState.set.bind(this.vnavState));
    vnav.on('gp_approach_mode').whenChanged().handle(this.vnavApproachMode.set.bind(this.vnavApproachMode));
    vnav.on(`vnav_path_available${vnavSuffix}`).whenChanged().handle(this.vnavPathAvailable.set.bind(this.vnavPathAvailable));

    this.vnavVDev.sub(this.updateVerticalDeviation);
    this.vnavLpvVDev.sub(this.updateVerticalDeviation);
    this.vnavState.sub(this.updateVerticalDeviation);
    this.vnavApproachMode.sub(this.updateVerticalDeviation);
    this.vnavPathAvailable.sub(this.updateVerticalDeviation);
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

  private readonly updateVerticalDeviation = (): void => {
    if (!this.fms.isPlanActivated.get()) {
      this.verticalDeviation.set(null);
      return;
    }

    const lpvVDev = this.vnavLpvVDev.get();
    const gpAvailable = lpvVDev >= -1000 && lpvVDev <= 1000;
    const isVNavModeDisabled = this.vnavState.get() <= VNavState.Enabled_Inactive;
    const showVnavVdev = this.vnavPathAvailable.get() && !isVNavModeDisabled;
    let vdev = showVnavVdev ? this.vnavVDev.get() : null;
    const isGpActiveApproachMode = this.vnavApproachMode.get() === ApproachGuidanceMode.GPActive;
    if (isGpActiveApproachMode || (isVNavModeDisabled && gpAvailable)) {
      vdev = lpvVDev;
    }
    if (vdev === null) {
      this.verticalDeviation.set(null);
      return;
    }
    const newDeviation = NavMath.clamp(vdev / -IfdVerticalDeviationScale, -1, 1);
    this.verticalDeviation.set(newDeviation);
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

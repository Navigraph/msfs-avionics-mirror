import {
  ConsumerSubject, EventBus, FlightPlanner, FlightPlannerEvents, MapLayerProps, MapSyncedCanvasLayer, MapSystemWaypointsRenderer, VNavEvents, VNavPathMode,
  VNavWaypoint
} from '@microsoft/msfs-sdk';

import { FlightPlanIndex } from '../../Fms';
import { MapTodIconFactory, MapTodLabelFactory } from '../MapTod';

/** The props for the MapTodLayer component. */
export interface MapTodLayerProps extends MapLayerProps<any> {
  /** The event bus. */
  bus: EventBus;
  /** The flight planner. */
  planner: FlightPlanner;
  /** The waypoint renderer to use. */
  waypointRenderer: MapSystemWaypointsRenderer;
}

/** The map layer for displaying the ToD */
export class MapTodLayer extends MapSyncedCanvasLayer<MapTodLayerProps> {
  protected todWaypoint: VNavWaypoint | undefined;
  protected readonly TodWaypointRole = 'TodRole';

  protected readonly vnavPathMode = ConsumerSubject.create(this.props.bus.getSubscriber<VNavEvents>().on('vnav_path_mode').whenChanged(), VNavPathMode.None);
  protected readonly vnavTodLegIndex = ConsumerSubject.create(this.props.bus.getSubscriber<VNavEvents>().on('vnav_tod_global_leg_index').whenChanged(), -1);
  protected readonly vnavTodLegDistance = ConsumerSubject.create(this.props.bus.getSubscriber<VNavEvents>().on('vnav_tod_leg_distance').whenChanged(), -1);
  protected readonly vnavDistanceToTod = ConsumerSubject.create(this.props.bus.getSubscriber<VNavEvents>().on('vnav_tod_distance').whenChanged(), -1);

  /** @inheritdoc */
  onAttached(): void {
    super.onAttached();

    // ToD
    this.props.waypointRenderer.addRenderRole(this.TodWaypointRole);

    this.props.waypointRenderer.setCanvasContext(this.props.waypointRenderer.getRoleFromName(this.TodWaypointRole) ?? 0, this.display.context);
    this.props.waypointRenderer.setIconFactory(this.props.waypointRenderer.getRoleFromName(this.TodWaypointRole) ?? 0, new MapTodIconFactory());
    this.props.waypointRenderer.setLabelFactory(this.props.waypointRenderer.getRoleFromName(this.TodWaypointRole) ?? 0, new MapTodLabelFactory());

    this.vnavPathMode.sub(() => { this.updateTodWaypoint(); });
    this.vnavTodLegIndex.sub(() => { this.updateTodWaypoint(); });
    this.vnavTodLegDistance.sub(() => { this.updateTodWaypoint(); });
    this.vnavDistanceToTod.sub(() => { this.updateTodWaypoint(); });

    // We also update every `fplCalculated` so that we refresh with valid leg calculations
    this.updateTodWaypoint();
    this.props.bus.getSubscriber<FlightPlannerEvents>().on('fplCalculated').handle(() => {
      this.updateTodWaypoint();
    });
  }

  /**
   * Updates the TOD waypoint.
   */
  updateTodWaypoint(): void {
    this.todWaypoint && this.props.waypointRenderer.deregister(this.todWaypoint, this.props.waypointRenderer.getRoleFromName(this.TodWaypointRole) ?? 0, 'tod-layer-tod');
    this.todWaypoint = undefined;

    if (this.props.planner.hasActiveFlightPlan()) {
      const plan = this.props.planner.getFlightPlan(FlightPlanIndex.Active);

      if (plan.segmentCount > 1 && this.vnavTodLegIndex.get() >= 0
        && this.vnavPathMode.get() !== VNavPathMode.PathActive
      ) {
        try {
          const leg = plan.getLeg(this.vnavTodLegIndex.get());
          this.todWaypoint = new VNavWaypoint(leg, this.vnavTodLegDistance.get(), 'vnav-tod', 'TOD');
          this.props.waypointRenderer.register(this.todWaypoint, this.props.waypointRenderer.getRoleFromName(this.TodWaypointRole) ?? 0, 'tod-layer-tod');
        } catch (error) {
          console.warn(`Invalid tod leg at: ${this.vnavTodLegIndex.get()}`);
        }
      }
    }
  }
}

import { FlightPlanner, MapSystemComponent, MapSystemContext, MapSystemController, Subscription } from '@microsoft/msfs-sdk';

import { MapKeys } from '../MapKeys';
import { MapFlightPlanFocusModule } from '../Modules/MapFlightPlanFocusModule';
import { FlightPlanIndex } from '../../Fms';

/**
 * Modules required for MapDragPanController.
 */
export interface MapFlightPlanFocusControllerModules {
  /** Flight Plan Focus Module **/
  [MapKeys.FlightPlanFocusModule]: MapFlightPlanFocusModule;
}

/** Controls the flight plan auto-focus */
export class MapFlightPlanFocusController extends MapSystemController<MapFlightPlanFocusControllerModules> {
  private readonly flightPlanFocusModule = this.context.model.getModule(MapKeys.FlightPlanFocusModule);

  private readonly subscriptions: Subscription[] = [];

  /**
   * Constructor
   * @param context The map system context to use with this controller.
   * @param flightPlanner The flight planner to use with this controller.
   */
  constructor(
    context: MapSystemContext<MapFlightPlanFocusControllerModules>,
    private readonly flightPlanner: FlightPlanner
  ) {
    super(context);
  }

  /** @inheritdoc */
  public onAfterMapRender(ref: MapSystemComponent): void {
    super.onAfterMapRender(ref);

    this.subscriptions.push(this.flightPlanner.onEvent('fplDeleted').handle((e) => {
      if (e.planIndex === FlightPlanIndex.ProcedurePreview) {
        this.disableFlightPlanFocus();
      }
    }));
    this.subscriptions.push(this.flightPlanner.onEvent('fplCalculated').handle((e) => {
      if (e.planIndex === FlightPlanIndex.ProcedurePreview) {
        this.updateFlightPlanFocus();
      }
    }));

    this.flightPlanFocusModule.flightPlanner.set(this.flightPlanner);

  }

  /**
   * Disables the flight plan focus when the procedure flight plan is deleted
   */
  private disableFlightPlanFocus(): void {
    this.flightPlanFocusModule.isActive.set(false);
    this.flightPlanFocusModule.planHasFocus.set(false);
    this.flightPlanFocusModule.focus.set(null);
  }

  /**
   * Updates the flight plan focus when the procedure preview changes.
   */
  private updateFlightPlanFocus(): void {
    const legs = Array.from(this.flightPlanner.getFlightPlan(FlightPlanIndex.ProcedurePreview)?.legs() ?? []);
    if (legs.length > 0) {
      this.flightPlanFocusModule.isActive.set(true);
      this.flightPlanFocusModule.planHasFocus.set(true);
      this.flightPlanFocusModule.focus.set(legs);
    }
  }

  /** @inheritdoc */
  public onMapDestroyed(): void {
    this.subscriptions.forEach(sub => sub.destroy());
  }
}

import { CompiledMapSystem, EventBus, FacilityWaypointUtils, ICAO, IcaoValue, StatefulBasicLifecycle, Subject, UserSetting, UserSettingManager, Waypoint } from '@microsoft/msfs-sdk';

import { GarminMapKeys, MapPointerModule, MapWaypointHoverModule } from '@microsoft/msfs-garminsdk';

import { DisplayPaneIndex } from './DisplayPaneTypes';
import { DisplayPaneSettings } from '../../Settings/DisplayPanesUserSettings';
import { DisplayPaneViewDataEvents } from './DisplayPaneViewDataEvents';


/**
 * A publisher of common display pane view map data. Publishes the pointer active state and the hovered waypoint ICAO
 * for a map.
 */
export class DisplayPaneViewMapDataPublisher {
  private readonly lifecycle = new StatefulBasicLifecycle(true);

  private readonly mapPointerActiveSetting: UserSetting<boolean>;

  /**
   * Creates a new instance of DisplayPaneViewMapDataPublisher.
   * @param displayPaneIndex The index of this publisher's parent display pane.
   * @param bus The event bus.
   * @param displayPaneUserSettingManager A manager of user settings for the publisher's parent display pane.
   * @param compiledMap The compiled map from which to source data.
   */
  public constructor(
    private readonly displayPaneIndex: DisplayPaneIndex,
    private readonly bus: EventBus,
    displayPaneUserSettingManager: UserSettingManager<DisplayPaneSettings>,
    compiledMap: CompiledMapSystem<{
      /** The pointer module. */
      [GarminMapKeys.Pointer]?: MapPointerModule;

      /** The waypoint hover module. */
      [GarminMapKeys.WaypointHover]?: MapWaypointHoverModule;
    }, any, any, any>
  ) {
    this.mapPointerActiveSetting = displayPaneUserSettingManager.getSetting('displayPaneMapPointerActive');

    const mapPointerModule = compiledMap.context.model.getModule(GarminMapKeys.Pointer);
    (mapPointerModule?.isActive ?? Subject.create(false)).pipe(this.mapPointerActiveSetting, true).withLifecycle(this.lifecycle);

    const mapWaypointHoverModule = compiledMap.context.model.getModule(GarminMapKeys.WaypointHover);
    (mapWaypointHoverModule?.waypoint ?? Subject.create(null)).sub(this.onHoveredWaypointChanged.bind(this), false, true).withLifecycle(this.lifecycle);
  }

  /**
   * Responds to when this publisher's parent display pane view is resumed.
   */
  public onResume(): void {
    this.lifecycle.resume();
  }

  /**
   * Responds to when this publisher's parent display pane view is paused.
   */
  public onPause(): void {
    this.lifecycle.pause();
    this.mapPointerActiveSetting.set(false);
    this.publishHoveredWaypointIcao(ICAO.emptyValue());
  }

  /**
   * Responds to when the hovered map waypoint changes.
   * @param waypoint The new hovered waypoint.
   */
  private onHoveredWaypointChanged(waypoint: Waypoint | null): void {
    if (waypoint && FacilityWaypointUtils.isFacilityWaypoint(waypoint)) {
      this.publishHoveredWaypointIcao(waypoint.facility.get().icaoStruct);
    } else {
      this.publishHoveredWaypointIcao(ICAO.emptyValue());
    }
  }

  /**
   * Publishes a hovered map waypoint ICAO to the event bus.
   * @param icao The ICAO to publish.
   */
  private publishHoveredWaypointIcao(icao: IcaoValue): void {
    this.bus.getPublisher<DisplayPaneViewDataEvents>().pub(`display_pane_comm_map_hovered_waypoint_icao_${this.displayPaneIndex}`, icao, true, true);
  }

  /**
   * Destroys this publisher.
   */
  public destroy(): void {
    this.lifecycle.destroy();
  }
}

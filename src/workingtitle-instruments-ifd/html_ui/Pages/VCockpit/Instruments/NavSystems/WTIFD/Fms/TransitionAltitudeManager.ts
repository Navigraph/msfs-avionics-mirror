import { EventBus, MappedSubject, UnitType } from '@microsoft/msfs-sdk';
import { FlightPlanStore } from '../FlightPlan';
import { FmsUserSettings } from '../Settings/FmsUserSettings';

/**
 * A manager for the automatic transition altitude and level setting.
 */
export class TransitionAltitudeManager {
  private readonly fmsSettingManager = FmsUserSettings.getManager(this.bus);

  private readonly transitionAltitude = MappedSubject.create(
    ([manual, autoFacility]) => manual > 0 ? manual :
      (autoFacility && autoFacility.transitionAlt > 0 ? UnitType.FOOT.convertFrom(autoFacility.transitionAlt, UnitType.METER) : this.fmsSettingManager.getSetting('transitionAltitude').definition.defaultValue),
    this.fmsSettingManager.getSetting('manualTransitionAltitude'),
    this.store.originFacility,
  );

  private readonly transitionLevel = MappedSubject.create(
    ([manual, autoFacility]) => manual > 0 ? manual :
      (autoFacility && autoFacility.transitionLevel > 0 ? UnitType.FOOT.convertFrom(autoFacility.transitionLevel, UnitType.METER) : this.fmsSettingManager.getSetting('transitionLevel').definition.defaultValue),
    this.fmsSettingManager.getSetting('manualTransitionLevel'),
    this.store.destinationFacility,
  );

  /**
   * Constructor.
   * @param bus The event bus to use.
   * @param store The flight plan store to use.
   */
  constructor(private readonly bus: EventBus, private readonly store: FlightPlanStore) {
    this.transitionAltitude.sub((v) => this.fmsSettingManager.getSetting('transitionAltitude').set(v), true);
    this.transitionLevel.sub((v) => this.fmsSettingManager.getSetting('transitionLevel').set(v), true);
  }
}

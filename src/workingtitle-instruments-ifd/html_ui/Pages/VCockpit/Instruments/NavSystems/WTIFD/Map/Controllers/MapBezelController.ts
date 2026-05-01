import { EventBus } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../Events/IfdInteractionEvent';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { IfdInteractionEventHandler } from '../../RightKnob/IfdInteractionEventHandler';
import { UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { getRangeNumber, RangeDirection } from '../Util/RangeHelper';

/**
 * Handles IFD Bezel interaction events for the map.
 */
export class MapBezelController implements IfdInteractionEventHandler {
  /**
   * Creates an instance of the BezelController.
   * @param bus Event Bus
   * @param mapDataProvider The map data provider to use.
   */
  constructor(
    readonly bus: EventBus,
    private readonly mapDataProvider: MapDataProvider,
  ) {
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        this.handleCycleMapView();
        break;
      case IfdInteractionEvent.RightKnobInnerDec:
      case IfdInteractionEvent.RightKnobOuterDec:
        this.changeRange(RangeDirection.Incline);
        break;
      case IfdInteractionEvent.RightKnobInnerInc:
      case IfdInteractionEvent.RightKnobOuterInc:
        this.changeRange(RangeDirection.Decline);
        break;
    }
    return true;
  }

  /**
   * Handles the right knob press to cycle map view
   */
  private handleCycleMapView(): void {
    this.mapDataProvider.trySelectNextOrientation();
  }

  /**
   * Change the range value depending on direction
   * @param rangeDirection RangeDirection
   */
  private changeRange(rangeDirection: RangeDirection): void {
    const rangeSetting = this.mapDataProvider.mapRange;
    const unitsSettingManager = UnitsUserSettings.getManager(
      this.bus
    );
    const updatedRange = getRangeNumber(rangeSetting.get(), rangeDirection, unitsSettingManager);
    this.mapDataProvider.rangeActive.set(true);
    setTimeout(() => {
      this.mapDataProvider.rangeActive.set(false);
    }, 3000);
    rangeSetting.set(updatedRange);
  }
}

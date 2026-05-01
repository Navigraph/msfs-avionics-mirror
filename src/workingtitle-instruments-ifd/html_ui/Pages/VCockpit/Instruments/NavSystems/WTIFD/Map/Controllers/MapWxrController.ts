import { MapSystemController, MapSystemKeys, MapWxrModule, Subscription } from '@microsoft/msfs-sdk';
import {MapNexradModule} from '../Modules/MapNexradModule';
import {MapKeys} from '../MapKeys';

/**
 * Modules required for MapWxrController.
 */
export interface MapWxrControllerModules {
  /** NEXRAD module. */
  [MapKeys.Nexrad]: MapNexradModule;

  /** Weather module. */
  [MapSystemKeys.Weather]: MapWxrModule;
}

/**
 * Controls the display of weather on the map based on options set by {@link MapNexradModule}.
 */
export class MapWxrController extends MapSystemController<MapWxrControllerModules> {
  private readonly nexradModule = this.context.model.getModule(MapKeys.Nexrad);
  private readonly weatherModule = this.context.model.getModule(MapSystemKeys.Weather);

  private nexradShowSub?: Subscription;
  private nexradColorsSub?: Subscription;

  /** @inheritdoc */
  public onAfterMapRender(): void {
    this.nexradColorsSub = this.nexradModule.colors.sub(colors => { this.weatherModule.weatherRadarColors.set(colors); }, false, true);

    this.nexradShowSub = this.nexradModule.showNexrad.sub(show => {
      if (show) {
        this.weatherModule.weatherRadarMode.set(EWeatherRadar.TOPVIEW);
        this.nexradColorsSub!.resume(true);
      } else {
        this.nexradColorsSub!.pause();
      }
      this.weatherModule.isEnabled.set(show);
    }, true);
  }

  /** @inheritdoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.nexradShowSub?.destroy();
  }
}

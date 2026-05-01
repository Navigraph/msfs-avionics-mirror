import {
  MapSystemContext, MapSystemController, NumberUnitInterface, Subscribable, Subscription, Unit, UnitFamily, UnitType, UserSettingFromManager,
} from '@microsoft/msfs-sdk';
import { MapKeys } from '../MapKeys';
import { IfdNominalRangesNm } from '../Util/RangeHelper';
import { MapUserSettingTypes } from '../../Settings/MapUserSettings';
import { IfdMapIndexedRangeModule } from '../Modules/IfdMapIndexedRangeModule';

/**
 * Modules required for MapFlightPlanFocusRTRController.
 */
export interface MapRangeControllerModules {
  /** Range module. */
  [MapKeys.Range]: IfdMapIndexedRangeModule;
}

/**
 * A controller that handles map range settings.
 */
export class MapRangeController extends MapSystemController<MapRangeControllerModules> {
  private readonly rangeModule: IfdMapIndexedRangeModule;
  private previewModeSub: Subscription | null = null;

  /**
   * Creates an instance of the MapRangeController.
   * @param context The map system context to use with this controller.
   * @param mapRange The map range from the user settings.
   * @param previewMode Whether the map is in preview mode.
   * @param previewRangeNm The preview range, in nautical miles.
   */
  constructor(
    context: MapSystemContext<MapRangeControllerModules>,
    private readonly mapRange: UserSettingFromManager<MapUserSettingTypes, 'mapRange'>,
    private readonly previewMode: Subscribable<boolean>,
    private readonly previewRangeNm = 40,
  ) {
    super(context);

    this.rangeModule = context.model.getModule(MapKeys.Range);
  }

  /** @inheritdoc */
  public onAfterMapRender(): void {
    this.wireSettings();
  }

  /**
   * Wires the controller to the settings manager.
   */
  private wireSettings(): void {
    this.rangeModule.nominalRanges.set(IfdNominalRangesNm.map(range => UnitType.NMILE.createNumber(range)));
    this.mapRange.sub(this.handleRangeChanged.bind(this), true);
    this.rangeModule.nominalRange.sub(this.handleNominalRangeChanged.bind(this), true);
    this.previewModeSub = this.previewMode.sub(this.handlePreviewModeChanged.bind(this), true);
  }

  /**
   * Handles preview mode changes by forcing a fixed projection range while preview is enabled.
   * @param enabled Whether preview mode is enabled.
   */
  private handlePreviewModeChanged(enabled: boolean): void {
    if (enabled) {
      this.applyRangeNm(this.previewRangeNm);
      this.forceModuleNominalRangeNm(this.previewRangeNm);
      return;
    }

    // Leaving preview: re-sync to current user setting
    this.handleRangeChanged(this.mapRange.get());
  }

  /**
   * Applies the projection range from a radius range in NM.
   * @param rangeNm The range radius in NM.
   */
  private applyRangeNm(rangeNm: number): void {
    // range is "radius" of the map, so multiply by 2 to get diameter
    this.context.projection.setQueued({
      range: UnitType.NMILE.convertTo(rangeNm * 2, UnitType.GA_RADIAN),
    });
  }

  /**
   * Forces the range module's nominal range without touching user settings.
   * @param rangeNm The range radius in NM.
   */
  private forceModuleNominalRangeNm(rangeNm: number): void {
    if (this.rangeModule.nominalRange.get().asUnit(UnitType.NMILE) !== rangeNm) {
      this.rangeModule.setNominalRangeNm(rangeNm);
    }
  }

  /**
   * Handles when the range changes.
   * @param range The range of the map, in nautical miles.
   */
  private handleRangeChanged(range: number): void {
    if (this.previewMode.get()) {
      this.applyRangeNm(this.previewRangeNm);
      this.forceModuleNominalRangeNm(this.previewRangeNm);
      return;
    }

    this.context.projection.setQueued({
      range: UnitType.NMILE.convertTo(range * 2, UnitType.GA_RADIAN),
    });

    if (this.rangeModule.nominalRange.get().asUnit(UnitType.NMILE) !== range) {
      this.rangeModule.setNominalRangeNm(range);
    }
  }

  /**
   * Handles when the nominal range changes.
   * @param nominalRange The nominal range of the map, as a NumberUnit.
   */
  private handleNominalRangeChanged(nominalRange: NumberUnitInterface<UnitFamily.Distance, Unit<UnitFamily.Distance>>): void {
    const nm = nominalRange.asUnit(UnitType.NMILE);
    if (this.mapRange.get() !== nm) {
      this.mapRange.set(nm);
    }
  }

  /** @inheritdoc */
  public destroy(): void {
    this.previewModeSub?.destroy();
    this.previewModeSub = null;

    super.destroy();
  }
}

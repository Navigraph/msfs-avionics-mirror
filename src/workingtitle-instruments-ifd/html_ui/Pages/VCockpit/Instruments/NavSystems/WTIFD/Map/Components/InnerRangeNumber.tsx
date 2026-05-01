import { ComponentProps, DisplayComponent, EventBus, FSComponent, Subject, Subscribable, SubscribableUtils, UnitType, VNode } from '@microsoft/msfs-sdk';

import { NumberUnitDisplay } from '../../Components/NumberDisplays';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { getRangeNumber, RangeTiers } from '../Util/RangeHelper';

import './RangeNumbers.css';

/** The properties for the {@link InnerRangeNumber} component. */
interface InnerRangeNumberProps extends ComponentProps {
  /** The radius of the range ring where the range numbers will be displayed. */
  readonly rangeRingRadius: number | Subscribable<number>;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** Wether to show the number */
  readonly hidden?: Subscribable<boolean>;
  /**
   * The event bus. Required for the map to respond appropriately to the mouse leaving the virtual cockpit instrument
   * screen while the user is dragging the range numbers
   */
  bus: EventBus;
  /**
   * Whether to allow click-and-drag zooming on the range number element.
   * Default is true.
   */
  readonly allowClickZoom?: boolean;
}

/** The InnerRangeNumber component. */
export class InnerRangeNumber extends DisplayComponent<InnerRangeNumberProps> {
  private readonly rangeRingRadius = SubscribableUtils.toSubscribable(
    this.props.rangeRingRadius,
    true,
  );
  public readonly rangeElement = FSComponent.createRef<HTMLElement>();
  private readonly MOUSE_BUFFER = 3;
  private readonly INITIAL_POINT = { y: 0 };
  private readonly startPoint = Subject.create({ y: 0 });
  private readonly endPoint = Subject.create({ y: 0 });
  private readonly rangeZoomActive = Subject.create(false);
  private readonly unitsSettingManager = UnitsUserSettings.getManager(
    this.props.bus
  );
  private readonly rangeTier = {
    0: { increment: 1 },
    25: { increment: 5 },
    200: { increment: 50 }
  };
  private readonly tiers: Record<string, RangeTiers> = {
    [UnitType.NMILE.name]: this.rangeTier,
    [UnitType.KILOMETER.name]: this.rangeTier,
    [UnitType.MILE.name]: this.rangeTier
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div ref={this.rangeElement} class={{ 'map-range-numbers': true, 'map-range-zoom-active': this.rangeZoomActive }}>
        <div
          class={{
            'range-number-inner': true,
            'range-active': this.props.mapDataProvider.rangeActive,
            'hidden': this.props.hidden ?? false
          }}
          style={{
            transform: this.rangeRingRadius.map((x) => `translateY(${-x}px)`),
          }}
        >
          <NumberUnitDisplay
            value={this.props.mapDataProvider.halfRangeNumberWithUnit}
            displayUnit={this.unitsSettingManager.distanceUnitsLarge}
            formatter={this.props.mapDataProvider.rangeFormatter}
            class={{
              'map-range-number-inner': true
            }}
          />
        </div>
      </div>
    );
  }


  /**
   * Update the map radius setting
   */
  public updateMapRadius = (): void => {
    if (this.startPoint.get() && this.endPoint.get()) {
      const dy = this.endPoint.get().y - this.startPoint.get().y;

      // If the drag distance doesn't exceed the buffer, exit early
      if (Math.abs(dy) < this.MOUSE_BUFFER) {
        return;
      }

      // Get the new range
      const direction = dy < 0 ? 1 : -1;
      const rangeSetting = this.props.mapDataProvider.mapRange;
      const updatedRange = getRangeNumber(rangeSetting.get(), direction, this.unitsSettingManager, this.tiers);

      // Set the map range setting
      this.props.mapDataProvider.mapRange.set(updatedRange);

      // reset the startPoint
      this.startPoint.set(this.endPoint.get());
    }
  };

  /**
   * Update the endPoint on mousemove
   * @param event MouseCoordinates
   */
  public onMouseMove = (event: MouseEvent): void => {
    this.endPoint.set({ y: event.clientY });
    this.updateMapRadius();
  };

  /**
   * Update the range setting
   */
  public onMouseUp = (): void => {

    this.rangeZoomActive.set(false);

    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);

    // Reset points
    this.startPoint.set({ ...this.INITIAL_POINT });
    this.endPoint.set({ ...this.INITIAL_POINT });
  };

  /**
   * Activate range zoom
   * @param event MouseEvent
   */
  public onMouseDown = (event: MouseEvent): void => {
    event.stopPropagation();
    this.rangeZoomActive.set(true);
    this.startPoint.set({ y: event.clientY });
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  };

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);
    if (this.props.allowClickZoom !== false) {
      this.rangeElement.instance.addEventListener(
        'mousedown',
        this.onMouseDown,
      );
    }
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
}

import { EventBus, FSComponent, MapLayer, MapLayerProps, VNode } from '@microsoft/msfs-sdk';

import { CompassRoseTicks } from '../../Components/CompassRose/CompassRose';
import { MapCompassOffset } from '../../Components/Map/MapCompassOffset';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { InnerRangeNumber } from '../Components';
import { OuterRangeNumber } from '../Components/OuterRangeNumber';
import { MapSystemCommon } from '../MapSystemCommon';

import './DataBlockHeadingUpModeMapLayer.css';

/** The properties for the {@link DataBlockHeadingUpModeMapLayer} component. */
interface DataBlockHeadingUpModeMapLayerProps extends MapLayerProps<unknown> {
  /** The event bus. */
  readonly bus: EventBus;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
}

/** The DataBlockHeadingUpModeMapLayer component. */
export class DataBlockHeadingUpModeMapLayer extends MapLayer<DataBlockHeadingUpModeMapLayerProps> {
  private readonly width = this.props.mapProjection.getProjectedSize()[0];
  private readonly rangeRingRadius = this.props.mapDataProvider.datablockAirplaneIconSize.map((v) => v / 3);
  private readonly compassSvgSize = this.width;

  private readonly targetProjectedOffsetY = MapSystemCommon.dataBlockOffsetY;
  private MIN_RANGE = 2;


  /** @inheritdoc */
  public render(): VNode {

    return (
      <div
        class={{
          'data-block-heading-up-overlay': true,
          'map-compass-overlay': true
        }}
      >
        <MapCompassOffset classname="map-compass-offset-outer" compassSvgSize={this.compassSvgSize} targetProjectedOffsetY={this.targetProjectedOffsetY}
        >
          <svg
            class={{
              'rose-ticks': true,
              'hidden': this.props.mapDataProvider.settings.getSetting('datablockMapRange').map((v) => v === this.MIN_RANGE),
            }}
            viewBox={`0 0 ${this.compassSvgSize} ${this.compassSvgSize}`}
            width={this.compassSvgSize}
            height={this.compassSvgSize}
            style={{
              position: 'absolute',
            }}
          >
            <CompassRoseTicks
              svgViewBoxSize={this.compassSvgSize}
              ticksRadius={this.props.mapDataProvider.datablockAirplaneIconSize.map((v) => v / 2 + 1)}
              shortTickLength={1}
              longTickLength={1}
              tickDirection={'Inwards'}
              withCircle={false}
              withTicks
              degreesPerTick={30}
            />
          </svg>
        </MapCompassOffset>
        <MapCompassOffset
          classname="map-compass-offset-inner"
          compassSvgSize={this.compassSvgSize}
          targetProjectedOffsetY={this.targetProjectedOffsetY}
        >
          <svg
            class="compass-circle-ticks"
            viewBox={`0 0 ${this.compassSvgSize} ${this.compassSvgSize}`}
            width={this.compassSvgSize}
            height={this.compassSvgSize}
            style={{
              position: 'absolute'
            }}
          >
            <CompassRoseTicks
              svgViewBoxSize={this.compassSvgSize}
              ticksRadius={MapSystemCommon.dataBlockCompassRadius}
              shortTickLength={1}
              longTickLength={2}
              tickDirection={'Inwards'}
              withCircle={false}
              withTicks
              degreesPerTick={10}
              degreesPerBigTick={30}
            />
          </svg>
          <div>

          </div>
          <div>
            <InnerRangeNumber
              hidden={this.props.mapDataProvider.settings.getSetting('datablockMapRange').map((v) => v === this.MIN_RANGE)}
              mapDataProvider={this.props.mapDataProvider}
              rangeRingRadius={this.rangeRingRadius}
              bus={this.props.bus}
              allowClickZoom={false}
            /></div>
          <OuterRangeNumber
            mapDataProvider={this.props.mapDataProvider}
            rangeRingRadius={this.rangeRingRadius}
            bus={this.props.bus}
            allowClickZoom={false}
          />
        </MapCompassOffset>
      </div>
    );
  }
}

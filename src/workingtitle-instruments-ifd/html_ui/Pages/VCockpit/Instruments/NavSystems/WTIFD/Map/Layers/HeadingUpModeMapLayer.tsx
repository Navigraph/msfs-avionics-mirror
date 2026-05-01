import { EventBus, FSComponent, MapLayer, MapLayerProps, MappedSubject, SVGUtils, VNode } from '@microsoft/msfs-sdk';

import { CompassRoseNumbers, CompassRoseTicks } from '../../Components/CompassRose/CompassRose';
import { RoseTicks } from '../../Components/CompassRose/RoseTicks';
import { DesiredTrackBug } from '../../Components/Map/DesiredTrackBug';
import { HeadingBug } from '../../Components/Map/HeadingBug';
import { HeadingTrackPointer } from '../../Components/Map/HeadingTrackPointer';
import { MapCompassOffset } from '../../Components/Map/MapCompassOffset';
import { OutlinedElement } from '../../Components/OutlinedElement';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { MapOrientationSettingMode } from '../../Settings/MapUserSettings';
import { InnerRangeNumber } from '../Components';
import { OuterRangeNumber } from '../Components/OuterRangeNumber';
import { MapSystemCommon } from '../MapSystemCommon';

import './HeadingUpModeMapLayer.css';

/** The properties for the {@link NorthUpModeMapLayer} component. */
interface HeadingUpModeMapLayerProps extends MapLayerProps<unknown> {
  /** The event bus. */
  readonly bus: EventBus;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** Whether heading selection is available. */
  readonly headingSelectEnabled: boolean;
}

/** The HeadingUpModeMapLayer component. */
export class HeadingUpModeMapLayer extends MapLayer<HeadingUpModeMapLayerProps> {
  private readonly width = this.props.mapProjection.getProjectedSize()[0];
  private readonly rangeRingRadius = this.props.mapDataProvider.northUpCompassRadius.map(radius => radius / 2);
  private readonly compassSvgSize = this.width;
  private readonly half = this.compassSvgSize / 2;
  private readonly compassRotatingSvgRef = FSComponent.createRef<SVGElement>();
  private readonly selectedHeadingAngle = MappedSubject.create(
    ([selectedHeading, compassRotation]): number => {
      return selectedHeading - compassRotation;
    },
    this.props.mapDataProvider.selectedHeading,
    this.props.mapDataProvider.compassUpDirection,
  );

  private readonly targetProjectedOffsetY = MapSystemCommon.northTrkUpOffsetY;

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'heading-up-overlay': true,
          'map-compass-overlay': true,
          'hidden': this.props.mapDataProvider.mapOrientation.map((v) => v != MapOrientationSettingMode.HeadingUp),
        }}
      >
        <MapCompassOffset classname="map-compass-offset-outer" compassSvgSize={this.compassSvgSize} targetProjectedOffsetY={this.targetProjectedOffsetY}
        >
          <svg
            class={{
              'rose-ticks': true,
              'hidden': this.props.mapDataProvider.settings.getSetting('mapCompassRose').map((v) => !v),
            }}
            viewBox={`0 0 ${this.compassSvgSize} ${this.compassSvgSize}`}
            width={this.compassSvgSize}
            height={this.compassSvgSize}
            style={{
              position: 'absolute',
            }}
          >
            <RoseTicks
              hidden={this.props.mapDataProvider.settings.getSetting('mapCompassRose')}
              svgViewBoxSize={this.compassSvgSize}
              ticksRadius={this.props.mapDataProvider.northUpCompassRadius.map((v) => v + 10)}
              tickLength={6}
              tickDirection={'Outwards'}
              degreesPerTick={45}
            />
          </svg>
          <svg class="range-ring">
            <OutlinedElement
              tag="path"
              outlineClass="map-path-shadow"
              stroke-dasharray={this.rangeRingRadius.map((v) => (2 * Math.PI * v) / 60)}
              d={this.rangeRingRadius.map((v) => SVGUtils.describeCircle(
                this.half,
                this.half,
                v
              ))}
            />
          </svg>
        </MapCompassOffset>
        <MapCompassOffset
          classname="map-compass-offset-inner"
          compassSvgSize={this.compassSvgSize}
          targetProjectedOffsetY={this.targetProjectedOffsetY}
        >
          <HeadingTrackPointer
            compassSvgSize={this.compassSvgSize}
            headingPointerRotation={this.props.mapDataProvider.headingPointerRotation}
            trackLineRotation={this.props.mapDataProvider.trackLineRotation}
            rangeRingRadius={this.rangeRingRadius} />
          <svg
            ref={this.compassRotatingSvgRef}
            class="compass-circle-ticks"
            viewBox={`0 0 ${this.compassSvgSize} ${this.compassSvgSize}`}
            width={this.compassSvgSize}
            height={this.compassSvgSize}
            style={{
              position: 'absolute',
              transform: this.props.mapDataProvider.compassUpDirection.map(
                (rot) => `rotate3d(0, 0, 1, ${rot * -1}deg)`
              ),
            }}
          >
            <CompassRoseTicks
              svgViewBoxSize={this.compassSvgSize}
              ticksRadius={this.props.mapDataProvider.northUpCompassRadius}
              shortTickLength={5}
              longTickLength={10}
              tickDirection={'Inwards'}
              withCircle={true}
              withTicks={this.props.mapDataProvider.settings.getSetting('mapCompassRose')}
              degreesPerTick={10}
              degreesPerBigTick={30}
            />
          </svg>
          <div
            class={{
              'hidden': this.props.mapDataProvider.settings.getSetting('mapCompassRose').map((v) => !v),
            }}
          >
            <CompassRoseNumbers
              svgViewBoxSize={this.compassSvgSize}
              numbersRadius={this.props.mapDataProvider.northUpCompassRadius.map((v) => v - 27)}
              rotation={this.props.mapDataProvider.compassUpDirection}
            />
          </div>
          <DesiredTrackBug
            compassSvgSize={this.compassSvgSize}
            rotationDeg={this.props.mapDataProvider.desiredTrackRotation}
            rangeRingRadius={this.rangeRingRadius} />
          {this.props.headingSelectEnabled && (
            <HeadingBug
              compassSvgSize={this.compassSvgSize}
              rotationDeg={this.selectedHeadingAngle}
              rangeRingRadius={this.rangeRingRadius} />
          )}
          <InnerRangeNumber
            mapDataProvider={this.props.mapDataProvider}
            rangeRingRadius={this.rangeRingRadius}
            bus={this.props.bus}
          />
          <OuterRangeNumber
            mapDataProvider={this.props.mapDataProvider}
            rangeRingRadius={this.rangeRingRadius}
            bus={this.props.bus}
          />
        </MapCompassOffset>
      </div>
    );
  }
}

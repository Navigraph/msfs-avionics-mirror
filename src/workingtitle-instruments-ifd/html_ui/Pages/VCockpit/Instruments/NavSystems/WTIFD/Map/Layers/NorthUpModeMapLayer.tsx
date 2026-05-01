import { EventBus, FSComponent, MapLayer, MapLayerProps, SVGUtils, VNode } from '@microsoft/msfs-sdk';

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

import './NorthUpModeMapLayer.css';

/** The properties for the {@link NorthUpModeMapLayer} component. */
interface NorthUpModeMapLayerProps extends MapLayerProps<unknown> {
  /** The event bus. */
  readonly bus: EventBus;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** Whether heading selection is available. */
  readonly headingSelectEnabled: boolean;
}

/** The NorthUpModeMapLayer component. */
export class NorthUpModeMapLayer extends MapLayer<NorthUpModeMapLayerProps> {
  private readonly width = this.props.mapProjection.getProjectedSize()[0];
  private readonly rangeRingRadius = this.props.mapDataProvider.northUpCompassRadius.map(radius => radius / 2);
  private readonly compassSvgSize = this.width;
  private readonly half = this.compassSvgSize / 2;
  private readonly compassRotatingSvgRef = FSComponent.createRef<SVGElement>();

  private readonly targetProjectedOffsetY = MapSystemCommon.northTrkUpOffsetY;

  /** @inheritdoc */
  public render(): VNode {

    return (
      <div class={{
        'north-up-overlay': true,
        'map-compass-overlay': true,
        'hidden': this.props.mapDataProvider.mapOrientation.map((v) => v != MapOrientationSettingMode.NorthUp),
      }}>

        <MapCompassOffset compassSvgSize={this.compassSvgSize} targetProjectedOffsetY={this.targetProjectedOffsetY}>
          <HeadingTrackPointer
            headingPointerRotation={this.props.mapDataProvider.headingPointerRotation}
            trackLineRotation={this.props.mapDataProvider.trackLineRotation}
            rangeRingRadius={this.rangeRingRadius}
            compassSvgSize={this.compassSvgSize}
          />
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
            <RoseTicks svgViewBoxSize={this.compassSvgSize}
              ticksRadius={this.props.mapDataProvider.northUpCompassRadius.map((v) => v + 10)}
              tickLength={6}
              hidden={this.props.mapDataProvider.settings.getSetting('mapCompassRose')}
              tickDirection={'Outwards'}
              degreesPerTick={45} />
            <CompassRoseTicks
              svgViewBoxSize={this.compassSvgSize}
              ticksRadius={this.props.mapDataProvider.northUpCompassRadius}
              shortTickLength={5}
              longTickLength={10}
              tickDirection={'Inwards'}
              withTicks={this.props.mapDataProvider.settings.getSetting('mapCompassRose')}
              withCircle={true}
              degreesPerTick={10}
              degreesPerBigTick={30}
            />
          </svg>
          <div class={{ 'hidden': this.props.mapDataProvider.settings.getSetting('mapCompassRose').map((v) => !v) }}>
            <CompassRoseNumbers
              svgViewBoxSize={this.compassSvgSize}
              numbersRadius={this.props.mapDataProvider.northUpCompassRadius.map(radius => radius - 27)}
              rotation={this.props.mapDataProvider.compassUpDirection}
            />
          </div>
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
          <DesiredTrackBug
            compassSvgSize={this.compassSvgSize}
            rotationDeg={this.props.mapDataProvider.desiredTrackRotation}
            rangeRingRadius={this.rangeRingRadius} />
          {this.props.headingSelectEnabled && (
            <HeadingBug
              compassSvgSize={this.compassSvgSize}
              rotationDeg={this.props.mapDataProvider.selectedHeading}
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
        <div class="north-up-symbol">
          <svg viewBox="0 0 66.88 70.37" xmlns="http://www.w3.org/2000/svg">
            <path class="cls-1" fill="#0f0f0f"
              d="M33.38,1c1.9,0,35.21,65.09,32.32,67.98-2.74,2.74-23.99-9.51-31.92-9.54S3.79,71.59,1.18,68.98,31.29,1,33.38,1Z" />
            <path class="cls-2" fill="#6f8eaa"
              d="M64.35,70.37c-2.66,0-7.24-1.81-13.94-4.56-6.11-2.51-13.04-5.35-16.63-5.36h-.02c-3.74,0-10.98,2.89-17.37,5.43-9.27,3.7-14.19,5.54-15.91,3.82-.61-.61-1.38-1.38,3.01-11.98,4.32-10.44,11.57-25.36,16.91-35.84C31.55,0,32.65,0,33.38,0s1.76,0,13.06,21.96c5.48,10.65,12.85,25.68,17.08,35.9,3.98,9.6,3.63,11.07,2.88,11.83-.46.46-1.15.68-2.06.68ZM33.75,58.44h.03c3.98.01,10.79,2.81,17.38,5.51,4.64,1.9,12.31,5.06,13.73,4.39.62-5.34-26.78-59.4-31.52-65.92-2.09,2.88-9.02,15.66-16.99,32C6.29,55.1,1.94,66.22,2.01,68.33c1.5.52,8.77-2.38,13.63-4.32,6.87-2.74,13.98-5.58,18.11-5.58Z" />
            <path class="cls-3" fill="#00C2DBFF"
              d="m23.02 56.25v-24.11h3.31l12.84 18.97v-18.97h3.09v24.11h-3.31l-12.81-18.97v18.97h-3.11z" />
          </svg>
        </div>
      </div>
    );
  }
}

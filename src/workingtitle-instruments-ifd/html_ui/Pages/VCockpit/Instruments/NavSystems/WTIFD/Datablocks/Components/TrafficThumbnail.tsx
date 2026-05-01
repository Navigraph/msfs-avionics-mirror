import { FacilityLoader, FlightPlanner, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { IfdOptions } from '../../IfdOptions';
import { TrafficMap } from '../../Map/TrafficMap';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { TrafficAltitudeMode } from '../../Settings/MapUserSettings';
import { TrafficSystem } from '../../Systems/Traffic/TrafficSystem';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

import './TrafficThumbnail.css';

/**
 * Traffic Interface
 */
interface TrafficDatablockProps extends BaseDatablockProps {
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** An instance of the traffic system */
  readonly trafficSystem?: TrafficSystem
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The instrument configuration. */
  readonly ifdOptions: IfdOptions;
}

/**
 * Traffic Thumbnail Data Block
 */
export class TrafficThumbnail extends Datablock<TrafficDatablockProps> {
  private readonly toggleRef = FSComponent.createRef<HTMLDivElement>();

  /**
   * @inheritdoc
   * @param props TrafficDatablockProps
   */
  constructor(props: TrafficDatablockProps) {
    super(props);
    this.handleCycleTrafficMode = this.handleCycleTrafficMode.bind(this);
  }

  /** @inheritdoc */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Traffic Thumbnail',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
      description: 'Traffic Thumbnail'
    };
  }

  /**
   * Handles the cycling of traffic modes
   */
  private handleCycleTrafficMode(): void {
    const trafficAltitudeMode = this.props.mapDataProvider.settings.getSetting('trafficAltitudeMode');
    const current = trafficAltitudeMode.get();

    const modes: TrafficAltitudeMode[] = [
      TrafficAltitudeMode.Normal,
      TrafficAltitudeMode.Above,
      TrafficAltitudeMode.Below,
      TrafficAltitudeMode.Ground,
      TrafficAltitudeMode.Unlimited
    ];

    const currentIndex = modes.indexOf(current);
    const nextIndex = (currentIndex + 1) % modes.length;
    const trafficMode: TrafficAltitudeMode = modes[nextIndex];

    trafficAltitudeMode.set(trafficMode);
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.toggleRef.instance.addEventListener('click', this.handleCycleTrafficMode);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-traffic-thumbnail" ref={this.datablockRef}>
        <div class="datablock-traffic-thumbnail-orientation">HDG</div>
        <TrafficMap
          bus={this.props.bus}
          trafficSystem={this.props.trafficSystem}
          flightPlanner={this.props.flightPlanner}
          mapDataProvider={this.props.mapDataProvider}
          facLoader={this.props.facLoader}
          ifdOptions={this.props.ifdOptions}
          onClick={this.onDatablockClick.bind(this)}
        />
        <div class="traffic-toggle" ref={this.toggleRef}>{this.props.mapDataProvider.settings.getSetting('trafficAltitudeMode').map((v) => v)}</div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.toggleRef.getOrDefault()?.removeEventListener('click', this.handleCycleTrafficMode);

    super.destroy();
  }
}

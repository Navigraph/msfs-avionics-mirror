/* eslint-disable max-len */
/* eslint-disable jsdoc/check-alignment */

import { ConsumerSubject, EventBus, PropertyTypeOf, ToNonNullable, UserSettingManager } from '@microsoft/msfs-sdk';

import { IfdMapPresetService } from '../../../../../Components/Map/IfdMapPresetService';
import { MapOrientationManagerEvents } from '../../../../../Misc/MapOrientationManager';
import { MapOrientationSettingMode, MapUserSettingTypes } from '../../../../../Settings/MapUserSettings';
import { SetupMenuRowListItems } from '../SetupMenuTypes';

/**
const RANGE_OPTIONS = [2, 4, 6, 10, 15, 20, 30, 40, 50, 60, 80, 100, 120, 160, 200, 240, 300, 400];
const RANGE_STATES = RANGE_OPTIONS.map(r => `<= ${r}nm`);

const RUNWAY_LENGTH_OPTIONS = [0, 650, 750, 900, 1050, 1200, 1350, 1500];
const RUNWAY_LENGTH_STATES = ['of any length', 'at least 2000ft long', 'at least 2500ft long', 'at least 3000ft long', 'at least 3500ft long', 'at least 4000ft long', 'at least 4500ft long', 'at least 5000ft long'];

const ALTITUDE_OPTIONS = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
const ALTITUDE_STATES = ['at any altitude', '< 500 ft', '< 1000 ft', '< 1500 ft', '< 2000 ft', '< 2500 ft', '< 3000 ft', '< 3500 ft', '< 4000 ft', '< 4500 ft', '< 5000 ft'];

/!**
 * Range value to index
 * @param value number
 * @returns number
 *!/
const rangeToIndex = (value: number): number => RANGE_OPTIONS.indexOf(value);

/!**
 * Altitude value to index
 * @param value number
 * @returns number
 *!/
const altitudeToIndex = (value: number): number => ALTITUDE_OPTIONS.indexOf(value);


/!**
 * Helper to convert detail level to index
 * @param level MapDetailLevelMode
 * @returns number
 *!/
const detailLevelToIndex = (level: MapDetailLevelMode): number => {
  switch (level) {
    case MapDetailLevelMode.Level1:
      return 0;
    case MapDetailLevelMode.Level2:
      return 1;
    case MapDetailLevelMode.Level3:
      return 2;
    default: return 0;
  }
};*/

/** The map settings of the setup page */
export class MapRow {
  private readonly isHeadingUpAvailable = ConsumerSubject.create(null, true);

  /** @inheritdoc */
  constructor(
    bus: EventBus,
    private readonly mapSettings: UserSettingManager<MapUserSettingTypes>,
    private readonly mapPresetService: IfdMapPresetService,
  ) {
    this.isHeadingUpAvailable.setConsumer(bus.getSubscriber<MapOrientationManagerEvents>().on('map_orientation_heading_up_available'));
  }

  /**
   * Changes a map setting in the user setting manager and saves it in the latest custom settings preset.
   * @param key The key of the setting to change.
   * @param value The new value of the setting.
   */
  private setCustomSetting<K extends keyof MapUserSettingTypes>(
    key: K,
    value: ToNonNullable<PropertyTypeOf<MapUserSettingTypes, K>>
  ): void {
    this.mapPresetService.saveCustomSetting(key, value);
  }

  /**
   * Gets the rows to display for this section
   * @returns The row section
   */
  public getRows(): SetupMenuRowListItems[] {
    return [
      {
        type: 'title',
        label: 'Map',
        items: [
          {
            type: 'state',
            label: 'Map Orientation',
            states: ['Heading Up', 'Track Up'],
            currentStateIndex: this.mapSettings.getSetting('mapOrientation').map((v) => v === MapOrientationSettingMode.HeadingUp ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapOrientation', stateIndex === 0 ? MapOrientationSettingMode.HeadingUp : MapOrientationSettingMode.TrackUp),
            isVisible: this.isHeadingUpAvailable,
          },
          {
            type: 'state',
            label: 'Compass Rose',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapCompassRose').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapCompassRose', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Heading Box',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapHeadingBox').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapHeadingBox', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Flight Plan Labels',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapFlightPlanLabels').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapFlightPlanLabels', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'VORs',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapVors').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapVors', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'NDBs',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapNdbs').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapNdbs', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Intersections',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapIntersections').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapIntersections', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Towered Airports',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapAirportsTowered').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapAirportsTowered', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Non-Towered Airports',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapAirportsNonTowered').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapAirportsNonTowered', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Class A/B/C Airspaces', // (if we are showing airspaces) (might just need to have a single airspace setting)
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapClassABCAirspace').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapClassABCAirspace', stateIndex === 0),
          },
          {
            type: 'state',
            label: 'Class D Airspace',
            states: ['On', 'Off'],
            currentStateIndex: this.mapSettings.getSetting('mapClassDAirspace').map(v => v ? 0 : 1),
            onStateConfirmed: (stateIndex) => this.setCustomSetting('mapClassDAirspace', stateIndex === 0),
          },
          // TODO Figure out how toggle non-TA/RA and ground traffic. Probably in MapBuilder.withTraffic().
          // {
          //   type: 'state',
          //   label: 'Non-TA traffic',
          //   states: ['On', 'Off'],
          //   currentStateIndex: this.mapSettings.getSetting('mapNonTaTraffic').map(v => v ? 0 : 1),
          //   onStateConfirmed: (stateIndex) => this.setCustomSetting('mapNonTaTraffic', stateIndex === 0),
          // },
        ]
      }
    ];
  }
}

/*
  <ExtendableRow
    bus={this.props.bus}
    label="Airport Filter"
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="airportFilter"
      label=""
      states={['Show all airports', 'Show towered airports', 'Show non-towered airports']}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportFilter').map((v): number =>
        v === MapAirportFilterMode.All ? 0 :
          v === MapAirportFilterMode.Towered ? 1 : 2
      )}
      onStateChanged={(stateIndex) => {
        const modes = [
          MapAirportFilterMode.All,
          MapAirportFilterMode.Towered,
          MapAirportFilterMode.NonTowered
        ];
        this.setCustomSetting('mapAirportFilter', modes[stateIndex]);
      }}
      fullWidth={true}
    />
    <StateSubRow
      selectionGroupId="airportFilter"
      label=""
      states={['with any kind of fuel available', 'with 100LL available', 'with Jet-A available']}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportFuel').map((v): number =>
        v === MapAirportFuelMode.All ? 0 :
          v === MapAirportFuelMode.OneHundredLL ? 1 : 2
      )}
      onStateChanged={(stateIndex) => {
        const modes = [
          MapAirportFuelMode.All,
          MapAirportFuelMode.OneHundredLL,
          MapAirportFuelMode.JetA
        ];
        this.setCustomSetting('mapAirportFuel', modes[stateIndex]);
      }}
      fullWidth={true}
    />
    <StateSubRow
      selectionGroupId="airportFilter"
      label=""
      states={['and any runway surface', 'and a hard surface runway', 'and a soft surface runway', 'and a water surface runway']}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportRunwaySurface').map((v): number =>
        v === MapAirportRunwaySurfaceMode.All ? 0 :
          v === MapAirportRunwaySurfaceMode.Hard ? 1 :
            v === MapAirportRunwaySurfaceMode.Soft ? 2 : 3
      )}
      onStateChanged={(stateIndex) => {
        const modes = [
          MapAirportRunwaySurfaceMode.All,
          MapAirportRunwaySurfaceMode.Hard,
          MapAirportRunwaySurfaceMode.Soft,
          MapAirportRunwaySurfaceMode.Water
        ];
        this.setCustomSetting('mapAirportRunwaySurface', modes[stateIndex]);
      }}
      fullWidth={true}
    />
    <StateSubRow
      selectionGroupId="airportFilter"
      label=""
      states={RUNWAY_LENGTH_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportRunwayLength').map((value: number): number => RUNWAY_LENGTH_OPTIONS.indexOf(value))}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapAirportRunwayLength', RUNWAY_LENGTH_OPTIONS[stateIndex]);
      }}
      fullWidth={true}
    />
  </ExtendableRow>
  <StateRow
    bus={this.props.bus}
    label="Altitude Filter"
    states={ON_OFF_OPTIONS}
    currentStateIndex={this.props.mapSettings.getSetting('mapAltitudeFilter').map(v => v ? 0 : 1)}
    onStateChanged={(stateIndex) => {
      this.setCustomSetting('mapAltitudeFilter', stateIndex === 0);
    }}
    isEnabled={true}
  />
  <ExtendableRow
    bus={this.props.bus}
    label="Special Use Airspace"
    collapsedStateContent={this.props.mapSettings.getSetting('mapSpecialUseAirspace').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="specialUseAirspace"
      label="Layer is"
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapSpecialUseAirspace').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapSpecialUseAirspace', stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="specialUseAirspace"
      label="Show when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapSpecialUseAirspaceRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapSpecialUseAirspaceRange', RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="specialUseAirspace"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapSpecialUseAirspaceDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapSpecialUseAirspaceDetailLevel', levels[stateIndex]);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="VORs"
    collapsedStateContent={this.props.mapSettings.getSetting('mapVors').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="vor"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapVors').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVors').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="vor"
      label="Show layers with "
      states={['labels', 'no labels']}
      currentStateIndex={this.props.mapSettings.getSetting('mapVorsLabels').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVorsLabels').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="vor"
      label="when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapVorsRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVorsRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="vor"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapVorsDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapVorsDetailLevel').set(levels[stateIndex]);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Towered Airports"
    collapsedStateContent={this.props.mapSettings.getSetting('mapAirportsTowered').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="toweredAirports"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsTowered').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapAirportsTowered').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="toweredAirports"
      label="Show layers with "
      states={['labels', 'no labels']}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsToweredLabels').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapAirportsToweredLabels').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="toweredAirports"
      label="when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsToweredRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapAirportsToweredRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="toweredAirports"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsToweredDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapAirportsToweredDetailLevel').set(levels[stateIndex]);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Non-Towered Airports"
    collapsedStateContent={this.props.mapSettings.getSetting('mapAirportsNonTowered').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="nonToweredAirports"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsNonTowered').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapAirportsNonTowered').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="nonToweredAirports"
      label="Show layers with "
      states={['labels', 'no labels']}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsNonToweredLabels').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapAirportsNonToweredLabels').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="nonToweredAirports"
      label="when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsNonToweredRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapAirportsNonToweredRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="nonToweredAirports"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapAirportsNonToweredDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapAirportsNonToweredDetailLevel').set(levels[stateIndex]);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Class A/B/C Airspace"
    collapsedStateContent={this.props.mapSettings.getSetting('mapClassABCAirspace').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="classABCAirspace"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassABCAirspace').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapClassABCAirspace').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="classABCAirspace"
      label="Show when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassABCAirspaceRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapClassABCAirspaceRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="classABCAirspace"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassABCAirspaceDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapClassABCAirspaceDetailLevel').set(levels[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="classABCAirspace"
      label="and aircraft is "
      states={ALTITUDE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassABCAirspaceAltitude').map(altitudeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapClassABCAirspaceAltitude').set(ALTITUDE_OPTIONS[stateIndex]);
      }}
    />
    <SetupSubRowBase
      label='above the airspace'
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Class D Airspace"
    collapsedStateContent={this.props.mapSettings.getSetting('mapClassDAirspace').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="classDairspace"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassDAirspace').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapClassDAirspace').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="classDairspace"
      label="Show when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassDAirspaceRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapClassDAirspaceRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="classDairspace"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassDAirspaceDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapClassDAirspaceDetailLevel').set(levels[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="classDairspace"
      label="and aircraft is "
      states={ALTITUDE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapClassDAirspaceAltitude').map(altitudeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapClassDAirspaceAltitude').set(ALTITUDE_OPTIONS[stateIndex]);
      }}
    />
    <SetupSubRowBase
      label='above the airspace'
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="High Obstacles"
    collapsedStateContent={this.props.mapSettings.getSetting('mapHighObstacles').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="highObstacles"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapHighObstacles').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapHighObstacles').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="highObstacles"
      label="Show layer with "
      states={['labels', 'no labels']}
      currentStateIndex={this.props.mapSettings.getSetting('mapHighObstaclesLabels').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapHighObstaclesLabels').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="highObstacles"
      label="Show when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapHighObstaclesRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapHighObstaclesRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="highObstacles"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapHighObstaclesDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapHighObstaclesDetailLevel').set(levels[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="highObstacles"
      label="and aircraft is "
      states={ALTITUDE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapHighObstaclesAltitude').map(altitudeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapHighObstaclesAltitude').set(ALTITUDE_OPTIONS[stateIndex]);
      }}
    />
    <SetupSubRowBase
      label='above the airspace'
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Low Obstacles"
    collapsedStateContent={this.props.mapSettings.getSetting('mapLowObstacles').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="lowObstacles"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapLowObstacles').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapLowObstacles').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="lowObstacles"
      label="Show layer with "
      states={['labels', 'no labels']}
      currentStateIndex={this.props.mapSettings.getSetting('mapLowObstaclesLabels').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapLowObstaclesLabels').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="lowObstacles"
      label="Show when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapLowObstaclesRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapLowObstaclesRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="lowObstacles"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapLowObstaclesDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2,MapDetailLevelMode.Level3];
        this.setCustomSetting('mapLowObstaclesDetailLevel').set(levels[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="lowObstacles"
      label="and aircraft is "
      states={ALTITUDE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapLowObstaclesAltitude').map(altitudeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapLowObstaclesAltitude').set(ALTITUDE_OPTIONS[stateIndex]);
      }}
    />
    <SetupSubRowBase
      label='above the airspace'
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Intersections"
    collapsedStateContent={this.props.mapSettings.getSetting('mapIntersections').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="intersections"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapIntersections').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapIntersections').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Victor Airways"
    collapsedStateContent={this.props.mapSettings.getSetting('mapVictorAirways').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="victorAirways"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapVictorAirways').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVictorAirways').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="victorAirways"
      label="Show layer with "
      states={['labels', 'no labels']}
      currentStateIndex={this.props.mapSettings.getSetting('mapVictorAirwaysLabels').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVictorAirwaysLabels').set(stateIndex === 0);
      }}
    />
    <StateSubRow
      selectionGroupId="victorAirways"
      label="Show when map range is"
      states={RANGE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapVictorAirwaysRange').map(rangeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVictorAirwaysRange').set(RANGE_OPTIONS[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="victorAirways"
      label="and detail level is at least"
      alwaysBlackValueBox={true}
      states={[
        <VolumeTriangleIndicator volumeLevel={Subject.create(0)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(1)} className='settings-state-sub-row-volume' />,
        <VolumeTriangleIndicator volumeLevel={Subject.create(2)} className='settings-state-sub-row-volume' />
      ]}
      currentStateIndex={this.props.mapSettings.getSetting('mapVictorAirwaysDetailLevel').map(detailLevelToIndex)}
      onStateChanged={(stateIndex) => {
        const levels = [MapDetailLevelMode.Level1, MapDetailLevelMode.Level2, MapDetailLevelMode.Level3];
        this.setCustomSetting('mapVictorAirwaysDetailLevel').set(levels[stateIndex]);
      }}
    />
    <StateSubRow
      selectionGroupId="victorAirways"
      label="and aircraft is "
      states={ALTITUDE_STATES}
      currentStateIndex={this.props.mapSettings.getSetting('mapVictorAirwaysAltitude').map(altitudeToIndex)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVictorAirwaysAltitude').set(ALTITUDE_OPTIONS[stateIndex]);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Jet Airways"
    collapsedStateContent={this.props.mapSettings.getSetting('mapJetAirways').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="jetAirways"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapJetAirways').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapJetAirways').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="VFR Airways"
    collapsedStateContent={this.props.mapSettings.getSetting('mapVfrAirways').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="vfrAirways"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapVfrAirways').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapVfrAirways').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="User Waypoints"
    collapsedStateContent={this.props.mapSettings.getSetting('mapUserWaypoints').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="userWaypoints"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapUserWaypoints').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapUserWaypoints').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="NDBs"
    collapsedStateContent={this.props.mapSettings.getSetting('mapNdbs').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="ndbs"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapNdbs').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapNdbs').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Non-TA Traffic"
    collapsedStateContent={this.props.mapSettings.getSetting('mapNonTaTraffic').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="nonTaTraffic"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapNonTaTraffic').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapNonTaTraffic').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Power Lines"
    collapsedStateContent={this.props.mapSettings.getSetting('mapPowerLines').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="powerLines"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapPowerLines').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapPowerLines').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <ExtendableRow
    bus={this.props.bus}
    label="Interstates"
    collapsedStateContent={this.props.mapSettings.getSetting('mapInterStates').map(v => v ? 'On' : 'Off')}
    isEnabled={true}
  >
    <StateSubRow
      selectionGroupId="interstates"
      label="Layer is "
      states={ON_OFF_OPTIONS}
      currentStateIndex={this.props.mapSettings.getSetting('mapInterStates').map(v => v ? 0 : 1)}
      onStateChanged={(stateIndex) => {
        this.setCustomSetting('mapInterStates').set(stateIndex === 0);
      }}
    />
  </ExtendableRow>

  <StateRow
    bus={this.props.bus}
    label="Flight Plan Labels"
    states={ON_OFF_OPTIONS}
    currentStateIndex={this.props.mapSettings.getSetting('mapFlightPlanLabels').map(v => v ? 0 : 1)}
    onStateChanged={(stateIndex) => {
      this.setCustomSetting('mapFlightPlanLabels').set(stateIndex === 0);
    }}
    isEnabled={true}
  />
*/

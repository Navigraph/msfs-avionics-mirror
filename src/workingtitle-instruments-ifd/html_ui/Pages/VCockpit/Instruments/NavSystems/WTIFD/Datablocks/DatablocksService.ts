import {
  ArraySubject, ArrayUtils, BitFlags, EventBus, FacilityLoader, FlightPlanner, MapSubject, SetSubject, Subject, Subscribable, SubscribableArray,
  SubscribableMap, SubscribableMapEventType, SubscribableSet, SubscribableUtils, Subscription
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../Events/IfdTuningControlsManager';
import { FlightPlanStore } from '../FlightPlan';
import { IfdOptions } from '../IfdOptions';
import { IfdNavSources } from '../Navigation/Sources/IfdNavSources';
import { NavRadioNavSource } from '../Navigation/Sources/NavRadioNavSource';
import { IfdPageName } from '../Pages/IfdPage';
import { MapDataProvider } from '../Providers/Map/MapDataProvider';
import { IfdInteractionEventHandler } from '../RightKnob';
import { DatablockUserSettings } from '../Settings/DatablockUserSettings';
import { UnitsUserSettings } from '../Settings/UnitsUserSettings';
import { IfdCasAlertManager } from '../Systems/Cas/IfdCasAlertManager';
import { TimerManager } from '../Systems/Timer/TimerManager';
import { TrafficSystem } from '../Systems/Traffic/TrafficSystem';
import { IfdDataProvider } from '../Utilities/IfdDataProvider';
import { IfdViewService } from '../ViewService';
import { ActiveGpsApproachDatablock } from './Components/ActiveGpsApproachDatablock';
import { AircraftPositionDatablock } from './Components/AircraftPositionDatablock';
import { BlankDatablock } from './Components/BlankDatablock';
import { ComVlocStandbyDatablock } from './Components/ComVlocStandbyDatablock';
import { CrossTrackDistanceDatablock } from './Components/CrossTrackDistanceDatablock';
import { Datablock } from './Components/Datablock';
import { DecodedVlocIdentDatablock } from './Components/DecodedVlocIdentDatablock';
import { DesiredTrackDatablock } from './Components/DesiredTrackDatablock';
import { FlightTimerDatablock } from './Components/FlightTimerDatablock';
import { FuelEconomyDatablock } from './Components/FuelEconomyDatablock';
import { FuelFlowDatablock } from './Components/FuelFlowDatablock';
import { FuelRemainingDatablock } from './Components/FuelRemainingDatablock';
import { FuelTimeRemainingDatablock } from './Components/FuelTimeRemainingDatablock';
import { FuelUsedDatablock } from './Components/FuelUsedDatablock';
import { GpsAglAltDatablock } from './Components/GpsAglAltDatablock';
import { GpsCdiDatablock } from './Components/GpsCdiDatablock';
import { GroundSpeedDatablock } from './Components/GroundSpeedDatablock';
import { GroundTrackDatablock } from './Components/GroundTrackDatablock';
import { LocalTimeDatablock } from './Components/LocalTimeDatablock';
import { NavigationModeDatablock } from './Components/NavigationModeDatablock';
import { NearestAirportDatablock } from './Components/NearestAirportDatablock';
import { NextDtkDatablock } from './Components/NextDtkDatablock';
import { NumberOfAlertsDatablock } from './Components/NumberOfAlertsDatablock';
import { PrimaryComVlocDatablock } from './Components/PrimaryComVlocDatablock';
import { RadarAltitudeDatablock } from './Components/RadarAltitudeDatablock';
import { StaticAirTempDatablock } from './Components/StaticAirTempDatablock';
import { TotalAirTempDatablock } from './Components/TotalAirTempDatablock';
import { TrackAngleErrorDatablock } from './Components/TrackAngleErrorDatablock';
import { TrafficThumbnail } from './Components/TrafficThumbnail';
import { TransponderThumbnail } from './Components/TransponderThumbnail';
import { UtcTimeDatablock } from './Components/UtcTimeDatablock';
import { VerticalSpeedRequiredDatablock } from './Components/VerticalSpeedRequiredDatablock';
import { VlocRadioDatablock } from './Components/VlocRadioDatablock';
import { DestAlongTrkInfoDatablock } from './Components/WaypointDatablocks/DestAlongTrkInfoDatablock';
import { DestDirectDistanceDatablock } from './Components/WaypointDatablocks/DestDirectDistanceDatablock';
import { DestDirectInfoDatablock } from './Components/WaypointDatablocks/DestDirectInfoDatablock';
import { DestEteDatablock } from './Components/WaypointDatablocks/DestEteDatablock';
import { DestWptDatablock } from './Components/WaypointDatablocks/DestWptDatablock';
import { EtaAtDestinationDatablock } from './Components/WaypointDatablocks/EtaAtDestinationDatablock';
import { NextWptInfoDatablock } from './Components/WaypointDatablocks/NextWptInfoDatablock';
import { ToWptInfoDatablock } from './Components/WaypointDatablocks/ToWptInfoDatablock';
import { WindVectorDatablock } from './Components/WindVectorDatablock';
import { DatablockPreset, DatablockPresetType, DefaultDatablockPresets } from './DatablockPresets';
import { DatablockCompatibility, DatablockCompatibilityMap, DataBlockId, DatablockSlotLocation } from './DatablockTypes';

/** The public interface for the DatablockService */
export interface DatablockServiceInterface {
  /** The datablock array for the left sidebar. Index is the position in the sidebar, value is the datablock. */
  readonly leftDatablocks: SubscribableArray<Datablock>;
  /** The datablock array for the right sidebar. Index is the position in the sidebar, value is the datablock. */
  readonly rightDatablocks: SubscribableArray<Datablock>;
  /** The datablock array for the top bar. Index is the position in the bar, value is the datablock. */
  readonly topDatablocks: SubscribableArray<Datablock>;
  /** Whether the datablock layout is currently being edited. */
  readonly editingDatablocks: Subscribable<boolean>;
  /** The currently selected datablock when editing, null when not editing. */
  readonly selectedDatablock: Subscribable<[DatablockSlotLocation, number] | null>;
}

/**
 * Service for managing datablocks
 */
export class DatablockService implements DatablockServiceInterface, IfdInteractionEventHandler {
  public static readonly LEFT_SIDEBAR_SLOTS = 13;
  public static readonly RIGHT_SIDEBAR_SLOTS = 30;
  public static readonly TOP_BAR_SLOTS = 2;

  private readonly datablockSettings = DatablockUserSettings.getManager(this.bus, this.ifdOptions);

  private readonly _selectedPreset = this.datablockSettings.getSetting('selectedPreset');

  private readonly _datablocksInUse = SetSubject.create<DataBlockId>();
  public readonly datablocksInUse = this._datablocksInUse as SubscribableSet<DataBlockId>;

  private readonly datablockUseCount = MapSubject.create<DataBlockId, number>([[DataBlockId.Blank, Infinity]]);

  private readonly _usedSlots = MapSubject.create<DatablockSlotLocation, number>(new Map([
    [DatablockSlotLocation.LeftSidebar, 0],
    [DatablockSlotLocation.RightSidebar, 0],
    [DatablockSlotLocation.TopBar, 0],
  ]));
  public readonly usedSlots = this._usedSlots as SubscribableMap<DatablockSlotLocation, number>;

  private readonly _leftDatablocks = this.createBlankDatablockArraySubject(DatablockService.LEFT_SIDEBAR_SLOTS, DatablockSlotLocation.LeftSidebar);
  public readonly leftDatablocks = this._leftDatablocks as SubscribableArray<Datablock>;

  private readonly _rightDatablocks = this.createBlankDatablockArraySubject(DatablockService.RIGHT_SIDEBAR_SLOTS, DatablockSlotLocation.RightSidebar);
  public readonly rightDatablocks = this._rightDatablocks as SubscribableArray<Datablock>;

  private readonly _topDatablocks = this.createBlankDatablockArraySubject(DatablockService.TOP_BAR_SLOTS, DatablockSlotLocation.TopBar);
  public readonly topDatablocks = this._topDatablocks as SubscribableArray<Datablock>;

  private readonly _editingDatablocks = Subject.create<boolean>(false);
  public readonly editingDatablocks = this._editingDatablocks as Subscribable<boolean>;

  private readonly _selectedDatablock = Subject.create<[DatablockSlotLocation, number] | null>(null);
  public readonly selectedDatablock = this._selectedDatablock as Subscribable<[DatablockSlotLocation, number] | null>;

  private readonly unitSettingManager = UnitsUserSettings.getManager(this.bus);

  public readonly setupMenuSidebarVisible = Subject.create(false);

  private activeTabSub?: Subscription;

  /**
   * Creates a new DatablockService
   * @param bus The event bus
   * @param mapDataProvider a datablock map provider instance
   * @param flightPlanner an instance of flight planner
   * @param trafficSystem an instance of the traffic system
   * @param facLoader an instance of the facility loader
   * @param viewService an instance of the IFD view service
   * @param ifdTuningControlsManager an instance of the IFD tuning controls manager
   * @param ifdOptions an instance of the IFD options
   * @param timerManager an instance of the IFD flight timer manager
   * @param ifdCasAlertManager an instance of the IFD CAS alert manager
   * @param vlocSource an instance of the nav radio nav source
   * @param flightPlanStore an instance of the flight plan store
   * @param dataProvider an instance of the IfdDataProvider
   */
  constructor(
    private readonly bus: EventBus,
    private readonly mapDataProvider: MapDataProvider,
    private readonly flightPlanner: FlightPlanner,
    private readonly trafficSystem: TrafficSystem | undefined,
    private readonly facLoader: FacilityLoader,
    private readonly viewService: IfdViewService,
    private readonly ifdTuningControlsManager: IfdTuningControlsManager,
    private readonly ifdOptions: IfdOptions,
    private readonly timerManager: TimerManager,
    private readonly ifdCasAlertManager: IfdCasAlertManager,
    private readonly vlocSource: NavRadioNavSource<IfdNavSources> | undefined,
    private readonly flightPlanStore: FlightPlanStore,
    private readonly dataProvider: IfdDataProvider,
  ) {

    this.reloadPresetByType(this._selectedPreset.get(), true);
    this._selectedPreset.sub(presetType => {
      this.reloadPresetByType(presetType);
    }, false);

    this.viewService.activePage.sub(page => {
      this.activeTabSub?.destroy();
      if (page?.name !== IfdPageName.AUX) {
        this.stopEditing();
      } else {
        this.activeTabSub = page?.activeTab.sub(tab => {
          const title = !tab ? undefined : SubscribableUtils.isSubscribable(tab?.title) ? tab.title.get() : tab.title;
          if (title !== 'SETUP') {
            this.stopEditing();
          }
        }, true);
      }
    }, true);

    this.datablockUseCount.sub((_, eventType, id, count) => {
      switch (eventType) {
        case SubscribableMapEventType.Added:
          if (count > 0) {
            this._datablocksInUse.add(id);
          }
          break;
        case SubscribableMapEventType.Changed:
          if (count > 0) {
            this._datablocksInUse.add(id);
          } else {
            this._datablocksInUse.delete(id);
          }
          break;
        case SubscribableMapEventType.Deleted:
          this._datablocksInUse.delete(id);
          break;
      }
    }, true);
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (!this.editingDatablocks.get()) {
      return false;
    }

    if (event === IfdInteractionEvent.CLR) {
      const selectedDatablock = this.selectedDatablock.get();
      if (selectedDatablock) {
        this.replaceDatablock(DataBlockId.Blank, ...selectedDatablock);
        return true;
      }
    }

    return false;
  }

  /**
   * Sets the given datablock type at the currently selected location.
   * @param id The id of the datablock type to set.
   */
  public setSelectedLocation(id: DataBlockId): void {
    if (!this.editingDatablocks.get()) {
      return;
    }

    const selectedLocation = this.selectedDatablock.get();
    if (selectedLocation) {
      this.replaceDatablock(id, ...selectedLocation);
    }
  }

  /** Starts editing of the datablock layout. */
  public startEditing(): void {
    this.setupMenuSidebarVisible.set(true);
    this._editingDatablocks.set(true);
    // The default selected datablock is the first one in the top bar
    this._selectedDatablock.set([DatablockSlotLocation.TopBar, 0]);
  }

  /** Stops editing of the datablock layout. */
  public stopEditing(): void {
    this.setupMenuSidebarVisible.set(false);
    this._editingDatablocks.set(false);
    this._selectedDatablock.set(null);
  }

  /**
   * Selects the specified datablock slot.
   * @param location The location of the datablock slot to select.
   * @param position The position of the datablock within the slot.
   */
  public selectPosition(location: DatablockSlotLocation, position: number): void {
    if (location === DatablockSlotLocation.LeftSidebar && position === 0) {
      // The Primary COM/VLOC datablock should not be selectable, do not change the selection
      return;
    }
    if (this._editingDatablocks.get()) {
      this._selectedDatablock.set([location, position]);
    }
  }

  /**
   * Gets the datablock at the specified position in the specified datablock bar.
   * @param location The location of the datablock bar.
   * @param position The position of the datablock within the bar.
   * @returns The datablock at the specified position, or undefined if not found.
   */
  public getDatablockAtPosition(location: DatablockSlotLocation, position: number): Datablock | undefined {
    if (location === DatablockSlotLocation.TopBar) {
      return this._topDatablocks.get(position);
    } else if (location === DatablockSlotLocation.LeftSidebar) {
      return this._leftDatablocks.get(position);
    } else if (location === DatablockSlotLocation.RightSidebar) {
      return this._rightDatablocks.get(position);
    }
    return undefined;
  }

  /**
   * Replaces the datablock at the specified position in the specified datablock bar.
   * @param id The ID of the datablock to replace.
   * @param location The location of the datablock bar.
   * @param position The desired position of the datablock within the datablock bar.
   * @param savePreset Whether to save the current preset. Defaults to true.
   */
  private replaceDatablock(id: DataBlockId, location: DatablockSlotLocation, position: number, savePreset = true): void {
    const currentDatablock = this.getDatablockAtPosition(location, position);
    const oldInfo = currentDatablock?.getInfo();
    if (!currentDatablock || !oldInfo) {
      console.error(`Position [${location}, ${position}] is not valid.`);
      return;
    }

    if (id === oldInfo.id) {
      // No need to replace the same datablock, this is not an error.
      return;
    }

    // Check whether the datablock can be removed (replaced with Blank)
    if (id === DataBlockId.Blank && !this.isDatablockRemovable(oldInfo.id, location, position)) {
      // This is not an error, we're safeguarding against removing certain blocks on CLR button push
      return;
    }

    let usedSlots = this.usedSlots.getValue(location) ?? 0;
    usedSlots = Math.max(0, usedSlots - oldInfo.size);

    let datablock = this.createDatablock(id, location, position);
    if (!datablock) {
      datablock = this.createDatablock(DataBlockId.Blank, location, position);
      if (!datablock) {
        console.error(`Datablock could not be replaced at [${location}, ${position}].`);
        return;
      }
    }

    const newInfo = datablock.getInfo();
    if (!BitFlags.isAny(
      newInfo?.compatibleSlots ?? 0,
      location === DatablockSlotLocation.TopBar ? DatablockCompatibility.Top
        : location === DatablockSlotLocation.LeftSidebar ? DatablockCompatibility.Left : DatablockCompatibility.Right,
    )) {
      console.error(`Datablock ${id} is not compatible with slot ${location}`);
      datablock.destroy();
      return;
    }

    this._usedSlots.setValue(location, usedSlots + newInfo.size);

    this.datablockUseCount.setValue(oldInfo.id, (this.datablockUseCount.getValue(oldInfo.id) ?? 1) - 1);
    this.datablockUseCount.setValue(id, (this.datablockUseCount.getValue(id) ?? 0) + 1);

    const mapSubject = location === DatablockSlotLocation.RightSidebar ?
      this._rightDatablocks : location === DatablockSlotLocation.LeftSidebar ? this._leftDatablocks : this._topDatablocks;
    mapSubject.removeAt(position);
    mapSubject.insert(datablock, position);

    // Destroy the removed datablock
    currentDatablock?.destroy();

    // Save changes
    if (savePreset) {
      this.savePresetChanges();
    }
  }

  /**
   * Reloads the selected preset, overwriting the slots on the sidebars specified in the preset.
   * @param type The type of preset to reload.
   * @param initialLoad Whether this is the initial load of the presets. Defaults to false.
   */
  public reloadPresetByType(type: DatablockPresetType, initialLoad = false): void {
    const preset = this.getPreset(type);
    if (preset) {
      if (initialLoad && (!preset.topSidebarSlots || !preset.rightSidebarSlots)) {
        const factory = this.getPreset(DatablockPresetType.FactorySettings);
        if (!preset.topSidebarSlots && factory) {
          preset.topSidebarSlots = factory.topSidebarSlots;
        }
        if (!preset.rightSidebarSlots && factory) {
          preset.rightSidebarSlots = factory.rightSidebarSlots;
        }
      }
      this.loadPreset(preset);
    }
  }

  /**
   * Determines whether the datablock represented by the menu row is incompatible with the selected position.
   * @param id The ID of the datablock.
   * @param selectedPosition The selected position.
   * @returns Whether the datablock is incompatible with the selected position.
   */
  public isDatablockIncompatibleWithSelectedPosition(id: DataBlockId, selectedPosition: [DatablockSlotLocation, number] | null): boolean {
    if (!selectedPosition) {
      return true;
    }

    // Handle special cases
    if (id === DataBlockId.VlocRadio && this.ifdOptions.navIndex === undefined) {
      return true;
    }
    if (id === DataBlockId.TransponderThumbnail && !this.ifdOptions.enableTransponder) {
      return false;
    }

    const compatibility = DatablockCompatibilityMap.get(id);
    return !BitFlags.isAny(
      compatibility ?? 0,
      selectedPosition[0] === DatablockSlotLocation.TopBar ? DatablockCompatibility.Top
        : selectedPosition[0] === DatablockSlotLocation.LeftSidebar ? DatablockCompatibility.Left : DatablockCompatibility.Right,
    );
  }

  /**
   * Creates a datablock instance for the specified datablock ID.
   * @param id The ID of the datablock to create.
   * @param location The location of the datablock bar.
   * @param position The desired position of the datablock within the datablock bar.
   * @returns The created datablock instance, or undefined if the datablock ID is not found.
   */
  private createDatablock(id: DataBlockId, location: DatablockSlotLocation, position: number): Datablock | undefined {
    let datablock: Datablock | undefined;
    switch (id) {
      case DataBlockId.Blank:
        datablock = new BlankDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.PrimaryComVloc:
        datablock = new PrimaryComVlocDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          ifdTuningControlManager: this.ifdTuningControlsManager,
          ifdOptions: this.ifdOptions,
        });
        break;
      case DataBlockId.VlocRadio:
        if (this.ifdOptions.navIndex !== undefined) {
          datablock = new VlocRadioDatablock({
            bus: this.bus,
            location,
            position,
            datablockService: this,
            datablockId: id,
            ifdTuningControlManager: this.ifdTuningControlsManager,
            ifdOptions: this.ifdOptions,
          });
        }
        break;
      case DataBlockId.ComVlocStandby2:
        datablock = new ComVlocStandbyDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          ifdTuningControlManager: this.ifdTuningControlsManager,
          ifdOptions: this.ifdOptions,
          standbyIndex: 2,
        });
        break;
      case DataBlockId.ComVlocStandby3:
        datablock = new ComVlocStandbyDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          ifdTuningControlManager: this.ifdTuningControlsManager,
          ifdOptions: this.ifdOptions,
          standbyIndex: 3,
        });
        break;
      case DataBlockId.ComVlocStandby4:
        datablock = new ComVlocStandbyDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          ifdTuningControlManager: this.ifdTuningControlsManager,
          ifdOptions: this.ifdOptions,
          standbyIndex: 4,
        });
        break;
      case DataBlockId.TransponderThumbnail:
        if (this.ifdOptions.enableTransponder) {
          datablock = new TransponderThumbnail({
            bus: this.bus,
            location,
            position,
            datablockService: this,
            datablockId: id,
            ifdTuningControlManager: this.ifdTuningControlsManager,
            ifdInstrumentIndex: this.ifdOptions.instrumentIndex
          });
        }
        break;
      case DataBlockId.TrafficThumbnail:
        datablock = new TrafficThumbnail({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          trafficSystem: this.trafficSystem,
          mapDataProvider: this.mapDataProvider,
          flightPlanner: this.flightPlanner,
          facLoader: this.facLoader,
          ifdOptions: this.ifdOptions,
        });
        break;
      case DataBlockId.ToWaypointInformation:
        datablock = new ToWptInfoDatablock({
          bus: this.bus,
          location, position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
        });
        break;
      case DataBlockId.NextWaypointInformation:
        datablock = new NextWptInfoDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
          flightPlanner: this.flightPlanner,
        });
        break;
      // case DataBlockId.DesignatedWaypoint:
      //   datablock = new DesignatedWptDatablock({
      //     bus: this.bus,
      //     location,
      //     position,
      //     datablockService: this,
      //     datablockId: id,
      //     dataProvider: this.dataProvider,
      //     flightPlanStore: this.flightPlanStore
      //   });
      //   break;
      // case DataBlockId.DesignatedWaypoint:
      //   datablock = new DesignatedWptDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
      //   break;
      case DataBlockId.DestinationAlongTrackInfo:
        datablock = new DestAlongTrkInfoDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
        });
        break;
      case DataBlockId.DestinationDirectInfo:
        datablock = new DestDirectInfoDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
        });
        break;
      case DataBlockId.DestinationWaypoint:
        datablock = new DestWptDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
        });
        break;
      case DataBlockId.DestinationDirectDistance:
        datablock = new DestDirectDistanceDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
        });
        break;
      // case DataBlockId.ToWaypointDirectInfo:
      //   datablock = new ToWptDirectInfoDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
      //   break;
      // case DataBlockId.ToWaypointDirectDistance:
      //   datablock = new ToWptDirectDistanceDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
      //   break;
      case DataBlockId.EtaAtDestination:
        datablock = new EtaAtDestinationDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
        });
        break;
      // case DataBlockId.ToWaypointEta:
      //   datablock = new ToWptEtaDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
      //   break;
      case DataBlockId.DestinationEte:
        datablock = new DestEteDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore,
        });
        break;
      // case DataBlockId.ToWaypointEte:
      //   datablock = new ToWptEteDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
      //   break;
      case DataBlockId.GpsCdi:
        datablock = new GpsCdiDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id, lnavIndex: this.ifdOptions.lnavIndex });
        break;
      case DataBlockId.TrackAngleError:
        datablock = new TrackAngleErrorDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id, lnavIndex: this.ifdOptions.lnavIndex });
        break;
      case DataBlockId.DesiredTrack:
        datablock = new DesiredTrackDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id, lnavIndex: this.ifdOptions.lnavIndex });
        break;
      case DataBlockId.CrossTrackDistance:
        datablock = new CrossTrackDistanceDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id, lnavIndex: this.ifdOptions.lnavIndex });
        break;
      case DataBlockId.NextDesiredTrack:
        datablock = new NextDtkDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id, lnavIndex: this.ifdOptions.lnavIndex });
        break;
      case DataBlockId.VerticalSpeedRequired:
        datablock = new VerticalSpeedRequiredDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id, vnavIndex: this.ifdOptions.vnavIndex });
        break;
      case DataBlockId.NavigationMode:
        datablock = new NavigationModeDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.ActiveGpsApproach:
        datablock = new ActiveGpsApproachDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          flightPlanStore: this.flightPlanStore
        });
        break;
      case DataBlockId.DecodedVlocIdentifier:
        if (this.ifdOptions.navIndex !== undefined) {
          datablock = new DecodedVlocIdentDatablock({
            bus: this.bus,
            location,
            position,
            datablockService: this,
            datablockId: id,
            vlocSource: this.vlocSource
          });
        }
        break;
      case DataBlockId.NearestAirport:
        datablock = new NearestAirportDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.AircraftPosition:
        datablock = new AircraftPositionDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.GpsAglAltitude:
        datablock = new GpsAglAltDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          altitudeUnit: this.unitSettingManager.altitudeUnits,
        });
        break;
      case DataBlockId.GroundSpeed:
        datablock = new GroundSpeedDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          speedUnit: this.unitSettingManager.speedUnits,
        });
        break;
      case DataBlockId.GroundTrack:
        datablock = new GroundTrackDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.WindVector:
        datablock = new WindVectorDatablock({
          bus: this.bus,
          location, position,
          datablockService: this,
          datablockId: id,
          dataProvider: this.dataProvider,
        });
        break;
      case DataBlockId.RadarAltitude:
        datablock = new RadarAltitudeDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          altitudeUnit: this.unitSettingManager.altitudeUnits,
        });
        break;
      case DataBlockId.TotalAirTemp:
        datablock = new TotalAirTempDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          temperatureUnits: this.unitSettingManager.temperatureUnits,
        });
        break;
      case DataBlockId.StaticAirTemp:
        datablock = new StaticAirTempDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          temperatureUnits: this.unitSettingManager.temperatureUnits,
        });
        break;
      case DataBlockId.LocalTime:
        datablock = new LocalTimeDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.UtcTime:
        datablock = new UtcTimeDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.FlightTimer:
        datablock = new FlightTimerDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          timerManager: this.timerManager
        });
        break;
      case DataBlockId.NumberOfAlerts:
        datablock = new NumberOfAlertsDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          alertManager: this.ifdCasAlertManager,
        });
        break;
      // case DataBlockId.UserProfile:
      //   datablock = new UserProfileDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
      //   break;
      case DataBlockId.FuelRemaining:
        datablock = new FuelRemainingDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          fuelUnits: this.unitSettingManager.fuelUnits,
        });
        break;
      case DataBlockId.FuelTimeRemaining:
        datablock = new FuelTimeRemainingDatablock({ bus: this.bus, location, position, datablockService: this, datablockId: id });
        break;
      case DataBlockId.FuelFlow:
        datablock = new FuelFlowDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          fuelFlowUnits: this.unitSettingManager.fuelFlowUnits,
        });
        break;
      case DataBlockId.FuelUsed:
        datablock = new FuelUsedDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          fuelUnits: this.unitSettingManager.fuelUnits,
        });
        break;
      case DataBlockId.FuelEconomy:
        datablock = new FuelEconomyDatablock({
          bus: this.bus,
          location,
          position,
          datablockService: this,
          datablockId: id,
          distanceUnits: this.unitSettingManager.distanceUnitsLarge,
          fuelFlowUnits: this.unitSettingManager.fuelFlowUnits,
        });
        break;

      default:
        console.warn(`Datablock ${id} not found or not implemented.`);
    }
    return datablock;
  }

  /**
   * Gets the latest saved custom preset from the settings or the default presets depending on the type given.
   * @param type The type of preset to get.
   * @returns The latest saved custom preset, the selected default preset or undefined if no valid preset is saved.
   */
  private getPreset(type: DatablockPresetType): DatablockPreset | undefined {
    if (type === DatablockPresetType.CustomSettings) {
      return this.parsePreset(this.datablockSettings.getSetting('latestCustomSettings').get());
    }
    return DefaultDatablockPresets[type];
  }

  /**
   * Loads a preset into the datablock slots
   * @param preset The preset to load.
   */
  protected loadPreset(preset: DatablockPreset): void {
    if (preset.leftSidebarSlots) {
      for (let i = 0; i < DatablockService.LEFT_SIDEBAR_SLOTS; i++) {
        this.replaceDatablock(ArrayUtils.peekAt(preset.leftSidebarSlots, i) ?? DataBlockId.Blank, DatablockSlotLocation.LeftSidebar, i, false);
      }
    }
    if (preset.rightSidebarSlots) {
      for (let i = 0; i < DatablockService.RIGHT_SIDEBAR_SLOTS; i++) {
        this.replaceDatablock(ArrayUtils.peekAt(preset.rightSidebarSlots, i) ?? DataBlockId.Blank, DatablockSlotLocation.RightSidebar, i, false);
      }
    }
    if (preset.topSidebarSlots) {
      for (let i = 0; i < DatablockService.TOP_BAR_SLOTS; i++) {
        this.replaceDatablock(ArrayUtils.peekAt(preset.topSidebarSlots, i) ?? DataBlockId.Blank, DatablockSlotLocation.TopBar, i, false);
      }
    }
  }

  /**
   * Saves the updated datablock slots to the settings.
   * Changes the selected preset to Custom since the user has made changes to the default preset.
   * Also changes the selected preset to Custom since the user has made changes to the default preset.
   */
  private savePresetChanges(): void {
    const updatedPreset: DatablockPreset = {
      leftSidebarSlots: this.getDatablockArrayForSidebar(DatablockSlotLocation.LeftSidebar),
      rightSidebarSlots: this.getDatablockArrayForSidebar(DatablockSlotLocation.RightSidebar),
      topSidebarSlots: this.getDatablockArrayForSidebar(DatablockSlotLocation.TopBar),
    };

    this.datablockSettings.getSetting('latestCustomSettings').set(JSON.stringify(updatedPreset));
    if (this._selectedPreset.get() !== DatablockPresetType.CustomSettings) {
      this.datablockSettings.getSetting('selectedPreset').set(DatablockPresetType.CustomSettings);
    }
  }

  /**
   * Creates an array subject with the specified length and all values set to blank datablocks.
   * @param length The length of the array subject.
   * @param location The location of the datablock bar.
   * @returns An array subject with the specified length and all values set to blank datablocks.
   */
  private createBlankDatablockArraySubject(length: number, location: DatablockSlotLocation): ArraySubject<Datablock> {
    const array: Datablock[] = [];
    for (let i = 0; i < length; i++) {
      const datablock = new BlankDatablock({ bus: this.bus, location, position: i, datablockService: this, datablockId: DataBlockId.Blank });
      array.push(datablock);
    }
    return ArraySubject.create(array);
  }

  /**
   * Parses a preset string from the datablock user settings into a DatablockPreset object.
   * @param presetString The preset string to parse.
   * @returns A DatablockPreset object parsed from the preset string. Returns undefined if the preset string is invalid.
   */
  private parsePreset(presetString: string): DatablockPreset | undefined {
    const preset = JSON.parse(presetString) as DatablockPreset;

    if (!preset.topSidebarSlots || !preset.leftSidebarSlots || !preset.rightSidebarSlots) {
      return undefined;
    }

    return preset;
  }

  /**
   * Retrieves an array of DataBlockIds for a specified sidebar location.
   * @param side - The location of the sidebar.
   * @returns An array of DataBlockId objects representing the datablocks configured for the specified sidebar location.
   */
  private getDatablockArrayForSidebar(side: DatablockSlotLocation): DataBlockId[] {
    const result: DataBlockId[] = [];
    let slots;
    let array: ArraySubject<Datablock>;

    switch (side) {
      case DatablockSlotLocation.LeftSidebar:
        slots = DatablockService.LEFT_SIDEBAR_SLOTS;
        array = this._leftDatablocks;
        break;
      case DatablockSlotLocation.RightSidebar:
        slots = DatablockService.RIGHT_SIDEBAR_SLOTS;
        array = this._rightDatablocks;
        break;
      case DatablockSlotLocation.TopBar:
      default:
        slots = DatablockService.TOP_BAR_SLOTS;
        array = this._topDatablocks;
        break;
    }

    for (let i = 0; i < slots; i++) {
      const id = array.get(i)?.getInfo()?.id;
      if (id) {
        result.push(id);
      }
    }

    return result;
  }

  /**
   * Checks whether there are any prohibiting factors for removing the datablock (i.e., replacing with Blank)
   * @param id The datablock id to be removed
   * @param location The location where the datablock would be removed
   * @param position The position within the sidebar where the datablock would be removed
   * @returns Whether the datablock can be removed
   */
  private isDatablockRemovable(id: DataBlockId, location: DatablockSlotLocation, position: number): boolean {
    if (id === DataBlockId.PrimaryComVloc) {
      return false;
    }

    if (id === DataBlockId.ComVlocStandby2) {
      return this.getDatablockAtPosition(location, position + 1)?.getInfo()?.id !== DataBlockId.ComVlocStandby3;
    }
    if (id === DataBlockId.ComVlocStandby3) {
      return this.getDatablockAtPosition(location, position + 1)?.getInfo()?.id !== DataBlockId.ComVlocStandby4;
    }
    return true;
  }
}

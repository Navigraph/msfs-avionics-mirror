import { AnnunciationType, EventBus, FacilityLoader, FlightPlanner, FSComponent } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from '../Charts/IfdChartsManager';
import { IfdMapPresetService } from '../Components/Map/IfdMapPresetService';
import { TouchTabHighlightColor } from '../Components/Tabs';
import { DatablockService } from '../Datablocks/DatablocksService';
import { IfdTuningControlsManager } from '../Events/IfdTuningControlsManager';
import { FlightPlanListManager, FlightPlanStore } from '../FlightPlan';
import { Fms } from '../Fms';
import { IfdOptions } from '../IfdOptions';
import { FmsHooksManager } from '../Navigation/FmsHooksManager';
import { IfdNearestContext } from '../Navigation/IfdNearestContext';
import { MapDataProvider } from '../Providers/Map/MapDataProvider';
import { IfdCasAlertManager } from '../Systems/Cas/IfdCasAlertManager';
import { TimerManager } from '../Systems/Timer/TimerManager';
import { TrafficSystem } from '../Systems/Traffic/TrafficSystem';
import { IfdDataProvider } from '../Utilities/IfdDataProvider';
import { IfdViewService } from '../ViewService';
import { AuxPage } from './AuxPage/AuxPage';
import { FmsPage } from './FmsPage/FmsPage';
import { FreqPage } from './FreqPage/FreqPage';
import { IfdPageName } from './IfdPage';
import { MapPage } from './MapPage/MapPage';
import { SvsPage } from './SvsPage/SvsPage';

/**
 * IfdPages class that registers all IFD page components.
 */
export class IfdPages {
  private static readonly CAS_ALERT_COLOUR_MAP: Record<AnnunciationType, TouchTabHighlightColor> = {
    [AnnunciationType.Warning]: 'red',
    [AnnunciationType.Caution]: 'yellow',
    [AnnunciationType.Advisory]: 'cyan',
    [AnnunciationType.SafeOp]: 'green',
  };

  /**
   * Register the IFD page components.
   * @param bus The event bus instance.
   * @param viewService The IFD view service instance.
   * @param fms The FMS instance.
   * @param trafficSystem The traffic system from which to retrieve traffic intruder data.
   * @param flightPlanStore The flight plan store instance.
   * @param flightPlanListManager The flight plan list manager instance.
   * @param flightPlanner The flight planner instance.
   * @param casAlertManager The CAS alert manager instance.
   * @param dataProvider The IfdDataProvider
   * @param ifdOptions The IfdOptions
   * @param facilityLoader The facility loader instance.
   * @param mapDataProvider The map data provider
   * @param tuningControlsManager The tuning control manager
   * @param ifdNearestContext The nearest context
   * @param timerManager The timer manager
   * @param datablockService The datablock service instance.
   * @param mapPresetService The map preset service instance.
   * @param fmsHooks The FMS hooks manager.
   * @param chartsManager The IFD charts manager
   */
  public static registerPages(
    bus: EventBus,
    viewService: IfdViewService,
    fms: Fms,
    trafficSystem: TrafficSystem | undefined,
    flightPlanStore: FlightPlanStore,
    flightPlanListManager: FlightPlanListManager,
    flightPlanner: FlightPlanner,
    casAlertManager: IfdCasAlertManager,
    dataProvider: IfdDataProvider,
    ifdOptions: IfdOptions,
    facilityLoader: FacilityLoader,
    mapDataProvider: MapDataProvider,
    tuningControlsManager: IfdTuningControlsManager,
    ifdNearestContext: IfdNearestContext,
    timerManager: TimerManager,
    datablockService: DatablockService,
    mapPresetService: IfdMapPresetService,
    fmsHooks: FmsHooksManager,
    chartsManager: IfdChartsManager
  ): void {
    if (ifdOptions.instrumentType.includes('IFD550')) {
      viewService.registerPage(
        IfdPageName.SVS,
        undefined,
        (pageRef) => (
          <SvsPage
            bus={bus}
            dataProvider={dataProvider}
            mapDataProvider={mapDataProvider}
            viewService={viewService}
            pageRef={pageRef}
            ifdOptions={ifdOptions}
            datablockService={datablockService}
          />
        ),
      );
    }

    viewService.registerPage(
      IfdPageName.FMS,
      [
        { title: 'FPL', isDefault: true },
        { title: 'INFO', },
        // { title: 'ROUTE', },
        { title: 'WPT', },
        { title: 'NRST' },
      ],
      (pageRef) => (
        <FmsPage
          bus={bus}
          ifdOptions={ifdOptions}
          viewService={viewService}
          pageRef={pageRef}
          fms={fms}
          store={flightPlanStore}
          listManager={flightPlanListManager}
          facLoader={facilityLoader}
          tuningControlsManager={tuningControlsManager}
          mapDataProvider={mapDataProvider}
          fmsHooks={fmsHooks}
          flightPlanner={flightPlanner}
          trafficSystem={trafficSystem}
          chartManager={chartsManager}
          nearestContext={ifdNearestContext}
        />
      ),
    );

    viewService.registerPage(
      IfdPageName.MAP,
      [
        // { title: 'TAWS' },
        { title: 'MAP', isDefault: true },
        { title: 'CHART' },
        ...(ifdOptions.enableWxRadar ? [{ title: 'RADAR' }] : []),
      ],
      (pageRef) => (
        <MapPage
          trafficSystem={trafficSystem}
          bus={bus}
          fms={fms}
          viewService={viewService}
          pageRef={pageRef}
          flightPlanStore={flightPlanStore}
          flightPlanner={flightPlanner}
          facLoader={facilityLoader}
          mapDataProvider={mapDataProvider}
          ifdOptions={ifdOptions}
          datablockService={datablockService}
          chartsManager={chartsManager}
        />
      ),
    );

    const alertTabColour = casAlertManager.highestActivePriority.map((p) => p !== undefined ? IfdPages.CAS_ALERT_COLOUR_MAP[p] : undefined);
    viewService.registerPage(
      IfdPageName.AUX,
      [
        { title: 'AUDIO' },
        { title: 'UTIL' },
        { title: 'SETUP' },
        { title: 'SYS', isDefault: true },
        { title: 'ALERT', highlightColor: alertTabColour },
      ],
      (pageRef) => (
        <AuxPage
          bus={bus}
          ifdOptions={ifdOptions}
          flightPlanStore={flightPlanStore}
          datablockService={datablockService}
          casAlertManager={casAlertManager}
          timerManager={timerManager}
          viewService={viewService}
          pageRef={pageRef}
          chartsManager={chartsManager}
          mapPresetService={mapPresetService}
          mapDataProvider={mapDataProvider}
          tuningControlsManager={tuningControlsManager}
        />
      ),
    );

    viewService.registerPage(
      IfdPageName.FREQ,
      undefined,
      (pageRef) => (
        <FreqPage
          bus={bus}
          tuningControlsManager={tuningControlsManager}
          flightPlanStore={flightPlanStore}
          casAlertManager={casAlertManager}
          viewService={viewService}
          pageRef={pageRef}
          nearestContext={ifdNearestContext}
        />
      ),
    );
  }
}

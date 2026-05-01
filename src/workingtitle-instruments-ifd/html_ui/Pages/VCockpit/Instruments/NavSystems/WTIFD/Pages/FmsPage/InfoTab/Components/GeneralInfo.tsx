import {
  AirportFacility, AstroMath, ClockEvents, ComponentProps, ConsumerValue, DateTimeFormatter, DebounceTimer, EventBus, Facility, FacilityLoader, FacilityType,
  FacilityUtils, FlightPlanner, FSComponent, ICAO, LifecycleComponent, MappedSubject, NodeReference, Subject, Subscribable, UnitType, Vec3Math, VNode
} from '@microsoft/msfs-sdk';

import { Fms } from '../../../../Fms';
import { IfdOptions } from '../../../../IfdOptions';
import { KeyboardInputType } from '../../../../Keyboard/KeyboardTypes';
import { MapContainer } from '../../../../Map/MapContainer';
import { MapSizes } from '../../../../Map/MapSizes';
import { MapDataProvider } from '../../../../Providers/Map/MapDataProvider';
import { UnitsUserSettings } from '../../../../Settings/UnitsUserSettings';
import { TrafficSystem } from '../../../../Systems/Traffic/TrafficSystem';
import { FacilityInfoUtils } from '../../../../Utilities/FacilityInfoUtils';
import { FormatUtils } from '../../../../Utilities/FormatUtils';
import { IfdViewService } from '../../../../ViewService';
import { InfoTabGroupId } from '../InfoTabIds';
import { DensityAltCalc } from './DensityAltCalc';
import { InfoGroup } from './InfoGroup';
import { InfoItem } from './InfoItem';

import './GeneralInfo.css';

/** The properties for the {@link GeneralInfo} component. */
interface GeneralInfoProps extends ComponentProps {
  /** An instance of the facility loader. */
  readonly facLoader: FacilityLoader;
  /** The fms instance */
  readonly fms: Fms;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** A instance of the traffic system */
  readonly trafficSystem?: TrafficSystem;
  /** The IFD instrument config.  */
  readonly ifdOptions: IfdOptions;
  /** An instance of the view service. */
  readonly viewService: IfdViewService;
  /** The InfoTab Facility  */
  readonly infoFacility: Subscribable<Facility | undefined>;
  /** An instance of the event bus. */
  readonly bus: EventBus;
  /** Opens the keyboard. */
  readonly openKeyboard: (
    smartPrefill: string,
    onAccept: (ident: string) => void,
    anchorEl?: HTMLElement,
    onValueChanged?: (value: string) => void,
    onClose?: () => void,
    inputType?: KeyboardInputType,
  ) => void;
  /** The group ID. */
  readonly groupId: InfoTabGroupId;
  /** The expanded group ID. */
  readonly expandedGroupId: Subscribable<InfoTabGroupId | null>;
  /** Sets the expanded group ID. */
  readonly setExpandedGroupId: (id: InfoTabGroupId | null) => void;
  /** Reference to the map parking div */
  readonly mapParkingRef: NodeReference<HTMLDivElement>;
  /** Whether this group is currently selected by knob navigation. */
  readonly isSelected: Subscribable<boolean>;
  /** Called when the group header is clicked. */
  readonly onHeaderClicked?: () => void;
}

/** The general info of the info tab */
export class GeneralInfo extends LifecycleComponent<GeneralInfoProps> {
  private readonly adoptTimer = new DebounceTimer();
  private static readonly vec3Cache = Vec3Math.create();

  private readonly selectedIndex = Subject.create(0);
  private readonly isExpanded = this.props.expandedGroupId
    .map((id) => id === this.props.groupId)
    .withLifecycle(this.defaultLifecycle);

  private readonly zuluTimeFormatter = DateTimeFormatter.create('{HH}:{mm}z');
  private readonly unitSettingManager = UnitsUserSettings.getManager(
    this.props.bus,
  );

  private readonly densityAltCalcRef = FSComponent.createRef<DensityAltCalc>();
  private readonly densityAltButtonRef =
    FSComponent.createRef<HTMLDivElement>();
  private readonly mapContainerRef = FSComponent.createRef<MapContainer>();
  private readonly facilityTypeRowRef = FSComponent.createRef<HTMLDivElement>();
  private readonly coordinatesRowRef = FSComponent.createRef<HTMLDivElement>();
  private readonly sunriseSunsetRowRef =
    FSComponent.createRef<HTMLDivElement>();
  private readonly densityAltRowRef = FSComponent.createRef<HTMLDivElement>();

  private readonly sunsetZuluTime = Subject.create('');
  private readonly sunriseZuluTime = Subject.create('');
  private readonly densityAltCalcHidden = Subject.create(true);

  private readonly simTimeMs = ConsumerValue.create(
    this.props.bus.getSubscriber<ClockEvents>().on('simTime'),
    0,
  ).withLifecycle(this.defaultLifecycle);
  private readonly facilityCoordinates = this.props.infoFacility
    .map((fac) => (fac ? FormatUtils.formatLatLon(fac.lat, fac.lon) : ''))
    .withLifecycle(this.defaultLifecycle);
  private readonly facilityType = this.props.infoFacility
    .map((fac) => FacilityInfoUtils.getFacilityDisplayText(fac))
    .withLifecycle(this.defaultLifecycle);
  private readonly facilityTypeHidden = this.facilityType
    .map((text) => (text ? false : true))
    .withLifecycle(this.defaultLifecycle);
  private readonly elevationFt = Subject.create(0);

  private readonly facilityElevation = MappedSubject.create(
    ([fac, altitudeUnit]) => {
      if (
        fac &&
        ICAO.getFacilityTypeFromValue(fac.icaoStruct) === FacilityType.Airport
      ) {
        const convertedElevation = UnitType.METER.convertTo(
          (fac as AirportFacility).altitude,
          altitudeUnit,
        ).toFixed(0);
        this.elevationFt.set(Number(convertedElevation));
        const unitString = altitudeUnit.equals(UnitType.FOOT) ? 'Ft' : 'm';
        return `${convertedElevation}${unitString}`;
      }
      return '';
    },
    this.props.infoFacility,
    this.unitSettingManager.altitudeUnits,
  ).withLifecycle(this.defaultLifecycle);

  private readonly facilityMagVar = this.props.infoFacility
    .map((fac) => {
      if (!fac) {
        return '';
      }

      // Trainer does not show MagVar for Intersections
      if (FacilityUtils.isFacilityType(fac, FacilityType.Intersection)) {
        return '';
      }

      // Force magnetic variation value into the domain of [-180, 180].
      const magVar = ((FacilityUtils.getMagVar(fac) + 540) % 360) - 180;
      return `${Math.abs(magVar).toFixed(1)}${magVar < 0 ? 'W' : 'E'}`;
    })
    .withLifecycle(this.defaultLifecycle);

  private readonly isNotAirportFacility = this.props.infoFacility
    .map((fac) =>
      fac
        ? ICAO.getFacilityTypeFromValue(fac.icaoStruct) !== FacilityType.Airport
        : true,
    )
    .withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.infoFacility
      .sub((fac) => {
        if (!fac) {
          return '';
        }
        if (
          ICAO.getFacilityTypeFromValue(fac.icaoStruct) !== FacilityType.Airport
        ) {
          return '';
        }

        const [, sunrise, sunset] = AstroMath.getSunriseAndSunsetTimes(
          fac,
          this.simTimeMs.get(),
          GeneralInfo.vec3Cache,
        );

        if (!isFinite(sunrise) || !isFinite(sunset)) {
          return '';
        }
        this.sunsetZuluTime.set(this.zuluTimeFormatter(sunset));
        this.sunriseZuluTime.set(this.zuluTimeFormatter(sunrise));
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.props.expandedGroupId
      .map((id) => id === this.props.groupId)
      .sub((expanded) => {
        const map = this.mapContainerRef.getOrDefault();

        if (!map) {
          return;
        }

        if (!expanded) {
          this.adoptTimer.clear();
          map.unhost();
          return;
        }

        // Defer adopt so DOM can unhide / apply layout first.
        this.adoptTimer.schedule(() => {
          map.host();

          const fac = this.props.infoFacility.get();

          if (fac) {
            map.centerOnFacility(fac);
          } else {
            map.clearExternalCenter();
          }
        }, 0);
      }, true)
      .withLifecycle(this.defaultLifecycle);

    // Internal selection validity
    this.isExpanded
      .sub((expanded) => {
        if (expanded) {
          this.ensureSelectionValid();
        }
      }, true)
      .withLifecycle(this.defaultLifecycle);

    this.props.infoFacility
      .sub(() => {
        this.ensureSelectionValid();
      }, true)
      .withLifecycle(this.defaultLifecycle);

    // Mouse selection
    this.facilityTypeRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onFacilityTypeRowClicked);
    this.coordinatesRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onCoordinatesRowClicked);
    this.sunriseSunsetRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onSunriseSunsetRowClicked);
    this.densityAltRowRef
      .getOrDefault()
      ?.addEventListener('mousedown', this.onDensityAltRowClicked);

    this.densityAltButtonRef
      .getOrDefault()
      ?.addEventListener('click', this.onDensityAltButtonClicked);
  }

  /**
   * Shows the density altitude calculator.
   */
  private showDensityAltCalc(): void {
    this.densityAltCalcHidden.set(false);
  }

  /**
   * Handles click on the density alt "chevron" button.
   */
  private readonly onDensityAltButtonClicked = (): void => {
    this.selectedIndex.set(3);
    this.showDensityAltCalc();
  };

  /**
   * Render collapsed summary node.
   * @returns Summary VNode.
   */
  private renderSummaryNode(): VNode {
    return (
      <div class={{ hidden: this.isNotAirportFacility, 'summary-label': true }}>
        <span class="title">Elevation </span>
        {this.facilityElevation}
      </div>
    );
  }

  /**
   * Gets whether the item at the given index is currently visible/selectable.
   * @param index The index of the item.
   * @returns Whether the item is visible/selectable.
   */
  private isItemVisible(index: number): boolean {
    const notAirport = this.isNotAirportFacility.get();

    if (index === 0) {
      return this.facilityTypeHidden.get() === false;
    }

    if (index === 1) {
      return true;
    }

    if (index === 2) {
      return notAirport === false;
    }

    if (index === 3) {
      return notAirport === false;
    }

    return false;
  }

  /**
   * Ensures selectedIndex points to a visible item.
   */
  private ensureSelectionValid(): void {
    let index = this.selectedIndex.get();

    if (this.isItemVisible(index)) {
      return;
    }

    if (this.isItemVisible(0)) {
      index = 0;
    } else if (this.isItemVisible(1)) {
      index = 1;
    } else if (this.isItemVisible(2)) {
      index = 2;
    } else if (this.isItemVisible(3)) {
      index = 3;
    } else {
      index = 0;
    }

    this.selectedIndex.set(index);
  }

  /**
   * Finds the next selectable index from a start index moving by delta (+1 / -1).
   * @param start The start index.
   * @param delta The direction to move in (+1 / -1).
   * @returns The next selectable index.
   */
  private findNextSelectableIndex(start: number, delta: number): number {
    const direction = delta > 0 ? 1 : -1;

    let next = start;

    for (let i = 0; i < 16; i++) {
      next = next + direction;

      if (next < 0) {
        next = 0;
      }

      if (next > 3) {
        next = 3;
      }

      if (this.isItemVisible(next)) {
        return next;
      }

      if (next === 0 || next === 3) {
        break;
      }
    }

    return start;
  }

  /**
   * Moves the selected inner item by the given delta.
   * Called by InfoTab only when this section is expanded and focused.
   * @param delta The delta to move by (+1 / -1).
   */
  public moveSelectionBy(delta: number): void {
    this.ensureSelectionValid();

    const current = this.selectedIndex.get();
    const next = this.findNextSelectableIndex(current, delta);

    if (next !== current) {
      this.selectedIndex.set(next);
    }
  }

  /**
   * Activates the current selection.
   * - density alt row opens calc
   * - otherwise collapses section
   */
  public activateSelection(): void {
    this.ensureSelectionValid();

    const index = this.selectedIndex.get();

    if (index === 3 && this.isItemVisible(3)) {
      this.showDensityAltCalc();
    } else {
      this.props.setExpandedGroupId(null);
    }
  }

  /**
   * Selects the given row index if visible.
   * @param index The row index to select.
   */
  private selectIndexIfVisible(index: number): void {
    if (this.isItemVisible(index)) {
      this.selectedIndex.set(index);
    }
  }

  private readonly onFacilityTypeRowClicked = (): void => {
    this.selectIndexIfVisible(0);
  };

  private readonly onCoordinatesRowClicked = (): void => {
    this.selectIndexIfVisible(1);
  };

  private readonly onSunriseSunsetRowClicked = (): void => {
    this.selectIndexIfVisible(2);
  };

  private readonly onDensityAltRowClicked = (): void => {
    this.selectIndexIfVisible(3);
  };

  /**
   * Gets whether the density alt calculator is currently visible.
   * @returns True when visible.
   */
  public isDensityAltCalcVisible(): boolean {
    return this.densityAltCalcHidden.get() === false;
  }

  /**
   * Hides the density alt calculator (same as CLR).
   */
  public hideDensityAltCalc(): void {
    this.densityAltCalcHidden.set(true);
    this.densityAltCalcRef.getOrDefault()?.hide();
  }

  /**
   * Moves selection inside the calculator.
   * @param delta Selection delta (+1 / -1).
   */
  public moveDensityAltCalcSelectionBy(delta: number): void {
    this.densityAltCalcRef.getOrDefault()?.moveSelectionBy(delta);
  }

  /**
   * Activates the currently selected calculator field.
   */
  public activateDensityAltCalcSelection(): void {
    this.densityAltCalcRef.getOrDefault()?.activateSelection();
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <InfoGroup
        label="General"
        summaryNode={this.renderSummaryNode.bind(this)}
        groupId={this.props.groupId}
        expandedGroupId={this.props.expandedGroupId}
        setExpandedGroupId={this.props.setExpandedGroupId}
        isSelected={this.props.isSelected}
        onHeaderClicked={this.props.onHeaderClicked}
      >
        <div class="general-info-section">
          <div class="column">
            <div ref={this.facilityTypeRowRef}>
              <InfoItem
                hidden={this.facilityTypeHidden}
                isSelected={this.selectedIndex
                  .map((i) => i === 0)
                  .withLifecycle(this.defaultLifecycle)}
              >
                {this.facilityType}
              </InfoItem>
            </div>

            <div ref={this.coordinatesRowRef}>
              <InfoItem
                isSelected={this.selectedIndex
                  .map((i) => i === 1)
                  .withLifecycle(this.defaultLifecycle)}
              >
                {this.facilityCoordinates}
                <div class={{ hidden: this.isNotAirportFacility }}>
                  <span class="title">Elevation: </span>
                  {this.facilityElevation}
                </div>
                <div
                  class={{
                    hidden: this.facilityMagVar
                      .map((v) => !v)
                      .withLifecycle(this.defaultLifecycle),
                  }}
                >
                  <span class="title">MagVar:</span>
                  {this.facilityMagVar}
                </div>
              </InfoItem>
            </div>

            <div ref={this.sunriseSunsetRowRef}>
              <InfoItem
                hidden={this.isNotAirportFacility}
                isSelected={this.selectedIndex
                  .map((i) => i === 2)
                  .withLifecycle(this.defaultLifecycle)}
              >
                <div>
                  <span class="title">Sunrise: </span>
                  {this.sunriseZuluTime}
                </div>
                <div>
                  <span class="title">Sunset: </span>
                  {this.sunsetZuluTime}
                </div>
              </InfoItem>
            </div>

            <div ref={this.densityAltRowRef}>
              <InfoItem
                hidden={this.isNotAirportFacility}
                class="density-calc"
                isSelected={this.selectedIndex
                  .map((i) => i === 3)
                  .withLifecycle(this.defaultLifecycle)}
              >
                <div>
                  <span class="title">Density Alt: </span>---
                </div>
                <div class="density-calc-button" ref={this.densityAltButtonRef}>
                  <img src="/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/chevron.png" />
                </div>
              </InfoItem>
            </div>
          </div>

          <div class="column map">
            <MapContainer
              bus={this.props.bus}
              trafficSystem={this.props.trafficSystem}
              facLoader={this.props.facLoader}
              viewService={this.props.viewService}
              flightPlanner={this.props.flightPlanner}
              mapDataProvider={this.props.mapDataProvider}
              ifdOptions={this.props.ifdOptions}
              ref={this.mapContainerRef}
              parkingRef={this.props.mapParkingRef}
              projectedSize={
                new Float64Array([
                  MapSizes.infoFacilityPreview.width,
                  MapSizes.infoFacilityPreview.height,
                ])
              }
              previewMode={true}
              fms={this.props.fms}
              class="general-info-map-container"
            />
          </div>
        </div>

        <DensityAltCalc
          ref={this.densityAltCalcRef}
          hidden={this.densityAltCalcHidden}
          openKeyboard={this.props.openKeyboard}
          elevationFt={this.elevationFt}
          unitSettingManager={this.unitSettingManager}
        />
      </InfoGroup>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.adoptTimer.clear();

    this.facilityTypeRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onFacilityTypeRowClicked);
    this.coordinatesRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onCoordinatesRowClicked);
    this.sunriseSunsetRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onSunriseSunsetRowClicked);
    this.densityAltRowRef
      .getOrDefault()
      ?.removeEventListener('mousedown', this.onDensityAltRowClicked);

    this.densityAltButtonRef
      .getOrDefault()
      ?.removeEventListener('click', this.onDensityAltButtonClicked);

    super.destroy();
  }
}

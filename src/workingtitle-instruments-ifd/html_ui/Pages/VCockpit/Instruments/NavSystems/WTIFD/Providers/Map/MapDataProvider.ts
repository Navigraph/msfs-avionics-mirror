import {
  AhrsEvents, APEvents, BitFlags, ConsumerSubject, EventBus, FlightPlanner, FlightPlannerEvents, GNSSEvents, Instrument, MagVar, MappedSubject, MapProjection,
  MapProjectionChangeType, MathUtils, NavMath, NumberFormatter, NumberUnitSubject, ReadonlyFloat64Array, Subject, Subscribable, UnitType, UserSettingManager
} from '@microsoft/msfs-sdk';

import { FlightPlanStore } from '../../FlightPlan';
import { Fms } from '../../Fms';
import { MapSystemCommon } from '../../Map/MapSystemCommon';
import { MapOrientationSettingMode, MapUserSettingTypes } from '../../Settings/MapUserSettings';
import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../Settings/UnitsUserSettings';
import { ExternalHeadingSystemEvents } from '../../Systems/ExternalHeadingSystem';
import { GnssNavigationState, GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';
import { IfdViewService } from '../../ViewService';

/** Provides data for the map overlays. */
export class MapDataProvider implements Instrument {
  public readonly trackHeadingGsThreshold = 30;

  private readonly sub = this.bus.getSubscriber<GnssReceiverEvents & ExternalHeadingSystemEvents>();

  // This data should only be used for "fixing" data e.g. the broken track data we get from the sim.
  private readonly fakeDataSub = this.bus.getSubscriber<AhrsEvents & GNSSEvents>();
  private readonly magVar = ConsumerSubject.create(this.fakeDataSub.on('magvar'), 0);
  private readonly rawHeadingTrue = ConsumerSubject.create(this.fakeDataSub.on('actual_hdg_deg_true'), 0);
  private readonly rawGroundSpeed = ConsumerSubject.create(this.fakeDataSub.on('ground_speed'), 0);

  protected readonly _targetProjectedOffsetY = Subject.create(0);
  public readonly targetProjectedOffsetY = this._targetProjectedOffsetY as Subscribable<number>;

  private readonly extHeadingMagSource = ConsumerSubject.create(this.sub.on('ext_hdg_actual_hdg_deg'), 0);
  private readonly extHeadingTrueSource = ConsumerSubject.create(this.sub.on('ext_hdg_actual_hdg_deg_true'), 0);
  private readonly extHeadingValid = ConsumerSubject.create(this.sub.on('ext_hdg_heading_data_valid'), false);

  private readonly _extHeadingMag = MappedSubject.create(
    ([hdg, valid]) => valid ? hdg : null,
    this.extHeadingMagSource,
    this.extHeadingValid,
  );
  /** The heading in degrees magnetic from the external heading source (if there is one), or null when invalid. */
  public readonly extHeadingMag: Subscribable<number | null> = this._extHeadingMag;
  private readonly extHeadingTrue = MappedSubject.create(
    ([hdg, valid]) => valid ? hdg : null,
    this.extHeadingTrueSource,
    this.extHeadingValid,
  );

  private readonly gnssNavState = ConsumerSubject.create(this.sub.on('gnss_navigation_state'), GnssNavigationState.Fault);

  private readonly gnssTrackTrueSource = ConsumerSubject.create(this.sub.on('gnss_track_true_deg'), null);
  private readonly gnssTrackTrue = Subject.create<number | null>(null);

  private readonly _gnssTrackMag = MappedSubject.create(
    ([trkTrue, magVar]) => trkTrue !== null ? MagVar.trueToMagnetic(trkTrue, magVar) : null,
    this.gnssTrackTrue,
    this.magVar,
  );
  /** The track in degrees magnetic from the GNSS, or null when invalid. */
  public readonly gnssTrackMag: Subscribable<number | null> = this._gnssTrackMag;

  /** When GS is below the threshold and the GNSS data is valid, we use raw heading to "fix" the track so it appears normal. */
  private readonly useHdgForTrack = MappedSubject.create(
    ([gnssState, rawGs]) => (gnssState === GnssNavigationState.SbasNav || gnssState === GnssNavigationState.FdeNav || gnssState === GnssNavigationState.BasicNav) &&
      rawGs < this.trackHeadingGsThreshold,
    this.gnssNavState,
    this.rawGroundSpeed,
  );

  private readonly bearingReference = UnitsUserSettings.getManager(this.bus).getSetting('unitsNavAngle');

  private readonly _selectedHeading = ConsumerSubject.create(
    this.bus.getSubscriber<APEvents>().on('ap_heading_selected'), 0);
  /** AP selected heading in degrees. */
  public readonly selectedHeading = this._selectedHeading as Subscribable<number>;

  private readonly flightPlanCalcSubject = ConsumerSubject.create(this.bus.getSubscriber<FlightPlannerEvents>().on('fplCalculated'), null);
  private readonly flightPlanActLegSubject = ConsumerSubject.create(this.bus.getSubscriber<FlightPlannerEvents>().on('fplActiveLegChange'), null);
  private readonly flightPlanDestSubject = ConsumerSubject.create(this.bus.getSubscriber<FlightPlannerEvents>().on('fplOriginDestChanged'), null);

  private desiredOrientation = this.settings.getSetting('mapOrientation').get();
  private readonly _mapOrientation = Subject.create(this.desiredOrientation);
  public readonly mapOrientation: Subscribable<MapOrientationSettingMode> = this._mapOrientation;

  // Initially available is only north up, until heading or track data sources become available
  private readonly _availableMapOrientations = [MapOrientationSettingMode.NorthUp];
  public readonly availableMapOrientations: ReadonlyArray<MapOrientationSettingMode> = this._availableMapOrientations;

  private readonly isHeadingValid = this.extHeadingTrue.map((v) => v !== null);
  private readonly isTrackValid = this.gnssTrackTrue.map((v) => v !== null);

  public readonly mapRange = this.settings.getSetting('mapRange');

  public readonly mapVorsDisplay = this.settings.getSetting('mapVors');
  public readonly mapNdbsDisplay = this.settings.getSetting('mapNdbs');
  public readonly mapIntersectionsDisplay = this.settings.getSetting('mapIntersections');
  public readonly mapAirportsToweredDisplay = this.settings.getSetting('mapAirportsTowered');
  public readonly mapAirportsNonToweredDisplay = this.settings.getSetting('mapAirportsNonTowered');

  public readonly landDetailLevel = this.settings.getSetting('landDeclutter');

  public readonly navDetailLevel = this.settings.getSetting('navDeclutter');

  /** The compass up direction in degrees relative to true north or magnetic north depending on bearing reference setting. */
  public readonly _compassUpDirection = Subject.create(0);
  public readonly compassUpDirection: Subscribable<number> = this._compassUpDirection;

  private readonly _trackLineRotation = Subject.create<number | null>(null);
  /** Track line rotation relative to the compass up direction in degrees. */
  public readonly trackLineRotation: Subscribable<number | null> = this._trackLineRotation;

  private readonly _headingPointerRotation = Subject.create<number | null>(null);
  /** Heading pointer rotation relative to the compass up direction in degrees. */
  public readonly headingPointerRotation: Subscribable<number | null> = this._headingPointerRotation;

  private readonly _displayHeading = Subject.create<number | null>(null);
  /** The heading to be displayed in the heading box, in degrees. */
  public readonly displayHeading: Subscribable<number | null> = this._displayHeading;

  private readonly _displayHeadingIsHeading = Subject.create(true);
  /** Whether the display heading is a heading (rather than a track), for the TRK flag next to the display. */
  public readonly displayHeadingIsHeading: Subscribable<boolean> = this._displayHeadingIsHeading;

  private readonly _displayHeadingIsMagnetic = Subject.create(true);
  /** Whether the display heading is magnetic north referenced, for the TRU flag next to the display. */
  public readonly displayHeadingIsMagnetic: Subscribable<boolean> = this._displayHeadingIsMagnetic;

  // --- Internal pipes/subscriptions used to do the routing by pause/resume ---
  private readonly hdgMagToDisplayHeading = this._extHeadingMag.pipe(this._displayHeading, (v) => v !== null ? MathUtils.round(v) : v, true);
  private readonly hdgTrueToDisplayHeading = this.extHeadingTrue.pipe(this._displayHeading, (v) => v !== null ? MathUtils.round(v) : v, true);
  private readonly trkMagToDisplayHeading = this._gnssTrackMag.pipe(this._displayHeading, (v) => v !== null ? MathUtils.round(v) : v, true);
  private readonly trkTrueToDisplayHeading = this.gnssTrackTrue.pipe(this._displayHeading, (v) => v !== null ? MathUtils.round(v) : v, true);

  private readonly gnssTrackTruePipe = this.gnssTrackTrueSource.pipe(this.gnssTrackTrue, true);
  private readonly rawHdgTrueToTrackPipe = this.rawHeadingTrue.pipe(this.gnssTrackTrue, true);

  private readonly hdgTrueToCompassOrientationPipe = this.extHeadingTrue.pipe(this._compassUpDirection, (v) => v === null ? 0 : MathUtils.round(v, 0.1), true);
  private readonly trkTrueToCompassOrientationPipe = this.gnssTrackTrue.pipe(this._compassUpDirection, (v) => v === null ? 0 : MathUtils.round(v, 0.1), true);
  private readonly hdgMagToCompassOrientationPipe = this._extHeadingMag.pipe(this._compassUpDirection, (v) => v === null ? 0 : MathUtils.round(v, 0.1), true);
  private readonly trkMagToCompassOrientationPipe = this._gnssTrackMag.pipe(this._compassUpDirection, (v) => v === null ? 0 : MathUtils.round(v, 0.1), true);
  private readonly magVarToCompassOrientationPipe = this.magVar.pipe(this._compassUpDirection, (v) => NavMath.normalizeHeading(-MathUtils.round(v, 0.1)), true);

  private previewPrevOrientation: MapOrientationSettingMode | null = null;
  /**
   * Format the range depending on value
   * @param v range value number
   * @returns NumberFormatter
   */
  public readonly rangeFormatter = (v: number): string => {
    const formatter =
      v < 1
        ? NumberFormatter.create({ precision: 0.01, maxDigits: 3, forceDecimalZeroes: true })
        : v <= 10
          ? NumberFormatter.create({ precision: 0.1, maxDigits: 3, forceDecimalZeroes: false })
          : NumberFormatter.create({ precision: 1, maxDigits: 3, forceDecimalZeroes: false });

    return formatter(v);
  };
  public readonly rangeActive = Subject.create<boolean>(false);
  public readonly rangeNumber = this.mapRange.map(this.rangeFormatter);
  public readonly halfRangeNumber = this.mapRange.map(x => this.rangeFormatter(x / 2));
  public readonly rangeNumberWithUnit = NumberUnitSubject.create(UnitType.NMILE.createNumber(Number(this.mapRange)));
  public readonly halfRangeNumberWithUnit = NumberUnitSubject.create(UnitType.NMILE.createNumber(Number(this.halfRangeNumber)));

  public readonly airplaneIconSize = Subject.create(50);
  public readonly datablockAirplaneIconSize = Subject.create(30);

  /** Pipe the current view's sidebar state into this subject, but cleanup after on pause. */
  public readonly isSidebarVisible = Subject.create(false);
  public readonly northUpCompassRadius = this.isSidebarVisible.map((isVisible) => isVisible ? MapSystemCommon.northUpCompassRadiusSidebar : MapSystemCommon.northUpCompassRadius);

  // FIXME rework
  public readonly desiredTrackRotation = MappedSubject.create(
    ([bearingReference]): number => {
      const activeLeg = this.flightPlanStore.activeLeg.get();
      let heading = -1;
      if (activeLeg) {
        const flightPlan = this.fms.getFlightPlan();
        const leg = flightPlan.tryGetLeg(flightPlan.getLegIndexFromLeg(activeLeg));
        if (leg?.calculated) {
          const initialDtk = leg.calculated.initialDtk;

          switch (bearingReference) {
            case UnitsNavAngleSettingMode.Magnetic:
              heading = initialDtk ?? -1;
              break;
            case UnitsNavAngleSettingMode.True:
            default:
              heading = initialDtk !== undefined ? MagVar.magneticToTrue(initialDtk, leg.calculated.courseMagVar) : -1;
              break;
          }
        }
      }
      return heading;
    },
    this.bearingReference,
    this.flightPlanCalcSubject, this.flightPlanActLegSubject, this.flightPlanDestSubject
  );

  private readonly _projectedSizeOverride = Subject.create<ReadonlyFloat64Array | null>(null);

  /** A projected-size override provided by the current map host. When null, the map uses its default sizing logic. */
  public readonly projectedSizeOverride = this._projectedSizeOverride as Subscribable<ReadonlyFloat64Array | null>;

  /**
   * Sets a projected-size override to be used by the map system.
   * @param size The projected size as [width, height] or null to clear.
   */
  public setProjectedSizeOverride(size: ReadonlyFloat64Array | null): void {
    this._projectedSizeOverride.set(size);
  }

  private readonly _previewMode = Subject.create(false);

  /** Whether the map is in "preview mode" (no pan, no zoom, no auto-center). */
  public readonly previewMode: Subscribable<boolean> = this._previewMode;

  /**
   * Sets preview mode state.
   * @param enabled Whether preview mode should be enabled.
   */
  public setPreviewMode(enabled: boolean): void {
    this._previewMode.set(enabled);
  }

  /**
   * Creates a new data provider.
   * @param bus The event bus.
   * @param fpl FlightPlanner instance
   * @param fms Fms instance
   * @param flightPlanStore FlightPlanStore instance
   * @param viewService IfdViewService instance
   * @param settings a user settings instance
   */
  public constructor(
    protected readonly bus: EventBus,
    protected readonly fpl: FlightPlanner,
    protected readonly fms: Fms,
    protected readonly flightPlanStore: FlightPlanStore,
    protected readonly viewService: IfdViewService,
    public readonly settings: UserSettingManager<MapUserSettingTypes>, // FIXME should not be public!
  ) { }

  /** @inheritdoc */
  public init(): void {
    // Little hack to fix up bad track at low groundspeed.
    this.useHdgForTrack.sub((useHdg) => {
      if (useHdg) {
        this.gnssTrackTruePipe.pause();
        this.rawHdgTrueToTrackPipe.resume(true);
      } else {
        this.rawHdgTrueToTrackPipe.pause();
        this.gnssTrackTruePipe.resume(true);
      }
    }, true);

    this.isHeadingValid.sub((isValid) => {
      // always lives at index 1 if it exists
      if (isValid) {
        this._availableMapOrientations.splice(1, 0, MapOrientationSettingMode.HeadingUp);
      } else {
        if (this._availableMapOrientations[1] === MapOrientationSettingMode.HeadingUp) {
          this._availableMapOrientations.splice(1, 1);
        }
      }
    }, true);

    this.isTrackValid.sub((isValid) => {
      // can be index 1 or 2
      if (isValid) {
        this._availableMapOrientations.push(MapOrientationSettingMode.TrackUp);
      } else {
        if (this._availableMapOrientations[1] === MapOrientationSettingMode.TrackUp) {
          this._availableMapOrientations.splice(1, 1);
        } else if (this._availableMapOrientations[2] === MapOrientationSettingMode.TrackUp) {
          this._availableMapOrientations.splice(2, 1);
        }
      }
    }, true);

    // compass orientation
    MappedSubject.create(
      this._mapOrientation,
      this.bearingReference,
    ).sub(([actualMapOrientation, bearingReference]) => {
      if (bearingReference === UnitsNavAngleSettingMode.True) {
        this.hdgMagToCompassOrientationPipe.pause();
        this.trkMagToCompassOrientationPipe.pause();
        this.magVarToCompassOrientationPipe.pause();

        switch (actualMapOrientation) {
          case MapOrientationSettingMode.HeadingUp:
            this.trkTrueToCompassOrientationPipe.pause();
            this.hdgTrueToCompassOrientationPipe.resume(true);
            break;
          case MapOrientationSettingMode.TrackUp:
            this.hdgTrueToCompassOrientationPipe.pause();
            this.trkTrueToCompassOrientationPipe.resume(true);
            break;
          case MapOrientationSettingMode.NorthUp:
            this.hdgTrueToCompassOrientationPipe.pause();
            this.trkTrueToCompassOrientationPipe.pause();
            this._compassUpDirection.set(0);
            break;
        }
      } else {
        this.hdgTrueToCompassOrientationPipe.pause();
        this.trkTrueToCompassOrientationPipe.pause();

        switch (actualMapOrientation) {
          case MapOrientationSettingMode.HeadingUp:
            this.trkMagToCompassOrientationPipe.pause();
            this.magVarToCompassOrientationPipe.pause();
            this.hdgMagToCompassOrientationPipe.resume(true);
            break;
          case MapOrientationSettingMode.TrackUp:
            this.hdgMagToCompassOrientationPipe.pause();
            this.magVarToCompassOrientationPipe.pause();
            this.trkMagToCompassOrientationPipe.resume(true);
            break;
          case MapOrientationSettingMode.NorthUp:
            this.hdgMagToCompassOrientationPipe.pause();
            this.trkMagToCompassOrientationPipe.pause();
            this.magVarToCompassOrientationPipe.resume(true);
            break;
        }
      }
    }, true);

    // heading box display heading
    MappedSubject.create(
      this.settings.getSetting('mapOrientation'),
      this._mapOrientation,
      this.bearingReference,
      this.isHeadingValid,
      this.isTrackValid,
    ).sub(([mapOrientationSetting, actualMapOrientation, bearingReference, isHeadingValid, isTrackValid]) => {
      const displayTrack = !isHeadingValid || (
        isTrackValid &&
        (
          actualMapOrientation === MapOrientationSettingMode.TrackUp ||
          (actualMapOrientation === MapOrientationSettingMode.NorthUp && mapOrientationSetting === MapOrientationSettingMode.TrackUp)
        )
      );
      const displayTrue = bearingReference === UnitsNavAngleSettingMode.True;

      if (displayTrue) {
        this.hdgMagToDisplayHeading.pause();
        this.trkMagToDisplayHeading.pause();

        if (displayTrack) {
          this.hdgTrueToDisplayHeading.pause();
          this.trkTrueToDisplayHeading.resume(true);
        } else {
          this.trkTrueToDisplayHeading.pause();
          this.hdgTrueToDisplayHeading.resume(true);
        }
      } else { // Magnetic
        this.hdgTrueToDisplayHeading.pause();
        this.trkTrueToDisplayHeading.pause();

        if (displayTrack) {
          this.hdgMagToDisplayHeading.pause();
          this.trkMagToDisplayHeading.resume(true);
        } else {
          this.trkMagToDisplayHeading.pause();
          this.hdgMagToDisplayHeading.resume(true);
        }
      }

      this._displayHeadingIsHeading.set(!displayTrack);
      this._displayHeadingIsMagnetic.set(!displayTrue);
    }, true);

    // If the user changes the setting on the page we should pick that up.
    this.settings.getSetting('mapOrientation').sub((v) => this.desiredOrientation = v);

    // When the map is in the preview mode, force north up orientation.
    this._previewMode.sub((enabled) => {
      const orientation = this.settings.getSetting('mapOrientation');

      if (enabled) {
        if (this.previewPrevOrientation === null) {
          this.previewPrevOrientation = orientation.get();
        }
        orientation.set(MapOrientationSettingMode.NorthUp);
      } else {
        if (this.previewPrevOrientation !== null) {
          orientation.set(this.previewPrevOrientation);
          this.previewPrevOrientation = null;
        }
      }
    }, true);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const isHeadingValid = this.isHeadingValid.get();
    const isTrackValid = this.isTrackValid.get();
    let actualOrientation = this.desiredOrientation;

    if (actualOrientation === MapOrientationSettingMode.HeadingUp && !isHeadingValid) {
      actualOrientation = MapOrientationSettingMode.TrackUp;
    }
    if (actualOrientation === MapOrientationSettingMode.TrackUp && !isTrackValid) {
      if (isHeadingValid) {
        actualOrientation = MapOrientationSettingMode.HeadingUp;
      } else {
        actualOrientation = MapOrientationSettingMode.NorthUp;
      }
    }

    this._mapOrientation.set(actualOrientation);

    const compassUpDirection = this._compassUpDirection.get();
    if (this.bearingReference.get() === UnitsNavAngleSettingMode.True) {
      const track = this.gnssTrackTrue.get();
      this._trackLineRotation.set(track !== null ? NavMath.diffAngle(compassUpDirection, track) : null);

      const heading = this.extHeadingTrue.get();
      this._headingPointerRotation.set(heading !== null ? NavMath.diffAngle(compassUpDirection, heading) : null);
    } else { // Magnetic
      const track = this._gnssTrackMag.get();
      this._trackLineRotation.set(track !== null ? NavMath.diffAngle(compassUpDirection, track) : null);

      const heading = this._extHeadingMag.get();
      this._headingPointerRotation.set(heading !== null ? NavMath.diffAngle(compassUpDirection, heading) : null);
    }
  }

  /**
   * Tries to select the next available map orientation.
   */
  public trySelectNextOrientation(): void {
    const current = this._mapOrientation.get();
    const newIndex = (this._availableMapOrientations.indexOf(current) + 1) % this._availableMapOrientations.length;
    this.desiredOrientation = this._availableMapOrientations[newIndex];
    // will change on the next update, after data checks
  }

  /**
   * Set the map projection once map system is created.
   * @param mapProjection The map projection.
   */
  public initMapProjection(mapProjection: MapProjection): void {
    this._targetProjectedOffsetY.set(mapProjection.getTargetProjectedOffset()[1]);

    mapProjection.addChangeListener((projection, changeFlags) => {
      if (BitFlags.isAny(changeFlags, MapProjectionChangeType.TargetProjected)) {
        this._targetProjectedOffsetY.set(projection.getTargetProjectedOffset()[1]);
      }
    });

    this.rangeNumber.sub((v) => {
      this.rangeNumberWithUnit.set(UnitType.NMILE.createNumber(Number(v)));
      this.halfRangeNumberWithUnit.set(UnitType.NMILE.createNumber(Number(v) / 2));
    }, true);
  }
}

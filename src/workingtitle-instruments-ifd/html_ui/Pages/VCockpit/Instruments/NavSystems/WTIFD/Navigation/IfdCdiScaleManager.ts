import {
  BitFlags, EventBus, FixTypeFlags, FlightPathUtils, FlightPlanner, FlightPlanSegmentType, GameStateProvider, GeoCircle, GeoPoint, Instrument, LegDefinition, LNavUtils,
  MathUtils, NavMath, NearestContext, RegisteredSimVarUtils, RnavTypeFlags, SimVarValueType, Subject, Subscribable, UnitType, Vec3Math, Wait
} from '@microsoft/msfs-sdk';

import { FmsFplLegUserDataKey } from '../Fms';
import { FmsPositionSystemEvents } from '../Systems/FmsPositionSystem';
import { IfdCdiScaleLabel, LNavDataEvents } from './LNavDataEvents';

/** Manages the IFD CDI scaling for GPS mode through different flight areas. */
export class IfdCdiScaleManager implements Instrument {
  private static readonly LPV_FAF_WIDTH = 0.3;
  private static readonly LPV_MAP_WIDTH = UnitType.NMILE.convertFrom(350, UnitType.FOOT);
  private static readonly LPV_SCALE_QUANTUM = UnitType.NMILE.convertFrom(10, UnitType.FOOT);

  private static readonly geoPointCache = [new GeoPoint(NaN, NaN), new GeoPoint(NaN, NaN)];

  private isInit = false;

  private readonly lnavPublisher = this.bus.getPublisher<LNavDataEvents>();

  private readonly cdiScaleTopic: keyof LNavDataEvents = `lnavdata_cdi_scale${LNavUtils.getEventBusTopicSuffix(this.lnavIndex)}`;
  private readonly cdiScaleLabelTopic: keyof LNavDataEvents = `lnavdata_cdi_scale_label${LNavUtils.getEventBusTopicSuffix(this.lnavIndex)}`;

  /** CDI scale type depending on flight area/mode. */
  private readonly _cdiScaleLabel = Subject.create(IfdCdiScaleLabel.Terminal);
  /** CDI scale type depending on flight area/mode. */
  public readonly cdiScaleLabel: Subscribable<IfdCdiScaleLabel> = this._cdiScaleLabel;
  /** CDI scale in nautical miles. */
  private readonly _cdiScale = Subject.create(this.getCdiScale(IfdCdiScaleLabel.Enroute));
  /** CDI scale in nautical miles. */
  public readonly cdiScale: Subscribable<number> = this._cdiScale;

  private readonly ifdCdiScaleOutputVar = RegisteredSimVarUtils.create(`L:1:WT_IFD_${this.ifdAlias}_CDI_SCALE`, SimVarValueType.Number);
  private readonly ifdCdiScaleLabelOutputVar = RegisteredSimVarUtils.create(`L:1:WT_IFD_${this.ifdAlias}_CDI_SCALE_LABEL`, SimVarValueType.Enum);

  private readonly lpvBeamCircle = new GeoCircle(Vec3Math.create(), 0);
  private readonly acPosition = new GeoPoint(NaN, NaN);

  /**
   * Constructs a new instance.
   * @param bus The instrument event bus.
   * @param flightPlanner The flight planner to use.
   * @param ifdAlias The alias/id of this IFD.
   * @param lnavIndex The LNAV index to use.
   */
  constructor(private readonly bus: EventBus, private readonly flightPlanner: FlightPlanner, private readonly ifdAlias: string | number, private readonly lnavIndex: number) { }

  /** @inheritdoc */
  public init(): void {
    const sub = this.bus.getSubscriber<FmsPositionSystemEvents>();

    sub.on('fms_pos_position_1').handle((v) => this.acPosition.set(v.lat, v.long));

    Wait.awaitSubscribable(GameStateProvider.get(), (s) => s === GameState.ingame, true).then(() => {
      // When we spawn, we need to come up with the correct scaling as if we'd done a flight up to this point.
      if (SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) === 0) {
        this._cdiScaleLabel.set(IfdCdiScaleLabel.Enroute);
      }

      // Wait a while after the nearest context is initialised so it can find any airports near us.
      // This avoids incorrectly switching to oceanic mode.
      NearestContext.onInitialized(() => {
        Wait.awaitFrames(25).then(() => this.isInit = true);
      });
    });

    this._cdiScaleLabel.sub((v) => {
      this.ifdCdiScaleLabelOutputVar.set(v);
      this.lnavPublisher.pub(this.cdiScaleLabelTopic, v, false, true);
      this._cdiScale.set(this.getCdiScale(v));
    }, true);

    this._cdiScale.sub((v) => {
      this.ifdCdiScaleOutputVar.set(v);
      this.lnavPublisher.pub(this.cdiScaleTopic, v, false, true);
    }, true);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isInit) {
      return;
    }

    const nearestContect = NearestContext.getInstance();
    if (nearestContect.airports.length < 1) {
      this._cdiScaleLabel.set(IfdCdiScaleLabel.Oceanic);
      return;
    }

    if (!this.flightPlanner.hasActiveFlightPlan()) {
      this._cdiScaleLabel.set(IfdCdiScaleLabel.Enroute);
      return;
    }

    const flightPlan = this.flightPlanner.getActiveFlightPlan();
    const activeSegmentIndex = flightPlan.getSegmentIndex(flightPlan.activeLateralLeg);
    if (activeSegmentIndex < 0) {
      this._cdiScaleLabel.set(IfdCdiScaleLabel.Enroute);
      return;
    }
    const activeSegment = flightPlan.getSegment(activeSegmentIndex);
    const activeLegSegmentIndex = flightPlan.getSegmentLegIndex(flightPlan.activeLateralLeg);

    if (activeSegment.segmentType === FlightPlanSegmentType.Approach) {
      this._cdiScaleLabel.set(IfdCdiScaleLabel.Approach);
    } else if (activeSegment.segmentType === FlightPlanSegmentType.MissedApproach) {
      // The first leg of the missed approach retains approach scaling if within 3° of the final approach
      if (activeLegSegmentIndex === 0) {
        let finalApproachLeg: LegDefinition | null = null;
        for (let i = activeSegment.offset - 1; i >= 0; i--) {
          const leg = flightPlan.tryGetLeg(i);
          if (!leg) {
            break;
          }
          const segmentType = flightPlan.getSegmentFromLeg(leg)?.segmentType;
          if (segmentType === FlightPlanSegmentType.Approach) {
            finalApproachLeg = leg;
            break;
          } else if (segmentType !== FlightPlanSegmentType.Destination) {
            break;
          }
        }

        const activeLeg = activeSegment.legs[activeLegSegmentIndex];
        if (
          finalApproachLeg !== null &&
          activeLeg.calculated?.initialDtk !== undefined && finalApproachLeg.calculated?.initialDtk !== undefined &&
          Math.abs(NavMath.diffAngle(finalApproachLeg.calculated.initialDtk, activeLeg.calculated.initialDtk)) <= 3
        ) {
          this._cdiScaleLabel.set(IfdCdiScaleLabel.Approach);
        } else {
          this._cdiScaleLabel.set(IfdCdiScaleLabel.Terminal);
        }
      } else {
        this._cdiScaleLabel.set(IfdCdiScaleLabel.Terminal);
      }
    } else if (activeSegment.segmentType === FlightPlanSegmentType.Departure || activeSegment.segmentType === FlightPlanSegmentType.Arrival) {
      this._cdiScaleLabel.set(IfdCdiScaleLabel.Terminal);
    }

    if (this.cdiScaleLabel.get() === IfdCdiScaleLabel.Approach) {
      // we need to constantly update the CDI scale for some approach types
      this._cdiScale.set(this.getCdiScale(IfdCdiScaleLabel.Approach));
    }
  }

  /**
   * Gets the CDI scale for a CDI scale type.
   * @param cdiScaleType The CDI scale type.
   * @returns The CDI scale in nautical miles.
   */
  private getCdiScale(cdiScaleType: IfdCdiScaleLabel): number {
    switch (cdiScaleType) {
      case IfdCdiScaleLabel.Oceanic:
        return 4;
      case IfdCdiScaleLabel.Enroute:
        return 2;
      case IfdCdiScaleLabel.Terminal:
        return 1;
      default: // Approach
        break;
    }

    // The approach scaling depends on FAF geometry... It's the smaller of 0.3 NM, or 2° at the FAF.
    // Note also that the IFD can have multiple approaches in the plan, so we need to allow for that.

    if (!this.flightPlanner.hasActiveFlightPlan()) {
      return 0.3;
    }
    const flightPlan = this.flightPlanner.getActiveFlightPlan();
    const activeSegmentIndex = flightPlan.getSegmentIndex(flightPlan.activeLateralLeg);
    let nextApproachSegmentIndex = -1;
    for (let i = activeSegmentIndex; i < flightPlan.segmentCount; i++) {
      const segment = flightPlan.getSegment(i);
      if (segment.segmentType === FlightPlanSegmentType.Approach) {
        nextApproachSegmentIndex = i;
        break;
      }
    }
    if (nextApproachSegmentIndex < 0) {
      return 0.3;
    }

    const nextApproachSegment = flightPlan.getSegment(nextApproachSegmentIndex);
    const faf = nextApproachSegment.legs.find((v) => BitFlags.isAny(v.leg.fixTypeFlags, FixTypeFlags.FAF));
    const map = nextApproachSegment.legs.find((v) => BitFlags.isAny(v.leg.fixTypeFlags, FixTypeFlags.MAP));
    if (!faf || !map || faf.calculated?.cumulativeDistance === undefined || map.calculated?.cumulativeDistance === undefined) {
      return 0.3;
    }

    // For LPV, lerp from 0.3 NM at FAF to 350 feet at MAP
    const isLpOrLpv = BitFlags.isAny(faf.userData[FmsFplLegUserDataKey.ApproachTypeFlags] ?? 0, RnavTypeFlags.LP | RnavTypeFlags.LPV);
    if (isLpOrLpv) {
      const fafLocation = IfdCdiScaleManager.geoPointCache[0].set(faf.calculated.endLat ?? NaN, faf.calculated.endLon ?? NaN);
      const mapLocation = IfdCdiScaleManager.geoPointCache[1].set(map.calculated.endLat ?? NaN, map.calculated.endLon ?? NaN);
      this.lpvBeamCircle.setAsGreatCircle(fafLocation, mapLocation);

      const normalisedDistance = FlightPathUtils.getAlongArcNormalizedDistance(this.lpvBeamCircle, fafLocation, mapLocation, this.acPosition);

      if (!isFinite(normalisedDistance)) {
        return 0.3;
      }

      return MathUtils.round(
        MathUtils.lerp(normalisedDistance, 0, 1, IfdCdiScaleManager.LPV_FAF_WIDTH, IfdCdiScaleManager.LPV_MAP_WIDTH, true, true),
        IfdCdiScaleManager.LPV_SCALE_QUANTUM,
      );
    }

    const fafWidthMetres = Math.tan(2 * Avionics.Utils.DEG2RAD) * (map.calculated.cumulativeDistance - faf.calculated.cumulativeDistance);
    if (fafWidthMetres > 0) {
      return Math.min(0.3, MathUtils.round(UnitType.NMILE.convertFrom(fafWidthMetres, UnitType.METER), 0.01));
    }
    return 0.3;
  }
}

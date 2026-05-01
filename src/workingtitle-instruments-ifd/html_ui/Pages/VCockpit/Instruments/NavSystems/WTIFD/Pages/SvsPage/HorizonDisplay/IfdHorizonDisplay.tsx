import {
  ArraySubject, ClockEvents, ComponentProps, ConsumerSubject, EventBus, FSComponent, GeoPoint, HorizonComponent, HorizonProjection, HorizonSharedCanvasLayer,
  LifecycleComponent, LNavEvents, LNavUtils, MappedSubject, MathUtils, Subject, Subscribable, SubscribableMapFunctions, UnitType, UserSettingManager, Vec2Math,
  Vec2Subject, VNavEvents, VNavPathMode, VNavUtils, VNode
} from '@microsoft/msfs-sdk';

import { IfdDeviationIndicator } from '../../../Components/DeviationIndicator/IfdDeviationIndicator';
import { IfdOptions } from '../../../IfdOptions';
import { IfdApproachEvents } from '../../../Navigation/IfdApproachManager';
import { IfdCdiScaleLabel, LNavDataEvents } from '../../../Navigation/LNavDataEvents';
import { IfdApproachNavModes } from '../../../Navigation/Sources/IfdNavSources';
import { IfdVNavDataEvents } from '../../../Navigation/Vnav/IfdVnavDataEvents';
import { IfdVerticalDeviationScale } from '../../../Navigation/Vnav/IfdVnavTypes';
import { AdiHdiSettings, SvsUserSettingTypes } from '../../../Settings/SvsUserSettings';
import { UnitsNavAngleSettingMode, UnitsUserSettings } from '../../../Settings/UnitsUserSettings';
import { ArsSystemEvents } from '../../../Systems/ArsSystem';
import { GnssReceiverEvents } from '../../../Systems/Gnss/GnssTypes';
import { IfdAircraftReferenceSymbol } from '../AircraftReferenceSymbol/IfdAircraftReferenceSymbol';
import { IfdBankRollTickMarks } from '../BankRollTickMarks/IfdBankRollTickMarks';
import { CdiScaleLabel } from '../CdiScaleLabel';
import { IfdSvsController } from '../IfdSvsController';
import { IfdSlipSkidIndicator } from '../SlipSkidIndicator/IfdSlipSkidIndicator';
import { IfdTotalVelocityVector } from '../TotalVelocityVector/IfdTotalVelocityVector';
import { HorizonLineOptions, IfdHorizonLine } from './HorizonLine/IfdHorizonLine';
import { IfdHorizonOcclusionArea } from './HorizonLine/IfdHorizonOcclusionArea';
import { IfdArtificialHorizon, IfdArtificialHorizonOptions } from './IfdArtificialHorizon';
import { IfdPitchLadder } from './IfdPitchLadder';
import { IfdSvs } from './IfdSvs';

import './IfdHorizonDisplay.css';

/** Props for an {@link IfdHorizonDisplay} */
export interface IfdHorizontalDisplayProps extends ComponentProps {
  /** The event bus to use. */
  bus: EventBus;
  /** The IfdSvsController */
  controller: IfdSvsController;
  /** The SVS settings manager. */
  svsSettings: UserSettingManager<SvsUserSettingTypes>;
  /** The IfdOptions */
  options: IfdOptions;
  /** The current SVS reference heading or track in degrees true, or invalid if null. */
  headingOrTrack: Subscribable<number | null>;
}

/** An IfdHorizonDisplay */
export class IfdHorizonDisplay extends LifecycleComponent<IfdHorizontalDisplayProps> {
  private readonly containerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly horizonRef = FSComponent.createRef<HorizonComponent>();

  private readonly projection = new HorizonProjection(
    this.props.controller.ifdHorizonWidth.get(),
    this.props.controller.ifdHorizonHeight.get(),
    IfdSvsController.SVS_OFF_FIXED_FOV,
  );

  private readonly projectedSize = Vec2Subject.create(Vec2Math.create(
    this.props.controller.ifdHorizonWidth.get(),
    this.props.controller.ifdHorizonHeight.get(),
  ));

  private readonly projectedOffset = Subject.create(Float64Array.from([0, 0]));

  private readonly projectionParams = {
    position: new GeoPoint(0, 0),
    altitude: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
  };

  private readonly showArtificalHorizon = this.props.controller.svsActive.map(SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle);

  private readonly useMagneticHeading = UnitsUserSettings.getManager(this.props.bus).getSetting('unitsNavAngle').map((v) => v === UnitsNavAngleSettingMode.Magnetic).withLifecycle(this.defaultLifecycle);

  private readonly fov = MappedSubject.create(
    ([svsEnabled, synVisFov]) => svsEnabled ? synVisFov : IfdSvsController.SVS_OFF_FIXED_FOV,
    this.props.controller.svsEnabled,
    this.props.controller.fieldOfView,
  );

  private readonly artificialHorizonOptions: IfdArtificialHorizonOptions = {
    skyColors: [[0, '#2269CC'], [112, '#081B81'], [225, '#010368']],
    groundColors: [[0, '#BF771F'], [225, '#A04E14']]
  };

  private readonly lnavXtk = ConsumerSubject.create(null, 0);
  private readonly isLnavTracking = ConsumerSubject.create(null, false);
  private readonly cdiScale = ConsumerSubject.create(null, 2);
  private readonly cdiScaleLabel = ConsumerSubject.create(null, IfdCdiScaleLabel.Enroute);

  private readonly vnavPathMode = ConsumerSubject.create(null, VNavPathMode.None);
  private readonly vnavVerticalDeviation = ConsumerSubject.create(null, 0);
  private readonly activeApproachMode = ConsumerSubject.create<IfdApproachNavModes | null>(null, null);
  private readonly glidePathVerticalDeviation = ConsumerSubject.create(null, -1001);
  private readonly glidePathCanCapture = ConsumerSubject.create(null, false);

  private readonly verticalDeviation = MappedSubject.create(
    ([enrouteMode, enrouteVDev, approachMode, approachCanCapture, approachVDev]) => {
      if (approachMode !== null || approachCanCapture) {
        return -approachVDev;
      } else if (enrouteMode === VNavPathMode.PathActive || (enrouteMode === VNavPathMode.PathArmed && Math.abs(enrouteVDev) < 150)) {
        return enrouteVDev;
      }
      return null;
    },
    this.vnavPathMode,
    this.vnavVerticalDeviation,
    this.activeApproachMode,
    this.glidePathCanCapture,
    this.glidePathVerticalDeviation,
  ).withLifecycle(this.defaultLifecycle);

  private readonly isHeadingDataValid = this.props.headingOrTrack.map((v) => v !== null).withLifecycle(this.defaultLifecycle);

  private readonly isLDevHidden = Subject.create(true);
  private readonly isVDevHidden = this.verticalDeviation.map((v) => v === null).withLifecycle(this.defaultLifecycle);

  private readonly approachToLdevHiddenPipe = this.cdiScaleLabel.pipe(this.isLDevHidden, (v) => v !== IfdCdiScaleLabel.Approach, true).withLifecycle(this.defaultLifecycle);
  private readonly lnavTrackingToLdevHiddenPipe = this.isLnavTracking.pipe(this.isLDevHidden, SubscribableMapFunctions.not()).withLifecycle(this.defaultLifecycle);

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ArsSystemEvents & GnssReceiverEvents & IfdApproachEvents & IfdVNavDataEvents & LNavEvents & LNavDataEvents & VNavEvents>();
    const lnavSuffix = LNavUtils.getEventBusTopicSuffix(this.props.options.lnavIndex);
    const vnavSuffix = VNavUtils.getEventBusTopicSuffix(this.props.options.vnavIndex);

    this.isLnavTracking.setConsumer(sub.on(`lnav_is_tracking${lnavSuffix}`));
    this.lnavXtk.setConsumer(sub.on(`lnav_xtk${lnavSuffix}`));
    this.cdiScale.setConsumer(sub.on(`lnavdata_cdi_scale${lnavSuffix}`));
    this.cdiScaleLabel.setConsumer(sub.on(`lnavdata_cdi_scale_label${lnavSuffix}`));

    this.vnavVerticalDeviation.setConsumer(sub.on(`vnav_vertical_deviation${vnavSuffix}`));
    this.vnavPathMode.setConsumer(sub.on(`vnav_path_mode${vnavSuffix}`));
    this.activeApproachMode.setConsumer(sub.on('active_approach_mode'));
    this.glidePathVerticalDeviation.setConsumer(sub.on(`gp_vertical_deviation${vnavSuffix}`));
    this.glidePathCanCapture.setConsumer(sub.on(`gp_can_capture${vnavSuffix}`));

    this.props.svsSettings.getSetting('showAdiHdi').sub((v) => {
      if (v === AdiHdiSettings.AlwaysOn) {
        this.approachToLdevHiddenPipe.pause();
        this.lnavTrackingToLdevHiddenPipe.resume(true);
      } else {
        this.lnavTrackingToLdevHiddenPipe.pause();
        this.approachToLdevHiddenPipe.resume(true);
      }
    }, true).withLifecycle(this.defaultLifecycle);

    this.register(
      MappedSubject.create(
        ([width]) => this.containerRef.getOrDefault()?.style.setProperty('width', `${width}px`),
        this.props.controller.ifdHorizonWidth,
      )
    );

    this.register(
      MappedSubject.create(
        ([width, height]) => {
          this.projectedSize.set(width, height);
        },
        this.props.controller.ifdHorizonWidth,
        this.props.controller.ifdHorizonHeight,
      )
    );

    this.register(
      this.props.controller.isSvsFullscreen.sub((isFullscreen) => {
        this.projectedOffset.set(isFullscreen ? Float64Array.from([0, -12]) : Float64Array.from([0, 0]));
      }, true)
    );

    this.register(this.fov);
    this.register(
      sub.on('gnss_position').handle((pos) => {
        if (!this.projectionParams.position.isValid() || !this.projectionParams.position.equals(pos.lat, pos.long)) {
          this.projectionParams.position.set(pos.lat, pos.long);
        }
      })
    );
    this.register(sub.on('gnss_altitude_ft').handle((alt) => this.updateProjectionParamsWithPrecision('altitude', alt ? UnitType.METER.convertFrom(alt, UnitType.FOOT) : 0, 1)));

    this.register(
      this.props.headingOrTrack.sub((heading: number | null) => {
        this.updateProjectionParamsWithPrecision('heading', heading ?? 0, 0.1);
      })
    );

    this.register(
      sub.on('ars_actual_pitch_deg').handle((pitch: number) => {
        this.updateProjectionParamsWithPrecision('pitch', -pitch, 0.1);
      })
    );

    this.register(
      sub.on('ars_actual_roll_deg').handle((roll: number) => {
        this.updateProjectionParamsWithPrecision('roll', -roll, 0.1);
      })
    );

    this.register(
      this.props.bus.getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(30)
        .handle(((time: number): void => {
          this.projection.set(this.projectionParams);
          this.horizonRef.instance.update(time);
        }))
    );
  }

  /**
   * Updates a number horizon projection parameter with a given precision
   * @param key the projection parameter key
   * @param rawValue the new raw value
   * @param precision the precision
   */
  private updateProjectionParamsWithPrecision(key: Exclude<keyof typeof this.projectionParams, 'position'>, rawValue: number, precision: number): void {
    const currentvalue = this.projectionParams[key];
    const roundedNewValue = MathUtils.round(rawValue, precision);

    if (currentvalue !== undefined && currentvalue !== null && Math.abs(currentvalue - roundedNewValue) < Number.EPSILON) {
      return;
    }

    this.projectionParams[key] = roundedNewValue;
  }

  /** @inheritDoc */
  render(): VNode {
    const horizonLineOptions: HorizonLineOptions = {
      headingPointerSize: Vec2Math.create(16, 18),
      headingTickLength: 20,
      font: 'Arial Bold',
      fontSize: 24,
      labelOffset: 10,
      fontOutlineColor: 'white',
      fontColor: 'rgb(106, 72, 62)',
      lineStrokeWidth: 3,
      lineStrokeColor: '#ccffff'
    };

    const occlusions: ArraySubject<IfdHorizonOcclusionArea> = ArraySubject.create();

    const showHorizonHeadingLabels = MappedSubject.create(
      SubscribableMapFunctions.and(),
      this.isHeadingDataValid,
      this.props.svsSettings.getSetting('showHorizonHeadingLabels'),
    );


    return (
      <div class="wt-ifd-horizon-display-container" ref={this.containerRef}>
        <HorizonComponent
          ref={this.horizonRef}
          projectedSize={this.projectedSize}
          projectedOffset={this.projectedOffset}
          fov={this.fov}
          projection={this.projection}
          class='wt-ifd-horizon-display'
        >
          <IfdSvs projection={this.projection} isEnabled={this.props.controller.svsActive} />
          <IfdSlipSkidIndicator bus={this.props.bus} />
          <IfdAircraftReferenceSymbol svsFullscreen={this.props.controller.isSvsFullscreen} svsEnabled={this.props.controller.svsActive} />
          <HorizonSharedCanvasLayer projection={this.projection}>
            <IfdArtificialHorizon show={this.showArtificalHorizon} options={this.artificialHorizonOptions} />
            <IfdHorizonLine
              show={this.props.controller.svsActive}
              projectedSize={this.projectedSize}
              approximate={false}
              showHeadingLabels={showHorizonHeadingLabels}
              useMagneticHeading={this.useMagneticHeading}
              occlusions={occlusions}
              options={horizonLineOptions}
            />
            <IfdPitchLadder controller={this.props.controller} />
          </HorizonSharedCanvasLayer>
          <IfdBankRollTickMarks projection={this.projection} controller={this.props.controller} />
          <IfdTotalVelocityVector bus={this.props.bus} projection={this.projection} />
          <IfdDeviationIndicator
            controller={this.props.controller}
            isHidden={this.isLDevHidden}
            orientation='horizontal'
            fullScale={this.cdiScale}
            currentValue={this.lnavXtk}
          >
            <CdiScaleLabel
              isHidden={this.isLDevHidden}
              cdiScale={this.cdiScale}
            />
          </IfdDeviationIndicator>
          <IfdDeviationIndicator
            controller={this.props.controller}
            isHidden={this.isVDevHidden}
            orientation='vertical'
            fullScale={IfdVerticalDeviationScale}
            currentValue={this.verticalDeviation}
          >
            <CdiScaleLabel
              isHidden={this.activeApproachMode.map((v) => v === null)}
              cdiScale={Subject.create(UnitType.NMILE.convertFrom(IfdVerticalDeviationScale, UnitType.FOOT))}
            />
          </IfdDeviationIndicator>
        </HorizonComponent>
      </div>
    );
  }
}

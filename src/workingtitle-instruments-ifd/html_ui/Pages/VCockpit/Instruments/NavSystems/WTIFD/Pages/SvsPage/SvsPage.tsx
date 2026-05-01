import {
  AhrsEvents, ConsumerSubject, DebounceTimer, FSComponent, GNSSEvents, MappedSubject, MathUtils, SimVarValueType, StringUtils, Subject, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { CompassRoseNumbers, CompassRoseTicks } from '../../Components/CompassRose/CompassRose';
import { HeadingBug } from '../../Components/Map/HeadingBug';
import { MapCompassOffset } from '../../Components/Map/MapCompassOffset';
import { DatablockService } from '../../Datablocks/DatablocksService';
import { IfdInteractionEvent, IfdInteractions } from '../../Events/IfdInteractionEvent';
import { IfdInstrumentType, IfdOptions } from '../../IfdOptions';
import { LineSelectKeyButtonType } from '../../LineSelectKeyButtons';
import { LskButtonState } from '../../LineSelectKeyButtons/LskState';
import { LskUtils } from '../../LineSelectKeyButtons/LskUtils';
import { MapSystemCommon } from '../../Map/MapSystemCommon';
import { MapDataProvider } from '../../Providers/Map/MapDataProvider';
import { SvsUserSettings } from '../../Settings/SvsUserSettings';
import { DataSidebar } from '../../Sidebar/DataSidebar';
import { IfdDataProvider } from '../../Utilities/IfdDataProvider';
import { IfdPage, IfdPageProps } from '../IfdPage';
import { IfdAirspeedDisplay } from './AirspeedDisplay/IfdAirspeedDisplay';
import { IfdAirTempIndicator } from './AirTempIndicator/IfdAirTempIndicator';
import { IfdAltitudeDisplay } from './AltitudeDisplay/IfdAltitudeDisplay';
import { IfdAngleOfAttackIndicator } from './AngleOfAttackIndicator/IfdAngleOfAttackIndicator';
import { BaroDisplay } from './Baro/BaroDisplay';
import { IfdHorizonDisplay } from './HorizonDisplay/IfdHorizonDisplay';
import { IfdSvsController } from './IfdSvsController';
import { IfdMachIndicator } from './MachIndicator/IfdMachIndicator';
import { SvsFovDisplay } from './SvsFovDisplay';
import { SvsHeadingDisplay } from './SvsHeadingDisplay';
import { SvsHeadingFlag } from './SvsHeadingFlag';
import { SvsTurnRateIndicator } from './SvsTurnRateIndicator';
import { IfdTrueAirspeedIndicator } from './TrueAirspeedIndicator/TrueAirspeedIndicator';
import { IfdVerticalSpeedIndicator } from './VerticalSpeedIndicator/IfdVerticalSpeedIndicator';

import './SvsPage.css';

/** Props for the SvsPage component. */
export interface SvsPageProps extends IfdPageProps {
  /** The IfdDataProvider. */
  readonly dataProvider: IfdDataProvider;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
  /** The datablock service instance. */
  readonly datablockService: DatablockService;
}

/** The SVS modes */
export enum SvsMode {
  Off = 'Off',
  On = 'On',
  // Fpl = 'FPL'
}

const FOV_KNOB_INCREMENT_OUTER = 5;
const FOV_KNOB_INCREMENT_INNER = 2;

/**
 * The Synthetic Vision System (SVS or SynVis) subsystem
 * consists of a single page to aid in the pilot’s awareness of their
 * spatial position relative to the terrain.
 *
 * This page only exists on the IFD550 and is not available on the IFD540.
 *
 * The SVS page on the XB-1 IFD550 is heavily customized for the XB-1.
 */
export class SvsPage extends IfdPage<SvsPageProps> {
  private readonly controller = new IfdSvsController(this.bus, this.props.ifdOptions, this.viewService);
  private readonly synVisMode = this.controller.synVisMode;

  private readonly svsSettings = SvsUserSettings.getManager(this.props.bus);

  private readonly rangeRingRadius = 88.25;
  private readonly compassSvgSize = 495;
  private readonly compassRotatingSvgRef = FSComponent.createRef<SVGElement>();

  private readonly rawTrackTrue = ConsumerSubject.create(null, 0);
  private readonly rawHeadingTrue = ConsumerSubject.create(null, 0);
  private readonly rawGroundSpeed = ConsumerSubject.create(null, 0);

  /** When GS is below the threshold and the GNSS data is valid, we use raw heading to "fix" the track so it appears normal. */
  private readonly useTrkForSvs = MappedSubject.create(
    ([rawGs, isRefHeading]) => !isRefHeading && rawGs > 30,
    this.rawGroundSpeed,
    this.props.mapDataProvider.displayHeadingIsHeading,
  );
  private readonly svsHeadingOrTrackTrue = Subject.create<number | null>(null);
  private readonly svsHeadingTruePipe = this.rawHeadingTrue.pipe(this.svsHeadingOrTrackTrue, true);
  // GnssReceiver is too noisy for SVS, so run raw track from the sim
  private readonly svsTrackTruePipe = this.rawTrackTrue.pipe(this.svsHeadingOrTrackTrue, true);

  private readonly selectedHeadingAngle = MappedSubject.create(
    ([selectedHeading, compassRotation]): number => {
      if (compassRotation === null) {
        return 0;
      }
      let angle = selectedHeading - compassRotation;
      if (angle < -180) {
        angle += 360;
      } else if (angle > 180) {
        angle -= 360;
      }
      return MathUtils.clamp(angle, -57, 57);
    },
    this.props.mapDataProvider.selectedHeading,
    this.props.mapDataProvider.displayHeading,
  );

  private readonly knobPipes = [] as Subscription[];

  private readonly lskButtonsTimeout = new DebounceTimer();
  private readonly knobLabelVisibleFromInteraction = Subject.create(false);
  private readonly knobLabelVisible = MappedSubject.create(([fromInteraction, isSidebarVisible, isFullscreen]) => {
    return fromInteraction || (isSidebarVisible && !isFullscreen);
  }, this.knobLabelVisibleFromInteraction, this.controller.isSidebarVisible, this.viewService.isSvsFullscreen);

  private readonly svsFov = SvsUserSettings.getManager(this.bus).getSetting('svsFieldOfView');

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.bus.getSubscriber<AhrsEvents & GNSSEvents>();
    this.rawTrackTrue.setConsumer(sub.on('track_deg_true'));
    this.rawHeadingTrue.setConsumer(sub.on('actual_hdg_deg_true'));
    this.rawGroundSpeed.setConsumer(sub.on('ground_speed'));

    this.bus.getSubscriber<IfdInteractions>().on('ifd_interaction_event').handle((event) => {
      if (event === IfdInteractionEvent.SVSLeft || event === IfdInteractionEvent.SVSRight) {
        this.startLskButtonsTimeout();
      }
    });

    this.controller.dataSidebarRef.instance.isSidebarVisibleDelayed.pipe(this.controller.isSidebarVisibleDelayed);

    this.controller.isSidebarVisibleAndNotFullscreen.sub((isSidebarVisibleAndNotFullscreen) => {
      this._knobState.labelStyle.set(isSidebarVisibleAndNotFullscreen ? 'solid' : 'translucent');
    }, true);

    this.knobLabelVisible.pipe(this._knobState.isVisible);

    this._lskState.selectedButton.set(2);
    this._lskState.lsk2.label.set('SynVis');
    this.synVisMode.pipe(this._lskState.lsk2.value);
    this._lskState.lsk2.isVisible.set(true);
    this._lskState.lsk2.type.set(LineSelectKeyButtonType.State);
    this._lskState.lsk2.onClick.set(() => {
      this._lskState.selectedButton.set(2);
      this.startLskButtonsTimeout();
      this.synVisMode.set(
        this.synVisMode.get() === SvsMode.On
          ? SvsMode.Off
          : SvsMode.On
      );
    });

    if (this.props.ifdOptions.enableBaroSettingFeature) {
      const baroButtonState: LskButtonState = LskUtils.createLskButtonState({
        isVisible: true,
        type: LineSelectKeyButtonType.Action,
        label: () => <BaroDisplay
          bus={this.props.bus}
        />,
        onClick: () => {
          this._lskState.selectedButton.set(3);
          this.startLskButtonsTimeout();
        },
        onKnobEvent: (event) => {
          // Handle knob events for baro setting
          switch (event) {
            case IfdInteractionEvent.RightKnobOuterInc:
            case IfdInteractionEvent.RightKnobInnerInc:
              //  increase baro setting
              SimVar.SetSimVarValue('K:KOHLSMAN_INC', SimVarValueType.Number, this.props.ifdOptions.airData!.altimeterIndex);
              this.startLskButtonsTimeout();
              return true;
            case IfdInteractionEvent.RightKnobOuterDec:
            case IfdInteractionEvent.RightKnobInnerDec:
              //  decrease baro setting
              SimVar.SetSimVarValue('K:KOHLSMAN_DEC', SimVarValueType.Number, this.props.ifdOptions.airData!.altimeterIndex);
              this.startLskButtonsTimeout();
              return true;
            case IfdInteractionEvent.RightKnobPush:
              // Reset baro setting
              SimVar.SetSimVarValue('K:BAROMETRIC_STD_PRESSURE', SimVarValueType.Number, this.props.ifdOptions.airData!.altimeterIndex);
              this.startLskButtonsTimeout();
              return true;
            default:
              return false;
          }
        },
      });
      LskUtils.pipeObjectOfSubs(baroButtonState, this._lskState.lsk3);
    }

    this.lskState.selectedButton.sub((selected) => {
      this.knobPipes.forEach((v) => v.destroy());
      if (selected === 3) {
        this._knobState.leftText.set('Baro');
        this._knobState.leftColor.set('mint');
        this._knobState.rightText.set('Std');
        this._knobState.rightColor.set('mint');
      } else {
        this.knobPipes.push(this.svsFov
          .pipe(this._knobState.leftText, fov =>
            fov === IfdSvsController.SYN_VIS_MAX_FOV ? 'Max' :
              fov === IfdSvsController.SYN_VIS_MIN_FOV ? 'Min' :
                `${fov.toFixed()}${StringUtils.DEGREE}`));
        this._knobState.rightText.set('Default');
        this._knobState.rightColor.set('green');
      }
    }, true).withLifecycle(this.defaultLifecycle);

    this.useTrkForSvs.sub((v) => {
      if (v) {
        this.svsHeadingTruePipe.pause();
        this.svsTrackTruePipe.resume(true);
      } else {
        this.svsTrackTruePipe.pause();
        this.svsHeadingTruePipe.resume(true);
      }
    }, true);
  }

  /** @inheritDoc */
  public resume(): void {
    super.resume();

    if (this.props.ifdOptions.svsFullScreen) {
      this.props.viewService.inhibitComPresetBox();
    }
  }

  /** @inheritDoc */
  public pause(): void {
    super.pause();

    this.props.viewService.enableComPresetBox();
  }

  /**
   * Starts the timeout for the barometric setting knob.
   */
  private startLskButtonsTimeout(): void {
    this._lskState.isVisible.set(true);
    this.knobLabelVisibleFromInteraction.set(true);
    this.lskButtonsTimeout.schedule(() => {
      this._lskState.selectedButton.set(2);
      this._lskState.isVisible.set(false);
      this.knobLabelVisibleFromInteraction.set(false);
    }, 10000);
  }

  /** @inheritDoc */
  onInteractionEvent(event: IfdInteractionEvent): boolean {
    switch (event) {
      case IfdInteractionEvent.RightKnobOuterDec:
        if (this.controller.svsEnabled.get()) {
          this.svsFov.set(Math.max(this.svsFov.get() - FOV_KNOB_INCREMENT_OUTER, IfdSvsController.SYN_VIS_MIN_FOV));
          this.startLskButtonsTimeout();
        }
        return true;
      case IfdInteractionEvent.RightKnobInnerDec:
        if (this.controller.svsEnabled.get()) {
          this.svsFov.set(Math.max(this.svsFov.get() - FOV_KNOB_INCREMENT_INNER, IfdSvsController.SYN_VIS_MIN_FOV));
          this.startLskButtonsTimeout();
        }
        return true;
      case IfdInteractionEvent.RightKnobOuterInc:
        if (this.controller.svsEnabled.get()) {
          this.svsFov.set(Math.min(this.svsFov.get() + FOV_KNOB_INCREMENT_OUTER, IfdSvsController.SYN_VIS_MAX_FOV));
          this.startLskButtonsTimeout();
        }
        return true;
      case IfdInteractionEvent.RightKnobInnerInc:
        if (this.controller.svsEnabled.get()) {
          this.svsFov.set(Math.min(this.svsFov.get() + FOV_KNOB_INCREMENT_INNER, IfdSvsController.SYN_VIS_MAX_FOV));
          this.startLskButtonsTimeout();
        }
        return true;
      case IfdInteractionEvent.RightKnobPush:
        if (this.props.ifdOptions.enableBaroSettingFeature && this.svsFov.get() === 45) {
          // Switch to baro setting mode if already at default FoV.
          this._lskState.selectedButton.set(3);
        } else {
          this.svsFov.set(45);
        }
        this.startLskButtonsTimeout();
        return true;
      case IfdInteractionEvent.SVSHeldLeft:
      case IfdInteractionEvent.SVSHeldRight:
        this.controller.isSidebarVisible.set(!this.controller.isSidebarVisible.get());
        return true;
      default:
        return false; // Event not handled
    }
  }

  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div class={{
        'svs-page': true,
        'ifd-page': true,
        'svs-page-fullscreen': this.viewService.isSvsFullscreen,
      }}>
        <IfdHorizonDisplay
          bus={this.props.bus}
          controller={this.controller}
          options={this.props.ifdOptions}
          svsSettings={this.svsSettings}
          headingOrTrack={this.svsHeadingOrTrackTrue}
        />
        {this.props.ifdOptions.instrumentType === IfdInstrumentType.IFD550Custom &&
          <>
            <div class={{ 'wt-ifd-svs-pfd-left-container': true, 'hidden': this.controller.isSvsFullscreen.map(v => !v) }}>
              <IfdMachIndicator bus={this.props.bus} />
              <IfdAirspeedDisplay bus={this.props.bus} dataProvider={this.props.dataProvider} />
              <IfdTrueAirspeedIndicator bus={this.props.bus} />
              <IfdAngleOfAttackIndicator dataProvider={this.props.dataProvider} />
            </div>
            <div class={{ 'wt-ifd-svs-pfd-right-container': true, 'hidden': this.controller.isSvsFullscreen.map(v => !v) }}>
              <IfdAirTempIndicator bus={this.props.bus} />
              <IfdAltitudeDisplay bus={this.props.bus} dataProvider={this.props.dataProvider} />
              <IfdVerticalSpeedIndicator bus={this.props.bus} />
            </div>
          </>
        }

        <div
          class="wt-ifd-svs-compass-container"
          style={{
            width: this.controller.ifdHorizonWidth.map((v) => `${v}px`),
          }}
        >
          <SvsFovDisplay synVisEnabled={this.controller.svsActive} synVisFov={this.svsFov} />
          <SvsTurnRateIndicator bus={this.props.bus} />
          <MapCompassOffset
            classname="svs-compass-inner"
            compassSvgSize={this.compassSvgSize}
            targetProjectedOffsetY={0}
          >
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
                bottom: this.controller.isSidebarVisibleDelayed.map((v) => v ? '20px' : '0')
              }}
            >
              <CompassRoseTicks
                svgViewBoxSize={this.compassSvgSize}
                ticksRadius={this.controller.isSidebarVisibleDelayedAndNotFullscreen
                  .map((v) => v ? MapSystemCommon.northUpCompassRadiusSidebar : MapSystemCommon.northUpCompassRadius)}
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
                numbersRadius={this.controller.isSidebarVisibleDelayedAndNotFullscreen
                  .map((v) => (v ? MapSystemCommon.northUpCompassRadiusSidebar : MapSystemCommon.northUpCompassRadius) - 20)}
                rotation={this.props.mapDataProvider.compassUpDirection}
                largeFontSize={22}
                smallFontSize={16}
              />
            </div>
            {this.props.ifdOptions.headingSelectEnabled && (
              <HeadingBug
                compassSvgSize={this.compassSvgSize}
                rotationDeg={this.selectedHeadingAngle}
                rangeRingRadius={this.rangeRingRadius}
                isHidden={this.props.mapDataProvider.displayHeading.map((v) => v === null).withLifecycle(this.defaultLifecycle)}
              />
            )}
          </MapCompassOffset>
          <SvsHeadingDisplay headingOrTrack={this.props.mapDataProvider.displayHeading} />
        </div>
        <div class="svs-heading-flags-container">
          <SvsHeadingFlag label='TRK' isHidden={this.props.mapDataProvider.displayHeadingIsHeading} />
          <SvsHeadingFlag label='TRU' isHidden={this.props.mapDataProvider.displayHeadingIsMagnetic} />
        </div>
        <DataSidebar
          ref={this.controller.dataSidebarRef}
          bus={this.props.bus}
          viewService={this.viewService}
          datablockService={this.props.datablockService}
          isSidebarVisible={this.controller.isSidebarVisible}
        />
      </div>
    );
  }
}

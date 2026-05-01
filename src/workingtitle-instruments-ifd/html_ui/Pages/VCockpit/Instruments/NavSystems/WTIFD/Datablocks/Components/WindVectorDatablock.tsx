import {
  ConsumerSubject, CssTransformBuilder, CssTransformSubject, FSComponent, GNSSEvents, MagVar, MappedSubject, ObjectSubject, Subject, SubscribableMapFunctions,
  VNode
} from '@microsoft/msfs-sdk';

import { ExternalAdcSystemEvents } from '../../Systems/ExternalAdcSystem';
import { ExternalHeadingSystemEvents } from '../../Systems/ExternalHeadingSystem';
import { GnssReceiverEvents } from '../../Systems/Gnss/GnssTypes';
import { IfdDataProvider } from '../../Utilities/IfdDataProvider';
import { DatablockCompatibility, DatablockCompatibilityMap, DatablockInfo, DatablockSizeMap } from '../DatablockTypes';
import { BaseDatablockProps, Datablock } from './Datablock';

/**
 * Shared interface for all waypoint-related data blocks
 */
export interface WindVectorDatablockProps extends BaseDatablockProps {
  /** The IfdDataProvider. */
  readonly dataProvider: IfdDataProvider;
}

/** Datablock for displaying the Wind Vector */
export class WindVectorDatablock extends Datablock<WindVectorDatablockProps> {
  private readonly arrowTransform = CssTransformSubject.create(CssTransformBuilder.concat(CssTransformBuilder.rotate3d('deg')));
  private readonly airplaneIconPath = Subject.create<string>('coui://html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD/Assets/Icons/ifd-airplane-wind.png');
  private readonly airplaneIconStyle = ObjectSubject.create({
    display: '',
    position: 'absolute',
    width: '50px',
  });

  private readonly sub = this.props.bus.getSubscriber<ExternalAdcSystemEvents & ExternalHeadingSystemEvents & GNSSEvents & GnssReceiverEvents>();

  private readonly groundSpeed =
    ConsumerSubject.create(this.sub.on('gnss_ground_speed_kts').withPrecision(0).atFrequency(5), 0);

  private readonly groundSpeedValid = this.groundSpeed.map<boolean>((groundSpeed, prevValue) => {
    // Copied from boeing wind vector, manual just says value is populated in the air, but it's probably ground speed based
    const groundSpeedThresh = prevValue ? 36 : 40;
    return groundSpeed !== null && groundSpeed >= groundSpeedThresh;
  });

  private readonly magVar = ConsumerSubject.create<number>(this.sub.on('magvar').withPrecision(1), 0);

  private readonly windSpeedKnots = this.props.dataProvider.events.adc.ambient_wind_velocity.map((v: number) => Math.floor(v))
    .withLifecycle(this.defaultLifecycle);

  private readonly windSpeedValid = this.windSpeedKnots.map<boolean>((windSpeed, prevValue) => {
    const speedThresh = prevValue ? 5 : 7;
    return windSpeed >= speedThresh;
  });

  private readonly trueHeading = ConsumerSubject.create(this.sub.on('ext_hdg_actual_hdg_deg_true'), 0);
  private readonly headingValid = ConsumerSubject.create(this.sub.on('ext_hdg_heading_data_valid'), false);

  private readonly trueAirspeedValid = ConsumerSubject.create(this.sub.on('ext_adc_speed_data_valid'), false);

  /**
   * For wind to be valid, external heading and true airspeed values need to be available and valid,
   * and the internal GNSS ground speed and track need to be valid.
   * The wind is the difference between the HDG+TAS and TRK+GS vectors in IRL avionics.
   */
  private readonly isValid = MappedSubject.create(
    SubscribableMapFunctions.and(),
    this.windSpeedValid,
    this.groundSpeedValid,
    this.headingValid,
    this.trueAirspeedValid,
  ).withLifecycle(this.defaultLifecycle);

  private readonly arrowRotation = MappedSubject.create(
    ([trueHeading, trueWindDirection]) => {
      this.arrowTransform.transform.getChild(0).set(0, 0, 1, this.normaliseDegree(trueWindDirection + 90 - trueHeading));
      this.arrowTransform.resolve();
    },
    this.trueHeading,
    this.props.dataProvider.events.adc.ambient_wind_direction
  );

  private readonly windDirectionDisplay = MappedSubject.create(([windDirTrue, magVar, isValid]) => {
    if (!isValid) {
      return '---°';
    }
    const windDirMag = MagVar.trueToMagnetic(windDirTrue, magVar);
    const dir = Math.floor(windDirMag) === 0 ? 360 : windDirMag;
    return dir.toFixed(0).padStart(3, '0') + '°';
  }, this.props.dataProvider.events.adc.ambient_wind_direction, this.magVar, this.isValid).withLifecycle(this.defaultLifecycle);

  private readonly windSpeedKnotsDisplay = MappedSubject.create(([windSpeedKnots, isValid]) => {
    return !isValid ? '---' : windSpeedKnots.toFixed();
  }, this.windSpeedKnots, this.isValid).withLifecycle(this.defaultLifecycle);

  private readonly displayAsCalm = MappedSubject.create(([isValid, windSpeedKnots]) => {
    return !!(isValid && windSpeedKnots < 5);
  }, this.isValid, this.windSpeedKnots).withLifecycle(this.defaultLifecycle);

  private readonly hideArrow = MappedSubject.create(([isValid, displayAsCalm]) => {
    return !isValid || displayAsCalm;
  }, this.isValid, this.displayAsCalm).withLifecycle(this.defaultLifecycle);

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.register(this.arrowRotation);
  }

  /**
   * Calculates a normalised degree value
   * @param deg the degree value to normalise
   * @returns a number
   */
  private normaliseDegree(deg: number): number {
    return (deg % 360 + 360) % 360;
  }

  /**
   * Gets the datablock info for WindVectorDatablock instance.
   * @returns The DatablockInfo object describing this datablock.
   */
  public getInfo(): DatablockInfo {
    return {
      id: this.props.datablockId,
      displayName: 'Wind Vector',
      size: DatablockSizeMap.get(this.props.datablockId) ?? 99,
      compatibleSlots: DatablockCompatibilityMap.get(this.props.datablockId) ?? DatablockCompatibility.None,
    };
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="datablock datablock-wind-vector" style="height: 100%;" ref={this.datablockRef}>
        <div class="datablock-indent datablock-font-small datablock-text-mint">Wind</div>
        <div style="width: 100%; text-align: center;">
          <span
            class={{
              'datablock-font-large': true,
              'datablock-text-cyan': true,
              'datablock-space-after': true,
              'hidden': this.displayAsCalm.map((v) => !v)
            }}
          >
            Calm
          </span>

          <span
            class={{
              'datablock-font-large': true,
              'datablock-text-cyan': true,
              'datablock-space-after': true,
              'hidden': this.displayAsCalm
            }}
          >
            {this.windDirectionDisplay} / {this.windSpeedKnotsDisplay}
          </span>
          <span
            class={{
              'datablock-font-small': true,
              'datablock-text-mint': true,
              'hidden': this.displayAsCalm
            }}
          >
            Kts
          </span>
        </div>

        <div
          class={{
            'datablock-content-row': true,
            'hidden': this.hideArrow
          }}
          style="justify-content: center; align-items: center;"
        >
          <svg
            viewBox="-1 -1 20 12"
            style={{
              'z-index': '3',
              width: '26px',
              margin: '7px 0',
              transform: this.arrowTransform,
            }}
          >
            <path d="M 1 5 L 13 5" style="stroke: var(--wtdyne-color-white);" stroke-width="2" fill="none" />
            <path d="M 17 5 L 10 9 C 9 7 9 6 9 5 C 9 4 9 3 10 1 L 17 5" fill="var(--wtdyne-color-white)" stroke="none" />
          </svg>
          <img src={this.airplaneIconPath} style={this.airplaneIconStyle} alt="airplane-icon" />
        </div>
      </div>
    );
  }
}

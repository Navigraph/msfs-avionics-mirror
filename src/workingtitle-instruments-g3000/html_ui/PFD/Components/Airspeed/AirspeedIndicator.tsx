import { ComponentProps, DisplayComponent, EventBus, FSComponent, SimVarValueType, Subscribable, UserSettingManager, VNode } from '@microsoft/msfs-sdk';

import {
  AirspeedAoaDataProvider, AirspeedIndicator as BaseAirspeedIndicator, AirspeedIndicatorDataProviderOptions,
  DefaultAirspeedIndicatorDataProvider, DefaultVSpeedAnnunciationDataProvider, VSpeedBugDefinition
} from '@microsoft/msfs-garminsdk';

import { IauUserSettingTypes, VSpeedGroupType, VSpeedUserSettingManager } from '@microsoft/msfs-wtg3000-common';

import { AirspeedIndicatorConfig } from './AirspeedIndicatorConfig';

import './AirspeedIndicator.css';

/**
 * Component props for AirspeedIndicator.
 */
export interface AirspeedIndicatorProps extends ComponentProps {
  /** The event bus. */
  bus: EventBus;

  /** The configuration object for the indicator. */
  config: AirspeedIndicatorConfig;

  /**
   * Whether airspeed hold is active. If not defined, airspeed hold is considered active if and only if the flight
   * director is in FLC mode.
   */
  isAirspeedHoldActive?: boolean | Subscribable<boolean>;

  /** A provider of angle of attack data. */
  aoaDataProvider: AirspeedAoaDataProvider;

  /** A manager for IAU user settings. */
  iauSettingManager: UserSettingManager<IauUserSettingTypes>;

  /** A manager for reference V-speed settings. */
  vSpeedSettingManager: VSpeedUserSettingManager;

  /** Whether the indicator should be decluttered. */
  declutter: Subscribable<boolean>;

  /** The index of the PFD. */
  pfdIndex: 1 | 2;
}

/**
 * A G3000 airspeed indicator.
 */
export class AirspeedIndicator extends DisplayComponent<AirspeedIndicatorProps> {
  private readonly ref = FSComponent.createRef<BaseAirspeedIndicator>();

  private readonly dataProvider: DefaultAirspeedIndicatorDataProvider;
  private readonly vSpeedAnnunciationDataProvider?: DefaultVSpeedAnnunciationDataProvider;

  /** @inheritdoc */
  constructor(props: AirspeedIndicatorProps) {
    super(props);

    const dataProviderOptions: AirspeedIndicatorDataProviderOptions = {
      isAirspeedHoldActive: this.props.isAirspeedHoldActive,
      ...this.props.config.dataProviderOptions
    };

    this.dataProvider = new DefaultAirspeedIndicatorDataProvider(
      this.props.bus,
      this.props.iauSettingManager.getSetting('iauAdcIndex'),
      dataProviderOptions,
      this.props.aoaDataProvider
    );

    if (this.props.config.vSpeedAnnuncOptions.enabled) {
      const takeoffVSpeedGroup = this.props.vSpeedSettingManager.vSpeedGroups.get(VSpeedGroupType.Takeoff);
      const landingVSpeedGroup = this.props.vSpeedSettingManager.vSpeedGroups.get(VSpeedGroupType.Landing);

      const takeoffVSpeeds = takeoffVSpeedGroup
        ? takeoffVSpeedGroup.vSpeedDefinitions.map(def => def.name)
        : [];

      const landingVSpeeds = landingVSpeedGroup
        ? landingVSpeedGroup.vSpeedDefinitions.map(def => def.name)
        : [];

      if (takeoffVSpeeds.length > 0 || landingVSpeeds.length > 0) {
        this.vSpeedAnnunciationDataProvider = new DefaultVSpeedAnnunciationDataProvider(
          this.props.bus,
          this.props.vSpeedSettingManager,
          takeoffVSpeeds,
          landingVSpeeds
        );
      }
    }
  }

  /** @inheritdoc */
  public onAfterRender(): void {
    this.dataProvider.init();
    this.vSpeedAnnunciationDataProvider?.init();

    if (this.props.pfdIndex === 1) {
      this.dataProvider.overspeedThreshold.sub(v => {
        SimVar.SetGameVarValue('AIRCRAFT_MAXSPEED_OVERRIDE', SimVarValueType.Knots, v);
      });
    }
  }

  /** @inheritdoc */
  public render(): VNode {
    const vSpeedBugDefinitions = this.props.config.vSpeedBugConfigs?.map(config => config.resolve()(this.props.vSpeedSettingManager.vSpeedGroups))
      .filter(def => def !== undefined) as VSpeedBugDefinition[] ?? [];

    return (
      <BaseAirspeedIndicator
        ref={this.ref}
        dataProvider={this.dataProvider}
        vSpeedAnnunciationDataProvider={this.vSpeedAnnunciationDataProvider}
        declutter={this.props.declutter}
        tapeScaleOptions={this.props.config.tapeScaleOptions}
        colorRanges={this.props.config.colorRangeDefinitions ?? []}
        bottomDisplayOptions={this.props.config.bottomDisplayOptions}
        trendVectorOptions={{ trendThreshold: 1 }}
        airspeedAlertOptions={{
          supportOverspeed: true,
          supportTrendOverspeed: true,
          supportUnderspeed: true,
          supportTrendUnderspeed: true
        }}
        vSpeedBugOptions={{
          vSpeedSettingManager: this.props.vSpeedSettingManager,
          vSpeedBugDefinitions
        }}
        approachCueBugOptions={this.props.config.approachCueBugOptions}
      />
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();

    this.ref.getOrDefault()?.destroy();
    this.dataProvider.destroy();
  }
}
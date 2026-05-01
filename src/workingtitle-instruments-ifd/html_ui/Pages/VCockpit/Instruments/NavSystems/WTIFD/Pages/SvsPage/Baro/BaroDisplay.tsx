import { ComponentProps, ConsumerSubject, EventBus, FSComponent, LifecycleComponent, MappedSubject, UnitType, VNode } from '@microsoft/msfs-sdk';

import { UnitsPressureSettingMode, UnitsUserSettings } from '../../../Settings/UnitsUserSettings';
import { ExternalAdcSystemEvents } from '../../../Systems/ExternalAdcSystem';

/** The properties for the {@link BaroDisplay} component. */
interface BaroDisplayProps extends ComponentProps {
  /** The event bus. */
  readonly bus: EventBus;
}

/** The BaroDisplay component. */
export class BaroDisplay extends LifecycleComponent<BaroDisplayProps> {
  private readonly unitsSettings = UnitsUserSettings.getManager(this.props.bus);

  private readonly baroSettingHg = ConsumerSubject.create(this.props.bus.getSubscriber<ExternalAdcSystemEvents>().on('ext_adc_altimeter_baro_setting_inhg'), 29.92);

  private readonly baroSetting = MappedSubject.create(([inhg, unit]) =>
    unit === UnitsPressureSettingMode.InHg ? inhg.toFixed(2) : UnitType.HPA.convertFrom(inhg, UnitType.IN_HG).toFixed(0),
    this.baroSettingHg,
    this.unitsSettings.getSetting('unitsPressure')
  );

  private readonly labelsMap: Record<UnitsPressureSettingMode, string> = {
    [UnitsPressureSettingMode.InHg]: ' In Hg',
    [UnitsPressureSettingMode.Millibars]: 'MB',
    [UnitsPressureSettingMode.hPa]: 'hPa',
  };

  /** @inheritdoc */
  public render(): VNode {
    return (
      <>
        Baro
        <br />
        <span style="color: var(--lsk-button-value-color)">
          <span class="baro-setting">
            {this.baroSetting.map((v) => v).withLifecycle(this.defaultLifecycle)}
          </span>
          <span class="baro-unit">
            {this.unitsSettings.getSetting('unitsPressure')
              .map((unit) => this.labelsMap[unit])
              .withLifecycle(this.defaultLifecycle)}
          </span>
        </span>
      </>
    );
  }
}

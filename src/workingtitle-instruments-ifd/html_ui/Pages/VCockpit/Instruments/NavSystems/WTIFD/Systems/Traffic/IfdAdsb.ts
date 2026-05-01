import { Adsb, AdsbOperatingMode } from '@microsoft/msfs-sdk';

import { TrafficUserSettings } from '../../Settings/TrafficUserSettings';

/**
 * IFD ADS-B system.
 */
export class IfdAdsb extends Adsb {
  private readonly adsbEnabledSetting = TrafficUserSettings.getManager(this.bus).getSetting('trafficAdsbEnabled');

  /** @inheritdoc */
  public init(): void {
    super.init();

    this.adsbEnabledSetting.sub(isEnabled => {
      // TODO: Support surface mode
      this.operatingMode.set(isEnabled ? AdsbOperatingMode.Airborne : AdsbOperatingMode.Standby);
    }, true);
  }
}

import {
  APLateralModes, APModeType, APStateManager, APVerticalModes, ControlEvents, KeyEventData, KeyEventManager, NavSourceType, SimVarValueType
} from '@microsoft/msfs-sdk';

/**
 * A WT Line autopilot state manager.
 */
export class WTLineAPStateManager extends APStateManager {
  private vsLastPressed = 0;

  /** @inheritdoc */
  protected onAPListenerRegistered(): void {
    super.onAPListenerRegistered();

    // const hEvent = this.bus.getSubscriber<HEvent>();
    // hEvent.on('hEvent').handle((e: string) => {
    //     if (e === 'AS1000_VNAV_TOGGLE') {
    //         this.toggleVnav();
    //     }
    // });
  }

  /** @inheritdoc */
  protected setupKeyIntercepts(manager: KeyEventManager): void {
    //AP master status
    manager.interceptKey('AP_MASTER', false);
    manager.interceptKey('AUTOPILOT_ON', false);
    manager.interceptKey('AUTOPILOT_OFF', false);
    manager.interceptKey('AUTOPILOT_DISENGAGE_SET', true);
    manager.interceptKey('AUTOPILOT_DISENGAGE_TOGGLE', true);

    //alt modes
    manager.interceptKey('AP_ALT_HOLD', false);
    manager.interceptKey('AP_ALT_HOLD_ON', false);
    manager.interceptKey('AP_ALT_HOLD_OFF', false);

    manager.interceptKey('AP_PANEL_ALTITUDE_HOLD', false);
    manager.interceptKey('AP_PANEL_ALTITUDE_ON', false);
    manager.interceptKey('AP_PANEL_ALTITUDE_OFF', false);
    manager.interceptKey('AP_PANEL_ALTITUDE_SET', false);

    //vs modes
    manager.interceptKey('AP_PANEL_VS_HOLD', false);
    manager.interceptKey('AP_PANEL_VS_ON', false);
    manager.interceptKey('AP_PANEL_VS_OFF', false);
    manager.interceptKey('AP_PANEL_VS_SET', false);

    manager.interceptKey('AP_VS_HOLD', false);
    manager.interceptKey('AP_VS_ON', false);
    manager.interceptKey('AP_VS_OFF', false);
    manager.interceptKey('AP_VS_SET', false);

    //pitch modes
    manager.interceptKey('AP_ATT_HOLD', false);
    manager.interceptKey('AP_ATT_HOLD_ON', false);
    manager.interceptKey('AP_ATT_HOLD_OFF', false);

    manager.interceptKey('AP_PITCH_LEVELER', false);
    manager.interceptKey('AP_PITCH_LEVELER_ON', false);
    manager.interceptKey('AP_PITCH_LEVELER_OFF', false);

    //roll modes
    manager.interceptKey('AP_BANK_HOLD', false);
    manager.interceptKey('AP_BANK_HOLD_ON', false);
    manager.interceptKey('AP_BANK_HOLD_OFF', false);

    manager.interceptKey('AP_WING_LEVELER', false);
    manager.interceptKey('AP_WING_LEVELER_ON', false);
    manager.interceptKey('AP_WING_LEVELER_OFF', false);

    //flc modes
    manager.interceptKey('FLIGHT_LEVEL_CHANGE', false);
    manager.interceptKey('FLIGHT_LEVEL_CHANGE_ON', false);
    manager.interceptKey('FLIGHT_LEVEL_CHANGE_OFF', false);

    //nav modes
    manager.interceptKey('AP_NAV1_HOLD', false);
    manager.interceptKey('AP_NAV1_HOLD_ON', false);
    manager.interceptKey('AP_NAV1_HOLD_OFF', false);

    manager.interceptKey('AP_NAV_SELECT_SET', false);
    manager.interceptKey('TOGGLE_GPS_DRIVES_NAV1', false);

    //hdg modes
    manager.interceptKey('AP_HDG_HOLD', false);
    manager.interceptKey('AP_HDG_HOLD_ON', false);
    manager.interceptKey('AP_HDG_HOLD_OFF', false);

    manager.interceptKey('AP_PANEL_HEADING_HOLD', false);
    manager.interceptKey('AP_PANEL_HEADING_ON', false);
    manager.interceptKey('AP_PANEL_HEADING_OFF', false);
    manager.interceptKey('AP_PANEL_HEADING_SET', false);

    //bank modes
    manager.interceptKey('AP_BANK_HOLD', false);
    manager.interceptKey('AP_BANK_HOLD_ON', false);
    manager.interceptKey('AP_BANK_HOLD_OFF', false);

    //appr modes
    manager.interceptKey('AP_LOC_HOLD', false);
    manager.interceptKey('AP_LOC_HOLD_ON', false);
    manager.interceptKey('AP_LOC_HOLD_OFF', false);

    manager.interceptKey('AP_APR_HOLD', false);
    manager.interceptKey('AP_APR_HOLD_ON', false);
    manager.interceptKey('AP_APR_HOLD_OFF', false);

    manager.interceptKey('AP_BC_HOLD', false);
    manager.interceptKey('AP_BC_HOLD_ON', false);
    manager.interceptKey('AP_BC_HOLD_OFF', false);

    //baro set intercept
    manager.interceptKey('BAROMETRIC', true);

    //TOGA intercept
    manager.interceptKey('AUTO_THROTTLE_TO_GA', false);
  }

  /** @inheritdoc */
  protected handleKeyIntercepted({ key, value0 }: KeyEventData): void {
    switch (key) {
      case 'AP_MASTER': {
        // We get the AP master state directly from the simvar instead of the apMasterOn subject because the subject
        // is only updated at the glass cockpit refresh rate, and we want the most up-to-date state possible.
        const isApMasterOn = SimVar.GetSimVarValue('AUTOPILOT MASTER', SimVarValueType.Bool);
        this.onApMasterStatusEvent(key, !isApMasterOn, isApMasterOn);
        break;
      }
      case 'AUTOPILOT_ON':
        // We get the AP master state directly from the simvar instead of the apMasterOn subject because the subject
        // is only updated at the glass cockpit refresh rate, and we want the most up-to-date state possible.
        this.onApMasterStatusEvent(key, true, SimVar.GetSimVarValue('AUTOPILOT MASTER', SimVarValueType.Bool));
        break;
      case 'AUTOPILOT_OFF':
        // We get the AP master state directly from the simvar instead of the apMasterOn subject because the subject
        // is only updated at the glass cockpit refresh rate, and we want the most up-to-date state possible.
        this.onApMasterStatusEvent(key, false, SimVar.GetSimVarValue('AUTOPILOT MASTER', SimVarValueType.Bool));
        break;
      case 'AUTOPILOT_DISENGAGE_TOGGLE':
      case 'AUTOPILOT_DISENGAGE_SET': {
        // We get the AP master state directly from the simvar instead of the apMasterOn subject because the subject
        // is only updated at the glass cockpit refresh rate, and we want the most up-to-date state possible.
        const isApMasterOn = SimVar.GetSimVarValue('AUTOPILOT MASTER', SimVarValueType.Bool);
        if (isApMasterOn) {
          this.onApMasterStatusEvent(key, false, isApMasterOn);
        }
        break;
      }

      case 'AP_NAV1_HOLD':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.NAV);
        break;
      case 'AP_NAV1_HOLD_ON':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.NAV, true);
        break;
      case 'AP_NAV1_HOLD_OFF':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.NAV, false);
        break;

      case 'AP_LOC_HOLD':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.LOC);
        break;
      case 'AP_LOC_HOLD_ON':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.LOC, true);
        break;
      case 'AP_LOC_HOLD_OFF':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.LOC, false);
        break;

      case 'AP_APR_HOLD':
        this.sendApModeEvent(APModeType.APPROACH);
        break;
      case 'AP_APR_HOLD_ON':
        this.sendApModeEvent(APModeType.APPROACH, undefined, true);
        break;
      case 'AP_APR_HOLD_OFF':
        this.sendApModeEvent(APModeType.APPROACH, undefined, false);
        break;

      case 'AP_BC_HOLD':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.BC);
        break;
      case 'AP_BC_HOLD_ON':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.BC, true);
        break;
      case 'AP_BC_HOLD_OFF':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.BC, false);
        break;

      case 'AP_HDG_HOLD':
      case 'AP_PANEL_HEADING_HOLD':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.HEADING);
        break;
      case 'AP_PANEL_HEADING_ON':
      case 'AP_HDG_HOLD_ON':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.HEADING, true);
        break;
      case 'AP_PANEL_HEADING_OFF':
      case 'AP_HDG_HOLD_OFF':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.HEADING, false);
        break;
      case 'AP_PANEL_HEADING_SET':
        if (value0 !== undefined) {
          this.sendApModeEvent(APModeType.LATERAL, APLateralModes.HEADING, value0 === 1 ? true : false);
        }
        break;
      case 'AP_BANK_HOLD':
      case 'AP_BANK_HOLD_ON':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.ROLL, true);
        break;
      case 'AP_WING_LEVELER':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.LEVEL);
        break;
      case 'AP_WING_LEVELER_ON':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.LEVEL, true);
        break;
      case 'AP_WING_LEVELER_OFF':
        this.sendApModeEvent(APModeType.LATERAL, APLateralModes.LEVEL, false);
        break;
      case 'AP_PANEL_VS_HOLD':
      case 'AP_VS_HOLD':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.VS);
        break;
      case 'AP_PANEL_VS_ON':
      case 'AP_VS_ON':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.VS, true);
        break;
      case 'AP_PANEL_VS_OFF':
      case 'AP_VS_OFF':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.VS, false);
        break;
      case 'AP_PANEL_VS_SET':
      case 'AP_VS_SET':
        // TODO Remove this when the Bravo default mapping is fixed.
        if (value0 !== undefined && this.vsLastPressed < Date.now() - 100) {
          this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.VS, value0 === 1 ? true : false);
        }
        this.vsLastPressed = Date.now();
        break;
      case 'AP_ALT_HOLD':
      case 'AP_PANEL_ALTITUDE_HOLD':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.ALT);
        break;
      case 'AP_ALT_HOLD_ON':
      case 'AP_PANEL_ALTITUDE_ON':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.ALT, true);
        break;
      case 'AP_ALT_HOLD_OFF':
      case 'AP_PANEL_ALTITUDE_OFF':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.ALT, false);
        break;
      case 'AP_PANEL_ALTITUDE_SET':
        if (value0 !== undefined) {
          this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.ALT, value0 === 1 ? true : false);
        }
        break;
      case 'FLIGHT_LEVEL_CHANGE':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.FLC);
        break;
      case 'FLIGHT_LEVEL_CHANGE_ON':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.FLC, true);
        break;
      case 'FLIGHT_LEVEL_CHANGE_OFF':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.FLC, false);
        break;
      case 'AP_NAV_SELECT_SET':
        this.onApNavSelectSet(value0);
        break;
      case 'TOGGLE_GPS_DRIVES_NAV1':
        this.onToggleGpsDrivesNav();
        break;
      case 'BAROMETRIC':
        this.onBarometric();
        break;
      case 'AUTO_THROTTLE_TO_GA':
        this.sendApModeEvent(APModeType.VERTICAL, APVerticalModes.TO);
    }
  }

  /**
   * Responds to an AP NAV SELECT SET key event
   * @param value The value to set
   */
  protected onApNavSelectSet(value?: number): void {
    if (value !== undefined && value >= 1 && value <= 2) {
      this.bus.getPublisher<ControlEvents>().pub('cdi_src_set', { type: NavSourceType.Nav, index: value }, true);
    }
  }

  /**
   * Responds to a TOGGLE GPS DRIVES NAV1 key event
   */
  protected onToggleGpsDrivesNav(): void {
    this.bus.getPublisher<ControlEvents>().pub('cdi_src_gps_toggle', true, true);
  }

  /**
   * Responds to a BAROMETRIC key event
   */
  protected onBarometric(): void {
    this.bus.getPublisher<ControlEvents>().pub('baro_set', true, true);
  }

  /**
   * Responds to when an key event that changes the master autopilot status is intercepted.
   * @param key The intercepted key event.
   * @param commandedState The autopilot activation state commanded by the key event.
   * @param currentState The current autopilot activation state.
   */
  protected onApMasterStatusEvent(key: string, commandedState: boolean, currentState: boolean): void {
    if (!commandedState && !currentState) {
      SimVar.SetSimVarValue('L:WT_Boeing_Autopilot_Disconnected', SimVarValueType.Bool, 0);
    }
    this.setApMasterStatus(key, commandedState, currentState);
  }

  /**
   * Sets the master autopilot status in response to an intercepted key event.
   * @param key The intercepted key event.
   * @param commandedState The autopilot activation state commanded by the key event.
   * @param currentState The current autopilot activation state.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected setApMasterStatus(key: string, commandedState: boolean, currentState: boolean): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.keyEventManager!.triggerKey(commandedState ? 'AUTOPILOT_ON' : 'AUTOPILOT_OFF', true);
    // if (commandedState) {
    //   SimVar.SetSimVarValue('K:AUTOPILOT_ON', SimVarValueType.Bool, 1);
    // } else {
    //   SimVar.SetSimVarValue('K:AUTOPILOT_OFF', SimVarValueType.Bool, 1);
    // }

  }


}

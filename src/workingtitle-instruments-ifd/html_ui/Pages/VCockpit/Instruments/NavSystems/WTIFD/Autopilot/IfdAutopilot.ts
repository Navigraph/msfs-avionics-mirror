import { APAltitudeModes, APLateralModes, APModePressEvent, APVerticalModes, Autopilot, DirectorState, EventBus, FlightPlanner, Subject } from '@microsoft/msfs-sdk';

import { IfdAPConfig } from './IfdAPConfig';
import { IfdAPStateManager } from './IfdAPStateManager';

/**
 * An optional autopilot that mimics an external autopilot for use with the IFD.
 */
export class IfdAutopilot extends Autopilot {
  private readonly isPowered = Subject.create(true);

  /** @inheritdoc */
  constructor(
    bus: EventBus,
    flightPlanner: FlightPlanner,
    protected readonly config: IfdAPConfig,
    public readonly stateManager: IfdAPStateManager,
  ) {
    super(bus, flightPlanner, config, stateManager);
  }

  /** @inheritdoc */
  protected override onInitialized(): void {
    this.bus.pub('vnav_enabled', true);

    this.isPowered.sub((isPowered) => {
      if (!isPowered) {
        if (this.stateManager.apMasterOn.get()) {
          this.stateManager.disengageAutopilot();
        }
        if (this.stateManager.isFlightDirectorOn.get()) {
          this.stateManager.setFlightDirector(false);
        }
      }
    });
  }

  /** @inheritdoc */
  protected override handleApFdStateChange(): void {
    const ap = this.stateManager.apMasterOn.get();
    const fd = this.stateManager.isFlightDirectorOn.get();
    const apConfig = this.config as IfdAPConfig;
    if (ap && !fd) {
      this.stateManager.setFlightDirector(true);
    } else if (!ap && !fd) {
      this.lateralModes.forEach((mode) => {
        if (mode.state !== DirectorState.Inactive) {
          mode.deactivate();
        }
      });
      this.verticalModes.forEach((mode) => {
        if (mode.state !== DirectorState.Inactive) {
          mode.deactivate();
        }
      });
      this.apValues.lateralActive.set(APLateralModes.NONE);
      this.apValues.lateralArmed.set(APLateralModes.NONE);
      this.apValues.verticalActive.set(APVerticalModes.NONE);
      this.apValues.verticalArmed.set(APVerticalModes.NONE);
      this.verticalApproachArmed = APVerticalModes.NONE;
      this.verticalAltitudeArmed = APAltitudeModes.NONE;
      this.altCapArmed = false;
    } else if (!ap && fd && !apConfig.supportFlightDirector) {
      this.stateManager.setFlightDirector(false);
    }
  }

  /** @inheritdoc */
  protected override lateralPressed(data: APModePressEvent): void {
    if (this.isPowered.get()) {
      super.lateralPressed(data);
    }
  }

  /** @inheritdoc */
  protected override verticalPressed(data: APModePressEvent): void {
    if (this.isPowered.get()) {
      super.verticalPressed(data);
    }
  }

  /** @inheritdoc */
  protected override approachPressed(set?: boolean): void {
    if (this.isPowered.get()) {
      super.approachPressed(set);
    }
  }
}

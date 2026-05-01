import {
  ConsumerSubject, EventBus, ExpSmoother, Instrument, MathUtils, MutableAccessible, MutableSubscribable, RegisteredSimVarUtils, SimVarValueType, Subject,
  Subscribable, UserSettingManager
} from '@microsoft/msfs-sdk';

import { IfdIndex } from '../IfdContainer';
import { DimmerParameters, DimmingCurve, DimmingOptions } from '../IfdOptions';
import { IfdPageName } from '../Pages/IfdPage';
import { IlluminationDimmingSource, IlluminationUserSettingTypes } from '../Settings/IlluminationUserSettings';
import { IfdCasMessagePriority } from '../Systems/Cas/CasMessages';
import { IfdCasAlertManager } from '../Systems/Cas/IfdCasAlertManager';
import { IfdPowerEvents } from './IfdPowerMonitor';
import { IfdIlluminationEvents, IfdIlluminationMode } from '../Events/IfdIlluminationEvents';

enum ButtonColour {
  Off,
  White,
  Green,
  Cyan,
  Yellow,
  Red,
}

/** State of a page button. */
interface PageButtonState {
  /** The current colour of the button illumination. */
  colour: MutableSubscribable<ButtonColour>;
}

/** Current dimming state for bezel or display. */
interface DimmerState {
  /** Whether the lighting is enabled or not. Defaults to true. */
  enabled?: boolean;
  /** Current brightness level in the range 0-1. */
  brightness: MutableSubscribable<number>,
  /** The local var to output brightness to the model behaviours. */
  brightnessVar: MutableAccessible<number>,
  /** The current source setting. */
  source: Subscribable<IlluminationDimmingSource>,
  /** The current manual setting in the range 0-100. */
  manualBrightness: Subscribable<number>,
  /** Photocell brightness filter. */
  photoCellFilter: ExpSmoother,
  /** The options for this dimmer. */
  options: DimmerParameters,
}

/** A manager for the IFD instrument illumination, including button backlights. */
export class IfdIlluminationManager implements Instrument {
  private static readonly DAYLIGHT_LUX = 8000;
  private static readonly DIMBUS_AVICURVE_BREAK = 0.05;
  private static readonly NIGHT_MODE_THRESHOLD = 0.3;

  private readonly publisher = this.bus.getPublisher<IfdIlluminationEvents>();

  private readonly isIfdPowered = ConsumerSubject.create(this.bus.getSubscriber<IfdPowerEvents>().on('ifd_powered'), false);

  private readonly modeDimBus = Subject.create(IfdIlluminationMode.Day);
  private readonly modePhotocell = Subject.create(IfdIlluminationMode.Day);

  private static readonly CAS_PRIORITY_TO_BUTTON_COLOUR = new Map<IfdCasMessagePriority, ButtonColour>([
    [IfdCasMessagePriority.Warning, ButtonColour.Red],
    [IfdCasMessagePriority.Caution, ButtonColour.Yellow],
    [IfdCasMessagePriority.Advisory, ButtonColour.Cyan],
    [IfdCasMessagePriority.Notice, ButtonColour.Green],
  ]);

  private readonly buttonStates = new Map<IfdPageName, PageButtonState>([
    [IfdPageName.AUX, IfdIlluminationManager.createButtonState(this.ifdIndex, IfdPageName.AUX)],
    [IfdPageName.FMS, IfdIlluminationManager.createButtonState(this.ifdIndex, IfdPageName.FMS)],
    [IfdPageName.MAP, IfdIlluminationManager.createButtonState(this.ifdIndex, IfdPageName.MAP)],
    [IfdPageName.SVS, IfdIlluminationManager.createButtonState(this.ifdIndex, IfdPageName.SVS)],
  ]);

  /**
   * Creates a button state.
   * @param index The index of the IFD.
   * @param button The button name.
   * @returns The new button state.
   */
  private static createButtonState(index: number, button: IfdPageName): PageButtonState {
    const colourVar = RegisteredSimVarUtils.create(`L:1:WT_IFD_${index}_${button}_COLOUR`, SimVarValueType.Enum);
    const colour = Subject.create(ButtonColour.White);
    colour.sub((v) => colourVar.set(v), true);
    return { colour };
  }

  private readonly activeSimDuration = RegisteredSimVarUtils.create('E:SIMULATION TIME', SimVarValueType.Seconds);

  private readonly bezelState: DimmerState = {
    enabled: false,
    brightnessVar: RegisteredSimVarUtils.create(`L:1:WT_IFD_${this.ifdIndex}_BEZEL_BRIGHTNESS`, SimVarValueType.PercentOver100),
    brightness: Subject.create(1.0),
    source: this.illuminationSettings.getSetting('bezelDimmingSource'),
    manualBrightness: this.illuminationSettings.getSetting('bezelManualBrightness'),
    photoCellFilter: new ExpSmoother(this.dimmingOptions.bezel.photoResponseTime / Math.LN2),
    options: this.dimmingOptions.bezel,
  };

  private readonly pageKeyState: DimmerState = {
    enabled: false,
    brightnessVar: RegisteredSimVarUtils.create(`L:1:WT_IFD_${this.ifdIndex}_PAGE_BRIGHTNESS`, SimVarValueType.PercentOver100),
    brightness: Subject.create(1.0),
    source: this.illuminationSettings.getSetting('bezelDimmingSource'),
    manualBrightness: this.illuminationSettings.getSetting('bezelManualBrightness'),
    photoCellFilter: new ExpSmoother(this.dimmingOptions.bezel.photoResponseTime / Math.LN2),
    options: this.dimmingOptions.bezel,
  };

  private readonly displayState: DimmerState = {
    enabled: false,
    brightnessVar: RegisteredSimVarUtils.create(`L:1:WT_IFD_${this.ifdIndex}_DISPLAY_BRIGHTNESS`, SimVarValueType.PercentOver100),
    brightness: Subject.create(1.0),
    source: this.illuminationSettings.getSetting('displayDimmingSource'),
    manualBrightness: this.illuminationSettings.getSetting('displayManualBrightness'),
    photoCellFilter: new ExpSmoother(this.dimmingOptions.display.photoResponseTime / Math.LN2),
    options: this.dimmingOptions.display,
  };

  private readonly ambientLightSensorVar = RegisteredSimVarUtils.create('AMBIENT LIGHT SENSOR', SimVarValueType.Number);
  private readonly potentiometerVar = RegisteredSimVarUtils.create(`LIGHT POTENTIOMETER:${this.dimmingOptions.dimmingPotentiometerIndex}`, SimVarValueType.PercentOver100);

  private lastSimDuration?: number;

  /**
   * Constructs a new illumination manager.
   * @param bus The instrument event bus.
   * @param ifdIndex The IFD instrument index.
   * @param dimmingOptions The IFD configuration options.
   * @param illuminationSettings The IFD illumination settings manager.
   * @param activePage The currently active page.
   * @param casAlertManager The CAS alert manager.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly ifdIndex: IfdIndex,
    private readonly dimmingOptions: DimmingOptions,
    private readonly illuminationSettings: UserSettingManager<IlluminationUserSettingTypes>,
    private readonly activePage: Subscribable<IfdPageName | undefined>,
    private readonly casAlertManager: IfdCasAlertManager,
  ) { }

  /** @inheritdoc */
  public init(): void {
    this.bezelState.brightness.sub((v) => this.bezelState.brightnessVar.set(v), true);
    this.pageKeyState.brightness.sub((v) => this.pageKeyState.brightnessVar.set(v), true);
    this.displayState.brightness.sub((v) => this.displayState.brightnessVar.set(v), true);

    this.isIfdPowered.sub((v) => this.displayState.enabled = v, true);

    this.modeDimBus.sub((v) => this.publisher.pub('ifd_illumination_mode_dimbus', v, false, true), true);
    this.modePhotocell.sub((v) => this.publisher.pub('ifd_illumination_mode_photocell', v, false, true), true);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    const simDuration = this.activeSimDuration.get();
    const deltaTime = this.lastSimDuration !== undefined ? simDuration - this.lastSimDuration : 0;
    this.lastSimDuration = simDuration;

    this.updatePageButtons(simDuration);
    this.updateDimming(this.bezelState, deltaTime);
    this.updateDimming(this.pageKeyState, deltaTime);
    this.updateDimming(this.displayState, deltaTime);

    this.updateMode();
  }

  /**
   * Sets the state of the bezel key illumination (on the sides).
   * @param enabled Whether the illumination is enabled.
   */
  public setBezelKeyIllumination(enabled: boolean): void {
    this.bezelState.enabled = enabled;
  }

  /**
   * Sets the state of the page key key illumination (on the bottom).
   * @param enabled Whether the illumination is enabled.
   */
  public setPageKeyIllumination(enabled: boolean): void {
    this.pageKeyState.enabled = enabled;
  }

  /**
   * Updates the page button colours.
   * @param activeSimDuration Time in ms since the simulation began.
   */
  private updatePageButtons(activeSimDuration: number): void {
    const activePage = this.activePage.get();
    const highestActiveCasPriority = this.casAlertManager.highestActivePriority.get();

    for (const [key, state] of this.buttonStates.entries()) {
      if (this.pageKeyState.enabled === false) {
        // when not powered we want to hide any coloured albedo as well as turning off the emissive
        state.colour.set(ButtonColour.White);
      } else if (key === IfdPageName.AUX && highestActiveCasPriority !== undefined) {
        if (this.casAlertManager.highestPriorityUnacknowledgedAlert.get() !== undefined && (activeSimDuration * 1000) % 1000 >= 500) {
          state.colour.set(key === activePage ? ButtonColour.Green : ButtonColour.White);
        } else {
          state.colour.set(IfdIlluminationManager.CAS_PRIORITY_TO_BUTTON_COLOUR.get(highestActiveCasPriority) ?? ButtonColour.White);
        }
      } else if (key === activePage) {
        state.colour.set(ButtonColour.Green);
      } else {
        state.colour.set(ButtonColour.White);
      }
    }
  }

  /**
   * Updates a dimming state.
   * @param state The state to update.
   * @param deltaTime Time in ms since last update.
   */
  private updateDimming(state: DimmerState, deltaTime: number): void {
    const ambientBrightness = this.ambientLightSensorVar.get();
    const photocellBrightness = state.photoCellFilter.next(MathUtils.clamp(ambientBrightness / IfdIlluminationManager.DAYLIGHT_LUX, 0, 1), deltaTime);

    const source = state.source.get();

    let brightnessPercent: number;

    if (state.enabled === false) {
      brightnessPercent = 0;
    } else if (source === IlluminationDimmingSource.Manual) {
      brightnessPercent = state.manualBrightness.get();
    } else if (source === IlluminationDimmingSource.Photocell && (state.options.busTransition === 0 || photocellBrightness * 100 >= state.options.busTransition)) {
      brightnessPercent = MathUtils.lerp(photocellBrightness * state.options.photoSlope, 0, 100, state.options.photoMinimum, state.options.photoMaximum, true, true);
    } else { // Dimming bus. Photocell falls back to dimming bus below the transition value.
      const dimBusBrightness = this.potentiometerVar.get();
      if (state.options.busCurve === DimmingCurve.Proportional) {
        brightnessPercent = MathUtils.lerp(dimBusBrightness * state.options.busSlope, 0, 100, state.options.busMinimum, state.options.busMaximum, true, true);
      } else if (dimBusBrightness < IfdIlluminationManager.DIMBUS_AVICURVE_BREAK) {
        brightnessPercent = state.options.busMaximum;
      } else {
        brightnessPercent = MathUtils.lerp(
          (dimBusBrightness - IfdIlluminationManager.DIMBUS_AVICURVE_BREAK) / (1 - IfdIlluminationManager.DIMBUS_AVICURVE_BREAK) * state.options.busSlope,
          0, 100, state.options.busMinimum, state.options.busMaximum, true, true
        );
      }
    }

    state.brightness.set(MathUtils.round(brightnessPercent / 100, 0.01));
  }

  /** Updates the current illumination mode. */
  private updateMode(): void {
    const brightness = this.displayState.brightness.get();
    this.modeDimBus.set(brightness < IfdIlluminationManager.NIGHT_MODE_THRESHOLD ? IfdIlluminationMode.Night : IfdIlluminationMode.Day);
    const photocellLux = this.ambientLightSensorVar.get();
    this.modePhotocell.set(photocellLux >= IfdIlluminationManager.DAYLIGHT_LUX ? IfdIlluminationMode.Day : IfdIlluminationMode.Night);
  }
}

import { DisplayComponent, EventBus, FacilityLoader, FacilityType, FlightPlanner, FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';

import { IfdChartsManager } from './Charts/IfdChartsManager';
import { AlertBox } from './Components/AlertBox/AlertBox';
import { ComPresetInfoBox } from './Components/ComPresetInfoBox/ComPresetInfoBox';
import { ConfirmPopup } from './Components/ConfirmPopup/ConfirmPopup';
import { LeftBar } from './Components/LeftBar/LeftBar';
import { IfdMapPresetService } from './Components/Map/IfdMapPresetService';
import { NavSourceBlock } from './Components/NavSourceBlock/NavSourceBlock';
import { PowerDownWarning } from './Components/PowerDownWarning/PowerDownWarning';
import { DatablockService } from './Datablocks/DatablocksService';
import { TopBarDatablocksContainer } from './Datablocks/TopBarDatablocksContainer';
import { IfdTuningControlsManager } from './Events/IfdTuningControlsManager';
import { FlightPlanListManager, FlightPlanStore } from './FlightPlan';
import { Fms } from './Fms';
import { IfdOptions } from './IfdOptions';
import { VirtualKeyboardState } from './Keyboard/KeyboardState';
import { IfdKeyboardControlEvents, NumericEditRowKeyboardEvent, TextEditRowKeyboardEvent, VirtualKeyboardType } from './Keyboard/KeyboardTypes';
import { VirtualKeyboard } from './Keyboard/VirtualKeyboard';
import { LineSelectKeyButtons } from './LineSelectKeyButtons';
import { FmsHooksManager } from './Navigation/FmsHooksManager';
import { IfdNearestContext } from './Navigation/IfdNearestContext';
import { IfdNavSources } from './Navigation/Sources/IfdNavSources';
import { NavRadioNavSource } from './Navigation/Sources/NavRadioNavSource';
import { IfdPageName } from './Pages/IfdPage';
import { IfdPages } from './Pages/IfdPages';
import { PageContainer } from './Pages/PageContainer';
import { SvsFullscreenContainer } from './Pages/SvsPage/SvsFullscreenContainer';
import { MapDataProvider } from './Providers/Map/MapDataProvider';
import { RightKnobLabel } from './RightKnob';
import { IfdCasAlertManager } from './Systems/Cas/IfdCasAlertManager';
import { TimerManager } from './Systems/Timer/TimerManager';
import { TrafficSystem } from './Systems/Traffic/TrafficSystem';
import { IfdDataProvider } from './Utilities/IfdDataProvider';
import { IfdViewService } from './ViewService';

import './IfdContainer.css';

/**
 * IFD index in case there are multiple IFD's in the aircraft.
 */
export type IfdIndex = number;

/**
 * Props for {@link IfdContainer}
 */
export interface IfdContainerProps {
  /** The index of the IFD */
  readonly index: IfdIndex;
  /** The event bus instance */
  readonly bus: EventBus;
  /** The IfdTuningControlManager instance */
  readonly ifdTuningControlManager: IfdTuningControlsManager;
  /** The IFD options. */
  readonly ifdOptions: IfdOptions;
  /** The facility loader instance */
  readonly facilityLoader: FacilityLoader;
  /** The fms instance */
  readonly fms: Fms;
  /** The flight plan store to use. */
  readonly flightPlanStore: FlightPlanStore;
  /** The flight plan list to use. */
  readonly flightPlanListManager: FlightPlanListManager;
  /** An instance of the flight planner. */
  readonly flightPlanner: FlightPlanner;
  /** An instance of the CAS alert manager. */
  readonly casAlertManager: IfdCasAlertManager;
  /** An instance of the IFD data provider */
  readonly dataProvider: IfdDataProvider;
  /** An instance of the Traffic system */
  readonly trafficSystem?: TrafficSystem;
  /** An instance of the view service. */
  readonly viewService: IfdViewService;
  /** The map data provider. */
  readonly mapDataProvider: MapDataProvider;
  /** The IFD specific nearest context */
  readonly nearestContext: IfdNearestContext;
  /** The timer manager */
  readonly timerManager: TimerManager;
  /** The FMS hooks manager. */
  readonly fmsHooks: FmsHooksManager;
  /** The IFD charts manager */
  readonly chartsManager: IfdChartsManager;
  /** The nav radio source, if any. */
  readonly vlocSource: NavRadioNavSource<IfdNavSources> | undefined;
  /** The map preset service. */
  readonly mapPresetService: IfdMapPresetService;
}

/**
 * Main IFD component
 */
export class IfdContainer extends DisplayComponent<IfdContainerProps> {
  private readonly datablockService = new DatablockService(
    this.props.bus,
    this.props.mapDataProvider,
    this.props.flightPlanner,
    this.props.trafficSystem,
    this.props.facilityLoader,
    this.props.viewService,
    this.props.ifdTuningControlManager,
    this.props.ifdOptions,
    this.props.timerManager,
    this.props.casAlertManager,
    this.props.vlocSource,
    this.props.flightPlanStore,
    this.props.dataProvider,
  );

  private readonly viewContainerRef = FSComponent.createRef<PageContainer>();
  private readonly svsFullscreenContainerRef = FSComponent.createRef<SvsFullscreenContainer>();
  private readonly lskButtonsRef = FSComponent.createRef<LineSelectKeyButtons>();

  // Virtual Keyboard state
  private readonly keyboardState = VirtualKeyboardState.getInstance();

  /** @inheritDoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.viewService.setPageContainer(this.viewContainerRef);
    this.props.viewService.setSvsFullscreenContainer(this.svsFullscreenContainerRef);
    this.props.viewService.setLskButtonsRef(this.lskButtonsRef);

    IfdPages.registerPages(
      this.props.bus,
      this.props.viewService,
      this.props.fms,
      this.props.trafficSystem,
      this.props.flightPlanStore,
      this.props.flightPlanListManager,
      this.props.flightPlanner,
      this.props.casAlertManager,
      this.props.dataProvider,
      this.props.ifdOptions,
      this.props.facilityLoader,
      this.props.mapDataProvider,
      this.props.ifdTuningControlManager,
      this.props.nearestContext,
      this.props.timerManager,
      this.datablockService,
      this.props.mapPresetService,
      this.props.fmsHooks,
      this.props.chartsManager
    );

    this.props.viewService.openPage(IfdPageName[this.props.ifdOptions.defaultPageName]);

    this.subscribeToTextEditKeyboardEvents();
  }

  /**
   * Subscribe to text edit row keyboard events
   */
  private subscribeToTextEditKeyboardEvents(): void {
    // Handle text edit row keyboard events
    this.props.bus.getSubscriber<IfdKeyboardControlEvents>().on('text_edit_row_keyboard_open').handle((event: TextEditRowKeyboardEvent) => {

      if (this.props.ifdOptions.instrumentIndex !== event.instrumentIndex) {
        return;
      }

      this.keyboardState.setKeyboardInputType(event.keyboardInputType);

      // Store callbacks for later use
      if (event.onValueChanged) {
        this.keyboardState.setValueCallback(event.onValueChanged);
      }
      if (event?.onClose) {
        this.keyboardState.setCloseCallback(event.onClose);
      } else {
        this.keyboardState.setCloseCallback(null);
      }
      this.keyboardState.setEnterCallback(event?.onEnter);
      if (event?.onCaretPositionChanged) {
        this.keyboardState.setCaretCallback(event.onCaretPositionChanged);
        event.onCaretPositionChanged(this.keyboardState.caret.get());
      } else {
        this.keyboardState.setCaretCallback(null);
      }

      // Set the initial value
      this.keyboardState.setInput(event.initialValue);
      this.keyboardState.isEditingActive.set(true);
      this.keyboardState.setKeyboardModeSwitchDisabled(event.disableModeSwitch ?? false);
      this.keyboardState.setInitialShowNumpad(event.initialShowNumpad ?? false);
      this.keyboardState.setDisableFacilitySearch(event.disableFacilitySearch ?? false);

      this.keyboardState.setMaximumLength(event.maxLength ?? null);

      this.keyboardState.setAllowedChars(event.allowedCharacters ?? null);

      // Show the alphanumeric keyboard
      this.toggleVirtualKeyboard(event.type);
    });

    // Handle numeric edit row keyboard events
    this.props.bus.getSubscriber<IfdKeyboardControlEvents>().on('numeric_edit_row_keyboard_open').handle((event: NumericEditRowKeyboardEvent) => {
      // Store callbacks for later use
      this.keyboardState.setValueCallback(event.onValueChanged);
      if (event?.onClose) {
        this.keyboardState.setCloseCallback(event?.onClose);
      } else {
        this.keyboardState.setCloseCallback(null);
      }
      this.keyboardState.setEnterCallback(event.onEnter);
      this.keyboardState.setCaretCallback(null);

      // Set numpad-only mode if specified
      this.keyboardState.setKeyboardModeSwitchDisabled(event.numpadOnly);

      // Set to start in numpad mode
      this.keyboardState.setInitialShowNumpad(true);

      // Set the initial value
      this.keyboardState.setInput(event.initialValue);

      // Show the alphanumeric keyboard in numpad mode
      this.keyboardState.setKeyboardType(VirtualKeyboardType.Alphanumeric);
      this.keyboardState.setKeyboardVisible(true);

      this.keyboardState.setMaximumLength(null);
      this.keyboardState.setAllowedChars(null);
    });

    this.keyboardState.caret.sub((v) => this.keyboardState.caretCallback?.(v));

    // Close keyboard
    this.props.bus.getSubscriber<IfdKeyboardControlEvents>().on('keyboard_close').handle(() => {
      this.closeKeyboard();
    });
  }

  /**
   * Toggles the virtual keyboard between different states (Hidden -> Alphanumeric -> XPDR -> Hidden)
   * @param type Optional type of keyboard to force show
   */
  private toggleVirtualKeyboard(type?: VirtualKeyboardType): void {
    const currentVisible = this.keyboardState.keyboardVisible.get();
    const currentType = this.keyboardState.keyboardType.get();

    if (type) {
      // If a specific type is requested, show that type
      this.keyboardState.setKeyboardType(type);
      this.keyboardState.setKeyboardVisible(true);
    } else if (!currentVisible) {
      // If keyboard is hidden, show Alphanumeric keyboard
      this.keyboardState.setKeyboardType(VirtualKeyboardType.Alphanumeric);
      this.keyboardState.setKeyboardVisible(true);
    } else if (currentType === VirtualKeyboardType.Alphanumeric) {
      // If showing Alphanumeric, switch to XPDR
      this.keyboardState.setKeyboardType(VirtualKeyboardType.XPDR);
    } else {
      // If showing XPDR, hide keyboard
      this.closeKeyboard();
    }
  }

  /**
   * Handle input from virtual keyboard
   * @param char The character that was pressed
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleVirtualKeyboardInput(char: string): void {
    const currentValue = this.keyboardState.input.get();

    // If we have a callback for value changes, call it
    if (this.keyboardState.valueCallback) {
      this.keyboardState.valueCallback(currentValue);
    }
  }

  /**
   * Handle backspace from virtual keyboard
   */
  private handleVirtualKeyboardBackspace(): void {

    const currentValue = this.keyboardState.input.get();
    if (currentValue.length > 0) {
      if (this.keyboardState.valueCallback) {
        this.keyboardState.valueCallback(currentValue);
      }
    }
  }

  /**
   * Handle close (x) from virtual keyboard
   */
  private handleVirtualKeyboardClose(): void {
    this.closeKeyboard();
  }

  /**
   * Handle enter from virtual keyboard
   * @param value The value entered in the virtual keyboard
   */
  private handleVirtualKeyboardEnter(value?: string): void {
    if (typeof value === 'string') {
      this.keyboardState.setInput(value);
      if (this.keyboardState?.enterCallback) {
        this.keyboardState.enterCallback(value);
      }
    }
    this.closeKeyboard();
  }

  /**
   * Close the keyboard and clean up
   */
  private closeKeyboard(): void {
    this.keyboardState.setEditingActive(false);

    if (this.keyboardState.closeCallback) {
      this.keyboardState.closeCallback();
    }

    this.keyboardState.setCloseCallback(null);
    this.keyboardState.setValueCallback(null);
    this.keyboardState.setCaretCallback(null);
    this.keyboardState.setEnterCallback(null);

    this.keyboardState.setInput('');
    this.keyboardState.setKeyboardVisible(false);
    this.keyboardState.setKeyboardModeSwitchDisabled(false);
    this.keyboardState.setInitialShowNumpad(false);
  }

  /** @inheritDoc */
  public render(): VNode | null {
    return (
      <div class={{
        'wt-ifd-5xx-container': true,
        'svs-fullscreen': this.props.viewService.isSvsFullscreen
      }}>
        <PageContainer ref={this.viewContainerRef} viewService={this.props.viewService} />
        <LeftBar
          bus={this.props.bus}
          ifdTuningControlManager={this.props.ifdTuningControlManager}
          ifdOptions={this.props.ifdOptions}
          datablockService={this.datablockService}
        />
        <LineSelectKeyButtons
          ref={this.lskButtonsRef}
          bus={this.props.bus}
          viewService={this.props.viewService}
        />
        <TopBarDatablocksContainer
          bus={this.props.bus}
          datablockService={this.datablockService}
        />
        <NavSourceBlock
          bus={this.props.bus}
          vnavIndex={this.props.ifdOptions.vnavIndex}
          store={this.props.flightPlanStore}
        />
        <RightKnobLabel viewService={this.props.viewService} />
        {this.props.ifdOptions.svsFullScreen &&
          <SvsFullscreenContainer ref={this.svsFullscreenContainerRef} viewService={this.props.viewService} />
        }
        <ComPresetInfoBox bus={this.props.bus} inhibited={this.props.viewService.comPresetBoxInhibited} />
        <VirtualKeyboard
          viewService={this.props.viewService}
          isVisible={this.keyboardState.keyboardVisible}
          type={this.keyboardState.keyboardType}
          caretPosition={this.keyboardState.caret}
          disableModeSwitch={this.keyboardState.keyboardModeSwitchDisabled}
          initialShowNumpad={this.keyboardState.showNumpadInitially}
          onKeyPressed={this.handleVirtualKeyboardInput.bind(this)}
          onClosePressed={this.handleVirtualKeyboardClose.bind(this)}
          onBackspacePressed={this.handleVirtualKeyboardBackspace.bind(this)}
          onEnterPressed={this.handleVirtualKeyboardEnter.bind(this)}
          inputType={this.keyboardState.keyboardInputType}
          suggestFacilityTypes={[FacilityType.Airport, FacilityType.VOR, FacilityType.NDB, FacilityType.Intersection]}
          facilityLoader={this.props.facilityLoader}
          bus={this.props.bus}
          suggestValues={Subject.create(true)}
          initialValue={this.keyboardState.input}
          keyboardState={this.keyboardState}
          fms={this.props.fms}
          xpdrManager={this.props.ifdTuningControlManager.xpdrManager}
        />
        <ConfirmPopup ref={this.props.viewService.confirmPopupRef} bus={this.props.bus} viewService={this.props.viewService} />
        <AlertBox ref={this.props.viewService.alertBoxRef} bus={this.props.bus} casAlertManager={this.props.casAlertManager} />
        <PowerDownWarning bus={this.props.bus} />
      </div>
    );
  }
}

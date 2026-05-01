import {
  ComponentProps, Facility, FacilityType, FacilityUtils, FSComponent, ICAO, LifecycleComponent, Subject, Subscribable, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { ProcedureIcon } from '../../../../Assets/SVGs/ProcedureIcon';
import { IfdChartsManager } from '../../../../Charts/IfdChartsManager';
import { VirtualKeyboardState } from '../../../../Keyboard/KeyboardState';
import { KeyboardInputType } from '../../../../Keyboard/KeyboardTypes';
import { FacilityInfoUtils } from '../../../../Utilities/FacilityInfoUtils';
import { IfdViewService } from '../../../../ViewService';
import { IfdPageName } from '../../../IfdPage';

import './InfoHeaderBlock.css';

/** The properties for the {@link InfoHeaderBlock} component. */
export interface InfoHeaderBlockProps extends ComponentProps {
  /** The IFD charts manager. */
  readonly chartManager: IfdChartsManager;
  /** The view service */
  readonly viewService: IfdViewService;
  /** The InfoTab Facility. */
  readonly infoFacility: Subscribable<Facility | undefined>;
  /** Called when user accepts a new ident from the keyboard. */
  readonly onReplaceInfoFacility: (ident: string) => Promise<boolean>;
  /** Opens the keyboard. */
  readonly openKeyboard: (
    smartPrefill: string,
    onAccept: (ident: string) => void,
    anchorEl?: HTMLElement,
    onValueChanged?: (value: string) => void,
    onClose?: () => void,
    inputType?: KeyboardInputType,
  ) => void;
  /** Collapses all sections in the InfoTab. */
  collapseAllSections(): void;
  /**
   * Parent-driven selection state.
   * If not provided, selection can still be driven via the public methods below.
   */
  readonly isSelected?: Subscribable<boolean>;
  /** Called when the user clicks somewhere in the header and we want the parent to update focus/selection. */
  readonly onFocusRequested?: (target: HeaderFocusTarget) => void;
}

/** Focusable elements within the InfoHeaderBlock. */
type HeaderFocusTarget = 'terminus' | 'procedure-icon';

/** The InfoHeaderBlock component. */
export class InfoHeaderBlock extends LifecycleComponent<InfoHeaderBlockProps> {
  private readonly rootRef = FSComponent.createRef<HTMLDivElement>();
  public readonly selected = Subject.create(false);
  private readonly facilitySelected = Subject.create(false);
  private readonly facilityInputRef = FSComponent.createRef<HTMLDivElement>();
  private readonly procedureIconSelected = Subject.create(false);
  private readonly chartIconRef = FSComponent.createRef<HTMLDivElement>();
  private readonly chartNotAvailable = Subject.create(false);

  private readonly currentFacilityIdent = Subject.create<string>('');

  private readonly facilityIdent = Subject.create('----');
  private readonly facilityInEdit = Subject.create(false);

  private readonly keyboardState = VirtualKeyboardState.getInstance();
  private keyboardMirrorSub?: Subscription;
  private pendingFacilityIdent = '';
  private isKeyboardClosing = false;

  private readonly facilityName = this.props.infoFacility.map((fac) => {
    if (!fac) {
      return '';
    }
    let name = Utils.Translate(fac.name ?? '');
    if (!name && FacilityUtils.isFacilityType(fac, FacilityType.Intersection)) {
      name = 'Waypoint';
    }
    return name;
  }).withLifecycle(this.defaultLifecycle);

  private readonly facilityLocation = this.props.infoFacility
    .map((fac) => {
      if (!fac) {
        return '';
      }

      const country = FacilityInfoUtils.getRegionName(fac.icaoStruct.region) ?? '';
      if (!fac.city) {
        return country;
      }
      const city = fac.city.split(', ').map((value) => Utils.Translate(value)).join(', ');

      return country ? `${city}, ${country}` : city;
    }).withLifecycle(this.defaultLifecycle);

  private readonly chart = this.props.infoFacility.map(async (fac) => {
    if (fac && ICAO.getFacilityTypeFromValue(fac.icaoStruct) === FacilityType.Airport) {
      const airportCharts = await this.props.chartManager.getChartsForAirport(fac.icaoStruct);
      const primaryAirportChart = this.props.chartManager.getPrimaryAirportChart(airportCharts);
      if (!primaryAirportChart) {
        this.chartNotAvailable.set(true);
      } else {
        this.chartNotAvailable.set(false);
      }
      return primaryAirportChart;
    } else {
      this.chartNotAvailable.set(true);
    }
  }).withLifecycle(this.defaultLifecycle);

  private readonly openChart = async (): Promise<void> => {
    const chart = await this.chart.get();

    if (chart) {
      this.props.viewService.openTabOnPage(IfdPageName.MAP, 'CHART');
      this.props.chartManager.selectedAirport.set(this.props.infoFacility.get()?.icaoStruct);
      this.props.chartManager.selectedChart.set(chart);
    }
  };

  /**
   * Capturing handler to update selection/focus before child handlers run.
   * @param evt The mouse event.
   */
  private readonly onHeaderMouseDownCapture = (evt: MouseEvent): void => {
    const targetNode = evt.target as Node | null;

    if (!targetNode) {
      this.props.onFocusRequested?.('terminus');
      return;
    }

    const facilityEl = this.facilityInputRef.getOrDefault();
    const chartEl = this.chartIconRef.getOrDefault();

    if (facilityEl && facilityEl.contains(targetNode)) {
      this.props.onFocusRequested?.('terminus');
      return;
    }

    if (chartEl && chartEl.contains(targetNode)) {
      this.props.onFocusRequested?.('procedure-icon');
      return;
    }

    // Anything else in the header selects the facility input.
    this.props.onFocusRequested?.('terminus');
  };

  /**
   * Starts mirroring the virtual keyboard display into the ident field.
   */
  private startKeyboardMirror(): void {
    this.keyboardMirrorSub?.destroy();
    this.keyboardMirrorSub = undefined;

    this.keyboardMirrorSub = this.keyboardState.input.sub((value: string): void => {
      if (!this.keyboardState.isEditingActive.get()) {
        return;
      }

      if (this.isKeyboardClosing) {
        return;
      }

      const upper = (value ?? '').toUpperCase();
      this.pendingFacilityIdent = upper;
      this.facilityIdent.set(upper || '----');
    }, true);
  }

  /**
   * Stops mirroring the virtual keyboard display.
   */
  private stopKeyboardMirror(): void {
    this.keyboardMirrorSub?.destroy();
    this.keyboardMirrorSub = undefined;
  }

  /**
   * Handles clicks on the facility ident field.
   * Mirrors keyboard input and commits on accept.
   */
  private readonly onFacilityClicked = (): void => {
    this.facilityInEdit.set(true);
    this.props.collapseAllSections();

    this.isKeyboardClosing = false;

    // Clear UI + keyboard state for a fresh entry.
    this.pendingFacilityIdent = '';
    this.facilityIdent.set('----');

    // This clears what the virtual keyboard displays (and what we mirror).
    this.keyboardState.input.set('');

    // Start mirroring after clearing so we don't re-apply stale text.
    this.startKeyboardMirror();

    this.props.openKeyboard(
      '',
      async (valueFromKeyboard) => {
        this.isKeyboardClosing = true;
        this.stopKeyboardMirror();

        const candidateRaw = (this.pendingFacilityIdent || valueFromKeyboard || '');
        const trimmed = candidateRaw.trim().toUpperCase();

        let shouldRevert = false;

        if (trimmed.length === 0) {
          shouldRevert = true;
        } else {
          const replaced = await this.props.onReplaceInfoFacility(trimmed);
          if (replaced) {
            this.currentFacilityIdent.set(trimmed);
            this.facilityIdent.set(trimmed);
          } else {
            shouldRevert = true;
          }
        }

        if (shouldRevert) {
          const fallback = (this.currentFacilityIdent.get() ?? '').toUpperCase();
          this.facilityIdent.set(fallback || '----');
        }

        this.facilityInEdit.set(false);
      },
      this.facilityInputRef.instance,
      (value) => {
        if (this.isKeyboardClosing) {
          return;
        }

        this.pendingFacilityIdent = (value ?? '').toUpperCase();
      },
      () => {
        this.isKeyboardClosing = true;
        this.stopKeyboardMirror();

        const fallback = (this.currentFacilityIdent.get() ?? '').toUpperCase();
        this.facilityIdent.set(fallback || '----');

        this.facilityInEdit.set(false);
      },
    );
  };

  /** @inheritdoc */
  public getPageFacility(): Facility | undefined {
    return this.props.infoFacility.get();
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.props.isSelected?.sub((isSelected) => this.setSelected(isSelected), true).withLifecycle(this.defaultLifecycle);

    this.props.infoFacility.sub((fac) => {
      let ident = '----';
      let prefill = '';

      if (fac) {
        ident = fac.icaoStruct.ident;
        prefill = fac.icaoStruct.ident;
      }

      this.currentFacilityIdent.set(prefill);

      if (!this.facilityInEdit.get()) {
        this.facilityIdent.set(ident);
      }
    }, true).withLifecycle(this.defaultLifecycle);

    this.rootRef.instance.addEventListener('mousedown', this.onHeaderMouseDownCapture, { capture: true });
    this.chartIconRef.instance.addEventListener('mousedown', this.openChart);
    this.facilityInputRef.instance.addEventListener('mousedown', this.onFacilityClicked);
  }

  /**
   * Sets whether the header is selected (focused by knob navigation).
   * @param isSelected Whether the header is selected.
   */
  public setSelected(isSelected: boolean): void {
    this.selected.set(isSelected);

    if (!isSelected) {
      this.facilitySelected.set(false);
      this.procedureIconSelected.set(false);
    }
  }

  /**
   * Highlights which header element is currently focused by the knob.
   * @param target Focus target, or null for none.
   */
  public setHeaderFocus(target: HeaderFocusTarget | null): void {
    this.facilitySelected.set(target === 'terminus');
    this.procedureIconSelected.set(target === 'procedure-icon');
  }

  /** Activates the terminus (same as clicking the terminus). */
  public activateTerminus(): void {
    this.onFacilityClicked();
  }

  /** Activates the procedure icon (same as clicking the icon). */
  public activateProcedureIcon(): void {
    void this.openChart();
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class='info-header-block'
        ref={this.rootRef}
      >
        <div class='info-header-top'>
          <div
            class={{ 'info-header-terminus': true, 'editing': this.facilityInEdit, 'selected': this.facilitySelected, 'parent-selected': this.selected }}
            ref={this.facilityInputRef}
          >
            <div>{this.facilityIdent}</div>
          </div>
          <div class='info-header-terminus-info'>
            {this.facilityName}
          </div>
        </div>
        <div class='info-header-bottom'>
          <div class='info-header-city'>
            <div class='info-header-city-text'>
              {this.facilityLocation}
            </div>
            <div class={{ 'procedure-icon': true, 'parent-selected': this.selected, 'hidden': this.chartNotAvailable, 'selected': this.procedureIconSelected }} ref={this.chartIconRef}>
              <ProcedureIcon />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    super.destroy();
    this.stopKeyboardMirror();
    this.rootRef.instance?.removeEventListener('mousedown', this.onHeaderMouseDownCapture, { capture: true });
    this.chartIconRef.instance.removeEventListener('mousedown', this.openChart);
    this.facilityInputRef.instance.removeEventListener('mousedown', this.onFacilityClicked);
  }
}

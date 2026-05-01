import {
  ConsumerSubject, EventBus, Facility, FacilityFrequencyType, FacilityLoader, FacilitySearchType, FacilityType, FacilityUtils, FlightPlanSegmentType,
  FlightPlanUtils, GeoPoint, ICAO, Lifecycle, MagVar, NearestContext, NodeReference, Subscription, UnitType, VorType
} from '@microsoft/msfs-sdk';

import { FlightPlanLegData, SelectableFlightPlanListData } from '../../FlightPlan';
import { Fms } from '../../Fms';
import { FmsPageEvents } from '../../Pages/FmsPage/FmsPageEvents';
import { CharInput } from '../../Pages/FmsPage/FplTab/Components/CharInput';
import { FplSelectionMenuController } from '../../Pages/FmsPage/FplTab/FplSelectionMenu/FplSelectionMenuController';
import { FmsPositionSystemEvents } from '../../Systems/FmsPositionSystem';
import { FacilitySearchUtils } from '../../Utilities/FacilitySearchUtils';
import { DirectToStore, DirToFacilityTypes, PendingDirectToData } from './DirectToStore';
import { FacilityInfoUtils } from '../../Utilities/FacilityInfoUtils';

/** Controller for the direct to dialog. */
export class DirectToController {
  private static readonly geoPointCache = new GeoPoint(NaN, NaN);

  private readonly aircraftPosition = ConsumerSubject.create(this.bus.getSubscriber<FmsPositionSystemEvents>().on('fms_pos_position_1').atFrequency(1), { lat: NaN, long: NaN });

  private readonly selectedFlightPlanItem = ConsumerSubject.create(this.bus.getSubscriber<FmsPageEvents>().on('fms_page_fpl_selected_item'), undefined);

  private searchOpId = 0;

  private updateSub: Subscription;
  private selectedFplItemSub: Subscription;
  private textInputSub = this.store.textInput.sub(this.onTextInputChanged.bind(this));

  /**
   * Constructs a new instance.
   * @param store The direct to store.
   * @param bus The instrument event bus.
   * @param facLoader The facility loader to use.
   * @param fms The FMS to use.
   * @param menuController The duplicate selection menu controller.
   * @param textInputRef The text input field.
   * @param dataLifecycle The lifecycle to use for any subscriptions.
   */
  constructor(
    private readonly store: DirectToStore,
    private readonly bus: EventBus,
    private readonly facLoader: FacilityLoader,
    private readonly fms: Fms,
    private readonly menuController: FplSelectionMenuController,
    private readonly textInputRef: NodeReference<CharInput>,
    private readonly dataLifecycle: Lifecycle,
  ) {
    this.updateSub = this.aircraftPosition.sub(this.updateBearingDistance.bind(this), true, true).withLifecycle(this.dataLifecycle);

    this.selectedFplItemSub = this.selectedFlightPlanItem.sub(this.onSelectedFlightPlanItemChanged.bind(this), false, true);
  }

  /** Updates the bearing and distance from the aircraft to the facility. */
  private updateBearingDistance(): void {
    const aircraftPosition = DirectToController.geoPointCache.set(this.aircraftPosition.get().lat, this.aircraftPosition.get().long);
    if (this.store.data?.facility && aircraftPosition.isValid()) {
      this.store.bearing.set(MagVar.trueToMagnetic(aircraftPosition.bearingTo(this.store.data?.facility), FacilityUtils.getMagVar(this.store.data.facility)));
      this.store.distance.set(UnitType.NMILE.convertFrom(aircraftPosition.distance(this.store.data?.facility), UnitType.GA_RADIAN));
    } else {
      this.store.bearing.set(null);
      this.store.distance.set(null);
    }
  }

  /**
   * Handles changes in the selected flight plan item.
   * @param item The newly selected item, or undefined if none.
   */
  private async onSelectedFlightPlanItemChanged(item: SelectableFlightPlanListData | undefined): Promise<void> {
    if (this.store.canActivate.get() || item?.type !== 'leg' || !FlightPlanUtils.isToFixLeg(item.legData.leg.leg.type)) {
      return;
    }

    const opId = ++this.searchOpId;

    const flightPlanData = await this.getDirectToDataFromLeg(item.legData);

    if (this.searchOpId !== opId || !flightPlanData) {
      return;
    }

    this.setData(flightPlanData, true);
  }

  /**
   * Handles changes to the text input.
   * @param newInput The new input value.
   */
  private async onTextInputChanged(newInput: string): Promise<void> {
    const opId = ++this.searchOpId;

    const searchUtils = FacilitySearchUtils.getSearchUtils(this.bus);
    const results = (await searchUtils.loadFacilities(newInput.trim(), FacilitySearchType.AllExceptVisual, false, UnitType.GA_RADIAN.convertFrom(1000, UnitType.NMILE)))
      .filter((f) => DirectToController.isDirectToFacilityType(f) && DirectToController.canDirectToFacility(f)) as DirToFacilityTypes[];

    if (this.searchOpId !== opId) {
      return;
    }

    if (results.length === 1) {
      this.setData({ facility: results[0] });
      this.store.duplicates = undefined;
      this.tryAutoCompleteInput();
    } else if (results.length > 1) {
      this.setData();
      this.store.name.set('Duplicates Exist');
      this.store.duplicates = results;
    } else {
      this.setData();
      this.store.duplicates = undefined;
    }
  }

  /**
   * Tries to autocomplete the field value.
   */
  private tryAutoCompleteInput(): void {
    const facility = this.store.data?.facility;
    const textField = this.textInputRef.getOrDefault();
    if (!facility || !textField || this.store.textInput.get() === facility.icaoStruct.ident) {
      return;
    }

    textField.setValue(facility.icaoStruct.ident);
  }

  /**
   * Sets the facility shown in the dialog.
   * @param data the data to display.
   * @param initial Whether the data is the initial data for opening the popup.
   */
  public setData(data?: PendingDirectToData, initial = false): void {
    // The facility must be confirmed with ENTR again before activation is available.
    this.store.canActivate.set(false);

    this.store.data = data;

    if (!this.store.data) {
      this.store.ident.set('');
      this.store.name.set('');
      this.store.location.set('');
      this.store.type.set('');
      this.store.towerFrequency.set(0);
      this.updateBearingDistance();
      this.clearPreview();
      return;
    }

    const facility = this.store.data.facility;
    void this.fms.updateDirectToPreview(facility, DirectToController.geoPointCache);

    this.store.ident.set(facility.icaoStruct.ident);
    this.store.name.set(Utils.Translate(facility.name));
    this.store.location.set(facility.city.split(', ').map((v) => Utils.Translate(v)).join(', '));

    if (FacilityUtils.isFacilityType(facility, FacilityType.Airport)) {
      this.store.type.set('');
      this.store.towerFrequency.set(facility.frequencies.find((v) => v.type === FacilityFrequencyType.Tower)?.freqMHz ?? 0);
    } else if (FacilityUtils.isFacilityType(facility, FacilityType.VOR)) {
      this.store.type.set(FacilityInfoUtils.getVorTypeText(facility));
      this.store.towerFrequency.set(0);
    } else if (FacilityUtils.isFacilityType(facility, FacilityType.NDB)) {
      this.store.type.set(FacilityInfoUtils.getNdbTypeText(facility));
      this.store.towerFrequency.set(0);
    } else {
      this.store.type.set('Waypoint');
      this.store.towerFrequency.set(0);
    }

    if (initial) {
      const textInput = this.textInputRef.getOrDefault();
      if (textInput) {
        this.textInputSub.pause();
        textInput.setValue(this.store.data.facility.icaoStruct.ident);
        this.textInputSub.resume(false);
      }
    }

    this.updateBearingDistance();
  }

  /**
   * Gets the direct to data for a flight plan leg.
   * @param legData The flight plan leg list data.
   * @returns The direct to data, or undefined if a direct to is not possible.
   */
  private async getDirectToDataFromLeg(legData: FlightPlanLegData): Promise<PendingDirectToData | undefined> {
    if (
      !FlightPlanUtils.isToFixLeg(legData.leg.leg.type) ||
      ICAO.isValueEmpty(legData.leg.leg.fixIcaoStruct)
    ) {
      return undefined;
    }

    let facility: DirToFacilityTypes | undefined;
    let segmentIndex: number | undefined;
    let segmentLegIndex: number | undefined;

    const facilityType = ICAO.getFacilityTypeFromValue(legData.leg.leg.fixIcaoStruct);
    switch (facilityType) {
      case FacilityType.Airport:
      case FacilityType.Intersection:
      case FacilityType.NDB:
      case FacilityType.USR:
      case FacilityType.VOR:
        facility = await this.facLoader.tryGetFacility(facilityType, legData.leg.leg.fixIcaoStruct) ?? undefined;
        segmentIndex = legData.segment.segmentIndex;
        segmentLegIndex = legData.segmentLegIndex.get();
        break;
      default:
        break;
    }

    if (!DirectToController.canDirectToFacility(facility)) {
      return undefined;
    }

    // can't do on-route direct to origin or destination
    if (legData.segment.segmentType === FlightPlanSegmentType.Origin || legData.segment.segmentType === FlightPlanSegmentType.Destination) {
      segmentIndex = undefined;
      segmentLegIndex = undefined;
    }

    if (facility) {
      return {
        facility,
        segmentIndex,
        segmentLegIndex,
      };
    }
  }

  /**
   * Gets the initial facility to display when a direct to is requested.
   * @param pageFacility The facility associated with the current page, if any.
   * @returns The intial facility, or undefined if none could be determined.
   */
  public async getInitialData(pageFacility?: DirToFacilityTypes): Promise<PendingDirectToData | undefined> {
    let dirToFacility = DirectToController.canDirectToFacility(pageFacility) ? pageFacility : undefined;

    let segmentIndex: number | undefined;
    let segmentLegIndex: number | undefined;

    // The page wasn't associated with a facility, so we try get the facility for the selected FPL leg
    if (!dirToFacility) {
      const activeItem = this.selectedFlightPlanItem.get();
      const selectedLeg = activeItem?.type === 'leg' ? activeItem : undefined;
      // Missed approach legs are only eligible when the missed approach is enabled.
      if (selectedLeg && (selectedLeg.legData.segment.segmentType !== FlightPlanSegmentType.MissedApproach || this.fms.isMissedApproachActivated())) {
        const flightPlanDirTo = await this.getDirectToDataFromLeg(selectedLeg.legData);
        if (flightPlanDirTo) {
          return flightPlanDirTo;
        }
      }
    }

    // There was no facility associated with the selected FPL leg (or no such leg), so we do the final fallback to the nearest airport.
    if (!dirToFacility && NearestContext.isInitialized) {
      dirToFacility = NearestContext.getInstance().airports.getArray()[0];
    }

    if (dirToFacility && DirectToController.canDirectToFacility(dirToFacility)) {
      return {
        facility: dirToFacility,
        segmentIndex,
        segmentLegIndex,
      };
    }
  }

  /** Activates the direct to. */
  public activate(): void {
    if (!this.store.data) {
      return;
    }

    if (this.store.data.segmentIndex !== undefined && this.store.data.segmentLegIndex !== undefined) {
      this.fms.createDirectToExisting(this.store.data.segmentIndex, this.store.data.segmentLegIndex, undefined, true);
    } else {
      this.fms.createDirectToRandom(this.store.data.facility);
    }
  }

  /** Resumes the controller subscriptions. */
  public resume(): void {
    this.updateSub.resume();
    this.selectedFplItemSub.resume(false);
  }

  /** Pauses the controller subscriptions. */
  public pause(): void {
    this.updateSub.pause();
    this.selectedFplItemSub.pause();
  }

  /**
   * Checks if a generic facility is of a direct to facility type.
   * @param facility The facility to check.
   * @returns true if the facility is the correct type.
   */
  public static isDirectToFacilityType(facility: Facility): facility is DirToFacilityTypes {
    const facilityType = ICAO.getFacilityTypeFromValue(facility.icaoStruct);
    switch (facilityType) {
      case FacilityType.Airport:
      case FacilityType.Intersection:
      case FacilityType.NDB:
      case FacilityType.USR:
      case FacilityType.VOR:
        return true;
      default:
        return false;
    }
  }

  /**
   * Checks if a facility is eligible for direct to.
   * @param facility The facility to check.
   * @returns true if the facility can be used for direct to.
   */
  public static canDirectToFacility(facility?: DirToFacilityTypes): boolean {
    // Only ILS without DME can not be used (and won't be shown in the keyboard/knob entry).
    return !!(facility && (!FacilityUtils.isFacilityType(facility, FacilityType.VOR) || facility.type !== VorType.ILS && facility.dme !== null));
  }

  /** Resolves duplicate waypoints through the popup menu. */
  public async resolveDuplicates(): Promise<void> {
    if (!this.store.duplicates) {
      return;
    }

    const aircraftPosition = DirectToController.geoPointCache.set(this.aircraftPosition.get().lat, this.aircraftPosition.get().long);
    const selectedFacility = await this.menuController.showFacilityDuplicatePicker(this.store.duplicates, aircraftPosition, '- Select Waypoint -');
    if (selectedFacility && DirectToController.isDirectToFacilityType(selectedFacility) && DirectToController.canDirectToFacility(selectedFacility)) {
      this.setData({ facility: selectedFacility });
    }
    this.store.duplicates = undefined;
  }

  /**
   * Resolves a manually entered ident string to a facility and updates
   * the dialog data.
   *
   * @param ident The ident string entered by the user.
   * @param menu Optional selection menu controller for duplicate resolution.
   * @param ref Optional reference position (e.g., aircraft) for distance sorting/labels.
   * @returns A promise that resolves when the facility is set (or skipped if none).
   */
  public async setIdentFromKeyboard(
    ident: string,
    menu?: FplSelectionMenuController,
    ref?: GeoPoint
  ): Promise<void> {
    const trimmed = (ident ?? '').trim().toUpperCase();
    if (!trimmed) {
      return;
    }

    const utils = FacilitySearchUtils.getSearchUtils(this.bus);
    const matches = (await utils.loadFacilities(trimmed, FacilitySearchType.All, true)).filter(DirectToController.isDirectToFacilityType);

    if (!matches?.length) {
      return;
    }

    let facility = matches[0];

    if (menu) {
      const sel = await menu.showFacilityDuplicatePicker(matches, ref, 'Select Waypoint');
      if (!sel || !DirectToController.isDirectToFacilityType(sel)) {
        return;
      }
      facility = sel;
    }

    this.setData({ facility });
  }

  /** Clears the direct-to preview. */
  public clearPreview(): void {
    this.fms.clearProcedurePreview();
  }
}

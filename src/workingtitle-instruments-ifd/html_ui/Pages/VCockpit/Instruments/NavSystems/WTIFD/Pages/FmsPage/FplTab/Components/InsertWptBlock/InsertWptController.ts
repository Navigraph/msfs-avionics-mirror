import {
  DebounceTimer, EventBus, Facility, FacilityLoader, FacilitySearchType, FacilityType, FacilityUtils, ICAO, IcaoValue, IntersectionFacilityUtils, Lifecycle,
  NearestContext, NodeReference, Subscription
} from '@microsoft/msfs-sdk';

import { Fms } from '../../../../../Fms';
import { VirtualKeyboardState } from '../../../../../Keyboard/KeyboardState';
import { FacilityInfoUtils } from '../../../../../Utilities/FacilityInfoUtils';
import { FacilitySearchUtils } from '../../../../../Utilities/FacilitySearchUtils';
import { FplSelectionMenuController } from '../../FplSelectionMenu/FplSelectionMenuController';
import { CharInput } from '../CharInput';
import { InsertWptStore } from './InsertWptStore';

/** Controller for the Insert Waypoint Block. */
export class InsertWptController {
  private searchOpId = 0;
  /** Subscription to text input changes. */
  private readonly textInputSub: Subscription;

  /** Debounce timer for text input changes. */
  private readonly textInputDebounce = new DebounceTimer();

  /** Character set used when skipping invalid characters. */
  private static readonly charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  /** Shared virtual keyboard state. */
  private readonly keyboardState = VirtualKeyboardState.getInstance();

  /**
   * Constructs a new instance.
   * @param store The insert waypoint store.
   * @param bus The instrument event bus.
   * @param fms The FMS to use.
   * @param menuController The duplicate selection menu controller.
   * @param textInputRef The text input field.
   * @param facLoader The facility loader.
   * @param dataLifecycle The lifecycle to use for data that needs destruction.
   */
  constructor(
    private readonly store: InsertWptStore,
    private readonly bus: EventBus,
    private readonly fms: Fms,
    private readonly menuController: FplSelectionMenuController,
    private readonly textInputRef: NodeReference<CharInput>,
    private readonly facLoader: FacilityLoader,
    private readonly dataLifecycle: Lifecycle

  ) {
    this.textInputSub = this.store.textInput.sub((value: string): void => {
      this.textInputDebounce.schedule((): void => {
        this.onTextInputChanged(value);
      }, 200);
    }).withLifecycle(dataLifecycle);
  }

  /**
   * Searches facilities for a given ident and splits the results into
   * exact matches and a single suggested match (first partial match).
   * Additionally, for short idents that have exact matches,
   * a longer suggestion with a longer ident is also returned so that
   * the UI can autocomplete on caret movement.
   *
   * @param ident The ident string to search for.
   * @param opId The search operation id to guard against stale results.
   * @returns Exact matches and/or a suggested match.
   */
  private async searchFacilities(
    ident: string,
    opId: number
  ): Promise<{
    /** Facilities whose ident exactly matches the search string. */
    exactMatches?: readonly Facility[];
    /** A suggested facility for this ident prefix (if any). */
    suggestion?: Facility;
    /**
     * Whether there exists at least one facility whose ident starts with
     * the search string and is longer than the search string. Used for caret movement.
     */
    hasLongerMatch?: boolean;
  }> {
    const trimmed = (ident ?? '').trim().toUpperCase();
    if (trimmed.length === 0) {
      return {};
    }
    if (opId !== this.searchOpId) {
      return {};
    }

    const allMatches = await this.facLoader.searchByIdentWithIcaoStructs(
      FacilitySearchType.All,
      trimmed,
      100,
    );

    if (opId !== this.searchOpId) {
      return {};
    }

    const hasLongerMatch = allMatches.some((match: IcaoValue): boolean => {
      return match.ident.length > trimmed.length
        && match.ident.startsWith(trimmed);
    });

    const exactMatchesIcaos: IcaoValue[] = [];
    for (let i = 0; i < allMatches.length; i++) {
      const match = allMatches[i];
      if (match.ident === trimmed) {
        exactMatchesIcaos.push(match);
      }
    }

    let exactMatchesWithFacilities: Facility[] | undefined;
    let suggestion: Facility | undefined;

    // 1) Try to return a list of exact matches.
    if (exactMatchesIcaos.length > 0) {
      const filteredIcaos = IntersectionFacilityUtils.filterDuplicates(
        exactMatchesIcaos
      );

      const facilities: Facility[] = [];
      for (let i = 0; i < filteredIcaos.length; i++) {
        const match = filteredIcaos[i];
        const facility = await this.facLoader.tryGetFacility(
          ICAO.getFacilityTypeFromValue(match),
          match
        );

        if (facility) {
          facilities.push(facility);
        }
      }

      exactMatchesWithFacilities = facilities;

      suggestion = await this.getLongIdentSuggestion(trimmed, opId);

      if (exactMatchesWithFacilities.length > 0) {
        return {
          exactMatches: exactMatchesWithFacilities,
          suggestion,
          hasLongerMatch
        };
      }
    }

    // 2) No usable exact matches → fall back to suggestion-only behavior.
    suggestion = await this.getLongIdentSuggestion(trimmed, opId);

    if (suggestion) {
      return {
        suggestion,
        hasLongerMatch
      };
    }

    // If neither exact nor suggested matches could be returned, then return an empty match.
    return {};
  }

  /**
   * Searches for a facility suggestion that matches the given ident.
   * This is used for autocompleting the current ident to a longer ident
   *
   * @param trimmed The trimmed, uppercase ident to search for.
   * @param opId The search operation id to guard against stale results.
   * @returns A suggested facility, or undefined if none was found.
   */
  private async getLongIdentSuggestion(trimmed: string, opId: number): Promise<Facility | undefined> {
    if (opId !== this.searchOpId) {
      return undefined;
    }

    const allMatches: IcaoValue[] = [];

    const matches = await Promise.all([
      this.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Ndb, trimmed, 40),
      this.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, trimmed, 40),
      this.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Airport, trimmed, 40),
      this.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Intersection, trimmed, 40),
    ]);

    if (opId !== this.searchOpId) {
      return undefined;
    }

    for (let li = 0; li < matches.length; li++) {
      const list = matches[li];
      for (let i = 0; i < list.length; i++) {
        const fac = list[i];
        if (
          fac.ident.length >= 3
          && fac.ident.startsWith(trimmed)
        ) {
          allMatches.push(fac);
        }
      }
    }

    if (allMatches.length === 0) {
      return undefined;
    }

    let firstMatch = allMatches[0];

    // Check if the first match is a terminal duplicate of a non-terminal intersection match. If it is, replace it
    // with the non-terminal version.
    if (
      ICAO.isValueFacility(firstMatch, FacilityType.Intersection)
      && IntersectionFacilityUtils.isTerminal(firstMatch)
    ) {
      const nonTerminalIcao = IntersectionFacilityUtils.getNonTerminalIcaoValue(firstMatch);
      const hasNonTerminal = allMatches.some((icao: IcaoValue): boolean => {
        return ICAO.valueEquals(icao, nonTerminalIcao);
      });

      if (hasNonTerminal) {
        firstMatch = nonTerminalIcao;
      }
    }

    const facility = await this.facLoader.tryGetFacility(
      ICAO.getFacilityTypeFromValue(firstMatch),
      firstMatch
    );

    if (!facility) {
      return undefined;
    }

    return facility;
  }

  /**
   * Applies a suggestion as a shadowed/autocompleted ident.
   *
   * The full suggested ident is written into the CharInput, but the caret
   * remains on (or within) the originally typed portion so that the tail
   * appears as an inline suggestion.
   *
   * @param baseIdent The ident string typed by the user (prefix).
   * @param caretPos The current caret position.
   * @param suggestion The facility to use as a suggestion.
   */
  private applySuggestion(
    baseIdent: string,
    caretPos: number,
    suggestion: Facility
  ): void {
    const textField = this.textInputRef.getOrDefault();
    const suggestedIdentRaw = suggestion.icaoStruct.ident;
    const suggestedIdent = (suggestedIdentRaw ?? '').toUpperCase();

    if (!suggestedIdent) {
      this.setData(suggestion);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;
      return;
    }

    if (!textField) {
      this.store.textInput.set(suggestedIdent);
      this.setData(suggestion);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;
      return;
    }

    const clampedCaret = Math.min(
      Math.max(caretPos, 0),
      Math.max(suggestedIdent.length - 1, 0)
    );

    this.textInputSub.pause();

    textField.setValue(suggestedIdent);
    textField.placeCursor(clampedCaret, true);
    this.store.textInput.set(suggestedIdent);

    this.textInputSub.resume(false);

    this.setData(suggestion);
    this.store.duplicates.set([]);
    this.store.duplicatesValidForOpId = null;

    this.store.shortIdentSuggestion = undefined;
  }

  /**
   * Updates the ident text and caret position in the UI only, without
   * triggering a new facility search.
   *
   * @param next The new ident value to display (will be uppercased).
   * @param caretPos Optional caret index to place; if omitted, caret is put
   * on the last character of `next` (clamped to 0–4).
   */
  public setTextUiOnly(next: string, caretPos?: number): void {
    const textField = this.textInputRef.getOrDefault();
    const value = (next ?? '').toUpperCase();

    // Prevent onTextInputChanged from running while we push this change.
    this.textInputSub.pause();

    if (textField) {
      textField.setValue(value);

      const effectiveCaret = caretPos !== undefined
        ? Math.min(Math.max(caretPos, 0), Math.max(value.length - 1, 0))
        : Math.min(Math.max(value.length - 1, 0), 4);

      textField.placeCursor(effectiveCaret, true);
    }

    this.store.textInput.set(value);

    // Resume without replaying the last value into onTextInputChanged.
    this.textInputSub.resume(false);
  }

  /**
   * Handles valid matches (exact or suggested):
   * - Duplicates → "Duplicates Exist" + duplicates list.
   * - Single exact → assign that facility.
   *
   * @param baseIdent The current ident string in the field.
   * @param caretPos The current caret position.
   * @param exactMatches Exact facility matches (if any).
   * @param allowSuggestionPrefill Whether to apply singleCharSuggestion into the input.
   */
  private handleMatches(
    baseIdent: string,
    caretPos: number,
    exactMatches?: readonly Facility[],
    allowSuggestionPrefill = true,
  ): void {
    const textField = this.textInputRef.getOrDefault();
    const shortIdentSuggestion = this.store.shortIdentSuggestion;

    // 1) Exact matches
    if (exactMatches && exactMatches.length > 0) {
      if (exactMatches.length > 1) {
        // Duplicates: show message + duplicates.
        this.setData(undefined);
        this.store.name.set('Duplicates Exist');
        this.store.duplicates.set([...exactMatches]);
        this.store.duplicatesValidForOpId = this.searchOpId;

        // For idents with a suggestion, prefill the input with the longer ident
        // but keep the caret on (or within) the typed portion.
        if (shortIdentSuggestion && allowSuggestionPrefill) {
          const fullIdent = shortIdentSuggestion.icaoStruct.ident;

          this.textInputSub.pause();

          if (textField) {
            const caretIndex = textField.cursorPosition.get();

            textField.setValue(fullIdent);
            textField.placeCursor(caretIndex, true);

          }
          this.store.textInput.set(fullIdent);
          this.textInputSub.resume(false);
        } else if (textField) {
          textField.setValue(baseIdent);
          textField.placeCursor(Math.min(caretPos, baseIdent.length), true);
        }

        return;
      }

      // Exactly one facility
      const facility = exactMatches[0];
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;

      if (textField) {
        textField.setValue(baseIdent);
        textField.placeCursor(Math.min(caretPos, baseIdent.length), true);
      }

      this.setData(facility);
      return;
    }
  }

  /**
   * Handles changes to the text input.
   *
   * Behavior for knob scroll:
   * - If the new ident has matches → take them (with duplicate / autocomplete logic).
   * - If it has no matches → automatically advance the character at the caret
   * forward through the allowed set (A–Z, 0–9) in the last knob direction
   * until a matching ident is found. If none exists, the user-chosen character
   * remains and there is simply no facility match.
   *
   * @param newInput The new input value.
   */
  private async onTextInputChanged(newInput: string): Promise<void> {
    const opId = ++this.searchOpId;

    const tryExactMatch = this.store.tryExactMatch;
    this.store.tryExactMatch = false;

    const ident = (newInput ?? '').trim().toUpperCase();
    this.store.duplicates.set([]);
    this.store.duplicatesValidForOpId = null;

    const textField = this.textInputRef.getOrDefault();
    const caretPos = textField
      ? textField.cursorPosition.get()
      : ident.length;

    // Empty input → clear everything and clamp caret to slot 0.
    if (ident.length === 0) {
      this.setData(undefined);
      this.store.shortIdentSuggestion = undefined;
      this.store.canMoveCaretPastEnd = false;
      if (textField) {
        textField.placeCursor(0, true);
      }

      return;
    }

    const searchResult = await this.searchFacilities(ident, opId);
    const exactMatches = searchResult.exactMatches;
    const suggestion = searchResult.suggestion;
    const hasLongerMatch = searchResult.hasLongerMatch ?? false;

    if (opId !== this.searchOpId) {
      return;
    }

    const keyboardEditing = this.keyboardState.isEditingActive.get();

    // Keep suggestions in store for knob usage, but don't allow
    // caret-past-end behavior while the keyboard is driving input.
    this.store.shortIdentSuggestion = suggestion;
    this.store.canMoveCaretPastEnd = keyboardEditing ? false : hasLongerMatch;

    // --- Exact matches ---
    if (exactMatches && exactMatches.length > 0) {
      // When keyboard is open, we still resolve facilities/duplicates,
      // but we do NOT prefill/extend the ident in the UI.
      this.handleMatches(
        ident,
        caretPos,
        exactMatches,
        /* allowSuggestionPrefill */ !keyboardEditing && !tryExactMatch
      );
      return;
    }

    // --- Only suggestion, no exact match ---
    if (suggestion) {
      if (keyboardEditing) {
        // Keyboard owns autocomplete → just resolve the facility
        // and avoid touching the ident text or caret.
        this.setData(suggestion);
        this.store.duplicates.set([]);
        this.store.duplicatesValidForOpId = null;
        return;
      }

      // Normal knob-driven path: apply our own inline suggestion.
      this.applySuggestion(ident, caretPos, suggestion);
      return;
    }

    // No match at all for this ident – existing “walk” logic below…
    if (caretPos < 0 || caretPos >= ident.length) {
      this.setData(undefined);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;

      this.store.canMoveCaretPastEnd = false;
      return;
    }

    const charSet = InsertWptController.charSet;

    const hadSearchDirection = this.store.searchDirection !== 0;
    const direction: 1 | -1 = this.store.searchDirection === -1 ? -1 : 1;
    this.store.searchDirection = 0;

    const basePrefix = ident.slice(0, caretPos);
    const baseSuffix = ident.slice(caretPos + 1);
    const currentChar = ident[caretPos];

    let idx = charSet.indexOf(currentChar);
    if (idx === -1) {
      this.setData(undefined);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;

      return;
    }

    for (let step = 1; step < charSet.length; step++) {
      idx = (idx + direction + charSet.length) % charSet.length;
      const candidateChar = charSet[idx];
      const candidateIdent = basePrefix + candidateChar + baseSuffix;

      const stepResult = await this.searchFacilities(candidateIdent, opId);
      const stepExactMatches = stepResult.exactMatches;
      const stepSuggestion = stepResult.suggestion;
      const stepHasLongerMatch = stepResult.hasLongerMatch ?? false;

      if (opId !== this.searchOpId) {
        return;
      }

      if (
        (stepExactMatches && stepExactMatches.length > 0)
        || stepSuggestion
      ) {
        this.textInputSub.pause();

        if (textField) {
          textField.setValue(candidateIdent);
          textField.placeCursor(Math.min(caretPos, candidateIdent.length), true);
        }

        this.store.textInput.set(candidateIdent);
        this.textInputSub.resume(false);

        this.store.shortIdentSuggestion = stepSuggestion;
        this.store.canMoveCaretPastEnd = keyboardEditing ? false : stepHasLongerMatch;

        if (stepExactMatches && stepExactMatches.length > 0) {
          this.handleMatches(candidateIdent, caretPos, stepExactMatches, !keyboardEditing);
        } else if (stepSuggestion && !keyboardEditing) {
          this.applySuggestion(candidateIdent, caretPos, stepSuggestion);
        } else if (stepSuggestion && keyboardEditing) {
          this.setData(stepSuggestion);
          this.store.duplicates.set([]);
          this.store.duplicatesValidForOpId = null;
        }

        return;
      }
    }

    if (hadSearchDirection && textField && ident.length > 0 && !this.store.shortIdentSuggestion) {
      const newCaretPos = Math.max(caretPos - 1, 0);
      const newIdent = ident.slice(0, caretPos) + ident.slice(caretPos + 1);

      this.textInputSub.pause();
      textField.setValue(newIdent);
      textField.placeCursor(Math.min(newCaretPos, newIdent.length), true);
      this.store.textInput.set(newIdent);
      this.textInputSub.resume(false);

      return;
    }

    this.setData(undefined);
    this.store.duplicates.set([]);
    this.store.duplicatesValidForOpId = null;
    this.store.shortIdentSuggestion = undefined;
    this.store.canMoveCaretPastEnd = false;
  }


  /**
   * Re-resolves facility data and duplicates for the ident prefix up to the
   * current caret position. The displayed text (with suggestions) is left
   * untouched; only the data/duplicates are updated to match the prefix.
   */
  public async updateDataForCaretPrefix(): Promise<void> {
    const textField = this.textInputRef.getOrDefault();
    const fullIdentRaw = this.store.textInput.get() ?? '';
    const fullIdent = fullIdentRaw.trim().toUpperCase();
    this.store.duplicates.set([]);
    this.store.duplicatesValidForOpId = null;


    if (!textField || fullIdent.length === 0) {
      this.setData(undefined);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;

      return;
    }

    const caretPos = textField.cursorPosition.get();
    if (caretPos < 0) {
      this.setData(undefined);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;

      return;
    }

    const prefixLength = Math.min(caretPos + 1, fullIdent.length);
    const prefixIdent = fullIdent.slice(0, prefixLength);

    if (prefixIdent.length === 0) {
      this.setData(undefined);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;

      return;
    }

    const opId = ++this.searchOpId;
    const searchResult = await this.searchFacilities(prefixIdent, opId);

    if (opId !== this.searchOpId) {
      return;
    }

    const exactMatches = searchResult.exactMatches;
    const suggestion = searchResult.suggestion;
    const hasLongerMatch = searchResult.hasLongerMatch ?? false;

    this.store.shortIdentSuggestion = suggestion;
    this.store.canMoveCaretPastEnd = hasLongerMatch;

    if (exactMatches && exactMatches.length > 0) {
      this.handleMatches(prefixIdent, prefixLength - 1, exactMatches, false);
    } else {
      this.setData(undefined);
      this.store.duplicates.set([]);
      this.store.duplicatesValidForOpId = null;
    }
  }


  /**
   * Tries to accept/commit the current long-ident suggestion.
   *
   * Called when the caret moves to the right. If there is a suggestion,
   * this will:
   * - ensure the full suggested ident is written into the field,
   * - move the caret one slot to the right from its current position
   * (clamped to the last character of the ident),
   * - clear duplicates and mark the suggestion as accepted.
   *
   * @returns True if the long ident suggestion was applied; otherwise false.
   */
  public tryAcceptSuggestion(): boolean {
    // Do not accept/force suggestions while the virtual keyboard is driving input.
    if (this.keyboardState.isEditingActive.get()) {
      return false;
    }
    const suggestion = this.store.shortIdentSuggestion;
    if (!suggestion) {
      return false;
    }

    const textField = this.textInputRef.getOrDefault();
    if (!textField) {
      return false;
    }

    const fullIdentRaw = suggestion.icaoStruct.ident ?? '';
    const fullIdent = fullIdentRaw.toUpperCase();

    if (fullIdent.length === 0) {
      return false;
    }

    this.textInputSub.pause();

    textField.setValue(fullIdent);

    const currentCaret = textField.cursorPosition.get();
    const nextCaret = Math.min(
      Math.max(currentCaret + 1, 0),
      Math.max(fullIdent.length - 1, 0)
    );

    textField.placeCursor(nextCaret, true);
    this.store.textInput.set(fullIdent);

    this.textInputSub.resume(false);

    this.store.duplicates.set([]);
    this.store.duplicatesValidForOpId = null;

    this.setData(suggestion);
    this.store.shortIdentSuggestion = undefined;

    return true;
  }


  /**
   * Sets the facility shown in the dialog.
   * @param data the data to display.
   * @param initial Whether the data is the initial data for opening the popup.
   */
  public setData(data?: Facility, initial = false): void {
    this.store.data = data;

    if (!this.store.data) {
      this.store.ident.set('');
      this.store.name.set('');
      this.store.type.set('');
      this.store.location.set('');
      return;
    }

    const facility = this.store.data;

    this.store.ident.set(facility.icaoStruct.ident);
    this.store.name.set(Utils.Translate(facility.name));

    if (FacilityUtils.isFacilityType(facility, FacilityType.Airport)) {
      this.store.type.set('');
    } else if (FacilityUtils.isFacilityType(facility, FacilityType.VOR)) {
      this.store.type.set(FacilityInfoUtils.getVorTypeText(facility));
    } else if (FacilityUtils.isFacilityType(facility, FacilityType.NDB)) {
      this.store.type.set(FacilityInfoUtils.getNdbTypeText(facility));
    } else {
      this.store.type.set('Waypoint');
    }

    let location = '';

    const country = FacilityInfoUtils.getRegionName(facility.icaoStruct.region) ?? '';
    let city = '';

    if (facility.city) {
      const translatedParts = facility.city
        .split(', ')
        .map((value) => Utils.Translate(value));

      city = translatedParts.join(', ');
    }

    if (city && country) {
      location = `${city}, ${country}`;
    } else if (city) {
      location = city;
    } else if (country) {
      location = country;
    }

    this.store.location.set(location);

    if (initial) {
      const textInput = this.textInputRef.getOrDefault();
      if (textInput) {
        this.textInputSub.pause();
        textInput.setValue(this.store.data.icaoStruct.ident);
        this.store.textInput.set(this.store.data.icaoStruct.ident);
        this.textInputSub.resume(false);
      }
    }
  }

  /**
   * Commits the ident prefix up to (and including) the current caret position.
   *
   * Example:
   * - Input "ABC", caret on 'B' (index 1) → committed ident "AB".
   * - Updates the CharInput and store.textInput to the committed ident.
   * - Re-runs the normal search/match logic for that committed ident.
   */
  public async commitPrefixAtCaret(): Promise<void> {
    const textField = this.textInputRef.getOrDefault();
    if (!textField) {
      return;
    }

    const fullIdent = (this.store.textInput.get() ?? '').toUpperCase();
    const len = fullIdent.length;

    if (len === 0) {
      return;
    }

    const caretPos = textField.cursorPosition.get();
    const commitLength = Math.min(Math.max(caretPos + 1, 0), len);
    const committedIdent = fullIdent.slice(0, commitLength);

    // If nothing actually changes, just let the normal flow handle it.
    if (committedIdent === fullIdent) {
      return;
    }

    // Update UI + store without re-entering the subscription handler.
    this.textInputSub.pause();
    textField.setValue(committedIdent);
    textField.placeCursor(Math.max(commitLength - 1, 0), true);
    this.store.textInput.set(committedIdent);
    this.textInputSub.resume(false);

    // Manually run the same logic that would run on text change,
    // but for the committed ident.
    await this.onTextInputChanged(committedIdent);
  }

  /**
   * Resolves duplicate waypoints through the popup menu.
   * @returns The selected facility, or undefined if none was selected.
   */
  public async resolveDuplicates(): Promise<Facility | undefined> {
    const duplicates = this.store.duplicates.get();

    if (
      duplicates.length === 0
      || this.store.duplicatesValidForOpId !== this.searchOpId
    ) {
      return undefined;
    }

    const selectedFacility = await this.menuController.showFacilityDuplicatePicker(
      duplicates,
      this.store.referencePosition,
      '- Select Waypoint -'
    );

    this.store.duplicates.set([]);
    this.store.duplicatesValidForOpId = null;

    if (selectedFacility) {
      this.setData(selectedFacility);
      return selectedFacility;
    }

    return undefined;
  }

  /**
   * Gets the initial facility to display when a direct to is requested.
   * @returns The initial facility, or undefined if none could be determined.
   */
  public async getInitialData(): Promise<Facility | undefined> {
    if (NearestContext.isInitialized) {
      return NearestContext.getInstance().airports.getArray()[0];
    }
  }

  /**
   * Resolves a manually entered ident string to a facility and updates
   * the dialog data.
   *
   * @param ident The ident string entered by the user.
   * @param menu Optional selection menu controller for duplicate resolution.
   * @returns A promise that resolves when the facility is set (or skipped if none).
   */
  public async setIdentFromKeyboard(
    ident: string,
    menu?: FplSelectionMenuController,
  ): Promise<void> {
    const trimmed = (ident ?? '').trim().toUpperCase();
    if (!trimmed) {
      return;
    }

    const utils = FacilitySearchUtils.getSearchUtils(this.bus);
    const matches = (await utils.loadFacilities(trimmed, FacilitySearchType.All, true));

    if (!matches?.length) {
      return;
    }

    let facility = matches[0];

    if (menu) {
      const sel = await menu.showFacilityDuplicatePicker(matches, this.store.referencePosition, 'Select Waypoint');
      if (!sel) {
        return;
      }
      facility = sel;
    }

    this.setData(facility, true);
  }

  /** Backspace the last character entered. */
  public backspace(): void {
    const textInput = this.textInputRef.getOrDefault();
    if (!textInput) {
      return;
    }

    const fullIdent = this.store.textInput.get().toUpperCase();
    if (fullIdent.length === 0) {
      return;
    }

    const caretPos = textInput.cursorPosition.get();

    if (fullIdent.charAt(caretPos) != '') {
      this.store.tryExactMatch = true;
      const newValue = fullIdent.substring(0, caretPos);
      textInput.setValue(newValue);
    } else {
      textInput.backspace();
    }
  }
}

import {
  Accessible,
  ArrayUtils, ComponentProps, DebounceTimer, EventBus, Facility, FacilityLoader, FacilitySearchType, FacilityType, FSComponent, ICAO, IcaoValue,
  IntersectionFacilityUtils, LifecycleComponent, MappedSubject, NodeReference, SearchTypeMap, Subject, Subscribable, SubscribableSet, ToggleableClassNameRecord,
  VNode, VorFacility
} from '@microsoft/msfs-sdk';

import { IfdInteractionEvent } from '../../../../Events/IfdInteractionEvent';
import { Fms } from '../../../../Fms';
import { VirtualKeyboardState } from '../../../../Keyboard/KeyboardState';
import { CharInput, CharInputSlot } from './CharInput';

/** The properties for the {@link TextInputField} component. */
interface TextInputFieldProps extends ComponentProps {
  /** Instance of event bus */
  readonly bus: EventBus;
  /** CSS classes to be added on the root element. */
  readonly class?: string | Subscribable<string> | SubscribableSet<string> | ToggleableClassNameRecord;
  /** The facility loader to use. */
  readonly facLoader: FacilityLoader;
  /** The FMS to use. */
  readonly fms: Fms;
  /** Whether this is the keyboards field. Defaults to false. */
  readonly isKeyboardField?: boolean;
  /** Callback when no match is found after search (the user entered an invalid character) */
  readonly onNoMatchFound?: (message: string) => void;
  /** The facility search type */
  readonly textInputSearchType?: TextInputSearchType;
  /** Whether should we skip the facility search */
  readonly disableFacilitySearch?: Accessible<boolean>
}

/**
 * An entry for a single character input slot.
 */
type CharInputSlotEntry = {
  /** A reference to the input slot. */
  ref: NodeReference<CharInputSlot>;

  /** The input slot's default character value. */
  defaultCharValue: Subject<string>;
};

/**
 * A utility class for working with facilities.
 */
class IfdFacilityUtils {
  /** The scope of G3000 user facilities. */
  public static readonly USER_FACILITY_SCOPE = 'Ifd';
}

/**
 * Supported {@link FacilitySearchType}s for use in a waypoint search.
 */
type TextInputSearchType =
  FacilitySearchType.All |
  FacilitySearchType.Airport |
  FacilitySearchType.Intersection |
  FacilitySearchType.Vor |
  FacilitySearchType.Ndb |
  FacilitySearchType.User | undefined;

/**
 * A search result.
 */
interface SearchResult {
  /** The ICAO. */
  readonly icao: IcaoValue;

  /** The ident. */
  readonly ident: string;
}

/**
 * A search result, also with a facility.
 */
interface SearchResultWithFacility extends SearchResult {
  /** The facility. */
  readonly facility: Facility;
}

/**
 * Results of a facility search.
 */
interface SearchResults {
  /** Matches where the ident exactly matches the current user input. */
  readonly exactMatches?: readonly SearchResultWithFacility[];

  /** The first suggested partial match given the current user input. */
  readonly suggestedMatch?: SearchResultWithFacility;
}

/** The TextInputField component. */
export class TextInputField extends LifecycleComponent<TextInputFieldProps> {
  private searchOpId = 0;
  private facilityMatches?: readonly SearchResultWithFacility[];
  private readonly hasValidMatch = Subject.create(false);
  private readonly hasValidExactMatch = Subject.create(false);
  private readonly searchDebounce = new DebounceTimer();
  private keyboardState = VirtualKeyboardState.getInstance();
  private readonly isKeyboardField = this.props.isKeyboardField ?? false;
  private readonly disableFacilitySearch = this.props.disableFacilitySearch ?? Subject.create(false);

  public readonly inputText = Subject.create<string>('');
  private readonly autocompleteText = Subject.create('');
  private readonly autocompleteTextSub = MappedSubject.create(
    this.inputText,
    this.autocompleteText
  ).sub(this.updateAutocomplete.bind(this), false, true);

  private readonly selectedFacility = Subject.create<Facility | null>(null);
  private readonly inputSlotEntries: CharInputSlotEntry[] = ArrayUtils.create(this.keyboardState.maxLength.get() ?? 6, () => {
    return {
      ref: FSComponent.createRef<CharInputSlot>(),
      defaultCharValue: Subject.create('')
    };
  });
  public readonly inputRef = FSComponent.createRef<CharInput>();
  public readonly divRef = FSComponent.createRef<HTMLDivElement>();
  private facilitySearchType?: TextInputSearchType;

  private resolveFunction?: (value: any) => void;
  private isUpdatingFromKeyboardState = false;

  /**
   * Handle key pressed with validation
   * @param value The value pressed
   */
  public onKeyPressed(value: string): void {
    this.setCharacterAtCursor(value);
  }

  /**
   * Refreshes this input, updating the size and position of the cursor.
   */
  public refresh(): void {
    this.inputRef.getOrDefault()?.refresh();
  }

  /**
   * Updates the default character values of this dialog's character input to match the current autocomplete state.
   * @param root0 The current autocomplete state.
   * @param root0."0" The current input text.
   * @param root0."1" The current autocomplete text.
   */
  private updateAutocomplete([inputText, autocompleteText]: readonly [string, string]): void {
    let endIndex = autocompleteText.length;

    if (autocompleteText === '' || autocompleteText.length < inputText.length || !autocompleteText.startsWith(inputText)) {
      endIndex = 0;
    }

    for (let i = 0; i < this.inputSlotEntries.length; i++) {
      if (i < endIndex) {
        this.inputSlotEntries[i].defaultCharValue.set(autocompleteText[i]);
      } else {
        this.inputSlotEntries[i].defaultCharValue.set('');
      }
    }
  }

  /**
   * Searches facilities with a given ident and returns matches, mirroring
   * InsertWptController.searchFacilities:
   * - First tries to find exact matches (with duplicate filtering).
   * - If no usable exact matches exist, tries to find a longer ident
   * suggestion that starts with the same prefix and has at least 3 chars.
   *
   * @param searchString The ident to search.
   * @returns A Promise which will be fulfilled with the results of the facility search.
   */
  private async searchFacilities(searchString: string): Promise<SearchResults> {
    if (this.disableFacilitySearch.get()) {
      return {};
    }

    const trimmed = (searchString ?? '').trim().toUpperCase();
    if (trimmed.length === 0) {
      return {};
    }

    if (this.facilitySearchType === undefined) {
      this.facilitySearchType = this.props.textInputSearchType ?? FacilitySearchType.All;
    }

    const filter = this.facilitySearchType ?? FacilitySearchType.All;

    let allMatches = await this.props.facLoader.searchByIdentWithIcaoStructs(
      filter,
      trimmed,
      40
    );

    if (filter === FacilitySearchType.User) {
      // Filter user facilities by scope.
      allMatches = allMatches.filter(icao => {
        return !ICAO.isValueFacility(icao, FacilityType.USR)
          || icao.airport === IfdFacilityUtils.USER_FACILITY_SCOPE;
      });
    }

    const exactMatchesIcaos: IcaoValue[] = [];
    for (let i = 0; i < allMatches.length; i++) {
      const match = allMatches[i];
      if (match.ident === trimmed) {
        exactMatchesIcaos.push(match);
      }
    }

    let suggestedMatch: SearchResultWithFacility | undefined;

    // Try to build exact matches list.
    if (exactMatchesIcaos.length > 0) {
      const filteredIcaos = IntersectionFacilityUtils.filterDuplicates(exactMatchesIcaos);

      const exactMatchesWithFacilities: SearchResultWithFacility[] = [];
      for (let i = 0; i < filteredIcaos.length; i++) {
        const match = filteredIcaos[i];
        const facility = await this.props.facLoader.tryGetFacility(
          ICAO.getFacilityTypeFromValue(match),
          match
        );

        if (facility) {
          exactMatchesWithFacilities.push({
            icao: match,
            ident: match.ident,
            facility
          });
        }
      }

      if (exactMatchesWithFacilities.length > 0) {
        // Also try to get a longer-ident suggestion, like InsertWptController.
        suggestedMatch = await this.getLongIdentSuggestion(trimmed);

        return {
          exactMatches: exactMatchesWithFacilities,
          suggestedMatch
        };
      }
    }

    // No usable exact matches → fall back to suggestion-only behavior.
    suggestedMatch = await this.getLongIdentSuggestion(trimmed);

    if (suggestedMatch) {
      return {
        suggestedMatch
      };
    }

    // If neither exact nor suggested matches could be returned, then return an empty match.
    return {};
  }



  /**
   * Searches for a facility suggestion that matches the given ident.
   * This mirrors InsertWptController.getLongIdentSuggestion and is used
   * for autocompleting the current ident to a longer ident.
   *
   * @param trimmed The trimmed, uppercase ident to search for.
   * @returns A suggested match, or undefined if none was found.
   */
  private async getLongIdentSuggestion(trimmed: string): Promise<SearchResultWithFacility | undefined> {
    const allMatches: IcaoValue[] = [];

    const matches = await Promise.all([
      this.props.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Ndb, trimmed, 40),
      this.props.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, trimmed, 40),
      this.props.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Airport, trimmed, 40),
      this.props.facLoader.searchByIdentWithIcaoStructs(FacilitySearchType.Intersection, trimmed, 40),
    ]);

    for (let li = 0; li < matches.length; li++) {
      const list = matches[li];
      for (let i = 0; i < list.length; i++) {
        const fac = list[i];

        if (fac.ident.length >= 3) {
          allMatches.push(fac);
        }
      }
    }

    if (allMatches.length === 0) {
      return undefined;
    }

    let firstMatch = allMatches[0];

    // Check if the first match is a terminal duplicate of a non-terminal intersection match.
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

    const facility = await this.props.facLoader.tryGetFacility(
      ICAO.getFacilityTypeFromValue(firstMatch),
      firstMatch
    );

    if (!facility) {
      return undefined;
    }

    return {
      icao: firstMatch,
      ident: firstMatch.ident,
      facility
    };
  }

  private readonly updateSearchHandler = this.updateSearch.bind(this);


  /**
   * A callback called when the search input box is updated.
   * @param debounce Whether to debounce the call to update autocomplete.
   */
  private async onInputTextChanged(debounce = false): Promise<void> {
    // Update keyboard state if this is the LegBlock field
    if (!this.isKeyboardField && !this.isUpdatingFromKeyboardState) {
      this.keyboardState.setInputDirect(this.inputText.get());
    }

    this.searchDebounce.clear();

    if (this.inputText.get() === '') {
      this.facilityMatches = undefined;
      this.selectedFacility.set(null);
      this.autocompleteText.set('');
    } else {
      this.facilityMatches = undefined;
      this.selectedFacility.set(null);
      this.autocompleteText.set('');

      if (this.disableFacilitySearch.get()) {
        return;
      }

      if (debounce) {
        ++this.searchOpId;
        this.searchDebounce.schedule(this.updateSearchHandler, 250);
      } else {
        await this.updateSearch();
      }
    }
  }

  /**
   * Checks for matches with current input, and updates the label and suggested text.
   */
  private async updateSearch(): Promise<void> {
    if (this.disableFacilitySearch.get()) {
      this.hasValidMatch.set(true);
      this.hasValidExactMatch.set(true);
      return;
    }
    const opId = ++this.searchOpId;
    const { exactMatches, suggestedMatch } = await this.searchFacilities(this.inputText.get());

    if (opId !== this.searchOpId) {
      return;
    }

    const hasMatch = !!(exactMatches || suggestedMatch);
    this.hasValidMatch.set(hasMatch);
    this.hasValidExactMatch.set(!!exactMatches && exactMatches.length > 0);

    // 1) Handle exact matches (data/selection).
    if (exactMatches) {
      this.facilityMatches = exactMatches;

      if (exactMatches.length === 1) {
        this.selectedFacility.set(exactMatches[0].facility);
      } else if (exactMatches.length > 1) {
        this.selectedFacility.set(null);
      }
    } else if (suggestedMatch) {
      // 2) Only suggestion (no exact matches).
      this.facilityMatches = undefined;
      this.selectedFacility.set(suggestedMatch.facility);
    } else {
      // 3) No matches at all.
      this.facilityMatches = undefined;
      this.selectedFacility.set(null);
    }

    // 4) Autocomplete/shadow text:
    //    - If we have any suggestedMatch (with or without exact matches),
    //      show its ident as the shadow.
    //    - Otherwise, clear the shadow.
    if (suggestedMatch) {
      this.autocompleteText.set(suggestedMatch.ident);
    } else {
      this.autocompleteText.set('');
    }
  }

  /**
   * Performs a backspace operation with autocomplete awareness:
   * - If there is a shadowed autocomplete suggestion, only the shadow
   * is removed and the typed characters remain unchanged.
   * - If there is no shadow, a normal character backspace is performed.
   */
  private performBackspace(): void {
    if (this.hasActiveAutocomplete()) {
      // We have a shadow: clear just the autocomplete text so that the
      // user-entered prefix stays exactly as-is.
      this.searchDebounce.clear();
      this.autocompleteText.set('');

      // Do NOT delete any characters in this case.
      return;
    }

    // No active shadow → normal backspace on the text.
    this.inputRef.instance.backspace();
  }


  /**
   * Checks whether there is an active autocomplete suggestion that extends
   * the user-entered prefix.
   *
   * @returns True if a shadowed suggestion is active.
   */
  private hasActiveAutocomplete(): boolean {
    const input = this.inputText.get();
    const auto = this.autocompleteText.get();

    return auto !== ''
      && auto.length > input.length
      && auto.startsWith(input);
  }

  /**
   * Handle knob events
   * @param event IfdInteractionEvent
   * @returns boolean
   */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    // Only handle knob events if editing is active
    if (!this.keyboardState.isEditingActive.get()) {
      return false;
    }

    switch (event) {
      case IfdInteractionEvent.RightKnobPush:
        this.inputRef.instance.activateEditing(true);
        return true;

      case IfdInteractionEvent.RightKnobOuterInc:
        if (!this.props.disableFacilitySearch?.get() && this.keyboardState.caret.get() >= this.inputText.get().length - 1 && !this.selectedFacility.get()) {
          if (!this.facilityMatches) {
            return true;
          }

          // Prevent adding further chars when there is only one match
          {
            if (this.facilityMatches?.length === 1) {
              const facility = this.selectedFacility.get();
              const facilityLength = facility?.icaoStruct.ident.length ?? -1;
              if (this.keyboardState.caret.get() === facilityLength - 1) {
                return true;
              }
            }
          }
        }
        this.inputRef.instance.moveCursor(1, true);
        this.syncCursorToKeyboardState();
        return true;

      case IfdInteractionEvent.RightKnobOuterDec:
        this.inputRef.instance.moveCursor(-1, true);
        this.syncCursorToKeyboardState();
        return true;

      case IfdInteractionEvent.RightKnobInnerDec:
        this.inputRef.instance.changeSlotValue(-1, true);
        return true;

      case IfdInteractionEvent.RightKnobInnerInc:
        this.inputRef.instance.changeSlotValue(1, true);
        return true;
      default:
        return false;
    }
  }

  /**
   * Syncs the cursor position to keyboard state
   */
  private syncCursorToKeyboardState(): void {
    if (!this.isKeyboardField) {
      const cursorPos = this.inputRef.instance.cursorPosition.get();
      this.keyboardState.setCaret(cursorPos);
    }
  }

  /**
   * Clear the value and search results
   */
  public clearValue = (): void => {
    this.inputRef.instance.setValue('');
    this.inputText.set('');
    this.selectedFacility.set(null);
    this.autocompleteText.set('');
  };

  /**
   * Removes the character at the cursor's current position (or, if there is
   * a shadowed suggestion, removes only the shadow).
   */
  public backspace(): void {
    this.performBackspace();
  }

  /**
   * Handles backspace from the virtual keyboard.
   */
  public onBackspacePressed = (): void => {
    this.performBackspace();
  };

  /**
   * @inheritDoc
   */
  public deactivateEditing = (): void => {
    this.inputRef.instance.deactivateEditing();
  };

  /**
   * Activate editing
   */
  public activateEditing = (): void => {

    if (this.props.textInputSearchType) {
      this.facilitySearchType = this.props.textInputSearchType;
    }

    this.keyboardState.setEditingActive(true);
    this.request();

    const currentValue = this.inputText.get() ?? '';
    this.inputRef.instance.setValue(currentValue);

    this.inputRef.instance.activateEditing(true);
    this.inputRef.instance.placeCursor(0, false);

    if (!this.isKeyboardField) {
      this.keyboardState.setCaret(0);
    }
  };

  /**
   * @inheritDoc
   */
  public placeCursor(num: number): void {
    this.inputRef.instance.placeCursor(num, false);
  }

  /**
   * Sets a character at the current cursor position
   * @param char The character to set
   */
  public async setCharacterAtCursor(char: string): Promise<void> {

    if (!this.inputRef.instance.getIsEditingActive().get()) {
      this.inputRef.instance.activateEditing(false);
      this.inputRef.instance.placeCursor(0, false);
    }

    if (this.disableFacilitySearch.get()) {
      this.inputRef.instance.setSlotCharacterValue(char);

      if (this.isKeyboardField) {
        const newValue = this.inputText.get();
        this.keyboardState.setInputDirect(newValue);
        const newCursor = this.inputRef.instance.cursorPosition.get();
        this.keyboardState.setCaret(newCursor);
      }

      return;
    }

    // Validate there will be matches from the new input using the
    // same search rules as InsertWptController.
    const currentText = this.inputText.get();
    const cursorPos = this.keyboardState.caret.get();
    const searchText = currentText.slice(0, cursorPos) + char;

    const { exactMatches, suggestedMatch } = await this.searchFacilities(searchText);

    const hasMatch = !!(exactMatches && exactMatches.length > 0) || !!suggestedMatch;

    if (!hasMatch) {
      this.props.onNoMatchFound?.('Please enter a valid identifier or value.');
      // Do NOT commit the character if it would make the ident invalid.
      return;
    }

    // At least one exact match or long suggestion exists → commit the char.
    this.inputRef.instance.setSlotCharacterValue(char);

    if (this.isKeyboardField) {
      // This is keyboard field, which will sync to LegBlock field
      const newValue = this.inputText.get();
      this.keyboardState.setInputDirect(newValue);
      const newCursor = this.inputRef.instance.cursorPosition.get();
      this.keyboardState.setCaret(newCursor);
    }
  }

  /**
   * @inheritDoc
   */
  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // Sync with keyboard state
    if (!this.isKeyboardField) {
      // LegBlock field

      this.inputText.sub((value) => {
        if (!this.isUpdatingFromKeyboardState) {
          this.keyboardState.setInputDirect(value);
        }
        this.onInputTextChanged(true);
      });

      this.inputRef.instance.cursorPosition.sub((pos) => {
        if (this.keyboardState.isEditingActive.get()) {
          this.keyboardState.setCaret(pos);
        }
      });

      // Keyboard state changes
      this.keyboardState.input.sub((value) => {
        if (this.keyboardState.isEditingActive.get()) {
          this.isUpdatingFromKeyboardState = true;
          this.inputRef.instance.setValue(value);
          this.inputText.set(value);
          this.isUpdatingFromKeyboardState = false;
        }
      });

      this.keyboardState.caret.sub((pos) => {
        if (this.inputRef.instance.getIsEditingActive().get() && this.keyboardState.isEditingActive.get() && pos > -1) {
          this.inputRef.instance.placeCursor(Math.min(pos, this.inputSlotEntries.length - 1), false);
        }
      });
    } else {
      // This is the keyboards field, listen to keyboard state
      this.keyboardState.input.sub((value) => {
        if (this.keyboardState.isEditingActive.get()) {
          this.inputRef.instance.setValue(value);
          this.inputText.set(value);
          this.onInputTextChanged(true);
        }
      });

      this.keyboardState.caret.sub((pos) => {
        if (this.inputRef.instance.getIsEditingActive().get() && this.keyboardState.isEditingActive.get()) {
          this.inputRef.instance.placeCursor(Math.min(pos, this.inputSlotEntries.length - 1), false);
        }
      });

      this.inputText.sub((value) => {
        this.keyboardState.setInputDirect(value);
      });

      this.inputRef.instance.cursorPosition.sub((pos) => {
        this.keyboardState.setCaret(pos);
      });
    }

    this.autocompleteTextSub.resume(true);
  }

  /**
   * Get the current value
   * @returns string - the current value
   */
  public getValue(): string {
    return this.inputText.get();
  }

  /**
   * Get the current facility
   * @returns Facility - the current facility
   */
  public getFacilityFrequency(): number | null {
    const facility = this.selectedFacility.get() as VorFacility;
    return facility?.freqMHz || null;
  }

  /**
   * Indicates whether the current input has a valid facility match.
   * @returns True if there is at least one exact match.
   */
  public isInputValid(): boolean {
    if (this.disableFacilitySearch.get()) {
      return true;
    }
    return this.hasValidMatch.get();
  }

  /**
   * On enter pressed.
   * Behavior:
   * - If facility search is disabled → just return the current value.
   * - If a shadowed suggestion is active → promote the suggestion to
   * real text (no more shadow), re-run search, and return that ident.
   * - Otherwise → return exactly what the user has typed.
   *
   * @returns The ident to commit.
   */
  public onEnterPressed(): string {
    if (this.disableFacilitySearch.get()) {
      return this.getValue();
    }

    if (this.hasActiveAutocomplete()) {
      const full = this.autocompleteText.get();

      if (full) {
        this.inputText.set(full);
        this.inputRef.instance.setValue(full);
        this.inputRef.instance.placeCursor(Math.max(full.length - 1, 0), false);

        this.autocompleteText.set('');
        this.updateSearch();

        return full;
      }
    }

    // 2) No active autocomplete → commit only what the user actually typed.
    return this.getValue();
  }

  /**
   * Clears this dialog's pending request and fulfills the pending request Promise if one exists.
   */
  private cleanupRequest(): void {
    ++this.searchOpId;
    this.autocompleteTextSub.pause();
    this.facilitySearchType = undefined;
    this.facilityMatches = undefined;

    const resolve = this.resolveFunction;
    this.resolveFunction = undefined;
    resolve;
  }

  /** @inheritDoc */
  public request<T extends FacilitySearchType>(): Promise<SearchTypeMap[T]> {
    return new Promise<SearchTypeMap[T]>(resolve => {
      this.cleanupRequest();

      this.resolveFunction = resolve;

      this.facilitySearchType = this.props.textInputSearchType ?? FacilitySearchType.Airport;

      if (this.inputText.get()) {
        this.inputRef.instance.setValue(this.inputText.get() ?? '');
      } else {
        this.inputRef.instance.setValue('');
        this.selectedFacility.set(null);
      }

      this.autocompleteText.set('');

      this.inputRef.instance.deactivateEditing();
      this.inputRef.instance.refresh();

      this.autocompleteTextSub.resume(true);
    });
  }

  /**
   * Populate and activate
   * @param intialValue the initial value
   */
  public onRequest(intialValue: string): void {
    this.inputText.set(intialValue);
    this.activateEditing();
  }

  /**
   * @inheritDoc
   */
  public render(): VNode {

    return (
      <div
        class={this.props.class}
        ref={this.divRef}
      >
        <CharInput
          ref={this.inputRef}
          value={this.inputText}
          class='wpt-textfield-input'
        >
          {this.inputSlotEntries.map(entry => {
            return (
              <CharInputSlot
                ref={entry.ref}
                defaultCharValue={entry.defaultCharValue}
                charArray={this.keyboardState.allowedChars.getArray()}
                wrap
                class={{
                  'wpt-textfield-input-slot-autocomplete': entry.defaultCharValue.map(value => value !== '')
                }}
              />
            );
          })}
        </CharInput>
      </div>
    );
  }
}

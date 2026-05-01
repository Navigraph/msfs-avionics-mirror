import {
  AirportFacility, AirportFacilityDataFlags, FacilityFrequency, FacilityFrequencyType, FacilitySearchType, FacilityType, FlightPlannerEvents,
  FmcRenderTemplate, FmcRenderTemplateRow, GeoPoint, GeoPointSubject, GNSSEvents, IcaoValue, LineSelectKeyEvent, MappedSubject, MutableSubscribable,
  OriginDestChangeType, PageLinkField, Subject, TextInputField,
} from '@microsoft/msfs-sdk';

import { WT21FmsUtils } from '@microsoft/msfs-wt21-shared';

import { WT21FmcPage } from '../WT21FmcPage';
import { WTLineFmsUtils, WTLineLegacyFlightPlans } from '@microsoft/msfs-wtlinesdk';
import { CommunicationTypePage } from './CommunicationTypePage';

const NUM_FREQUENCY_ROWS = 8;
const NUM_FREQUENCY_ENTRIES = NUM_FREQUENCY_ROWS;

const FacilityFrequencyTypeArray = [
  FacilityFrequencyType.None,
  FacilityFrequencyType.ATIS,
  FacilityFrequencyType.Tower,
  FacilityFrequencyType.FSS,
  FacilityFrequencyType.Departure,
  FacilityFrequencyType.Unicom,
  FacilityFrequencyType.Multicom,
  FacilityFrequencyType.CTAF,
  FacilityFrequencyType.Ground,
  FacilityFrequencyType.Clearance,
  FacilityFrequencyType.Approach,
  FacilityFrequencyType.Center,
  FacilityFrequencyType.AWOS,
  FacilityFrequencyType.ASOS,
  FacilityFrequencyType.CPT,
  FacilityFrequencyType.GCO,
];

/** Base type for FrequencyPageAction */
interface BaseFrequencyPageAction {
  /** The type of the action */
  type: string,

  /** The value associated with the action */
  value: any,
}

/** FrequencyPageAction for setting the frequency */
interface SetFrequencyFrequencyPageAction extends BaseFrequencyPageAction {
  /** @inheritDoc */
  type: 'setFrequency',

  /** @inheritDoc */
  value: number,
}

/** FrequencyPageAction for opening the MULTIPLE page */
interface SeeMultipleFrequencyPageAction extends BaseFrequencyPageAction {
  /** @inheritDoc */
  type: 'seeMultiple',

  /** @inheritDoc */
  value: { /** Airport 5-letter Ident */ airportIdent: string, /** The frequencies to show */ frequencies: readonly FacilityFrequency[] }
}

/**
 * An action to perform on a certain LSK of the FREQUENCY DATA page
 */
type FrequencyPageAction = SetFrequencyFrequencyPageAction | SeeMultipleFrequencyPageAction


/**
 * Airport selection on the FREQUENCY DATA page
 */
enum FrequencyPageAirportSelection {
  /** FROM airport */
  Origin,

  /** TO airport */
  Destination,

  /** ALTN airport */
  Alternate,

  /** Custom airport */
  Custom,
}

/**
 * Data store for the FREQUENCY DATA page
 */
class FrequencyPageStore {
  public readonly ppos = GeoPointSubject.create(new GeoPoint(0, 0));

  public readonly airports: { [k in FrequencyPageAirportSelection]: MutableSubscribable<AirportFacility | null> } = {
    [FrequencyPageAirportSelection.Origin]: Subject.create<AirportFacility | null>(null),
    [FrequencyPageAirportSelection.Destination]: Subject.create<AirportFacility | null>(null),
    [FrequencyPageAirportSelection.Alternate]: Subject.create<AirportFacility | null>(null),
    [FrequencyPageAirportSelection.Custom]: Subject.create<AirportFacility | null>(null),
  };

  public readonly selectedIndex = Subject.create(FrequencyPageAirportSelection.Origin);
}

/**
 * Frequency page
 */
export class FrequencyPage extends WT21FmcPage {
  private store = new FrequencyPageStore();

  private actionTable: [FrequencyPageAction | undefined, FrequencyPageAction | undefined][] = [
    [undefined, undefined],
    [undefined, undefined],
    [undefined, undefined],
    [undefined, undefined],
  ];

  /** @inheritDoc */
  protected onInit(): void {
    super.onInit();

    this.onPrimaryPlanChanged();

    const sub = this.bus.getSubscriber<GNSSEvents & FlightPlannerEvents>();

    sub.on('gps-position').whenChanged().handle(({ lat, long }) => {
      this.store.ppos.set(lat, long);
    }).withLifecycle(this.defaultLifecycle);

    sub.on('fplLoaded').handle((evt) => {
      if (evt.planIndex === WTLineLegacyFlightPlans.Active) {
        this.onPrimaryPlanChanged();
      }
    }).withLifecycle(this.defaultLifecycle);

    sub.on('fplCopied').handle((evt) => {
      if (evt.targetPlanIndex === WTLineLegacyFlightPlans.Active) {
        this.onPrimaryPlanChanged();
      }
    }).withLifecycle(this.defaultLifecycle);

    sub.on('fplOriginDestChanged').handle((evt) => {
      // FIXME hanlde plan indices here...?

      switch (evt.type) {
        case OriginDestChangeType.OriginAdded:
        case OriginDestChangeType.OriginRemoved: {
          if (evt.airportIcao !== undefined) {
            this.fms.facLoader.getFacility(FacilityType.Airport, evt.airportIcao, AirportFacilityDataFlags.Minimal | AirportFacilityDataFlags.Frequencies).then((airport) => {
              this.store.airports[FrequencyPageAirportSelection.Origin].set(airport);

              this.store.selectedIndex.set(FrequencyPageAirportSelection.Origin);
            });
          } else {
            this.store.airports[FrequencyPageAirportSelection.Origin].set(null);
          }
          break;
        }
        case OriginDestChangeType.DestinationAdded:
        case OriginDestChangeType.DestinationRemoved: {
          if (evt.airportIcao) {
            this.fms.facLoader.getFacility(FacilityType.Airport, evt.airportIcao, AirportFacilityDataFlags.Minimal | AirportFacilityDataFlags.Frequencies).then((airport) => {
              this.store.airports[FrequencyPageAirportSelection.Destination].set(airport);

              this.store.selectedIndex.set(FrequencyPageAirportSelection.Destination);
            });
          } else {
            this.store.airports[FrequencyPageAirportSelection.Destination].set(null);
          }
          break;
        }
      }
    }).withLifecycle(this.defaultLifecycle);

    sub.on('fplUserDataSet').handle((evt) => {
      if (evt.planIndex === WTLineLegacyFlightPlans.Active && evt.key === WT21FmsUtils.USER_DATA_KEY_ALTN) {
        const altnIcao = evt.data as string;

        this.fms.facLoader.getFacility(FacilityType.Airport, altnIcao).then((airport) => {
          this.store.airports[FrequencyPageAirportSelection.Alternate].set(airport);

          this.store.selectedIndex.set(FrequencyPageAirportSelection.Alternate);
        }).catch();
      }
    }).withLifecycle(this.defaultLifecycle);
  }

  /**
   * Handler for the primary flight plan changing
   */
  private onPrimaryPlanChanged(): void {
    if (!this.fms.hasPrimaryFlightPlan()) {
      return;
    }

    const originIcao = this.fms.getPrimaryFlightPlan().originAirportIcao;

    if (originIcao) {
      this.fms.facLoader.getFacility(FacilityType.Airport, originIcao).then((airport) => {
        this.store.airports[FrequencyPageAirportSelection.Origin].set(airport);
      });
    } else {
      this.store.airports[FrequencyPageAirportSelection.Origin].set(null);
    }

    const destIcao = this.fms.getPrimaryFlightPlan().destinationAirportIcao;

    if (destIcao) {
      this.fms.facLoader.getFacility(FacilityType.Airport, destIcao).then((airport) => {
        this.store.airports[FrequencyPageAirportSelection.Destination].set(airport);
      });
    } else {
      this.store.airports[FrequencyPageAirportSelection.Destination].set(null);
    }

    const altnIcao = WTLineFmsUtils.getFlightPlanAlternate(this.fms.getFlightPlan(WTLineLegacyFlightPlans.Active));

    if (altnIcao) {
      this.fms.facLoader.getFacility(FacilityType.Airport, altnIcao).then((airport) => {
        this.store.airports[FrequencyPageAirportSelection.Alternate].set(airport);
      });
    } else {
      this.store.airports[FrequencyPageAirportSelection.Alternate].set(null);
    }
  }

  private AirportSelectionField = new TextInputField(this, {
    onSelected: async (scratchpadContents: string) => {
      if (scratchpadContents === '') {
        this.store.selectedIndex.set((this.store.selectedIndex.get() + 1) % 4);
        return true;
      }

      return false;
    },

    onDelete: async () => {
      const selectedIndex = this.store.selectedIndex.get();

      if (selectedIndex !== FrequencyPageAirportSelection.Custom) {
        throw 'INVALID DELETE';
      }

      this.store.airports[FrequencyPageAirportSelection.Custom].set(null);
      return true;
    },

    onModified: async (airport: AirportFacility): Promise<boolean | string> => {
      this.store.airports[FrequencyPageAirportSelection.Custom].set(airport);
      this.store.selectedIndex.set(FrequencyPageAirportSelection.Custom);
      return true;
    },

    formatter: {
      nullValueString: '----/----/----/□□□□',

      /** @inheritDoc */
      format([from, to, altn, input, selectedIndex]: readonly [ // FIXME this is kinda sus
        from: AirportFacility | null,
        to: AirportFacility | null,
        altn: AirportFacility | null,
        input: AirportFacility | null,
        selectedIndex: number,
      ]): string {
        let fromIdent = from ? from.icaoStruct.ident : '----';
        let toIdent = to ? to.icaoStruct.ident : '----';
        let altnIdent = altn ? altn.icaoStruct.ident : '----';
        let inputIdent = input ? input.icaoStruct.ident : '□□□□';

        switch (selectedIndex) {
          case 0:
            fromIdent += '[green d-text]/';
            toIdent += '[white s-text]/';
            altnIdent += '[white s-text]/';
            inputIdent += `[white ${input ? 's-text' : 'd-text'}]`;
            break;
          case 1:
            fromIdent += '/[white s-text]';
            toIdent += '[green d-text]/';
            altnIdent += '[white s-text]/';
            inputIdent += `[white ${input ? 's-text' : 'd-text'}]`;
            break;
          case 2:
            fromIdent += '/[white s-text]';
            toIdent += '/[white s-text]';
            altnIdent += '[green d-text]/';
            inputIdent += `[white ${input ? 's-text' : 'd-text'}]`;
            break;
          case 3:
            fromIdent += '/[white s-text]';
            toIdent += '/[white s-text]';
            altnIdent += '/[white s-text]';
            inputIdent += '[green d-text]';
            break;
        }

        return `${fromIdent}${toIdent}${altnIdent}${inputIdent}`;
      },

      parse: async (input: string): Promise<AirportFacility | null> => {
        const facility = await this.screen.selectWptFromIdent(input, this.store.ppos.get(), FacilitySearchType.Airport);

        if (facility === null) {
          return null;
        }

        return facility;
      },
    },
  }).bind(
    MappedSubject.create(
      this.store.airports[FrequencyPageAirportSelection.Origin],
      this.store.airports[FrequencyPageAirportSelection.Destination],
      this.store.airports[FrequencyPageAirportSelection.Alternate],
      this.store.airports[FrequencyPageAirportSelection.Custom],
      this.store.selectedIndex,
    ),
  );

  private readonly IndexLinkField = PageLinkField.createLink(this, '<INDEX', '/index');

  /** @inheritDoc */
  public render(): FmcRenderTemplate[] {
    const selectedAirport = this.store.airports[this.store.selectedIndex.get()].get();

    if (selectedAirport && selectedAirport.frequencies.length > 0) {
      const frequencies = this.groupAirportFrequencies(selectedAirport);

      const numPages = Math.ceil(frequencies.size / NUM_FREQUENCY_ENTRIES);

      const pages = [];
      for (let i = 0; i < numPages; i++) {
        pages.push(
          [
            ['     FREQUENCY DATA[blue]', this.PagingIndicator],
            [' SEL APT[blue]'],
            [this.AirportSelectionField],
            ...this.renderAirportFrequencyList(frequencies, selectedAirport.icaoStruct, i),
            ['', '', '------------------------[blue]'],
            [this.IndexLinkField, ''],
          ],
        );
      }

      return pages;
    } else {
      return [
        [
          ['      FREQUENCY DATA[blue]', this.PagingIndicator],
          [' SEL APT[blue]'],
          [this.AirportSelectionField],
          ...this.renderNoDataAvailable(),
          ['------------------------[blue]'],
          [this.IndexLinkField, ''],
        ],
      ];
    }
  }

  /**
   * Renders the frequency list for a given airport
   *
   * @param frequencies the mapped frequencies for the airport
   * @param airportIcao the ICAO for the airport
   * @param pageIndex   the page index to render
   *
   * @returns fmc template rows
   */
  private renderAirportFrequencyList(
    frequencies: Map<FacilityFrequencyType, FacilityFrequency[]>,
    airportIcao: IcaoValue,
    pageIndex: number,
  ): FmcRenderTemplateRow[] {
    const isVisiblePage = pageIndex === this.screen.currentSubpageIndex.get() - 1;

    if (frequencies.size > 0) {
      const rows: FmcRenderTemplateRow[] = [];

      const start = pageIndex * NUM_FREQUENCY_ENTRIES;
      const end = start + NUM_FREQUENCY_ENTRIES;

      for (let i = start; i < end && i < frequencies.size && rows.length < NUM_FREQUENCY_ROWS; i++) {
        if (i % 2 !== 0) {
          continue;
        }

        const entry = Array.from(frequencies.entries())[i];
        const nextEntry = Array.from(frequencies.entries())[i + 1];

        const leftFrequencyType = entry[0];

        let leftHeader = '', leftContent = '', rightHeader = '', rightContent = '';

        const leftFrequencies = frequencies.get(leftFrequencyType);

        if (!leftFrequencies) {
          break; // This basically never happens
        }

        leftHeader = WT21FmsUtils.formatFacilityFrequencyType(leftFrequencies[0], 'ILS/LOC');
        if (leftFrequencies.length > 1) {
          leftContent = '<MULTIPLE';
          if (isVisiblePage) {
            this.setFrequencyAction(i % NUM_FREQUENCY_ENTRIES, { type: 'seeMultiple', value: { airportIdent: airportIcao.ident, frequencies: leftFrequencies } });
          }
        } else {
          leftContent = leftFrequencies[0].freqMHz.toFixed(3);
          if (isVisiblePage) {
            this.setFrequencyAction(i % NUM_FREQUENCY_ENTRIES, { type: 'setFrequency', value: leftFrequencies[0].freqMHz });
          }
        }

        if (nextEntry) {
          const rightFrequencyType = nextEntry[0];
          const rightFrequencies = frequencies.get(rightFrequencyType);

          if (!rightFrequencies) {
            break; // This basically never happens
          }

          rightHeader = WT21FmsUtils.formatFacilityFrequencyType(rightFrequencies[0], 'ILS/LOC');
          if (rightFrequencies.length > 1) {
            rightContent = 'MULTIPLE>';
            if (isVisiblePage) {
              this.setFrequencyAction((i + 1) % NUM_FREQUENCY_ENTRIES, { type: 'seeMultiple', value: { airportIdent: airportIcao.ident, frequencies: rightFrequencies } });
            }
          } else {
            rightContent = rightFrequencies[0].freqMHz.toFixed(3);
            if (isVisiblePage) {
              this.setFrequencyAction((i + 1) % NUM_FREQUENCY_ENTRIES, { type: 'setFrequency', value: rightFrequencies[0].freqMHz });
            }
          }
        }

        rows.push(
          [` ${leftHeader}[blue]`, `${rightHeader}[blue] `],
          [leftContent, rightContent],
        );
      }

      // Pad rows at the bottom
      for (let i = 0; rows.length < NUM_FREQUENCY_ROWS; i++) {
        rows.push(['']);
      }

      return rows;
    } else {
      return this.renderNoDataAvailable();
    }
  }

  /**
   * Groups airport facility frequencies together by type
   *
   * @param airport the airport in question
   *
   * @returns a map
   */
  private groupAirportFrequencies(airport: AirportFacility): Map<FacilityFrequencyType, FacilityFrequency[]> {
    const map = new Map<FacilityFrequencyType, FacilityFrequency[]>();

    const sortedAirportFrequencies = [...airport.frequencies]
      .sort((a, b) => {
        const aPos = FacilityFrequencyTypeArray.findIndex((it) => it === a.type) ?? 0;
        const bPos = FacilityFrequencyTypeArray.findIndex((it) => it === b.type) ?? 0;

        return aPos - bPos;
      });

    for (const frequency of sortedAirportFrequencies) {
      if (!map.has(frequency.type)) {
        map.set(frequency.type, []);
      }

      if (map.has(frequency.type)) {
        map.get(frequency.type)?.push(frequency);
      }
    }

    return map;
  }

  /**
   * Renders NO DATA AVAILABLE
   *
   * @returns fmc template rows
   */
  private renderNoDataAvailable(): FmcRenderTemplateRow[] {
    return [
      ['', ''],
      ['', ''],
      ['         NO DATA[d-text]'],
      [''],
      ['        AVAILABLE[d-text]'],
      ['', ''],
      ['', ''],
      ['', ''],
    ];
  }

  /**
   * Sets the action for a frequency, given its sequential index from the start of the list on the page and an action
   *
   * @param listStartIndex the index
   * @param action the action
   */
  private setFrequencyAction(listStartIndex: number, action: FrequencyPageAction): void {
    const actionTableRow = (listStartIndex - listStartIndex % 2) / 2;
    const actionTableColumn = listStartIndex % 2;

    if (!this.actionTable[actionTableRow]) {
      this.actionTable[actionTableRow] = [undefined, undefined];
    }

    this.actionTable[actionTableRow][actionTableColumn] = action;
  }

  /**
   * Gets a {@link FrequencyPageAction} from an LSK event
   * @param event the LSK event
   * @returns the event or `undefined`
   */
  private getLskAction(event: LineSelectKeyEvent): FrequencyPageAction | undefined {
    const lskSide = event.col;
    const lskNumber = event.row / 2;

    if (Number.isFinite(lskNumber)) {
      const actionTableRow = lskNumber - 2;

      if (actionTableRow >= 0 && actionTableRow <= 3) {
        return this.actionTable[actionTableRow][lskSide];
      }
    }

    return undefined;
  }

  /** @inheritDoc */
  protected async onHandleSelectKey(event: LineSelectKeyEvent): Promise<boolean | string> {
    const action = this.getLskAction(event);

    if (action) {
      if (action.type === 'setFrequency') {
        return action.value.toFixed(3);
      } else if (action.type === 'seeMultiple') {
        this.screen.navigateTo(CommunicationTypePage, { airportIdent: action.value.airportIdent, frequencies: action.value.frequencies });
        return true;
      }
    }

    return false;
  }
}

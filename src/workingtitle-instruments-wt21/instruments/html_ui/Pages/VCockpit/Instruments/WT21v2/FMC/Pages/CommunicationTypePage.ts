import { FacilityFrequency, FacilityFrequencyType, FmcRenderTemplate, FmcRenderTemplateRow, PageLinkField, RadioUtils } from '@microsoft/msfs-sdk';

import { WT21FmsUtils } from '@microsoft/msfs-wt21-shared';

import { FmcSelectKeysEvent } from '../FmcEvent';
import { WT21FmcPage } from '../WT21FmcPage';

/**
 * Props for {@link CommunicationTypePage}
 */
export interface CommunicationTypePageProps {
  /** The airport ident */
  airportIdent: string;

  /** The frequencies to display */
  frequencies: readonly FacilityFrequency[];
}

/**
 * Page for `<MULTIPLE` links in the FREQUENCY DATA page
 */
export class CommunicationTypePage extends WT21FmcPage<CommunicationTypePageProps> {
  private static readonly NUM_FREQUENCY_ROWS = 10;

  public static readonly MAX_FREQUENCIES_LISTED = 8;

  private frequencyTable: number[] = [];

  private readonly FrequencyPageLink = PageLinkField.createLink(this, '<FREQUENCY', '/freq');

  /** @inheritDoc */
  render(): FmcRenderTemplate[] {
    const airportIdent = this.props.airportIdent;

    const sortedFrequencies = [...this.props.frequencies].sort(CommunicationTypePage.sortFrequencies);
    sortedFrequencies.length = Math.min(sortedFrequencies.length, CommunicationTypePage.MAX_FREQUENCIES_LISTED);

    const header = WT21FmsUtils.formatFacilityFrequencyType(sortedFrequencies[0], 'ILS/LOC');

    const numPages = Math.ceil(sortedFrequencies.length / 5);

    const pages = [];

    for (let i = 0; i < numPages; i++) {
      pages.push(
        [
          [`${airportIdent}   ${header}[blue]`, this.PagingIndicator],
          ...this.renderFrequencyRows(sortedFrequencies, i),
          ['------------------------[blue]'],
          [this.FrequencyPageLink, ''],
        ],
      );
    }

    return pages;
  }

  /**
   * Sorts two frequencies according to COM frequency sorting rules:
   * 8.33 KHz spaced frequencies, then 25 KHz spaced frequencies, then HF frequencies, then UHF frequencies
   * @param a the first frequency
   * @param b the second frequency
   * @returns a negative number if `a` should come before `b`, a positive number if `b` should come before `a`, or
   * zero if they are equivalent
   */
  private static sortFrequencies(a: FacilityFrequency, b: FacilityFrequency): number {
    // Sort frequencies as: 8.33 KHz spaced, 25 KHz spaced, HF then UHF
    const aIs833 = RadioUtils.isCom833Frequency(a.freqMHz);
    const bIs833 = RadioUtils.isCom833Frequency(b.freqMHz);

    // 8.33 KHz before 25 KHz
    if (aIs833 && !bIs833) {
      return -1;
    } else if (!aIs833 && bIs833) {
      return 1;
    }

    const aIs25 = RadioUtils.isCom25Frequency(a.freqMHz);
    const bIs25 = RadioUtils.isCom25Frequency(b.freqMHz);

    // 25 KHz before HF/UHF
    if (aIs25 && !bIs25) {
      return -1;
    } else if (!aIs25 && bIs25) {
      return 1;
    }

    const aIsUhf = RadioUtils.isComUhfFrequency(a.freqMHz);
    const bIsUhf = RadioUtils.isComUhfFrequency(b.freqMHz);

    // HF before UHF
    if (!aIsUhf && bIsUhf) {
      return -1;
    } else if (aIsUhf && !bIsUhf) {
      return 1;
    }

    return a.freqMHz - b.freqMHz;
  }

  /**
   * Renders rows showing the airport frequencies
   *
   * @param frequencies the frequencies
   * @param pageIndex   the page index to render the list for
   *
   * @returns fmc template rows
   */
  private renderFrequencyRows(frequencies: FacilityFrequency[], pageIndex: number): FmcRenderTemplateRow[] {
    const isVisiblePage = pageIndex === this.screen.currentSubpageIndex.get() - 1;

    if (isVisiblePage) {
      this.frequencyTable = [];
    }

    const rows: FmcRenderTemplateRow[] = [];

    const start = pageIndex * 5;
    const end = start + 5;

    for (let i = start; i < end && i < frequencies.length && rows.length < CommunicationTypePage.NUM_FREQUENCY_ROWS; i++) {
      const frequency = frequencies[i];

      let title = '';
      if (frequency.type === FacilityFrequencyType.None) {
        const runway = frequency.name.match(/.*RW(\d{2}[LRCT]?).*/)?.[1];

        if (runway) {
          const ident = frequency.icaoStruct.ident;

          title = `LOC RW${runway} ${ident}`;
        }
      }

      rows.push(
        [` ${title}[blue]`],
        [frequency.freqMHz.toFixed(3)],
      );

      if (isVisiblePage) {
        this.setLskFrequency(i, frequency.freqMHz);
      }
    }

    for (let i = rows.length; i < CommunicationTypePage.NUM_FREQUENCY_ROWS; i++) {
      rows.push(['']);
    }

    return rows;
  }

  /**
   * Sets the frequency for an LSK, given its sequential index from the start of the list on the page and a frequency
   *
   * @param listStartIndex the index
   * @param frequency the frequency
   */
  private setLskFrequency(listStartIndex: number, frequency: number): void {
    const actionTableRow = listStartIndex % 5;

    this.frequencyTable[actionTableRow] = frequency;
  }

  /**
   * Gets a frequency from an LSK event;
   * @param event the LSK event
   * @returns the frequency or `undefined`
   */
  private getLskFrequency(event: FmcSelectKeysEvent): number | undefined {
    const lskSide = Array.from(FmcSelectKeysEvent[event])[0];
    const lskNum = Array.from(FmcSelectKeysEvent[event])[4];

    if (lskSide !== 'L') {
      return undefined;
    }

    const lskNumber = parseInt(lskNum);

    if (Number.isFinite(lskNumber)) {
      const frequencyTableRow = lskNumber - 1;

      if (frequencyTableRow >= 0 && frequencyTableRow <= 4) {
        return this.frequencyTable[frequencyTableRow];
      }
    }
    return undefined;
  }

  /** @inheritDoc */
  async handleSelectKey(event: FmcSelectKeysEvent): Promise<boolean | string> {
    const frequencyAtLsk = this.getLskFrequency(event);

    if (frequencyAtLsk !== undefined) {
      return frequencyAtLsk.toFixed(3);
    }

    return false;
  }
}

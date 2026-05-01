import {
  AirportFacility,
  AirportPrivateType,
  Facility,
  FacilityFrequency,
  FacilityFrequencyType,
  FacilityType,
  ICAO,
  NdbFacility,
  NdbType,
  VorClass,
  VorFacility,
  VorType,
} from '@microsoft/msfs-sdk';

/**
 * Utility helpers for rendering and formatting facility-related information.
 */
export class FacilityInfoUtils {
  /**
   * Gets a human-readable label for the given facility.
   * Dispatches to more specific helpers (airport, VOR, etc.).
   * @param facility The facility.
   * @returns The display text for the facility.
   */
  public static getFacilityDisplayText(
    facility: Facility | undefined
  ): string {
    if (!facility) {
      return '';
    }

    const facType = ICAO.getFacilityTypeFromValue(facility.icaoStruct);

    if (facType === FacilityType.Airport) {
      return FacilityInfoUtils.getAirportTypeText(facility as AirportFacility);
    }

    if (facType === FacilityType.VOR) {
      return FacilityInfoUtils.getVorTypeText(facility as VorFacility);
    }

    if (facType === FacilityType.NDB) {
      return FacilityInfoUtils.getNdbTypeText(facility as NdbFacility);
    }

    return '';
  }

  /**
   * Gets a human-readable text for an NDB facility power class.
   * @param ndb The NDB facility.
   * @returns The NDB power class text (e.g. "Med Pwr NDB").
   */
  public static getNdbTypeText(ndb: NdbFacility): string {
    switch (ndb.type) {
      case NdbType.CompassPoint:
      case NdbType.H:
        return 'Low Pwr NDB';
      case NdbType.HH:
        return 'Hi Pwr NDB';
      case NdbType.MH:
        return 'Med Pwr NDB';
      default:
        return '';
    }
  }

  /**
   * Gets a label for an airport.
   * @param airport The airport facility.
   * @returns The airport type text.
   */
  public static getAirportTypeText(airport: AirportFacility): string {
    switch (airport.airportPrivateType) {
      case AirportPrivateType.Public:
        return 'Public Airport';
      case AirportPrivateType.Private:
        return 'Private Airport';
      case AirportPrivateType.Military:
        return 'Military Airport';
      default:
        return 'Airport';
    }
  }

  /**
   * Gets a label for a VOR facility, combining class and technical type.
   * @param vor The VOR facility.
   * @returns The VOR type text.
   */
  public static getVorTypeText(vor: VorFacility): string {
    const isTerminal = vor.icaoStruct.airport.length > 0;
    switch (vor.type) {
      case VorType.DME:
        return isTerminal ? 'Terminal DME' : 'Enroute DME';
      case VorType.ILS:
        return 'Terminal ILS/DME';
      case VorType.VOR:
        return isTerminal ? 'Terminal VOR' : (vor.vorClass === VorClass.HighAlt ? 'Hi Alt VOR' : 'Low Alt VOR');
      case VorType.VORDME:
      case VorType.VORTAC:
        return isTerminal ? 'Terminal VOR/DME' : (vor.vorClass === VorClass.HighAlt ? 'Hi Alt VOR/DME' : 'Low Alt VOR/DME');
      case VorType.TACAN:
        return 'TACAN';
      default:
        return '';
    }
  }

  /**
   * Gets a frequency name and performs any modifications required for capitalisation, etc.
   * @param freq The frequency to get the name of
   * @param airportIdent The airport the frequency is linked to, if any.
   * @returns A formatted frequency name with the type suffixed.
   */
  public static getFrequencyName(freq: FacilityFrequency, airportIdent: string = ''): string {
    // Generally frequency names returned are either along the lines of 'EGGP Info' or 'LIVERPOOL Tower'
    // we want to convert the capitalisation of the second case to look better
    const freqName = freq.name === airportIdent ? freq.name : freq.name.split(' ').map((word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase()).join(' ');

    switch (true) {
      // We need to also handle some cases where the frequency name is already suffixed by the type,
      // i.e. 'Scottish Control' or 'Barton Tower'
      case freqName.endsWith('Tower'):
      case freqName.endsWith('Control'):
      case freqName.endsWith('Centre'):
      case freqName.endsWith('Center'):
        return freqName;
      default:
        return `${freqName} ${FacilityInfoUtils.getFrequencyTypeTitle(freq.type, airportIdent)}`;
    }
  }

  /**
   * Gets the title for a frequency type. This depends on region in many cases.
   * @param type The frequency type
   * @param airportIdent The airport ident
   * @returns The title for a frequency based on its type
   */
  public static getFrequencyTypeTitle(type: FacilityFrequencyType, airportIdent: string): string {
    const isAmerican = airportIdent.startsWith('K') || airportIdent.startsWith('CY'); // If airport ident is USA or CANADA
    switch (type) {
      case FacilityFrequencyType.None:
        return '';
      case FacilityFrequencyType.ATIS:
      case FacilityFrequencyType.AWOS:
      case FacilityFrequencyType.ASOS:
        return 'Information';
      case FacilityFrequencyType.Clearance:
      case FacilityFrequencyType.CPT:
      case FacilityFrequencyType.GCO:
        return 'Delivery';
      case FacilityFrequencyType.Ground:
        return 'Ground';
      case FacilityFrequencyType.Departure:
        return 'Departure';
      case FacilityFrequencyType.Tower:
        return 'Tower';
      case FacilityFrequencyType.Approach:
        return 'Approach';
      case FacilityFrequencyType.Center:
        return 'Centre';
      case FacilityFrequencyType.Multicom:
        return 'Multicom';
      case FacilityFrequencyType.Unicom:
        return isAmerican ? 'Unicom' : 'Information'; // For some reason Unicom is used for AFIS frequencies in europe
      case FacilityFrequencyType.FSS:
        return isAmerican ? 'FSS' : 'Radio'; // For some reason FSS is used for AGCS frequencies in europe
      case FacilityFrequencyType.CTAF:
        return 'Radio';
    }
  }

  private static readonly NAME_TABLE: Record<string, string> = {
    'AG': 'Solomon Islands',
    'AN': 'Nauru',
    'AY': 'Papua New Guinea',
    'BG': 'Greenland',
    'BI': 'Iceland',
    'BK': 'Kosovo',
    'CY': 'Canada',
    'DA': 'Algeria',
    'DB': 'Benin',
    'DF': 'Burkina Faso',
    'DG': 'Ghana',
    'DI': 'Ivory Coast',
    'DN': 'Nigeria',
    'DR': 'Niger',
    'DT': 'Tunisia',
    'DX': 'Togo',
    'EB': 'Belgium',
    'ED': 'Germany',
    'EE': 'Estonia',
    'EF': 'Finland',
    'EG': 'United Kingdom',
    'EH': 'Netherlands',
    'EI': 'Ireland',
    'EK': 'Denmark',
    'EL': 'Luxembourg',
    'EN': 'Norway',
    'EP': 'Poland',
    'ES': 'Sweden',
    'ET': 'Germany',
    'EV': 'Latvia',
    'EY': 'Lithuania',
    'FA': 'South Africa',
    'FB': 'Botswana',
    'FC': 'Congo',
    'FD': 'Eswatini',
    'FE': 'Central Africa',
    'FG': 'Equatorial Guinea',
    'FH': 'Ascension / St Helena',
    'FI': 'Mauritius',
    'FJ': 'Indian Ocean Territories',
    'FK': 'Cameroon',
    'FL': 'Zambia',
    'FM': 'Madagascar',
    'FN': 'Angola',
    'FO': 'Gabon',
    'FP': 'Sao Tome',
    'FQ': 'Mozambique',
    'FS': 'Seychelles',
    'FT': 'Chad',
    'FV': 'Zimbabwe',
    'FW': 'Malawi',
    'FX': 'Lesotho',
    'FY': 'Namibia',
    'FZ': 'Democratic Republic of Congo',
    'GA': 'Mali',
    'GB': 'Gambia',
    'GC': 'Canary Islands',
    'GE': 'Melilla',
    'GF': 'Sierra Leone',
    'GG': 'Guinea-Bissau',
    'GL': 'Liberia',
    'GM': 'Morocco',
    'GO': 'Senegal',
    'GQ': 'Mauritania',
    'GS': 'Western Sahara',
    'GU': 'Guinea',
    'GV': 'Cape Verde',
    'HA': 'Ethiopia',
    'HB': 'Burundi',
    'HD': 'Djibouti',
    'HE': 'Egypt',
    'HH': 'Eritrea',
    'HK': 'Kenya',
    'HL': 'Libya',
    'HR': 'Rwanda',
    'HS': 'Sudan',
    'HT': 'Tanzania',
    'HU': 'Uganda',
    'K1': 'USA',
    'K2': 'USA',
    'K3': 'USA',
    'K4': 'USA',
    'K5': 'USA',
    'K6': 'USA',
    'K7': 'USA',
    'KA': 'USA',
    'KB': 'USA',
    'KC': 'USA',
    'KD': 'USA',
    'KE': 'USA',
    'KF': 'USA',
    'KG': 'USA',
    'KH': 'USA',
    'KI': 'USA',
    'KJ': 'USA',
    'KK': 'USA',
    'KL': 'USA',
    'KM': 'USA',
    'KN': 'USA',
    'KO': 'USA',
    'KP': 'USA',
    'KQ': 'USA',
    'KR': 'USA',
    'KS': 'USA',
    'KT': 'USA',
    'KU': 'USA',
    'KV': 'USA',
    'KW': 'USA',
    'KX': 'USA',
    'KY': 'USA',
    'KZ': 'USA',
    'LA': 'Albania',
    'LB': 'Bulgaria',
    'LC': 'Cyprus',
    'LD': 'Croatia',
    'LE': 'Spain',
    'LF': 'France',
    'LG': 'Greece',
    'LH': 'Hungary',
    'LI': 'Italy',
    'LJ': 'Slovenia',
    'LK': 'Czech',
    'LL': 'Israel',
    'LM': 'Malta',
    'LO': 'Austria',
    'LP': 'Portugal',
    'LQ': 'Bosnia-Herzegovina',
    'LR': 'Romania',
    'LS': 'Switzerland',
    'LT': 'Turkey',
    'LU': 'Moldova',
    'LV': 'Palestine',
    'LW': 'Macedonia',
    'LX': 'Gibraltar',
    'LY': 'Serbia / Montenegro',
    'LZ': 'Slovakia',
    'MB': 'Turks and Caicos',
    'MD': 'Dominican Republic',
    'MG': 'Guatemala',
    'MH': 'Honduras',
    'MK': 'Jamaica',
    'MM': 'Mexico',
    'MN': 'Nicaragua',
    'MP': 'Panama',
    'MR': 'Costa Rica',
    'MS': 'El Salvador',
    'MT': 'Haiti',
    'MU': 'Cuba',
    'MW': 'Cayman Islands',
    'MY': 'Bahamas',
    'MZ': 'Belize',
    'NC': 'Cook Islands',
    'NF': 'Fiji / Tonga',
    'NG': 'Kiribati / Tuvalu',
    'NI': 'Niue',
    'NL': 'Wallis and Futuna',
    'NS': 'American / West Samoa',
    'NT': 'French Polynesia',
    'NV': 'Vanuatu',
    'NW': 'New Caledonia',
    'NZ': 'New Zealand',
    'OA': 'Afghanistan',
    'OB': 'Bahrain',
    'OE': 'Saudi Arabia',
    'OI': 'Iran',
    'OJ': 'Jordan',
    'OK': 'Kuwait',
    'OL': 'Lebanon',
    'OM': 'UAE',
    'OO': 'Oman',
    'OP': 'Pakistan',
    'OR': 'Iraq',
    'OS': 'Syria',
    'OT': 'Qatar',
    'OY': 'Yemen',
    'PA': 'USA',
    'PG': 'Guam',
    'PH': 'USA',
    'PJ': 'Johnston Atoll',
    'PK': 'Marshall Islands',
    'PL': 'Kiribati',
    'PM': 'Midway Island',
    'PO': 'USA',
    'PP': 'USA',
    'PT': 'Micronesia',
    'PW': 'Wake Island',
    'RC': 'Taiwan',
    'RJ': 'Japan',
    'RK': 'South Korea',
    'RO': 'Japan',
    'RP': 'Philippines',
    'SA': 'Argentina',
    'SB': 'Brazil',
    'SC': 'Chile',
    'SD': 'Brazil',
    'SE': 'Ecuador',
    'SG': 'Paraguay',
    'SI': 'Brazil',
    'SJ': 'Brazil',
    'SK': 'Colombia',
    'SL': 'Bolivia',
    'SM': 'Suriname',
    'SO': 'French Guiana',
    'SP': 'Peru',
    'SS': 'Brazil',
    'SU': 'Uruguay',
    'SV': 'Venezuela',
    'SW': 'Brazil',
    'SY': 'Guyana',
    'TA': 'Antigua',
    'TB': 'Barbados',
    'TD': 'Antigua',
    'TF': 'Guadeloupe / Martinique',
    'TG': 'Grenada',
    'TI': 'US Virgin Islands',
    'TJ': 'Puerto Rico',
    'TK': 'St Kitts and Nevis',
    'TL': 'St Lucia',
    'TN': 'Aruba',
    'TQ': 'Anguilla',
    'TT': 'Montserrat',
    'TU': 'Trinidad and Tobago',
    'TV': 'British Virgin Islands',
    'TX': 'Bermuda',
    'UA': 'Kazakhstan',
    'UB': 'Azerbaijan',
    'UC': 'Kyrgyzstan',
    'UD': 'Armenia',
    'UE': 'Russia',
    'UG': 'Georgia',
    'UH': 'Russia',
    'UI': 'Russia',
    'UK': 'Ukraine',
    'UL': 'Russia',
    'UM': 'Russia / Belarus',
    'UN': 'Russia',
    'UO': 'Russia',
    'UR': 'Russia / Kazakhstan',
    'US': 'Russia',
    'UT': 'Uzbekistan / Tajikistan',
    'UU': 'Russia',
    'UW': 'Russia',
    'VA': 'India',
    'VC': 'Sri Lanka',
    'VD': 'Cambodia',
    'VE': 'India',
    'VG': 'Bangladesh',
    'VH': 'Hong Kong',
    'VI': 'India',
    'VL': 'Laos',
    'VM': 'Macau',
    'VN': 'Nepal',
    'VO': 'India',
    'VR': 'Maldives',
    'VT': 'Thailand',
    'VV': 'Vietnam',
    'VY': 'Myanmar',
    'WA': 'Indonesia',
    'WB': 'Brunei',
    'WI': 'Indonesia',
    'WM': 'Malaysia',
    'WR': 'Indonesia',
    'WS': 'Singapore',
    'YB': 'Australia',
    'YM': 'Australia',
    'ZB': 'China',
    'ZG': 'China',
    'ZH': 'China',
    'ZK': 'North Korea',
    'ZL': 'China',
    'ZM': 'Mongolia',
    'ZP': 'China',
    'ZS': 'China',
    'ZU': 'China',
    'ZW': 'China',
    'ZY': 'China',
  };


  /**
   * Gets the display name of the region associated with a specified ICAO region code.
   * @param code - the 2 character ICAO region code.
   * @returns the display name of the region.
   */
  public static getRegionName(code: string): string {
    const name = FacilityInfoUtils.NAME_TABLE[code.toUpperCase()];
    return name ?? '';
  }
}


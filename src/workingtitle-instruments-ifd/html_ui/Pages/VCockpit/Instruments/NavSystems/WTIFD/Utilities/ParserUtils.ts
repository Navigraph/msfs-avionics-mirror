import { LatLongInterface } from '@microsoft/msfs-sdk';

/** String parsing utilities. */
export class ParserUtils {
  /**
   * Parses a single DMS string into its decimal represetnation
   * @param part The DMS strin to represent
   * @param isLat Whether this is a latitude or longitude
   * @returns The decimal representation of the DMS
   */
  private static parseSingleDMS(part: string, isLat: boolean): number {
    const dir = part[0]; // N, S, E, W
    const rest = part.slice(1);

    // Extract degrees, minutes, seconds by splitting at known symbols
    const [degStr, afterDeg] = rest.split('°');
    const [minStr, secStr] = afterDeg.split('\'');

    const deg = parseInt(degStr);
    const min = parseInt(minStr);
    const sec = parseFloat(secStr.replace('"', ''));

    // Convert to decimal
    let decimal = deg + min / 60 + sec / 3600;

    // Apply hemisphere
    if ((isLat && dir === 'S') || (!isLat && dir === 'W')) {
      decimal = -decimal;
    }

    return decimal;
  }

  /**
   * Parses a latitude string into its decimal representation
   * @param lat The latitude
   * @returns The decimal representation
   */
  public static parseLat(lat: string): number {
    return this.parseSingleDMS(lat, true);
  }

  /**
   * Parses a longitude string into its decimal representation
   * @param lon The longitude
   * @returns The decimal representation
   */
  public static parseLon(lon: string): number {
    return this.parseSingleDMS(lon, false);
  }

  /**
   * Parses a latitude and longitude DMS string into a LatLong interface
   * @param latLong The latlong string representation
   * @returns A LatLong
   */
  public static parseLatLong(latLong: string): LatLongInterface {
    const parts = latLong.split(' ');

    return new LatLong(this.parseLat(parts[0]), this.parseLon(parts[1]));
  }

  /**
   * Parses a string with the format HH:MM:SS to milliseconds (JS timestamp compatible).
   * The string is assumed to be in the correct format.
   * @param str The string like "00:20:00" for 20 minutes.
   * @returns The offset in milliseconds, or null if the value is invalid.
   */
  public static parseHoursMinutesSecondsToMillis(str: string): number | null {
    if (str.length < 8) {
      return null;
    }
    const [hours, minutes, seconds] = str.split(':').map(s => parseInt(s) || 0);
    return hours * 3_600_000 + minutes * 60_000 + seconds * 1_000;
  }

  /**
   * Parses a string with the 24-hour format HH:MM to milliseconds (JS timestamp compatible).
   * The string is assumed to be in the correct format.
   * @param str The string like "00:20" for 20 minutes past midnight.
   * @returns The offset in milliseconds, or null if the value is invalid.
   */
  public static parseH24ToMillis(str: string): number | null {
    if (str.length < 5) {
      return null;
    }
    const [hours, minutes] = str.split(':').map(s => parseInt(s) || 0);
    return hours * 3_600_000 + minutes * 60_000;
  }

  /**
   * Parses a string with the 12-hour format HH:MM[AM|PM] to milliseconds (JS timestamp compatible).
   * The string is assumed to be in the correct format.
   * @param str The string like "12:20AM" for 20 minutes past midnight.
   * @returns The offset in milliseconds, or null if the value is invalid.
   */
  public static parseH12ToMillis(str: string): number | null {
    if (str.length < 7) {
      return null;
    }
    const offset = str.endsWith('PM') ? 12 * 3_600_000 : 0;
    const [hours, minutes] = str.split(':').map(s => parseInt(s) || 0);
    return offset + (hours === 12 ? 0 : hours) * 3_600_000 + minutes * 60_000;
  }
}

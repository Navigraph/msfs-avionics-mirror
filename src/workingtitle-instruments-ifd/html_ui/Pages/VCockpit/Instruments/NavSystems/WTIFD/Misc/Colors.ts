/** Keep this in sync with IFD.css */
export class Colors {
  public static readonly black = 'black';
  public static readonly white = 'white';
  public static readonly lightGrey = '#BCBCBEFF';
  public static readonly grey = '#727272FF';
  public static readonly darkGrey: '#5F5F5FFF';
  public static readonly darkerGrey = '#444444FF';
  public static readonly green = 'lime';
  public static readonly yellow = '#FDED01FF';
  public static readonly amber = '#fcbd06';
  public static readonly red = 'red';
  public static readonly red1 = '#ff3030';
  public static readonly red2 = '#df2525';
  public static readonly magenta = '#f909f1';
  public static readonly darkMagenta = '#860581';
  public static readonly darkMagenta1 = '#860595FF';
  public static readonly darkMagenta2 = '#5b0465';
  public static readonly lightCyan = '#ccffff';
  public static readonly cyan = '#00C2DBFF';
  public static readonly blue = '#00D2FF';
  public static readonly blue1 = '#0168c3';
  public static readonly blue2 = '#054f91';
}

/** Helper type to grab only the string‐valued statics */
type StringStaticsOf<T> = {
  [K in keyof T]: T[K] extends string ? T[K] : never
}[keyof T];

/** A union of all color values defined in {@link Colors} */
export type ColorValue = StringStaticsOf<typeof Colors>;

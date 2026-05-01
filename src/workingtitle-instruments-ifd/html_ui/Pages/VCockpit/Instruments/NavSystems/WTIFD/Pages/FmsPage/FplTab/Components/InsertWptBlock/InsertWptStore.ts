import { Facility, GeoPoint, Lifecycle, Subject } from '@microsoft/msfs-sdk';

/** Store for insert wpt data. */
export class InsertWptStore {
  public data?: Facility;

  public readonly duplicates = Subject.create<Facility[]>([]);
  public duplicatesValidForOpId: number | null = null;
  public readonly textInput = Subject.create('');

  public readonly ident = Subject.create('');
  /** Note: we also use this to show "Duplicates Exist" when the entered text does not match a unique facility. */
  public readonly name = Subject.create('');
  public readonly type = Subject.create('');

  /** City / country line for the resolved facility. */
  public readonly location = Subject.create('');

  /** Last knob-driven search direction (1 = up, -1 = down, 0 = none). */
  public searchDirection: 1 | -1 | 0 = 0;

  /** The current long ident suggestion for the typed prefix (if any). */
  public shortIdentSuggestion?: Facility;

  /** Whether there exists any longer ident that starts with the current prefix. */
  public canMoveCaretPastEnd = false;

  /** Whether we should try find an exact match only (e.g. after backspace). */
  public tryExactMatch = false;

  /** The reference position for sorting the waypoint list. */
  public referencePosition = new GeoPoint(NaN, NaN);

  /**
   * Constructs a new instance.
   * @param dataLifecycle The lifecycle to use for data that needs destruction.
   */
  constructor(private readonly dataLifecycle: Lifecycle) { }
}

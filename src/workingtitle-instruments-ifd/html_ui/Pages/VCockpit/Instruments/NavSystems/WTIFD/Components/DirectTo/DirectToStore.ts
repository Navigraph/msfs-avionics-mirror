import { AirportFacility, IntersectionFacility, Lifecycle, NdbFacility, Subject, UserFacility, VorFacility } from '@microsoft/msfs-sdk';

/** Facility types that can be used for DIR TO. */
export type DirToFacilityTypes = AirportFacility | IntersectionFacility | NdbFacility | UserFacility | VorFacility;

/** Direct To Data */
export interface PendingDirectToData {
  /** The facility we are going to. */
  facility: DirToFacilityTypes;
  /** If on-route, the segment index of the selected leg. */
  segmentIndex?: number;
  /** If on-route, the segment leg index of the selected leg. */
  segmentLegIndex?: number;
}

/** Store for direct to dialog data. */
export class DirectToStore {
  public data?: PendingDirectToData;

  public duplicates?: DirToFacilityTypes[];

  public readonly textInput = Subject.create('');

  public readonly ident = Subject.create('');
  /** Note: we also use this to show "Duplicates Exist" when the entered text does not match a unique facility. */
  public readonly name = Subject.create('');
  public readonly type = Subject.create('');
  public readonly location = Subject.create('');
  public readonly towerFrequency = Subject.create(0);
  public readonly towerText = this.towerFrequency.map((v) => v > 0 ? `Tower ${v.toFixed(3)}` : '').withLifecycle(this.dataLifecycle);

  /** Magnetic bearing in degrees from the aircraft to the facility, or null if not available. */
  public readonly bearing = Subject.create<number | null>(null);
  /** Distance in nautical miles the aircraft to the facility, or null if not available. */
  public readonly distance = Subject.create<number | null>(null);

  /**
   * The dir to can be activated once a facility has been confirmed with ENTR key on KB or bezel.
   * If the fac is changed this should reset until confirmed again.
   */
  public readonly canActivate = Subject.create(false);

  /**
   * Constructs a new instance.
   * @param dataLifecycle The lifecycle to use for data that needs destruction.
   */
  constructor(private readonly dataLifecycle: Lifecycle) { }
}

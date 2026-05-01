import {
  DisplayComponent, Facility, FacilityType, FacilityWaypoint, FSComponent, ICAO, MappedSubject, SetSubject,
  StringUtils, Subject, Subscribable, SubscribableUtils, Subscription, VNode, ComponentProps, ClassProp
} from '@microsoft/msfs-sdk';

import { GtcWaypointIcon } from '../GtcWaypointIcon/GtcWaypointIcon';

import './GtcWaypointDisplay.css';

/**
 * Component props for {@link GtcWaypointDisplay}.
 */
export interface GtcWaypointDisplayProps extends ComponentProps {
  /** The waypoint to display. */
  waypoint: FacilityWaypoint | null | Subscribable<FacilityWaypoint | null>;

  /** The string to display in place of the ident when the displayed waypoint is `null`. Defaults to the empty string. */
  nullIdent?: string | Subscribable<string>;

  /** The string to display in place of the name when the displayed waypoint is `null`. Defaults to the empty string. */
  nullName?: string | Subscribable<string>;

  /** The CSS class(es) to apply to the component's root element. */
  class?: ClassProp;
}

/** Displays the ident, name, and icon for a waypoint. */
export class GtcWaypointDisplay extends DisplayComponent<GtcWaypointDisplayProps> {
  private static readonly RESERVED_CSS_CLASSES = ['gtc-wpt-display'];

  private readonly iconRef = FSComponent.createRef<GtcWaypointIcon>();

  private readonly waypoint = SubscribableUtils.toSubscribable(this.props.waypoint, true) as Subscribable<FacilityWaypoint | null>;

  private readonly facility = Subject.create<Facility | null>(null);

  private readonly nullIdent = SubscribableUtils.toSubscribable(this.props.nullIdent ?? '', true);
  private readonly nullName = SubscribableUtils.toSubscribable(this.props.nullName ?? '', true);

  private readonly identText = MappedSubject.create(
    ([facility, nullIdent]) => {
      if (facility === null) {
        return nullIdent;
      } else {
        return StringUtils.useZeroSlash(ICAO.getIdent(facility.icao));
      }
    },
    this.facility,
    this.nullIdent
  );

  private readonly nameText = MappedSubject.create(
    ([facility, nullName]) => {
      if (facility === null) {
        return nullName;
      }

      switch (ICAO.getFacilityType(facility.icao)) {
        case FacilityType.Airport:
        case FacilityType.VOR:
        case FacilityType.NDB:
          return Utils.Translate(facility.name);
        case FacilityType.USR:
          return facility.name;
        default:
          return ' ';
      }
    },
    this.facility,
    this.nullName
  );

  private readonly subscriptions: Subscription[] = [
    this.identText,
    this.nameText
  ];

  private facilityPipe?: Subscription;

  /** @inheritdoc */
  public onAfterRender(): void {
    this.subscriptions.push(
      this.waypoint.sub(waypoint => {
        this.facilityPipe?.destroy();

        if (waypoint === null) {
          this.facility.set(null);
        } else {
          this.facilityPipe = waypoint.facility.pipe(this.facility);
        }
      }, true)
    );
  }

  /** @inheritdoc */
  public render(): VNode {
    const cssClass = SetSubject.create<string>();
    cssClass.add('gtc-wpt-display');

    const classSub = FSComponent.bindSetToCssClasses(cssClass, GtcWaypointDisplay.RESERVED_CSS_CLASSES, this.props.class);
    if (classSub) {
      this.subscriptions.push(classSub);
    }

    return (
      <div class={cssClass}>
        <div class='gtc-wpt-display-main'>
          <span class='gtc-wpt-display-ident'>{this.identText}</span>
          <GtcWaypointIcon ref={this.iconRef} waypoint={this.waypoint} class='gtc-wpt-display-icon' />
        </div>
        <div class='gtc-wpt-display-name'>{this.nameText}</div>
        {this.props.children}
      </div>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.iconRef.getOrDefault()?.destroy();

    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    this.facilityPipe?.destroy();

    super.destroy();
  }
}

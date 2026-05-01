import {
  ComponentProps, DisplayComponent, FacilitySearchType, FacilityWaypoint, FSComponent, GeoPoint, GeoPointSubject,
  MappedSubject, MutableSubscribable, SearchTypeMap, SetSubject, Subject, Subscribable, SubscribableUtils,
  Subscription, VNode
} from '@microsoft/msfs-sdk';

import { GarminFacilityWaypointCache, UnitsUserSettingManager, WaypointInfoStore } from '@microsoft/msfs-garminsdk';

import { GtcInteractionEvent, GtcInteractionHandler } from '../../GtcService/GtcInteractionEvent';
import { GtcService } from '../../GtcService/GtcService';
import { GtcPositionHeadingDataProvider } from '../../Navigation/GtcPositionHeadingDataProvider';
import { GtcTouchButton } from '../TouchButton/GtcTouchButton';
import { GtcWaypointSelectButton, WaypointSelectType, WaypointSelectTypeMap } from '../TouchButton/GtcWaypointSelectButton';

import './GtcWaypointInfo.css';

/**
 * Component props for {@link GtcWaypointInfo}.
 */
export interface GtcWaypointInfoProps<T extends WaypointSelectType> extends ComponentProps {
  /** The GTC service. */
  gtcService: GtcService;

  /** A cache used by the display to retrieve waypoints for facilities. */
  waypointCache: GarminFacilityWaypointCache;

  /** A provider of airplane position and heading data. */
  posHeadingDataProvider: GtcPositionHeadingDataProvider;

  /** Whether to allow the user to select the Direct To waypoint using the tab's selection button. */
  allowWaypointSelection: boolean;

  /**
   * The selected waypoint for the display. If waypoint selection is allowed, then this should be a mutable
   * subscribable.
   */
  selectedWaypoint: Subscribable<WaypointSelectTypeMap[T] | null> | MutableSubscribable<WaypointSelectTypeMap[T] | null>;

  /**
   * A function that is called when the display's options button is pressed. If not defined, then the options button
   * will be disabled.
   */
  onOptionsPressed?: () => void;

  /** A manager for display units user settings. */
  unitsSettingManager: UnitsUserSettingManager;
}

/**
 * A GTC waypoint information display.
 */
export abstract class GtcWaypointInfo<T extends WaypointSelectType, P extends GtcWaypointInfoProps<T> = GtcWaypointInfoProps<T>>
  extends DisplayComponent<P> implements GtcInteractionHandler {

  protected static readonly NULL_IDENT = {
    [FacilitySearchType.AllExceptVisual]: '––––––',
    [FacilitySearchType.Airport]: '––––',
    [FacilitySearchType.Vor]: '–––––',
    [FacilitySearchType.Ndb]: '–––––',
    [FacilitySearchType.Intersection]: '–––––',
    [FacilitySearchType.User]: '––––––'
  };

  /** The type of waypoint displayed by this display. */
  protected abstract readonly waypointSelectType: T;

  protected thisNode?: VNode;

  protected readonly rootCssClass = SetSubject.create(['wpt-info', this.getCssClass()]);

  /** The position of the airplane. */
  protected readonly ppos = GeoPointSubject.create(new GeoPoint(NaN, NaN));

  /** The true heading of the airplane, in degrees, or `NaN` if heading data is invalid. */
  protected readonly planeHeadingTrue = Subject.create(NaN, SubscribableUtils.NUMERIC_NAN_EQUALITY);

  /** An information store for the selected waypoint. */
  protected readonly selectedWaypointInfo = new WaypointInfoStore(this.props.selectedWaypoint, this.ppos);

  protected readonly _hasSelectedWaypoint = this.props.selectedWaypoint.map(waypoint => waypoint !== null);
  /** Whether a waypoint is selected. */
  public readonly hasSelectedWaypoint = this._hasSelectedWaypoint as Subscribable<boolean>;

  /** The facility associated with the selected waypoint. */
  public readonly selectedFacility = this.selectedWaypointInfo.facility as Subscribable<SearchTypeMap[T] | null>;

  /**
   * The bearing to the selected waypoint, relative to the airplane's current heading, in degrees, or `NaN` if there is
   * no selected waypoint or position/heading data is invalid.
   */
  protected readonly selectedWaypointRelativeBearing = MappedSubject.create(
    ([bearing, planeHeading]) => bearing.number - planeHeading,
    SubscribableUtils.NUMERIC_NAN_EQUALITY,
    this.selectedWaypointInfo.bearing,
    this.planeHeadingTrue
  );

  protected readonly _title = Subject.create<string | undefined>(undefined);
  /** The GTC view title requested by this display. */
  public readonly title = this._title as Subscribable<string | undefined>;

  protected pposPipe?: Subscription;
  protected headingPipe?: Subscription;
  protected isGpsDrSub?: Subscription;

  /** @inheritDoc */
  public onAfterRender(thisNode: VNode): void {
    this.thisNode = thisNode;

    this.pposPipe = this.props.posHeadingDataProvider.pposWithFailure.pipe(this.ppos, true);
    this.headingPipe = this.props.posHeadingDataProvider.headingTrueWithFailure.pipe(this.planeHeadingTrue, true);

    this.isGpsDrSub = this.props.posHeadingDataProvider.isGpsDeadReckoning.sub(isDr => {
      this.rootCssClass.toggle('dead-reckoning', isDr);
    }, true);
  }

  /**
   * Responds to when this display's parent GTC view comes into use.
   */
  public onInUse(): void {
    // noop
  }

  /**
   * Responds to when this display's parent GTC view goes out of use.
   */
  public onOutOfUse(): void {
    // noop
  }

  /**
   * Responds to when this display's parent GTC view is opened.
   */
  public onOpen(): void {
    // noop
  }

  /**
   * Responds to when this display's parent GTC view is closed.
   */
  public onClose(): void {
    // noop
  }

  /**
   * Responds to when this display's parent GTC view is resumed.
   */
  public onResume(): void {
    this.pposPipe?.resume(true);
    this.headingPipe?.resume(true);
  }

  /**
   * Responds to when this display's parent GTC view is paused.
   */
  public onPause(): void {
    this.pposPipe?.pause();
    this.headingPipe?.pause();
  }

  /** @inheritDoc */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public onGtcInteractionEvent(event: GtcInteractionEvent): boolean {
    return false;
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={this.rootCssClass}>
        <div class='wpt-info-header'>
          <GtcWaypointSelectButton
            gtcService={this.props.gtcService}
            type={this.waypointSelectType}
            waypoint={this.props.selectedWaypoint}
            waypointCache={this.props.waypointCache}
            nullIdent={GtcWaypointInfo.NULL_IDENT[this.waypointSelectType]}
            isEnabled={this.props.allowWaypointSelection}
            class='wpt-info-select-button'
          />
          <GtcTouchButton
            label='Waypoint<br>Options'
            isEnabled={this.props.onOptionsPressed === undefined ? false : this._hasSelectedWaypoint}
            onPressed={this.props.onOptionsPressed}
            class='wpt-info-options-button'
          />
        </div>
        {this.renderContent()}
      </div>
    );
  }

  /**
   * Gets the CSS class for this display's root element.
   * @returns The CSS class for this display's root element.
   */
  protected abstract getCssClass(): string;

  /**
   * Renders this display's main content.
   * @returns This display's main content, as a VNode.
   */
  protected abstract renderContent(): VNode;

  /** @inheritDoc */
  public destroy(): void {
    this.thisNode && FSComponent.shallowDestroy(this.thisNode);

    this.selectedWaypointInfo.destroy();
    this._hasSelectedWaypoint.destroy();
    this.selectedWaypointRelativeBearing.destroy();

    this.pposPipe?.destroy();
    this.headingPipe?.destroy();
    this.isGpsDrSub?.destroy();

    super.destroy();
  }
}

/**
 * Component props for {@link GtcWaypointInfoNoWaypointMessage}.
 */
export interface GtcWaypointInfoNoWaypointMessageProps extends ComponentProps {
  /** The selected waypoint. */
  selectedWaypoint: Subscribable<FacilityWaypoint | null>;
}

/**
 * A message displayed when a GTC waypoint information display has no selected waypoint.
 */
export class GtcWaypointInfoNoWaypointMessage extends DisplayComponent<GtcWaypointInfoNoWaypointMessageProps> {
  private readonly rootCssClass = this.props.selectedWaypoint.map(waypoint => {
    return `wpt-info-no-wpt ${waypoint === null ? '' : 'hidden'}`;
  });

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={this.rootCssClass}>
        {this.props.children}
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.rootCssClass.destroy();

    super.destroy();
  }
}

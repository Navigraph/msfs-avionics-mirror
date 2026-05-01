import {
  ConsumerSubject, DebounceTimer, Facility, FacilityLoader, FacilityType, FSComponent, ICAO, MathUtils, ReadonlyFloat64Array,
  Subscription, UserSetting, Vec2Math, VNode
} from '@microsoft/msfs-sdk';

import { TouchPad } from '@microsoft/msfs-garminsdk';

import {
  ControllableDisplayPaneIndex, DisplayPaneControlEvents, DisplayPanesUserSettings, DisplayPaneViewDataEvents,
  G3000FilePaths, GtcViewKeys
} from '@microsoft/msfs-wtg3000-common';

import { ImgTouchButton } from '../../Components/TouchButton/ImgTouchButton';
import { TouchButton } from '../../Components/TouchButton/TouchButton';
import { GtcView, GtcViewProps } from '../../GtcService/GtcView';
import { GtcDirectToPopup } from '../DirectToPopup/GtcDirectToPopup';
import {
  GtcAirportInfoPopup, GtcIntersectionInfoPopup, GtcNdbInfoPopup, GtcUserWaypointInfoPopup, GtcVorInfoPopup
} from '../WaypointInfoPopups';

import './GtcMapPointerControlPopup.css';

/**
 * Component props for {@link GtcMapPointerControlPopup}.
 */
export interface GtcMapPointerControlPopupProps extends GtcViewProps {
  /** The facility loader. */
  facLoader: FacilityLoader;

  /**
   * A function which maps mouse drag distances on the touchpad to map pointer move distances.
   * @param distance A touchpad mouse drag distance, in pixels.
   * @param dt The time, in milliseconds, over which the mouse drag distance was performed.
   * @returns The distance the map pointer should move given the specified mouse drag distance and elapsed time.
   */
  touchDragDistanceMap?: (distance: number, dt: number) => number;
}

/**
 * A GTC map pointer control popup.
 */
export class GtcMapPointerControlPopup extends GtcView<GtcMapPointerControlPopupProps> {
  private static readonly DEFAULT_DRAG_DISTANCE_MAP = (scale: number, distance: number, dt: number): number => {
    const factor = MathUtils.clamp(distance / dt * 2 * scale, 0.1, 1);
    return distance * factor * scale;
  };

  private static readonly vec2Cache = [Vec2Math.create()];

  private readonly displayPaneIndex: ControllableDisplayPaneIndex;

  private readonly touchPadRef = FSComponent.createRef<TouchPad>();

  private readonly touchDragDistanceMap = this.props.touchDragDistanceMap
    ?? GtcMapPointerControlPopup.DEFAULT_DRAG_DISTANCE_MAP.bind(undefined, this.props.gtcService.isHorizontal ? 1 : 2);

  private readonly publisher = this.bus.getPublisher<DisplayPaneControlEvents>();

  private readonly hoveredWaypointIcao = ConsumerSubject.create(null, ICAO.emptyValue(), ICAO.valueEquals);
  private readonly hasHoveredWaypoint = this.hoveredWaypointIcao.map(icao => ICAO.isValueFacility(icao));
  private hoveredWaypointOpId = 0;

  private readonly isPointerActive: UserSetting<boolean>;
  private readonly pointerActiveCheckDebounce = new DebounceTimer();

  private isPointerActiveSub?: Subscription;

  /**
   * Creates a new instance of GtcMapPointerControlPopup.
   * @param props This component's props.
   * @throws Error if a display pane index is not defined for this view.
   */
  public constructor(props: GtcMapPointerControlPopupProps) {
    super(props);

    if (this.props.displayPaneIndex === undefined) {
      throw new Error('GtcMapPointerControlPopup: display pane index was not defined');
    }

    this.displayPaneIndex = this.props.displayPaneIndex;

    this.isPointerActive = DisplayPanesUserSettings.getDisplayPaneManager(this.props.gtcService.bus, this.displayPaneIndex).getSetting('displayPaneMapPointerActive');
  }

  /** @inheritDoc */
  public onAfterRender(): void {
    this._title.set('Map Pointer Control');

    this.hoveredWaypointIcao.setConsumer(this.bus.getSubscriber<DisplayPaneViewDataEvents>().on(`display_pane_comm_map_hovered_waypoint_icao_${this.displayPaneIndex}`));

    this.isPointerActiveSub = this.isPointerActive.sub(this.onPointerActiveChanged.bind(this), false, true);
  }

  /** @inheritDoc */
  public onInUse(): void {
    this.publisher.pub('display_pane_view_event', {
      displayPaneIndex: this.displayPaneIndex,
      eventType: 'display_pane_map_pointer_active_set',
      eventData: true
    }, true, false);
  }

  /** @inheritDoc */
  public onOutOfUse(): void {
    this.publisher.pub('display_pane_view_event', {
      displayPaneIndex: this.displayPaneIndex,
      eventType: 'display_pane_map_pointer_active_set',
      eventData: false
    }, true, false);
  }

  /** @inheritDoc */
  public onResume(): void {
    this.hoveredWaypointIcao.resume();

    // Schedule a delayed check for whether the pointer is active for this popup's controlled display pane. If the
    // the pointer is not active, then we will close the popup. We need to delay the check after the popup is resumed
    // in order to allow the command to activate the pointer that is sent when the popup is opened sufficient time to
    // be received by the display pane.
    this.pointerActiveCheckDebounce.schedule(() => {
      this.isPointerActiveSub!.resume(true);
    }, 1000);
  }

  /** @inheritDoc */
  public onPause(): void {
    this.pointerActiveCheckDebounce.clear();
    this.isPointerActiveSub!.pause();

    this.hoveredWaypointIcao.pause();

    // Increment the operation ID for hovered waypoint actions to make sure we abort all pending actions.
    ++this.hoveredWaypointOpId;
  }

  /**
   * Responds to when whether the map pointer is active changes.
   * @param isActive Whether the map pointer is active.
   */
  private onPointerActiveChanged(isActive: boolean): void {
    if (!isActive) {
      this.props.gtcService.goBack();
    }
  }

  /**
   * Responds to mouse drag tick events from this popup's touchpad.
   * @param position The current position of the mouse.
   * @param prevPosition The position of the mouse during the previous frame, or `undefined` if this is the first frame
   * since the start of the current drag motion.
   * @param initialPosition The position of the mouse at the start of the current drag motion.
   * @param dt The elapsed time, in milliseconds, since the previous frame.
   */
  private onDragTick(position: ReadonlyFloat64Array, prevPosition: ReadonlyFloat64Array | undefined, initialPosition: ReadonlyFloat64Array, dt: number): void {
    if (prevPosition === undefined || dt === 0) {
      return;
    }

    const delta = Vec2Math.sub(position, prevPosition, GtcMapPointerControlPopup.vec2Cache[0]);
    const distance = Vec2Math.abs(delta);

    if (distance < 1) {
      return;
    }

    const mappedDistance = this.touchDragDistanceMap(distance, dt);

    if (mappedDistance < 1) {
      return;
    }

    const pointerDelta = Vec2Math.multScalar(delta, mappedDistance / distance, delta);

    this.sendMoveEvent(pointerDelta[0], pointerDelta[1]);
  }

  /**
   * Sends a map pointer move event to the currently controlled display pane.
   * @param dx The distance to move along the x axis, in pixels.
   * @param dy The distance to move along the y axis, in pixels.
   */
  private sendMoveEvent(dx: number, dy: number): void {
    this.publisher.pub('display_pane_view_event', {
      displayPaneIndex: this.displayPaneIndex,
      eventType: 'display_pane_map_pointer_move',
      eventData: [dx, dy]
    }, true, false);
  }

  /**
   * Responds to when this popup's Direct To button is pressed.
   */
  private async onDirectToButtonPressed(): Promise<void> {
    const opId = ++this.hoveredWaypointOpId;

    const facility = await this.getHoveredWaypointFacility();

    if (opId !== this.hoveredWaypointOpId) {
      return;
    }

    if (facility) {
      this.props.gtcService.openPopup<GtcDirectToPopup>(GtcViewKeys.DirectToPopup, 'slideout-right-full')
        .ref.setWaypoint({ facility });
    }
  }

  /**
   * Responds to when this popup's Info button is pressed.
   */
  private async onInfoButtonPressed(): Promise<void> {
    ++this.hoveredWaypointOpId;

    const icao = this.hoveredWaypointIcao.get();

    if (ICAO.isValueFacility(icao)) {
      switch (ICAO.getFacilityTypeFromValue(icao)) {
        case FacilityType.Airport:
          this.props.gtcService.openPopup<GtcAirportInfoPopup>(GtcViewKeys.AirportInfoPopup, 'slideout-right-full')
            .ref.setWaypoint(icao);
          break;
        case FacilityType.VOR:
          this.props.gtcService.openPopup<GtcVorInfoPopup>(GtcViewKeys.VorInfoPopup, 'slideout-right-full')
            .ref.setWaypoint(icao);
          break;
        case FacilityType.NDB:
          this.props.gtcService.openPopup<GtcNdbInfoPopup>(GtcViewKeys.NdbInfoPopup, 'slideout-right-full')
            .ref.setWaypoint(icao);
          break;
        case FacilityType.Intersection:
          this.props.gtcService.openPopup<GtcIntersectionInfoPopup>(GtcViewKeys.IntersectionInfoPopup, 'slideout-right-full')
            .ref.setWaypoint(icao);
          break;
        case FacilityType.USR:
          this.props.gtcService.openPopup<GtcUserWaypointInfoPopup>(GtcViewKeys.UserWaypointInfoPopup, 'slideout-right-full')
            .ref.setWaypoint(icao);
          break;
      }
    }
  }

  /**
   * Gets the facility for the currently hovered waypoint.
   * @returns A Promise which fulfills with the facility for the currently hovered waypoint, or `null` if there is no
   * hovered waypoint or a facility could not be retrieved for the waypoint.
   */
  private async getHoveredWaypointFacility(): Promise<Facility | null> {
    const icao = this.hoveredWaypointIcao.get();

    if (!ICAO.isValueFacility(icao)) {
      return null;
    }

    return this.props.facLoader.tryGetFacility(ICAO.getFacilityTypeFromValue(icao), icao);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class='pointer-control'>
        <div class='pointer-control-header'>
          <ImgTouchButton
            imgSrc={`${G3000FilePaths.ASSETS_PATH}/Images/GTC/icon_small_direct_to.png`}
            isEnabled={this.hasHoveredWaypoint}
            onPressed={this.onDirectToButtonPressed.bind(this)}
          />
          <TouchButton
            label='Info'
            // TODO: support runway and visual approach facilities.
            isEnabled={this.hoveredWaypointIcao.map(icao => {
              if (!ICAO.isValueFacility(icao)) {
                return false;
              }

              switch (ICAO.getFacilityTypeFromValue(icao)) {
                case FacilityType.Airport:
                case FacilityType.VOR:
                case FacilityType.NDB:
                case FacilityType.Intersection:
                case FacilityType.USR:
                  return true;
                default:
                  return false;
              }
            })}
            onPressed={this.onInfoButtonPressed.bind(this)}
          />
          <TouchButton
            label={'Insert in\nFPL'}
            isEnabled={false}
          />
          <TouchButton
            label={'Create\nWPT'}
            isEnabled={false}
          />
          <TouchButton
            label={'BRG /\nDIS'}
            isEnabled={false}
          />
        </div>
        <TouchPad
          ref={this.touchPadRef}
          bus={this.bus}
          onDragTick={this.onDragTick.bind(this)}
          focusOnDrag
          lockFocusOnDrag
          class='pointer-control-touchpad'
        />
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.pointerActiveCheckDebounce.clear();
    this.isPointerActiveSub?.destroy();

    this.touchPadRef.getOrDefault()?.destroy();

    this.hoveredWaypointIcao.destroy();

    super.destroy();
  }
}

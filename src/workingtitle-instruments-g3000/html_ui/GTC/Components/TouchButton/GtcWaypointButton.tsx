import {
  ClassProp, DisplayComponent, FacilityWaypoint, FSComponent, MappedSubscribable, SetSubject, Subscribable,
  SubscribableMapFunctions, SubscribableUtils, Subscription, VNode
} from '@microsoft/msfs-sdk';

import { GtcWaypointDisplay } from '../Waypoint/GtcWaypointDisplay';
import { GtcTouchButton, GtcTouchButtonProps } from './GtcTouchButton';

import './GtcWaypointButton.css';

/**
 * Component props for {@link GtcWaypointButton}.
 */
export interface GtcWaypointButtonProps extends Omit<GtcTouchButtonProps, 'label' | 'class'> {
  /** The waypoint to display. */
  waypoint: FacilityWaypoint | null | Subscribable<FacilityWaypoint | null>;

  /** The string to display in place of the ident when the displayed waypoint is `null`. Defaults to the empty string. */
  nullIdent?: string | Subscribable<string>;

  /** The string to display in place of the name when the displayed waypoint is `null`. Defaults to the empty string. */
  nullName?: string | Subscribable<string>;

  /**
   * The label text to display on the button when the displayed waypoint is `null`. If not defined, then no special
   * label text will be displayed when the displayed waypoint is `null`.
   */
  nullLabel?: string | Subscribable<string>;

  /** The CSS class(es) to apply to the button's root element. */
  class?: ClassProp;
}

/**
 * A GTC button which displays the ident, name, and icon for a waypoint.
 */
export class GtcWaypointButton extends DisplayComponent<GtcWaypointButtonProps> {
  private static readonly RESERVED_CSS_CLASSES = ['gtc-wpt-button', 'show-null-label'];

  private readonly buttonRef = FSComponent.createRef<GtcTouchButton>();
  private readonly displayRef = FSComponent.createRef<GtcWaypointDisplay>();

  private readonly waypoint = SubscribableUtils.toSubscribable(this.props.waypoint, true) as Subscribable<FacilityWaypoint | null>;
  private readonly nullLabel: MappedSubscribable<string> | Subscribable<string> | undefined
    = SubscribableUtils.isSubscribable(this.props.nullLabel)
      ? this.props.nullLabel.map(SubscribableMapFunctions.identity())
      : this.props.nullLabel ? SubscribableUtils.toSubscribable(this.props.nullLabel, false) : undefined;

  private readonly cssClass = SetSubject.create(['gtc-wpt-button']);

  private readonly subscriptions = [] as Subscription[];

  /** @inheritdoc */
  public onAfterRender(): void {
    if (this.nullLabel) {
      this.subscriptions.push(
        this.waypoint.sub(waypoint => {
          this.cssClass.toggle('show-null-label', waypoint === null);
        }, true)
      );
    }
  }

  /**
   * Simulates this button being pressed. This will execute the `onPressed()` callback if one is defined.
   * @param ignoreDisabled Whether to simulate the button being pressed regardless of whether the button is disabled.
   * Defaults to `false`.
   */
  public simulatePressed(ignoreDisabled = false): void {
    this.buttonRef.getOrDefault()?.simulatePressed(ignoreDisabled);
  }

  /** @inheritdoc */
  public render(): VNode {
    const classSub = FSComponent.bindSetToCssClasses(this.cssClass, GtcWaypointButton.RESERVED_CSS_CLASSES, this.props.class);
    if (classSub) {
      this.subscriptions.push(classSub);
    }

    return (
      <GtcTouchButton
        ref={this.buttonRef}
        isEnabled={this.props.isEnabled}
        isHighlighted={this.props.isHighlighted}
        isVisible={this.props.isVisible}
        onTouched={this.props.onTouched}
        onPressed={this.props.onPressed}
        onHoldStarted={this.props.onHoldStarted}
        onHoldTick={this.props.onHoldTick}
        onHoldEnded={this.props.onHoldEnded}
        isInList={this.props.isInList}
        listScrollAxis={this.props.listScrollAxis}
        gtcOrientation={this.props.gtcOrientation}
        focusOnDrag={this.props.focusOnDrag}
        inhibitOnDrag={this.props.inhibitOnDrag}
        inhibitOnDragAxis={this.props.inhibitOnDragAxis}
        dragThresholdPx={this.props.dragThresholdPx}
        class={this.cssClass}
      >
        {this.nullLabel !== undefined && <div class="null-label">{this.nullLabel}</div>}
        <GtcWaypointDisplay
          ref={this.displayRef}
          waypoint={this.props.waypoint}
          nullIdent={this.props.nullIdent}
          nullName={this.props.nullName}
        >
          {this.props.children}
        </GtcWaypointDisplay>
      </GtcTouchButton>
    );
  }

  /** @inheritdoc */
  public destroy(): void {
    this.props.onDestroy && this.props.onDestroy();

    this.displayRef.getOrDefault()?.destroy();
    this.buttonRef.getOrDefault()?.destroy();

    if (this.nullLabel && 'destroy' in this.nullLabel) {
      this.nullLabel.destroy();
    }

    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    super.destroy();
  }
}

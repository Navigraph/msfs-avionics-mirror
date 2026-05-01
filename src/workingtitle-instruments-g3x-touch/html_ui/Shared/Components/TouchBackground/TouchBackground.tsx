import { ClassProp, ComponentProps, DisplayComponent, FSComponent, Subscribable, Subscription, VNode } from '@microsoft/msfs-sdk';

import { TouchButton, TouchButtonHoldAction, TouchButtonHoldEndReason, TouchButtonOnTouchedAction } from '@microsoft/msfs-garminsdk';

import './TouchBackground.css';

/**
 * Component props for {@link TouchBackground}.
 */
export interface TouchBackgroundProps extends ComponentProps {
  /** Whether the background is visible. Defaults to `true`. */
  isVisible?: boolean | Subscribable<boolean>;

  /**
   * Whether the background's touch function is enabled. Disabled backgrounds cannot be touched, primed, pressed, or
   * held. Defaults to `true`.
   */
  isEnabled?: boolean | Subscribable<boolean>;

  /**
   * A function which is called every time the background is touched (i.e. a mouse down event on the background is
   * detected). If not defined, then the background will default to triggering a press event when touched.
   * @param background The background that was touched.
   * @returns The action to take as a result of the background being touched.
   */
  onTouched?: (background: TouchBackground) => TouchButtonOnTouchedAction;

  /**
   * A function which is called every time the background is pressed.
   * @param background The background that was pressed.
   * @param isHeld Whether the background was held when it was pressed.
   */
  onPressed?: (background: TouchBackground, isHeld: boolean) => void;

  /**
   * A function which is called when the background enters the held state. If not defined, then the background will
   * default to taking no specific action when it enters the held state.
   * @param button The background that is held.
   * @returns The action to take. Ignored if the value is equal to {@link TouchButtonHoldAction.EndHold}.
   */
  onHoldStarted?: (background: TouchBackground) => TouchButtonHoldAction;

  /**
   * A function which is called every frame when the background is held. If not defined, then the background will
   * default to taking no specific action with each frame tick.
   * @param background The background that is held.
   * @param dt The elapsed time, in milliseconds, since the previous frame.
   * @param totalTime The total amount of time, in milliseconds, that the background has been held.
   * @param timeSinceLastPress The amount of time, in milliseconds, that the background has been held since the last
   * time the background was pressed as a tick action.
   * @returns The action to take.
   */
  onHoldTick?: (background: TouchBackground, dt: number, totalTime: number, timeSinceLastPress: number) => TouchButtonHoldAction;

  /**
   * A function which is called when the background exits the held state. If not defined, then the background will
   * default to taking no specific action when it exits the held state.
   * @param background The background that was held.
   * @param totalHoldDuration The total amount of time, in milliseconds, that the background was held.
   * @param endReason The reason that the background exited the held state.
   */
  onHoldEnded?: (background: TouchBackground, totalHoldDuration: number, endReason: TouchButtonHoldEndReason) => void;

  /** CSS class(es) to apply to the background's root element. */
  class?: ClassProp;
}

/**
 * A background element which can respond to touchscreen interactions.
 */
export class TouchBackground extends DisplayComponent<TouchBackgroundProps> {
  private readonly rootRef = FSComponent.createRef<TouchButton>();

  private childrenNode?: VNode;

  private classSub?: Subscription;

  /** @inheritDoc */
  public render(): VNode {
    return (
      <TouchButton
        ref={this.rootRef}
        isVisible={this.props.isVisible}
        isEnabled={this.props.isEnabled}
        onTouched={this.props.onTouched ? () => this.props.onTouched!(this) : () => TouchButtonOnTouchedAction.Press}
        onPressed={this.props.onPressed ? (button, isHeld) => { this.props.onPressed!(this, isHeld); } : undefined}
        onHoldStarted={this.props.onHoldStarted ? () => this.props.onHoldStarted!(this) : undefined}
        onHoldTick={this.props.onHoldTick ? (button, dt, totalTime, timeSinceLastPress) => this.props.onHoldTick!(this, dt, totalTime, timeSinceLastPress) : undefined}
        onHoldEnded={this.props.onHoldEnded ? (button, totalHoldDuration, endReason) => { this.props.onHoldEnded!(this, totalHoldDuration, endReason); } : undefined}
        class={this.classSub = FSComponent.mergeCssClasses('touch-background', this.props.class)}
      >
        {this.childrenNode = <>{this.props.children}</>}
      </TouchButton>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.rootRef.getOrDefault()?.destroy();

    this.childrenNode && FSComponent.shallowDestroy(this.childrenNode);

    this.classSub?.destroy();

    super.destroy();
  }
}

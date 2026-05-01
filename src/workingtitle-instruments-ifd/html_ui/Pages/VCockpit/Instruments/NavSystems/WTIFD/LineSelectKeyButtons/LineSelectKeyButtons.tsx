import { ComponentProps, DisplayComponent, EventBus, FSComponent, MappedSubject, Subscription, VNode } from '@microsoft/msfs-sdk';

import { IfdInteractionEvent, IfdInteractions } from '../Events/IfdInteractionEvent';
import { IfdInteractionEventHandler, RightKnobUtils } from '../RightKnob';
import { IfdViewService } from '../ViewService';
import { LineSelectKeyButton } from './LineSelectKeyButton';
import { LskUtils } from './LskUtils';

import './LineSelectKeyButtons.css';

/**
 * Props for the LineSelectKeyButtons component
 */
export interface LineSelectKeyButtonsProps extends ComponentProps {
  /** The event bus. */
  readonly bus: EventBus;
  /** The view service for the IFD */
  readonly viewService: IfdViewService;
}

/**
 * LineSelectKeyButtons component for the Working Title IFD
 * Displays 3 context-sensitive line select key buttons
 */
export class LineSelectKeyButtons extends DisplayComponent<LineSelectKeyButtonsProps> implements IfdInteractionEventHandler {
  private readonly lskState = LskUtils.createState();

  private subs = [] as Subscription[];

  /** @inheritdoc */
  public onAfterRender(): void {
    // Handles syncing the knob state with the active view
    this.props.viewService.activeLskProvider.sub((provider) => {
      this.subs.forEach(sub => sub?.destroy());
      this.subs = [];

      if (!provider) {
        return;
      }

      this.subs.push(...RightKnobUtils.pipeObjectOfSubs(provider.lskState.lsk2, this.lskState.lsk2));
      this.subs.push(...RightKnobUtils.pipeObjectOfSubs(provider.lskState.lsk3, this.lskState.lsk3));
      this.subs.push(...RightKnobUtils.pipeObjectOfSubs(provider.lskState.lsk4, this.lskState.lsk4));
      this.subs.push(provider.lskState.selectedButton.pipe(this.lskState.selectedButton));
      this.subs.push(provider.lskState.isVisible.pipe(this.lskState.isVisible));
    }, true);

    this.props.bus.getSubscriber<IfdInteractions>().on('ifd_interaction_event').handle((event) => {
      switch (event) {
        case IfdInteractionEvent.LineSelectKey2:
          this.lskState.lsk2.onClick.get()?.();
          break;
        case IfdInteractionEvent.LineSelectKey3:
          this.lskState.lsk3.onClick.get()?.();
          break;
        case IfdInteractionEvent.LineSelectKey4:
          this.lskState.lsk4.onClick.get()?.();
          break;
      }
    });
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (this.lskState.selectedButton.get() === 2) {
      return !!this.lskState.lsk2.onKnobEvent.get()?.(event);
    }
    if (this.lskState.selectedButton.get() === 3) {
      return !!this.lskState.lsk3.onKnobEvent.get()?.(event);
    }
    if (this.lskState.selectedButton.get() === 4) {
      return !!this.lskState.lsk4.onKnobEvent.get()?.(event);
    }
    if (this.lskState.lsk2.onKnobEvent.get()?.(event)) {
      return true;
    }
    return false;
  }

  /** @inheritdoc */
  render(): VNode {
    return (
      <div
        class={{
          'context-sensitive-lsks': true,
          'hidden': MappedSubject.create(([fullscreen, buttonsVisible]) => fullscreen && !buttonsVisible,
            this.props.viewService.isSvsFullscreenAndActive, this.lskState.isVisible)
        }}
      >
        <LineSelectKeyButton
          lskState={this.lskState.lsk2}
          isSelected={this.lskState.selectedButton.map(x => x === 2)}
          data-button-index="2"
        />
        <LineSelectKeyButton
          lskState={this.lskState.lsk3}
          isSelected={this.lskState.selectedButton.map(x => x === 3)}
          data-button-index="3"
        />
        <LineSelectKeyButton
          lskState={this.lskState.lsk4}
          isSelected={this.lskState.selectedButton.map(x => x === 4)}
          data-button-index="4"
        />
      </div>
    );
  }
}

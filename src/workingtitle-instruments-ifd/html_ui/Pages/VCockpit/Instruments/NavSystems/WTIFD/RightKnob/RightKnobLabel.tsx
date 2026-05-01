import { ComponentProps, DisplayComponent, FSComponent, Subscription, VNode } from '@microsoft/msfs-sdk';

import { IconKnob } from '../Assets/SVGs/IconKnob';
import { IfdViewService } from '../ViewService/IfdViewService';
import { RightKnobUtils } from './RightKnobUtils';

import './RightKnobLabel.css';

/** Props for {@link RightKnobLabel } */
interface RightKnobLabelProps extends ComponentProps {
  /** The IFD view service. */
  readonly viewService: IfdViewService;
}

/**
 * Contextual label displaying the function of the bottom right IFD knob.
 */
export class RightKnobLabel extends DisplayComponent<RightKnobLabelProps> {
  private readonly knobState = RightKnobUtils.createState();

  private subs = [] as Subscription[];

  /** @inheritdoc */
  public onAfterRender(): void {
    // Handles syncing the knob state with the active view
    this.props.viewService.activeView.sub(view => {
      this.subs.forEach(sub => sub?.destroy());

      if (!view) {
        this.subs = [];
        return;
      }

      this.subs = RightKnobUtils.pipeObjectOfSubs(view.knobState, this.knobState);
    }, true);
  }

  /** @inheritdoc */
  render(): VNode {
    return (
      <div
        id="right-knob-label"
        class={{
          'right-knob-label-solid': this.knobState.labelStyle.map(x => x === 'solid'),
          'right-knob-label-translucent': this.knobState.labelStyle.map(x => x === 'translucent'),
          'hidden': this.knobState.isVisible.map(x => !x),
        }}
      >
        <div
          id="right-knob-label-left-element"
          class={{
            'right-knob-label-mint': this.knobState.leftColor.map(x => x === 'mint'),
            'right-knob-label-green': this.knobState.leftColor.map(x => x === 'green'),
          }}
        >
          {this.knobState.leftText}
        </div>
        <div id="right-knob-label-icon"><IconKnob /></div>
        <div
          id="right-knob-label-right-element"
          class={{
            'right-knob-label-mint': this.knobState.rightColor.map(x => x === 'mint'),
            'right-knob-label-green': this.knobState.rightColor.map(x => x === 'green'),
          }}
        >
          {this.knobState.rightText}
        </div>
      </div>
    );
  }
}

import { ComponentProps, FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { FormatUtils } from '../../Utilities/FormatUtils';

import './SvsHeadingDisplay.css';

/** Props for the {@link SvsHeadingDisplay} component. */
interface SvsHeadingDisplayProps extends ComponentProps {
  /** The heading or track that SVS is referenced to in degrees, or null if invalid. */
  readonly headingOrTrack: Subscribable<number | null>;
}

/** The SVS heading display. */
export class SvsHeadingDisplay extends LifecycleComponent<SvsHeadingDisplayProps> {
  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class="svs-heading-display">
        <svg class="svs-heading-frame" viewBox="-1 -1 40.5 50">
          <path class="svs-heading-frame-outline" d="M 3 1 l 32.5 0 c 1.425 0.012 1.991 0.211 2 1 l 0 17 c -0.012 0.751 -0.456 0.981 -1.477 1.013 l -10.023 -0.013 l -6.5 5.5 l -6.5 -5.5 l -10 0 c -1.16 -0.03 -1.992 -0.261 -2 -1 l 0 -17 c 0.027 -0.648 0.937 -1 2 -1 z" />
          <path class="svs-heading-frame-border" d="M 3 1 l 32.5 0 c 1.425 0.012 1.991 0.211 2 1 l 0 17 c -0.012 0.751 -0.456 0.981 -1.477 1.013 l -10.023 -0.013 l -6.5 5.5 l -6.5 -5.5 l -10 0 c -1.16 -0.03 -1.992 -0.261 -2 -1 l 0 -17 c 0.027 -0.648 0.937 -1 2 -1 z" />
        </svg>
        <div class="heading-value">
          {this.props.headingOrTrack.map(FormatUtils.formatCourse)}
        </div>
      </div>
    );
  }
}

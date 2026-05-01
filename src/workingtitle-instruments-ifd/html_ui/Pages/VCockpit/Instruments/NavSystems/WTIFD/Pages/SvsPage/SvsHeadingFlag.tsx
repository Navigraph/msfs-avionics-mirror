import { ComponentProps, FSComponent, LifecycleComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './SvsHeadingFlag.css';

/** Props for the TRK/TRU flags. */
export interface SvsHeadingFlagProps extends ComponentProps {
  /** Whether the flag is hidden. */
  readonly isHidden: Subscribable<boolean>;
  /** The label to show. */
  readonly label: string;
}

/** The SVS TRK flag, when heading is not available. */
export class SvsHeadingFlag extends LifecycleComponent<SvsHeadingFlagProps> {
  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div class={{ 'svs-trk-flag': true, 'hidden': this.props.isHidden }}>
        <div class='wtdyne-text wtdyne-text-cyan'>{this.props.label}</div>
      </div>
    );
  }
}

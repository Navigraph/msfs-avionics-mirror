import { ComponentProps, DisplayComponent, FSComponent, MappedSubscribable, Subscribable, UUID, VNode } from '@microsoft/msfs-sdk';

/**
 * Props for the ExpandCollapseButton component.
 */
export interface ExpandCollapseButtonProps extends ComponentProps {
  /** Whether the button is in expanded state (showing minus) or collapsed state (showing plus) */
  readonly isExpanded: MappedSubscribable<boolean> | Subscribable<boolean>;
  /** Optional width for the button, defaults to 24px */
  readonly width?: string;
  /** Optional height for the button, defaults to 24px */
  readonly height?: string;
}

/**
 * An SVG button component that displays either a plus or minus symbol for expand/collapse functionality.
 * Button has blue gradient background and a white glow effect.
 */
export class ExpandCollapseButton extends DisplayComponent<ExpandCollapseButtonProps> {
  private readonly gradientId = `blueGradient-${UUID.GenerateUuid()}`;

  /** @inheritdoc */
  public render(): VNode {
    const width = this.props.width || '24px';
    const height = this.props.height || '24px';

    return (
      <svg width={width} height={height} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={this.gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#4f85dd" />
            <stop offset="100%" stop-color="#4f85dd" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="3"
          ry="3"
          fill={`url(#${this.gradientId})`}
          stroke="#3966b3"
          stroke-width="1"
          style="stroke-top: #3966b3; stroke-left: #3365ba; stroke-bottom: #345fa9; stroke-right: #4774c1;"
        />
        {/* Horizontal line (common to both plus and minus) */}
        <line
          x1="7"
          y1="12"
          x2="17"
          y2="12"
          stroke="white"
          stroke-width="2"
          stroke-linecap="round"
        />
        {/* Vertical line (only visible when not expanded / showing plus symbol) */}
        <line
          x1="12"
          y1="7"
          x2="12"
          y2="17"
          stroke="white"
          stroke-width="2"
          stroke-linecap="round"
          class={{ 'svg-hidden': this.props.isExpanded }}
        />
      </svg>
    );
  }
}

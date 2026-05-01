import { ComponentProps, DisplayComponent, FSComponent, MappedSubject, Subscribable, VNode } from '@microsoft/msfs-sdk';

/** The properties for the {@link DetailRampIcon} component. */
interface DetailRampIconProps extends ComponentProps {
  /** The level of detail for the ramp icon, should be 0, 1, 2, or 3. */
  readonly level: Subscribable<number>;
}

/** The DetailRampIcon component. */
export class DetailRampIcon extends DisplayComponent<DetailRampIconProps> {
  private readonly fillPath = MappedSubject.create(
    ([rampLevel]) => {
      if (rampLevel === 0) {
        return '';  // Empty triangle outline
      } else if (rampLevel === 1) {
        return 'M 8 14 L 16 14 L 16 10 Z'; // 1/3 fill
      } else if (rampLevel === 2) {
        return 'M 8 14 L 24 14 L 24 6 Z'; // 2/3 fill
      } else if (rampLevel === 3) {
        return 'M 8 14 L 32 14 L 32 2 Z'; // Full triangle
      }
      return ''; // Default case, should not happen
    },
    this.props.level
  );

  /** @inheritdoc */
  public render(): VNode {
    return (
      <svg width="36" height="16" viewBox="0 0 36 16" style={{ verticalAlign: 'middle' }}>
        {/* Filled part */}
        <path
          d={this.fillPath}
          fill="var(--wtdyne-color-mint)"
          stroke="var(--wtdyne-color-mint)"
          strokeWidth="2"
        />
        {/* Outline (drawn on top for sharpness) */}
        <path
          d="M 8 14 L 32 14 L 32 2 Z"
          fill="none"
          stroke="var(--wtdyne-color-mint)"
          strokeWidth="2"
        />
      </svg>
    );
  }
}

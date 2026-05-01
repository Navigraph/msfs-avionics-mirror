import { DisplayComponent, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

/**
 * Props for the CheckmarkComponent
 */
export interface CheckmarkComponentProps {
  /** Whether the checkmark is visible */
  isVisible: Subscribable<boolean>;
  /** Optional width for the button, defaults to 20px */
  width?: string;
  /** Optional height for the button, defaults to 22px */
  height?: string;
}

/**
 * An SVG component that displays a checkmark symbol.
 * The checkmark can be shown or hidden based on the isVisible subject.
 */
export class CheckmarkComponent extends DisplayComponent<CheckmarkComponentProps> {
  /** @inheritdoc */
  public render(): VNode {
    const width = this.props.width || '20px';
    const height = this.props.height || '22px';

    return (
      <svg width={width} height={height} viewBox="0 0 20 22" xmlns="http://www.w3.org/2000/svg">
        {/* Checkmark */}
        <path
          d="M0,14 L10,22 L20,9 L20,0 L13,9 L10,15 L7,8 L0,14"
          fill="white"
          stroke-linecap="round"
          stroke-linejoin="round"
          class={{ 'svg-hidden': this.props.isVisible.map(visible => !visible) }}
        />
      </svg>
    );
  }
}

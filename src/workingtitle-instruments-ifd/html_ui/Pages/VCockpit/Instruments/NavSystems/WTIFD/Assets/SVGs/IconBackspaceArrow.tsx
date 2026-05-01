import {
  FSComponent, DisplayComponent, VNode
} from '@microsoft/msfs-sdk';

/**
 * The backspace arrow icon.
 */
export class IconBackspaceArrow extends DisplayComponent<any> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <svg width="28" height="6" viewBox="0 0 28 6" xmlns="http://www.w3.org/2000/svg">
        {/* Backspace arrow - horizontal line and triangle arrow pointing left */}
        <g>
          {/* Horizontal line */}
          <path d="M5 3h23" stroke="#CEFFFC" stroke-width="2" />
          {/* Triangle arrow head */}
          <polygon points="14,0 0,3 14,6" fill="#CEFFFC" />
        </g>
      </svg>
    );
  }
}

import { DisplayComponent, FSComponent, VNode } from '@microsoft/msfs-sdk';

/**
 * The knob icon.
 */
export class IconKnob extends DisplayComponent<any> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <svg width="20" height="20" viewBox="0 0 18 18" style={{ 'overflow': 'visible' }}>
        <circle id="circle2" cx="8.7698" cy="10" r="7.5088" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.1705" />
        <circle id="path1" cx="8.7698" cy="10" r="7.3891" fill="none" stroke="#0ff" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.1518" />
        <circle id="circle1" cx="8.7698" cy="10" r="3.8694" fill="#0ff" stroke-width="4.3532" />
        <path id="path2" d="m8.7698 10h9.9692" stroke="#0ff" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.1518" />
      </svg>
    );
  }
}

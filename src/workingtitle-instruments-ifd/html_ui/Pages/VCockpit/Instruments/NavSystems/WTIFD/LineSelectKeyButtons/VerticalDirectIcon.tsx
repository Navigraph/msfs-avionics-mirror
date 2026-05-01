import { FSComponent, VNode } from '@microsoft/msfs-sdk';

const VERTICAL_DIRECT_ICON = <svg viewBox="0 0 44 28" style="width: 44px; height: 28px;" class="vertical-direct-icon">
  <path d="M 3 13 L 32 13 L 31 7 L 42 13.5 L 31 20 L 32 14 L 3 14 Z" />
  <path d="M 8 3 L 16 25 L 20 25 L 28 3 L 24 3 L 18 20 L 12 3 Z" />
</svg>;

/**
 * Gets the Vertical Direct To icon.
 * @returns The icon VNode.
 */
export function getVerticalDirectIcon(): VNode {
  return VERTICAL_DIRECT_ICON;
}

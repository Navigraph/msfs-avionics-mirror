import { DisplayComponent, FSComponent, VNode } from '@microsoft/msfs-sdk';

/**
 * The procedure/chart icon.
 */
export class ProcedureIcon extends DisplayComponent<any> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <svg width="25" height="26" version="1.1" viewBox="0 0 25 26" fill="none" stroke="#f9f9f9" stroke-width="2">
        <path id="path4" d="m6.177 7.7212v-2.059h11.839v14.928h-11.839v-2.1877" />
        <path id="path11" d="m8.3261 18.402v-1.9303" />
        <path id="path12" d="m6.177 16.472v-1.9303" />
        <path id="path13" d="m8.3261 14.542v-1.9303" />
        <path id="path14" d="m6.177 12.611v-2.9598" />
        <path id="path15" d="m8.3261 9.6515v-1.9625" />
      </svg>
    );
  }
}

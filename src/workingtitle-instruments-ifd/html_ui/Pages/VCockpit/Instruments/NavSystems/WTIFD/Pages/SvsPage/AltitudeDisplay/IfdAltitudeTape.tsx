import { FSComponent } from '@microsoft/msfs-sdk';
import { IfdBaseTape } from '../../../Components/Tapes/IfdBaseTape';

import './IfdAltitudeTape.css';

/** An IfdAltitudeTape */
export class IfdAltitudeTape extends IfdBaseTape {
  /** @inheritdoc */
  protected renderText(value: number, centreY: number, displayUnit: string): void {
    const thousands: string = value < 1000 ? '' : Math.trunc(value / 1000).toString();
    const remaining: string = value < 1000 ? value.toString() : Math.abs(value % 1000).toString().padEnd(3, '0');

    FSComponent.render(
      <text
        x={`${this.endXSign}${thousands.length === 1 ? 45 : 56}`}
        y={`${centreY + 7}`}
        dominant-baseline="middle"
        text-anchor="start"
      >
        <tspan class="big-text">{thousands}</tspan>
        <tspan class="normal-text" y={`${centreY + 6}`}>{remaining}</tspan>
        {value !== 0 && (
          <tspan class="small-text" y={`${centreY + 2}`}>{displayUnit}</tspan>
        )}
      </text>,
      this.svgRef.instance
    );

    if (value === 0) {
      return;
    }
  }
}

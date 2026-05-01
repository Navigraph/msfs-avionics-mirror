import { FSComponent, MathUtils } from '@microsoft/msfs-sdk';
import { IfdBaseTape } from '../../../Components/Tapes/IfdBaseTape';

import './IfdAirspeedTape.css';

/** An IfdAirspeedTape */
export class IfdAirspeedTape extends IfdBaseTape {
  private readonly smallTextX = `${this.endXSign}60`;

  /** @inheritdoc */
  protected renderText(value: number, centreY: number, displayUnit: string): void {
    FSComponent.render(
      <text
        x={`${this.endXSign}113`}
        y={`${centreY + 7}`}
        dominant-baseline="middle"
        text-anchor="start"
      >
        <tspan class="big-text">{MathUtils.round(value).toString()}</tspan>
        <tspan class="small-text" x={this.smallTextX} y={`${centreY + 5}`}>{displayUnit}</tspan>
      </text>,
      this.svgRef.instance
    );

    if (value === 0) {
      return;
    }
  }
}

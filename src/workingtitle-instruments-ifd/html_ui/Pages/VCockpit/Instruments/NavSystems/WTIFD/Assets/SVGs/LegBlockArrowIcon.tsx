import {
  FSComponent, DisplayComponent, VNode
} from '@microsoft/msfs-sdk';

/** The properties for the {@link LegBlockArrowIcon} component. */
export interface LegBlockProps {
  /** The RGB hex code for the fill color */
  readonly fillColor?: string;
}

/**
 * The Leg Block Arrow Icon.
 */
export class LegBlockArrowIcon extends DisplayComponent<LegBlockProps> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <svg width="24" height="22" version="1.1" viewBox="0 0 24 22">
        <path id="path1" d="m7.5925 0v11.381h7.5282v5.5322l6.4343-6.979-6.4343-6.2666v4.7614h-4.8901v-8.429z" fill={`#${this.props.fillColor ?? '000000'}`}/>
      </svg>
    );
  }
}

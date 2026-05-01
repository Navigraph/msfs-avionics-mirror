import { DisplayComponent, FSComponent, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';

import './VolumeControlRow.css';
import { VolumeRow } from '../AudioTab';

export enum VolumeOption {
  SqOn = 'Sq On',
  IdOn = 'Id On',
  Mute = 'Mute',
  None = '',
}

/** The data for a volume control row*/
export type VolumeControlRowData = {
  /** The label for the row */
  readonly label: VolumeRow;
  /** Whether the row is selected*/
  readonly isSelected: Subscribable<boolean>;
  /** The volume value for the row (from 0 to 1) */
  readonly volume: Subject<number>;
  /** The option for the row */
  readonly option: VolumeOption;
  /** The state of the option */
  readonly optionState: Subject<boolean>;
}

/** The properties for the {@link VolumeControlRow} component. */
export interface VolumeControlRowProps {
  /** The data for the row */
  readonly data: VolumeControlRowData;
  /** Callback fired when row is selected */
  readonly onSelect: () => void;
  /** Callback to fire when volume is changed */
  readonly onVolumeChange: (volume: number) => void;
  /** Callback to fire when option state is changed */
  readonly onOptionChange: (state: boolean) => void;
}

/** The VolumeControlRow component. */
export class VolumeControlRow extends DisplayComponent<VolumeControlRowProps> {
  private readonly rowRef = FSComponent.createRef<HTMLDivElement>();
  private readonly sliderRef = FSComponent.createRef<HTMLDivElement>();
  private readonly optionRef = FSComponent.createRef<HTMLDivElement>();

  private mouseDownOnSlider = false;

  /** @inheritdoc */
  public onAfterRender(): void {
    const changeVolume = (evt: MouseEvent): void => {
      const sliderRect = this.sliderRef.instance.getBoundingClientRect();
      const newVolume = Math.min(Math.max((evt.clientX - sliderRect.left) / (sliderRect.right - sliderRect.left), 0), 1);
      this.props.onVolumeChange(newVolume);
    };

    const onMouseDownOnSlider = (evt: MouseEvent): void => {
      this.mouseDownOnSlider = true;
      changeVolume(evt);
    };

    const onMouseMoveOnSlider = (evt: MouseEvent): void => {
      this.mouseDownOnSlider && changeVolume(evt);
    };

    const onMouseUpOnSlider = (): void => {
      this.mouseDownOnSlider = false;
    };

    const changeOption = (): void => {
      this.props.onOptionChange(!this.props.data.optionState.get());
    };

    this.rowRef.instance.addEventListener('mousedown', this.props.onSelect);
    this.sliderRef.instance.addEventListener('mousedown', onMouseDownOnSlider);
    this.sliderRef.instance.addEventListener('mousemove', onMouseMoveOnSlider);
    this.sliderRef.instance.addEventListener('mouseup', onMouseUpOnSlider);
    this.rowRef.instance.addEventListener('mouseup', onMouseUpOnSlider);
    this.rowRef.instance.addEventListener('mouseleave', onMouseUpOnSlider);
    this.optionRef.instance.addEventListener('mousedown', changeOption);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'volume-control-row': true,
          'volume-control-row-selected': this.props.data.isSelected,
        }}
        ref={this.rowRef}
      >
        <div  class="volume-control-label">{this.props.data.label}</div>
        <div class="volume-control-slider" ref={this.sliderRef}>
          <div
            class={{
              'volume-control-slider-bar': true,
              'volume-control-slider-bar-selected': this.props.data.isSelected,
            }}
            style={{ 'width': this.props.data.volume.map(v => `${v * 100}%`) }}
          />
        </div>
        <div class="volume-control-option" ref={this.optionRef}>{this.props.data.optionState.map(s => s ? this.props.data.option : '')}</div>
      </div>
    );
  }
}

import { FSComponent, IcaoValue, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { DynamicListData } from '../../../Components/List';
import { IfdListItemComponent, IfdListItemComponentProps } from '../../../Components/List/IfdListItemComponent';
import { IfdInteractionEvent } from '../../../Events/IfdInteractionEvent';
import { IfdTuningControlsManager } from '../../../Events/IfdTuningControlsManager';

import './FrequencyRow.css';

/** The data for a frequency row*/
export interface FrequencyListData extends DynamicListData {
  /** The airport ICAO this frequency is linked to */
  readonly airportIcao?: IcaoValue;
  /** The frequency, as a floating point */
  readonly freq: number;
  /** The title */
  readonly title: string;
  /** @inheritdoc */
  readonly isVisible: Subscribable<boolean>;
  /** @inheritdoc */
  readonly heightPx: number;
}
/** The properties for the {@link FrequencyRow} component. */
export interface FrequencyRowProps extends IfdListItemComponentProps {
  /** The data for the row */
  readonly data: FrequencyListData;
  /** Tuning control manager */
  readonly tuningControlsManager: IfdTuningControlsManager;
}

/** The FrequencyRow component. */
export class FrequencyRow extends IfdListItemComponent<FrequencyRowProps> {
  private readonly ref = FSComponent.createRef<HTMLDivElement>();

  /** @inheritdoc */
  public onAfterRender(): void {
    this.ref.instance.addEventListener('mousedown', () => this.focus());
  }

  /** @inheritdoc */
  public onInteractionEvent(event: IfdInteractionEvent): boolean {
    if (event === IfdInteractionEvent.RightKnobPush) {
      this.onFocus(event);
      return true;
    }

    return false;
  }

  /** @inheritdoc */
  public onFocus(event?: IfdInteractionEvent | 'click'): void {
    if (this._isSelected.get()) {
      // TODO: Tune frequency changeme
      this.props.tuningControlsManager.setComStandbyFrequency(this.props.data.freq);
    }

    super.onFocus(event);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div
        class={{
          'freq-row': true,
          'freq-row-selected': this._isSelected,
        }}
        ref={this.ref}
      >
        <div class="freq-title">
          <span class='freq-title-name'>{this.props.data.title}</span>
          {this.props.data.airportIcao && <span class='freq-title-airport'> ({this.props.data.airportIcao.ident})</span>}
        </div>
        <div class="freq-number">
          <span class='freq-big-number'>{this.props.data.freq.toFixed(3).slice(0, 3)}</span>
          <span>{this.props.data.freq.toFixed(3).slice(3)}</span>
        </div>
      </div>
    );
  }
}
